/**
 * Eval-Harness Runner — misst den Compliance-Mapping-Service gegen das Golden-Set.
 *
 *   npm run eval:mapping                       # live (braucht ANTHROPIC_API_KEY), cached Ergebnisse
 *   npm run eval:mapping -- --offline          # nur Cache, kein LLM-Call (deterministisch, CI-tauglich)
 *   npm run eval:mapping -- --golden <path>    # anderes Golden-Set
 *
 * Ablauf: Golden-Case → mapTextToElements() (KEIN DB-Persist) → Vorhersagen
 * gegen goldElementIds → Metriken (P/R/F2, Empty-Set, Breakdown, Bootstrap-CI)
 * → Report als Markdown (Konsole + Datei) und JSON.
 *
 * Predictions werden pro Case gecacht (cache/<setVersion>/<caseId>.json),
 * Key enthält Text-Hash + Modell + Prompt-Hash — ändert sich eines davon,
 * wird neu gemessen. So sind Baseline-Läufe (THE-381) reproduzierbar und
 * das CI-Gate (THE-386) läuft ohne API-Key.
 *
 * Linear: THE-380 (REQ-EVAL-001.2) · Epic THE-378 (UC-EVAL-001)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  mapTextToElements,
  __testExports,
  type ComplianceMappingCandidate,
} from '../services/complianceMapping.service';
import { SYSTEM_PROMPT } from '../prompts/complianceMapping.prompt';
import {
  loadGoldenSet,
  goldenSetStats,
  toCandidateElements,
  DEFAULT_GOLDEN_PATH,
  type GoldenCase,
  type GoldenSet,
} from './goldenSet';
import {
  aggregateMetrics,
  emptySetAccuracy,
  breakdownBySource,
  precisionByConfidenceBand,
  bootstrapCI,
  type CaseOutcome,
} from './metrics';

const CACHE_DIR = path.join(__dirname, 'cache');
const REPORTS_DIR = path.join(__dirname, 'reports');

interface CliOptions {
  goldenPath: string;
  offline: boolean;
  outDir: string;
}

interface CachedPrediction {
  cacheKey: string;
  model: string;
  promptHash: string;
  textHash: string;
  predictions: ComplianceMappingCandidate[];
  cachedAt: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    goldenPath: DEFAULT_GOLDEN_PATH,
    offline: false,
    outDir: REPORTS_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--golden' && argv[i + 1]) opts.goldenPath = path.resolve(argv[++i]);
    else if (argv[i] === '--offline') opts.offline = true;
    else if (argv[i] === '--out' && argv[i + 1]) opts.outDir = path.resolve(argv[++i]);
  }
  return opts;
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function cacheKeyFor(c: GoldenCase, model: string, promptHash: string): string {
  return sha256([sha256(c.fullText), model, promptHash, c.candidates.map(el => el.id).join(',')].join('|'));
}

function cachePathFor(setVersion: string, caseId: string): string {
  return path.join(CACHE_DIR, setVersion, `${caseId}.json`);
}

function readCache(setVersion: string, caseId: string, expectedKey: string): CachedPrediction | null {
  const p = cachePathFor(setVersion, caseId);
  if (!fs.existsSync(p)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(p, 'utf8')) as CachedPrediction;
    return cached.cacheKey === expectedKey ? cached : null; // stale (Modell/Prompt/Text geändert)
  } catch {
    return null;
  }
}

function writeCache(setVersion: string, caseId: string, entry: CachedPrediction): void {
  const dir = path.join(CACHE_DIR, setVersion);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePathFor(setVersion, caseId), JSON.stringify(entry, null, 2));
}

async function predictCase(
  c: GoldenCase,
  set: GoldenSet,
  model: string,
  promptHash: string,
  offline: boolean
): Promise<{ predictions: ComplianceMappingCandidate[]; fromCache: boolean }> {
  const key = cacheKeyFor(c, model, promptHash);
  const cached = readCache(set.version, c.caseId, key);
  if (cached) return { predictions: cached.predictions, fromCache: true };

  if (offline) {
    throw new Error(
      `--offline: no valid cache for case "${c.caseId}" (model/prompt/text changed or never run live). ` +
        `Run once without --offline to populate the cache.`
    );
  }

  const { candidates } = await mapTextToElements({
    text: c.fullText,
    source: c.source,
    paragraphNumber: c.paragraphNumber,
    language: c.language,
    jurisdiction: c.jurisdiction,
    candidateElements: toCandidateElements(c),
  });

  writeCache(set.version, c.caseId, {
    cacheKey: key,
    model,
    promptHash,
    textHash: sha256(c.fullText),
    predictions: candidates,
    cachedAt: new Date().toISOString(),
  });
  return { predictions: candidates, fromCache: false };
}

function pct(x: number | null): string {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}

function buildMarkdownReport(args: {
  set: GoldenSet;
  model: string;
  promptHash: string;
  threshold: number;
  cap: number;
  outcomes: CaseOutcome[];
  cacheHits: number;
  startedAt: string;
}): string {
  const { set, outcomes } = args;
  const overall = aggregateMetrics(outcomes);
  const empty = emptySetAccuracy(outcomes);
  const bySource = breakdownBySource(outcomes);
  const bands = precisionByConfidenceBand(outcomes);
  const f2CI = bootstrapCI(outcomes, o => aggregateMetrics(o).f2);
  const recallCI = bootstrapCI(outcomes, o => aggregateMetrics(o).recall);
  const stats = goldenSetStats(set);

  const lines: string[] = [];
  lines.push(`# Mapping-Eval Report — Golden-Set ${set.version}`);
  lines.push('');
  if (!set.frozen) {
    lines.push('> ⚠️ **Golden-Set ist NICHT eingefroren (`frozen: false`)** — Ergebnisse sind');
    lines.push('> Entwicklungs-Werte, KEINE Baseline im Sinne von THE-381 (RUBRIC.md §7).');
    lines.push('');
  }
  lines.push(`- Datum: ${args.startedAt}`);
  lines.push(`- Modell: \`${args.model}\` · Prompt-Hash: \`${args.promptHash.slice(0, 12)}\``);
  lines.push(`- Effektiver Threshold: ${args.threshold} · Top-N-Cap: ${args.cap} (Service-Defaults)`);
  lines.push(`- Cases: ${stats.total} (Hard Negatives: ${stats.hardNegatives} = ${pct(stats.hardNegativeShare)}) · Cache-Hits: ${args.cacheHits}/${outcomes.length}`);
  lines.push('');
  lines.push('## Gesamt (micro-averaged, Paar-Ebene)');
  lines.push('');
  lines.push('| Metrik | Wert | 95%-CI (Bootstrap) |');
  lines.push('|---|---|---|');
  lines.push(`| Precision | ${pct(overall.precision)} | — |`);
  lines.push(`| **Recall** | **${pct(overall.recall)}** | ${pct(recallCI.lo)} – ${pct(recallCI.hi)} |`);
  lines.push(`| **F2** (Recall 2×) | **${pct(overall.f2)}** | ${pct(f2CI.lo)} – ${pct(f2CI.hi)} |`);
  lines.push(`| Empty-Set-Accuracy | ${pct(empty)} | — |`);
  lines.push(`| TP / FP / FN | ${overall.tp} / ${overall.fp} / ${overall.fn} | — |`);
  lines.push('');
  lines.push('## Breakdown nach Quelle');
  lines.push('');
  lines.push('| Quelle | Precision | Recall | F2 | TP/FP/FN |');
  lines.push('|---|---|---|---|---|');
  for (const [source, m] of Object.entries(bySource)) {
    lines.push(`| ${source} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f2)} | ${m.tp}/${m.fp}/${m.fn} |`);
  }
  lines.push('');
  lines.push('## Precision je Confidence-Band (Kalibrierungs-Vorstufe, THE-383)');
  lines.push('');
  lines.push('| Band | Vorhersagen | korrekt | Precision |');
  lines.push('|---|---|---|---|');
  for (const b of bands) {
    lines.push(`| ${b.band} | ${b.predictions} | ${b.correct} | ${pct(b.precision)} |`);
  }
  lines.push('');
  lines.push('## Fehler-Detail (FP/FN je Case)');
  lines.push('');
  for (const o of outcomes) {
    const gold = new Set(o.goldElementIds);
    const predIds = new Set(o.predicted.map(p => p.elementId));
    const fps = [...predIds].filter(id => !gold.has(id));
    const fns = [...gold].filter(id => !predIds.has(id));
    if (fps.length === 0 && fns.length === 0) continue;
    lines.push(`- \`${o.caseId}\` — FP: ${fps.length ? fps.join(', ') : '—'} · FN: ${fns.length ? fns.join(', ') : '—'}`);
  }
  lines.push('');
  lines.push('_Lesehilfe: FN (übersehene Pflicht-Elemente) sind audit-kritisch und der Grund,_');
  lines.push('_warum F2 statt F1 die Leitmetrik ist. Details: RUBRIC.md + EVAL_BASELINE.md._');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const set = loadGoldenSet(opts.goldenPath);
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  const promptHash = sha256(SYSTEM_PROMPT);
  const startedAt = new Date().toISOString();

  console.log(`[eval] Golden-Set ${set.version} (${set.cases.length} cases, frozen=${set.frozen})`);
  console.log(`[eval] model=${model} promptHash=${promptHash.slice(0, 12)} offline=${opts.offline}`);

  const outcomes: CaseOutcome[] = [];
  let cacheHits = 0;
  for (const c of set.cases) {
    const { predictions, fromCache } = await predictCase(c, set, model, promptHash, opts.offline);
    if (fromCache) cacheHits++;
    outcomes.push({
      caseId: c.caseId,
      source: c.source,
      goldElementIds: c.goldElementIds,
      predicted: predictions.map(p => ({ elementId: p.elementId, confidence: p.confidence })),
    });
    console.log(
      `[eval] ${fromCache ? 'cache' : 'live '} ${c.caseId}: ${predictions.length} predictions`
    );
  }

  const markdown = buildMarkdownReport({
    set,
    model,
    promptHash,
    threshold: __testExports.CONFIDENCE_THRESHOLD,
    cap: __testExports.MAX_MAPPINGS_PER_REGULATION,
    outcomes,
    cacheHits,
    startedAt,
  });

  fs.mkdirSync(opts.outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const base = path.join(opts.outDir, `mapping-eval-${set.version}-${stamp}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify(
      {
        goldenSetVersion: set.version,
        frozen: set.frozen,
        model,
        promptHash,
        threshold: __testExports.CONFIDENCE_THRESHOLD,
        cap: __testExports.MAX_MAPPINGS_PER_REGULATION,
        startedAt,
        overall: aggregateMetrics(outcomes),
        emptySetAccuracy: emptySetAccuracy(outcomes),
        bySource: breakdownBySource(outcomes),
        confidenceBands: precisionByConfidenceBand(outcomes),
        f2CI: bootstrapCI(outcomes, o => aggregateMetrics(o).f2),
        recallCI: bootstrapCI(outcomes, o => aggregateMetrics(o).recall),
        outcomes,
      },
      null,
      2
    )
  );

  console.log('\n' + markdown);
  console.log(`\n[eval] Report: ${base}.md / .json`);
}

main().catch(err => {
  console.error('[eval] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
