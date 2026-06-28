/**
 * POST /embed-all  — backfill embeddings for the whole regulation corpus.
 *
 * Use cases:
 *   - Initial Qdrant seeding after a fresh deployment
 *   - Re-embed after model change (future: switching embedding model)
 *   - Recover from a partial-failure crawl where some embeddings were skipped
 *
 * Corpus-wide (ADR-0001): no project scoping. Response: { total, embedded, failed, errors }
 *
 * Linear: THE-277 (REQ-ICM-001.3) AC-4 · THE-367 (corpus store)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Regulation } from '../db/regulation.model';
import { config } from '../config';
import { isEmbeddingConfigured, tryEmbedAndIndex } from '../embeddings';
import { requireCrawlerToken } from '../lib/requireToken';

const EmbedAllBodySchema = z.object({
  /** Legacy/optional — the corpus is project-independent (ADR-0001); ignored if sent. */
  projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'projectId must be a valid ObjectId hex').optional(),
  /** Re-embed even if Regulation.embedding is already set (default: false → only missing) */
  force: z.boolean().default(false),
  /** Concurrency limit for parallel sidecar calls. Default 5 to stay polite. */
  concurrency: z.number().int().min(1).max(20).default(5),
});

export async function embedAllRoutes(app: FastifyInstance): Promise<void> {
  app.post('/embed-all', { preHandler: requireCrawlerToken }, async (request, reply) => {
    const parse = EmbedAllBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parse.error.flatten() });
    }
    const { force, concurrency } = parse.data;

    const embeddingConfig = {
      sidecarUrl: config.EMBEDDING_SERVICE_URL ?? '',
      qdrantUrl: config.QDRANT_URL ?? '',
      qdrantApiKey: config.QDRANT_API_KEY,
    };
    if (!isEmbeddingConfigured(embeddingConfig)) {
      return reply.code(503).send({
        error: 'embedding_not_configured',
        message: 'Set EMBEDDING_SERVICE_URL and QDRANT_URL to enable embedding',
      });
    }

    const filter: Record<string, unknown> = {};
    if (!force) {
      filter.$or = [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }];
    }

    const all = await Regulation.find(filter);
    const total = all.length;

    if (total === 0) {
      return reply.code(200).send({
        total: 0,
        embedded: 0,
        failed: 0,
        errors: [],
        message: force ? 'no regulations in corpus' : 'all regulations already embedded',
      });
    }

    let embedded = 0;
    let failed = 0;
    const errors: Array<{ regulationId: string; error: string }> = [];

    // Bounded concurrency: process in batches
    for (let i = 0; i < all.length; i += concurrency) {
      const batch = all.slice(i, i + concurrency);
      const settled = await Promise.all(batch.map(reg => tryEmbedAndIndex(reg, embeddingConfig)));
      for (const r of settled) {
        if (r.ok) embedded += 1;
        else {
          failed += 1;
          if (r.error) errors.push({ regulationId: r.regulationId, error: r.error });
        }
      }
    }

    return reply.code(200).send({ total, embedded, failed, errors });
  });
}
