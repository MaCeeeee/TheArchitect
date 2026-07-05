/**
 * Eskalations-Eval (THE-401 S3) — misst die selektive Kaskade: Generator ×N
 * (Shuffle) → Self-Consistency-Routing → Judge NUR auf die wackeligen Vorschläge.
 *
 *   COMPLIANCE_MAX_MAPPINGS=12 npm run eval:escalation
 *   COMPLIANCE_MAX_MAPPINGS=12 npm run eval:escalation -- --runs 3 --gen-model haiku --judge-model sonnet
 *   npm run eval:escalation -- --offline
 *
 * Empirischer Auftrag (EVAL_BASELINE.md): der Full-Judge kostete Recall (TP-Damage
 * 23 %), weil er auch stabile, sichere Vorschläge prüft. S3 schützt die stabilen
 * (keep) und schickt nur die order-instabilen / mittel-sicheren an den Judge —
 * Ziel: F2 der Kaskade halten/heben bei WENIGER Judge-Calls.
 *
 * Linear: THE-401 S3 · Epic THE-378
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapTextToElements,
  __testExports,
  type ComplianceMappingCandidate,
} from '../services/complianceMapping.service';
import { judgeMappings, applyJudgeVerdicts, JUDGE_PROMPT_VERSION_HASH, type JudgeResponse } from '../services/complianceJudge.service';
import { routeAll, DEFAULT_THRESHOLDS, type RoutingResult } from '../services/escalation.service';
import { buildSystemPrompt } from '../prompts/complianceMapping.prompt';
import { sha256, cacheKeyFor, readCache, writeCache } from './predictionCache';
import { loadGoldenSet, toCandidateElements, type GoldenCase, type GoldenSet } from './goldenSet';
import { resolveModel, cacheBucketFor } from './runMappingEval';
import { seededShuffle, seedFromString } from './consistency';
import { aggregateMetrics, emptySetAccuracy, concisenessMetrics, type CaseOutcome } from './metrics';

const CACHE_DIR = path.join(__dirname, 'cache');
const REPORTS_DIR = path.join(__dirname, 'reports');
const DEFAULT_GOLDEN = path.join(__dirname, 'golden', 'mapping.req-self-v1.json');

interface CliOptions {
  goldenPath: string;
  genModel: string;
  judgeModel: string;
  runs: number;
  offline: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    goldenPath: DEFAULT_GOLDEN,
    genModel: resolveModel('haiku'),
    judgeModel: resolveModel('sonnet'),
    runs: 3,
    offline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--golden' && argv[i + 1]) opts.goldenPath = path.resolve(argv[++i]);
    else if (argv[i] === '--gen-model' && argv[i + 1]) opts.genModel = resolveModel(argv[++i]);
    else if (argv[i] === '--judge-model' && argv[i + 1]) opts.judgeModel = resolveModel(argv[++i]);
    else if (argv[i] === '--runs' && argv[i + 1]) opts.runs = Math.max(1, Number(argv[++i]) || 3);
    else if (argv[i] === '--offline') opts.offline = true;
  }
  return opts;
}

/** Generator-Lauf mit gegebener Kandidaten-Reihenfolge (run 0 = identisch). */
async function generatorRun(
  c: GoldenCase,
  orderedCandidates: GoldenCase['candidates'],
  set: GoldenSet,
  model: string,
  promptHash: string,
  offline: boolean
): Promise<ComplianceMappingCandidate[]> {
  const inputsHash = sha256(
    JSON.stringify(orderedCandidates) +
      `|cap=${__testExports.MAX_MAPPINGS_PER_REGULATION}|thr=${__testExports.CONFIDENCE_THRESHOLD}`
  );
  const key = cacheKeyFor(c.fullText, orderedCandidates.map(el => el.id), model, promptHash, inputsHash);
  const bucket = cacheBucketFor(set.version, model);
  const caseKey = `${c.caseId}__${sha256(orderedCandidates.map(e => e.id).join(',')).slice(0, 8)}`;
  const cached = readCache(CACHE_DIR, bucket, caseKey, key);
  if (cached) return cached.predictions;
  if (offline) throw new Error(`--offline: kein Generator-Cache für "${caseKey}" (${model})`);

  const shuffled: GoldenCase = { ...c, candidates: orderedCandidates };
  const { candidates } = await mapTextToElements({
    text: c.fullText,
    source: c.source,
    paragraphNumber: c.paragraphNumber,
    language: c.language,
    jurisdiction: c.jurisdiction,
    candidateElements: toCandidateElements(shuffled),
    model,
  });
  writeCache(CACHE_DIR, bucket, caseKey, {
    cacheKey: key,
    model,
    promptHash,
    textHash: sha256(c.fullText),
    predictions: candidates,
    cachedAt: new Date().toISOString(),
  });
  return candidates;
}

