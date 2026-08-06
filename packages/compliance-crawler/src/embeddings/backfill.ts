/**
 * Embed-Backfill als geteilte Funktion — EIN Codepfad für zwei Aufrufer.
 *
 * Bisher lebte diese Logik ausschließlich in der Route `POST /embed-all` und
 * lief nur, wenn ein Mensch sie rief. Genau daran ist DORA gescheitert
 * (2026-07-12): der Inline-Embed im Crawl wurde still übersprungen, die sechs
 * Artikel lagen in Mongo und nie in Qdrant, und niemand lief nach. Jetzt ruft
 * auch `POST /crawl` diese Funktion als Nachlauf — der Crawl hinterlässt keine
 * unembeddeten Dokumente mehr, ohne dass sich jemand erinnern muss.
 *
 * Linear: THE-622 (REQ-EMBED-001.1) · Parent THE-466 (OPS-EMBED-001)
 */
import { Regulation } from '../db/regulation.model';
import { tryEmbedAndIndex, type EmbedConfig } from './index';

export interface BackfillResult {
  total: number;
  embedded: number;
  failed: number;
  errors: Array<{ regulationId: string; error: string }>;
}

/**
 * Embeddet alle Korpus-Dokumente ohne (oder mit `force` auch mit) Vektor.
 * Idempotent: ohne `force` ist ein zweiter Lauf ein No-op (`total: 0`).
 * Wirft nicht bei Einzel-Fehlern — sie landen gezählt in `errors`.
 */
export async function runEmbedBackfill(args: {
  embeddingConfig: EmbedConfig;
  force?: boolean;
  concurrency?: number;
}): Promise<BackfillResult> {
  const { embeddingConfig, force = false, concurrency = 5 } = args;

  const filter: Record<string, unknown> = {};
  if (!force) {
    filter.$or = [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }];
  }

  const all = await Regulation.find(filter);
  const total = all.length;
  if (total === 0) return { total: 0, embedded: 0, failed: 0, errors: [] };

  let embedded = 0;
  let failed = 0;
  const errors: BackfillResult['errors'] = [];

  // Bounded concurrency: process in batches (verbatim aus der embed-all-Route).
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

  return { total, embedded, failed, errors };
}
