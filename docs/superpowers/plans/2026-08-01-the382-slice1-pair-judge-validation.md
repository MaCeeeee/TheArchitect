# THE-382 Slice 1 — Paar-Richter gegen Menschen validieren

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Messen, ob der Paar-Richter mit einem menschlichen Urteil übereinstimmt — und die veröffentlichte Harmonisierungs-Quote von 35 % dadurch bestätigen, korrigieren oder zurückziehen.

**Architecture:** Ein menschliches Gold entsteht **neben** dem eingefrorenen `actions.v1`, adjudiziert über ein blindes HTML-Arbeitsblatt nach dem Muster von `relations-worksheet`. Kanarienvögel entstehen **mechanisch** durch Partner-Tausch (kein LLM). Metriken und Tore kommen in die bestehenden reinen Module; der Harness bekommt die Catch-Rate als zweite Vorbedingung neben der Positiv-Kontrolle.

**Tech Stack:** TypeScript (server), Zod, Jest, `raterClient` (Mehrhaus), bestehende Golden-/Kappa-Maschinerie.

**Linear:** THE-382 Slice 1 (Epic THE-378) · betrifft THE-438

**RVTM:** `docs/superpowers/rvtm/2026-08-01-the382-slice1-pair-judge-validation-rvtm.md`

---

## Kontext, den du brauchst

### Warum dieser Slice existiert

Der Paar-Richter entscheidet: *„Erfüllt EINE betriebene Maßnahme beide Pflichten, wenn Adressat und Frist als Parameter geführt werden?"* Auf seinem Urteil ruhen die veröffentlichte Quote **35 % (Mehrheit) / 18 % (einstimmig)**, die Konfidenzstufen A/B/C und die Freigabe-Tore.

Was existiert, sind **strukturelle** Kontrollen: Arm P (dieselbe Pflicht, muss „ja") und Arm K (verschiedene kanonische Handlung, muss „nein"), plus Kappa zwischen drei Modell-Häusern (0,308–0,697).

> **Das ist Konsistenz, nicht Richtigkeit.** Drei Häuser können sich einig und gemeinsam irren. Die Kontrollen belegen, dass das Instrument *funktioniert* — nicht, dass sein Urteil *stimmt*.

Die Zahlen sind damit **nicht widerlegt, sondern unbelegt**. Dieser Slice liefert den fehlenden Anker.

### Zwei Entwurfsentscheidungen, die du nicht umdrehen darfst

**1. Der Mensch sieht dieselbe geblendete Darstellung wie der Richter.**

Der Richter urteilt über geblendeten Text — ohne Gesetzesnamen und Fundstellen (gemessen: ungeblendet 7/15, geblendet 15/15). Bekäme der Mensch mehr Information, wäre jede Abweichung doppeldeutig: Urteilsunterschied *oder* Informationsvorsprung. Dann misst der Kappa nicht mehr die Frage, die er messen soll.

Der Preis ist real — dem Menschen fehlt Kontext, den er normalerweise hätte. Er wird bewusst bezahlt und im Report ausgewiesen.

**2. Das menschliche Gold entsteht NEBEN `actions.v1`, nicht darin.**

Der Prüfsatz ist eingefroren. Ein zweites, menschlich gelabeltes Set referenziert seine `caseId`s. Würde man `actions.v1` anreichern, wäre der Prüfsatz, gegen den die 35 % gemessen wurden, nicht mehr derselbe — und die Vorher/Nachher-Aussage verlöre ihren Bezugspunkt.

### Konventionen, die gelten

| Regel | Warum |
|---|---|
| Tests für shared-Logik liegen in `packages/server/src/__tests__/` | `packages/shared` hat keinen Test-Runner |
| Reine Module (kein I/O) für alles Rechnende | Muster `actionMetrics.ts`, `typingMetrics.ts` — vollständig testbar |
| Worksheet-Renderer ist eine **reine Funktion** `(set) => string` | Muster `renderRelationsWorksheet` |
| Kein `??` für Env-Fallbacks, immer `||` | Env-Variablen sind hier oft vorhanden aber leer |
| UI-Strings Englisch, Kommentare Deutsch | Projektkonvention |

