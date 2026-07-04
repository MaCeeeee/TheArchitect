/**
 * seed-golden-from-db — verwandelt bestehende menschliche Mapping-Entscheidungen
 * (ComplianceMapping.status confirmed/rejected, createdBy human) in ENTWURFS-
 * Golden-Cases für die Eval-Harness. Reduziert das Labeling von „50–100 von Null"
 * auf „Auto-Vorschläge prüfen/korrigieren" (letzter offener Punkt in THE-379).
 *
 * Kandidatenliste = VOLLES Projekt-Element-Set aus Neo4j (nicht nur die
 * gemappten), damit False Negatives (übersehene Pflicht-Elemente) sichtbar
 * bleiben. Gold = confirmed / human-erstellte Mappings.
 *
 * WICHTIG: Read-only auf der DB. Schreibt NUR eine JSON-Datei; das Ergebnis ist
 * `frozen: false` und MUSS von einem Menschen geprüft werden (RUBRIC.md §7),
 * bevor es als Baseline (THE-381) zählt.
 *
 *   npx ts-node src/scripts/seed-golden-from-db.ts
 *   npx ts-node src/scripts/seed-golden-from-db.ts --out src/evals/golden/mapping.from-db.json
 *   npx ts-node src/scripts/seed-golden-from-db.ts --include-rejection-only
 *   npx ts-node src/scripts/seed-golden-from-db.ts --project 6a3ff887e50cc39a4193802f  # Self-Baseline
 *
 * Linear: THE-379 (REQ-EVAL-001.1) · Epic THE-378 (UC-EVAL-001)
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { buildRegulationKey } from '@thearchitect/shared';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { Regulation } from '../models/Regulation';
import { computeVersionHash } from '../utils/regulationVersion';
import { loadProjectCandidateElements } from '../services/complianceElements.service';
import type { CandidateElement } from '../services/complianceMapping.service';
import type { GoldenCase, GoldenSet } from '../evals/goldenSet';

// ─── Reine Transformation (ohne DB — testbar) ───────────────────

export interface RegulationGroupInput {
  projectId: string;
  regulationId: string;
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: 'de' | 'en';
  jurisdiction: string;
  candidates: CandidateElement[];
  confirmedElementIds: string[]; // status=confirmed ODER createdBy=human
  rejectedElementIds: string[]; // status=rejected
}

export interface BuildOptions {
  includeRejectionOnly?: boolean;
  labeledAt: string; // ISO date, hereingereicht für Determinismus
}

export interface BuildResult {
  cases: GoldenCase[];
  skipped: Array<{ regulationId: string; reason: string }>;
}

/** Slugifiziert einen String zu einem stabilen caseId-Fragment. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Baut Golden-Cases aus gruppierten DB-Entscheidungen. Reine Funktion:
 * kein I/O, deterministisch bei gegebenem labeledAt.
 */
export function buildGoldenCasesFromGroups(
  groups: RegulationGroupInput[],
  opts: BuildOptions,
): BuildResult {
  const cases: GoldenCase[] = [];
  const skipped: BuildResult['skipped'] = [];
  const seenCaseIds = new Set<string>();

  for (const g of groups) {
    if (g.candidates.length === 0) {
      skipped.push({ regulationId: g.regulationId, reason: 'no candidate elements in project' });
      continue;
    }
    if (g.fullText.length < 50) {
      skipped.push({ regulationId: g.regulationId, reason: 'regulation fullText < 50 chars' });
      continue;
    }

    const candidateIds = new Set(g.candidates.map(c => c.id));
    const confirmed = g.confirmedElementIds.filter(id => candidateIds.has(id));
    const rejected = g.rejectedElementIds.filter(id => candidateIds.has(id));

    const rejectionOnly = confirmed.length === 0;
    if (rejectionOnly && !opts.includeRejectionOnly) {
      skipped.push({
        regulationId: g.regulationId,
        reason: 'only rejections known — gold set would be unreliable (use --include-rejection-only)',
      });
      continue;
    }

    // caseId kollisionssicher über Projekte hinweg.
    const base = `${slugify(g.source)}-${slugify(g.paragraphNumber)}`;
    let caseId = `${base}-${g.projectId.slice(-6)}`;
    let n = 2;
    while (seenCaseIds.has(caseId)) caseId = `${base}-${g.projectId.slice(-6)}-${n++}`;
    seenCaseIds.add(caseId);

    const note = rejectionOnly
      ? `AUTO-SEED aus DB: 0 confirmed, ${rejected.length} rejected. Nur Ablehnungen bekannt — goldElementIds evtl. unvollständig, PRÜFEN (RUBRIC.md).`
      : `AUTO-SEED aus DB: ${confirmed.length} confirmed, ${rejected.length} rejected. Namen + Gold-Set gegen RUBRIC.md prüfen, dann frozen setzen.`;

    cases.push({
      caseId,
      source: g.source,
      paragraphNumber: g.paragraphNumber,
      title: g.title,
      fullText: g.fullText,
      language: g.language,
      jurisdiction: g.jurisdiction,
      candidates: g.candidates,
      goldElementIds: confirmed,
      ambiguous: rejectionOnly ? true : false,
      notes: note,
      annotator: 'db-seed',
      labeledAt: opts.labeledAt,
    });
  }

  return { cases, skipped };
}

