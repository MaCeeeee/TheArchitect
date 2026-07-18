/**
 * runDiscoveryEval Tests — UC-LAW-002 Slice-2b (THE-465).
 * Pure cores only: cosine/topK, fail-fast vector guard, loss attribution,
 * DE/EN family-consistency check, ruleLessGold recall, report banner.
 *
 * Run: cd packages/server && npx jest runDiscoveryEval --verbose
 */
import {
  cosineSimilarity,
  topKByCosine,
  familyOutcomeForCase,
  familyLanguageConsistencyIssues,
  assertVectorsPresent,
  MissingVectorsError,
  lossAttributionForCase,
  ruleLessGoldRecall,
  bootstrapDeltaCI,
  buildMarkdownReport,
  perFamilyBreakdown,
  buildJudgePostOutcome,
} from '../evals/runDiscoveryEval';
import { precisionByConfidenceBand, expectedCalibrationError, calibrationSamplesFromOutcomes } from '../evals/metrics';
import type { FixtureCorpus, DiscoveryGoldenSet } from '../evals/discoveryGolden';
import type { DiscoveryCandidate } from '@thearchitect/shared';
import type { CaseOutcome } from '../evals/metrics';

function paragraph(overrides: Partial<FixtureCorpus['paragraphs'][number]> = {}) {
  return {
    regulationKey: 'dsgvo:5',
    versionHash: 'fx-1',
    source: 'dsgvo',
    paragraphNumber: 'Art. 5',
    title: 'Test',
    jurisdiction: 'EU',
    language: 'de',
    text: 'x'.repeat(90),
    ...overrides,
  };
}

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it('returns 0 for a zero vector (no NaN)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('topKByCosine', () => {
  it('ranks paragraphs by cosine similarity to the query vector, sliced to topK', () => {
    const paragraphs = [
      paragraph({ regulationKey: 'a:1', source: 'a', vector: [1, 0] } as never),
      paragraph({ regulationKey: 'b:1', source: 'b', vector: [0, 1] } as never),
      paragraph({ regulationKey: 'c:1', source: 'c', vector: [0.9, 0.1] } as never),
    ];
    const hits = topKByCosine([1, 0], paragraphs as never, 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].regulationKey).toBe('a:1');
    expect(hits[0].score).toBeCloseTo(1);
    expect(hits[1].regulationKey).toBe('c:1');
  });
});

describe('familyOutcomeForCase', () => {
  it('maps candidates to a metrics.ts CaseOutcome (family as elementId)', () => {
    const candidates: DiscoveryCandidate[] = [
      { family: 'ai-act', sources: ['ai-act-en'], jurisdiction: 'EU', score: 0.8, hitCount: 2, topHits: [] },
      { family: 'dora', sources: ['dora'], jurisdiction: 'EU', score: 0.3, hitCount: 1, topHits: [] },
    ];
    const outcome = familyOutcomeForCase('c1', ['ai-act'], candidates);
    expect(outcome.caseId).toBe('c1');
    expect(outcome.goldElementIds).toEqual(['ai-act']);
    expect(outcome.predicted).toEqual([
      { elementId: 'ai-act', confidence: 0.8 },
      { elementId: 'dora', confidence: 0.3 },
    ]);
  });
});

describe('familyLanguageConsistencyIssues (AC-5 guard)', () => {
  it('is empty when every family appears as exactly one candidate', () => {
    const candidates: DiscoveryCandidate[] = [
      { family: 'ai-act', sources: ['ai-act-de', 'ai-act-en'], jurisdiction: 'EU', score: 0.8, hitCount: 2, topHits: [] },
    ];
    expect(familyLanguageConsistencyIssues(candidates)).toEqual([]);
  });

  it('flags a family that appears as two separate candidate entries (de/en split not merged)', () => {
    const candidates: DiscoveryCandidate[] = [
      { family: 'ai-act', sources: ['ai-act-de'], jurisdiction: 'EU', score: 0.8, hitCount: 1, topHits: [] },
      { family: 'ai-act', sources: ['ai-act-en'], jurisdiction: 'EU', score: 0.7, hitCount: 1, topHits: [] },
    ];
    const issues = familyLanguageConsistencyIssues(candidates);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('ai-act');
  });
});

