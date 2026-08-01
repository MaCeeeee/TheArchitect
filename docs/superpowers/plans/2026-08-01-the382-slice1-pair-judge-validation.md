# THE-382 Slice 1 — Typisierter Paar-Richter, gegen Menschen validiert

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Paar-Richter von Ja/Nein auf die vier typisierten Beziehungen nach NIST IR 8477 umstellen und **gegen ein menschliches Urteil** validieren — damit die Harmonisierungs-Aussage erstmals einen Anker außerhalb unserer eigenen Modelle bekommt.

**Architecture:** Die Rubrik wird **vor** allem anderen typisiert (`equal` · `subset` · `intersects` · `unrelated`), weil ein binäres Gold Menschen auf eine nachweislich kaputte Frage adjudizieren ließe. Menschliches Gold entsteht **neben** dem eingefrorenen `actions.v1` über ein blindes Arbeitsblatt. Kanarienvögel entstehen **mechanisch** durch Partner-Tausch. Catch-Rate wird zweite Vorbedingung neben der Positiv-Kontrolle.

**Tech Stack:** TypeScript (shared + server), Zod, Jest, `raterClient` (Mehrhaus), bestehende Golden-/Kappa-Maschinerie.

**Linear:** THE-382 Slice 1 (Epic THE-378) · betrifft THE-438, THE-541

**RVTM:** `docs/superpowers/rvtm/2026-08-01-the382-slice1-pair-judge-validation-rvtm.md`

---

## Kontext, den du brauchst

### Warum dieser Plan umgeschrieben wurde

Die erste Fassung wollte den **binären** Richter gegen Menschen validieren. Ein Experiment am 2026-08-01 hat gezeigt, dass die Binarität selbst der Defekt ist — Belege vollständig in [`docs/evals/typed-relation-experiment.md`](../../evals/typed-relation-experiment.md):

| | κ Haiku ↔ Kimi |
|---|---|
| binär | **0,308** |
| vier Typen, **sonst alles identisch** | **0,681** |

**70 %** der binären Meinungsverschiedenheiten sind Fälle, in denen **beide** Häuser `intersects` sagen. Sie waren sich einig, dass es *teilweise* ist; der Zwang zum Ja/Nein hat sie auseinanderdividiert.

Und der schwerere Befund: **`equal` kam in 120 Fällen kein einziges Mal vor** — bei wortgleicher Definition. Die veröffentlichten 35 % waren nicht „eine Maßnahme erfüllt beide", sondern die Mittelkategorie, nach oben gedrückt.

> **Konsequenz für diesen Plan:** Erst die Rubrik reparieren, dann Menschen fragen. Ein menschliches Gold auf der binären Frage wäre teuer erhobener Müll.

### Was der Katalog weiterhin leistet

Arm T → `intersects` 37 / `unrelated` 8 · Arm K → `unrelated` 55 / `intersects` 1.

Die kanonische Handlung findet **zusammengehörige** Pflichten zuverlässig. Sie findet nur keine **deckungsgleichen**. Die Entscheidung aus THE-538 steht; nur die Deutung ändert sich.

### Drei Entwurfsentscheidungen, die du nicht umdrehen darfst

**1. Der Mensch sieht dieselbe geblendete Darstellung wie der Richter.**
Bekäme er mehr Information, wäre jede Abweichung doppeldeutig — Urteilsunterschied *oder* Informationsvorsprung — und der Kappa misst etwas anderes. Der Preis (fehlender Kontext) wird bewusst gezahlt und im Report ausgewiesen.

**2. Das menschliche Gold entsteht NEBEN `actions.v1`, nicht darin.**
Der Prüfsatz bleibt eingefroren, sonst verliert die Vorher/Nachher-Aussage ihren Bezugspunkt.

