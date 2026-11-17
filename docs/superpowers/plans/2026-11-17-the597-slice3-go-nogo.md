# THE-597 Slice 3 — Go/No-Go für Schicht 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die am 17.11.2026 freigegebene Entscheidungsregel mechanisch auf 7 Läufe anwenden und daraus ein binäres GO/NO-GO für Schicht 1 (Kalibrierung/Schwelle) liefern — Grundlage dafür, ob THE-606 gebaut wird.

**Spec:** `docs/evals/the597-slice3-vorregistrierung.md` (freigegeben 17.11.2026, Kommentar an THE-597). **Die Regel dort ist bindend; dieser Plan setzt sie um und ändert sie nicht.**

**Architecture:** Eine reine, LLM-freie Modul-Datei `the597Slice3.ts` (Lauf parsen + Instrument prüfen, Kriterium, Entscheidung, Markdown) auf den vorhandenen Bausteinen `axisCalibrationSamples` und `thresholdRoutingStats`. Ein dünnes CLI-Skript liest die 7 Lauf-JSONs aus `docs/evals/` und schreibt den Ergebnisbericht. Die 5 neuen Live-Läufe macht die **Session**, nicht ein Subagent, erst wenn der Code fertig und geprüft ist.

**Tech Stack:** TypeScript (strict), Jest + ts-jest (transpile-only — Typfehler findet nur `tsc`), ts-node, vorhandener `npm run typing:eval`.

**RVTM:** `docs/superpowers/rvtm/2026-11-17-the597-slice3-go-nogo-rvtm.md`

**Prüfszenarien (versiegelt):** `docs/superpowers/pruefszenarien/2026-11-17-the597-slice3-go-nogo-pruefszenarien.md` — implementers must not read this file

**Linear:** THE-597 (In Progress seit 17.11.). Branch `feat/the-597-slice3` trägt THE-597 absichtlich: der Merge darf THE-597 schließen, der Ergebnis-Kommentar kommt von Hand. **THE-604 und THE-606 nie im Branch- oder Commit-Titel** — sie dürfen nicht automatisch schließen.

---

## Rahmen

- **Worktree:** `/Users/mac_macee/javis-the597-s3` (Branch `feat/the-597-slice3`, Basis `origin/master` 5b7c7fd, ohne Upstream). `.env` und `packages/server/.env` sind Symlinks ins Hauptrepo. `npm install` ist gelaufen; `node_modules/@thearchitect/shared` zeigt auf `../../packages/shared` **dieses** Worktrees.
- **`packages/shared/dist`** ist am 17.11. im Worktree clean gebaut (`tsc -b`, `dist/typing/prompt.js` trägt `'tp-4'`). Server-Code löst `@thearchitect/shared` über `dist` auf — ohne Build scheitern Tests, CLI und `typing:eval`. **Ändert niemand `packages/shared`**, muss nicht neu gebaut werden; Task 4 baut vor der Messung trotzdem noch einmal clean.
- **Vorregistrierung, Plan, RVTM und Prüfszenarien** sind der erste Commit auf dem Branch — vor jeder Implementierung und jeder Messung.
- **Alle Befehle** laufen in `/Users/mac_macee/javis-the597-s3/packages/server`, sofern nicht anders angegeben.
- **Subagenten führen NIE `npm run typing:eval` aus** und rufen keine LLM-API. Live-Läufe kosten Geld und verändern die Evidenz. Nur Task 4 (Session) misst live.
- **Evidenz liegt in `docs/evals/`** (`src/evals/reports/` ist gitignored).
- Bestehende Bausteine (nicht ändern):
  - `src/evals/metrics.ts:338` `CalibrationSample {confidence, correct}`
  - `src/evals/metrics.ts:478` `RoutingStat {threshold, wrong, correct, caught, falseAlarms, recall, falseAlarmRate}`; `:502` `thresholdRoutingStats(samples, thresholds)` — Schwellen **exklusiv** (`confidence < t`)
  - `src/evals/typingMetrics.ts:154` `axisCalibrationSamples(cases, axis)` — ein Sample je Fall mit Gold **und** Konfidenz; Gold `undefined` wird übersprungen
  - `src/evals/typingMetrics.ts:29` `TypingEvalCase {caseId, source, gold, predicted, confidence?}`; `TypingAxis` aus `./typingGolden`
- **Lauf-JSON** (geschrieben von `runTypingEval.ts:448`): Top-Level `variante, model, samples, report, oovDrops, majority, the597, cases`; `the597.goldenSha256` ist der SHA-256 der Golden-Datei. Die zwei Slice-1-Läufe liegen schon im Repo: `docs/evals/the597-typing-gv3-sc5-run1.json` (Lauf 1) und `docs/evals/the597-typing-gv3-sc5.json` (Lauf 2).
- **Vorregistrierte Konstanten:** Modell `claude-haiku-4-5-20251001`, k = 5, Prompt `tp-4`; Golden-Hashes gv3 `af57f9f52f7fcae330562b271a957cc585a0071d8aadced9d83aa68f33091b11`, gv2 `39e09d58d20391ee89a95b687157862286f13f12219ce98f9dd0ddb5b1a006a3`; Achsen obligationKind, partyRole, provisionKind; Schwellen 0,8 und 1,0; Kriterium Recall ≥ 0,5 **und** Fehlalarm ≤ 0,1; Stabilität ≥ 4 von 5; Replikation nur obligationKind/provisionKind.

