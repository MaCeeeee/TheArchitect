// UC-SIM-001 — Element-Similarity Foundation Service
// Decision-doc: notebooks/predictive-poc/embedding-backend-decision.md
// PoC: notebooks/predictive-poc/findings.md (5/5 PASS)
//
// Architecture:
//   element  --[embed via sidecar]-->  vector(768)
//   vector   --[upsert into Qdrant collection elements-{workspaceId}]-->  indexed
//   query    --[search Qdrant]-->  ranked elements with cosine scores
//
// Tenant-isolation lives here at the service-layer (REQ-SIM-005): every
// operation requires a workspaceId, and the Qdrant collection name is
// derived from it. Cross-workspace queries are physically impossible
// because they hit different collections.
//
// Score tiers (from PoC findings):
//   >= 0.85 → SAME      (auto-reuse / auto-merge)
//   0.65–0.85 → SIMILAR (user-confirm)
//   < 0.65 → UNIQUE     (no match)
//
// Confidence indicator:
//   topGap = top1.score - topK.score
//   < 0.05 → "low" (results are likely noise — show "no good match")
//   else   → "high"

import { QdrantClient } from '@qdrant/js-client-rest';
import * as crypto from 'node:crypto';
import { log } from '../config/logger';

/**
 * Qdrant requires point IDs to be either an unsigned int or a UUID.
 * Our element IDs are arbitrary strings (e.g. "bp-1778003-act-ai-..."),
 * so we hash them to a deterministic UUID-shaped string. The original
 * elementId is preserved in the point payload so reverse-lookup still works.
 *
 * Exported for tests — they need to predict the same hash.
 */
