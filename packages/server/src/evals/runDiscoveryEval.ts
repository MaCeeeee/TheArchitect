/**
 * Discovery-Eval-Runner — misst UC-LAW-002 Discovery gegen das Golden-Set
 * (THE-465 AC-7/AC-8, Owner-Scope 2026-07-18).
 *
 *   npm run eval:discovery -- --offline              # nur Cache/Precompute-Artefakte, kein Netz
 *   npm run eval:discovery -- --hyde                  # + Baseline-vs-HyDE-Vergleich (braucht discovery.queries.v1.json mit hydeVector)
 *   npm run eval:discovery -- --judge                 # + optionale Judge-Stufe (online oder Cache)
 *   npm run eval:discovery -- --golden <path>
 *
 * Läuft komplett OFFLINE gegen den Fixture-Korpus mit vorberechneten
 * Embeddings (Precompute-Script, Task 6) — Cosine-Similarity ist reine Mathe
 * im Runner (Qdrant nutzt dieselbe Metrik, daher vergleichbar). Retrieval-
 * Recall wird STRIKT getrennt von der optionalen Judge-Stufe gemessen (AC-7).
 *
 * Review-Fix 3 (Fail-Fast): fehlen Vektoren (Precompute nie gelaufen), bricht
 * der Runner klar ab — statt NaN-Scores stillschweigend zu berichten.
 *
 * Linear: THE-465 (REQ-LAW-002.6)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { CorpusHit, DiscoveryCandidate } from '@thearchitect/shared';
import {
  loadDiscoveryGoldenSet,
  loadFixtureCorpus,
  discoveryGoldenSetStats,
  DEFAULT_DISCOVERY_GOLDEN_PATH,
  type DiscoveryGoldenSet,
  type FixtureCorpus,
} from './discoveryGolden';
import { readQueriesFile, DEFAULT_QUERIES_PATH, type QueriesFile } from '../scripts/build-discovery-eval-vectors';
import { aggregateHitsToCandidates, gateCandidatesForJudge } from '../services/lawDiscovery.service';
import { judgeCandidate, type JudgeCandidateArgs } from '../services/lawJudge.service';
import {
  aggregateMetrics,
  emptySetAccuracy,
  precisionByConfidenceBand,
  expectedCalibrationError,
  calibrationSamplesFromOutcomes,
  bootstrapCI,
  mulberry32,
  fBeta,
  type CaseOutcome,
  type ConfidenceInterval,
  type PrfMetrics,
} from './metrics';

const REPORTS_DIR = path.join(__dirname, 'reports');
const DEFAULT_TOP_K = Number(process.env.LAW_DISCOVERY_TOP_K) || 60;

// ─── Cosine retrieval (pure — mirrors Qdrant cosine similarity) ───────

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Ranks fixture paragraphs by cosine similarity to a query vector, sliced to topK. */
export function topKByCosine(
  queryVector: number[],
  paragraphs: FixtureCorpus['paragraphs'],
  topK: number,
): CorpusHit[] {
  const scored = paragraphs
    .filter(p => p.vector)
    .map(p => ({
      regulationKey: p.regulationKey,
      versionHash: p.versionHash,
      source: p.source,
      paragraphNumber: p.paragraphNumber,
      title: p.title,
      jurisdiction: p.jurisdiction,
      language: p.language,
      score: cosineSimilarity(queryVector, p.vector as number[]),
    }));
  scored.sort((a, b) => b.score - a.score || a.regulationKey.localeCompare(b.regulationKey));
  return scored.slice(0, topK);
}

/** Maps aggregated candidates onto a metrics.ts CaseOutcome (family = elementId). */
export function familyOutcomeForCase(
  caseId: string,
  goldFamilies: string[],
  candidates: DiscoveryCandidate[],
): CaseOutcome {
  return {
    caseId,
    source: 'discovery',
    goldElementIds: goldFamilies,
    predicted: candidates.map(c => ({ elementId: c.family, confidence: c.score })),
  };
}

