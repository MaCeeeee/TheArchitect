/**
 * Judge-Compare-Eval (Spike) — vergleicht Modelle als Law-Applicability-Judge
 * (UC-LAW-002) auf dem Discovery-Golden-Set. Leitfrage: Kann ein lokal
 * betriebenes Modell (z. B. ein deutsches Rechts-Finetune) den Cloud-Judge
 * ersetzen, ohne dass die Qualität messbar leidet? Doku: JUDGE_COMPARE_SPIKE.md
 *
 *   npm run eval:judge-compare -- \
 *     --backend haiku=anthropic:claude-haiku-4-5-20251001 \
 *     --backend gemma-law=local:DomainLLM/gemma-3-12b-it-german-law-finetuned@http://localhost:8000
 *
 *   Optionen: --candidates all|gated  --offline  --golden <path>  --out <dir>
 *             --cache-dir <dir>  --threshold 0.3  --max-judge 5
 *             --json-mode json_object|none  --timeout-ms 120000  --limit-cases <n>
 *
 * Design:
 * - Der ERSTE Backend ist die Referenz; jeder weitere wird gepaart gegen ihn
 *   verglichen (gleiche Aufgaben, gepaarter Bootstrap auf ΔF2, McNemar).
 * - `--candidates all` (Default): jeder Case × JEDE Korpus-Familie — misst
 *   den Judge isoliert vom Retrieval (keine Gold-Familie fällt vorher raus).
 *   `--candidates gated`: nur was in Prod den Judge erreicht (Retrieval-Gate).
 * - Läuft exakt durch den Prod-Judge `judgeCandidate` (Prompt, Zod, Retry,
 *   Sanitizing) — lokale Modelle über den OpenAI-kompatiblen Shim.
 * - Verdicts werden je Backend als Datei gecacht → Läufe sind resumierbar und
 *   mit `--offline` ohne Netz/GPU reproduzierbar.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import {
  loadDiscoveryGoldenSet,
  loadFixtureCorpus,
  DEFAULT_DISCOVERY_GOLDEN_PATH,
  type DiscoveryGoldenSet,
  type FixtureCorpus,
} from './discoveryGolden';
import { readQueriesFile, DEFAULT_QUERIES_PATH, type QueriesFile } from '../scripts/build-discovery-eval-vectors';
import { aggregateHitsToCandidates, gateCandidatesForJudge } from '../services/lawDiscovery.service';
import { judgeCandidate, LAW_JUDGE_PROMPT_VERSION_HASH, type JudgeCandidateArgs } from '../services/lawJudge.service';
import type { LawJudgeCandidate } from '../prompts/lawJudge.prompt';
import type { LawJudgeVerdict } from '@thearchitect/shared';
import {
  aggregateMetrics,
  calibrationSamplesFromOutcomes,
  cohenKappa,
  expectedCalibrationError,
  type CaseOutcome,
  type ConfidenceInterval,
  type PairLabel,
} from './metrics';
import { assertVectorsPresent, bootstrapDeltaCI, perFamilyBreakdown, topKByCosine } from './runDiscoveryEval';
import {
  createBackendClient,
  emptyUsage,
  instrumentClient,
  parseBackendSpec,
  type JsonMode,
  type JudgeBackendSpec,
  type UsageStats,
} from './judgeBackends';

const REPORTS_DIR = path.join(__dirname, 'reports');
const DEFAULT_CACHE_DIR = path.join(__dirname, 'cache', 'judge-compare');
const DEFAULT_REFERENCE = 'haiku=anthropic:claude-haiku-4-5-20251001';

// ─── Aufgaben (Case × Familie) ──────────────────────────────────────

export type CandidateMode = 'all' | 'gated';

export interface JudgeTask {
  caseId: string;
  family: string;
  gold: boolean;
  ambiguous: boolean;
  profileText: string;
  candidate: LawJudgeCandidate;
}

export interface BuildTasksResult {
  tasks: JudgeTask[];
  /** Nur `gated`: Gold-Familien, die das Retrieval-Gate nie an den Judge gibt. */
  missedAtRetrieval: Array<{ caseId: string; family: string }>;
}

