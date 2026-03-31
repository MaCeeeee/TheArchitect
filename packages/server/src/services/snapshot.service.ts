/**
 * Snapshot Service — Creates shareable, time-limited snapshots of architecture views.
 *
 * Snapshots are read-only, token-authenticated URLs for stakeholders without accounts.
 * Data is frozen at creation time (not live).
 */
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { runCypher } from '../config/neo4j';

export interface Snapshot {
  id: string;
  token: string;
  projectId: string;
  createdBy: string;
  title: string;
  description: string;
  viewType: 'portfolio' | 'dashboard' | '3d' | 'compliance' | 'roadmap';
  filters: Record<string, unknown>;
  data: {
    elements: Array<Record<string, unknown>>;
    connections: Array<Record<string, unknown>>;
    summary: Record<string, unknown>;
  };
  expiresAt: Date;
  accessCount: number;
  maxAccesses: number;    // 0 = unlimited
  createdAt: Date;
}

// In-memory store (production: move to MongoDB)
const snapshotStore = new Map<string, Snapshot>();

export async function createSnapshot(params: {
  projectId: string;
  createdBy: string;
  title: string;
  description?: string;
  viewType: Snapshot['viewType'];
  filters?: Record<string, unknown>;
  expiresInHours?: number;
  maxAccesses?: number;
}): Promise<Snapshot> {
  const { projectId, createdBy, title, viewType, filters = {} } = params;
  const expiresInHours = params.expiresInHours || 72;
  const maxAccesses = params.maxAccesses || 0;

  // Fetch current state for the snapshot
  const elements = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id AS id, e.name AS name, e.type AS type, e.layer AS layer,
            e.status AS status, e.riskLevel AS riskLevel,
            e.maturityLevel AS maturityLevel, e.description AS description,
            e.lifecyclePhase AS lifecyclePhase, e.businessOwner AS owner,
            e.annualCost AS annualCost`,
    { projectId },
  );

  const connections = await runCypher(
    `MATCH (s:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(t:ArchitectureElement {projectId: $projectId})
     RETURN r.id AS id, s.id AS sourceId, t.id AS targetId, r.type AS type, r.label AS label`,
    { projectId },
  );

  const elemData = elements.map(r => ({
    id: r.get('id'), name: r.get('name') || '', type: r.get('type') || '',
    layer: r.get('layer') || '', status: r.get('status') || 'current',
    riskLevel: r.get('riskLevel') || 'low',
    maturityLevel: r.get('maturityLevel')?.toNumber?.() ?? 3,
    description: r.get('description') || '',
    lifecyclePhase: r.get('lifecyclePhase') || null,
    owner: r.get('owner') || null,
    annualCost: r.get('annualCost')?.toNumber?.() ?? null,
  }));

  const connData = connections.map(r => ({
    id: r.get('id'), sourceId: r.get('sourceId'), targetId: r.get('targetId'),
    type: r.get('type') || 'association', label: r.get('label') || '',
  }));

  // Compute summary
  const summary: Record<string, unknown> = {
    totalElements: elemData.length,
    totalConnections: connData.length,
    byLayer: countBy(elemData, 'layer'),
    byStatus: countBy(elemData, 'status'),
    byRisk: countBy(elemData, 'riskLevel'),
    byType: countBy(elemData, 'type'),
  };

  const snapshot: Snapshot = {
    id: uuid(),
    token: crypto.randomBytes(32).toString('hex'),
    projectId,
    createdBy,
    title,
    description: params.description || '',
    viewType,
    filters,
    data: { elements: elemData, connections: connData, summary },
    expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
    accessCount: 0,
    maxAccesses,
    createdAt: new Date(),
  };

  snapshotStore.set(snapshot.token, snapshot);
  return snapshot;
}

export function getSnapshot(token: string): Snapshot | null {
  const snapshot = snapshotStore.get(token);
  if (!snapshot) return null;

  // Check expiry
  if (new Date() > snapshot.expiresAt) {
    snapshotStore.delete(token);
    return null;
  }

  // Check max accesses
  if (snapshot.maxAccesses > 0 && snapshot.accessCount >= snapshot.maxAccesses) {
    return null;
  }

  snapshot.accessCount++;
  return snapshot;
}

export function listSnapshots(projectId: string): Omit<Snapshot, 'data'>[] {
  const results: Omit<Snapshot, 'data'>[] = [];
  for (const snapshot of snapshotStore.values()) {
    if (snapshot.projectId === projectId && new Date() <= snapshot.expiresAt) {
      const { data, ...meta } = snapshot;
      results.push(meta);
    }
  }
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function revokeSnapshot(token: string): boolean {
  return snapshotStore.delete(token);
}

function countBy(arr: Array<Record<string, unknown>>, field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    const val = String(item[field] || 'unknown');
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}