/**
 * AC-5 regression guard: `aggregateHitsToCandidates` merges de/en sources into
 * ONE family entry via a Map — this should be structurally impossible to
 * violate, but the check makes a future regression (e.g. a family-merge bug)
 * visible in the report instead of silently degrading DE/EN recall.
 */
export function familyLanguageConsistencyIssues(candidates: DiscoveryCandidate[]): string[] {
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.family, (counts.get(c.family) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([family, n]) => `family "${family}" appears as ${n} separate candidates — de/en split not merged`);
}

// ─── Fail-Fast-Guard (Review-Fix 3) ────────────────────────────────

export class MissingVectorsError extends Error {
  constructor(message: string) {
    super(`${message} — run \`npm run eval:discovery:build\` first.`);
    this.name = 'MissingVectorsError';
  }
}

export function assertVectorsPresent(
  corpus: FixtureCorpus,
  golden: DiscoveryGoldenSet,
  queries: QueriesFile | null,
  opts: { hyde: boolean },
): void {
  const missingParagraphs = corpus.paragraphs.filter(p => !p.vector).map(p => p.regulationKey);
  if (missingParagraphs.length > 0) {
    throw new MissingVectorsError(
      `${missingParagraphs.length} fixture paragraph(s) have no vector (e.g. ${missingParagraphs.slice(0, 3).join(', ')})`,
    );
  }
  if (!queries) {
    throw new MissingVectorsError('discovery.queries.v1.json does not exist — no baseline query vectors at all');
  }
  const byCaseId = new Map(queries.queries.map(q => [q.caseId, q]));
  const missingBaseline = golden.cases.filter(c => !byCaseId.get(c.caseId)?.baselineVector).map(c => c.caseId);
  if (missingBaseline.length > 0) {
    throw new MissingVectorsError(
      `${missingBaseline.length} case(s) have no baselineVector (e.g. ${missingBaseline.slice(0, 3).join(', ')})`,
    );
  }
  if (opts.hyde) {
    const missingHyde = golden.cases.filter(c => !byCaseId.get(c.caseId)?.hydeVector).map(c => c.caseId);
    if (missingHyde.length > 0) {
      throw new MissingVectorsError(
        `--hyde: ${missingHyde.length} case(s) have no hydeVector (e.g. ${missingHyde.slice(0, 3).join(', ')})`,
      );
    }
  }
}

// ─── Judge-Stufe: Verlust-Attribution (AC-7) ───────────────────────

export interface LossAttribution {
  caseId: string;
  missedAtRetrieval: string[]; // gold family never showed up in retrieval at all
  missedAtJudge: string[]; // retrieved, but judge said applies:false
  falsePositiveAtJudge: string[]; // judge said applies:true for a non-gold family
}

export function lossAttributionForCase(
  caseId: string,
  goldFamilies: string[],
  retrievalFamilies: string[],
  judged: Map<string, { applies: boolean }>,
): LossAttribution {
  const retrievedSet = new Set(retrievalFamilies);
  const goldSet = new Set(goldFamilies);
  const missedAtRetrieval = goldFamilies.filter(f => !retrievedSet.has(f));
  const missedAtJudge = goldFamilies.filter(f => retrievedSet.has(f) && judged.get(f)?.applies === false);
  const falsePositiveAtJudge = [...judged.entries()]
    .filter(([f, v]) => v.applies && !goldSet.has(f))
    .map(([f]) => f);
  return { caseId, missedAtRetrieval, missedAtJudge, falsePositiveAtJudge };
}

/**
 * AC-2 (Fix 3): das End-to-End-Outcome eines Cases nach der Judge-Stufe —
 * mit der ECHTEN Judge-Confidence je Familie (nicht der Konstante 1), sonst
 * sind Kalibrierung (ECE) und Confidence-Bands bedeutungslos.
 */
export function buildJudgePostOutcome(
  caseId: string,
  goldFamilies: string[],
  judged: Map<string, { applies: boolean; confidence: number }>,
): CaseOutcome {
  return {
    caseId,
    source: 'discovery',
    goldElementIds: goldFamilies,
    predicted: [...judged.entries()]
      .filter(([, v]) => v.applies)
      .map(([family, v]) => ({ elementId: family, confidence: v.confidence })),
  };
}

