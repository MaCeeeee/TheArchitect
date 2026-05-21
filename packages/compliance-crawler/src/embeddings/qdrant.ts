/**
 * Qdrant wrapper for Regulation vectors.
 *
 * Each project gets its own collection `regulations-{projectId}` (tenant-isolation,
 * mirrors UC-SIM-001 pattern for elements). Points are upserted with UUID-shaped IDs
 * derived from the Regulation _id (Qdrant requires UUID or unsigned int).
 *
 * Linear: THE-277 (REQ-ICM-001.3)
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import * as crypto from 'node:crypto';
import { EMBEDDING_DIM } from './sidecar';

export class QdrantConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QdrantConfigError';
  }
}

let _client: QdrantClient | null = null;

/** Returns a singleton QdrantClient. Tests can call resetQdrantClient() to inject. */
export function getQdrantClient(url: string, apiKey?: string): QdrantClient {
  if (!_client) {
    _client = new QdrantClient({ url, apiKey });
  }
  return _client;
}

/** Test-only: drop the singleton so a fresh client is created next call. */
export function resetQdrantClient(): void {
  _client = null;
}

export function regulationCollectionName(projectId: string): string {
  const safe = projectId.replace(/[^A-Za-z0-9_-]/g, '');
  if (!safe || safe.length === 0) {
    throw new QdrantConfigError(`invalid projectId for Qdrant collection: "${projectId}"`);
  }
  return `regulations-${safe}`;
}

/**
 * Qdrant requires point IDs to be UUID or unsigned int.
 * Hash Regulation._id (an arbitrary Mongo ObjectId string) to UUID-shape.
 * Deterministic so re-upserts overwrite the same point.
 */
export function regulationIdToPointId(regulationId: string): string {
  const h = crypto.createHash('sha256').update(regulationId).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Idempotent collection ensure. Creates with the right vector config if missing.
 * Cosine distance + 768-dim (all-mpnet-base-v2), matching UC-SIM-001 conventions.
 */
export async function ensureRegulationCollection(
  client: QdrantClient,
  projectId: string
): Promise<string> {
  const name = regulationCollectionName(projectId);
  try {
    await client.getCollection(name);
    return name;
  } catch {
    await client.createCollection(name, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
    });
    return name;
  }
}

/** Minimal payload stored alongside the vector — for UI-side display without Mongo roundtrip. */
export interface RegulationPointPayload {
  regulationId: string;
  source: string;
  paragraphNumber: string;
  title: string;
  summary?: string;
  effectiveFrom: string; // ISO date
  jurisdiction: string;
  language: string;
  [key: string]: unknown; // Qdrant payload extensibility
}

export async function upsertRegulationVector(args: {
  client: QdrantClient;
  projectId: string;
  regulationId: string;
  vector: number[];
  payload: RegulationPointPayload;
}): Promise<void> {
  if (args.vector.length !== EMBEDDING_DIM) {
    throw new QdrantConfigError(
      `vector dim mismatch: ${args.vector.length}, expected ${EMBEDDING_DIM}`
    );
  }
  const collection = await ensureRegulationCollection(args.client, args.projectId);
  await args.client.upsert(collection, {
    wait: true,
    points: [
      {
        id: regulationIdToPointId(args.regulationId),
        vector: args.vector,
        payload: args.payload,
      },
    ],
  });
}

export async function deleteRegulationVector(args: {
  client: QdrantClient;
  projectId: string;
  regulationId: string;
}): Promise<void> {
  const collection = regulationCollectionName(args.projectId);
  await args.client.delete(collection, {
    wait: true,
    points: [regulationIdToPointId(args.regulationId)],
  });
}

export async function countPoints(client: QdrantClient, projectId: string): Promise<number> {
  const collection = regulationCollectionName(projectId);
  try {
    const res = await client.count(collection, { exact: true });
    return res.count;
  } catch {
    return 0;
  }
}