## File Structure

| Datei | Aktion | Verantwortung |
|---|---|---|
| `packages/server/src/evals/the597Slice3.ts` | Create | Vorregistrierte Konstanten, `parseRun`, `meetsCriterion`, `decideSlice3`, `knownErrorClasses`, `renderSlice3Report`. Rein, kein I/O außer Hash. |
| `packages/server/src/__tests__/the597Slice3.test.ts` | Create | Unit-Tests mit synthetischen Läufen. |
| `packages/server/src/scripts/the597-slice3.ts` | Create | CLI: 7 Dateien lesen → Entscheidung → `docs/evals/the597-slice3-ergebnis.{md,json}`. |
| `packages/server/scripts/the597-slice3-runs.sh` | Create (Task 4) | Die 5 Live-Läufe; holt nur fehlende nach, überschreibt nie. |
| `docs/evals/the597-slice3/` | Create (Task 4) | Die 5 neuen Läufe (`gv3-run3..5`, `gv2-run1..2`, je `.json` + `.md`). |
| `docs/evals/the597-slice3-ergebnis.{md,json}` | Create (Task 5) | Ergebnisbericht. |
| `docs/evals/the597-fehlerfall-register.md` | Modify (Task 5) | Abschnitt E „Slice-3-Ergebnis" anhängen. |

---

## Chunk 1: Entscheidungslogik (LLM-frei)

### Task 1: Lauf einlesen und Instrument prüfen

**Files:**
- Create: `packages/server/src/evals/the597Slice3.ts`
- Test: `packages/server/src/__tests__/the597Slice3.test.ts`

- [ ] **Step 1: Failing test schreiben**

```ts
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx jest src/__tests__/the597Slice3.test.ts`
Expected: FAIL — `Cannot find module '../evals/the597Slice3'`

- [ ] **Step 3: Minimale Implementierung**

```ts
/**
 * THE-597 Slice 3 — Go/No-Go für Schicht 1 (Kalibrierung/Schwelle).
 *
 * Setzt die am 17.11.2026 freigegebene Vorregistrierung mechanisch um
 * (docs/evals/the597-slice3-vorregistrierung.md). Jede Konstante hier steht
 * dort; wer eine ändert, ändert die Regel nach dem Blick auf die Daten.
 * Rein und LLM-frei.
 */
import { createHash } from 'crypto';
import type { TypingEvalCase } from './typingMetrics';

export const SLICE3_INSTRUMENT = {
  model: 'claude-haiku-4-5-20251001',
  samples: 5,
  variante: 'tp-4',
} as const;

export const SLICE3_GOLDEN_SHA256 = {
  gv3: 'af57f9f52f7fcae330562b271a957cc585a0071d8aadced9d83aa68f33091b11',
  gv2: '39e09d58d20391ee89a95b687157862286f13f12219ce98f9dd0ddb5b1a006a3',
} as const;

export type GoldenId = keyof typeof SLICE3_GOLDEN_SHA256;

/** gv3 und gv2 haben je 70 Fälle (beide frozen). */
export const SLICE3_CASES = 70;

export interface Slice3Run {
  label: string;
  golden: GoldenId;
  /** SHA-256 der Lauf-Datei — Input-Hash des Berichts (AC-1). */
  fileSha256: string;
  cases: TypingEvalCase[];
}

interface RawRun {
  model?: unknown;
  samples?: unknown;
  variante?: unknown;
  the597?: { goldenSha256?: unknown };
  cases?: unknown;
}

/** Liest einen Lauf und weist alles ab, was nicht zum vorregistrierten Instrument passt. */
export function parseRun(label: string, golden: GoldenId, raw: string): Slice3Run {
  const j = JSON.parse(raw) as RawRun;
  const errs: string[] = [];
  if (j.model !== SLICE3_INSTRUMENT.model) errs.push(`model=${String(j.model)}`);
  if (j.samples !== SLICE3_INSTRUMENT.samples) errs.push(`samples=${String(j.samples)}`);
  if (j.variante !== SLICE3_INSTRUMENT.variante) errs.push(`variante=${String(j.variante)}`);
  if (j.the597?.goldenSha256 !== SLICE3_GOLDEN_SHA256[golden]) {
    errs.push(`goldenSha256=${String(j.the597?.goldenSha256)}`);
  }
  if (!Array.isArray(j.cases) || j.cases.length !== SLICE3_CASES) {
    errs.push(`cases=${Array.isArray(j.cases) ? j.cases.length : 'fehlen'} statt ${SLICE3_CASES}`);
  } else if (new Set((j.cases as Array<{ caseId?: unknown }>).map((c) => c.caseId)).size !== SLICE3_CASES) {
    errs.push('cases: caseId doppelt');
  }
  if (errs.length) {
    throw new Error(`[the597-slice3] ${label}: passt nicht zum vorregistrierten Instrument (${errs.join(', ')})`);
  }
  return {
    label,
    golden,
    fileSha256: createHash('sha256').update(raw).digest('hex'),
    cases: j.cases as TypingEvalCase[],
  };
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npx jest src/__tests__/the597Slice3.test.ts`
Expected: PASS (8 Tests)

- [ ] **Step 5: Typen prüfen**