// ─── Per-Family-Breakdown (AC-2, Fix 2) ────────────────────────────

/**
 * P/R/F2 JE Gesetz (Familie) über alle Cases aggregiert — deckt auf, ob ein
 * guter Gesamt-Recall einzelne Familien-Blindstellen versteckt (z. B. mdr
 * nie gefunden, dsgvo überall). Familien-Universum = Gold ∪ Predicted.
 */
export function perFamilyBreakdown(outcomes: CaseOutcome[]): Record<string, PrfMetrics> {
  const counts = new Map<string, { tp: number; fp: number; fn: number }>();
  const bump = (family: string, key: 'tp' | 'fp' | 'fn') => {
    const c = counts.get(family) ?? { tp: 0, fp: 0, fn: 0 };
    c[key]++;
    counts.set(family, c);
  };
  for (const o of outcomes) {
    const gold = new Set(o.goldElementIds);
    const predicted = new Set(o.predicted.map(p => p.elementId));
    for (const f of predicted) bump(f, gold.has(f) ? 'tp' : 'fp');
    for (const f of gold) {
      if (!predicted.has(f)) bump(f, 'fn');
    }
  }
  const result: Record<string, PrfMetrics> = {};
  for (const [family, c] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const precision = c.tp + c.fp === 0 ? 0 : c.tp / (c.tp + c.fp);
    const recall = c.tp + c.fn === 0 ? 0 : c.tp / (c.tp + c.fn);
    result[family] = { precision, recall, f2: fBeta(precision, recall, 2), tp: c.tp, fp: c.fp, fn: c.fn };
  }
  return result;
}

// ─── ruleLessGold-Recall (AC-7 Kern-Indikator) ─────────────────────

export function ruleLessGoldRecall(outcomes: CaseOutcome[], ruleLessByCaseId: Map<string, string[]>): number | null {
  let hit = 0;
  let total = 0;
  for (const o of outcomes) {
    const ruleLess = ruleLessByCaseId.get(o.caseId) ?? [];
    if (ruleLess.length === 0) continue;
    const predicted = new Set(o.predicted.map(p => p.elementId));
    for (const f of ruleLess) {
      total++;
      if (predicted.has(f)) hit++;
    }
  }
  if (total === 0) return null;
  return hit / total;
}

// ─── Baseline-vs-HyDE (AC-8): gepaarter Bootstrap auf die Differenz ─

/** Paired bootstrap CI on metric(hyde) − metric(baseline) — same case order/count in both. */
export function bootstrapDeltaCI(
  baseline: CaseOutcome[],
  hyde: CaseOutcome[],
  metric: (o: CaseOutcome[]) => number,
  iterations = 1000,
  seed = 42,
  alpha = 0.05,
): ConfidenceInterval {
  if (baseline.length === 0 || baseline.length !== hyde.length) return { lo: 0, hi: 0 };
  const rand = mulberry32(seed);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const idxs: number[] = [];
    for (let j = 0; j < baseline.length; j++) idxs.push(Math.floor(rand() * baseline.length));
    const bResample = idxs.map(k => baseline[k]);
    const hResample = idxs.map(k => hyde[k]);
    samples.push(metric(hResample) - metric(bResample));
  }
  samples.sort((a, b) => a - b);
  const loIdx = Math.floor((alpha / 2) * iterations);
  const hiIdx = Math.min(iterations - 1, Math.ceil((1 - alpha / 2) * iterations) - 1);
  return { lo: samples[loIdx], hi: samples[hiIdx] };
}

// ─── Report ─────────────────────────────────────────────────────────

function pct(x: number | null): string {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}

export interface JudgeRunSummary {
  postOutcomes: CaseOutcome[];
  attributions: LossAttribution[];
  callCount: number;
  callWarningThreshold: number;
  /** Per-Kandidat-Fehler (z.B. Schema-Bruch nach beiden Attempts) — Case wird mit den restlichen Verdicts gewertet (Eval-Fund 2026-07-18). */
  judgeErrors: number;
}

