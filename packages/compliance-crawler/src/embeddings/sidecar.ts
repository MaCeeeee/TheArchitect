/**
 * Embedding-Sidecar HTTP client.
 *
 * Talks to the Python FastAPI sidecar deployed on Server B (UC-SIM-001 stack).
 * Sidecar exposes:
 *   POST /embed  body: {text} → {vector: number[768], dim: 768, model: string}
 *   GET  /health → 200 OK
 *
 * Linear: THE-277 (REQ-ICM-001.3)
 */

export const EMBEDDING_DIM = 768;

export interface SidecarEmbedResponse {
  vector: number[];
  dim: number;
  model: string;
}

export class EmbeddingSidecarError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EmbeddingSidecarError';
  }
}

/**
 * Embed a single text string. Throws on transport / dim mismatch.
 * Use the wrapping orchestrator (`embeddings/index.ts`) for fail-soft semantics.
 */
export async function embedText(text: string, sidecarUrl: string): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(`${sidecarUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    throw new EmbeddingSidecarError(`embedding sidecar fetch failed`, err);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EmbeddingSidecarError(
      `embedding sidecar ${res.status}: ${body.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as SidecarEmbedResponse;
  if (data.dim !== EMBEDDING_DIM) {
    throw new EmbeddingSidecarError(
      `unexpected embedding dim ${data.dim}, expected ${EMBEDDING_DIM}`
    );
  }
  return data.vector;
}

export async function checkSidecarHealth(sidecarUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${sidecarUrl}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
