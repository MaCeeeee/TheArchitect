/**
 * Eval-Metriken Phase 1 (THE-430 Slice 1) — Kalibrierung, FP/FN-Bias, Leakage-Split.
 * Additive Erweiterung von metrics.ts (THE-380 unangetastet).
 *
 * Run: cd packages/server && npx jest src/__tests__/evalCalibration.test.ts
 */
import {
  expectedCalibrationError,
  calibrationSamplesFromOutcomes,
  fpFnBias,
  leakageAwareSplit,
  type CalibrationSample,
  type CaseOutcome,
} from '../evals/metrics';

// ─── ECE ────────────────────────────────────────────────────────

describe('expectedCalibrationError', () => {
  it('perfekt kalibriert → ECE ≈ 0', () => {
    // Band 0.9–1.0: conf 0.95, 90% korrekt ≈ Confidence; Band 0.5–0.6: conf 0.55, ~55% korrekt.
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 100; i++) samples.push({ confidence: 0.95, correct: i < 95 });
    for (let i = 0; i < 100; i++) samples.push({ confidence: 0.55, correct: i < 55 });
    const { ece } = expectedCalibrationError(samples);
    expect(ece).toBeLessThan(0.05);
  });

  it('überkonfident (100% Confidence, 50% korrekt) → hoher ECE', () => {
    const samples: CalibrationSample[] = Array.from({ length: 100 }, (_, i) => ({
      confidence: 0.99,
      correct: i < 50,
    }));
    const { ece } = expectedCalibrationError(samples);
    expect(ece).toBeGreaterThan(0.4);
  });

  it('deterministisch + Bins summieren zur Sample-Zahl', () => {
    const samples: CalibrationSample[] = [
      { confidence: 0.15, correct: false },
      { confidence: 0.55, correct: true },
      { confidence: 0.95, correct: true },
    ];
    const a = expectedCalibrationError(samples);
    const b = expectedCalibrationError(samples);
    expect(a.ece).toBe(b.ece);
    expect(a.bins.reduce((s, x) => s + x.count, 0)).toBe(3);
    expect(a.samples).toBe(3);
  });

  it('leere Samples → ECE 0, kein Crash', () => {
    expect(expectedCalibrationError([]).ece).toBe(0);
  });

  it('extrahiert Samples je Vorhersage aus Outcomes', () => {
    const outcomes: CaseOutcome[] = [
      {
        caseId: 'c1',
        source: 'dsgvo',
        goldElementIds: ['e1'],
        predicted: [
          { elementId: 'e1', confidence: 0.9 }, // korrekt
          { elementId: 'e2', confidence: 0.6 }, // falsch
        ],
      },
    ];
    const s = calibrationSamplesFromOutcomes(outcomes);
    expect(s).toEqual([
      { confidence: 0.9, correct: true },
      { confidence: 0.6, correct: false },
    ]);
  });
});

// ─── FP/FN-Bias ─────────────────────────────────────────────────

describe('fpFnBias', () => {
  const mk = (id: string, gold: string[], pred: string[]): CaseOutcome => ({
    caseId: id,
    source: 's',
    goldElementIds: gold,
    predicted: pred.map(e => ({ elementId: e, confidence: 0.9 })),
  });

  it('über-matchend → lean "fp", bias > 0', () => {
    // gold {a}, pred {a,b,c} → tp1 fp2 fn0
    const r = fpFnBias([mk('1', ['a'], ['a', 'b', 'c'])]);
    expect(r.lean).toBe('fp');
    expect(r.bias).toBeGreaterThan(0);
  });

  it('übersehend → lean "fn", bias < 0', () => {
    // gold {a,b,c}, pred {a} → tp1 fp0 fn2
    const r = fpFnBias([mk('1', ['a', 'b', 'c'], ['a'])]);
    expect(r.lean).toBe('fn');
    expect(r.bias).toBeLessThan(0);
  });

  it('ausgewogen (fp==fn) → lean "balanced", bias 0', () => {
    // gold {a,b}, pred {a,c} → tp1 fp1 fn1
    const r = fpFnBias([mk('1', ['a', 'b'], ['a', 'c'])]);
    expect(r.bias).toBe(0);
    expect(r.lean).toBe('balanced');
  });

  it('keine Fehler → bias 0', () => {
    expect(fpFnBias([mk('1', ['a'], ['a'])]).bias).toBe(0);
  });
});

// ─── Leakage-aware Split ────────────────────────────────────────

describe('leakageAwareSplit', () => {
  interface Row { id: number; law: string; }
  const rows: Row[] = [];
  for (const law of ['dsgvo', 'nis2', 'dora', 'lksg', 'ai-act']) {
    for (let i = 0; i < 10; i++) rows.push({ id: rows.length, law });
  }

  it('kein Gruppen-Key liegt in beiden Falten (Leakage-Garantie)', () => {
    const { train, test } = leakageAwareSplit(rows, r => r.law, 0.3);
    const trainKeys = new Set(train.map(r => r.law));
    const testKeys = new Set(test.map(r => r.law));
    for (const k of testKeys) expect(trainKeys.has(k)).toBe(false);
  });

  it('deterministisch: gleicher seed → identischer Split', () => {
    const a = leakageAwareSplit(rows, r => r.law, 0.3, 7);
    const b = leakageAwareSplit(rows, r => r.law, 0.3, 7);
    expect(a.test.map(r => r.id)).toEqual(b.test.map(r => r.id));
  });

  it('train + test = alle items, keine Duplikate', () => {
    const { train, test } = leakageAwareSplit(rows, r => r.law, 0.3);
    expect(train.length + test.length).toBe(rows.length);
    const ids = new Set([...train, ...test].map(r => r.id));
    expect(ids.size).toBe(rows.length);
  });

  it('test-Größe nahe der Ziel-Fraktion (Gruppen-gerundet)', () => {
    const { test } = leakageAwareSplit(rows, r => r.law, 0.4);
    // 50 items, 5 Gruppen à 10; Ziel 20 → 2 Gruppen = 20.
    expect(test.length).toBeGreaterThanOrEqual(10);
    expect(test.length).toBeLessThanOrEqual(30);
  });
});