export interface HydeRunSummary {
  hydeOutcomes: CaseOutcome[];
}

export interface BuildReportArgs {
  golden: DiscoveryGoldenSet;
  startedAt: string;
  topK: number;
  /** PRIMÄR: die GEGATETE Kandidatenmenge (was in Prod den Judge erreicht). */
  retrievalOutcomes: CaseOutcome[];
  /** Diagnose: alle aggregierten Familien (upper bound — degeneriert bei topK ≥ Korpus). */
  anyHitOutcomes: CaseOutcome[];
  corpusParagraphCount: number;
  threshold: number;
  maxJudge: number;
  ruleLessByCaseId: Map<string, string[]>;
  familyIssues: string[];
  judgeRun: JudgeRunSummary | null;
  hydeRun: HydeRunSummary | null;
}

export function buildMarkdownReport(args: BuildReportArgs): string {
  const { golden, retrievalOutcomes, anyHitOutcomes } = args;
  const stats = discoveryGoldenSetStats(golden);
  const overall = aggregateMetrics(retrievalOutcomes);
  const empty = emptySetAccuracy(retrievalOutcomes);
  const ruleLessRecall = ruleLessGoldRecall(retrievalOutcomes, args.ruleLessByCaseId);
  const recallCI = bootstrapCI(retrievalOutcomes, o => aggregateMetrics(o).recall);
  const anyHit = aggregateMetrics(anyHitOutcomes);
  const degenerate = args.topK >= args.corpusParagraphCount;

  const lines: string[] = [];
  lines.push(`# Discovery-Eval Report — Golden-Set ${golden.version}`);
  lines.push('');
  if (!golden.frozen) {
    lines.push('> ⚠️ **PRELIMINARY — golden set not yet owner-approved** (`frozen: false`).');
    lines.push('> Results are development values, not a THE-381-style baseline.');
    lines.push('');
  }
  if (degenerate) {
    // Degeneration-Hinweis (Ursache des ersten echten Laufs): topK ≥ Fixture-
    // Korpus ⇒ jede Query retrievt ALLE §§ ⇒ any-hit-Metriken sind bedeutungslos.
    lines.push(
      `> ⚠️ **DEGENERATE any-hit setting**: topK (${args.topK}) ≥ fixture corpus size (${args.corpusParagraphCount} paragraphs) —`,
    );
    lines.push('> every query retrieves every paragraph, so any-hit recall is trivially 100%. The gated');
    lines.push('> metrics below remain meaningful (they measure what actually reaches the judge in prod).');
    lines.push('');
  }
  lines.push(`- Date: ${args.startedAt} · Top-K: ${args.topK} · Judge gate: threshold ${args.threshold}, max ${args.maxJudge}`);
  lines.push(
    `- Cases: ${stats.total} (hard negatives: ${stats.hardNegatives} = ${pct(stats.hardNegativeShare)}, ambiguous: ${stats.ambiguous}, rule-less-gold cases: ${stats.ruleLessCases})`,
  );
  lines.push('');
  lines.push('## Retrieval — gated candidate set (what reaches the judge in prod; AC-7)');
  lines.push('');
  lines.push('| Metric | Value | 95%-CI (bootstrap) |');
  lines.push('|---|---|---|');
  lines.push(`| Precision | ${pct(overall.precision)} | — |`);
  lines.push(`| **Recall** | **${pct(overall.recall)}** | ${pct(recallCI.lo)} – ${pct(recallCI.hi)} |`);
  lines.push(`| F2 | ${pct(overall.f2)} | — |`);
  lines.push(`| Empty-Set-Accuracy (hard negatives) | ${pct(empty)} | — |`);
  lines.push(`| TP / FP / FN | ${overall.tp} / ${overall.fp} / ${overall.fn} | — |`);
  lines.push(
    `| **ruleLessGold Recall** (Stage-A-blind families — the corpus value-add) | **${pct(ruleLessRecall)}** | — |`,
  );
  lines.push('');
  lines.push(
    `_Diagnostic: any-hit recall (upper bound): ${pct(anyHit.recall)} — K=${args.topK} vs corpus=${args.corpusParagraphCount} paragraphs; degenerate if K≥corpus._`,
  );
  lines.push('');
  // AC-2 (Fix 2): P/R JE Gesetz — deckt Familien-Blindstellen auf, die der
  // Gesamt-Recall versteckt.
  lines.push('### Per-family breakdown (retrieval, gated)');
  lines.push('');
  lines.push('| Family | Precision | Recall | F2 | TP/FP/FN |');
  lines.push('|---|---|---|---|---|');
  for (const [family, m] of Object.entries(perFamilyBreakdown(retrievalOutcomes))) {
    lines.push(`| ${family} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f2)} | ${m.tp}/${m.fp}/${m.fn} |`);
  }
  lines.push('');
  lines.push('## DE/EN family consistency (AC-5)');
  lines.push('');
  if (args.familyIssues.length === 0) {
    lines.push('No de/en family splits detected — every family was merged into a single candidate.');
  } else {
    for (const issue of args.familyIssues) lines.push(`- ⚠️ ${issue}`);
  }
  lines.push('');

  if (args.judgeRun) {
    const { postOutcomes, attributions, callCount, callWarningThreshold, judgeErrors } = args.judgeRun;
    const post = aggregateMetrics(postOutcomes);
    const samples = calibrationSamplesFromOutcomes(postOutcomes);
    const ece = expectedCalibrationError(samples);
    const bands = precisionByConfidenceBand(postOutcomes);
    lines.push('## Judge stage (end-to-end, optional --judge)');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    lines.push(`| End-to-end Precision | ${pct(post.precision)} |`);
    lines.push(`| **End-to-end F2** | **${pct(post.f2)}** |`);
    lines.push(`| ECE (calibration) | ${ece.ece.toFixed(3)} |`);
    lines.push('');
    // AC-2 (Fix 2): per-family auch auf End-to-End-Ebene.
    lines.push('### Per-family breakdown (end-to-end)');
    lines.push('');
    lines.push('| Family | Precision | Recall | F2 | TP/FP/FN |');
    lines.push('|---|---|---|---|---|');
    for (const [family, m] of Object.entries(perFamilyBreakdown(postOutcomes))) {
      lines.push(`| ${family} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f2)} | ${m.tp}/${m.fp}/${m.fn} |`);
    }
    lines.push('');
    lines.push('### Loss attribution per case');
    lines.push('');
    for (const a of attributions) {
      if (a.missedAtRetrieval.length === 0 && a.missedAtJudge.length === 0 && a.falsePositiveAtJudge.length === 0) continue;
      lines.push(
        `- \`${a.caseId}\` — missed@retrieval: ${a.missedAtRetrieval.join(', ') || '—'} · missed@judge: ${a.missedAtJudge.join(', ') || '—'} · false-positive@judge: ${a.falsePositiveAtJudge.join(', ') || '—'}`,
      );
    }
    lines.push('');
    lines.push('### Confidence bands');
    lines.push('');
    lines.push('| Band | Predictions | Correct | Precision |');
    lines.push('|---|---|---|---|');
    for (const b of bands) lines.push(`| ${b.band} | ${b.predictions} | ${b.correct} | ${pct(b.precision)} |`);
    lines.push('');
    lines.push('## Cost (AC-4)');
    lines.push('');
    lines.push(`- Judge calls: ${callCount}${callCount > callWarningThreshold ? ` ⚠️ above warning threshold (${callWarningThreshold})` : ''}`);
    if (judgeErrors > 0) {
      lines.push(`- ⚠️ Judge errors (candidates skipped, cases scored with remaining verdicts): ${judgeErrors}`);
    }
    lines.push('');
  }

  if (args.hydeRun) {
    const baseline = retrievalOutcomes;
    const hyde = args.hydeRun.hydeOutcomes;
    const mBase = aggregateMetrics(baseline);
    const mHyde = aggregateMetrics(hyde);
    const ruleLessBase = ruleLessGoldRecall(baseline, args.ruleLessByCaseId);
    const ruleLessHyde = ruleLessGoldRecall(hyde, args.ruleLessByCaseId);
    const deltaCI = bootstrapDeltaCI(baseline, hyde, o => aggregateMetrics(o).recall);
    const deltaRuleLessCI = bootstrapDeltaCI(
      baseline,
      hyde,
      o => ruleLessGoldRecall(o, args.ruleLessByCaseId) ?? 0,
    );
    lines.push('## Baseline vs. HyDE retrieval (AC-8 — eval-only, NOT in the prod path)');
    lines.push('');
    lines.push('| | Precision | Recall | F2 | ruleLessGold Recall |');
    lines.push('|---|---|---|---|---|');
    lines.push(`| Baseline | ${pct(mBase.precision)} | ${pct(mBase.recall)} | ${pct(mBase.f2)} | ${pct(ruleLessBase)} |`);
    lines.push(`| HyDE | ${pct(mHyde.precision)} | ${pct(mHyde.recall)} | ${pct(mHyde.f2)} | ${pct(ruleLessHyde)} |`);
    lines.push(
      `| **Δ (HyDE − Baseline)** | — | **${((mHyde.recall - mBase.recall) * 100).toFixed(1)}pp** (CI ${(deltaCI.lo * 100).toFixed(1)}–${(deltaCI.hi * 100).toFixed(1)}pp) | — | ${((( ruleLessHyde ?? 0) - (ruleLessBase ?? 0)) * 100).toFixed(1)}pp (CI ${(deltaRuleLessCI.lo * 100).toFixed(1)}–${(deltaRuleLessCI.hi * 100).toFixed(1)}pp) |`,
    );
    lines.push('');
    lines.push(
      '_A HyDE→prod follow-up REQ is only justified if the ruleLessGold Δ-recall CI is clearly positive — see the plan\'s "Bewusste Nicht-Ziele"._',
    );
    lines.push('');
  }

  lines.push('_Retrieval and judge are measured separately by design (AC-7): a strong end-to-end F2 can hide a weak retriever_');
  lines.push('_masked by an aggressive judge, or vice versa. ruleLessGold recall is the headline number for the corpus-vs-rules question._');
  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────

interface CliOptions {
  goldenPath: string;
  offline: boolean;
  hyde: boolean;
  judge: boolean;
  judgeModel: string;
  outDir: string;
  /** Judge-Gate fürs Retrieval-Scoring — Default wie Prod (0.3/5), CLI-override-bar. */
  threshold: number;
  maxJudge: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    goldenPath: DEFAULT_DISCOVERY_GOLDEN_PATH,
    offline: false,
    hyde: false,
    judge: false,
    judgeModel: process.env.LAW_DISCOVERY_JUDGE_MODEL || 'claude-haiku-4-5-20251001',
    outDir: REPORTS_DIR,
    threshold: 0.3,
    maxJudge: 5,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--golden' && argv[i + 1]) opts.goldenPath = path.resolve(argv[++i]);
    else if (argv[i] === '--offline') opts.offline = true;
    else if (argv[i] === '--hyde') opts.hyde = true;
    else if (argv[i] === '--judge') opts.judge = true;
    else if (argv[i] === '--judge-model' && argv[i + 1]) opts.judgeModel = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) opts.outDir = path.resolve(argv[++i]);
    else if (argv[i] === '--threshold' && argv[i + 1]) opts.threshold = Number(argv[++i]);
    else if (argv[i] === '--max-judge' && argv[i + 1]) opts.maxJudge = Number(argv[++i]);
  }
  return opts;
}