**3. `intersects` wird nicht wegdefiniert.**
Die Versuchung ist groß, `intersects` mit `equal` zusammenzuwerfen, damit die Quote wieder gut aussieht. Genau das war der ursprüngliche Fehler. Die vier Typen bleiben getrennt; wo eine binäre Sicht nötig ist, wird die Faltung **explizit benannt**.

### Konventionen

| Regel | Warum |
|---|---|
| Tests für shared-Logik in `packages/server/src/__tests__/` | `packages/shared` hat keinen Test-Runner |
| Prompts in `packages/shared/src/obligations/prompt.ts` | Eval und Produktion müssen byteidentische Prompts benutzen |
| Reine Module für alles Rechnende | Muster `actionMetrics.ts` |
| Kein `??` für Env-Fallbacks, immer `||` | Env-Variablen sind hier oft vorhanden aber leer |

### Was dieser Slice NICHT tut

- **Keine Prompt-Optimierung.** Die Typisierung ist eine Rubrik-Reparatur, kein Tuning.
- **Kein Mapping-Richter** — Slice 2, braucht ein Fachurteil.
- **Keine Änderung an `actions.v1`.**

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `packages/shared/src/obligations/prompt.ts` *(ändern)* | `PAIR_RELATION_SYSTEM` + `parsePairRelation` — die typisierte Rubrik |
| `packages/server/src/evals/pairGold.ts` *(neu)* | Schema + Loader des menschlichen Golds, deterministische Stichprobe |
| `packages/server/src/evals/canaries.ts` *(neu)* | Partner-Tausch-Kanarienvögel, Catch-Rate |
| `packages/server/src/evals/actionMetrics.ts` *(ändern)* | Typ-Kappa, Richter↔Mensch, Canary-Tor, Kollaps-Erkennung |
| `packages/server/src/evals/runActionEval.ts` *(ändern)* | typisierte Urteile, Canary-Injektion, Verteilungen |
| `packages/server/src/scripts/pair-worksheet.ts` *(neu)* | Blindes HTML-Arbeitsblatt, vier Optionen |
| `packages/server/src/scripts/pair-ingest.ts` *(neu)* | Arbeitsblatt → `actions.human.v1.json` |
| `packages/server/src/scripts/pair-agreement.ts` *(neu)* | Vergleichslauf Richter ↔ Mensch |
| `packages/server/src/evals/golden/typed-relation.experiment.json` *(vorhanden)* | Rohdaten des Experiments, 120 × 2 Häuser |

**npm-Aliasse:** `pairs:worksheet` · `pairs:ingest` · `pairs:agreement`

---

## Chunk 1: Die Rubrik typisieren

### Task 1: `PAIR_RELATION_SYSTEM` in shared

**Files:**
- Modify: `packages/shared/src/obligations/prompt.ts`
- Test: `packages/server/src/__tests__/obligationPrompt.test.ts` *(erweitern)*

- [ ] **Step 1: Schreibe die fehlschlagenden Tests**

```ts
describe('PAIR_RELATION_SYSTEM — typisierte Beziehung (THE-382)', () => {
  it('offers all four IR 8477 relations', () => {
    for (const r of ['equal', 'subset', 'intersects', 'unrelated']) {
      expect(PAIR_RELATION_SYSTEM).toContain(r);
    }
  });

  it('keeps the equal-definition WORD-IDENTICAL to the old binary yes', () => {
    // Genau darauf beruht der Befund: dieselbe Definition, nur mit
    // Ausweichmoeglichkeit, faellt die Ja-Quote von 35 % auf 0 %. Aendert
    // jemand diese Formulierung, ist der Vergleich zur Messung hinfaellig.
    expect(PAIR_RELATION_SYSTEM).toMatch(/Unterschiede beschränken sich auf Parameter/);
  });

  it('describes intersects as shared core PLUS own additions', () => {
    expect(PAIR_RELATION_SYSTEM).toMatch(/gemeinsamen Kern/);
    expect(PAIR_RELATION_SYSTEM).toMatch(/zusätzlich/);
  });

  it('parses each relation and rejects invented ones', () => {
    expect(parsePairRelation('{"relation":"intersects","why":"x"}')?.relation).toBe('intersects');
    expect(parsePairRelation('{"relation":"sort-of","why":"x"}')).toBeNull();
  });

  it('treats a missing relation as unreadable, never as "unrelated"', () => {
    // Sonst wird ein kaputter Lauf zu einem sauberen Negativ-Befund —
    // derselbe Fehler wie beim fehlenden "same" im binaeren Richter.
    expect(parsePairRelation('{"why":"unklar"}')).toBeNull();
  });

  it('renders the pair blinded, like every other prompt', () => {
    const p = buildPairJudgeUserPrompt(oblA, oblB);
    expect(p).not.toMatch(LAW_NAMES);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npx jest obligationPrompt
```

