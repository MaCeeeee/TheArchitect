/**
 * Eval-Harness Runner — misst den Compliance-Mapping-Service gegen das Golden-Set.
 *
 *   npm run eval:mapping                       # live (braucht ANTHROPIC_API_KEY), cached Ergebnisse
 *   npm run eval:mapping -- --offline          # nur Cache, kein LLM-Call (deterministisch, CI-tauglich)
 *   npm run eval:mapping -- --golden <path>    # anderes Golden-Set
 *   npm run eval:mapping -- --models haiku,sonnet   # E1: Modellvergleich (Aliase oder volle IDs);
 *                                              # pro Modell ein Report + eine Vergleichstabelle.
 *                                              # Cache ist pro Modell getrennt (Bucket enthält Modell-ID).
 *
 * Ablauf: Golden-Case → mapTextToElements() (KEIN DB-Persist) → Vorhersagen
 * gegen goldElementIds → Metriken (P/R/F2, Empty-Set, Breakdown, Bootstrap-CI)
 * → Report als Markdown (Konsole + Datei) und JSON.
 *
 * Predictions werden pro Case gecacht (cache/<setVersion>/<model>/<caseId>.json),
 * Key enthält Text-Hash + Modell + Prompt-Hash — ändert sich eines davon,
 * wird neu gemessen. So sind Baseline-Läufe (THE-381) reproduzierbar und
 * das CI-Gate (THE-386) läuft ohne API-Key.
 *
 * Linear: THE-380 (REQ-EVAL-001.2) · Epic THE-378 (UC-EVAL-001)
 */
import 'dotenv/config'; // .env laden (ANTHROPIC_API_KEY/MODEL), bevor der Service sie liest
import fs from 'node:fs';
import path from 'node:path';
import {
  mapTextToElements,
  __testExports,
  type ComplianceMappingCandidate,
} from '../services/complianceMapping.service';
import { SYSTEM_PROMPT } from '../prompts/complianceMapping.prompt';
import { sha256, cacheKeyFor, readCache, writeCache } from './predictionCache';
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
  concisenessMetrics,
  type CaseOutcome,
} from './metrics';

const CACHE_DIR = path.join(__dirname, 'cache');
const REPORTS_DIR = path.join(__dirname, 'reports');

interface CliOptions {
  goldenPath: string;
  offline: boolean;
  outDir: string;
  /** Modelle für den Vergleichslauf (E1). Leer = Default-Verhalten (env/Service-Default). */
  models: string[];
}

/**
 * CLI-Aliase → exakte Modell-IDs. Volle IDs werden unverändert durchgereicht.
 * Exportiert für Tests.
 */
export const MODEL_ALIASES: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-4-8',
};

export function resolveModel(nameOrAlias: string): string {
  return MODEL_ALIASES[nameOrAlias.toLowerCase()] ?? nameOrAlias;
}

export function parseModelsArg(value: string): string[] {
  const models = value
    .split(',')
    .map(s => resolveModel(s.trim()))
    .filter(Boolean);
  return [...new Set(models)]; // Duplikate (auch via Alias) entfernen
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    goldenPath: DEFAULT_GOLDEN_PATH,
    offline: false,
    outDir: REPORTS_DIR,
    models: [],
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--golden' && argv[i + 1]) opts.goldenPath = path.resolve(argv[++i]);
    else if (argv[i] === '--offline') opts.offline = true;
    else if (argv[i] === '--out' && argv[i + 1]) opts.outDir = path.resolve(argv[++i]);
    else if (argv[i] === '--models' && argv[i + 1]) opts.models = parseModelsArg(argv[++i]);
  }
  return opts;
}

/**
 * Cache-Bucket ist pro Modell getrennt (`<setVersion>/<model>`), sonst
 * überschreiben sich Modelle im Vergleichslauf gegenseitig die Case-Dateien
 * (Dateiname = caseId) und jeder Lauf würde live neu messen. Exportiert für Tests.
 */
export function cacheBucketFor(setVersion: string, model: string): string {
  return path.join(setVersion, model.replace(/[^a-zA-Z0-9._-]/g, '_'));
}

