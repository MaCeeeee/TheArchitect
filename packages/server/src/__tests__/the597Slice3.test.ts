/**
 * THE-597 Slice 3 — Go/No-Go nach der Vorregistrierung vom 17.11.2026.
 * Reine Logik, kein LLM. Run: cd packages/server && npx jest src/__tests__/the597Slice3.test.ts
 */
import {
  decideSlice3,
  knownErrorClasses,
  meetsCriterion,
  parseRun,
  renderSlice3Report,
  SLICE3_GOLDEN_SHA256,
  SLICE3_INSTRUMENT,
  type GoldenId,
  type Slice3Run,
} from '../evals/the597Slice3';
import type { TypingEvalCase } from '../evals/typingMetrics';
import type { RoutingStat } from '../evals/metrics';

/** Ein Fall: Gold und Vorhersage je Achse, Konfidenz je Achse. */
function mkCase(
  id: string,
  gold: Record<string, string | null>,
  predicted: Record<string, string | null>,
  confidence: Record<string, number>
): TypingEvalCase {
  return { caseId: id, source: 's', language: 'en', gold, predicted, confidence } as unknown as TypingEvalCase;
}

function runJson(golden: GoldenId, cases: TypingEvalCase[], over: Record<string, unknown> = {}): string {
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
  mkCase(
    `c${i}`,
    { obligationKind: 'obligation' },
    { obligationKind: 'obligation' },
    { obligationKind: 1, partyRole: 1, provisionKind: 1 }
  )
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

  it('meldet ungültiges JSON und Nicht-Objekte mit Label', () => {
    expect(() => parseRun('gv3-run9', 'gv3', '{kaputt')).toThrow(/gv3-run9: kein gültiges JSON/);
    expect(() => parseRun('gv3-run9', 'gv3', 'null')).toThrow(/gv3-run9: kein gültiges JSON/);
    expect(() => parseRun('gv3-run9', 'gv3', '[]')).toThrow(/kein gültiges JSON/);
  });

  it('lehnt NaN/fehlende/außerhalb [0,1] liegende Konfidenz ab', () => {
    const predicted = { obligationKind: 'obligation', partyRole: 'x', provisionKind: 'y' };
    const bad = (conf: Record<string, unknown>) => [
      { ...one[0], predicted, confidence: conf },
      ...one.slice(1),
    ];
    const ok = { obligationKind: 1, partyRole: 1, provisionKind: 1 };
    // JSON.stringify macht NaN zu null → „nicht endlich“
    expect(() => parseRun('x', 'gv3', runJson('gv3', bad({ ...ok, partyRole: NaN }) as TypingEvalCase[]))).toThrow(/confidence ungültig: c0\/partyRole/);
    // Konfidenz fehlt, Vorhersage gesetzt → abgewiesen
    expect(() => parseRun('x', 'gv3', runJson('gv3', bad({ obligationKind: 1, partyRole: 1 }) as TypingEvalCase[]))).toThrow(/confidence ungültig: c0\/provisionKind/);
    expect(() => parseRun('x', 'gv3', runJson('gv3', bad({ ...ok, obligationKind: 1.5 }) as TypingEvalCase[]))).toThrow(/confidence/);
  });

  it('nimmt offene Achsen (Konfidenz und Vorhersage fehlen) an und zählt sie', () => {
    const open = (i: number) =>
      mkCase(`c${i}`, { obligationKind: 'obligation' }, { obligationKind: 'obligation' }, { obligationKind: 1, partyRole: 1 });
    const withPred = (i: number) => ({
      ...open(i),
      predicted: { obligationKind: 'obligation', partyRole: 'x' },
    });
    const cs = [...one.slice(2), open(0), withPred(1)].map((c) => ({ ...c })) as TypingEvalCase[];
    // c0: provisionKind weder Vorhersage noch Konfidenz → offen; c1 ebenso
    const run = parseRun('x', 'gv3', runJson('gv3', cs.map((c, i) => (i >= 68 ? { ...c, caseId: `o${i}` } : c)) as TypingEvalCase[]));
    expect(run.openByAxis).toEqual({ obligationKind: 0, partyRole: 0, provisionKind: 2 });
  });

  it('lehnt eine Vorhersage ohne Konfidenz ab (auch null = nicht anwendbar)', () => {
    const c0 = { ...one[0], predicted: { obligationKind: 'obligation', provisionKind: null }, confidence: { obligationKind: 1, partyRole: 1 } };
    expect(() => parseRun('x', 'gv3', runJson('gv3', [c0, ...one.slice(1)] as TypingEvalCase[]))).toThrow(/c0\/provisionKind/);
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
  return { label, golden, fileSha256: label.padEnd(64, '0'), cases, openByAxis: { obligationKind: 0, partyRole: 0, provisionKind: 0 } };
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

  it('Prüf-Last ist null bei leerem Nenner (Achse ohne Daten)', () => {
    const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [PASS, PASS]));
    expect(combo(d, 'provisionKind', 0.8).reviewLoad).toBeNull();
    expect(renderSlice3Report(d, [])).toMatch(/provisionKind \| < 0\.8[^\n]*\| — \| \*\*nein\*\*/);
  });

  it('Konfidenz genau 0,8: bei < 0,8 nicht geroutet, bei < 1,0 geroutet → Schwellen unterscheiden sich', () => {
    const mk = (label: string, golden: 'gv3' | 'gv2'): Slice3Run => {
      const cases: TypingEvalCase[] = [];
      for (let i = 0; i < 6; i++) cases.push(mkCase(`${label}-w${i}`, { obligationKind: 'a' }, { obligationKind: 'b' }, { obligationKind: 0.8 }));
      for (let i = 0; i < 4; i++) cases.push(mkCase(`${label}-x${i}`, { obligationKind: 'a' }, { obligationKind: 'b' }, { obligationKind: 1 }));
      for (let i = 0; i < 50; i++) cases.push(mkCase(`${label}-r${i}`, { obligationKind: 'a' }, { obligationKind: 'a' }, { obligationKind: 1 }));
      return { label, golden, fileSha256: label.padEnd(64, '0'), cases, openByAxis: { obligationKind: 0, partyRole: 0, provisionKind: 0 } };
    };
    const d = decideSlice3([1, 2, 3, 4, 5].map((i) => mk(`gv3-run${i}`, 'gv3')).concat([1, 2].map((i) => mk(`gv2-run${i}`, 'gv2'))));
    expect(combo(d, 'obligationKind', 0.8).pooledGv3.recall).toBe(0);
    expect(combo(d, 'obligationKind', 0.8).go).toBe(false);
    expect(combo(d, 'obligationKind', 1).pooledGv3.recall).toBeCloseTo(0.6);
    expect(combo(d, 'obligationKind', 1).go).toBe(true);
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

  it('ist unabhängig von der Reihenfolge der Läufe', () => {
    const r = runs('obligationKind', [PASS, PASS, PASS, PASS, FAIL], [PASS, PASS]);
    const a = decideSlice3(r);
    const b = decideSlice3([...r].reverse());
    expect(b.layer1).toBe(a.layer1);
    expect(b.goCombos).toEqual(a.goCombos);
    expect(b.combos.map(({ perRunGv3: _p, ...rest }) => rest)).toEqual(a.combos.map(({ perRunGv3: _p, ...rest }) => rest));
  });
});

describe('knownErrorClasses', () => {
  it('zählt je Fehlerklasse Gold, falsch und geroutet (< 0,8 / < 1,0), gepoolt über gv3', () => {
    const gv3 = [
      mkCase('a', { obligationKind: 'prohibition' }, { obligationKind: 'obligation' }, { obligationKind: 0.6 }),
      mkCase('b', { obligationKind: 'prohibition' }, { obligationKind: 'obligation' }, { obligationKind: 1 }),
      mkCase('c', { obligationKind: 'prohibition' }, { obligationKind: 'prohibition' }, { obligationKind: 1 }),
    ];
    const r: Slice3Run[] = [{ label: 'gv3-run1', golden: 'gv3', fileSha256: 'x'.repeat(64), cases: gv3, openByAxis: { obligationKind: 0, partyRole: 0, provisionKind: 0 } }];
    const f04 = knownErrorClasses(r).find((k) => k.id === 'F-04')!;
    expect(f04).toMatchObject({ axis: 'obligationKind', goldClass: 'prohibition', gold: 3, wrong: 2, routedBelow08: 1, routedBelow10: 1 });
  });

  it('ignoriert gv2-Läufe', () => {
    const r: Slice3Run[] = [{
      label: 'gv2-run1', golden: 'gv2', fileSha256: 'y'.repeat(64), openByAxis: { obligationKind: 0, partyRole: 0, provisionKind: 0 },
      cases: [mkCase('a', { obligationKind: 'prohibition' }, { obligationKind: 'obligation' }, { obligationKind: 0.6 })],
    }];
    expect(knownErrorClasses(r).find((k) => k.id === 'F-04')).toMatchObject({ gold: 0, wrong: 0 });
  });
});

describe('renderSlice3Report', () => {
  const d = decideSlice3(runs('obligationKind', [PASS, PASS, PASS, PASS, PASS], [PASS, PASS]));
  const md = renderSlice3Report(d, []);

  it('nennt das Verdikt und verweist auf die Vorregistrierung', () => {
    expect(md).toMatch(/Schicht 1: \*\*GO\*\*/);
    expect(md).toContain('docs/evals/the597-slice3-vorregistrierung.md');
  });
  it('listet alle 7 Input-Hashes', () => {
    for (const i of d.inputs) expect(md).toContain(i.fileSha256);
  });
  it('weist offen gebliebene Fälle je Lauf aus und zeigt Prüf-Last mit Zählung', () => {
    expect(md).toContain('Offen geblieben (alle k Aufrufe ohne Wert, wie in Slice 1 übersprungen)');
    expect(md).toMatch(/\| gv3-run1 \| 0 \| 0 \| 0 \|/);
    expect(md).toMatch(/obligationKind \| < 0\.8[^\n]*\| 13\.3 % \(40\/300\)/);
  });
  it('markiert die Prüf-Last als nicht entscheidend und partyRole-Replikation als entfallen', () => {
    expect(md).toMatch(/Prüf-Last.*entscheidet nicht/);
    expect(md).toMatch(/partyRole[^\n]*entfällt/);
  });
  it('NO-GO wird als NO-GO gerendert', () => {
    const no = decideSlice3(runs('obligationKind', [FAIL, FAIL, FAIL, FAIL, FAIL], [FAIL, FAIL]));
    expect(renderSlice3Report(no, [])).toMatch(/Schicht 1: \*\*NO-GO\*\*/);
  });
});
