/**
 * runJudgeCompareEval Tests — Spike Judge-Compare (UC-LAW-002).
 * Aufgabenaufbau auf dem echten Discovery-Golden-Set, Metriken, McNemar,
 * Paarvergleich, Go/No-Go-Gate, Cache-Roundtrip/Offline und Report.
 *
 * Run: cd packages/server && npx jest runJudgeCompareEval --verbose
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildJudgeTasks,
  computeBackendMetrics,
  compareBackends,
  mcnemarExactP,
  gateVerdict,
  runBackend,
  buildCompareReport,
  parseCompareArgs,
  judgeModelId,
  DEFAULT_GATE,
  type JudgeDecision,
  type JudgeTask,
  type PairwiseComparison,
  type BackendMetrics,
} from '../evals/runJudgeCompareEval';
import { loadDiscoveryGoldenSet, loadFixtureCorpus } from '../evals/discoveryGolden';
import { readQueriesFile, DEFAULT_QUERIES_PATH, type QueriesFile } from '../scripts/build-discovery-eval-vectors';
import { toFamily } from '../services/lawDiscovery.service';
import { emptyUsage, type JudgeBackendSpec } from '../evals/judgeBackends';
import { __resetJudgeCache } from '../services/lawJudge.service';
import type Anthropic from '@anthropic-ai/sdk';

function decision(caseId: string, family: string, gold: boolean, applies: boolean | null, confidence = 0.8): JudgeDecision {
  return { caseId, family, gold, ambiguous: false, applies, confidence: applies === null ? null : confidence, reasoning: 'r', latencyMs: 100, fromCache: false };
}

describe('buildJudgeTasks (real discovery golden set + fixture corpus)', () => {
  const golden = loadDiscoveryGoldenSet();
  const corpus = loadFixtureCorpus();
  const queries = readQueriesFile(DEFAULT_QUERIES_PATH) as QueriesFile;
  const families = new Set(corpus.paragraphs.map(p => toFamily(p.source)));

  it('"all" mode judges every corpus family for every case — no gold family is lost before the judge', () => {
    const { tasks, missedAtRetrieval } = buildJudgeTasks(golden, corpus, queries, { mode: 'all', threshold: 0.3, maxJudge: 5 });
    expect(tasks).toHaveLength(golden.cases.length * families.size);
    expect(missedAtRetrieval).toEqual([]);
    const goldPairs = golden.cases.reduce((n, c) => n + c.goldFamilies.length, 0);
    expect(tasks.filter(t => t.gold)).toHaveLength(goldPairs);
    for (const t of tasks) {
      expect(t.candidate.topHits.length).toBeGreaterThan(0);
      expect(t.candidate.retrievalScore).toBeGreaterThanOrEqual(0);
      expect(t.candidate.retrievalScore).toBeLessThanOrEqual(1);
    }
  });

  it('"gated" mode is a subset capped by maxJudge and reports retrieval loss separately', () => {
    const { tasks, missedAtRetrieval } = buildJudgeTasks(golden, corpus, queries, { mode: 'gated', threshold: 0.3, maxJudge: 2 });
    const perCase = new Map<string, number>();
    for (const t of tasks) perCase.set(t.caseId, (perCase.get(t.caseId) ?? 0) + 1);
    for (const n of perCase.values()) expect(n).toBeLessThanOrEqual(2);
    const goldPairs = golden.cases.reduce((n, c) => n + c.goldFamilies.length, 0);
    expect(tasks.filter(t => t.gold).length + missedAtRetrieval.length).toBe(goldPairs);
  });
});

describe('computeBackendMetrics', () => {
  it('computes confusion, P/R/F2, specificity, κ and counts errors as "no verdict"', () => {
    const ds = [
      decision('c1', 'dsgvo', true, true),
      decision('c1', 'mdr', false, false),
      decision('c1', 'nis2', false, true), // FP
      decision('c2', 'dsgvo', true, null), // error → FN
      decision('c2', 'dora', false, false),
    ];
    const m = computeBackendMetrics(ds);
    expect(m).toMatchObject({ n: 5, errors: 1, tp: 1, fp: 1, fn: 1, tn: 2 });
    expect(m.errorRate).toBeCloseTo(0.2);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.specificity).toBeCloseTo(2 / 3);
    expect(m.accuracy).toBeCloseTo(0.6);
    expect(m.kappaVsGold).not.toBeNull();
    expect(m.latencyP50Ms).toBe(100);
  });
});

describe('mcnemarExactP', () => {
  it('is 1 without discordant pairs', () => expect(mcnemarExactP(0, 0)).toBe(1));
  it('matches the exact binomial value for b=0, c=5 (2·0.5^5)', () => expect(mcnemarExactP(0, 5)).toBeCloseTo(0.0625));
  it('is symmetric', () => expect(mcnemarExactP(2, 7)).toBeCloseTo(mcnemarExactP(7, 2)));
  it('caps at 1 for balanced counts', () => expect(mcnemarExactP(3, 3)).toBe(1));
});

describe('compareBackends', () => {
  const ref = [
    decision('c1', 'dsgvo', true, true),
    decision('c1', 'mdr', false, false),
    decision('c2', 'dsgvo', true, true),
    decision('c2', 'nis2', true, true),
  ];

  it('identical decisions → full agreement, ΔF2 0, no discordant pairs', () => {
    const cmp = compareBackends('ref', ref, 'cand', ref.map(d => ({ ...d })));
    expect(cmp.agreement).toBe(1);
    expect(cmp.deltaF2).toBe(0);
    expect(cmp.deltaF2CI).toEqual({ lo: 0, hi: 0 });
    expect(cmp.mcnemar).toEqual({ b: 0, c: 0, pValue: 1 });
  });

  it('a candidate missing gold families shows a negative ΔRecall and b > 0', () => {
    const cand = ref.map(d => ({ ...d, applies: d.family === 'nis2' ? false : d.applies }));
    const cmp = compareBackends('ref', ref, 'cand', cand);
    expect(cmp.deltaRecall).toBeLessThan(0);
    expect(cmp.mcnemar.b).toBe(1);
    expect(cmp.mcnemar.c).toBe(0);
  });

  it('throws when the candidate lacks a task', () => {
    expect(() => compareBackends('ref', ref, 'cand', ref.slice(1))).toThrow(/missing/);
  });
});

describe('gateVerdict', () => {
  const metrics = (errorRate: number): BackendMetrics => ({ ...computeBackendMetrics([decision('c', 'f', true, true)]), errorRate });
  const cmp = (over: Partial<PairwiseComparison>): PairwiseComparison => ({
    referenceId: 'ref',
    candidateId: 'cand',
    agreement: 1,
    kappa: 1,
    deltaPrecision: 0,
    deltaRecall: 0,
    deltaF2: 0,
    deltaF2CI: { lo: -0.05, hi: 0.05 },
    mcnemar: { b: 0, c: 0, pValue: 1 },
    ...over,
  });

  it('GO when non-inferior and within error/precision limits', () => {
    expect(gateVerdict(metrics(0), cmp({})).verdict).toBe('GO');
  });
  it('NO-GO on too many schema errors', () => {
    expect(gateVerdict(metrics(0.2), cmp({})).verdict).toBe('NO-GO');
  });
  it('NO-GO on a precision drop beyond the limit', () => {
    expect(gateVerdict(metrics(0), cmp({ deltaPrecision: -0.08 })).verdict).toBe('NO-GO');
  });
  it('NO-GO when the whole ΔF2 CI is below the margin', () => {
    expect(gateVerdict(metrics(0), cmp({ deltaF2CI: { lo: -0.4, hi: -0.15 } })).verdict).toBe('NO-GO');
  });
  it('INCONCLUSIVE when the ΔF2 CI straddles the margin', () => {
    const v = gateVerdict(metrics(0), cmp({ deltaF2CI: { lo: -0.3, hi: 0.05 } }));
    expect(v.verdict).toBe('INCONCLUSIVE');
    expect(v.reasons.join(' ')).toMatch(/more cases/);
  });
  it('uses the documented default thresholds', () => {
    expect(DEFAULT_GATE).toEqual({ maxErrorRate: 0.05, maxPrecisionDrop: 0.05, nonInferiorityMarginF2: 0.1 });
  });
});

describe('runBackend (cache + offline)', () => {
  const spec: JudgeBackendSpec = { id: 'fake', kind: 'openai-compat', model: 'm', baseUrl: 'http://h' };
  const task: JudgeTask = {
    caseId: 'c1',
    family: 'dsgvo',
    gold: true,
    ambiguous: false,
    profileText: 'profile',
    candidate: { family: 'dsgvo', sources: ['dsgvo'], jurisdiction: 'EU', topHits: [{ regulationKey: 'dsgvo:6', title: 't' }], retrievalScore: 0.5 },
  };
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-compare-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('calls the judge once, then serves the verdict from the file cache (also offline)', async () => {
    const judge = jest.fn(async () => ({ family: 'dsgvo', applies: true, confidence: 0.9, reasoning: 'x', elementIds: [], keyParagraphs: [] }));
    const client = {} as Anthropic;
    const first = await runBackend(spec, [task], { offline: false, cacheDir: dir, client, judge });
    expect(first[0]).toMatchObject({ applies: true, fromCache: false });
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0]).toEqual([expect.objectContaining({ model: judgeModelId(spec), anthropicClient: client })]);

    const second = await runBackend(spec, [task], { offline: true, cacheDir: dir, judge });
    expect(second[0]).toMatchObject({ applies: true, confidence: 0.9, fromCache: true });
    expect(judge).toHaveBeenCalledTimes(1);
  });

  it('a changed candidate invalidates the cache entry', async () => {
    const judge = jest.fn(async () => ({ family: 'dsgvo', applies: true, confidence: 0.9, reasoning: 'x', elementIds: [], keyParagraphs: [] }));
    await runBackend(spec, [task], { offline: false, cacheDir: dir, client: {} as Anthropic, judge });
    const changed = { ...task, candidate: { ...task.candidate, retrievalScore: 0.9 } };
    const res = await runBackend(spec, [changed], { offline: true, cacheDir: dir, judge });
    expect(res[0]).toMatchObject({ applies: null, error: 'not cached (offline)' });
  });

  it('two live backends with the SAME model each call their own client (no in-process judge cache bleed)', async () => {
    __resetJudgeCache();
    const verdictJson = JSON.stringify({ family: 'dsgvo', applies: true, confidence: 0.9, reasoning: 'x', elementIds: [], keyParagraphs: [] });
    const fakeClient = () => {
      const create = jest.fn(async () => ({ content: [{ type: 'text', text: verdictJson }], usage: { input_tokens: 1, output_tokens: 1 } }));
      return { client: { messages: { create } } as unknown as Anthropic, create };
    };
    const a = fakeClient();
    const b = fakeClient();
    const specA: JudgeBackendSpec = { id: 'haiku', kind: 'anthropic', model: 'claude-same' };
    const specB: JudgeBackendSpec = { id: 'haiku-run2', kind: 'anthropic', model: 'claude-same' };
    await runBackend(specA, [task], { offline: false, cacheDir: dir, client: a.client });
    await runBackend(specB, [task], { offline: false, cacheDir: dir, client: b.client });
    expect(a.create).toHaveBeenCalledTimes(1);
    expect(b.create).toHaveBeenCalledTimes(1);
  });

  it('records judge errors without caching them', async () => {
    const judge = jest.fn(async () => {
      throw new Error('law-judge output invalid after 2 attempts');
    });
    const res = await runBackend(spec, [task], { offline: false, cacheDir: dir, client: {} as Anthropic, judge });
    expect(res[0]).toMatchObject({ applies: null, error: expect.stringMatching(/invalid/) });
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('parseCompareArgs', () => {
  it('defaults to the Haiku reference and "all" mode', () => {
    const o = parseCompareArgs([]);
    expect(o.backends.map(b => b.id)).toEqual(['haiku']);
    expect(o.mode).toBe('all');
  });
  it('parses repeated backends and options', () => {
    const o = parseCompareArgs([
      '--backend', 'haiku=anthropic:claude-haiku-4-5-20251001',
      '--backend', 'law=local:DomainLLM/gemma-3-12b-it-german-law-finetuned@http://localhost:8000',
      '--candidates', 'gated', '--offline', '--json-mode', 'none', '--limit-cases', '3',
    ]);
    expect(o.backends.map(b => b.id)).toEqual(['haiku', 'law']);
    expect(o).toMatchObject({ mode: 'gated', offline: true, jsonMode: 'none', limitCases: 3 });
  });
  it('rejects duplicate labels and bad modes', () => {
    expect(() => parseCompareArgs(['--backend', 'a=anthropic:x', '--backend', 'a=anthropic:y'])).toThrow(/duplicate/);
    expect(() => parseCompareArgs(['--candidates', 'some'])).toThrow(/all\|gated/);
  });
});

describe('buildCompareReport', () => {
  it('renders metrics, the gate verdict and disagreements', () => {
    const golden = loadDiscoveryGoldenSet();
    const tasks: JudgeTask[] = ['dsgvo', 'mdr'].map(f => ({
      caseId: 'c1',
      family: f,
      gold: f === 'dsgvo',
      ambiguous: false,
      profileText: 'p',
      candidate: { family: f, sources: [f], jurisdiction: 'EU', topHits: [], retrievalScore: 0.4 },
    }));
    const ref = [decision('c1', 'dsgvo', true, true), decision('c1', 'mdr', false, false)];
    const cand = [decision('c1', 'dsgvo', true, true), decision('c1', 'mdr', false, true)];
    const refSpec: JudgeBackendSpec = { id: 'haiku', kind: 'anthropic', model: 'claude-haiku-4-5-20251001' };
    const candSpec: JudgeBackendSpec = { id: 'law', kind: 'openai-compat', model: 'gemma', baseUrl: 'http://h' };
    const cmp = compareBackends('haiku', ref, 'law', cand);
    const candMetrics = computeBackendMetrics(cand);
    const md = buildCompareReport({
      golden,
      startedAt: '2026-11-24T00:00:00Z',
      mode: 'all',
      tasks,
      missedAtRetrieval: [],
      runs: [
        { spec: refSpec, decisions: ref, metrics: computeBackendMetrics(ref), usage: emptyUsage() },
        { spec: candSpec, decisions: cand, metrics: candMetrics, usage: emptyUsage() },
      ],
      comparisons: [{ ...cmp, gate: gateVerdict(candMetrics, cmp) }],
      gate: DEFAULT_GATE,
    });
    expect(md).toContain('PRELIMINARY');
    expect(md).toContain('Small sample');
    expect(md).toContain('| **haiku** |');
    expect(md).toContain('Paired comparison vs. reference (haiku)');
    expect(md).toMatch(/\*\*NO-GO\*\*/); // precision drop 100% → 50%
    expect(md).toContain('Disagreements with the reference (1');
    expect(md).toContain('| mdr |');
  });
});
