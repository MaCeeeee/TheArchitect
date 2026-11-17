/**
 * Beta-Intervall (Jeffreys) für einfache k/n-Quoten.
 *
 * Referenzwerte unabhängig berechnet: Beta-CDF per Substitution x = sin²t und
 * Simpson-Integration (N = 20 000), Quantil per Bisektion — ein anderer Weg als
 * die Kettenbruch-Entwicklung in proportionInterval.ts.
 *
 * Run: cd packages/server && npx jest src/__tests__/proportionInterval.test.ts --verbose
 */
import {
  regularizedIncompleteBeta,
  betaQuantile,
  jeffreysInterval,
  formatInterval,
} from '../evals/proportionInterval';
import { bootstrapCI, type CaseOutcome } from '../evals/metrics';

describe('regularizedIncompleteBeta()', () => {
  it('stimmt mit der geschlossenen Form für ganzzahlige Parameter überein', () => {
    // I_0.3(2,3) = 1 − (1−x)^4 − 4x(1−x)^3
    const x = 0.3;
    const exact = 1 - (1 - x) ** 4 - 4 * x * (1 - x) ** 3;
    expect(regularizedIncompleteBeta(x, 2, 3)).toBeCloseTo(exact, 10);
  });

  it('ist symmetrisch: I_x(a,b) = 1 − I_{1−x}(b,a)', () => {
    expect(regularizedIncompleteBeta(0.2, 1.5, 9.5)).toBeCloseTo(1 - regularizedIncompleteBeta(0.8, 9.5, 1.5), 10);
  });

  it('hat die Ränder 0 und 1', () => {
    expect(regularizedIncompleteBeta(0, 0.5, 0.5)).toBe(0);
    expect(regularizedIncompleteBeta(1, 0.5, 0.5)).toBe(1);
  });
});

describe('betaQuantile()', () => {
  it('kehrt die CDF um', () => {
    const p = betaQuantile(0.975, 33.5, 6.5);
    expect(regularizedIncompleteBeta(p, 33.5, 6.5)).toBeCloseTo(0.975, 9);
  });
});

describe('jeffreysInterval()', () => {
  // [k, n, lo, hi] — Referenz aus der Simpson-Rechnung (siehe Kopf)
  const reference: Array<[number, number, number, number]> = [
    [1, 5, 0.022513, 0.628626], // Jev-Fehlalarm 1/5
    [9, 9, 0.76239, 1], // Jev-Fang 9/9
    [0, 5, 0, 0.379377],
    [5, 10, 0.223529, 0.776471],
    [33, 39, 0.710086, 0.933133],
    [0, 1, 0, 0.853254],
    [18, 49, 0.243069, 0.506786],
  ];

  it.each(reference)('%i/%i → [%f, %f]', (k, n, lo, hi) => {
    const ci = jeffreysInterval(k, n);
    expect(ci).not.toBeNull();
    expect(ci!.lo).toBeCloseTo(lo, 5);
    expect(ci!.hi).toBeCloseTo(hi, 5);
  });

  it('setzt bei k = 0 die Untergrenze und bei k = n die Obergrenze exakt (Brown/Cai/DasGupta)', () => {
    expect(jeffreysInterval(0, 7)!.lo).toBe(0);
    expect(jeffreysInterval(7, 7)!.hi).toBe(1);
  });

  it('liefert null ohne Beobachtung — n = 0 ist nicht gemessen, nicht 0 %', () => {
    expect(jeffreysInterval(0, 0)).toBeNull();
  });

  it('weist unmögliche Zählungen ab', () => {
    expect(() => jeffreysInterval(6, 5)).toThrow(RangeError);
    expect(() => jeffreysInterval(-1, 5)).toThrow(RangeError);
    expect(() => jeffreysInterval(1.5, 5)).toThrow(RangeError);
  });

  it('wird schmaler, je mehr Fälle bei gleicher Quote vorliegen', () => {
    const small = jeffreysInterval(1, 5)!;
    const large = jeffreysInterval(20, 100)!;
    expect(large.hi - large.lo).toBeLessThan(small.hi - small.lo);
  });

  it('enthält die Punktschätzung', () => {
    for (const [k, n] of [[1, 5], [33, 39], [18, 49]]) {
      const ci = jeffreysInterval(k, n)!;
      expect(ci.lo).toBeLessThanOrEqual(k / n);
      expect(ci.hi).toBeGreaterThanOrEqual(k / n);
    }
  });

  it('bleibt bei 9/9 ehrlich, wo der Bootstrap auf [1, 1] kollabiert', () => {
    // Genau der Fall, für den es gebaut ist: Resampling aus neun Treffern
    // zieht nie einen Fehler, das Intervall verschwindet.
    const outcomes: CaseOutcome[] = Array.from({ length: 9 }, (_, i) => ({
      caseId: `c${i}`,
      source: 's',
      goldElementIds: ['e'],
      predicted: [{ elementId: 'e', confidence: 0.9 }],
    })) as CaseOutcome[];
    const boot = bootstrapCI(outcomes, () => 1, 200, 1);
    expect(boot).toEqual({ lo: 1, hi: 1 });
    expect(jeffreysInterval(9, 9)!.lo).toBeLessThan(0.8);
  });
});

describe('formatInterval()', () => {
  it('formatiert in Prozent mit Gedankenstrich', () => {
    expect(formatInterval({ lo: 0.022513, hi: 0.628626 })).toBe('2–63 %');
    expect(formatInterval({ lo: 0.710086, hi: 0.933133 }, 1)).toBe('71.0–93.3 %');
  });

  it('zeigt fehlende Messung als Strich', () => {
    expect(formatInterval(null)).toBe('—');
  });
});
