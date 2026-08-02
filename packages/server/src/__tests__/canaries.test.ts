/**
 * Tests für die Kanarienvögel (THE-382 Slice 1, Task 6).
 *
 * Die Positiv-Kontrolle prüft, ob der Richter zustimmen KANN. Diese Fälle
 * prüfen, ob er ablehnen kann. Ohne sie besteht ein Richter, der alles
 * durchwinkt, jede Prüfung — und liefert eine Trefferquote ohne Bedeutung.
 */
import {
  buildCanaries,
  canaryCatchRate,
  meetsCanaryGate,
  isCanaryId,
  CANARY_CATCH_MIN,
  CANARY_PREFIX,
} from '../evals/canaries';
import type { ActionGoldenSet, ActionGoldenCase } from '../evals/actionGolden';

const mkSet = (t: number, k = 2): ActionGoldenSet => {
  const cases: ActionGoldenCase[] = [];
  for (let i = 0; i < t; i++) {
    cases.push({
      id: `t-${String(i).padStart(2, '0')}`,
      arm: 'T',
      a: { law: 'DSGVO', para: 'Art. 32', title: `A${i}`, text: `Pflicht A${i}.` },
      b: { law: 'NIS2', para: 'Art. 21', title: `B${i}`, text: `Pflicht B${i}.` },
      actionId: `handlung-${i}`,
    });
  }
  for (let i = 0; i < k; i++) {
    cases.push({
      id: `k-${String(i).padStart(2, '0')}`,
      arm: 'K',
      a: { law: 'DORA', para: 'Art. 9', title: `KA${i}`, text: `Pflicht KA${i}.` },
      b: { law: 'DSGVO', para: 'Art. 5', title: `KB${i}`, text: `Pflicht KB${i}.` },
      actionId: 'x',
      actionIdB: 'y',
    });
  }
  return { version: 'actions.v1', frozen: true, ontologyVersion: '1.8.0', cases };
};

describe('buildCanaries (THE-382)', () => {
  const set = mkSet(10);
  const canaries = buildCanaries(set, 6);

  it('builds both halves from arm T so the case LOOKS plausible', () => {
    // Beide Haelften sind echte Pflichten aus thematisch verwandten Paaren —
    // der Fall faellt NICHT schon durch einen Themenbruch auf.
    const armK = set.cases.filter((c) => c.arm === 'K');
    for (const c of canaries) {
      expect(armK.some((k) => k.a.title === c.a.title || k.b.title === c.b.title)).toBe(false);
    }
  });

  it('mixes two DIFFERENT source cases — never a case with itself', () => {
    for (const c of canaries) expect(c.from[0]).not.toBe(c.from[1]);
  });

  it('takes the A side from one case and the B side from the other', () => {
    const src = new Map(set.cases.map((c) => [c.id, c]));
    for (const c of canaries) {
      expect(c.a).toEqual(src.get(c.from[0])!.a);
      expect(c.b).toEqual(src.get(c.from[1])!.b);
    }
  });

  it('is deterministic and needs no LLM', () => {
    expect(buildCanaries(set, 6)).toEqual(canaries);
  });

  it('marks every canary so it can never be counted as a real case', () => {
    for (const c of canaries) {
      expect(c.id.startsWith(CANARY_PREFIX)).toBe(true);
      expect(isCanaryId(c.id)).toBe(true);
    }
    expect(isCanaryId('t-01')).toBe(false);
  });

  it('caps at what the pool allows instead of repeating cases', () => {
    expect(buildCanaries(mkSet(3), 99).length).toBeLessThanOrEqual(3);
  });

  it('returns nothing when there is no pool to mix', () => {
    expect(buildCanaries(mkSet(1), 5)).toEqual([]);
    expect(buildCanaries(mkSet(0), 5)).toEqual([]);
  });
});

describe('canaryCatchRate (THE-382)', () => {
  it('counts unrelated AND intersects as caught, equal/subset as missed', () => {
    expect(canaryCatchRate(['unrelated', 'intersects', 'equal', 'unrelated'])).toBeCloseTo(0.75, 6);
    expect(canaryCatchRate(['subset'])).toBe(0);
  });

  it('treats an unanswered canary as NOT caught — silence is not detection', () => {
    expect(canaryCatchRate(['unrelated', null, 'unrelated', 'unrelated'])).toBeCloseTo(0.75, 6);
  });

  it('returns null for an empty set instead of a perfect score', () => {
    // 0 von 0 als 100 % zu melden waere die gefaehrlichste Variante: ein Lauf
    // ohne Kanarien saehe aus wie ein bestandener.
    expect(canaryCatchRate([])).toBeNull();
  });
});

describe('meetsCanaryGate (THE-382)', () => {
  it('fails an unmeasured rate — not measured is not passed', () => {
    expect(meetsCanaryGate(null)).toBe(false);
  });

  it('holds the line at the threshold', () => {
    expect(meetsCanaryGate(CANARY_CATCH_MIN)).toBe(true);
    expect(meetsCanaryGate(CANARY_CATCH_MIN - 0.01)).toBe(false);
  });
});