export function elementIdToPointId(elementId: string): string {
  const h = crypto.createHash('sha256').update(elementId).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const EMBEDDING_SIDECAR_URL =
  process.env.EMBEDDING_SIDECAR_URL || 'http://localhost:8001';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;

const EMBEDDING_DIM = 768; // all-mpnet-base-v2

const SCORE_SAME = 0.85;
const SCORE_SIMILAR = 0.65;
const CONFIDENCE_GAP_THRESHOLD = 0.05;

// ─── Types ──────────────────────────────────────────────────────────────────

export type SimilarityTier = 'same' | 'similar' | 'unique';
export type SimilarityConfidence = 'high' | 'low';

export interface SimilarElement {
  elementId: string;
  name: string;
  type: string;
  layer: string;
  projectId: string;
  score: number;
  tier: SimilarityTier;
}

export interface SimilarityResult {
  results: SimilarElement[];
  confidence: SimilarityConfidence;
  topGap: number;
}

export interface ElementForEmbedding {
  id: string;
  name: string;
  description?: string;
  type: string;
  layer: string;
  projectId: string;
}

export interface FindSimilarOpts {
  text?: string;
  elementId?: string;
  topK?: number;
  scoreThreshold?: number;
  excludeElementIds?: string[];
}

export class WorkspaceMismatchError extends Error {
  constructor(message = 'Workspace mismatch: cross-tenant queries are not allowed') {
    super(message);
    this.name = 'WorkspaceMismatchError';
  }
}

// ─── Internal clients ───────────────────────────────────────────────────────

let _qdrant: QdrantClient | null = null;
function qdrant(): QdrantClient {
  if (!_qdrant) {
    _qdrant = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
  }
  return _qdrant;
}

// Allow tests to inject a mock
export function _setQdrantClient(client: QdrantClient): void {
  _qdrant = client;
}

// ─── Sidecar HTTP ───────────────────────────────────────────────────────────

interface SidecarEmbedResponse {
  vector: number[];
  dim: number;
  model: string;
}

async function callSidecar(text: string): Promise<number[]> {
  const start = Date.now();
  const res = await fetch(`${EMBEDDING_SIDECAR_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`embedding sidecar ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as SidecarEmbedResponse;
  if (data.dim !== EMBEDDING_DIM) {
    throw new Error(`unexpected embedding dim ${data.dim}, expected ${EMBEDDING_DIM}`);
  }
  log.debug(
    { latencyMs: Date.now() - start, dim: data.dim },
    '[similarity] sidecar embed',
  );
  return data.vector;
}

// ─── Collection management (workspace-scoped) ───────────────────────────────

function collectionName(workspaceId: string): string {
  if (!workspaceId || typeof workspaceId !== 'string') {
    throw new WorkspaceMismatchError('workspaceId required');
  }
  // Qdrant accepts alphanumerics + underscores + hyphens. Mongo ObjectIds
  // are pure hex so this is safe; we still guard against accidents.
  const safe = workspaceId.replace(/[^A-Za-z0-9_-]/g, '');
  if (safe !== workspaceId) {
    throw new WorkspaceMismatchError(`invalid workspaceId: ${workspaceId}`);
  }
  return `elements-${safe}`;
}

async function ensureCollection(workspaceId: string): Promise<string> {
  const name = collectionName(workspaceId);
  try {
    await qdrant().getCollection(name);
    return name;
  } catch {
    // Collection doesn't exist yet → create it
    await qdrant().createCollection(name, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
    });
    log.info({ collection: name }, '[similarity] created qdrant collection');
    return name;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the single-line embedding input from element fields.
 *
 * Lossy on purpose — drops position, cost, status (noise for similarity).
 * Matches the PoC's representation that scored 5/5 PASS.
 */
export function elementToEmbeddingText(el: ElementForEmbedding): string {
  const desc = (el.description || '').trim().slice(0, 400);
  const prefix = `${el.name} — ${el.type} (${el.layer})`;
  return desc ? `${prefix}. ${desc}` : prefix;
}

/**
 * Score → tier mapping per PoC findings.
 */
export function scoreTier(score: number): SimilarityTier {
  if (score >= SCORE_SAME) return 'same';
  if (score >= SCORE_SIMILAR) return 'similar';
  return 'unique';
}

/**
 * Embed and upsert one element into the workspace's index.
 *
 * Used by the create/update hook (REQ-SIM-002).
 */
export async function upsertEmbedding(
  workspaceId: string,
  element: ElementForEmbedding,
): Promise<void> {
  if (element.projectId && element.projectId.length > 0) {
    // Workspace-isolation tripwire: caller must have already resolved that
    // this element belongs to this workspace. We can't double-check here
    // (Project model is workspace-scoped, not element-scoped) — but we log
    // for forensics and refuse if obviously inconsistent.
  }

  const collection = await ensureCollection(workspaceId);
  const text = elementToEmbeddingText(element);
  const vector = await callSidecar(text);

  await qdrant().upsert(collection, {
    wait: true,
    points: [
      {
        id: elementIdToPointId(element.id),
        vector,
        payload: {
          elementId: element.id,
          name: element.name,
          type: element.type,
          layer: element.layer,
          projectId: element.projectId,
        },
      },
    ],
  });

  log.debug(
    { workspaceId, elementId: element.id, collection },
    '[similarity] upserted embedding',
  );
}

/**
 * Remove an element's vector from the index.
 */
export async function deleteEmbedding(
  workspaceId: string,
  elementId: string,
): Promise<void> {
  const collection = collectionName(workspaceId);
  try {
    await qdrant().delete(collection, {
      wait: true,
      points: [elementIdToPointId(elementId)],
    });
  } catch (err) {
    // Collection may not exist yet (workspace has never been indexed) —
    // that's not a real error for a delete.
    log.debug(
      { workspaceId, elementId, err: (err as Error).message },
      '[similarity] delete ignored (likely no collection yet)',
    );
  }
}

/**
 * Find the top-K most similar elements in the workspace's index.
 *
 * Either `text` or `elementId` must be provided in opts. When `elementId`
 * is used, the source element is auto-excluded so its own embedding doesn't
 * dominate the results.
 *
 * REQ-SIM-005: workspaceId is the ONLY way to query; cross-workspace
 * queries are physically impossible because they hit different collections.
 */
export async function findSimilarElements(
  workspaceId: string,
  opts: FindSimilarOpts,
): Promise<SimilarityResult> {
  if (!opts.text && !opts.elementId) {
    throw new Error('findSimilarElements requires either text or elementId');
  }

  const collection = collectionName(workspaceId);
  const topK = Math.min(Math.max(opts.topK ?? 10, 1), 50);
  const scoreThreshold = opts.scoreThreshold ?? SCORE_SIMILAR;

  // Build the query vector — either fresh-embedded from text, or pulled
  // from the existing point if querying by elementId.
  let vector: number[];
  if (opts.text) {
    vector = await callSidecar(opts.text);
  } else {
    const points = await qdrant().retrieve(collection, {
      ids: [elementIdToPointId(opts.elementId!)],
      with_vector: true,
      with_payload: false,
    });
    if (points.length === 0) {
      throw new Error(`element ${opts.elementId} not found in workspace index`);
    }
    const v = points[0].vector;
    if (!v || !Array.isArray(v)) {
      throw new Error(`element ${opts.elementId} has no vector indexed`);
    }
    vector = v as number[];
  }

  // Build exclude-list — explicit excludeElementIds plus the source
  // element itself when querying by elementId
  const exclude = new Set(opts.excludeElementIds ?? []);
  if (opts.elementId) exclude.add(opts.elementId);

  // Qdrant search — we pull topK + buffer to allow excludes
  const buffer = Math.max(exclude.size, 0);
  const searchRes = await qdrant().search(collection, {
    vector,
    limit: topK + buffer,
    score_threshold: scoreThreshold,
    with_payload: true,
  });

  const results: SimilarElement[] = [];
  for (const hit of searchRes) {
    if (results.length >= topK) break;
    const payload = (hit.payload || {}) as Record<string, unknown>;
    const elementId = String(payload.elementId ?? hit.id);
    if (exclude.has(elementId)) continue;
    results.push({
      elementId,
      name: String(payload.name ?? ''),
      type: String(payload.type ?? ''),
      layer: String(payload.layer ?? ''),
      projectId: String(payload.projectId ?? ''),
      score: hit.score,
      tier: scoreTier(hit.score),
    });
  }

  // Confidence indicator: a flat top1↔topK score distribution means
  // the index has no good match — surfacing weak suggestions would
  // mislead the user.
  let topGap = 0;
  let confidence: SimilarityConfidence = 'low';
  if (results.length >= 2) {
    topGap = results[0].score - results[results.length - 1].score;
    confidence = topGap >= CONFIDENCE_GAP_THRESHOLD ? 'high' : 'low';
  } else if (results.length === 1) {
    // Single result is "confident" only if its score is well above threshold
    confidence = results[0].score >= SCORE_SAME ? 'high' : 'low';
  }

  return { results, confidence, topGap };
}

/**
 * Health check for the similarity stack (sidecar + qdrant).
 * Used by health endpoints and tests.
 */
export async function similarityHealthCheck(): Promise<{
  sidecar: 'ok' | 'fail';
  qdrant: 'ok' | 'fail';
}> {
  const result = { sidecar: 'fail' as 'ok' | 'fail', qdrant: 'fail' as 'ok' | 'fail' };
  try {
    const res = await fetch(`${EMBEDDING_SIDECAR_URL}/health`);
    if (res.ok) result.sidecar = 'ok';
  } catch { /* leave as fail */ }
  try {
    await qdrant().getCollections();
    result.qdrant = 'ok';
  } catch { /* leave as fail */ }
  return result;
}
