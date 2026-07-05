/**
 * Judge-Eval (E3-Vorstufe) — misst die Kaskade Generator→Judge gegen das
 * eingefrorene Requirement-Gold.
 *
 *   COMPLIANCE_MAX_MAPPINGS=12 npm run eval:judge                          # Generator haiku, Judge sonnet
 *   COMPLIANCE_MAX_MAPPINGS=12 npm run eval:judge -- --gen-model haiku --judge-model sonnet
 *   npm run eval:judge -- --offline                                       # nur Cache
 *
 * Ablauf je Case: Generator (mapTextToElements, Cap via COMPLIANCE_MAX_MAPPINGS,
 * bewusst weit) → Judge (4-Verdikt + Missed-Sweep) → applyJudgeVerdicts →
 * Metriken VOR vs. NACH Judge + Judge-Qualität (FP-Kill, TP-Damage,
 * Missed-Recovery, Empty-Mut). Audit-Invariante bleibt: der Judge flaggt,
 * gefiltert wird nur die Messsicht.
 *
 * Erfolgskriterium (EVAL_BASELINE.md Cap-Sweep): Recall ~80 % halten,
 * Precision von ~37 % Richtung 60 %+, Empty-Set > 0 %.
 *
 * Linear: THE-401 S2 · THE-382 · Epic THE-378
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapTextToElements,
  __testExports,
  type ComplianceMappingCandidate,
} from '../services/complianceMapping.service';
import {
  judgeMappings,
  applyJudgeVerdicts,
  JUDGE_PROMPT_VERSION_HASH,
  type JudgeResponse,
} from '../services/complianceJudge.service';
import { buildSystemPrompt } from '../prompts/complianceMapping.prompt';
import { sha256, cacheKeyFor, readCache, writeCache } from './predictionCache';
import { loadGoldenSet, toCandidateElements, type GoldenCase, type GoldenSet } from './goldenSet';
import { resolveModel, cacheBucketFor } from './runMappingEval';
import { aggregateMetrics, emptySetAccuracy, concisenessMetrics, type CaseOutcome } from './metrics';

const CACHE_DIR = path.join(__dirname, 'cache');
const REPORTS_DIR = path.join(__dirname, 'reports');
const DEFAULT_GOLDEN = path.join(__dirname, 'golden', 'mapping.req-self-v1.json');

// ─── Judge-Qualität (reine Funktion — testbar) ──────────────────

export interface JudgeQuality {
  proposalTp: number;
  proposalFp: number;
  fpKilled: number; // FPs mit Verdikt incorrect|superfluous (gewollt)
  tpKilled: number; // TPs mit Verdikt incorrect|superfluous (Schaden!)
  goldMissedBefore: number; // Gold-Elemente, die der Generator nicht vorschlug
  missedRecovered: number; // davon vom Sweep gefunden
  falseAdds: number; // Sweep-Funde, die NICHT im Gold sind
}

export function judgeQualityForCase(
  goldIds: string[],
  proposalIds: string[],
  judge: JudgeResponse
): JudgeQuality {
  const gold = new Set(goldIds);
  const verdictById = new Map(judge.verdicts.map(v => [v.elementId, v.verdict]));
  const killed = (id: string) => {
    const v = verdictById.get(id);
    return v === 'incorrect' || v === 'superfluous';
  };

  let proposalTp = 0;
  let proposalFp = 0;
  let fpKilled = 0;
  let tpKilled = 0;
  for (const id of proposalIds) {
    if (gold.has(id)) {
      proposalTp++;
      if (killed(id)) tpKilled++;
    } else {
      proposalFp++;
      if (killed(id)) fpKilled++;
    }
  }

  const proposed = new Set(proposalIds);
  const missedGold = goldIds.filter(id => !proposed.has(id));
  const sweepIds = new Set(judge.missed.map(m => m.elementId));
  const missedRecovered = missedGold.filter(id => sweepIds.has(id)).length;
  const falseAdds = judge.missed.filter(m => !gold.has(m.elementId)).length;

  return {
    proposalTp,
    proposalFp,
    fpKilled,
    tpKilled,
    goldMissedBefore: missedGold.length,
    missedRecovered,
    falseAdds,
  };
}

// ─── Judge-Cache (eigenes Format, judge-Antwort statt Predictions) ──

interface CachedJudge {
  cacheKey: string;
  judge: JudgeResponse;
  cachedAt: string;
}

function judgeCachePath(bucket: string, caseId: string): string {
  return path.join(CACHE_DIR, bucket, `${caseId}.judge.json`);
}
function readJudgeCache(bucket: string, caseId: string, key: string): JudgeResponse | null {
  const p = judgeCachePath(bucket, caseId);
  if (!fs.existsSync(p)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(p, 'utf8')) as CachedJudge;
    return c.cacheKey === key ? c.judge : null;
  } catch {
    return null;
  }
}
function writeJudgeCache(bucket: string, caseId: string, entry: CachedJudge): void {
  fs.mkdirSync(path.dirname(judgeCachePath(bucket, caseId)), { recursive: true });
  fs.writeFileSync(judgeCachePath(bucket, caseId), JSON.stringify(entry, null, 2));
}

// ─── Runner ─────────────────────────────────────────────────────

interface CliOptions {
  goldenPath: string;
  genModel: string;
  judgeModel: string;
  offline: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    goldenPath: DEFAULT_GOLDEN,
    genModel: resolveModel('haiku'),
    judgeModel: resolveModel('sonnet'),
    offline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--golden' && argv[i + 1]) opts.goldenPath = path.resolve(argv[++i]);
    else if (argv[i] === '--gen-model' && argv[i + 1]) opts.genModel = resolveModel(argv[++i]);
    else if (argv[i] === '--judge-model' && argv[i + 1]) opts.judgeModel = resolveModel(argv[++i]);
    else if (argv[i] === '--offline') opts.offline = true;
  }
  return opts;
}

async function generatorPredict(
  c: GoldenCase,
  set: GoldenSet,
  model: string,
  promptHash: string,
  offline: boolean
): Promise<ComplianceMappingCandidate[]> {
  const inputsHash = sha256(
    JSON.stringify(c.candidates) +
      `|cap=${__testExports.MAX_MAPPINGS_PER_REGULATION}|thr=${__testExports.CONFIDENCE_THRESHOLD}`
  );
  const key = cacheKeyFor(c.fullText, c.candidates.map(el => el.id), model, promptHash, inputsHash);
  const bucket = cacheBucketFor(set.version, model);
  const cached = readCache(CACHE_DIR, bucket, c.caseId, key);
  if (cached) return cached.predictions;
  if (offline) throw new Error(`--offline: kein Generator-Cache für "${c.caseId}" (${model})`);

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
  return candidates;
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

  console.log(`[judge-eval] Golden ${set.version} (${set.cases.length} cases, frozen=${set.frozen})`);
  console.log(
    `[judge-eval] generator=${opts.genModel} (cap=${cap}) · judge=${opts.judgeModel} · judgePromptHash=${JUDGE_PROMPT_VERSION_HASH.slice(0, 12)}`
  );

  const pre: CaseOutcome[] = [];
  const post: CaseOutcome[] = [];
  const quality: Array<JudgeQuality & { caseId: string; emptyJustified: boolean }> = [];
  const details: string[] = [];

  for (const c of set.cases) {
    const predictions = await generatorPredict(c, set, opts.genModel, genPromptHash, opts.offline);
    const proposalIds = predictions.map(p => p.elementId);

    const judgeKey = sha256(
      [
        c.fullText,
        JSON.stringify(c.candidates),
        JSON.stringify(proposalIds),
        opts.judgeModel,
        JUDGE_PROMPT_VERSION_HASH,
      ].join('|')
    );
    const judgeBucket = path.join('judge', cacheBucketFor(set.version, opts.judgeModel));
    let judge = readJudgeCache(judgeBucket, c.caseId, judgeKey);
    let fromCache = true;
    if (!judge) {
      if (opts.offline) throw new Error(`--offline: kein Judge-Cache für "${c.caseId}"`);
      fromCache = false;
      const res = await judgeMappings({
        requirementTitle: c.title ?? `${c.source} ${c.paragraphNumber}`,
        requirementText: c.fullText,
        source: c.source,
        paragraphNumber: c.paragraphNumber,
        candidates: c.candidates.map(el => ({
          id: el.id,
          name: el.name,
          type: el.type,
          description: el.description,
        })),
        proposals: predictions.map(p => ({
          elementId: p.elementId,
          confidence: p.confidence,
          reasoning: p.reasoning,
        })),
        model: opts.judgeModel,
      });
      judge = { verdicts: res.verdicts, missed: res.missed, emptyJustified: res.emptyJustified };
      writeJudgeCache(judgeBucket, c.caseId, { cacheKey: judgeKey, judge, cachedAt: startedAt });
    }

    const { kept, added, removed } = applyJudgeVerdicts(proposalIds, judge);
    const postIds = [...kept, ...added];

    pre.push({
      caseId: c.caseId,
      source: c.source,
      goldElementIds: c.goldElementIds,
      predicted: predictions.map(p => ({ elementId: p.elementId, confidence: p.confidence })),
    });
    post.push({
      caseId: c.caseId,
      source: c.source,
      goldElementIds: c.goldElementIds,
      predicted: postIds.map(id => ({ elementId: id, confidence: 1 })),
    });
    const q = judgeQualityForCase(c.goldElementIds, proposalIds, judge);
    quality.push({ ...q, caseId: c.caseId, emptyJustified: judge.emptyJustified });

    console.log(
      `[judge-eval] ${fromCache ? 'cache' : 'live '} ${c.caseId}: ${proposalIds.length} proposed → ${postIds.length} nach Judge (−${removed.length} +${added.length})${judge.emptyJustified ? ' [emptyJustified]' : ''}`
    );
    details.push(
      `- \`${c.caseId}\` — ${proposalIds.length} → ${postIds.length} (killed: ${removed.length}, sweep: +${added.length}${judge.emptyJustified ? ', emptyJustified' : ''})`
    );
  }

  const mPre = aggregateMetrics(pre);
  const mPost = aggregateMetrics(post);
  const ePre = emptySetAccuracy(pre);
  const ePost = emptySetAccuracy(post);
  const cPre = concisenessMetrics(pre, cap);
  const cPost = concisenessMetrics(post, cap);

  const sum = quality.reduce(
    (a, q) => ({
      proposalTp: a.proposalTp + q.proposalTp,
      proposalFp: a.proposalFp + q.proposalFp,
      fpKilled: a.fpKilled + q.fpKilled,
      tpKilled: a.tpKilled + q.tpKilled,
      goldMissedBefore: a.goldMissedBefore + q.goldMissedBefore,
      missedRecovered: a.missedRecovered + q.missedRecovered,
      falseAdds: a.falseAdds + q.falseAdds,
    }),
    { proposalTp: 0, proposalFp: 0, fpKilled: 0, tpKilled: 0, goldMissedBefore: 0, missedRecovered: 0, falseAdds: 0 }
  );

  const lines: string[] = [];
  lines.push(`# Judge-Eval — Kaskade Generator→Judge (${set.version})`);
  lines.push('');
  lines.push(`- Datum: ${startedAt} · Generator: \`${opts.genModel}\` (Cap ${cap}) · Judge: \`${opts.judgeModel}\``);
  lines.push(`- Judge-Prompt-Hash: \`${JUDGE_PROMPT_VERSION_HASH.slice(0, 12)}\` · Cases: ${set.cases.length}`);
  lines.push('');
  lines.push('## Vorher/Nachher (die Kaskaden-Frage)');
  lines.push('');
  lines.push('| | Precision | Recall | F2 | Empty-Set | OMR | Ø Map/Fall |');
  lines.push('|---|---|---|---|---|---|---|');
  lines.push(
    `| Generator (vor Judge) | ${pct(mPre.precision)} | ${pct(mPre.recall)} | ${pct(mPre.f2)} | ${pct(ePre)} | ${cPre.overMatchRatio.toFixed(2)} | ${cPre.meanPredictionsPerCase.toFixed(2)} |`
  );
  lines.push(
    `| **Kaskade (nach Judge)** | **${pct(mPost.precision)}** | **${pct(mPost.recall)}** | **${pct(mPost.f2)}** | **${pct(ePost)}** | ${cPost.overMatchRatio.toFixed(2)} | ${cPost.meanPredictionsPerCase.toFixed(2)} |`
  );
  lines.push('');
  lines.push('## Judge-Qualität (Paar-Ebene über alle Cases)');
  lines.push('');
  lines.push('| Metrik | Wert | Bedeutung |');
  lines.push('|---|---|---|');
  lines.push(`| FP-Kill-Rate | ${pct(sum.proposalFp ? sum.fpKilled / sum.proposalFp : null)} (${sum.fpKilled}/${sum.proposalFp}) | Fehlalarme korrekt geflaggt (Ziel: hoch) |`);
  lines.push(`| TP-Damage | ${pct(sum.proposalTp ? sum.tpKilled / sum.proposalTp : null)} (${sum.tpKilled}/${sum.proposalTp}) | echte Treffer fälschlich gekillt (Ziel: ~0) |`);
  lines.push(`| Missed-Recovery | ${pct(sum.goldMissedBefore ? sum.missedRecovered / sum.goldMissedBefore : null)} (${sum.missedRecovered}/${sum.goldMissedBefore}) | vom Generator übersehene Gold-Elemente, die der Sweep fand |`);
  lines.push(`| False-Adds (Sweep) | ${sum.falseAdds} | Sweep-Funde außerhalb des Golds (Ziel: ~0) |`);
  lines.push('');
  lines.push('## Je Case');
  lines.push('');
  lines.push(...details);
  lines.push('');
  lines.push('_Audit-Invariante: Der Judge flaggt (incorrect/superfluous/uncertain), gelöscht_');
  lines.push('_wird nur die Messsicht. uncertain bleibt drin (Human-Queue, S4)._');

  const markdown = lines.join('\n');
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const base = path.join(REPORTS_DIR, `judge-eval-${set.version}-${stamp}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify(
      { startedAt, genModel: opts.genModel, judgeModel: opts.judgeModel, cap, pre: mPre, post: mPost, emptySetPre: ePre, emptySetPost: ePost, judgeQuality: sum, perCase: quality },
      null,
      2
    )
  );

  console.log('\n' + markdown);
  console.log(`\n[judge-eval] Report: ${base}.md / .json`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[judge-eval] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