// Judge-Cache (wie runJudgeEval, aber Key über die ESKALIERTE Proposal-Menge)
function judgeCachePath(bucket: string, caseId: string): string {
  return path.join(CACHE_DIR, bucket, `${caseId}.judge.json`);
}
function readJudge(bucket: string, caseId: string, key: string): JudgeResponse | null {
  const p = judgeCachePath(bucket, caseId);
  if (!fs.existsSync(p)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(p, 'utf8')) as { cacheKey: string; judge: JudgeResponse };
    return c.cacheKey === key ? c.judge : null;
  } catch {
    return null;
  }
}
function writeJudge(bucket: string, caseId: string, key: string, judge: JudgeResponse): void {
  fs.mkdirSync(path.dirname(judgeCachePath(bucket, caseId)), { recursive: true });
  fs.writeFileSync(judgeCachePath(bucket, caseId), JSON.stringify({ cacheKey: key, judge }, null, 2));
}

function pct(x: number | null): string {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const set = loadGoldenSet(opts.goldenPath);
  const cap = __testExports.MAX_MAPPINGS_PER_REGULATION;
  const genPromptHash = sha256(buildSystemPrompt(cap));
  const startedAt = new Date().toISOString();

  console.log(`[escalation] Golden ${set.version} (${set.cases.length} cases) · runs=${opts.runs}`);
  console.log(`[escalation] generator=${opts.genModel} (cap=${cap}) · judge=${opts.judgeModel}`);
  console.log(`[escalation] Schwellen: keep≥${DEFAULT_THRESHOLDS.keepConsistency}@conf≥${DEFAULT_THRESHOLDS.keepConfidence} · drop≤${DEFAULT_THRESHOLDS.dropMaxOccurrences}@conf<${DEFAULT_THRESHOLDS.dropConfidence}`);

  const genOutcomes: CaseOutcome[] = []; // run 0 (kanonisch) — Generator-Baseline
  const escOutcomes: CaseOutcome[] = []; // selektive Kaskade
  const details: string[] = [];
  let casesJudged = 0;
  let escalatedProposals = 0;
  let totalKeep = 0;
  let totalDrop = 0;

  for (const c of set.cases) {
    // N Läufe: run 0 = Original-Reihenfolge, 1..N-1 = seeded Shuffle
    const runs: ComplianceMappingCandidate[][] = [];
    for (let r = 0; r < opts.runs; r++) {
      const ordered = r === 0 ? c.candidates : seededShuffle(c.candidates, seedFromString(`${c.caseId}#${r}`));
      runs.push(await generatorRun(c, ordered, set, opts.genModel, genPromptHash, opts.offline));
    }
    const run0Ids = runs[0].map(p => p.elementId);

    const routing: RoutingResult = routeAll(
      runs.map(run => run.map(p => ({ elementId: p.elementId, confidence: p.confidence })))
    );
    totalKeep += routing.keep.length;
    totalDrop += routing.drop.length;

    // Judge NUR auf die eskalierten Vorschläge (überspringen, wenn keine)
    let judged: JudgeResponse = { verdicts: [], missed: [], emptyJustified: false };
    if (routing.escalate.length > 0) {
      escalatedProposals += routing.escalate.length;
      const escProposals = routing.escalate.map(id => {
        const p = runs.flat().find(x => x.elementId === id);
        return { elementId: id, confidence: p?.confidence ?? 0.5, reasoning: p?.reasoning ?? '' };
      });
      const judgeKey = sha256(
        [c.fullText, JSON.stringify(c.candidates), JSON.stringify(routing.escalate.slice().sort()), opts.judgeModel, JUDGE_PROMPT_VERSION_HASH].join('|')
      );
      const judgeBucket = path.join('escalation-judge', cacheBucketFor(set.version, opts.judgeModel));
      const cachedJudge = readJudge(judgeBucket, c.caseId, judgeKey);
      if (cachedJudge) {
        judged = cachedJudge;
      } else if (opts.offline) {
        throw new Error(`--offline: kein Judge-Cache für "${c.caseId}"`);
      } else {
        casesJudged++;
        try {
          const res = await judgeMappings({
            requirementTitle: c.title ?? `${c.source} ${c.paragraphNumber}`,
            requirementText: c.fullText,
            source: c.source,
            paragraphNumber: c.paragraphNumber,
            candidates: c.candidates.map(el => ({ id: el.id, name: el.name, type: el.type, description: el.description })),
            proposals: escProposals,
            model: opts.judgeModel,
          });
          judged = { verdicts: res.verdicts, missed: res.missed, emptyJustified: res.emptyJustified };
          writeJudge(judgeBucket, c.caseId, judgeKey, judged);
        } catch (err) {
          console.log(`[escalation] ⚠️  JUDGE FAILED ${c.caseId}: ${err instanceof Error ? err.message : err} — eskalierte behalten`);
        }
      }
    }

    // Recall-schonende Policy (superfluous bleibt) auf die eskalierten
    const judgeApplied = applyJudgeVerdicts(routing.escalate, judged, { keepSuperfluous: true });
    // Final = keep (bypass) ∪ judge-kept(escalated) ∪ judge-missed-sweep
    const finalSet = new Set<string>([...routing.keep, ...judgeApplied.kept, ...judgeApplied.added]);

    genOutcomes.push({
      caseId: c.caseId, source: c.source, goldElementIds: c.goldElementIds,
      predicted: run0Ids.map(id => ({ elementId: id, confidence: 1 })),
    });
    escOutcomes.push({
      caseId: c.caseId, source: c.source, goldElementIds: c.goldElementIds,
      predicted: [...finalSet].map(id => ({ elementId: id, confidence: 1 })),
    });

    console.log(
      `[escalation] ${c.caseId}: keep ${routing.keep.length} · escalate ${routing.escalate.length} · drop ${routing.drop.length} → final ${finalSet.size}`
    );
    details.push(
      `- \`${c.caseId}\` — keep ${routing.keep.length} / escalate ${routing.escalate.length} / drop ${routing.drop.length} → ${finalSet.size}`
    );
  }

  const mGen = aggregateMetrics(genOutcomes);
  const mEsc = aggregateMetrics(escOutcomes);
  const cGen = concisenessMetrics(genOutcomes, cap);
  const cEsc = concisenessMetrics(escOutcomes, cap);

  const lines: string[] = [];
  lines.push(`# Eskalations-Eval — selektive Kaskade (${set.version})`);
  lines.push('');
  lines.push(`- Datum: ${startedAt} · Generator: \`${opts.genModel}\` (Cap ${cap}, ${opts.runs} Läufe) · Judge: \`${opts.judgeModel}\``);
  lines.push('');
  lines.push('## Vorher/Nachher');
  lines.push('');
  lines.push('| | Precision | Recall | F2 | Empty-Set | OMR |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| Generator (Cap ${cap}, run 0) | ${pct(mGen.precision)} | ${pct(mGen.recall)} | ${pct(mGen.f2)} | ${pct(emptySetAccuracy(genOutcomes))} | ${cGen.overMatchRatio.toFixed(2)} |`);
  lines.push(`| **Selektive Kaskade (Escalation→Judge)** | **${pct(mEsc.precision)}** | **${pct(mEsc.recall)}** | **${pct(mEsc.f2)}** | **${pct(emptySetAccuracy(escOutcomes))}** | ${cEsc.overMatchRatio.toFixed(2)} |`);
  lines.push('');
  lines.push('_Vergleich zur Full-Judge-Baseline (EVAL_BASELINE.md, recall-schonend): dort_');
  lines.push('_wurde JEDER Vorschlag geprüft. Hier bypassen die order-stabilen den Judge._');
  lines.push('');
  lines.push('## Routing & Kosten');
  lines.push('');
  lines.push('| Metrik | Wert |');
  lines.push('|---|---|');
  lines.push(`| Cases mit Judge-Call | ${casesJudged}/${set.cases.length} |`);
  lines.push(`| eskalierte Vorschläge (an Judge) | ${escalatedProposals} |`);
  lines.push(`| keep (Judge übersprungen) | ${totalKeep} |`);
  lines.push(`| drop (verworfen) | ${totalDrop} |`);
  lines.push('');
  lines.push('## Je Case');
  lines.push('');
  lines.push(...details);

  const markdown = lines.join('\n');
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const base = path.join(REPORTS_DIR, `escalation-eval-${set.version}-${stamp}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify({ startedAt, runs: opts.runs, genModel: opts.genModel, judgeModel: opts.judgeModel, cap, generator: mGen, escalated: mEsc, casesJudged, escalatedProposals, totalKeep, totalDrop }, null, 2)
  );
  console.log('\n' + markdown);
  console.log(`\n[escalation] Report: ${base}.md / .json`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[escalation] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
