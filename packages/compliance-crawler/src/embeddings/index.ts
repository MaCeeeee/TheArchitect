/**
 * Embedding orchestrator — combines sidecar + Qdrant + Mongo update.
 *
 * Public API:
 *   - embedAndIndex(regulation, projectId): embed + Qdrant upsert + Mongo update
 *   - isEmbeddingConfigured(): true if EMBEDDING_SERVICE_URL + QDRANT_URL are set
 *
 * Fail-soft: on transport error, logs and returns null. Caller decides whether
 * to surface the failure (typically: continue crawl, count as "skipped").
 *
 * Linear: THE-277 (REQ-ICM-001.3)
 */
import type { IRegulation } from '../db/regulation.model';
import { Regulation } from '../db/regulation.model';
import { embedText, EMBEDDING_DIM } from './sidecar';
import {
  getQdrantClient,
  upsertRegulationVector,
  type RegulationPointPayload,
} from './qdrant';

export interface EmbedConfig {
  sidecarUrl: string;
  qdrantUrl: string;
  qdrantApiKey?: string;
}

export interface EmbedResult {
  regulationId: string;
  ok: boolean;
  error?: string;
}

/**
 * Build the text passed to the embedding sidecar.
 *
 * Includes title + summary (if present) + fullText. Truncated to a sensible
 * upper bound so the sidecar doesn't time out on multi-thousand-word articles.
 */
export function regulationToEmbeddingText(reg: Pick<IRegulation, 'title' | 'summary' | 'fullText'>): string {
  const parts: string[] = [];
  if (reg.title) parts.push(reg.title.trim());
  if (reg.summary) parts.push(reg.summary.trim());
  if (reg.fullText) parts.push(reg.fullText.trim().slice(0, 8000));
  return parts.join('\n\n');
}

/**
 * Embed one Regulation document and upsert into Qdrant.
 * Also writes the embedding vector back into Mongo (Regulation.embedding).
 *
 * Returns the vector on success, throws on failure.
 */
export async function embedAndIndex(
  regulation: IRegulation,
  config: EmbedConfig
): Promise<number[]> {
  const text = regulationToEmbeddingText(regulation);
  const vector = await embedText(text, config.sidecarUrl);
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(`embed returned wrong dim: ${vector.length}, expected ${EMBEDDING_DIM}`);
  }

  const client = getQdrantClient(config.qdrantUrl, config.qdrantApiKey);
  const projectIdStr = regulation.projectId.toString();
  const payload: RegulationPointPayload = {
    regulationId: regulation._id?.toString() ?? '',
    source: regulation.source,
    paragraphNumber: regulation.paragraphNumber,
    title: regulation.title,
    summary: regulation.summary,
    effectiveFrom: regulation.effectiveFrom.toISOString(),
    jurisdiction: regulation.jurisdiction,
    language: regulation.language,
  };

  await upsertRegulationVector({
    client,
    projectId: projectIdStr,
    regulationId: payload.regulationId,
    vector,
    payload,
  });

  // Persist embedding back to Mongo (Regulation.embedding field on the model)
  await Regulation.updateOne(
    { _id: regulation._id },
    { $set: { embedding: vector } },
    { runValidators: true }
  );

  return vector;
}

/**
 * Embed-and-index variant that swallows errors and returns a structured result.
 * Used by batch endpoints where one bad regulation shouldn't kill the run.
 */
export async function tryEmbedAndIndex(
  regulation: IRegulation,
  config: EmbedConfig
): Promise<EmbedResult> {
  try {
    await embedAndIndex(regulation, config);
    return { regulationId: regulation._id?.toString() ?? '', ok: true };
  } catch (err) {
    return {
      regulationId: regulation._id?.toString() ?? '',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function isEmbeddingConfigured(config: {
  sidecarUrl?: string;
  qdrantUrl?: string;
}): boolean {
  return Boolean(config.sidecarUrl && config.qdrantUrl);
}

export * from './sidecar';
export * from './qdrant';