Run: `npx tsc --noEmit -p .`
Expected: keine Fehler (ts-jest ist transpile-only und sieht Typfehler nicht).

- [ ] **Step 6: Commit**

```bash
git add src/evals/the597Slice3.ts src/__tests__/the597Slice3.test.ts
git commit -m "feat(evals): THE-597 Slice 3 — Lauf einlesen, Instrument gegen Vorregistrierung prüfen"
```

### Task 2: Kriterium und Entscheidung

**Files:**
- Modify: `packages/server/src/evals/the597Slice3.ts`
- Test: `packages/server/src/__tests__/the597Slice3.test.ts`

Begriffe: Eine **Kombination** ist (Achse, Schwelle). **Prüf-Last** = (gefangene + Fehlalarme) / (falsche + richtige), gepoolt über gv3.

- [ ] **Step 1: Failing tests anhängen** (die `import`-Zeilen an den Dateianfang zu den vorhandenen Imports, den Rest ans Ende; dasselbe gilt in Task 3)

```ts
import { decideSlice3, meetsCriterion, type Slice3Run } from '../evals/the597Slice3';
import type { RoutingStat } from '../evals/metrics';

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
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npx jest src/__tests__/the597Slice3.test.ts`
Expected: FAIL — `decideSlice3 is not a function` / `meetsCriterion` nicht exportiert.

- [ ] **Step 3: Implementierung anhängen** (an `the597Slice3.ts`; die Import-Zeile `import type { TypingEvalCase } from './typingMetrics';` ersetzen durch die beiden Zeilen unten)

```ts
// ersetzt den TypingEvalCase-Import aus Task 1:
import { thresholdRoutingStats, type RoutingStat } from './metrics';
import { axisCalibrationSamples, type TypingEvalCase } from './typingMetrics';
```

```ts
export const SLICE3_AXES = ['obligationKind', 'partyRole', 'provisionKind'] as const;
export type Slice3Axis = (typeof SLICE3_AXES)[number];
export const SLICE3_THRESHOLDS = [0.8, 1.0] as const;
/** Nur diese Achsen werden auf gv2 repliziert — gv2 ist im Rollenraum 1.6.0 gelabelt, tp-4 kennt 1.7.0. */
export const REPLICATION_AXES: readonly Slice3Axis[] = ['obligationKind', 'provisionKind'];
export const SLICE3_RUN_COUNT = { gv3: 5, gv2: 2 } as const;
export const MIN_RECALL = 0.5;
export const MAX_FALSE_ALARM = 0.1;
export const MIN_STABLE_RUNS = 4;

/**
 * Kill-Kriterium vom 20.09.2026. Leerer Nenner (keine falschen oder keine richtigen Fälle) =
 * nicht erfüllt — Klarstellung in der Vorregistrierung vom 17.11.2026, Abschnitt Entscheidungsregel.
 */
export function meetsCriterion(s: RoutingStat): boolean {
  return s.wrong > 0 && s.correct > 0 && s.recall >= MIN_RECALL && s.falseAlarmRate <= MAX_FALSE_ALARM;
}

function routingAt(cases: TypingEvalCase[], axis: Slice3Axis, threshold: number): RoutingStat {
  return thresholdRoutingStats(axisCalibrationSamples(cases, axis), [threshold])[0];
}

function pooled(runs: Slice3Run[]): TypingEvalCase[] {
  return runs.flatMap((r) => r.cases);
}

export interface ComboVerdict {
  axis: Slice3Axis;
  threshold: number;
  pooledGv3: RoutingStat;
  pooledGv3Pass: boolean;
  perRunGv3: Array<{ label: string; stat: RoutingStat; pass: boolean }>;
  stableRuns: number;
  stablePass: boolean;
  /** null = Replikation entfällt (partyRole). */
  pooledGv2: RoutingStat | null;
  replicationPass: boolean | null;
  /** (gefangen + Fehlalarme) / alle Samples, gepoolt über gv3. Berichtet, entscheidet nicht. */
  reviewLoad: number;
  go: boolean;
  /** GO ohne Replikation — steht auf einem Gold-Set. */
  oneGoldSetOnly: boolean;
}

export interface Slice3Decision {
  layer1: 'GO' | 'NO-GO';
  goCombos: Array<{ axis: Slice3Axis; threshold: number }>;
  combos: ComboVerdict[];
  inputs: Array<{ label: string; golden: GoldenId; fileSha256: string }>;
}

export function decideSlice3(runs: Slice3Run[]): Slice3Decision {
  const gv3 = runs.filter((r) => r.golden === 'gv3');
  const gv2 = runs.filter((r) => r.golden === 'gv2');
  if (gv3.length !== SLICE3_RUN_COUNT.gv3 || gv2.length !== SLICE3_RUN_COUNT.gv2) {
    throw new Error(
      `[the597-slice3] Vorregistrierung verlangt ${SLICE3_RUN_COUNT.gv3} gv3- und ${SLICE3_RUN_COUNT.gv2} gv2-Läufe, bekam ${gv3.length}/${gv2.length}`
    );
  }
  if (new Set(runs.map((r) => r.label)).size !== runs.length) {
    throw new Error('[the597-slice3] Label doppelt vergeben');
  }
  if (new Set(runs.map((r) => r.fileSha256)).size !== runs.length) {
    throw new Error('[the597-slice3] Zwei Läufe sind byte-identisch — dieselbe Datei doppelt gezählt?');
  }

  const combos: ComboVerdict[] = [];
  for (const axis of SLICE3_AXES) {
    for (const threshold of SLICE3_THRESHOLDS) {
      const pooledGv3 = routingAt(pooled(gv3), axis, threshold);
      const perRunGv3 = gv3.map((r) => {
        const stat = routingAt(r.cases, axis, threshold);
        return { label: r.label, stat, pass: meetsCriterion(stat) };
      });
      const stableRuns = perRunGv3.filter((p) => p.pass).length;
      const replicates = REPLICATION_AXES.includes(axis);
      const pooledGv2 = replicates ? routingAt(pooled(gv2), axis, threshold) : null;
      const replicationPass = pooledGv2 ? meetsCriterion(pooledGv2) : null;
      const pooledGv3Pass = meetsCriterion(pooledGv3);
      const stablePass = stableRuns >= MIN_STABLE_RUNS;
      const go = pooledGv3Pass && stablePass && replicationPass !== false;
      const total = pooledGv3.wrong + pooledGv3.correct;
      combos.push({
        axis,
        threshold,
        pooledGv3,
        pooledGv3Pass,
        perRunGv3,
        stableRuns,
        stablePass,
        pooledGv2,
        replicationPass,
        reviewLoad: total ? (pooledGv3.caught + pooledGv3.falseAlarms) / total : 0,
        go,
        oneGoldSetOnly: go && replicationPass === null,
      });
    }
  }
  const goCombos = combos.filter((c) => c.go).map((c) => ({ axis: c.axis, threshold: c.threshold }));
  return {
    layer1: goCombos.length ? 'GO' : 'NO-GO',
    goCombos,
    combos,
    inputs: runs.map((r) => ({ label: r.label, golden: r.golden, fileSha256: r.fileSha256 })),
  };
}
```