// ─── DB-Glue (nur in main) ──────────────────────────────────────

interface CliOptions {
  outPath: string;
  includeRejectionOnly: boolean;
  /** Nur Mappings dieses Projekts (Self-Baseline: das TheArchitect-Modell). */
  projectId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    outPath: path.join(__dirname, '..', 'evals', 'golden', 'mapping.from-db.json'),
    includeRejectionOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) opts.outPath = path.resolve(argv[++i]);
    else if (argv[i] === '--include-rejection-only') opts.includeRejectionOnly = true;
    else if (argv[i] === '--project' && argv[i + 1]) opts.projectId = argv[++i];
  }
  return opts;
}

async function collectGroups(projectId?: string): Promise<RegulationGroupInput[]> {
  // Alle menschlich berührten Mappings holen (optional auf ein Projekt begrenzt).
  const filter: Record<string, unknown> = {
    $or: [{ status: { $in: ['confirmed', 'rejected'] } }, { createdBy: 'human' }],
  };
  if (projectId) filter.projectId = new mongoose.Types.ObjectId(projectId);
  const mappings = await ComplianceMapping.find(filter).lean();

  // Gruppieren nach (projectId, regulationId).
  const byKey = new Map<
    string,
    { projectId: string; regulationId: string; confirmed: string[]; rejected: string[] }
  >();
  for (const m of mappings) {
    const projectId = String(m.projectId);
    const regulationId = String(m.regulationId);
    const key = `${projectId}::${regulationId}`;
    const entry = byKey.get(key) ?? { projectId, regulationId, confirmed: [], rejected: [] };
    const isPositive = m.status === 'confirmed' || m.createdBy === 'human';
    if (m.status === 'rejected') entry.rejected.push(m.elementId);
    else if (isPositive) entry.confirmed.push(m.elementId);
    byKey.set(key, entry);
  }

  // Regulierungstext + volles Kandidatenset je Gruppe nachladen.
  const candidatesByProject = new Map<string, CandidateElement[]>();
  const groups: RegulationGroupInput[] = [];

  for (const entry of byKey.values()) {
    const reg = await Regulation.findById(entry.regulationId).lean();
    if (!reg) {
      // eslint-disable-next-line no-console
      console.warn(`[seed] regulation ${entry.regulationId} not found — skip`);
      continue;
    }

    let candidates = candidatesByProject.get(entry.projectId);
    if (!candidates) {
      candidates = await loadProjectCandidateElements(entry.projectId);
      candidatesByProject.set(entry.projectId, candidates);
    }

    groups.push({
      projectId: entry.projectId,
      regulationId: entry.regulationId,
      source: reg.source,
      paragraphNumber: reg.paragraphNumber,
      title: reg.title,
      fullText: reg.fullText,
      language: reg.language,
      jurisdiction: reg.jurisdiction,
      candidates,
      confirmedElementIds: entry.confirmed,
      rejectedElementIds: entry.rejected,
    });
  }

  return groups;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const dotenv = await import('dotenv');
  dotenv.config(); // .env aus packages/server lesen (MONGODB_URI, NEO4J_*)

  const { connectMongoDB } = await import('../config/database');
  const { connectNeo4j, getNeo4jDriver } = await import('../config/neo4j');

  await connectMongoDB();
  await connectNeo4j();

  try {
    const groups = await collectGroups(opts.projectId);
    // eslint-disable-next-line no-console
    console.log(`[seed] ${groups.length} (project, regulation) groups with human verdicts`);

    const { cases, skipped } = buildGoldenCasesFromGroups(groups, {
      includeRejectionOnly: opts.includeRejectionOnly,
      labeledAt: new Date().toISOString().slice(0, 10),
    });

    const set: GoldenSet = {
      version: 'seed-from-db',
      frozen: false,
      rubricRef: '../RUBRIC.md',
      cases,
    };

    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    fs.writeFileSync(opts.outPath, JSON.stringify(set, null, 2));

    const hardNegatives = cases.filter(c => c.goldElementIds.length === 0).length;
    // eslint-disable-next-line no-console
    console.log(
      `[seed] wrote ${cases.length} draft cases (${hardNegatives} without gold) → ${opts.outPath}\n` +
        `[seed] skipped ${skipped.length} groups\n` +
        `[seed] NEXT: review names + gold set against RUBRIC.md, then set frozen:true.`,
    );
    for (const s of skipped) {
      // eslint-disable-next-line no-console
      console.log(`[seed]   skip ${s.regulationId}: ${s.reason}`);
    }
  } finally {
    await mongoose.disconnect().catch(() => undefined);
    await getNeo4jDriver().close().catch(() => undefined);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      // eslint-disable-next-line no-console
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}
