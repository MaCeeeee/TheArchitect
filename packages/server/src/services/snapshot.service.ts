/**
 * Snapshot Service — Creates shareable, time-limited snapshots of architecture views.
 *
 * Snapshots are read-only, token-authenticated URLs for stakeholders without accounts.
 * Data is frozen at creation time (not live).
 */
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { runCypher } from '../config/neo4j';
import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { User } from '../models/User';

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

// ─── THE-655: Ein geteilter Link überlebt seinen Ursprung nicht ─────
//
// Befund (Prod, 2026-08-12): Snapshot-Links lieferten nach Projekt- UND
// Kontolöschung weiter aus, bis die 72-h-TTL ablief. Der Speicher ist
// in-memory und kennt keine Kaskade — also wird beim LESEN geprüft, ob
// Projekt und Ersteller noch existieren. Fehlt eines, ist der Link "gone"
// und wird entfernt. Die Prüfer sind injizierbar (Tests ohne MongoDB).

export type SnapshotResolution =
  | { kind: 'not_found' }
  | { kind: 'gone'; reason: 'project' | 'owner' }
  | { kind: 'ok'; snapshot: Snapshot };

export interface OriginChecks {
  projectExists: (projectId: string) => Promise<boolean>;
  ownerExists: (userId: string) => Promise<boolean>;
}

/**
 * Standard-Prüfer gegen MongoDB. Zwei Ausgänge, bewusst unterschieden:
 * "existiert nicht" (Projekt/Owner fehlt in der DB) → gone, der Token wird
 * gelöscht. "nicht feststellbar" (Datenbank nicht erreichbar, die Abfrage
 * wirft) → der Fehler wird propagiert, nie als `false` interpretiert; der
 * Token bleibt bestehen, die Route antwortet 500. Kein `.catch(() => false)`
 * hier — ein Mongo-Aussetzer würde sonst jeden in dieser Zeit besuchten
 * Link dauerhaft löschen.
 *
 * `mongoose.isValidObjectId` (bson ≥ 6) akzeptiert für Strings nur die
 * 24-Hex-Form; ein leeres oder 12-Zeichen-createdBy gilt als nicht
 * existent, ohne DB-Abfrage — fail closed: lieber ein Link zu viel
 * gesperrt als ein Link ohne Eigentümer öffentlich.
 */
export const DEFAULT_ORIGIN_CHECKS: OriginChecks = {
  projectExists: async (id) => mongoose.isValidObjectId(id) && !!(await Project.exists({ _id: id })),
  ownerExists: async (id) => mongoose.isValidObjectId(id) && !!(await User.exists({ _id: id })),
};

/**
 * Liest ohne zu zählen: null bei unbekannt, abgelaufen oder Zugriffs-Limit erreicht.
 * räumt einen abgelaufenen Eintrag dabei weg (einzige Nebenwirkung).
 */
export function peekSnapshot(token: string): Snapshot | null {
  const snapshot = snapshotStore.get(token);
  if (!snapshot) return null;
  if (new Date() > snapshot.expiresAt) {
    snapshotStore.delete(token);
    return null;
  }
  if (snapshot.maxAccesses > 0 && snapshot.accessCount >= snapshot.maxAccesses) return null;
  return snapshot;
}

/**
 * Auflösung für den öffentlichen Endpunkt. Reihenfolge ist Absicht:
 * erst Ablauf/Limit (billig, keine DB), dann Ursprung (zwei Existenz-
 * abfragen), erst dann zählt der Zugriff (getSnapshot).
 */
export async function resolveSharedSnapshot(
  token: string,
  checks: OriginChecks = DEFAULT_ORIGIN_CHECKS,
): Promise<SnapshotResolution> {
  const peeked = peekSnapshot(token);
  if (!peeked) return { kind: 'not_found' };
  if (!(await checks.projectExists(peeked.projectId))) {
    revokeSnapshot(token);
    return { kind: 'gone', reason: 'project' };
  }
  if (!(await checks.ownerExists(peeked.createdBy))) {
    revokeSnapshot(token);
    return { kind: 'gone', reason: 'owner' };
  }
  const snapshot = getSnapshot(token);
  return snapshot ? { kind: 'ok', snapshot } : { kind: 'not_found' };
}

export function getSnapshot(token: string): Snapshot | null {
  const snapshot = peekSnapshot(token);
  if (!snapshot) return null;
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