- [ ] **Step 4: Tests grün**

Run: `npx jest src/__tests__/the597Slice3.test.ts`
Expected: PASS (alle)

- [ ] **Step 5: Typen**

Run: `npx tsc --noEmit -p .`
Expected: keine Fehler

- [ ] **Step 6: Commit**

```bash
git add src/evals/the597Slice3.ts src/__tests__/the597Slice3.test.ts
git commit -m "feat(evals): THE-597 Slice 3 — Kriterium, Stabilität, Replikation, binäres GO/NO-GO"
```

### Task 3: Bekannte Fehlerklassen, Bericht und CLI

**Files:**
- Modify: `packages/server/src/evals/the597Slice3.ts`
- Create: `packages/server/src/scripts/the597-slice3.ts`
- Test: `packages/server/src/__tests__/the597Slice3.test.ts`

Die Fehlerklassen F-04…F-07 aus dem Register werden **beschreibend** berichtet (gepoolt über gv3), sie entscheiden nichts:

| ID | Achse | Gold-Klasse |
|---|---|---|
| F-04 | obligationKind | prohibition |
| F-05 | partyRole | supervisory_authority |
| F-06 | provisionKind | procedural |
| F-07 | partyRole | member_state |

- [ ] **Step 1: Failing tests anhängen**

```ts
import { knownErrorClasses, renderSlice3Report } from '../evals/the597Slice3';

describe('knownErrorClasses', () => {
  it('zählt je Fehlerklasse Gold, falsch und geroutet (< 0,8 / < 1,0), gepoolt über gv3', () => {
    const gv3 = [
      mkCase('a', { obligationKind: 'prohibition' }, { obligationKind: 'obligation' }, { obligationKind: 0.6 }),
      mkCase('b', { obligationKind: 'prohibition' }, { obligationKind: 'obligation' }, { obligationKind: 1 }),
      mkCase('c', { obligationKind: 'prohibition' }, { obligationKind: 'prohibition' }, { obligationKind: 1 }),
    ];
    const r: Slice3Run[] = [{ label: 'gv3-run1', golden: 'gv3', fileSha256: 'x'.repeat(64), cases: gv3 }];
    const f04 = knownErrorClasses(r).find((k) => k.id === 'F-04')!;
    expect(f04).toMatchObject({ axis: 'obligationKind', goldClass: 'prohibition', gold: 3, wrong: 2, routedBelow08: 1, routedBelow10: 1 });
  });

  it('ignoriert gv2-Läufe', () => {
    const r: Slice3Run[] = [{
      label: 'gv2-run1', golden: 'gv2', fileSha256: 'y'.repeat(64),
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
  it('markiert die Prüf-Last als nicht entscheidend und partyRole-Replikation als entfallen', () => {
    expect(md).toMatch(/Prüf-Last.*entscheidet nicht/);
    expect(md).toMatch(/partyRole[^\n]*entfällt/);
  });
  it('NO-GO wird als NO-GO gerendert', () => {
    const no = decideSlice3(runs('obligationKind', [FAIL, FAIL, FAIL, FAIL, FAIL], [FAIL, FAIL]));
    expect(renderSlice3Report(no, [])).toMatch(/Schicht 1: \*\*NO-GO\*\*/);
  });
});
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npx jest src/__tests__/the597Slice3.test.ts`
Expected: FAIL — `knownErrorClasses` / `renderSlice3Report` nicht exportiert.

