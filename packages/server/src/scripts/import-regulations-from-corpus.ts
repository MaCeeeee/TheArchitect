/**
 * import-regulations-from-corpus — kopiert Regulations aus dem kanonischen
 * Korpus (Server B, CORPUS_MONGODB_URI) in den Projekt-Bestand (App-Mongo,
 * Regulation-Collection), damit das Auto-Mapping (Regulation.find({projectId}))
 * sie sieht.
 *
 * Hintergrund: Der Crawler (POST /regulations/crawl) schreibt in den Korpus,
 * NICHT ins Projekt — deshalb zeigt `GET /projects/:id/regulations` nach dem
 * Crawl `total: 0`. Für die Self-Baseline (SELF_BASELINE_GUIDE.md Schritt 2)
 * brauchen wir die Paragraphen aber projekt-lokal.
 *
 *   export MONGODB_URI=...  CORPUS_MONGODB_URI=...   # beide in packages/server/.env
 *   npm run regs:import -- --project 6a3ff887... --sources dsgvo,nis2         # Dry-Run
 *   npm run regs:import -- --project 6a3ff887... --sources dsgvo,nis2 --apply
 *
 * Idempotent: dedupe über (projectId, source, paragraphNumber) — vorhandene
 * Paragraphen werden übersprungen (kein Versions-Wildwuchs). Read-only auf dem
 * Korpus; schreibt nur in die App-DB.
 *
 * Linear: THE-379 · Epic THE-378 (UC-EVAL-001)
 */
import mongoose from 'mongoose';
import type { ICorpusRegulation } from '../services/corpusClient.service';

// ─── Reine Transformation (ohne DB — testbar) ───────────────────

export interface ProjectRegulationDoc {
  projectId: mongoose.Types.ObjectId;
  source: string;
  jurisdiction: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  language: string;
  sourceUrl: string;
  effectiveFrom: Date;
  version: number;
}

export interface ImportPlanItem {
  source: string;
  paragraphNumber: string;
  action: 'insert' | 'skip_exists' | 'skip_short';
  reason?: string;
}

/**
 * Bildet eine Korpus-Regulation auf ein Projekt-Regulation-Dokument ab. Reine
 * Funktion. `existingKeys` = Set aus "source::paragraphNumber" der schon im
 * Projekt vorhandenen Paragraphen.
 */
export function planImport(
  corpusRegs: Pick<
    ICorpusRegulation,
    'source' | 'jurisdiction' | 'paragraphNumber' | 'title' | 'fullText' | 'language' | 'sourceUrl' | 'effectiveFrom'
  >[],
  existingKeys: Set<string>,
  projectId: mongoose.Types.ObjectId
): { docs: ProjectRegulationDoc[]; plan: ImportPlanItem[] } {
  const docs: ProjectRegulationDoc[] = [];
  const plan: ImportPlanItem[] = [];
  for (const r of corpusRegs) {
    const key = `${r.source}::${r.paragraphNumber}`;
    if (existingKeys.has(key)) {
      plan.push({ source: r.source, paragraphNumber: r.paragraphNumber, action: 'skip_exists' });
      continue;
    }
    if (!r.fullText || r.fullText.length < 50) {
      plan.push({
        source: r.source,
        paragraphNumber: r.paragraphNumber,
        action: 'skip_short',
        reason: `fullText ${r.fullText?.length ?? 0} < 50`,
      });
      continue;
    }
    docs.push({
      projectId,
      source: r.source,
      jurisdiction: r.jurisdiction,
      paragraphNumber: r.paragraphNumber,
      title: r.title,
      fullText: r.fullText,
      language: r.language,
      sourceUrl: r.sourceUrl || 'corpus-import',
      effectiveFrom: r.effectiveFrom ?? new Date(),
      version: 1,
    });
    plan.push({ source: r.source, paragraphNumber: r.paragraphNumber, action: 'insert' });
  }
  return { docs, plan };
}

// ─── DB-Glue ────────────────────────────────────────────────────

interface CliOptions {
  projectId: string;
  sources: string[];
  apply: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { projectId: '', sources: [], apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' && argv[i + 1]) opts.projectId = argv[++i];
    else if (argv[i] === '--sources' && argv[i + 1]) {
      opts.sources = argv[++i].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    } else if (argv[i] === '--apply') opts.apply = true;
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.projectId || !mongoose.isValidObjectId(opts.projectId) || opts.sources.length === 0) {
    console.error('Usage: regs:import -- --project <id> --sources dsgvo,nis2 [--apply]');
    process.exitCode = 2;
    return;
  }

  const dotenv = await import('dotenv');
  dotenv.config();

  const { connectMongoDB } = await import('../config/database');
  const { isCorpusConfigured, listCorpusBySource } = await import('../services/corpusClient.service');
  const { Regulation } = await import('../models/Regulation');

  if (!isCorpusConfigured()) {
    console.error(
      '[import] CORPUS_MONGODB_URI ist nicht gesetzt — der Korpus (Server B) ist so nicht\n' +
        '[import] direkt erreichbar. Trag CORPUS_MONGODB_URI in packages/server/.env ein\n' +
        '[import] (siehe .env.example) oder sag Bescheid — dann bauen wir einen HTTP-Weg.'
    );
    process.exitCode = 2;
    return;
  }

  await connectMongoDB();
  const projectId = new mongoose.Types.ObjectId(opts.projectId);

  try {
    const corpusRegs = await listCorpusBySource(opts.sources);
    console.log(
      `[import] Korpus: ${corpusRegs.length} Paragraphen für [${opts.sources.join(', ')}]`
    );

    const existing = await Regulation.find({ projectId, source: { $in: opts.sources } })
      .select('source paragraphNumber')
      .lean();
    const existingKeys = new Set(existing.map(e => `${e.source}::${e.paragraphNumber}`));

    const { docs, plan } = planImport(corpusRegs, existingKeys, projectId);

    for (const p of plan) {
      const mark = { insert: '＋', skip_exists: '＝', skip_short: '✗' }[p.action];
      console.log(`  ${mark} ${p.source} ${p.paragraphNumber} [${p.action}]${p.reason ? ' ' + p.reason : ''}`);
    }

    if (opts.apply && docs.length > 0) {
      await Regulation.insertMany(docs, { ordered: false });
      console.log(`\n[import] ${docs.length} Regulations ins Projekt geschrieben.`);
      console.log('[import] NEXT: POST /compliance/mappings/auto — jetzt sieht das Auto-Mapping sie.');
    } else if (!opts.apply) {
      console.log(`\n[import] DRY-RUN: ${docs.length} würden eingefügt. Mit --apply schreiben.`);
    } else {
      console.log('\n[import] Nichts zu tun (alle Paragraphen schon im Projekt).');
    }
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[import] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
