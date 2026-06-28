/**
 * Seed-Migration — per-Projekt-Regulations → kanonischer Korpus (THE-368 / ADR-0001).
 *
 * Liest die (Alt-)`Regulation`-Dokumente aus der App-DB (per-Projekt-Kopien) und
 * schreibt sie dedupliziert in den Korpus-Store (über den Corpus-Client / separate
 * Connection). Dedupe-Schlüssel = `regulationKey` (source:paragraph). Identischer
 * Paragraph aus mehreren Projekten → ein Korpus-Eintrag.
 *
 * Idempotent (Upsert per {regulationKey, version}). Default = DRY-RUN; `--apply` schreibt.
 *
 * Voraussetzung: CORPUS_MONGODB_URI gesetzt (Korpus übers Tailnet erreichbar).
 *
 * Mac:  npx ts-node src/scripts/seed-corpus-from-projects.ts            (dry-run)
 *       npx ts-node src/scripts/seed-corpus-from-projects.ts --apply
 * Prod: docker compose exec server node dist/scripts/seed-corpus-from-projects.js --apply
 */
import mongoose from 'mongoose';
import { buildRegulationKey } from '@thearchitect/shared';
import { Regulation } from '../models/Regulation';
import { computeVersionHash } from '../utils/regulationVersion';
import { upsertCorpusRegulation, isCorpusConfigured } from '../services/corpusClient.service';

export interface SeedReport {
  applied: boolean;
  sourceDocs: number; // per-project Regulation docs read
  uniqueKeys: number; // distinct regulationKeys
  inserted: number; // new corpus entries
  upsertedOrSkipped: number; // already present (idempotent re-run)
}

/**
 * Testbarer Kern. Liest App-DB-Regulations (default connection), schreibt deduped
 * in den Korpus (Corpus-Client). Schreibt nur bei `apply`.
 */
export async function seedCorpusFromProjects({ apply }: { apply: boolean }): Promise<SeedReport> {
  if (!isCorpusConfigured()) {
    throw new Error('corpus not configured — set CORPUS_MONGODB_URI');
  }

  const docs = await Regulation.find({}).select(
    'source jurisdiction paragraphNumber title fullText summary sourceUrl effectiveFrom language crawledAt',
  );

  // Dedupe by regulationKey — keep the first occurrence (identical paragraphs match).
  const byKey = new Map<string, (typeof docs)[number]>();
  for (const d of docs) {
    const key = buildRegulationKey(d.source, d.paragraphNumber);
    if (!byKey.has(key)) byKey.set(key, d);
  }

  const report: SeedReport = {
    applied: apply,
    sourceDocs: docs.length,
    uniqueKeys: byKey.size,
    inserted: 0,
    upsertedOrSkipped: 0,
  };

  if (!apply) return report;

  for (const [key, d] of byKey) {
    const { inserted } = await upsertCorpusRegulation({
      regulationKey: key,
      versionHash: computeVersionHash(d.fullText),
      source: d.source,
      jurisdiction: d.jurisdiction,
      paragraphNumber: d.paragraphNumber,
      title: d.title,
      fullText: d.fullText,
      summary: d.summary,
      sourceUrl: d.sourceUrl,
      effectiveFrom: d.effectiveFrom,
      language: d.language,
      version: 1,
      crawledAt: d.crawledAt ?? new Date(),
    } as Parameters<typeof upsertCorpusRegulation>[0]);
    if (inserted) report.inserted += 1;
    else report.upsertedOrSkipped += 1;
  }

  return report;
}

async function main(): Promise<void> {
  const dotenv = await import('dotenv');
  dotenv.config();
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[seed-corpus] MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  try {
    const report = await seedCorpusFromProjects({ apply });
    console.log(
      `[seed-corpus] ${apply ? 'APPLIED' : 'DRY-RUN'} — sourceDocs=${report.sourceDocs} ` +
        `uniqueKeys=${report.uniqueKeys} inserted=${report.inserted} existing=${report.upsertedOrSkipped}`,
    );
    if (!apply) console.log('[seed-corpus] re-run with --apply to write.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[seed-corpus] failed:', err);
    process.exit(1);
  });
}
