/**
 * THE-597 Slice 0 — Schwellen-Routing + AUROC über CalibrationSample.
 * Reine Metriken, kein LLM. Run: cd packages/server && npx jest src/__tests__/the597Routing.test.ts
 */
import { aurocFromSamples, thresholdRoutingStats, type CalibrationSample } from '../evals/metrics';

const S = (confidence: number, correct: boolean): CalibrationSample => ({ confidence, correct });

describe('aurocFromSamples', () => {
  it('perfekte Trennung (richtig immer höher) → 1', () => {
    expect(aurocFromSamples([S(0.9, true), S(0.8, true), S(0.4, false), S(0.2, false)])).toBe(1);
  });
  it('invertiert (falsch immer höher) → 0', () => {
    expect(aurocFromSamples([S(0.2, true), S(0.9, false)])).toBe(0);
  });
  it('alle gleich → 0.5 (keine Information)', () => {
    expect(aurocFromSamples([S(0.6, true), S(0.6, false), S(0.6, true)])).toBe(0.5);
  });
  it('nur eine Klasse vorhanden → null', () => {
    expect(aurocFromSamples([S(0.9, true), S(0.7, true)])).toBeNull();
    expect(aurocFromSamples([])).toBeNull();
  });
  it('gemischte Fälle (auch mit Teil-Tie) → 0.75', () => {
    expect(aurocFromSamples([S(0.9, true), S(0.7, true), S(0.5, false), S(0.8, false)])).toBe(0.75);
    expect(aurocFromSamples([S(0.6, true), S(0.9, true), S(0.6, false)])).toBe(0.75);
  });
});

describe('thresholdRoutingStats', () => {
  // 4 falsche: 0.2, 0.6, 0.6, 1.0 · 6 richtige: 0.4, 0.8, 0.8, 1.0, 1.0, 1.0
  const samples = [
    S(0.2, false), S(0.6, false), S(0.6, false), S(1.0, false),
    S(0.4, true), S(0.8, true), S(0.8, true), S(1.0, true), S(1.0, true), S(1.0, true),
  ];
  it('routet bei confidence < threshold; Recall auf Falschen, Fehlalarm auf Richtigen', () => {
    const [t06, t08, t10] = thresholdRoutingStats(samples, [0.6, 0.8, 1.0]);
    expect(t06).toMatchObject({ threshold: 0.6, wrong: 4, correct: 6, caught: 1, falseAlarms: 1 });
    expect(t06.recall).toBeCloseTo(0.25);
    expect(t06.falseAlarmRate).toBeCloseTo(1 / 6);
    expect(t08).toMatchObject({ threshold: 0.8, caught: 3, falseAlarms: 1 });
    expect(t10).toMatchObject({ threshold: 1.0, caught: 3, falseAlarms: 3 });
    expect(t10.recall).toBeCloseTo(0.75);
    expect(t10.falseAlarmRate).toBeCloseTo(0.5);
  });
  it('keine falschen Fälle → recall 0; ein richtiger unter der Schwelle → falseAlarmRate 1', () => {
    const [only] = thresholdRoutingStats([S(0.3, true)], [0.6]);
    expect(only.recall).toBe(0);
    expect(only.falseAlarmRate).toBe(1);
  });
  it('leere Eingabe → recall 0 und falseAlarmRate 0, nie NaN', () => {
    const [none] = thresholdRoutingStats([], [0.6]);
    expect(none.recall).toBe(0);
    expect(none.falseAlarmRate).toBe(0);
  });
  it('Schwellen sind exklusiv: 1.0 fängt nichts, 1.01 fängt alles', () => {
    const [atOne, overOne] = thresholdRoutingStats([S(1.0, false), S(1.0, true)], [1.0, 1.01]);
    expect(atOne).toMatchObject({ caught: 0, falseAlarms: 0 });
    expect(overOne).toMatchObject({ caught: 1, falseAlarms: 1 });
  });
  it('Default-Schwellen sind 0.6, 0.8, 1.0', () => {
    expect(thresholdRoutingStats(samples).map((s) => s.threshold)).toEqual([0.6, 0.8, 1.0]);
  });
});