/**
 * PURE: baut die Judge-Aufgaben mit der Prod-Aggregation (aggregateHitsToCandidates).
 * Ranking über den GESAMTEN Fixture-Korpus (topK = #Paragraphen), damit jede
 * Familie einen echten retrievalScore + topHits bekommt.
 */
export function buildJudgeTasks(
  golden: DiscoveryGoldenSet,
  corpus: FixtureCorpus,
  queries: QueriesFile,
  opts: { mode: CandidateMode; threshold: number; maxJudge: number },
): BuildTasksResult {
  const byCaseId = new Map(queries.queries.map(q => [q.caseId, q]));
  const tasks: JudgeTask[] = [];
  const missedAtRetrieval: BuildTasksResult['missedAtRetrieval'] = [];

  for (const c of golden.cases) {
    const vector = byCaseId.get(c.caseId)?.baselineVector;
    if (!vector) throw new Error(`case "${c.caseId}" has no baselineVector`);
    const hits = topKByCosine(vector, corpus.paragraphs, corpus.paragraphs.length);
    const all = aggregateHitsToCandidates(hits);
    const selected = opts.mode === 'gated' ? gateCandidatesForJudge(all, opts.threshold, opts.maxJudge) : all;
    const selectedFamilies = new Set(selected.map(s => s.family));
    for (const f of c.goldFamilies) {
      if (!selectedFamilies.has(f)) missedAtRetrieval.push({ caseId: c.caseId, family: f });
    }
    for (const cand of selected) {
      tasks.push({
        caseId: c.caseId,
        family: cand.family,
        gold: c.goldFamilies.includes(cand.family),
        ambiguous: c.ambiguous,
        profileText: c.profileText,
        candidate: {
          family: cand.family,
          sources: cand.sources,
          jurisdiction: cand.jurisdiction,
          // Wie Prod (lawDiscovery.service discoverAndJudge): nur Key + Titel, kein Snippet.
          topHits: cand.topHits.map(h => ({ regulationKey: h.regulationKey, title: h.title })),
          retrievalScore: cand.score,
        },
      });
    }
  }
  return { tasks, missedAtRetrieval };
}

// ─── Entscheidungen + Cache ─────────────────────────────────────────

export interface JudgeDecision {
  caseId: string;
  family: string;
  gold: boolean;
  ambiguous: boolean;
  /** null = Fehler (Schema-Bruch nach Retry, Timeout, offline ohne Cache). */
  applies: boolean | null;
  confidence: number | null;
  reasoning: string;
  latencyMs: number | null;
  fromCache: boolean;
  error?: string;
}

interface CachedVerdict {
  cacheKey: string;
  backendId: string;
  model: string;
  applies: boolean;
  confidence: number;
  reasoning: string;
  latencyMs: number;
  cachedAt: string;
}