- [ ] **Step 3: Implementieren**

`PAIR_RELATION_SYSTEM` wörtlich aus dem Experiment übernehmen (`docs/evals/typed-relation-experiment.md`). Dazu:

```ts
export const PAIR_RELATIONS = ['equal', 'subset', 'intersects', 'unrelated'] as const;
export type PairRelation = (typeof PAIR_RELATIONS)[number];

/**
 * Faltet die typisierte Beziehung auf eine binäre Sicht — NUR dort benutzen,
 * wo eine Ja/Nein-Ansicht unvermeidlich ist, und dann die Faltung ausweisen.
 *
 * `intersects` fällt bewusst auf `false`: „gemeinsamer Kern plus eigene
 * Zusätze" ist NICHT „eine Maßnahme erfüllt beide". Diese Zusammenlegung war
 * der ursprüngliche Fehler, der die 35 % erzeugt hat.
 */
export function foldRelation(r: PairRelation): boolean {
  return r === 'equal' || r === 'subset';
}
```

`PAIR_JUDGE_SYSTEM` bleibt **erhalten und exportiert** — der eingefrorene Vergleichslauf muss reproduzierbar bleiben. Kopfkommentar: *„binäre Vorgängerfassung, gemessen 2026-08-01 als unterspezifiziert; nur noch für den historischen Vergleich."*

- [ ] **Step 4: Grün + Commit**

```bash
npm run build --workspace @thearchitect/shared && npx jest obligationPrompt
git add packages/shared/src/obligations/prompt.ts packages/server/src/__tests__/obligationPrompt.test.ts && git commit -m "feat(the-382): typisierte Paar-Rubrik nach IR 8477, binaere Fassung bleibt fuer den Vergleich"
```

---

### Task 2: Metriken auf Typen umstellen

**Files:**
- Modify: `packages/server/src/evals/actionMetrics.ts`
- Test: `packages/server/src/__tests__/actionMetrics.test.ts` *(erweitern)*

- [ ] **Step 1: Tests**

```ts
describe('relationKappa (THE-382)', () => {
  it('computes kappa over four categories', () => {
    const a = ['equal', 'intersects', 'unrelated', 'intersects'] as const;
    const b = ['equal', 'intersects', 'unrelated', 'unrelated'] as const;
    expect(relationKappa([...a], [...b])).toBeGreaterThan(0.5);
  });

  it('returns null when a rater is constant — same rule as everywhere', () => {
    expect(relationKappa(['intersects', 'intersects'], ['intersects', 'intersects'])).toBeNull();
  });

  it('reports WHERE the disagreement sits, not just how much', () => {
    // Ohne die Konfusionsmatrix laesst sich ein Dissens nicht adjudizieren,
    // nur zaehlen — derselbe Grund wie bei den Fehlalarm-Namen.
    const m = relationConfusion(['equal', 'intersects'], ['intersects', 'intersects']);
    expect(m['equal|intersects']).toBe(1);
  });
});

describe('foldRelation-Nutzung im Report (THE-382)', () => {
  it('names the folding explicitly wherever a binary view is shown', () => {
    const md = buildActionReport({ P: [true], T: [true], K: [false] }).markdown;
    expect(md).toMatch(/gefaltet|Faltung/i);
  });
});
```

