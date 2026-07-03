/**
 * Eval-Foundation Tests — THE-379/THE-380 (UC-EVAL-001)
 *
 *   - metrics.ts: Confusion, P/R/F2 (micro), Empty-Set, Bands, Bootstrap-CI, Kappa
 *   - goldenSet.ts: Loader-Validierung (Schema, gold-ID-Integrität, Duplikate), Stats
 *
 * Run: cd packages/server && npx jest src/__tests__/evalMetrics.test.ts --verbose
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  confusionForCase,
  aggregateMetrics,
  fBeta,
  emptySetAccuracy,
  breakdownBySource,
  precisionByConfidenceBand,
  bootstrapCI,
  mulberry32,
  cohenKappa,
  type CaseOutcome,
  type PairLabel,
} from '../evals/metrics';
import {
  loadGoldenSet,
  goldenSetStats,
  GoldenSetError,
  DEFAULT_GOLDEN_PATH,
} from '../evals/goldenSet';

function outcome(
  caseId: string,
  gold: string[],
  predicted: Array<[string, number]>,
  source = 'dsgvo'
): CaseOutcome {
  return {
    caseId,
    source,
    goldElementIds: gold,
    predicted: predicted.map(([elementId, confidence]) => ({ elementId, confidence })),
  };
}

// ─── confusion / P/R/F ──────────────────────────────────────────

describe('confusionForCase()', () => {
  it('counts tp/fp/fn correctly', () => {
    const c = confusionForCase(outcome('c1', ['a', 'b'], [['a', 0.9], ['x', 0.7]]));
    expect(c).toEqual({ tp: 1, fp: 1, fn: 1 });
  });

  it('hard negative with empty prediction is all-zero', () => {
    expect(confusionForCase(outcome('c1', [], []))).toEqual({ tp: 0, fp: 0, fn: 0 });
  });
});

describe('fBeta()', () => {
  it('F2 weights recall over precision', () => {
    // P=0.5, R=1.0 → F2 = 5*0.5*1 / (4*0.5 + 1) = 0.8333
    expect(fBeta(0.5, 1.0, 2)).toBeCloseTo(0.8333, 3);
    // symmetric check: F1 would be 0.6667 — F2 must be higher when R > P
    expect(fBeta(0.5, 1.0, 2)).toBeGreaterThan(fBeta(0.5, 1.0, 1));
  });

  it('returns 0 when both are 0', () => {
    expect(fBeta(0, 0, 2)).toBe(0);
  });
});

describe('aggregateMetrics()', () => {
  it('micro-averages across cases', () => {
    const outcomes = [
      outcome('c1', ['a', 'b'], [['a', 0.9]]), // tp=1 fn=1
      outcome('c2', ['c'], [['c', 0.8], ['x', 0.6]]), // tp=1 fp=1
    ];
    const m = aggregateMetrics(outcomes);
    expect(m.tp).toBe(2);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.precision).toBeCloseTo(2 / 3, 5);
    expect(m.recall).toBeCloseTo(2 / 3, 5);
  });

  it('empty input yields zeros (not NaN)', () => {
    const m = aggregateMetrics([]);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f2).toBe(0);
  });
});

// ─── Empty-Set + Breakdown ──────────────────────────────────────

describe('emptySetAccuracy()', () => {
  it('scores hard negatives only', () => {
    const outcomes = [
      outcome('neg-ok', [], []),
      outcome('neg-bad', [], [['x', 0.7]]),
      outcome('pos', ['a'], [['a', 0.9]]), // ignoriert
    ];
    expect(emptySetAccuracy(outcomes)).toBe(0.5);
  });

  it('returns null without hard negatives', () => {
    expect(emptySetAccuracy([outcome('pos', ['a'], [])])).toBeNull();
  });
});

describe('breakdownBySource()', () => {
  it('groups per source', () => {
    const outcomes = [
      outcome('c1', ['a'], [['a', 0.9]], 'dsgvo'),
      outcome('c2', ['b'], [], 'lksg'),
    ];
    const b = breakdownBySource(outcomes);
    expect(b['dsgvo'].recall).toBe(1);
    expect(b['lksg'].recall).toBe(0);
  });
});

describe('precisionByConfidenceBand()', () => {
  it('assigns predictions to bands, last band inclusive', () => {
    const outcomes = [
      outcome('c1', ['a', 'b'], [
        ['a', 0.55], // korrekt, Band 0.5–0.6
        ['x', 0.95], // falsch,  Band 0.9–1.0
        ['b', 1.0], // korrekt, Band 0.9–1.0 (inklusiv)
      ]),
    ];
    const bands = precisionByConfidenceBand(outcomes);
    const first = bands.find(b => b.band === '0.5–0.6')!;
    const last = bands.find(b => b.band === '0.9–1.0')!;
    expect(first).toMatchObject({ predictions: 1, correct: 1, precision: 1 });
    expect(last).toMatchObject({ predictions: 2, correct: 1, precision: 0.5 });
  });
});

// ─── Bootstrap / PRNG ───────────────────────────────────────────

describe('mulberry32()', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('bootstrapCI()', () => {
  const outcomes = [
    outcome('c1', ['a'], [['a', 0.9]]),
    outcome('c2', ['b'], []),
    outcome('c3', ['c'], [['c', 0.8]]),
    outcome('c4', ['d'], [['d', 0.7]]),
  ];

  it('is deterministic (same seed → same interval) and lo <= hi', () => {
    const m = (o: CaseOutcome[]) => aggregateMetrics(o).recall;
    const ci1 = bootstrapCI(outcomes, m, 200, 7);
    const ci2 = bootstrapCI(outcomes, m, 200, 7);
    expect(ci1).toEqual(ci2);
    expect(ci1.lo).toBeLessThanOrEqual(ci1.hi);
  });

  it('collapses to a point for constant metric', () => {
    const ci = bootstrapCI(outcomes, () => 0.5, 100, 1);
    expect(ci).toEqual({ lo: 0.5, hi: 0.5 });
  });
});

// ─── Cohen's Kappa ──────────────────────────────────────────────

describe('cohenKappa()', () => {
  const m: PairLabel = 'match';
  const n: PairLabel = 'no-match';

  it('perfect agreement → 1', () => {
    expect(cohenKappa([m, n, m, n], [m, n, m, n])).toBe(1);
  });

  it('chance-level agreement → 0', () => {
    // po = 0.5, pe = 0.5 → kappa = 0
    expect(cohenKappa([m, m, n, n], [m, n, m, n])).toBeCloseTo(0, 10);
  });

  it('throws on length mismatch and empty input', () => {
    expect(() => cohenKappa([m], [m, n])).toThrow(/differ in length/);
    expect(() => cohenKappa([], [])).toThrow(/empty/);
  });
});

// ─── Golden-Set Loader ──────────────────────────────────────────

describe('loadGoldenSet()', () => {
  const tmpFile = (content: unknown): string => {
    const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'golden-')), 'set.json');
    fs.writeFileSync(p, JSON.stringify(content));
    return p;
  };

  const validCase = {
    caseId: 'c1',
    source: 'dsgvo',
    paragraphNumber: 'Art. 30',
    fullText: 'x'.repeat(60),
    language: 'de',
    jurisdiction: 'EU',
    candidates: [{ id: 'el-1', name: 'App', type: 'application' }],
    goldElementIds: ['el-1'],
  };

  it('loads the committed seed set (schema-valid, stats plausible)', () => {
    const set = loadGoldenSet(DEFAULT_GOLDEN_PATH);
    expect(set.frozen).toBe(false); // Seed darf nie als eingefroren gelten
    const stats = goldenSetStats(set);
    expect(stats.total).toBeGreaterThanOrEqual(3);
    expect(stats.hardNegatives).toBeGreaterThanOrEqual(1);
  });

  it('rejects goldElementIds outside the candidate list', () => {
    const bad = { ...validCase, goldElementIds: ['el-GHOST'] };
    const p = tmpFile({ version: 'vX', frozen: false, cases: [bad] });
    expect(() => loadGoldenSet(p)).toThrow(GoldenSetError);
    expect(() => loadGoldenSet(p)).toThrow(/el-GHOST/);
  });

  it('rejects duplicate caseIds', () => {
    const p = tmpFile({ version: 'vX', frozen: false, cases: [validCase, validCase] });
    expect(() => loadGoldenSet(p)).toThrow(/Duplicate caseIds/);
  });

  it('rejects invalid JSON and missing files with context', () => {
    expect(() => loadGoldenSet('/nonexistent/golden.json')).toThrow(/Cannot read/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-'));
    const p = path.join(dir, 'broken.json');
    fs.writeFileSync(p, '{not json');
    expect(() => loadGoldenSet(p)).toThrow(/not valid JSON/);
  });
});
