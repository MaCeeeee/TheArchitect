import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Regulation } from '../db/regulation.model';
import { buildRegulationKey, computeVersionHash } from '../db/regulationKey';
import { getSourceEntry } from '../sources/source-registry';
import { isNormSource, NORM_ONTOLOGY } from '@thearchitect/shared';
import { config } from '../config';
import { isEmbeddingConfigured, tryEmbedAndIndex, getQdrantClient, countPoints } from '../embeddings';
import { runEmbedBackfill, type BackfillResult } from '../embeddings/backfill';
import { requireCrawlerToken } from '../lib/requireToken';

export const CrawlBodySchema = z.object({
  /**
   * Legacy/optional. The canonical corpus is project-independent (ADR-0001);
   * accepted for backward compat but no longer scopes the written records.
   */
  projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'projectId must be a valid ObjectId hex').optional(),
  sources: z
    .array(z.string().refine(isNormSource, { message: 'source not in norm ontology' }))
    .min(1)
    .max(12), // bound the array — a request can't fan out into unlimited source crawls (security review)
  /** Skip the embedding step entirely (useful for fast re-crawls / debugging) */
  skipEmbedding: z.boolean().default(false),
});

export async function crawlRoutes(app: FastifyInstance): Promise<void> {
  app.post('/crawl', { preHandler: requireCrawlerToken }, async (request, reply) => {
    const parse = CrawlBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parse.error.flatten() });
    }
    // Dedupe — repeated sources (e.g. ["lksg","lksg",…]) must not re-crawl the same site N times.
    const sources = [...new Set(parse.data.sources)];
    const { skipEmbedding } = parse.data;

    const embeddingConfig = {
      sidecarUrl: config.EMBEDDING_SERVICE_URL ?? '',
      qdrantUrl: config.QDRANT_URL ?? '',
      qdrantApiKey: config.QDRANT_API_KEY,
    };
    const willEmbed = !skipEmbedding && isEmbeddingConfigured(embeddingConfig);

    const results: Array<{
      source: string;
      inserted: number;
      updated: number;
      embedded: number;
      embedErrors: number;
      skipped: number;
    }> = [];
    const errors: Array<{ source: string; message: string }> = [];

    for (const sourceKey of sources) {
      const entry = getSourceEntry(sourceKey);
      if (!entry) {
        errors.push({ source: sourceKey, message: 'source not yet implemented' });
        continue;
      }
      const parser = entry.make({
        firecrawlKey: config.FIRECRAWL_API_KEY,
        firecrawlUrl: config.FIRECRAWL_API_URL || undefined,
      });

      try {
        const parsed = await parser.crawl();
        const fetchedAt = new Date();

        let inserted = 0;
        let updated = 0;
        let embedded = 0;
        let embedErrors = 0;

        for (const p of parsed) {
          const regulationKey = buildRegulationKey(p.source, p.paragraphNumber);
          const versionHash = computeVersionHash(p.fullText);
          const filter = { regulationKey, version: 1 };
          const result = await Regulation.updateOne(
            filter,
            {
              $set: {
                ...p,
                regulationKey,
                versionHash,
                crawledAt: new Date(),
                provenance: { adapter: entry.adapter, format: entry.format, fetchedAt, sourceUri: p.sourceUrl },
                ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
              },
              $setOnInsert: { version: 1 },
            },
            { upsert: true, runValidators: true }
          );
          if (result.upsertedCount > 0) inserted += 1;
          else if (result.modifiedCount > 0) updated += 1;

          // Embedding pipeline (REQ-ICM-001.3 / THE-277)
          if (willEmbed) {
            const reg = await Regulation.findOne(filter);
            if (reg) {
              const embed = await tryEmbedAndIndex(reg, embeddingConfig);
              if (embed.ok) embedded += 1;
              else {
                embedErrors += 1;
                request.log.warn(
                  { regulationId: embed.regulationId, err: embed.error, source: sourceKey },
                  'embed failed'
                );
              }
            }
          }
        }

        results.push({
          source: sourceKey,
          inserted,
          updated,
          embedded,
          embedErrors,
          skipped: parsed.length - inserted - updated,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        request.log.error({ err, source: sourceKey }, 'crawl failed');
        errors.push({ source: sourceKey, message: msg });
      }
    }

    // ── Reconcile-Nachlauf (THE-622) ────────────────────────────────────
    // Der Inline-Embed oben kann still übersprungen werden (Sidecar down,
    // Teil-Failure) — das Dokument liegt dann in Mongo und nie in Qdrant, und
    // kein Signal zeigt es an. So lag DORA sechs Artikel lang halb im Korpus
    // (2026-07-12). Deshalb läuft der Backfill jetzt als Teil der Route: er
    // holt idempotent nur nach, was fehlt (`total: 0` = nichts lag brach).
    let reconcile: BackfillResult | null = null;
    if (willEmbed) {
      try {
        reconcile = await runEmbedBackfill({ embeddingConfig });
        if (reconcile.total > 0) {
          request.log.info(
            { total: reconcile.total, embedded: reconcile.embedded, failed: reconcile.failed },
            'crawl reconcile: backfilled regulations the inline embed had skipped'
          );
        }
        // Drift-Probe aus dem Ziel selbst — der Backfill-Rückgabewert ist kein
        // Beweis. Zählerdifferenz ⇒ Warn-Log mit beiden Zahlen, damit die Drift
        // im Log steht statt nur in einer Hand-Query.
        const mongoCount = await Regulation.estimatedDocumentCount();
        const qdrantCount = await countPoints(getQdrantClient(embeddingConfig.qdrantUrl, embeddingConfig.qdrantApiKey));
        if (mongoCount !== qdrantCount) {
          request.log.warn(
            { mongoCount, qdrantCount, drift: mongoCount - qdrantCount },
            'crawl reconcile: Mongo and Qdrant still disagree after backfill — inspect /corpus/status'
          );
        }
      } catch (err) {
        // Nachlauf-Fehler dürfen den Crawl-Erfolg nicht verschlucken — die
        // gecrawlten Dokumente SIND in Mongo. Loggen, Response trägt reconcile:null.
        request.log.error({ err }, 'crawl reconcile failed — run POST /embed-all manually');
      }
    }

    return reply.code(200).send({ results, errors, embeddingEnabled: willEmbed, reconcile });
  });
}