- [ ] **Step 2–3: Implementieren, grün**

`relationKappa` (n-kategorial, `null` bei konstantem Rater — dieselbe Regel wie `cohensKappa`) und `relationConfusion` (Paar-Zähler, damit Dissens adjudizierbar ist).

> **Bestandsschutz:** `cohensKappa` bleibt unverändert für binäre Reihen. `relationKappa` ist die n-kategoriale Verallgemeinerung; beide teilen die Prävalenz-Regel.

- [ ] **Step 4: Commit**

---

## Chunk 2: Menschliches Gold

### Task 3: Schema, Loader, deterministische Stichprobe

**Files:**
- Create: `packages/server/src/evals/pairGold.ts`
- Test: `packages/server/src/__tests__/pairGold.test.ts`

Wie in der Vorfassung, mit **einer Änderung**: das Urteil ist eine `PairRelation`, nicht `boolean`.

- [ ] **Step 1: Tests**

```ts
it('records a typed relation, not a yes/no', () => {
  expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: 'intersects' }] }).success).toBe(true);
  expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: true }] }).success).toBe(false);
});

it('allows an explicit "unsure" instead of forcing a relation', () => {
  // Ein erzwungenes Urteil taeuscht Gewissheit vor, die der Mensch nicht hatte —
  // derselbe Fehlermodus wie der erzwungene Katalog-Treffer.
  expect(PairGoldSchema.safeParse({ ...valid, verdicts: [{ caseId: 'x', relation: null }] }).success).toBe(true);
});

it('records that the human saw the BLINDED rendering', () => {
  expect(Object.keys(PairGoldSchema.shape)).toContain('blinded');
});

it('requires the source set so the reference point stays traceable', () => {
  const { sourceSet: _d, ...without } = valid;
  expect(PairGoldSchema.safeParse(without).success).toBe(false);
});

it('rejects duplicate caseIds', () => { /* … */ });
```

Dazu `samplePairs(set, count)`: **deterministisch** (der Anker darf zwischen Läufen nicht wackeln) und **arm-proportional** (eine Stichprobe, die zufällig nur Arm T träfe, könnte die Negativ-Seite nicht prüfen).

- [ ] **Steps 2–5:** wie üblich — Fehlschlag, Implementierung, grün, Commit.

---

### Task 4: Blindes Arbeitsblatt mit vier Optionen

**Files:**
- Create: `packages/server/src/scripts/pair-worksheet.ts`
- Test: `packages/server/src/__tests__/pairWorksheet.test.ts`
- Modify: `packages/server/package.json`

Aufbau wörtlich nach `relations-worksheet.ts`: **reine** Renderfunktion `(cases) => string`, eine in sich geschlossene HTML-Datei.

- [ ] **Step 1: Tests**

```ts
it('offers all four relations plus an explicit unsure', () => {
  for (const r of ['equal', 'subset', 'intersects', 'unrelated', 'unsicher']) {
    expect(html.toLowerCase()).toContain(r);
  }
});

it('explains each relation in the sheet itself', () => {
  // Der Mensch bekommt DIESELBE Rubrik wie der Richter — sonst beantworten
  // sie verschiedene Fragen und der Kappa misst die Differenz der Rubriken.
  expect(html).toMatch(/gemeinsamen Kern/);
  expect(html).toMatch(/Unterschiede beschränken sich auf Parameter/);
});

it('BLINDS law names — the human sees what the judge sees', () => {
  expect(html).not.toMatch(/\bDSGVO\b|\bNIS2\b|\bDORA\b/);
});

it('shows NO machine verdict and no arm label — no anchoring', () => {
  expect(html).not.toMatch(/vorschlag|suggested|Arm [TK]/i);
});

it('is self-contained — no external assets', () => {
  expect(html).not.toMatch(/<script src=|<link[^>]+href="http/);
});
```