async function predictCase(
  c: GoldenCase,
  set: GoldenSet,
  model: string,
  promptHash: string,
  offline: boolean
): Promise<{ predictions: ComplianceMappingCandidate[]; fromCache: boolean }> {
  const key = cacheKeyFor(
    c.fullText,
    c.candidates.map(el => el.id),
    model,
    promptHash,
    sha256(JSON.stringify(c.candidates))
  );
  const bucket = cacheBucketFor(set.version, model);
  const cached = readCache(CACHE_DIR, bucket, c.caseId, key);
  if (cached) return { predictions: cached.predictions, fromCache: true };

  // Migration: Läufe vor S1 lagen flach unter <setVersion>/. Der cacheKey
  // enthält das Modell, daher ist ein Legacy-Hit garantiert modell-korrekt —
  // wir übernehmen ihn in den neuen Bucket statt live neu zu messen.
  const legacy = readCache(CACHE_DIR, set.version, c.caseId, key);
  if (legacy) {
    writeCache(CACHE_DIR, bucket, c.caseId, legacy);
    return { predictions: legacy.predictions, fromCache: true };
  }

  if (offline) {
    throw new Error(
      `--offline: no valid cache for case "${c.caseId}" / model "${model}" ` +
        `(model/prompt/text changed or never run live). Run once without --offline to populate the cache.`
    );
  }

  const { candidates } = await mapTextToElements({
    text: c.fullText,
    source: c.source,
    paragraphNumber: c.paragraphNumber,
    language: c.language,
    jurisdiction: c.jurisdiction,
    candidateElements: toCandidateElements(c),
    model,
  });

  writeCache(CACHE_DIR, bucket, c.caseId, {
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

function ratio(x: number): string {
  return x.toFixed(2);
}

/** "0: 4 · 1: 6 · 5+: 2" — Buckets numerisch sortiert, "<cap>+" ans Ende. */
export function formatDistribution(dist: Record<string, number>): string {
  const entries = Object.entries(dist).sort(([a], [b]) => {
    const na = a.endsWith('+') ? Number.MAX_SAFE_INTEGER : Number(a);
    const nb = b.endsWith('+') ? Number.MAX_SAFE_INTEGER : Number(b);
    return na - nb;
  });
  return entries.map(([bucket, count]) => `${bucket}: ${count}`).join(' · ') || '—';
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
  lines.push('## Conciseness (REQ-EVAL-001.10 / CASCADE_DESIGN.md §4)');
  lines.push('');
  const conc = concisenessMetrics(outcomes, args.cap);
  lines.push('| Metrik | Wert |');
  lines.push('|---|---|');
  lines.push(`| Over-Match-Ratio (Σ predicted / Σ max(1, gold)) | ${ratio(conc.overMatchRatio)} |`);
  lines.push(`| Ø Mappings pro Fall | ${ratio(conc.meanPredictionsPerCase)} |`);
  lines.push(`| Cap-Hit-Rate (Top-N-Cap = ${args.cap}) | ${pct(conc.capHitRate)} |`);
  lines.push(`| Verteilung Mappings/Fall | ${formatDistribution(conc.predictionCountDistribution)} |`);
  lines.push('');
  lines.push('_OMR ≈ 1.0 = sparsam, > 1.3 = Über-Matchen (Alarm-Müdigkeit). Cap-Hits sind_');
  lines.push('_Kandidaten für stille Trunkierung. Weiches Gate — nie isoliert optimieren_');
  lines.push('_(Anti-Goodhart: Conciseness-Gewinne zählen nur bei Recall-Nicht-Unterlegenheit)._');
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

interface ModelRunResult {
  model: string;
  outcomes: CaseOutcome[];
  cacheHits: number;
}

/**
 * Vergleichstabelle über mehrere Modell-Läufe (E1: klein vs. groß) —
 * Correctness (P/R/F2, Empty-Set) UND Conciseness (OMR, Ø, Cap-Hit) nebeneinander,
 * damit "Sonnet ist besser" immer heißt: auf welcher Achse. Exportiert für Tests.
 */
export function buildComparisonTable(runs: ModelRunResult[], cap: number): string {
  const lines: string[] = [];
  lines.push('## Modellvergleich (E1 — Correctness × Conciseness)');
  lines.push('');
  lines.push('| Modell | Precision | Recall | F2 | Empty-Set | OMR | Ø Map/Fall | Cap-Hit |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of runs) {
    const m = aggregateMetrics(r.outcomes);
    const empty = emptySetAccuracy(r.outcomes);
    const conc = concisenessMetrics(r.outcomes, cap);
    lines.push(
      `| \`${r.model}\` | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f2)} | ${pct(empty)} ` +
        `| ${ratio(conc.overMatchRatio)} | ${ratio(conc.meanPredictionsPerCase)} | ${pct(conc.capHitRate)} |`
    );
  }
  lines.push('');
  lines.push('_Leseregel (Anti-Goodhart): erst Recall/F2 vergleichen (Nicht-Unterlegenheit),_');
  lines.push('_dann entscheidet Conciseness (OMR/Empty-Set). Ein Modell, das nur durch_');
  lines.push('_weniger Mappings "gewinnt", aber Recall verliert, ist KEIN Gewinner._');
  return lines.join('\n');
}

async function runForModel(
  set: GoldenSet,
  model: string,
  promptHash: string,
  offline: boolean
): Promise<ModelRunResult> {
  const outcomes: CaseOutcome[] = [];
  let cacheHits = 0;
  for (const c of set.cases) {
    const { predictions, fromCache } = await predictCase(c, set, model, promptHash, offline);
    if (fromCache) cacheHits++;
    outcomes.push({
      caseId: c.caseId,
      source: c.source,
      goldElementIds: c.goldElementIds,
      predicted: predictions.map(p => ({ elementId: p.elementId, confidence: p.confidence })),
    });
    console.log(
      `[eval] ${fromCache ? 'cache' : 'live '} [${model}] ${c.caseId}: ${predictions.length} predictions`
    );
  }
  return { model, outcomes, cacheHits };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const set = loadGoldenSet(opts.goldenPath);
  const models = opts.models.length
    ? opts.models
    : [resolveModel(process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001')];
  const promptHash = sha256(SYSTEM_PROMPT);
  const startedAt = new Date().toISOString();
  const cap = __testExports.MAX_MAPPINGS_PER_REGULATION;

  console.log(`[eval] Golden-Set ${set.version} (${set.cases.length} cases, frozen=${set.frozen})`);
  console.log(
    `[eval] models=${models.join(', ')} promptHash=${promptHash.slice(0, 12)} offline=${opts.offline}`
  );

  fs.mkdirSync(opts.outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const runs: ModelRunResult[] = [];

  for (const model of models) {
    const run = await runForModel(set, model, promptHash, opts.offline);
    runs.push(run);

    const markdown = buildMarkdownReport({
      set,
      model,
      promptHash,
      threshold: __testExports.CONFIDENCE_THRESHOLD,
      cap,
      outcomes: run.outcomes,
      cacheHits: run.cacheHits,
      startedAt,
    });

    const modelSlug = model.replace(/[^a-zA-Z0-9._-]/g, '_');
    const base = path.join(opts.outDir, `mapping-eval-${set.version}-${modelSlug}-${stamp}`);
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
          cap,
          startedAt,
          overall: aggregateMetrics(run.outcomes),
          emptySetAccuracy: emptySetAccuracy(run.outcomes),
          conciseness: concisenessMetrics(run.outcomes, cap),
          bySource: breakdownBySource(run.outcomes),
          confidenceBands: precisionByConfidenceBand(run.outcomes),
          f2CI: bootstrapCI(run.outcomes, o => aggregateMetrics(o).f2),
          recallCI: bootstrapCI(run.outcomes, o => aggregateMetrics(o).recall),
          outcomes: run.outcomes,
        },
        null,
        2
      )
    );

    console.log('\n' + markdown);
    console.log(`\n[eval] Report: ${base}.md / .json`);
  }

  if (runs.length > 1) {
    const comparison = buildComparisonTable(runs, cap);
    const cmpBase = path.join(opts.outDir, `mapping-eval-${set.version}-comparison-${stamp}`);
    fs.writeFileSync(`${cmpBase}.md`, `# Mapping-Eval Modellvergleich — ${set.version}\n\n${comparison}\n`);
    console.log('\n' + comparison);
    console.log(`\n[eval] Vergleich: ${cmpBase}.md`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[eval] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