### Was dieser Slice NICHT tut

- **Keine Prompt-Verbesserung.** Leitsatz des Epics: *„Das erste Ergebnis ist eine Zahl, kein besserer Prompt."*
- **Kein Mapping-Richter** — das ist Slice 2 und braucht ein Fachurteil.
- **Keine Änderung an `actions.v1`.**

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `packages/server/src/evals/pairGold.ts` *(neu)* | Schema + Loader des menschlichen Golds, deterministische Stichprobe |
| `packages/server/src/evals/canaries.ts` *(neu)* | Partner-Tausch-Kanarienvögel, mechanisch; Catch-Rate |
| `packages/server/src/evals/actionMetrics.ts` *(ändern)* | Richter↔Mensch-Übereinstimmung, Canary-Tor, Kollaps-Erkennung |
| `packages/server/src/evals/runActionEval.ts` *(ändern)* | Canary-Injektion, Catch-Rate als 2. Vorbedingung, Verdikt-Verteilung |
| `packages/server/src/scripts/pair-worksheet.ts` *(neu)* | Blindes HTML-Arbeitsblatt für die Adjudikation |
| `packages/server/src/scripts/pair-ingest.ts` *(neu)* | Arbeitsblatt-Ausgabe → `actions.human.v1.json` |
| `packages/server/src/scripts/pair-agreement.ts` *(neu)* | Der Vergleichslauf: Richter vs. Mensch |
| `packages/server/src/evals/golden/actions.human.v1.json` *(neu, von Hand)* | Das menschliche Gold |

**Tests:** `pairGold.test.ts` · `canaries.test.ts` · `actionMetrics.test.ts` *(erweitern)* · `runActionEval.test.ts` *(erweitern)* · `pairWorksheet.test.ts`

**npm-Aliasse:** `pairs:worksheet` · `pairs:ingest` · `pairs:agreement`

---

## Chunk 1: Menschliches Gold

### Task 1: Schema, Loader, deterministische Stichprobe

**Files:**
- Create: `packages/server/src/evals/pairGold.ts`
- Test: `packages/server/src/__tests__/pairGold.test.ts`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