- [ ] **Step 3: Implementierung anhängen**

```ts
export const KNOWN_ERROR_CLASSES = [
  { id: 'F-04', axis: 'obligationKind', goldClass: 'prohibition' },
  { id: 'F-05', axis: 'partyRole', goldClass: 'supervisory_authority' },
  { id: 'F-06', axis: 'provisionKind', goldClass: 'procedural' },
  { id: 'F-07', axis: 'partyRole', goldClass: 'member_state' },
] as const;

export interface KnownErrorClassStat {
  id: string;
  axis: Slice3Axis;
  goldClass: string;
  gold: number;
  wrong: number;
  routedBelow08: number;
  routedBelow10: number;
}

/** Beschreibend, gepoolt über gv3 — entscheidet nichts (Vorregistrierung, Abschnitt Instrument). */
export function knownErrorClasses(runs: Slice3Run[]): KnownErrorClassStat[] {
  const cases = pooled(runs.filter((r) => r.golden === 'gv3'));
  return KNOWN_ERROR_CLASSES.map(({ id, axis, goldClass }) => {
    const inClass = cases.filter((c) => (c.gold as Record<string, unknown>)[axis] === goldClass);
    const wrong = inClass.filter((c) => (c.predicted as Record<string, unknown>)[axis] !== goldClass);
    const conf = (c: TypingEvalCase) => c.confidence?.[axis];
    return {
      id,
      axis,
      goldClass,
      gold: inClass.length,
      wrong: wrong.length,
      routedBelow08: wrong.filter((c) => (conf(c) ?? Infinity) < 0.8).length,
      routedBelow10: wrong.filter((c) => (conf(c) ?? Infinity) < 1.0).length,
    };
  });
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
/** Leerer Nenner → „—" statt 0 % (Konvention aus metrics.ts, THE-597 R-003). */
const rate = (n: number, d: number) => (d ? `${pct(n / d)} (${n}/${d})` : '—');
const thr = (t: number) => `< ${t.toFixed(1)}`;
const yn = (b: boolean | null) => (b === null ? 'entfällt' : b ? 'ja' : 'nein');

export function renderSlice3Report(d: Slice3Decision, known: KnownErrorClassStat[]): string {
  const L: string[] = [];
  L.push('# THE-597 Slice 3 — Ergebnis: Go/No-Go für Schicht 1');
  L.push('');
  L.push('Regel: `docs/evals/the597-slice3-vorregistrierung.md` (freigegeben 17.11.2026, vor der Messung).');
  L.push(
    `Instrument: \`${SLICE3_INSTRUMENT.model}\` · Prompt \`${SLICE3_INSTRUMENT.variante}\` · k = ${SLICE3_INSTRUMENT.samples} · Kriterium Recall ≥ ${pct(MIN_RECALL)} und Fehlalarm ≤ ${pct(MAX_FALSE_ALARM)} · stabil in ≥ ${MIN_STABLE_RUNS} von ${SLICE3_RUN_COUNT.gv3} gv3-Läufen · repliziert auf gv2 (nur ${REPLICATION_AXES.join(', ')}).`
  );
  L.push('');
  const goText = d.goCombos.map((g) => `${g.axis} ${thr(g.threshold)}`).join(', ');
  L.push(`## Verdikt — Schicht 1: **${d.layer1}**${d.layer1 === 'GO' ? ` (${goText})` : ''}`);
  L.push('');
  if (d.combos.some((c) => c.oneGoldSetOnly)) {
    L.push('⚠️ Mindestens ein GO steht auf **einem** Gold-Set (partyRole, keine Replikation möglich).');
    L.push('');
  }
  L.push('## Kombinationen');
  L.push('');
  L.push('| Achse | Schwelle | Recall gepoolt gv3 | Fehlalarm gepoolt gv3 | gepoolt erfüllt | stabil (Läufe) | gv2 repliziert | Prüf-Last | GO |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of d.combos) {
    L.push(
      `| ${c.axis} | ${thr(c.threshold)} | ${rate(c.pooledGv3.caught, c.pooledGv3.wrong)} | ${rate(c.pooledGv3.falseAlarms, c.pooledGv3.correct)} | ${yn(c.pooledGv3Pass)} | ${c.stableRuns}/${c.perRunGv3.length} | ${yn(c.replicationPass)}${c.pooledGv2 ? ` (${rate(c.pooledGv2.caught, c.pooledGv2.wrong)} / ${rate(c.pooledGv2.falseAlarms, c.pooledGv2.correct)})` : ''} | ${rate(c.pooledGv3.caught + c.pooledGv3.falseAlarms, c.pooledGv3.wrong + c.pooledGv3.correct)} | **${c.go ? 'GO' : 'nein'}** |`
    );
  }
  L.push('');
  L.push('Prüf-Last = Anteil aller gv3-Samples, die ein Mensch sehen müsste. Sie wird berichtet und entscheidet nicht (stand nicht im Kriterium vom 20.09.2026).');
  L.push('');
  L.push('## Einzelläufe gv3 (Recall / Fehlalarm)');
  L.push('');
  L.push(`| Achse | Schwelle | ${d.combos[0]?.perRunGv3.map((p) => p.label).join(' | ') ?? ''} |`);
  L.push(`|---|---|${d.combos[0]?.perRunGv3.map(() => '---|').join('') ?? ''}`);
  for (const c of d.combos) {
    L.push(
      `| ${c.axis} | ${thr(c.threshold)} | ${c.perRunGv3.map((p) => `${rate(p.stat.caught, p.stat.wrong)} / ${rate(p.stat.falseAlarms, p.stat.correct)}${p.pass ? ' ✓' : ''}`).join(' | ')} |`
    );
  }
  L.push('');
  if (known.length) {
    L.push('## Bekannte Fehlerklassen (beschreibend, gepoolt über gv3 — entscheidet nicht)');
    L.push('');
    L.push('Gezählt wird die Gold-Seite: Fälle mit dieser Gold-Klasse, die falsch klassifiziert wurden (bei F-07 war im Register die Precision das Problem; diese Seite sieht die Tabelle nicht).');
    L.push('');
    L.push('| ID | Achse | Gold-Klasse | Gold | falsch | davon < 0,8 | davon < 1,0 |');
    L.push('|---|---|---|---|---|---|---|');
    for (const k of known) {
      L.push(`| ${k.id} | ${k.axis} | ${k.goldClass} | ${k.gold} | ${k.wrong} | ${k.routedBelow08} | ${k.routedBelow10} |`);
    }
    L.push('');
  }
  L.push('## Inputs (SHA-256 der Lauf-Dateien)');
  L.push('');
  L.push('| Lauf | Golden | SHA-256 |');
  L.push('|---|---|---|');
  for (const i of d.inputs) L.push(`| ${i.label} | ${i.golden} | \`${i.fileSha256}\` |`);
  L.push('');
  return L.join('\n');
}
```

- [ ] **Step 4: Tests grün**

Run: `npx jest src/__tests__/the597Slice3.test.ts`
Expected: PASS

- [ ] **Step 5: CLI schreiben** — `packages/server/src/scripts/the597-slice3.ts`

```ts
/**
 * THE-597 Slice 3 — wendet die Vorregistrierung auf die 7 Läufe an.
 * LLM-frei. Run: cd packages/server && npx ts-node -T src/scripts/the597-slice3.ts
 */