- [ ] **Steps 2–5:** Implementierung, Alias `pairs:worksheet`, Rauchtest, Commit.

---

### Task 5: Einlesen der Adjudikation

**Files:**
- Create: `packages/server/src/scripts/pair-ingest.ts`
- Modify: `packages/server/package.json`

**Pflichtprüfungen:**
- Jede `caseId` existiert in `actions.v1` — sonst Abbruch, kein stiller Verlust.
- `blinded` und `annotator` gesetzt.
- Anteil `relation: null` ausgewiesen. **Über 30 % ist ein Warnsignal**: dann war die Blendung zu scharf oder die Rubrik unklar — nicht der Mensch zu unentschlossen.
- **Verteilung der vier Typen ausgewiesen.** Erscheint `equal` auch beim Menschen nicht, ist das die unabhängige Bestätigung von Ergebnis 2.

- [ ] Implementieren · Alias `pairs:ingest` · Commit.

---

## Chunk 3: Kanarienvögel, Harness, Messung

### Task 6: Partner-Tausch-Kanarienvögel

**Files:**
- Create: `packages/server/src/evals/canaries.ts`
- Test: `packages/server/src/__tests__/canaries.test.ts`

Unverändert aus der Vorfassung, mit **einer Anpassung an die Typen**: Ein gefangener Kanarienvogel ist jetzt `unrelated` **oder** `intersects` — nicht `equal`/`subset`.

> **Begründung der Lockerung:** Beide Hälften stammen aus Arm-T-Paaren, gehören aber zu verschiedenen Maßnahmen. `unrelated` ist die erwartete Antwort; `intersects` ist vertretbar, weil zwei beliebige Compliance-Pflichten fast immer einen entfernten Bezug haben. **Nicht** vertretbar ist `equal`/`subset` — das wäre der Rubber-Stamp.

- [ ] **Tests**

```ts
it('counts unrelated AND intersects as caught, equal/subset as missed', () => {
  expect(canaryCatchRate(['unrelated', 'intersects', 'equal', 'unrelated'])).toBeCloseTo(0.75, 6);
});

it('treats an unanswered canary as NOT caught — silence is not detection', () => {
  expect(canaryCatchRate(['unrelated', null, 'unrelated', 'unrelated'])).toBeCloseTo(0.75, 6);
});

it('returns null for an empty set instead of a perfect score', () => {
  // 0 von 0 als 100 % zu melden waere die gefaehrlichste Variante: ein Lauf
  // ohne Kanarien saehe aus wie ein bestandener.
  expect(canaryCatchRate([])).toBeNull();
});

it('builds both halves from arm T so the case LOOKS plausible', () => { /* … */ });
it('is deterministic and needs no LLM', () => { /* … */ });
it('marks every canary so it can never be counted as a real case', () => { /* … */ });
```

- [ ] Implementieren · grün · Commit.

---

### Task 7: Harness auf Typen + Kanarienvögel

**Files:**
- Modify: `packages/server/src/evals/runActionEval.ts`
- Test: `packages/server/src/__tests__/runActionEval.test.ts` *(erweitern)*

- [ ] **Tests**

```ts
it('reports the relation distribution per arm', async () => { /* Arm T vs Arm K */ });
it('injects canaries mixed into the run, not as a block', async () => { /* Reihenfolge */ });
it('never lets a canary reach the tiers', async () => { /* kein canary__ in tiers */ });
it('marks the run invalid when canaries are not caught', async () => { /* Tor */ });
it('marks the run invalid when NO canaries were injected', async () => {
  // Gleiche Logik wie bei Arm P: nicht geprueft heisst nicht bestanden.
});
it('reports the folding explicitly wherever a binary number appears', async () => { /* … */ });
```

- [ ] **Implementieren**