```ts
/**
 * Tests für das menschliche Paar-Gold (THE-382 Slice 1, Task 1).
 *
 * Das Gold entsteht NEBEN `actions.v1`, nicht darin — der Prüfsatz bleibt
 * eingefroren, sonst verliert die Vorher/Nachher-Aussage ihren Bezugspunkt.
 */
import { PairGoldSchema, samplePairs, loadPairGold, type PairGold } from '../evals/pairGold';
import { loadActionGolden } from '../evals/actionGolden';

describe('PairGold — Schema (THE-382)', () => {
  const valid: PairGold = {
    version: 'actions.human.v1',
    frozen: false,
    sourceSet: 'actions.v1',
    annotator: 'human:ea',
    blinded: true,
    verdicts: [{ caseId: 'x__y', same: true, note: 'eine Meldekette bedient beide' }],
  };

  it('accepts a decision set', () => {
    expect(PairGoldSchema.safeParse(valid).success).toBe(true);
  });

  it('records that the human saw the BLINDED rendering', () => {
    // Sonst waere eine Abweichung doppeldeutig: Urteilsunterschied oder
    // Informationsvorsprung. Der Kappa wuerde etwas anderes messen.
    expect(PairGoldSchema.safeParse({ ...valid, blinded: false }).success).toBe(true);
    expect(Object.keys(PairGoldSchema.shape)).toContain('blinded');
  });

  it('requires the source set so the reference point stays traceable', () => {
    const { sourceSet: _drop, ...without } = valid;
    expect(PairGoldSchema.safeParse(without).success).toBe(false);
  });

  it('allows an explicit "unsure" instead of forcing a verdict', () => {
    // Ein erzwungenes Urteil ist schlechter als ein offenes: es taeuscht
    // Gewissheit vor, die der Mensch nicht hatte.
    const r = PairGoldSchema.safeParse({
      ...valid,
      verdicts: [{ caseId: 'x__y', same: null, note: 'zu wenig Kontext' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects duplicate caseIds', () => {
    const dup = { ...valid, verdicts: [valid.verdicts[0], valid.verdicts[0]] };
    expect(() => loadPairGold(dup)).toThrow(/doppelte/i);
  });
});

describe('samplePairs — deterministische Stichprobe (THE-382)', () => {
  const set = loadActionGolden();

  it('draws the same sample twice — the anchor must not wobble', () => {
    expect(samplePairs(set, 40).map((c) => c.id)).toEqual(samplePairs(set, 40).map((c) => c.id));
  });

  it('covers both decision arms', () => {
    const ids = new Set(samplePairs(set, 40).map((c) => c.id));
    const armOf = new Map(set.cases.map((c) => [c.id, c.arm]));
    const arms = new Set([...ids].map((id) => armOf.get(id)));
    expect(arms).toEqual(new Set(['T', 'K']));
  });

  it('draws proportionally from each arm rather than by chance', () => {
    const s = samplePairs(set, 40);
    const armOf = new Map(set.cases.map((c) => [c.id, c.arm]));
    const t = s.filter((c) => armOf.get(c.id) === 'T').length;
    expect(t).toBeGreaterThanOrEqual(15);
    expect(t).toBeLessThanOrEqual(25);
  });

  it('never asks for more than the set holds', () => {
    expect(samplePairs(set, 9999)).toHaveLength(set.cases.length);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npx jest pairGold
```
Erwartet: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Implementieren**

`pairGold.ts`:

```ts
/**
 * pairGold — menschliches Gold für den Paar-Richter (THE-382 Slice 1).
 *
 * Es entsteht NEBEN dem eingefrorenen `actions.v1` und referenziert dessen
 * `caseId`s. Würde man den Prüfsatz anreichern, wäre er nicht mehr derselbe,
 * gegen den die veröffentlichten 35 % gemessen wurden.
 *
 * `blinded` ist Pflichtangabe, kein Detail: der Mensch urteilt über DIESELBE
 * geblendete Darstellung wie der Richter. Bekäme er mehr Information, wäre
 * jede Abweichung doppeldeutig — Urteilsunterschied oder Informationsvorsprung.
 *
 * `same: null` heißt „unsicher" und ist ein zulässiges Urteil. Ein erzwungenes
 * Ja/Nein täuscht Gewissheit vor, die der Mensch nicht hatte — derselbe
 * Fehlermodus wie ein erzwungener Katalog-Treffer.
 *
 * Linear: THE-382 Slice 1
 */
import fs from 'node:fs';
import { z } from 'zod';
import type { ActionGoldenSet, ActionGoldenCase } from './actionGolden';

export const PairVerdictSchema = z.object({
  caseId: z.string().min(1),
  /** `null` = bewusst unsicher, kein fehlendes Urteil. */
  same: z.boolean().nullable(),
  note: z.string().optional(),
});

export const PairGoldSchema = z.object({
  version: z.string().min(1),
  frozen: z.boolean(),
  /** Prüfsatz, auf den sich die caseIds beziehen. */
  sourceSet: z.string().min(1),
  annotator: z.string().min(1),
  /** Sah der Mensch die geblendete Darstellung? Siehe Kopf. */
  blinded: z.boolean(),
  verdicts: z.array(PairVerdictSchema).min(1),
});

export type PairGold = z.infer<typeof PairGoldSchema>;

export function loadPairGold(input: string | unknown): PairGold {
  const raw = typeof input === 'string' ? JSON.parse(fs.readFileSync(input, 'utf8')) : input;
  const gold = PairGoldSchema.parse(raw);
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const v of gold.verdicts) (seen.has(v.caseId) ? dup : seen).add(v.caseId);
  if (dup.length) throw new Error(`pairGold: doppelte caseIds: ${dup.join(', ')}`);
  return gold;
}

/**
 * Deterministische, arm-proportionale Stichprobe.
 *
 * Kein Zufall: Der menschliche Anker darf zwischen zwei Läufen nicht wackeln,
 * sonst misst man die Stichprobe statt den Richter. Gezogen wird gleichmäßig
 * über jeden Arm — eine Stichprobe, die zufällig nur Arm T träfe, könnte die
 * Negativ-Seite nicht prüfen.
 */
export function samplePairs(set: ActionGoldenSet, count: number): ActionGoldenCase[] {
  const byArm = { T: set.cases.filter((c) => c.arm === 'T'), K: set.cases.filter((c) => c.arm === 'K') };
  const total = Math.min(count, set.cases.length);
  const out: ActionGoldenCase[] = [];

  for (const arm of ['T', 'K'] as const) {
    const pool = byArm[arm];
    const want = Math.min(Math.round((total * pool.length) / set.cases.length), pool.length);
    for (let i = 0; i < want; i++) out.push(pool[Math.floor((i * pool.length) / want)]);
  }
  return out.slice(0, total);
}
```