async function runJudgeStage(
  golden: DiscoveryGoldenSet,
  perCaseCandidates: Map<string, DiscoveryCandidate[]>,
  retrievalOutcomes: CaseOutcome[],
  model: string,
  offline: boolean,
): Promise<JudgeRunSummary> {
  const postOutcomes: CaseOutcome[] = [];
  const attributions: LossAttribution[] = [];
  let callCount = 0;
  let judgeErrors = 0;

  for (const c of golden.cases) {
    const candidates = perCaseCandidates.get(c.caseId) ?? [];
    // Fix 3 (AC-2): confidence wird MITGEFÜHRT — sie speist ECE/Bands im Report.
    const judged = new Map<string, { applies: boolean; confidence: number }>();
    for (const candidate of candidates) {
      if (offline) {
        // No file-based judge cache shipped in this eval yet — offline runs skip
        // the judge stage per case rather than crash; missed@judge shows as 0
        // for every candidate (documented limitation until a judge cache lands).
        continue;
      }
      const args: JudgeCandidateArgs = {
        profileText: c.profileText,
        profileElements: [],
        candidate: {
          family: candidate.family,
          sources: candidate.sources,
          jurisdiction: candidate.jurisdiction,
          topHits: candidate.topHits.map(h => ({ regulationKey: h.regulationKey, title: h.title })),
          retrievalScore: candidate.score,
        },
        projectId: `eval:${c.caseId}`,
        corpusVersionHash: `eval:${c.caseId}:${candidate.family}`,
        model,
      };
      // Runner-Toleranz (Eval-Fund 2026-07-18): ein fehlgeschlagener Judge-Call
      // (z.B. Schema-Bruch nach beiden Attempts) bricht NICHT den ganzen Eval-Lauf
      // ab — Kandidat wird gezählt und übersprungen, der Case mit den restlichen
      // Verdicts gewertet.
      try {
        const verdict = await judgeCandidate(args);
        callCount++;
        judged.set(candidate.family, { applies: verdict.applies, confidence: verdict.confidence });
      } catch (err) {
        judgeErrors++;
        callCount++;
        console.warn(`[eval:discovery] judge failed for ${c.caseId}/${candidate.family} — skipped: ${(err as Error).message}`);
      }
    }
    const retrievalFamilies = (retrievalOutcomes.find(o => o.caseId === c.caseId)?.predicted ?? []).map(p => p.elementId);
    attributions.push(lossAttributionForCase(c.caseId, c.goldFamilies, retrievalFamilies, judged));
    // Fix 3 (AC-2): echte Judge-Confidence im Post-Outcome (nicht Konstante 1).
    postOutcomes.push(buildJudgePostOutcome(c.caseId, c.goldFamilies, judged));
  }

  return { postOutcomes, attributions, callCount, callWarningThreshold: golden.cases.length * 2, judgeErrors };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const golden = loadDiscoveryGoldenSet(opts.goldenPath);
  const corpus = loadFixtureCorpus();
  const queries = readQueriesFile(DEFAULT_QUERIES_PATH);

  assertVectorsPresent(corpus, golden, queries, { hyde: opts.hyde });
  const byCaseId = new Map((queries as QueriesFile).queries.map(q => [q.caseId, q]));

  const ruleLessByCaseId = new Map(golden.cases.map(c => [c.caseId, c.ruleLessGold]));
  // Degeneration-Fix: PRIMÄR wird die GEGATETE Kandidatenmenge gemessen (was in
  // Prod wirklich den Judge erreicht) — die ungegatete any-hit-Menge ist bei
  // topK ≥ #Fixture-§§ trivial vollständig (Recall 100 %) und nur noch Diagnose.
  const retrievalOutcomes: CaseOutcome[] = []; // gated (primary)
  const anyHitOutcomes: CaseOutcome[] = []; // ungated (upper-bound diagnostic)
  const perCaseCandidates = new Map<string, DiscoveryCandidate[]>(); // GATED — feeds the judge stage
  const familyIssues: string[] = [];

  for (const c of golden.cases) {
    const baselineVector = byCaseId.get(c.caseId)!.baselineVector as number[];
    const hits = topKByCosine(baselineVector, corpus.paragraphs, DEFAULT_TOP_K);
    const candidates = aggregateHitsToCandidates(hits);
    const gated = gateCandidatesForJudge(candidates, opts.threshold, opts.maxJudge);
    perCaseCandidates.set(c.caseId, gated);
    familyIssues.push(...familyLanguageConsistencyIssues(candidates));
    retrievalOutcomes.push(familyOutcomeForCase(c.caseId, c.goldFamilies, gated));
    anyHitOutcomes.push(familyOutcomeForCase(c.caseId, c.goldFamilies, candidates));
  }

  let hydeRun: HydeRunSummary | null = null;
  if (opts.hyde) {
    const hydeOutcomes: CaseOutcome[] = [];
    for (const c of golden.cases) {
      const hydeVector = byCaseId.get(c.caseId)!.hydeVector as number[];
      const hits = topKByCosine(hydeVector, corpus.paragraphs, DEFAULT_TOP_K);
      const candidates = aggregateHitsToCandidates(hits);
      // Vergleichslauf auf derselben (gegateten) Ebene wie die Baseline — sonst
      // vergleicht man eine gated- gegen eine degenerierte any-hit-Menge.
      const gated = gateCandidatesForJudge(candidates, opts.threshold, opts.maxJudge);
      hydeOutcomes.push(familyOutcomeForCase(c.caseId, c.goldFamilies, gated));
    }
    hydeRun = { hydeOutcomes };
  }

  let judgeRun: JudgeRunSummary | null = null;
  if (opts.judge) {
    if (opts.offline) {
      console.log('[eval:discovery] --judge + --offline: no judge cache shipped yet — judge stage skipped, retrieval-only report.');
    } else {
      let client: Anthropic | undefined;
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('--judge requires ANTHROPIC_API_KEY (or run with --offline to skip it)');
      client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      void client; // judgeCandidate reads ANTHROPIC_API_KEY itself when no client is injected
      judgeRun = await runJudgeStage(golden, perCaseCandidates, retrievalOutcomes, opts.judgeModel, false);
    }
  }

  const startedAt = new Date().toISOString();
  const markdown = buildMarkdownReport({
    golden,
    startedAt,
    topK: DEFAULT_TOP_K,
    retrievalOutcomes,
    anyHitOutcomes,
    corpusParagraphCount: corpus.paragraphs.length,
    threshold: opts.threshold,
    maxJudge: opts.maxJudge,
    ruleLessByCaseId,
    familyIssues: [...new Set(familyIssues)],
    judgeRun,
    hydeRun,
  });

  fs.mkdirSync(opts.outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const base = path.join(opts.outDir, `discovery-${stamp}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify(
      {
        goldenSetVersion: golden.version,
        frozen: golden.frozen,
        startedAt,
        topK: DEFAULT_TOP_K,
        judgeGate: { threshold: opts.threshold, maxJudge: opts.maxJudge },
        corpusParagraphCount: corpus.paragraphs.length,
        degenerateAnyHit: DEFAULT_TOP_K >= corpus.paragraphs.length,
        // PRIMARY: gated candidate set (what reaches the judge in prod).
        overall: aggregateMetrics(retrievalOutcomes),
        perFamily: perFamilyBreakdown(retrievalOutcomes),
        ruleLessGoldRecall: ruleLessGoldRecall(retrievalOutcomes, ruleLessByCaseId),
        // Diagnostic upper bound (degenerate when topK >= corpus size).
        anyHit: { overall: aggregateMetrics(anyHitOutcomes) },
        familyIssues,
        judge: judgeRun
          ? {
              callCount: judgeRun.callCount,
              overall: aggregateMetrics(judgeRun.postOutcomes),
              perFamily: perFamilyBreakdown(judgeRun.postOutcomes),
            }
          : null,
        hyde: hydeRun ? { overall: aggregateMetrics(hydeRun.hydeOutcomes) } : null,
        retrievalOutcomes,
      },
      null,
      2,
    ),
  );

  console.log('\n' + markdown);
  console.log(`\n[eval:discovery] Report: ${base}.md / .json`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[eval:discovery] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
