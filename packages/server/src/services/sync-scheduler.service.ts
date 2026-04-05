/**
 * Sync Scheduler Service
 *
 * Background cron that runs integration syncs based on configured intervals.
 * Checks all project integrations every 5 minutes and triggers syncs for
 * any integration whose syncIntervalMinutes has elapsed since lastSync.
 *
 * Also persists sync history to a SyncLog collection for audit/analytics.
 */

import mongoose, { Schema, Document } from 'mongoose';
import { Project } from '../models/Project';
import { Connection, decryptCredentials } from '../models/Connection';
import { getConnector } from './connectors';
import type { ConnectorConfig, ConnectorType, AuthMethod } from './connectors';
import { createTemporaryGraph, migrateTemporaryGraph } from './upload.service';

// ─── SyncLog Model ───

export interface ISyncLog extends Document {
  projectId: mongoose.Types.ObjectId;
  integrationId: mongoose.Types.ObjectId;
  connectionType: string;
  connectionName: string;
  status: 'success' | 'error';
  elementsCreated: number;
  connectionsCreated: number;
  durationMs: number;
  warnings: string[];
  error?: string;
  triggeredBy: 'scheduler' | 'manual';
  syncedAt: Date;
}

const syncLogSchema = new Schema<ISyncLog>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    integrationId: { type: Schema.Types.ObjectId, required: true },
    connectionType: { type: String, required: true },
    connectionName: { type: String, default: '' },
    status: { type: String, enum: ['success', 'error'], required: true },
    elementsCreated: { type: Number, default: 0 },
    connectionsCreated: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    warnings: [{ type: String }],
    error: { type: String },
    triggeredBy: { type: String, enum: ['scheduler', 'manual'], default: 'scheduler' },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

syncLogSchema.index({ projectId: 1, syncedAt: -1 });
syncLogSchema.index({ syncedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // auto-delete after 90 days

export const SyncLog = mongoose.model<ISyncLog>('SyncLog', syncLogSchema);

// ─── Scheduler ───

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const activeSyncs = new Set<string>(); // prevent concurrent syncs on same integration

export function startSyncScheduler(): void {
  if (schedulerTimer) return; // already running

  console.log('[SyncScheduler] Starting — checking every 5 minutes');

  // Run first check after 30s (let server fully boot)
  setTimeout(() => runSchedulerCycle(), 30_000);

  schedulerTimer = setInterval(() => runSchedulerCycle(), CHECK_INTERVAL_MS);
}

export function stopSyncScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[SyncScheduler] Stopped');
  }
}

async function runSchedulerCycle(): Promise<void> {
  try {
    // Find all projects with enabled integrations that have syncIntervalMinutes > 0
    const projects = await Project.find({
      'integrations.enabled': true,
      'integrations.syncIntervalMinutes': { $gt: 0 },
    }).select('_id integrations ownerId');

    const now = Date.now();

    for (const project of projects) {
      for (const integ of project.integrations || []) {
        if (!integ.enabled || !integ.syncIntervalMinutes || integ.syncIntervalMinutes <= 0) continue;

        const integId = String(integ._id);
        if (activeSyncs.has(integId)) continue; // already syncing

        // Check if enough time has elapsed
        const lastSyncTime = integ.lastSync?.syncedAt?.getTime() || 0;
        const intervalMs = integ.syncIntervalMinutes * 60 * 1000;

        if (now - lastSyncTime >= intervalMs) {
          // Don't await — run in background
          runIntegrationSync(project, integ, integId).catch((err) => {
            console.error(`[SyncScheduler] Unhandled error for ${integId}:`, err);
          });
        }
      }
    }
  } catch (err) {
    console.error('[SyncScheduler] Cycle error:', err);
  }
}

async function runIntegrationSync(
  project: any,
  integ: any,
  integId: string,
): Promise<void> {
  activeSyncs.add(integId);
  const start = Date.now();

  try {
    const conn = await Connection.findById(integ.connectionId);
    if (!conn) {
      console.warn(`[SyncScheduler] Connection ${integ.connectionId} not found for integration ${integId}`);
      activeSyncs.delete(integId);
      return;
    }

    const connector = getConnector(conn.type as ConnectorType);
    if (!connector) {
      console.warn(`[SyncScheduler] Connector type ${conn.type} not registered`);
      activeSyncs.delete(integId);
      return;
    }

    const config: ConnectorConfig = {
      type: conn.type as ConnectorType,
      name: conn.name,
      baseUrl: conn.baseUrl,
      authMethod: conn.authMethod as AuthMethod,
      credentials: decryptCredentials(conn.credentials),
      projectId: String(project._id),
      mappingRules: (integ.mappingRules || []).map((r: any) => ({ ...r, fieldMappings: [] })),
      syncIntervalMinutes: integ.syncIntervalMinutes,
      filters: integ.filters as Record<string, string>,
      enabled: integ.enabled,
    };

    const fetchResult = await connector.fetchData(config);

    const parsed = {
      elements: fetchResult.elements,
      connections: fetchResult.connections,
      warnings: fetchResult.warnings,
      format: `connector:${conn.type}`,
    };

    const graph = await createTemporaryGraph(parsed);
    await migrateTemporaryGraph(graph.projectId, String(project._id));

    const durationMs = Date.now() - start;

    // Update lastSync on the integration
    await Project.updateOne(
      { _id: project._id, 'integrations._id': integ._id },
      {
        $set: {
          'integrations.$.lastSync': {
            status: 'success',
            syncedAt: new Date(),
            elementsCreated: fetchResult.elements.length,
            connectionsCreated: fetchResult.connections.length,
            durationMs,
            warnings: fetchResult.warnings,
          },
        },
      },
    );

    // Persist sync log
    await SyncLog.create({
      projectId: project._id,
      integrationId: integ._id,
      connectionType: conn.type,
      connectionName: conn.name,
      status: 'success',
      elementsCreated: fetchResult.elements.length,
      connectionsCreated: fetchResult.connections.length,
      durationMs,
      warnings: fetchResult.warnings,
      triggeredBy: 'scheduler',
      syncedAt: new Date(),
    });

    console.log(`[SyncScheduler] Synced ${conn.type}:${conn.name} → project ${project._id} (${fetchResult.elements.length} elements, ${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;

    // Update lastSync with error
    await Project.updateOne(
      { _id: project._id, 'integrations._id': integ._id },
      {
        $set: {
          'integrations.$.lastSync': {
            status: 'error',
            syncedAt: new Date(),
            elementsCreated: 0,
            connectionsCreated: 0,
            durationMs,
            warnings: [err.message || 'Sync failed'],
          },
        },
      },
    ).catch(() => {});

    // Persist error log
    await SyncLog.create({
      projectId: project._id,
      integrationId: integ._id,
      connectionType: '',
      connectionName: '',
      status: 'error',
      elementsCreated: 0,
      connectionsCreated: 0,
      durationMs,
      warnings: [],
      error: err.message || 'Sync failed',
      triggeredBy: 'scheduler',
      syncedAt: new Date(),
    }).catch(() => {});

    console.error(`[SyncScheduler] Error syncing integration ${integId}:`, err.message);
  } finally {
    activeSyncs.delete(integId);
  }
}
