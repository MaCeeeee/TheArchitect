/**
 * GET /corpus/status — Mongo↔Qdrant per-source integrity, in one call.
 *
 * The single source of truth for "is law X fully in the corpus?". Born from the
 * DORA incident (2026-07-12): DORA sat in Mongo (6 docs) but never got embedded
 * into Qdrant (0 vectors) — a silent partial failure invisible to code, UI, tests
 * and health, found only by a hand-written read-query + SSH archaeology. This
 * endpoint collapses that whole dig into a single GET.
 *
 * Read-only, no crawler token (Tailnet-isolated, mirrors the public /health).
 * Always returns 200 — this is an observability endpoint, so `healthy` lives in the
 * body (dashboards/CI read the flag; monitoring doesn't have to treat drift as a
 * transport error). `drift = mongoCount − qdrantCount`; ≠0 for any source ⇒ unhealthy.
 *
 * Linear: THE-468 (REQ-LAWOPS-001.1) · parent THE-467 (UC-LAWOPS-001)
 */
import type { FastifyInstance } from 'fastify';
import { Regulation } from '../db/regulation.model';
import { config } from '../config';
import { getQdrantClient, countPointsBySource, CORPUS_COLLECTION } from '../embeddings/qdrant';

/** Per-source Mongo facts (from a $group aggregation). */
export interface MongoSourceFacts {
  source: string;
  mongoCount: number;
  /** Docs whose `embedding` array is non-empty — the Mongo-side proxy for "should be in Qdrant". */
  mongoEmbedded: number;
  lastCrawledAt: Date | null;
}

export interface SourceStatus {
  source: string;
  mongoCount: number;
  mongoEmbedded: number;
  /** null ⇒ Qdrant unreachable/unconfigured (not "zero vectors"). */
  qdrantCount: number | null;
  /** mongoCount − qdrantCount; null when qdrantCount is null. */
  drift: number | null;
  lastCrawledAt: string | null;
}

export interface CorpusStatus {
  collection: string;
  sources: SourceStatus[];
  totals: { mongo: number; qdrant: number | null; drift: number | null };
  qdrantReachable: boolean;
  healthy: boolean;
}

/**
 * Pure status assembly — no I/O, so the drift/healthy logic is unit-testable without
 * a live Mongo or Qdrant. `qdrant === null` means Qdrant was unreachable/unconfigured.
 * The source set is the UNION of Mongo and Qdrant sources so orphan vectors (present
 * in Qdrant, gone from Mongo) surface as negative drift instead of hiding.
 */
export function buildCorpusStatus(args: {
  mongo: MongoSourceFacts[];
  qdrant: Map<string, number> | null;
  collection: string;
}): CorpusStatus {
  const qReachable = args.qdrant !== null;
  const mongoBySource = new Map(args.mongo.map((m) => [m.source, m]));
  const allSources = new Set<string>([
    ...args.mongo.map((m) => m.source),
    ...(qReachable ? [...args.qdrant!.keys()] : []),
  ]);

  const sources: SourceStatus[] = [...allSources]
    .map((source) => {
      const m = mongoBySource.get(source);
      const mongoCount = m?.mongoCount ?? 0;
      const qdrantCount = qReachable ? (args.qdrant!.get(source) ?? 0) : null;
      return {
        source,
        mongoCount,
        mongoEmbedded: m?.mongoEmbedded ?? 0,
        qdrantCount,
        drift: qdrantCount === null ? null : mongoCount - qdrantCount,
        lastCrawledAt: m?.lastCrawledAt ? m.lastCrawledAt.toISOString() : null,
      };
    })
    .sort((a, b) => a.source.localeCompare(b.source));

  const totalMongo = sources.reduce((s, x) => s + x.mongoCount, 0);
  const totalQdrant = qReachable ? sources.reduce((s, x) => s + (x.qdrantCount ?? 0), 0) : null;
  const totalDrift = totalQdrant === null ? null : totalMongo - totalQdrant;
  const healthy = qReachable && sources.every((s) => s.drift === 0);

  return {
    collection: args.collection,
    sources,
    totals: { mongo: totalMongo, qdrant: totalQdrant, drift: totalDrift },
    qdrantReachable: qReachable,
    healthy,
  };
}

/** Aggregate Mongo per source: total docs, embedded docs, latest crawl. */
async function loadMongoFacts(): Promise<MongoSourceFacts[]> {
  const agg = await Regulation.aggregate<{
    _id: string;
    mongoCount: number;
    mongoEmbedded: number;
    lastCrawledAt: Date | null;
  }>([
    {
      $group: {
        _id: '$source',
        mongoCount: { $sum: 1 },
        mongoEmbedded: {
          $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$embedding', []] } }, 0] }, 1, 0] },
        },
        lastCrawledAt: { $max: '$crawledAt' },
      },
    },
  ]);
  return agg.map((a) => ({
    source: a._id,
    mongoCount: a.mongoCount,
    mongoEmbedded: a.mongoEmbedded,
    lastCrawledAt: a.lastCrawledAt ?? null,
  }));
}

export async function corpusStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/corpus/status', async (_req, reply) => {
    const mongo = await loadMongoFacts();

    // Count Qdrant per source. Degrade gracefully (qdrant=null ⇒ qdrantCount=null,
    // healthy=false) instead of 500 — mirrors the health.ts degraded-not-crash rule.
    let qdrant: Map<string, number> | null = null;
    if (config.QDRANT_URL) {
      try {
        const client = getQdrantClient(config.QDRANT_URL, config.QDRANT_API_KEY);
        qdrant = new Map();
        for (const src of new Set(mongo.map((m) => m.source))) {
          qdrant.set(src, await countPointsBySource(client, src));
        }
      } catch (err) {
        app.log.warn({ err }, 'corpus/status: Qdrant unreachable — reporting qdrantCount=null');
        qdrant = null;
      }
    }

    const status = buildCorpusStatus({ mongo, qdrant, collection: CORPUS_COLLECTION });
    return reply.code(200).send(status);
  });
}