export function taskCacheKey(spec: JudgeBackendSpec, task: JudgeTask): string {
  return createHash('sha256')
    .update(
      [
        task.profileText,
        task.family,
        spec.kind,
        spec.model,
        spec.baseUrl ?? '',
        LAW_JUDGE_PROMPT_VERSION_HASH,
        JSON.stringify(task.candidate),
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

function safeSegment(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, '_');
}

function cacheFile(cacheDir: string, spec: JudgeBackendSpec, task: JudgeTask): string {
  return path.join(cacheDir, safeSegment(spec.id), `${safeSegment(task.caseId)}__${safeSegment(task.family)}.json`);
}

function readCached(file: string, key: string): CachedVerdict | null {
  if (!fs.existsSync(file)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8')) as CachedVerdict;
    return c.cacheKey === key ? c : null;
  } catch {
    return null;
  }
}

/**
 * Modell-Kennung, die `judgeCandidate` sieht. Für Anthropic die echte Model-Id
 * (geht in den API-Call). Für lokale Backends ignoriert der Shim den Wert —
 * er dient nur als eindeutiger In-Process-Cache-/Trace-Key (Modell + URL).
 */
export function judgeModelId(spec: JudgeBackendSpec): string {
  return spec.kind === 'anthropic' ? spec.model : `local:${spec.model}@${spec.baseUrl}`;
}

export type JudgeFn = (args: JudgeCandidateArgs) => Promise<LawJudgeVerdict>;

export interface RunBackendOptions {
  offline: boolean;
  cacheDir: string;
  /** Instrumentierter Client; im Offline-Modus nicht nötig. */
  client?: Anthropic;
  judge?: JudgeFn;
  onProgress?: (done: number, total: number) => void;
}

export async function runBackend(
  spec: JudgeBackendSpec,
  tasks: JudgeTask[],
  opts: RunBackendOptions,
): Promise<JudgeDecision[]> {
  const judge = opts.judge ?? judgeCandidate;
  const decisions: JudgeDecision[] = [];
  let done = 0;
  for (const task of tasks) {
    const base = { caseId: task.caseId, family: task.family, gold: task.gold, ambiguous: task.ambiguous };
    const key = taskCacheKey(spec, task);
    const file = cacheFile(opts.cacheDir, spec, task);
    const cached = readCached(file, key);
    if (cached) {
      decisions.push({ ...base, applies: cached.applies, confidence: cached.confidence, reasoning: cached.reasoning, latencyMs: cached.latencyMs, fromCache: true });
    } else if (opts.offline || !opts.client) {
      decisions.push({ ...base, applies: null, confidence: null, reasoning: '', latencyMs: null, fromCache: false, error: 'not cached (offline)' });
    } else {
      const startedAt = Date.now();
      try {
        const verdict = await judge({
          profileText: task.profileText,
          profileElements: [],
          candidate: task.candidate,
          projectId: `eval:${task.caseId}`,
          // Backend-Id im Key: judgeCandidate hat einen In-Process-Cache über
          // (Profil, Familie, corpusVersionHash, Modell). Zwei Backends mit
          // DEMSELBEN Modell (z. B. Rauschgrenzen-Lauf haiku vs. haiku-run2)
          // bekämen sonst im selben Prozess die Verdicts des ersten zurück.
          corpusVersionHash: `eval:${spec.id}:${task.caseId}:${task.family}`,
          model: judgeModelId(spec),
          anthropicClient: opts.client,
        });
        const latencyMs = Date.now() - startedAt;
        decisions.push({ ...base, applies: verdict.applies, confidence: verdict.confidence, reasoning: verdict.reasoning, latencyMs, fromCache: false });
        const entry: CachedVerdict = {
          cacheKey: key,
          backendId: spec.id,
          model: spec.model,
          applies: verdict.applies,
          confidence: verdict.confidence,
          reasoning: verdict.reasoning,
          latencyMs,
          cachedAt: new Date().toISOString(),
        };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(entry, null, 2));
      } catch (err) {
        // Fehler werden NICHT gecacht → nächster Lauf versucht es erneut.
        decisions.push({ ...base, applies: null, confidence: null, reasoning: '', latencyMs: Date.now() - startedAt, fromCache: false, error: (err as Error).message.slice(0, 200) });
      }
    }
    done++;
    opts.onProgress?.(done, tasks.length);
  }
  return decisions;
}

// ─── Metriken ───────────────────────────────────────────────────────

/**
 * Judge-Sicht als CaseOutcome je Case: Gold = Gold-Familien UNTER den
 * Aufgaben (was der Judge gar nicht sah, zählt hier nicht — das ist
 * Retrieval-Verlust und wird separat ausgewiesen). Fehler = keine Vorhersage
 * (wie Prod: ein fehlgeschlagener Judge-Call meldet kein Gesetz).
 */
export function decisionsToOutcomes(decisions: JudgeDecision[]): CaseOutcome[] {
  const byCase = new Map<string, JudgeDecision[]>();
  for (const d of decisions) {
    const list = byCase.get(d.caseId);
    if (list) list.push(d);
    else byCase.set(d.caseId, [d]);
  }
  return [...byCase.entries()].map(([caseId, ds]) => ({
    caseId,
    source: 'judge-compare',
    goldElementIds: ds.filter(d => d.gold).map(d => d.family),
    predicted: ds.filter(d => d.applies === true).map(d => ({ elementId: d.family, confidence: d.confidence ?? 0 })),
  }));
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

function label(applies: boolean | null): PairLabel {
  return applies === true ? 'match' : 'no-match';
}

export interface BackendMetrics {
  n: number;
  errors: number;
  errorRate: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f2: number;
  specificity: number;
  accuracy: number;
  kappaVsGold: number | null;
  ece: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
}

export function computeBackendMetrics(decisions: JudgeDecision[]): BackendMetrics {
  const n = decisions.length;
  const errors = decisions.filter(d => d.applies === null).length;
  const outcomes = decisionsToOutcomes(decisions);
  const m = aggregateMetrics(outcomes);
  const tn = decisions.filter(d => !d.gold && d.applies !== true).length;
  const ece = expectedCalibrationError(calibrationSamplesFromOutcomes(outcomes)).ece;
  const latencies = decisions
    .filter(d => d.applies !== null && !d.fromCache && d.latencyMs !== null)
    .map(d => d.latencyMs as number)
    .sort((a, b) => a - b);
  const cachedLatencies = decisions
    .filter(d => d.applies !== null && d.latencyMs !== null)
    .map(d => d.latencyMs as number)
    .sort((a, b) => a - b);
  // Gecachte Latenzen stammen aus dem Originallauf — nur nutzen, wenn alles aus dem Cache kam.
  const lat = latencies.length > 0 ? latencies : cachedLatencies;
  return {
    n,
    errors,
    errorRate: n === 0 ? 0 : errors / n,
    tp: m.tp,
    fp: m.fp,
    fn: m.fn,
    tn,
    precision: m.precision,
    recall: m.recall,
    f2: m.f2,
    specificity: tn + m.fp === 0 ? 0 : tn / (tn + m.fp),
    accuracy: n === 0 ? 0 : (m.tp + tn) / n,
    kappaVsGold: n === 0 ? null : cohenKappa(decisions.map(d => label(d.gold)), decisions.map(d => label(d.applies))),
    ece,
    latencyP50Ms: quantile(lat, 0.5),
    latencyP95Ms: quantile(lat, 0.95),
  };
}

/** Exakter zweiseitiger McNemar-Test (Binomial, p=0.5) auf die diskordanten Paare. */
export function mcnemarExactP(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  // P(X ≤ k) für X ~ Bin(n, 0.5), iterativ ohne Überlauf.
  let term = Math.pow(0.5, n); // C(n,0)·0.5^n
  let cdf = term;
  for (let i = 1; i <= k; i++) {
    term = (term * (n - i + 1)) / i;
    cdf += term;
  }
  return Math.min(1, 2 * cdf);
}

export interface PairwiseComparison {
  referenceId: string;
  candidateId: string;
  agreement: number;
  kappa: number | null;
  deltaPrecision: number;
  deltaRecall: number;
  deltaF2: number;
  deltaF2CI: ConfidenceInterval;
  /** b = Referenz richtig & Kandidat falsch; c = umgekehrt. */
  mcnemar: { b: number; c: number; pValue: number };
}

function taskKey(d: { caseId: string; family: string }): string {
  return `${d.caseId}|${d.family}`;
}

export function compareBackends(
  referenceId: string,
  reference: JudgeDecision[],
  candidateId: string,
  candidate: JudgeDecision[],
): PairwiseComparison {
  const candByKey = new Map(candidate.map(d => [taskKey(d), d]));
  const pairs = reference.map(r => {
    const c = candByKey.get(taskKey(r));
    if (!c) throw new Error(`compareBackends: task ${taskKey(r)} missing for "${candidateId}"`);
    return [r, c] as const;
  });
  let agree = 0;
  let b = 0;
  let cc = 0;
  for (const [r, c] of pairs) {
    if ((r.applies === true) === (c.applies === true)) agree++;
    const rOk = (r.applies === true) === r.gold;
    const cOk = (c.applies === true) === c.gold;
    if (rOk && !cOk) b++;
    if (!rOk && cOk) cc++;
  }
  const refM = aggregateMetrics(decisionsToOutcomes(reference));
  const candM = aggregateMetrics(decisionsToOutcomes(candidate));
  // Gepaarter Bootstrap über CASES (Cluster) — gleiche Reihenfolge in beiden Arrays.
  const refOutcomes = decisionsToOutcomes(reference);
  const candByCase = new Map(decisionsToOutcomes(candidate).map(o => [o.caseId, o]));
  const candOutcomes = refOutcomes.map(o => candByCase.get(o.caseId) as CaseOutcome);
  return {
    referenceId,
    candidateId,
    agreement: pairs.length === 0 ? 0 : agree / pairs.length,
    kappa: pairs.length === 0 ? null : cohenKappa(pairs.map(([r]) => label(r.applies)), pairs.map(([, c]) => label(c.applies))),
    deltaPrecision: candM.precision - refM.precision,
    deltaRecall: candM.recall - refM.recall,
    deltaF2: candM.f2 - refM.f2,
    deltaF2CI: bootstrapDeltaCI(refOutcomes, candOutcomes, o => aggregateMetrics(o).f2),
    mcnemar: { b, c: cc, pValue: mcnemarExactP(b, cc) },
  };
}

// ─── Go/No-Go-Gate (VOR dem Lauf festgelegt, siehe JUDGE_COMPARE_SPIKE.md) ─

export interface GateCriteria {
  /** Max. Anteil Fehler (Schema-Bruch nach Retry, Timeout). */
  maxErrorRate: number;
  /** Max. erlaubter Precision-Verlust ggü. Referenz (Prompt: Precision > Recall). */
  maxPrecisionDrop: number;
  /** Nicht-Unterlegenheits-Marge auf F2 (untere CI-Grenze von ΔF2). */
  nonInferiorityMarginF2: number;
}

export const DEFAULT_GATE: GateCriteria = { maxErrorRate: 0.05, maxPrecisionDrop: 0.05, nonInferiorityMarginF2: 0.1 };

export type GateVerdict = 'GO' | 'NO-GO' | 'INCONCLUSIVE';

export function gateVerdict(
  candidate: BackendMetrics,
  cmp: PairwiseComparison,
  gate: GateCriteria = DEFAULT_GATE,
): { verdict: GateVerdict; reasons: string[] } {
  const reasons: string[] = [];
  let hardFail = false;
  if (candidate.errorRate > gate.maxErrorRate) {
    hardFail = true;
    reasons.push(`error rate ${pct(candidate.errorRate)} > ${pct(gate.maxErrorRate)}`);
  }
  if (cmp.deltaPrecision < -gate.maxPrecisionDrop) {
    hardFail = true;
    reasons.push(`precision drop ${pp(cmp.deltaPrecision)} exceeds −${pp(gate.maxPrecisionDrop)}`);
  }
  if (cmp.deltaF2CI.hi < -gate.nonInferiorityMarginF2) {
    hardFail = true;
    reasons.push(`ΔF2 CI entirely below −${pp(gate.nonInferiorityMarginF2)} (inferior)`);
  }
  if (hardFail) return { verdict: 'NO-GO', reasons };
  if (cmp.deltaF2CI.lo >= -gate.nonInferiorityMarginF2) {
    reasons.push(`ΔF2 CI lower bound ${pp(cmp.deltaF2CI.lo)} ≥ −${pp(gate.nonInferiorityMarginF2)} (non-inferior)`);
    return { verdict: 'GO', reasons };
  }
  reasons.push(`ΔF2 CI [${pp(cmp.deltaF2CI.lo)}, ${pp(cmp.deltaF2CI.hi)}] straddles −${pp(gate.nonInferiorityMarginF2)} — more cases needed`);
  return { verdict: 'INCONCLUSIVE', reasons };
}

// ─── Report ─────────────────────────────────────────────────────────

function pct(x: number | null): string {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}

function pp(x: number): string {
  return `${(x * 100).toFixed(1)}pp`;
}

function ms(x: number | null): string {
  return x === null ? 'n/a' : x >= 1000 ? `${(x / 1000).toFixed(1)}s` : `${Math.round(x)}ms`;
}

function verdictCell(d: JudgeDecision | undefined): string {
  if (!d) return '—';
  if (d.applies === null) return '⚠️ error';
  return `${d.applies ? 'applies' : 'no'} (${(d.confidence ?? 0).toFixed(2)})`;
}

export interface BackendRun {
  spec: JudgeBackendSpec;
  decisions: JudgeDecision[];
  metrics: BackendMetrics;
  usage: UsageStats;
}

export interface CompareReportArgs {
  golden: DiscoveryGoldenSet;
  startedAt: string;
  mode: CandidateMode;
  tasks: JudgeTask[];
  missedAtRetrieval: BuildTasksResult['missedAtRetrieval'];
  runs: BackendRun[];
  comparisons: Array<PairwiseComparison & { gate: { verdict: GateVerdict; reasons: string[] } }>;
  gate: GateCriteria;
  maxDisagreements?: number;
}

export function buildCompareReport(args: CompareReportArgs): string {
  const { golden, runs, tasks } = args;
  const positives = tasks.filter(t => t.gold).length;
  const caseCount = new Set(tasks.map(t => t.caseId)).size;
  const lines: string[] = [];
  lines.push(`# Judge-Compare Report — Golden-Set ${golden.version}`);
  lines.push('');
  if (!golden.frozen) {
    lines.push('> ⚠️ **PRELIMINARY — golden set not yet owner-approved** (`frozen: false`). Development values, not a baseline.');
    lines.push('');
  }
  if (caseCount < 30) {
    lines.push(`> ⚠️ **Small sample** (${caseCount} cases): confidence intervals are wide — treat GO/NO-GO as a directional signal.`);
    lines.push('');
  }
  lines.push(`- Date: ${args.startedAt} · Candidate mode: \`${args.mode}\` · Judge tasks: ${tasks.length} (${positives} gold-positive) over ${caseCount} cases`);
  lines.push(`- Reference: **${runs[0]?.spec.id ?? 'n/a'}** · Prompt hash: \`${LAW_JUDGE_PROMPT_VERSION_HASH.slice(0, 12)}\``);
  if (args.mode === 'gated') {
    lines.push(`- Gold families never reaching the judge (retrieval loss, not judge loss): ${args.missedAtRetrieval.length}`);
  }
  lines.push('');

  lines.push('## Per-backend metrics (judge view)');
  lines.push('');
  lines.push('| Backend | Model | Precision | Recall | F2 | Specificity | κ vs gold | ECE | Errors | Latency p50 / p95 | API calls (incl. retries) | Tokens in / out |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of runs) {
    const m = r.metrics;
    lines.push(
      `| **${r.spec.id}** | \`${r.spec.model}\` | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f2)} | ${pct(m.specificity)} | ${m.kappaVsGold === null ? 'n/a' : m.kappaVsGold.toFixed(2)} | ${m.ece.toFixed(3)} | ${m.errors} (${pct(m.errorRate)}) | ${ms(m.latencyP50Ms)} / ${ms(m.latencyP95Ms)} | ${r.usage.apiCalls} | ${r.usage.inputTokens} / ${r.usage.outputTokens} |`,
    );
  }
  lines.push('');
  lines.push('_API calls and tokens count only live calls of this run (0 when everything came from the cache)._');
  lines.push('');

  if (args.comparisons.length > 0) {
    lines.push(`## Paired comparison vs. reference (${runs[0].spec.id})`);
    lines.push('');
    lines.push(
      `Gate (fixed before the run): error rate ≤ ${pct(args.gate.maxErrorRate)} · precision drop ≤ ${pp(args.gate.maxPrecisionDrop)} · ΔF2 95%-CI lower bound ≥ −${pp(args.gate.nonInferiorityMarginF2)}`,
    );
    lines.push('');
    lines.push('| Candidate | Agreement | κ vs ref | ΔPrecision | ΔRecall | **ΔF2** (95%-CI) | McNemar b / c (p) | **Gate** |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const c of args.comparisons) {
      lines.push(
        `| ${c.candidateId} | ${pct(c.agreement)} | ${c.kappa === null ? 'n/a' : c.kappa.toFixed(2)} | ${pp(c.deltaPrecision)} | ${pp(c.deltaRecall)} | **${pp(c.deltaF2)}** (${pp(c.deltaF2CI.lo)} – ${pp(c.deltaF2CI.hi)}) | ${c.mcnemar.b} / ${c.mcnemar.c} (${c.mcnemar.pValue.toFixed(3)}) | **${c.gate.verdict}** |`,
      );
    }
    lines.push('');
    for (const c of args.comparisons) {
      lines.push(`- **${c.candidateId} → ${c.gate.verdict}:** ${c.gate.reasons.join('; ')}`);
    }
    lines.push('');
  }

  lines.push('## Per-family F2 (judge view)');
  lines.push('');
  const breakdowns = runs.map(r => perFamilyBreakdown(decisionsToOutcomes(r.decisions)));
  const families = [...new Set(tasks.map(t => t.family))].sort();
  lines.push(`| Family | Gold-positive tasks | ${runs.map(r => r.spec.id).join(' | ')} |`);
  lines.push(`|---|---|${runs.map(() => '---').join('|')}|`);
  for (const f of families) {
    const gp = tasks.filter(t => t.family === f && t.gold).length;
    const cells = breakdowns.map(b => (b[f] ? `${pct(b[f].f2)} (${b[f].tp}/${b[f].fp}/${b[f].fn})` : '—'));
    lines.push(`| ${f} | ${gp} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('_Cells: F2 (TP/FP/FN)._');
  lines.push('');

  if (runs.length >= 2) {
    const maxRows = args.maxDisagreements ?? 30;
    const ref = runs[0];
    const others = runs.slice(1);
    const byKey = others.map(o => new Map(o.decisions.map(d => [taskKey(d), d])));
    const rows = ref.decisions.filter((d, _i) =>
      byKey.some(m => (m.get(taskKey(d))?.applies === true) !== (d.applies === true)),
    );
    lines.push(`## Disagreements with the reference (${rows.length}, showing up to ${maxRows})`);
    lines.push('');
    if (rows.length === 0) {
      lines.push('All backends agree on every task.');
    } else {
      lines.push(`| Case | Family | Gold | ${ref.spec.id} | ${others.map(o => o.spec.id).join(' | ')} | Reasoning (${others[0].spec.id}) |`);
      lines.push(`|---|---|---|---|${others.map(() => '---').join('|')}|---|`);
      for (const d of rows.slice(0, maxRows)) {
        const otherDs = byKey.map(m => m.get(taskKey(d)));
        const reasoning = (otherDs[0]?.reasoning || otherDs[0]?.error || '').replace(/\|/g, '/').slice(0, 160);
        lines.push(
          `| \`${d.caseId}\`${d.ambiguous ? ' (ambiguous)' : ''} | ${d.family} | ${d.gold ? '✅' : '—'} | ${verdictCell(d)} | ${otherDs.map(verdictCell).join(' | ')} | ${reasoning} |`,
        );
      }
    }
    lines.push('');
  }

  lines.push('_Judge view: gold = gold families among the judged tasks. Errors count as "no verdict" (as in prod). ECE over `applies: true` verdicts._');
  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────

export interface CompareCliOptions {
  backends: JudgeBackendSpec[];
  mode: CandidateMode;
  goldenPath: string;
  offline: boolean;
  outDir: string;
  cacheDir: string;
  threshold: number;
  maxJudge: number;
  jsonMode: JsonMode;
  timeoutMs: number;
  limitCases: number | null;
}

export function parseCompareArgs(argv: string[]): CompareCliOptions {
  const rawBackends: string[] = [];
  const opts: CompareCliOptions = {
    backends: [],
    mode: 'all',
    goldenPath: DEFAULT_DISCOVERY_GOLDEN_PATH,
    offline: false,
    outDir: REPORTS_DIR,
    cacheDir: DEFAULT_CACHE_DIR,
    threshold: 0.3,
    maxJudge: 5,
    jsonMode: 'json_object',
    timeoutMs: 120_000,
    limitCases: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--backend' && next) {
      rawBackends.push(next);
      i++;
    } else if (a === '--candidates' && next) {
      if (next !== 'all' && next !== 'gated') throw new Error(`--candidates must be all|gated, got "${next}"`);
      opts.mode = next;
      i++;
    } else if (a === '--golden' && next) {
      opts.goldenPath = path.resolve(next);
      i++;
    } else if (a === '--offline') opts.offline = true;
    else if (a === '--out' && next) {
      opts.outDir = path.resolve(next);
      i++;
    } else if (a === '--cache-dir' && next) {
      opts.cacheDir = path.resolve(next);
      i++;
    } else if (a === '--threshold' && next) {
      opts.threshold = Number(next);
      i++;
    } else if (a === '--max-judge' && next) {
      opts.maxJudge = Number(next);
      i++;
    } else if (a === '--json-mode' && next) {
      if (next !== 'json_object' && next !== 'none') throw new Error(`--json-mode must be json_object|none, got "${next}"`);
      opts.jsonMode = next;
      i++;
    } else if (a === '--timeout-ms' && next) {
      opts.timeoutMs = Number(next);
      i++;
    } else if (a === '--limit-cases' && next) {
      opts.limitCases = Number(next);
      i++;
    }
  }
  opts.backends = (rawBackends.length > 0 ? rawBackends : [DEFAULT_REFERENCE]).map(parseBackendSpec);
  const ids = opts.backends.map(b => b.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`duplicate backend label "${dup}" — prefix specs with distinct "label="`);
  return opts;
}

async function main(): Promise<void> {
  const opts = parseCompareArgs(process.argv.slice(2));
  const fullGolden = loadDiscoveryGoldenSet(opts.goldenPath);
  const golden: DiscoveryGoldenSet =
    opts.limitCases !== null ? { ...fullGolden, cases: fullGolden.cases.slice(0, opts.limitCases) } : fullGolden;
  const corpus = loadFixtureCorpus();
  const queries = readQueriesFile(DEFAULT_QUERIES_PATH);
  assertVectorsPresent(corpus, golden, queries, { hyde: false });

  const { tasks, missedAtRetrieval } = buildJudgeTasks(golden, corpus, queries as QueriesFile, {
    mode: opts.mode,
    threshold: opts.threshold,
    maxJudge: opts.maxJudge,
  });
  console.log(`[eval:judge-compare] ${tasks.length} judge tasks (${opts.mode}) × ${opts.backends.length} backend(s)`);

  const runs: BackendRun[] = [];
  for (const spec of opts.backends) {
    const usage = emptyUsage();
    const client = opts.offline
      ? undefined
      : instrumentClient(createBackendClient(spec, { jsonMode: opts.jsonMode, timeoutMs: opts.timeoutMs }), usage);
    const decisions = await runBackend(spec, tasks, {
      offline: opts.offline,
      cacheDir: opts.cacheDir,
      client,
      onProgress: (done, total) => {
        if (done % 10 === 0 || done === total) console.log(`[eval:judge-compare] ${spec.id}: ${done}/${total}`);
      },
    });
    const errors = decisions.filter(d => d.error);
    if (errors.length > 0) {
      console.warn(`[eval:judge-compare] ${spec.id}: ${errors.length} error(s), e.g. ${errors[0].caseId}/${errors[0].family}: ${errors[0].error}`);
    }
    runs.push({ spec, decisions, metrics: computeBackendMetrics(decisions), usage });
  }

  const comparisons = runs.slice(1).map(r => {
    const cmp = compareBackends(runs[0].spec.id, runs[0].decisions, r.spec.id, r.decisions);
    return { ...cmp, gate: gateVerdict(r.metrics, cmp, DEFAULT_GATE) };
  });

  const startedAt = new Date().toISOString();
  const markdown = buildCompareReport({ golden, startedAt, mode: opts.mode, tasks, missedAtRetrieval, runs, comparisons, gate: DEFAULT_GATE });

  fs.mkdirSync(opts.outDir, { recursive: true });
  const base = path.join(opts.outDir, `judge-compare-${startedAt.replace(/[:.]/g, '-')}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify(
      {
        goldenSetVersion: golden.version,
        frozen: golden.frozen,
        startedAt,
        mode: opts.mode,
        promptVersionHash: LAW_JUDGE_PROMPT_VERSION_HASH,
        gate: DEFAULT_GATE,
        backends: runs.map(r => ({ spec: r.spec, metrics: r.metrics, usage: r.usage, decisions: r.decisions })),
        comparisons,
        missedAtRetrieval,
      },
      null,
      2,
    ),
  );
  console.log('\n' + markdown);
  console.log(`\n[eval:judge-compare] Report: ${base}.md / .json`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[eval:judge-compare] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