import fs from 'fs';
import path from 'path';
import {
  decideSlice3,
  knownErrorClasses,
  parseRun,
  renderSlice3Report,
  type GoldenId,
} from '../evals/the597Slice3';

const DOCS = path.resolve(__dirname, '../../../../docs/evals');

const RUNS: Array<[label: string, golden: GoldenId, file: string]> = [
  ['gv3-run1', 'gv3', 'the597-typing-gv3-sc5-run1.json'],
  ['gv3-run2', 'gv3', 'the597-typing-gv3-sc5.json'],
  ['gv3-run3', 'gv3', 'the597-slice3/gv3-run3.json'],
  ['gv3-run4', 'gv3', 'the597-slice3/gv3-run4.json'],
  ['gv3-run5', 'gv3', 'the597-slice3/gv3-run5.json'],
  ['gv2-run1', 'gv2', 'the597-slice3/gv2-run1.json'],
  ['gv2-run2', 'gv2', 'the597-slice3/gv2-run2.json'],
];

function main(): void {
  const runs = RUNS.map(([label, golden, file]) => {
    const p = path.join(DOCS, file);
    if (!fs.existsSync(p)) throw new Error(`[the597-slice3] Lauf fehlt: ${p}`);
    return parseRun(label, golden, fs.readFileSync(p, 'utf8'));
  });
  const decision = decideSlice3(runs);
  const known = knownErrorClasses(runs);
  const md = renderSlice3Report(decision, known);
  fs.writeFileSync(path.join(DOCS, 'the597-slice3-ergebnis.md'), md + '\n');
  fs.writeFileSync(path.join(DOCS, 'the597-slice3-ergebnis.json'), JSON.stringify({ decision, known }, null, 2) + '\n');
  console.log(`[the597-slice3] Schicht 1: ${decision.layer1}`);
}

