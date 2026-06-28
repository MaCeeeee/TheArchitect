/**
 * Qdrant wrapper for the canonical Regulation corpus.
 *
 * One shared collection `regulations-corpus` (embed-once, ADR-0001), replacing the
 * former per-project `regulations-{projectId}` collections. Points are keyed by the
 * stable `regulationKey` (project-independent), so a re-crawl overwrites the same
 * point and the same paragraph is never embedded twice across projects.
 *
 * Linear: THE-277 (REQ-ICM-001.3) · THE-367 (corpus store)
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

/** The single shared corpus collection. */
export const CORPUS_COLLECTION = 'regulations-corpus';

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

/**
 * Qdrant requires point IDs to be UUID or unsigned int.
 * Hash the stable regulationKey to UUID-shape, deterministic so re-upserts of the
 * same paragraph overwrite the same point.
 */
export function regulationKeyToPointId(regulationKey: string): string {
  const h = crypto.createHash('sha256').update(regulationKey).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Idempotent collection ensure. Creates the corpus collection with the right vector
 * config if missing. Cosine distance + 768-dim (all-mpnet-base-v2).
 */
export async function ensureCorpusCollection(client: QdrantClient): Promise<string> {
  try {
    await client.getCollection(CORPUS_COLLECTION);
    return CORPUS_COLLECTION;
  } catch {
    await client.createCollection(CORPUS_COLLECTION, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
    });
    return CORPUS_COLLECTION;
  }
}

/** Minimal payload stored alongside the vector — for filtering + UI display without a Mongo roundtrip. */
export interface RegulationPointPayload {
  regulationKey: string;
  versionHash: string;
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
  vector: number[];
  payload: RegulationPointPayload;
}): Promise<void> {
  if (args.vector.length !== EMBEDDING_DIM) {
    throw new QdrantConfigError(
      `vector dim mismatch: ${args.vector.length}, expected ${EMBEDDING_DIM}`
    );
  }
  const collection = await ensureCorpusCollection(args.client);
  await args.client.upsert(collection, {
    wait: true,
    points: [
      {
        id: regulationKeyToPointId(args.payload.regulationKey),
        vector: args.vector,
        payload: args.payload,
      },
    ],
  });
}

export async function deleteRegulationVector(args: {
  client: QdrantClient;
  regulationKey: string;
}): Promise<void> {
  await args.client.delete(CORPUS_COLLECTION, {
    wait: true,
    points: [regulationKeyToPointId(args.regulationKey)],
  });
}

export async function countPoints(client: QdrantClient): Promise<number> {
  try {
    const res = await client.count(CORPUS_COLLECTION, { exact: true });
    return res.count;
  } catch {
    return 0;
  }
}