- [ ] **Step 4: Test grün**

```bash
npx jest pairGold
```
Erwartet: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/evals/pairGold.ts packages/server/src/__tests__/pairGold.test.ts && git commit -m "feat(the-382): Schema + deterministische Stichprobe fuer das menschliche Paar-Gold"
```

---

### Task 2: Blindes Arbeitsblatt

**Files:**
- Create: `packages/server/src/scripts/pair-worksheet.ts`
- Test: `packages/server/src/__tests__/pairWorksheet.test.ts`
- Modify: `packages/server/package.json`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

```ts
import { renderPairWorksheet } from '../scripts/pair-worksheet';
import { loadActionGolden } from '../evals/actionGolden';
import { samplePairs } from '../evals/pairGold';

const cases = samplePairs(loadActionGolden(), 6);

describe('renderPairWorksheet (THE-382)', () => {
  const html = renderPairWorksheet(cases);

  it('renders one block per case with both obligations', () => {
    for (const c of cases) expect(html).toContain(c.id);
  });

  it('BLINDS law names — the human must see what the judge sees', () => {
    // Sonst ist eine Abweichung doppeldeutig (Urteil vs. Informationsvorsprung).
    expect(html).not.toMatch(/\bDSGVO\b|\bNIS2\b|\bDORA\b/);
  });

  it('shows NO machine verdict — the human must not be anchored', () => {
    // Ein vorbelegtes Urteil misst Zustimmung, nicht Urteil.
    expect(html).not.toMatch(/vorschlag|suggested|machine|maschine/i);
  });

  it('offers an explicit "unsure" alongside yes and no', () => {
    expect(html).toMatch(/unsicher/i);
  });

  it('carries the rubric question verbatim so the human judges the same thing', () => {
    expect(html).toContain('EINE gemeinsam betriebene Maßnahme');
  });

  it('is self-contained — no external assets', () => {
    expect(html).not.toMatch(/<script src=|<link[^>]+href="http/);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npx jest pairWorksheet
```

- [ ] **Step 3: Implementieren**

Aufbau wörtlich nach `relations-worksheet.ts`: **reine** Renderfunktion `(cases) => string`, eine in sich geschlossene HTML-Datei, Export-Knopf schreibt JSON in ein `<textarea>`.

Wesentlich:
- Jede Pflicht wird über `blindLawNames` gerendert (aus `@thearchitect/shared`) — nicht selbst gebaut.
- Drei Radio-Optionen je Fall: **ja · nein · unsicher**, keine vorbelegt.
- Die Rubrik-Frage steht wörtlich über jedem Fall — dieselbe Formulierung wie in `PAIR_JUDGE_SYSTEM`, damit Mensch und Maschine dieselbe Frage beantworten.
- Freitextfeld „Begründung (optional)".
- Kein Maschinenurteil, keine Arm-Kennzeichnung, keine Katalog-Handlung sichtbar.

- [ ] **Step 4: Alias + Rauchtest**

```json
"pairs:worksheet": "ts-node src/scripts/pair-worksheet.ts"
```

```bash
npm run pairs:worksheet -- --count 40 --out /tmp/pair-label.html
```
Erwartet: Datei geschrieben, im Browser bedienbar.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/scripts/pair-worksheet.ts packages/server/src/__tests__/pairWorksheet.test.ts packages/server/package.json && git commit -m "feat(the-382): blindes Arbeitsblatt fuer die Paar-Adjudikation"
```

---

### Task 3: Einlesen der Adjudikation

**Files:**
- Create: `packages/server/src/scripts/pair-ingest.ts`
- Modify: `packages/server/package.json`

- [ ] **Step 1: Implementieren**

Liest die exportierte JSON-Ausgabe des Arbeitsblatts, validiert gegen `PairGoldSchema`, schreibt `src/evals/golden/actions.human.v1.json`.

**Pflichtprüfungen beim Einlesen:**
- Jede `caseId` existiert in `actions.v1` — sonst Abbruch (kein stiller Verlust).
- `blinded` und `annotator` müssen gesetzt sein.
- Anteil `same: null` wird ausgewiesen. **Über 30 % ist ein Warnsignal**: dann war die Blendung zu scharf oder die Frage unklar — nicht der Mensch zu unentschlossen.

- [ ] **Step 2: Alias + Commit**

```json
"pairs:ingest": "ts-node src/scripts/pair-ingest.ts"
```

```bash
git add packages/server/src/scripts/pair-ingest.ts packages/server/package.json && git commit -m "feat(the-382): Adjudikation einlesen und als menschliches Gold ablegen"
```

---

## Chunk 2: Kanarienvögel und Metriken

### Task 4: Partner-Tausch-Kanarienvögel

**Files:**
- Create: `packages/server/src/evals/canaries.ts`
- Test: `packages/server/src/__tests__/canaries.test.ts`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

```ts
import { buildPartnerSwapCanaries, canaryCatchRate } from '../evals/canaries';
import { loadActionGolden } from '../evals/actionGolden';

const set = loadActionGolden();

describe('buildPartnerSwapCanaries (THE-382)', () => {
  const canaries = buildPartnerSwapCanaries(set, 10);

  it('builds pairs from DIFFERENT canonical actions — they must be judged "no"', () => {
    for (const c of canaries) expect(c.actionA).not.toBe(c.actionB);
  });

  it('takes both sides from arm T — the halves LOOK harmonisable', () => {
    // Das ist der Unterschied zu Arm K: dort ist schon eine Seite untypisch.
    // Hier stammen beide Haelften aus harmonisierbaren Paaren, der Fall ist
    // also plausibel und damit ein echter Test statt eines leichten.
    const armT = new Set(set.cases.filter((c) => c.arm === 'T').map((c) => c.id));
    for (const c of canaries) {
      expect(armT.has(c.fromA)).toBe(true);
      expect(armT.has(c.fromB)).toBe(true);
    }
  });

  it('is deterministic — the gate must not wobble between runs', () => {
    expect(buildPartnerSwapCanaries(set, 10).map((c) => c.id))
      .toEqual(buildPartnerSwapCanaries(set, 10).map((c) => c.id));
  });

  it('needs no LLM — canaries are constructed, not generated', () => {
    expect(canaries.length).toBe(10);
  });

  it('marks every canary so it can never be counted as a real case', () => {
    for (const c of canaries) expect(c.id.startsWith('canary__')).toBe(true);
  });
});

describe('canaryCatchRate (THE-382)', () => {
  it('counts a caught canary as a "no" verdict', () => {
    expect(canaryCatchRate([false, false, true, false])).toBeCloseTo(0.75, 6);
  });

  it('treats an unanswered canary as NOT caught — silence is not detection', () => {
    expect(canaryCatchRate([false, null, false, false])).toBeCloseTo(0.75, 6);
  });

  it('returns null for an empty set instead of a perfect score', () => {
    // 0 von 0 als 100 % zu melden waere die gefaehrlichste Variante:
    // ein Lauf ohne Kanarien saehe aus wie ein bestandener.
    expect(canaryCatchRate([])).toBeNull();
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npx jest canaries
```

- [ ] **Step 3: Implementieren**

```ts
/**
 * canaries — Kanarienvögel für den Paar-Richter (THE-382).
 *
 * WARUM: Ein Richter, der alles durchwinkt, ist perfekt konsistent und völlig
 * nutzlos (Rubber-Stamping). Arm K prüft das grob — dort ist aber schon eine
 * Seite offensichtlich unpassend. Der PARTNER-TAUSCH ist schärfer: beide
 * Hälften stammen aus harmonisierbaren Arm-T-Paaren, sehen also plausibel aus,
 * gehören aber zu VERSCHIEDENEN Maßnahmen. Der Richter MUSS „nein" sagen.
 *
 * Mechanisch konstruiert, kein LLM: Kanarienvögel, die ein Modell erzeugt,
 * erben dessen blinde Flecken.
 *
 * Linear: THE-382 Slice 1 (Baustein für Slice 3)
 */
import type { ActionGoldenSet, ActionGoldenCase } from './actionGolden';
import type { Vote } from './actionMetrics';

export interface Canary {
  id: string;
  a: ActionGoldenCase['a'];
  b: ActionGoldenCase['b'];
  actionA: string;
  actionB: string;
  fromA: string;
  fromB: string;
}

export function buildPartnerSwapCanaries(set: ActionGoldenSet, count: number): Canary[] {
  const armT = set.cases.filter((c) => c.arm === 'T');
  const out: Canary[] = [];
  for (let i = 0; i < armT.length && out.length < count; i++) {
    for (let j = i + 1; j < armT.length && out.length < count; j++) {
      if (armT[i].actionId === armT[j].actionId) continue;
      out.push({
        id: `canary__${armT[i].id}__${armT[j].id}`,
        a: armT[i].a,
        b: armT[j].b,
        actionA: armT[i].actionId,
        actionB: armT[j].actionId,
        fromA: armT[i].id,
        fromB: armT[j].id,
      });
    }
  }
  return out;
}

/**
 * Anteil gefangener Kanarienvögel. `null` bei leerer Menge — 0 von 0 als
 * 100 % zu melden wäre die gefährlichste Variante: ein Lauf ohne Kanarien
 * sähe aus wie ein bestandener.
 *
 * Eine ausgebliebene Antwort zählt als NICHT gefangen: Schweigen ist keine
 * Erkennung.
 */
export function canaryCatchRate(verdicts: Vote[]): number | null {
  if (verdicts.length === 0) return null;
  return verdicts.filter((v) => v === false).length / verdicts.length;
}

export const CANARY_CATCH_MIN = 0.9;
```

- [ ] **Step 4: Test grün + Commit**

```bash
npx jest canaries
git add packages/server/src/evals/canaries.ts packages/server/src/__tests__/canaries.test.ts && git commit -m "feat(the-382): Partner-Tausch-Kanarienvoegel, mechanisch konstruiert"
```

---

### Task 5: Metriken — Übereinstimmung, Tor, Kollaps

**Files:**
- Modify: `packages/server/src/evals/actionMetrics.ts`
- Test: `packages/server/src/__tests__/actionMetrics.test.ts` *(erweitern)*

- [ ] **Step 1: Schreibe die fehlschlagenden Tests**

```ts
describe('judgeHumanAgreement (THE-382)', () => {
  it('reports kappa and raw agreement over the shared cases', () => {
    const r = judgeHumanAgreement(
      { a: true, b: false, c: true },
      { a: true, b: false, c: false },
    );
    expect(r.n).toBe(3);
    expect(r.agreement).toBeCloseTo(2 / 3, 6);
  });

  it('SKIPS cases the human marked unsure — an open verdict is not a disagreement', () => {
    const r = judgeHumanAgreement({ a: true, b: true }, { a: true, b: null });
    expect(r.n).toBe(1);
  });

  it('reports null kappa when one side is constant, like everywhere else', () => {
    expect(judgeHumanAgreement({ a: true, b: true }, { a: true, b: true }).kappa).toBeNull();
  });

  it('flags when too few cases remain to say anything', () => {
    expect(judgeHumanAgreement({ a: true }, { a: true }).sufficient).toBe(false);
  });
});

describe('collapseSignal (THE-382)', () => {
  it('raises the alarm when every verdict is identical', () => {
    // Rubber-Stamping: perfekt konsistent, voellig nutzlos.
    expect(collapseSignal([true, true, true, true]).collapsed).toBe(true);
    expect(collapseSignal([true, false, true, false]).collapsed).toBe(false);
  });

  it('reports the rejection rate so drift is visible before it collapses', () => {
    expect(collapseSignal([true, false, false, false]).rejectionRate).toBeCloseTo(0.75, 6);
  });
});

describe('buildActionReport — Canary als ZWEITE Vorbedingung (THE-382)', () => {
  const clean = { P: Array(20).fill(true), T: [true, false], K: Array(10).fill(false) };

  it('INVALIDATES the run when the canary catch rate is below the gate', () => {
    const r = buildActionReport({ ...clean, canaryCatchRate: 0.7 });
    expect(r.valid).toBe(false);
    expect(r.tRate).toBeNull();
    expect(r.reason).toMatch(/Canary|Kanarien/i);
  });

  it('INVALIDATES the run when no canaries were injected at all', () => {
    // Gleiche Logik wie bei Arm P: nicht geprueft heisst nicht bestanden.
    const r = buildActionReport({ ...clean, canaryCatchRate: null });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/nicht injiziert|keine Kanarien/i);
  });

  it('stays valid when both preconditions hold', () => {
    expect(buildActionReport({ ...clean, canaryCatchRate: 0.95 }).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen, dann implementieren**

`canaryCatchRate` wird optionales Feld von `buildActionReport`. Reihenfolge der Prüfungen: **Positiv-Kontrolle → Kanarienvögel → Negativ-Kontrolle**. Fehlende Kanarien behandeln wie fehlenden Arm P: *nicht geprüft ≠ bestanden*.

> **Achtung — Bestandsschutz:** `buildActionReport` wird heute ohne `canaryCatchRate` aufgerufen. Damit die bestehenden Tests nicht brechen, ist das Feld **optional**; fehlt es ganz (`undefined`), bleibt das Verhalten wie bisher. Nur ein **ausdrückliches** `null` bedeutet „Kanarien vorgesehen, aber keine injiziert" und kippt den Lauf. Der Unterschied gehört in den Kommentar.

- [ ] **Step 3: Alle Metrik-Tests grün + Commit**

```bash
npx jest actionMetrics
git add packages/server/src/evals/actionMetrics.ts packages/server/src/__tests__/actionMetrics.test.ts && git commit -m "feat(the-382): Richter-Mensch-Uebereinstimmung, Canary-Tor, Kollaps-Erkennung"
```

---

## Chunk 3: Harness und Messung

### Task 6: Kanarienvögel in den Harness

**Files:**
- Modify: `packages/server/src/evals/runActionEval.ts`
- Test: `packages/server/src/__tests__/runActionEval.test.ts` *(erweitern)*

- [ ] **Step 1: Tests**

```ts
it('injects canaries and reports their catch rate', async () => {
  const r = await evaluateActions(tiny, { h1: async () => NO }, undefined, { canaries: 4 });
  expect(r.canary.injected).toBe(4);
  expect(r.canary.catchRate).toBe(1);
});

it('marks the run invalid when canaries are not caught', async () => {
  const r = await evaluateActions(tiny, { h1: async () => YES }, undefined, { canaries: 4 });
  expect(r.report.valid).toBe(false);
  expect(r.report.reason).toMatch(/Kanarien/i);
});

it('never lets a canary reach the tiers — it is not a real case', async () => {
  const r = await evaluateActions(tiny, { h1: async () => NO }, undefined, { canaries: 4 });
  expect(Object.keys(r.tiers).some((id) => id.startsWith('canary__'))).toBe(false);
});

it('reports the verdict distribution so rubber-stamping is visible', async () => {
  const r = await evaluateActions(tiny, { h1: async () => YES }, undefined, { canaries: 2 });
  expect(r.collapse.collapsed).toBe(true);
});
```

- [ ] **Step 2: Implementieren**

Kanarienvögel werden **gemischt** mit den echten Fällen geurteilt (nicht als Block am Ende — sonst erkennt ein Modell das Muster), aber getrennt ausgewertet und **nie** in `tiers` oder Arm-Quoten gezählt. Bericht bekommt einen Abschnitt „Kanarienvögel" und „Verdikt-Verteilung".

- [ ] **Step 3: Grün + Commit**

---

### Task 7: Der Vergleichslauf 🧑

**Files:**
- Create: `packages/server/src/scripts/pair-agreement.ts`
- Modify: `packages/server/package.json`

- [ ] **Step 1: Skript**

Lädt `actions.human.v1.json` + fährt den Paar-Richter über **dieselben** Fälle, gibt aus:

| Zeile | Bedeutung |
|---|---|
| n verglichen / n unsicher übersprungen | Grundgesamtheit |
| **Kappa Richter ↔ Mensch** | die Zahl, an der alles hängt (Tor **≥ 0,7**) |
| Rohübereinstimmung | Kontext zum Kappa (Prävalenz-Falle) |
| Abweichungen, einzeln aufgelistet | damit ein Dissens adjudizierbar ist, nicht nur zählbar |
| Canary-Catch-Rate | zweites Tor |
| Verdikt-Verteilung | Kollaps-Signal |

- [ ] **Step 2: Menschliches Tor** 🧑

Adjudikation von 40 Paaren durch einen Enterprise Architekten über das Arbeitsblatt aus Task 2.

- [ ] **Step 3: Der Lauf und sein Verdikt** 🧑

```bash
npm run pairs:agreement -- --gold src/evals/golden/actions.human.v1.json
```

| Ergebnis | Konsequenz |
|---|---|
| **κ ≥ 0,7** | Die 35 % bestehen. Vorbehalt an THE-438 wird aufgehoben, Tor-Dokument ergänzt. |
| **κ < 0,7** | Die 35 % werden **zurückgezogen**, bis Rubrik oder Richter überarbeitet sind. Kein Zitieren, auch nicht mit Fußnote. |
| **Kanarien < 90 %** | Lauf ungültig — erst reparieren, dann erneut messen. |

- [ ] **Step 4: Ergebnis dokumentieren**

Kommentar an THE-438 und THE-382, Abschnitt in `docs/evals/action-release-gates.md`, Häkchen in der RVTM.

---

## Was dieser Slice offen lässt

| Offen | Warum |
|---|---|
| Mapping-Richter | Slice 2 — braucht ein Fachurteil (Domänengrenze, Präzedenz THE-434) |
| Geteilte Canary-Mechanik für beide Richter | Slice 3 — hier entsteht sie erst für einen |
| Prompt-Verbesserung | Wartet auf diese Zahl. *„Das erste Ergebnis ist eine Zahl, kein besserer Prompt."* |
| Mehr als ein Adjudikator | Ein zweiter Mensch würde Mensch↔Mensch-Kappa erlauben — die ehrlichste Obergrenze für das, was der Richter erreichen kann. Sinnvoll, sobald jemand verfügbar ist. |

> **Grenze, die im Report stehen muss:** 40 Paare, ein Adjudikator, geblendete Darstellung. Das reicht, um einen groben Dissens zu erkennen — nicht, um einen knappen Kappa auf zwei Stellen zu verteidigen.