Kanarienvögel werden **gemischt** geurteilt (nicht als Block — sonst erkennt ein Modell das Muster), getrennt ausgewertet, **nie** in Stufen oder Arm-Quoten gezählt. Bericht bekommt: Typ-Verteilung je Arm, Kanarienvögel, Verdikt-Verteilung.

**Konfidenzstufen neu:** Sie beziehen sich künftig auf den **Typ**, nicht auf ein Ja/Nein.

| Stufe | Kriterium |
|---|---|
| **A** | alle Häuser einig auf `equal` oder `subset` |
| **B** | alle Häuser einig auf `intersects` — *gemeinsamer Kern, Zusätze ausweisen* |
| **C** | keine Einigkeit über den Typ |

> Das ist die eigentliche Reparatur: Stufe B war vorher „Mehrheit ≥2/3" und damit bei zwei Häusern arithmetisch unerreichbar. Jetzt trägt sie die Kategorie, die real vorkommt.

- [ ] Grün · Commit.

---

### Task 8: Der Vergleichslauf 🧑

**Files:**
- Create: `packages/server/src/scripts/pair-agreement.ts`
- Modify: `packages/server/package.json`

- [ ] **Step 1: Skript**

| Ausgabe | Bedeutung |
|---|---|
| n verglichen / n „unsicher" übersprungen | Grundgesamtheit |
| **κ Richter ↔ Mensch (4 Typen)** | die Zahl, an der alles hängt — Tor **≥ 0,7** |
| Konfusionsmatrix | *wo* der Dissens sitzt, damit er adjudizierbar ist |
| Typ-Verteilung Mensch vs. Richter | erscheint `equal` beim Menschen? |
| Canary-Catch-Rate | zweites Tor |
| Verdikt-Verteilung | Kollaps-Signal |

- [ ] **Step 2: Menschliches Tor** 🧑 — Adjudikation von 40 Paaren über das Arbeitsblatt.

- [ ] **Step 3: Verdikt** 🧑

| Ergebnis | Konsequenz |
|---|---|
| **κ ≥ 0,7** | Der typisierte Richter ist verwendbar. Stufen A/B/C werden auf Typen umgestellt, die Aussage lautet ab dann „gemeinsamer Kern, ausgewiesene Zusätze". |
| **κ < 0,7** | Auch die typisierte Fassung trägt nicht. Dann ist die Frage selbst zu klären, bevor irgendeine Quote zitiert wird. |
| **Kanarien < 90 %** | Lauf ungültig — erst reparieren, dann messen. |
| **Mensch vergibt `equal` häufig** | Widerspruch zu Ergebnis 2 des Experiments → Rubrik-Differenz Mensch/Maschine untersuchen, **bevor** eine Zahl veröffentlicht wird. |

- [ ] **Step 4: Ergebnis dokumentieren** — Kommentar an THE-438 und THE-382, Abschnitt in `action-release-gates.md`, RVTM-Häkchen, Bericht nachziehen.

---

## Was dieser Slice offen lässt

| Offen | Warum |
|---|---|
| Mapping-Richter | Slice 2 — braucht Fachurteil (Domänengrenze, Präzedenz THE-434) |
| SCF/ENISA als externes Gold | Vielversprechend (CC BY-ND: intern nutzbar, nicht auslieferbar), aber die Transitivität „gleiche Kontrolle ⇒ harmonisierbar" ist **unsere** Folgerung und selbst zu prüfen. Eigener Vorlauf. |
| Zweiter Adjudikator | Erst mit ihm kennen wir die Mensch↔Mensch-Obergrenze — also das, was der Richter überhaupt erreichen *kann*. |
| Wirtschaftlicher Wert von `intersects` | Ein gemeinsamer Kern kann viel oder wenig Aufwand sparen. Das misst erst ein Nutzer, kein Richter. |

> **Grenze, die im Report stehen muss:** 40 Paare, ein Adjudikator, geblendete Darstellung. Das reicht, um einen groben Dissens zu erkennen — nicht, um einen knappen Kappa auf zwei Stellen zu verteidigen.