main();
```

- [ ] **Step 6: CLI-Fehlerpfad prüfen (ohne neue Läufe, ohne LLM)**

Run: `npx ts-node -T src/scripts/the597-slice3.ts`
Expected: Exit ≠ 0 mit `Lauf fehlt: …/docs/evals/the597-slice3/gv3-run3.json` — die zwei Slice-1-Läufe davor werden fehlerfrei gelesen (sonst stünde dort ein Instrument-Fehler für `gv3-run1`/`gv3-run2`).

- [ ] **Step 7: Typen + gesamte Datei-Suite**

Run: `npx tsc --noEmit -p . && npx jest src/__tests__/the597Slice3.test.ts src/__tests__/the597Routing.test.ts`
Expected: keine Typfehler, beide Suiten PASS

- [ ] **Step 8: Commit**

```bash
git add src/evals/the597Slice3.ts src/scripts/the597-slice3.ts src/__tests__/the597Slice3.test.ts
git commit -m "feat(evals): THE-597 Slice 3 — Fehlerklassen, Ergebnisbericht und CLI"
```

---

## Chunk 2: Messung und Ergebnis (nur Session)

### Task 4: Fünf Live-Läufe (Session, kein Subagent)

**Voraussetzung (sonst stoppen):**
1. Chunk 1 ist abgenommen (Review + Tests grün).
2. Der User hat die Vorregistrierung **inklusive der Klarstellung „leerer Nenner" vom 17.11.** freigegeben, und sie ist committet:
   ```bash
   cd /Users/mac_macee/javis-the597-s3
   git log --oneline -- docs/evals/the597-slice3-vorregistrierung.md   # ≥ 1 Commit
   git status --short docs/evals/the597-slice3-vorregistrierung.md     # leer
   ```

Kosten ≈ 1.750 Haiku-Aufrufe.

- [ ] **Step 0: shared clean bauen** (gemessen wird mit `dist`, nicht mit `src`)

```bash
cd /Users/mac_macee/javis-the597-s3/packages/shared
rm -rf dist; find . -maxdepth 1 -name '*.tsbuildinfo' -delete
npm run build
grep -n "TYPING_PROMPT_VERSION = '" dist/typing/prompt.js
```
Expected: Build ohne Fehler; genau eine Zeile `exports.TYPING_PROMPT_VERSION = 'tp-4';`

- [ ] **Step 1: Instrument-Stand bestätigen** — nichts am Instrument hat sich seit Slice 1 geändert:

```bash
cd /Users/mac_macee/javis-the597-s3
grep -n "TYPING_PROMPT_VERSION = " packages/shared/src/typing/prompt.ts
grep -n "const DEFAULT_MODEL" packages/server/src/evals/runTypingEval.ts
grep -n "^ANTHROPIC_MODEL" packages/server/.env || echo "kein Override in .env"
echo "Shell: ${ANTHROPIC_MODEL:-unset}"
```
Expected: `'tp-4'`; `'claude-haiku-4-5-20251001'`; in `.env` entweder `kein Override in .env` **oder** genau `ANTHROPIC_MODEL=claude-haiku-4-5-20251001` (Stand 17.11.: Zeile 58); Shell `unset` **oder** genau `claude-haiku-4-5-20251001` (die Shell-Variable hat Vorrang vor `.env`). Jeder andere Wert: **stoppen** — das wäre ein anderes Instrument.

- [ ] **Step 2: Lauf-Skript anlegen** — `packages/server/scripts/the597-slice3-runs.sh` (eigene Datei statt Copy-Paste-Schleife: ein `exit` schließt so kein interaktives Terminal, und ein fertiger, bezahlter Lauf wird nie überschrieben)

```bash
#!/usr/bin/env bash
# THE-597 Slice 3 — die 5 vorregistrierten Live-Läufe (docs/evals/the597-slice3-vorregistrierung.md).
# Holt nur FEHLENDE Läufe nach; ein vorhandener Lauf wird nie überschrieben (keine stille Auswahl).
# Run: cd packages/server && bash scripts/the597-slice3-runs.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=../../docs/evals/the597-slice3
mkdir -p "$OUT"
run() { # $1 = gv3|gv2, $2 = Laufnummer
  local g=$1 i=$2 dst="$OUT/$1-run$2"
  if [ -f "$dst.json" ]; then echo "[slice3] $g-run$i liegt vor — übersprungen"; return; fi
  rm -f "src/evals/reports/typing-$g-sc5.json" "src/evals/reports/typing-$g-sc5.md"
  npm run typing:eval -- --golden "src/evals/golden/typing.$g.json" --samples 5
  cp "src/evals/reports/typing-$g-sc5.md" "$dst.md"
  cp "src/evals/reports/typing-$g-sc5.json" "$dst.json"   # json zuletzt: es markiert den Lauf als fertig
  echo "[slice3] $g-run$i fertig"
}
for i in 3 4 5; do run gv3 "$i"; done
for i in 1 2; do run gv2 "$i"; done
```

Danach das Skript **vor** der ersten Messung committen — der Ablauf (nur Fehlendes nachholen, nie überschreiben) steht damit nachweisbar vor den Daten fest:

```bash
cd /Users/mac_macee/javis-the597-s3
git add packages/server/scripts/the597-slice3-runs.sh
git commit -m "chore(evals): THE-597 Slice 3 — Lauf-Skript (holt nur fehlende Läufe nach, überschreibt nie)"
```

- [ ] **Step 3: Läufe ausführen** (Session, Bash-Tool im Hintergrund; die Konsolenausgabe wird das Lauf-Protokoll)

```bash
cd /Users/mac_macee/javis-the597-s3/packages/server && mkdir -p ../../docs/evals/the597-slice3 && bash scripts/the597-slice3-runs.sh 2>&1 | tee -a ../../docs/evals/the597-slice3/lauf-protokoll.log
```
(`tee -a`: ein Neustart hängt an, das Protokoll zeigt jeden Abbruch.) Expected: je Lauf `[typing-eval] k=5 · 70 Fälle → 350 LLM-Aufrufe` und `[slice3] …-run… fertig`; am Ende 10 Dateien in `docs/evals/the597-slice3/`.
**Bricht ein Lauf ab:** Fehlermeldung festhalten, Ursache beheben (Instrument nicht ändern), dasselbe Skript erneut starten — es holt nur die fehlenden Läufe nach. Jeder Abbruch (Lauf, Zeitpunkt, Fehler) wird in Task 5 Step 3 im Register als Abweichung vermerkt.

- [ ] **Step 4: Unabhängigkeit prüfen** (mechanisch)

```bash
cd /Users/mac_macee/javis-the597-s3
shasum -a 256 docs/evals/the597-slice3/*.json docs/evals/the597-typing-gv3-sc5-run1.json docs/evals/the597-typing-gv3-sc5.json | awk '{print $1}' | sort -u | wc -l
```
Expected: `7`

- [ ] **Step 5: Commit der Rohdaten** (vor der Auswertung — die Daten stehen fest, bevor das Urteil fällt)

```bash
cd /Users/mac_macee/javis-the597-s3
git add docs/evals/the597-slice3/
git commit -m "eval(the-597): Slice 3 — drei weitere gv3- und zwei gv2-Läufe, Instrument unverändert (k=5, tp-4, Haiku 4.5)"
```

### Task 5: Auswertung, Register, Übergabe

- [ ] **Step 1: Regel anwenden**

Run: `cd /Users/mac_macee/javis-the597-s3/packages/server && npx ts-node -T src/scripts/the597-slice3.ts`
Expected: `[the597-slice3] Schicht 1: GO` oder `… NO-GO`; `docs/evals/the597-slice3-ergebnis.{md,json}` geschrieben.

- [ ] **Step 2: Reproduzierbarkeit** — zweiter Aufruf, Ergebnis byte-gleich:

```bash
cd /Users/mac_macee/javis-the597-s3/packages/server
A=$(shasum -a 256 ../../docs/evals/the597-slice3-ergebnis.md ../../docs/evals/the597-slice3-ergebnis.json)
npx ts-node -T src/scripts/the597-slice3.ts
B=$(shasum -a 256 ../../docs/evals/the597-slice3-ergebnis.md ../../docs/evals/the597-slice3-ergebnis.json)
[ "$A" = "$B" ] && echo REPRODUZIERBAR || echo ABWEICHUNG
```
Expected: `REPRODUZIERBAR`.

- [ ] **Step 3: Register Abschnitt E** — an `docs/evals/the597-fehlerfall-register.md` anhängen:

```markdown
## E. Slice-3-Ergebnis (Vorregistrierung 17.11.2026)

Regel: `docs/evals/the597-slice3-vorregistrierung.md` · Bericht: `docs/evals/the597-slice3-ergebnis.md`

**Schicht 1 (Kalibrierung/Schwelle): <GO|NO-GO>** — <ein Satz: welche Kombination trug bzw. woran es scheiterte (gepoolt / Stabilität / Replikation)>.
**Schicht 2 (Zod-Shape-Set) und Schicht 3 (FCA): nicht gemessen** (Slice 2 lief nie).
Fehlerklassen F-04…F-07 (gepoolt über 5 gv3-Läufe): <Zeile je Klasse: falsch / davon < 0,8>.
Abweichungen vom vorregistrierten Ablauf: <„keine" oder je Abbruch: Lauf, Fehler, nachgeholt am>.
```
Die `<…>`-Stellen ausschließlich aus `the597-slice3-ergebnis.md` und `docs/evals/the597-slice3/lauf-protokoll.log` füllen. Kein Wort über „knapp", „fast" oder „tendenziell" — die Regel ist binär.

- [ ] **Step 4: Commit**

```bash
cd /Users/mac_macee/javis-the597-s3
git add docs/evals/the597-slice3-ergebnis.md docs/evals/the597-slice3-ergebnis.json docs/evals/the597-fehlerfall-register.md
git commit -m "docs(the-597): Slice-3-Ergebnis — Schicht 1 <GO|NO-GO> nach Vorregistrierung"
```

- [ ] **Step 5: Blindprüfung** — `blind-verifier` mit dem Szenario-Pfad dispatchen (nur die Session, nach Review aller Tasks).

- [ ] **Step 6: Übergabe an den User (Session)** — Verdikt, Kombinationstabelle, Prüf-Last, Fehlerklassen, Abweichungen vorlegen. **Alles Folgende erst nach User-Go** (Linear, ADR, Push, PR):
  - **Immer:** Kommentar an THE-597 mit Verdikt, Kombinationstabelle und Pfad des Berichts.
  - **GO →** THE-606 auf die GO-Achsen zuschneiden: nur sie bekommen `calibratedConfidence`, die übrigen Achsen tragen sichtbar `uncalibrated`; neue Fälligkeit; die neue Pflicht (5 LLM-Aufrufe je Typisierung + Prüf-Last je GO-Schwelle beim Menschen) in THE-606 festhalten. THE-605 (Attest-Schema) und THE-609 (Schwellen-Routing) als baubar markieren. Re-Score THE-604. Bau von THE-606 erst nach eigenem Pre-Flight + Plan.
  - **NO-GO →** THE-604 mit Befund und Re-Trigger zurück in den Backlog; THE-606 nicht bauen; THE-605/609/610 bleiben im Backlog. Nachtrag „Befund 17.11.2026" mit Re-Trigger in `docs/adr/0012-konfidenz-nur-mit-gold-ausgang.md` — **im Hauptrepo `/Users/mac_macee/javis`**, wo die ADR liegt (dort noch uncommittet; der User committet sie mit den übrigen Docs). Nicht im Worktree anlegen.
  - **PR** `feat/the-597-slice3` → `master`, Titel `THE-597 Slice 3: Go/No-Go für Schicht 1 nach Vorregistrierung` — auch Push und PR erst nach User-Go.