describe('assertVectorsPresent (Review-Fix 3 — fail-fast, not NaN)', () => {
  const golden: DiscoveryGoldenSet = {
    version: 'v1',
    frozen: false,
    rubricRef: 'x',
    cases: [
      { caseId: 'c1', title: 't', profileText: 'p'.repeat(100), signalHints: [], goldFamilies: [], ruleLessGold: [], ambiguous: false },
    ],
  };
  const corpusWithVectors: FixtureCorpus = { version: 'v1', paragraphs: [paragraph({ vector: Array(768).fill(0.1) })] };
  const corpusWithoutVectors: FixtureCorpus = { version: 'v1', paragraphs: [paragraph()] };

  it('throws MissingVectorsError with a "run eval:discovery:build first" message when fixture paragraphs lack vectors', () => {
    expect(() => assertVectorsPresent(corpusWithoutVectors, golden, null, { hyde: false })).toThrow(MissingVectorsError);
    try {
      assertVectorsPresent(corpusWithoutVectors, golden, null, { hyde: false });
    } catch (err) {
      expect((err as Error).message).toMatch(/npm run eval:discovery:build/);
    }
  });

  it('throws when the queries file is missing entirely (no baselineVectors at all)', () => {
    expect(() => assertVectorsPresent(corpusWithVectors, golden, null, { hyde: false })).toThrow(MissingVectorsError);
  });

  it('throws when a case has no baselineVector', () => {
    const queries = { version: 'v1', queries: [] };
    expect(() => assertVectorsPresent(corpusWithVectors, golden, queries, { hyde: false })).toThrow(MissingVectorsError);
  });

  it('passes when every paragraph + case has what is required (no hyde)', () => {
    const queries = { version: 'v1', queries: [{ caseId: 'c1', baselineVector: Array(768).fill(0.2) }] };
    expect(() => assertVectorsPresent(corpusWithVectors, golden, queries, { hyde: false })).not.toThrow();
  });

  it('with --hyde, also requires hydeVector on every case', () => {
    const queries = { version: 'v1', queries: [{ caseId: 'c1', baselineVector: Array(768).fill(0.2) }] };
    expect(() => assertVectorsPresent(corpusWithVectors, golden, queries, { hyde: true })).toThrow(MissingVectorsError);
    const queriesWithHyde = { version: 'v1', queries: [{ caseId: 'c1', baselineVector: Array(768).fill(0.2), hydeText: 'x', hydeVector: Array(768).fill(0.3) }] };
    expect(() => assertVectorsPresent(corpusWithVectors, golden, queriesWithHyde, { hyde: true })).not.toThrow();
  });
});

describe('lossAttributionForCase', () => {
  it('classifies a gold family missing from retrieval entirely as missed@retrieval', () => {
    const attribution = lossAttributionForCase('c1', ['nis2'], [], new Map());
    expect(attribution.missedAtRetrieval).toEqual(['nis2']);
    expect(attribution.missedAtJudge).toEqual([]);
  });

  it('classifies a gold family retrieved but judged applies:false as missed@judge', () => {
    const judged = new Map([['ai-act', { applies: false }]]);
    const attribution = lossAttributionForCase('c1', ['ai-act'], ['ai-act'], judged);
    expect(attribution.missedAtRetrieval).toEqual([]);
    expect(attribution.missedAtJudge).toEqual(['ai-act']);
  });

  it('classifies a non-gold family judged applies:true as a false positive at judge', () => {
    const judged = new Map([['dora', { applies: true }]]);
    const attribution = lossAttributionForCase('c1', [], ['dora'], judged);
    expect(attribution.falsePositiveAtJudge).toEqual(['dora']);
  });

  it('a correctly retrieved + correctly judged gold family produces no loss entries', () => {
    const judged = new Map([['ai-act', { applies: true }]]);
    const attribution = lossAttributionForCase('c1', ['ai-act'], ['ai-act'], judged);
    expect(attribution.missedAtRetrieval).toEqual([]);
    expect(attribution.missedAtJudge).toEqual([]);
    expect(attribution.falsePositiveAtJudge).toEqual([]);
  });
});

