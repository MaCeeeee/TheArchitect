/**
 * THE-597 Slice 3 — Go/No-Go nach der Vorregistrierung vom 17.11.2026.
 * Reine Logik, kein LLM. Run: cd packages/server && npx jest src/__tests__/the597Slice3.test.ts
 */
import {
  parseRun,
  SLICE3_GOLDEN_SHA256,
  SLICE3_INSTRUMENT,
  type GoldenId,
} from '../evals/the597Slice3';
import type { TypingEvalCase } from '../evals/typingMetrics';
import { decideSlice3, meetsCriterion, type Slice3Run } from '../evals/the597Slice3';
import type { RoutingStat } from '../evals/metrics';

/** Ein Fall: Gold und Vorhersage je Achse, Konfidenz je Achse. */
export function mkCase(
  id: string,
  gold: Record<string, string | null>,
  predicted: Record<string, string | null>,
  confidence: Record<string, number>
): TypingEvalCase {
  return { caseId: id, source: 's', language: 'en', gold, predicted, confidence } as unknown as TypingEvalCase;
}

export function runJson(golden: GoldenId, cases: TypingEvalCase[], over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    variante: SLICE3_INSTRUMENT.variante,
    model: SLICE3_INSTRUMENT.model,
    samples: SLICE3_INSTRUMENT.samples,
    the597: { goldenSha256: SLICE3_GOLDEN_SHA256[golden] },
    cases,
    ...over,
  });
}

/** 70 gültige Fälle mit eindeutigen caseIds — so groß wie gv3/gv2. */
const one = Array.from({ length: 70 }, (_, i) =>
  mkCase(`c${i}`, { obligationKind: 'obligation' }, { obligationKind: 'obligation' }, { obligationKind: 1 })
);

describe('parseRun', () => {
  it('nimmt einen Lauf mit vorregistriertem Instrument an und hasht die Datei', () => {
    const raw = runJson('gv3', one);
    const run = parseRun('gv3-run1', 'gv3', raw);
    expect(run.label).toBe('gv3-run1');
    expect(run.golden).toBe('gv3');
    expect(run.cases).toHaveLength(70);
    expect(run.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['model', { model: 'claude-sonnet-x' }],
    ['samples', { samples: 1 }],
    ['variante', { variante: 'tp-3' }],
    ['goldenSha256', { the597: { goldenSha256: 'abc' } }],
    ['cases', { cases: [] }],
  ])('lehnt einen Lauf mit abweichendem %s ab', (feld, over) => {
    expect(() => parseRun('x', 'gv3', runJson('gv3', one, over))).toThrow(new RegExp(String(feld)));
  });

  it('lehnt 69 Fälle und doppelte caseIds ab', () => {
    expect(() => parseRun('x', 'gv3', runJson('gv3', one.slice(1)))).toThrow(/cases=69 statt 70/);
    const dup = [...one.slice(1), one[1]];
    expect(() => parseRun('x', 'gv3', runJson('gv3', dup))).toThrow(/caseId doppelt/);
  });

  it('lehnt einen gv3-Lauf ab, der als gv2 deklariert wird (Golden-Hash passt nicht)', () => {
    expect(() => parseRun('x', 'gv2', runJson('gv3', one))).toThrow(/goldenSha256/);
  });
});

const stat = (o: Partial<RoutingStat>): RoutingStat => ({
  threshold: 1, wrong: 10, correct: 50, caught: 0, falseAlarms: 0, recall: 0, falseAlarmRate: 0, ...o,
});

describe('meetsCriterion (Recall ≥ 50 % UND Fehlalarm ≤ 10 %)', () => {
  it('genau auf beiden Grenzen → erfüllt', () => {
    expect(meetsCriterion(stat({ recall: 0.5, falseAlarmRate: 0.1 }))).toBe(true);
  });
  it('Recall knapp darunter → nicht erfüllt', () => {
    expect(meetsCriterion(stat({ recall: 0.4999, falseAlarmRate: 0 }))).toBe(false);
  });
  it('Fehlalarm knapp darüber → nicht erfüllt', () => {
    expect(meetsCriterion(stat({ recall: 1, falseAlarmRate: 0.1001 }))).toBe(false);
  });
  it('keine falschen Fälle → nicht erfüllt (Frage nicht gestellt)', () => {
    expect(meetsCriterion(stat({ wrong: 0, recall: 0, falseAlarmRate: 0 }))).toBe(false);
  });
  it('keine richtigen Fälle → nicht erfüllt (Fehlalarm nicht messbar)', () => {
    expect(meetsCriterion(stat({ correct: 0, recall: 1, falseAlarmRate: 0 }))).toBe(false);
  });
});

/**
 * Synthetischer Lauf für EINE Achse: `wrongLow` falsche mit Konfidenz 0,6,
 * `wrongHigh` falsche mit 1,0, `rightLow` richtige mit 0,6, `rightHigh` richtige mit 1,0.
 * Bei Schwelle 0,8 und 1,0 werden genau die 0,6er geroutet.
 */
function axisRun(
  label: string,
  golden: 'gv3' | 'gv2',
  axis: string,
  n: { wrongLow: number; wrongHigh: number; rightLow: number; rightHigh: number }
): Slice3Run {
  const cases: TypingEvalCase[] = [];
  let i = 0;
  const add = (k: number, correct: boolean, conf: number) => {
    for (let j = 0; j < k; j++) {
      i++;
      cases.push(mkCase(`${label}-${i}`, { [axis]: 'a' }, { [axis]: correct ? 'a' : 'b' }, { [axis]: conf }));
    }
  };
  add(n.wrongLow, false, 0.6);
  add(n.wrongHigh, false, 1);
  add(n.rightLow, true, 0.6);
  add(n.rightHigh, true, 1);
  return { label, golden, fileSha256: label.padEnd(64, '0'), cases };
}

const PASS = { wrongLow: 6, wrongHigh: 4, rightLow: 2, rightHigh: 48 }; // Recall 60 %, FA 4 %
const FAIL = { wrongLow: 2, wrongHigh: 8, rightLow: 2, rightHigh: 48 }; // Recall 20 %, FA 4 %

function runs(axis: string, gv3: Array<typeof PASS>, gv2: Array<typeof PASS>): Slice3Run[] {
  return [
    ...gv3.map((n, i) => axisRun(`gv3-run${i + 1}`, 'gv3', axis, n)),
    ...gv2.map((n, i) => axisRun(`gv2-run${i + 1}`, 'gv2', axis, n)),
  ];
}

const combo = (d: ReturnType<typeof decideSlice3>, axis: string, t: number) =>
  d.combos.find((c) => c.axis === axis && c.threshold === t)!;

describe('decideSlice3', () => {
  it('verlangt genau 5 gv3- und 2 gv2-Läufe', () => {
    expect(() => decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS], [PASS, PASS]))).toThrow(/5 gv3.*2 gv2/);
    expect(() => decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [PASS]))).toThrow(/5 gv3.*2 gv2/);
  });

  it('weist doppelte Labels und byte-identische Läufe ab', () => {
    const r = runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [PASS, PASS]);
    expect(() => decideSlice3([...r.slice(0, 6), { ...r[6], label: r[0].label }])).toThrow(/Label/);
    expect(() => decideSlice3([...r.slice(0, 6), { ...r[6], fileSha256: r[0].fileSha256 }])).toThrow(/identisch/);
  });

  it('GO: gepoolt, stabil in 5/5 und repliziert → Schicht 1 GO', () => {
    const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [PASS, PASS]));
    const c = combo(d, 'obligationKind', 0.8);
    expect(c).toMatchObject({ pooledGv3Pass: true, stableRuns: 5, stablePass: true, replicationPass: true, go: true });
    expect(d.layer1).toBe('GO');
    expect(d.goCombos).toEqual(expect.arrayContaining([{ axis: 'obligationKind', threshold: 0.8 }]));
  });

  it('nur 3 von 5 Einzelläufen erfüllen → nicht stabil → NO-GO, auch wenn gepoolt erfüllt', () => {
    // 3 × PASS + 2 × knapp verfehlt (Recall 40 %); gepoolt: (6·3+4·2)/50 = 52 % → gepoolt erfüllt
    const NEAR = { wrongLow: 4, wrongHigh: 6, rightLow: 2, rightHigh: 48 };
    const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, NEAR, NEAR], [PASS, PASS]));
    const c = combo(d, 'obligationKind', 0.8);
    expect(c.pooledGv3Pass).toBe(true);
    expect(c.stableRuns).toBe(3);
    expect(c.stablePass).toBe(false);
    expect(c.go).toBe(false);
    expect(d.layer1).toBe('NO-GO');
  });

  it('4 von 5 genügen für Stabilität', () => {
    const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, FAIL], [PASS, PASS]));
    expect(combo(d, 'obligationKind', 0.8)).toMatchObject({ stableRuns: 4, stablePass: true });
  });

  it('gv2 repliziert nicht → kein GO für obligationKind', () => {
    const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [FAIL, FAIL]));
    expect(combo(d, 'obligationKind', 0.8)).toMatchObject({ replicationPass: false, go: false });
    expect(d.layer1).toBe('NO-GO');
  });

  it('partyRole: gv2 zählt nicht (Rollenraum 1.6.0), GO steht auf einem Gold-Set', () => {
    const d = decideSlice3(runs('partyRole', [PASS, PASS, PASS, PASS, PASS], [FAIL, FAIL]));
    const c = combo(d, 'partyRole', 0.8);
    expect(c.pooledGv2).toBeNull();
    expect(c.replicationPass).toBeNull();
    expect(c.go).toBe(true);
    expect(c.oneGoldSetOnly).toBe(true);
    expect(d.layer1).toBe('GO');
  });

  it('Prüf-Last wird berichtet, entscheidet aber nicht', () => {
    // 55 % Prüf-Last (33/60) — trotzdem GO, weil die Regel sie nicht kennt
    const HEAVY = { wrongLow: 30, wrongHigh: 0, rightLow: 3, rightHigh: 27 }; // Recall 100 %, FA 10 %
    const d = decideSlice3(runs('provisionKind', [HEAVY, HEAVY, HEAVY, HEAVY, HEAVY], [HEAVY, HEAVY]));
    const c = combo(d, 'provisionKind', 0.8);
    expect(c.reviewLoad).toBeCloseTo(33 / 60);
    expect(c.go).toBe(true);
  });

  it('liefert 6 Kombinationen (3 Achsen × Schwellen 0,8 und 1,0) und die Input-Hashes', () => {
    const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [PASS, PASS]));
    expect(d.combos.map((c) => `${c.axis}@${c.threshold}`).sort()).toEqual([
      'obligationKind@0.8', 'obligationKind@1', 'partyRole@0.8', 'partyRole@1', 'provisionKind@0.8', 'provisionKind@1',
    ]);
    expect(d.inputs).toHaveLength(7);
  });

  it('Achse ohne Daten → kein GO für diese Achse (keine falschen Fälle)', () => {
    const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [PASS, PASS]));
    expect(combo(d, 'provisionKind', 0.8).go).toBe(false);
  });

  it('ist deterministisch', () => {
    const r = runs('obligationKind', [PASS, PASS, PASS, PASS, FAIL], [PASS, PASS]);
    expect(JSON.stringify(decideSlice3(r))).toBe(JSON.stringify(decideSlice3(r)));
  });
});