describe('ruleLessGoldRecall', () => {
  it('computes recall restricted to the ruleLessGold family subset across cases', () => {
    const outcomes: CaseOutcome[] = [
      { caseId: 'c1', source: 'discovery', goldElementIds: ['mdr'], predicted: [{ elementId: 'mdr', confidence: 0.5 }] },
      { caseId: 'c2', source: 'discovery', goldElementIds: ['psd2'], predicted: [] },
    ];
    const ruleLessByCaseId = new Map([['c1', ['mdr']], ['c2', ['psd2']]]);
    const recall = ruleLessGoldRecall(outcomes, ruleLessByCaseId);
    expect(recall).toBeCloseTo(0.5); // 1 of 2 rule-less gold families recovered
  });

  it('returns null when no case has a ruleLessGold family', () => {
    const outcomes: CaseOutcome[] = [{ caseId: 'c1', source: 'discovery', goldElementIds: ['dsgvo'], predicted: [] }];
    expect(ruleLessGoldRecall(outcomes, new Map())).toBeNull();
  });
});

describe('bootstrapDeltaCI', () => {
  it('is centered near 0 when baseline and hyde outcomes are identical', () => {
    const outcomes: CaseOutcome[] = [
      { caseId: 'c1', source: 'discovery', goldElementIds: ['ai-act'], predicted: [{ elementId: 'ai-act', confidence: 0.5 }] },
      { caseId: 'c2', source: 'discovery', goldElementIds: ['dsgvo'], predicted: [] },
    ];
    const ci = bootstrapDeltaCI(outcomes, outcomes, o => o.filter(x => x.predicted.length >= 0).length / (o.length || 1), 200, 7);
    expect(ci.lo).toBeCloseTo(ci.hi, 5);
  });
});

describe('perFamilyBreakdown (AC-2, Fix 2)', () => {
  it('aggregates TP/FP/FN per family across all cases', () => {
    const outcomes: CaseOutcome[] = [
      // c1: ai-act gold + predicted (TP for ai-act); dora predicted but not gold (FP for dora)
      { caseId: 'c1', source: 'discovery', goldElementIds: ['ai-act'], predicted: [{ elementId: 'ai-act', confidence: 0.8 }, { elementId: 'dora', confidence: 0.4 }] },
      // c2: ai-act gold but NOT predicted (FN for ai-act); dora gold + predicted (TP for dora)
      { caseId: 'c2', source: 'discovery', goldElementIds: ['ai-act', 'dora'], predicted: [{ elementId: 'dora', confidence: 0.6 }] },
    ];
    const byFamily = perFamilyBreakdown(outcomes);
    expect(byFamily['ai-act']).toMatchObject({ tp: 1, fp: 0, fn: 1 });
    expect(byFamily['ai-act'].precision).toBeCloseTo(1);
    expect(byFamily['ai-act'].recall).toBeCloseTo(0.5);
    expect(byFamily['dora']).toMatchObject({ tp: 1, fp: 1, fn: 0 });
    expect(byFamily['dora'].precision).toBeCloseTo(0.5);
    expect(byFamily['dora'].recall).toBeCloseTo(1);
  });

  it('appears as a per-family table in the markdown report', () => {
    const outcomes: CaseOutcome[] = [
      { caseId: 'c1', source: 'discovery', goldElementIds: ['ai-act'], predicted: [{ elementId: 'ai-act', confidence: 0.8 }] },
      { caseId: 'c2', source: 'discovery', goldElementIds: ['dora'], predicted: [] },
    ];
    const md = buildMarkdownReport({
      golden: { version: 'v1', frozen: false, rubricRef: 'x', cases: [] },
      startedAt: '2026-07-18T00:00:00.000Z',
      topK: 60,
      retrievalOutcomes: outcomes,
      ruleLessByCaseId: new Map(),
      familyIssues: [],
      judgeRun: null,
      hydeRun: null,
    });
    expect(md).toMatch(/per-family/i);
    expect(md).toMatch(/\| ai-act \|/);
    expect(md).toMatch(/\| dora \|/);
  });
});

describe('buildJudgePostOutcome (AC-2, Fix 3 — real judge confidence, not the constant 1)', () => {
  it('uses the judge confidence in the post outcome predictions', () => {
    const judged = new Map([
      ['ai-act', { applies: true, confidence: 0.9 }],
      ['dora', { applies: true, confidence: 0.3 }],
      ['nis2', { applies: false, confidence: 0.8 }], // applies:false → not predicted
    ]);
    const outcome = buildJudgePostOutcome('c1', ['ai-act'], judged);
    expect(outcome.predicted).toEqual(
      expect.arrayContaining([
        { elementId: 'ai-act', confidence: 0.9 },
        { elementId: 'dora', confidence: 0.3 },
      ]),
    );
    expect(outcome.predicted).toHaveLength(2);
  });

  it('varying confidences flow into calibration: bands/ECE differ from the constant-1 encoding', () => {
    // ai-act: correct at 0.9 · dora: wrong at 0.3.
    const judged = new Map([
      ['ai-act', { applies: true, confidence: 0.9 }],
      ['dora', { applies: true, confidence: 0.3 }],
    ]);
    const outcomes = [buildJudgePostOutcome('c1', ['ai-act'], judged)];

    const bands = precisionByConfidenceBand(outcomes);
    // The 0.9–1.0 band holds exactly the one correct prediction; with the old
    // constant-1 encoding BOTH predictions would land there (precision 0.5).
    const topBand = bands.find(b => b.band === '0.9–1.0')!;
    expect(topBand.predictions).toBe(1);
    expect(topBand.precision).toBeCloseTo(1);

    const ece = expectedCalibrationError(calibrationSamplesFromOutcomes(outcomes));
    // Perfectly calibrated-ish: 0.9-confident correct (gap 0.1), 0.3-confident wrong (gap 0.3)
    // → ECE = 0.5·0.1 + 0.5·0.3 = 0.2. Constant-1 would give 0.5·0 + 0.5·1 = 0.5.
    expect(ece.ece).toBeCloseTo(0.2, 5);
  });
});

describe('buildMarkdownReport', () => {
  it('shows the PRELIMINARY banner when the golden set is not frozen', () => {
    const md = buildMarkdownReport({
      golden: { version: 'v1', frozen: false, rubricRef: 'x', cases: [] },
      startedAt: '2026-07-18T00:00:00.000Z',
      topK: 60,
      retrievalOutcomes: [],
      ruleLessByCaseId: new Map(),
      familyIssues: [],
      judgeRun: null,
      hydeRun: null,
    });
    expect(md).toMatch(/PRELIMINARY/);
    expect(md).toMatch(/not yet owner-approved/i);
  });

  it('omits the banner when frozen:true', () => {
    const md = buildMarkdownReport({
      golden: { version: 'v1', frozen: true, rubricRef: 'x', cases: [] },
      startedAt: '2026-07-18T00:00:00.000Z',
      topK: 60,
      retrievalOutcomes: [],
      ruleLessByCaseId: new Map(),
      familyIssues: [],
      judgeRun: null,
      hydeRun: null,
    });
    expect(md).not.toMatch(/PRELIMINARY/);
  });
});
