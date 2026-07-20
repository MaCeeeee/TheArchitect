# THE-421 Fundament — Vorstufe, Einigkeits-Werkzeug, zwei eingefrorene Prüfsätze (Gate 1)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate 1 aus der ONTO→REQHARM-Spec erreichen — die fünfte Typisierungs-Achse (`provisionKind`) existiert, ein belastbares Mess-Werkzeug für Prüfer-Einigkeit existiert, und **beide** Prüfsätze (Klassifizierung + Cross-Norm-Beziehungen) sind mit ehrlicher Zwei-Rater-Kappa eingefroren.

**Architecture:** Drei Bau-Ebenen, streng in dieser Reihenfolge. (1) *Vorstufe*: `provisionKinds` wird eine Ontologie-Facette (Daten-PR, v1.4.0→v1.5.0), die vier bekannten Typing-Berührungspunkte gehen auf 5 Achsen. (2) *Werkzeug*: mehrklassiges Cohen's Kappa (das vorhandene ist binär) plus ein Blind-/Vergleichs-Werkzeug, das den KI-Vorschlag beim Zweitprüfer **entfernt** — sonst ist die Einigkeit künstlich. (3) *Prüfsätze*: der Klassifizierungs-Satz bekommt echte Streuung (der Bau-Helfer nimmt heute alles ungefiltert), der Beziehungs-Satz ist Neubau nach demselben Muster, mit Paar-Vorauswahl statt Vollkreuzprodukt.

**Tech Stack:** TypeScript (packages/shared Ontologie, packages/server Evals+Skripte), Zod, Jest, Anthropic Haiku (Instruct) für Vorschlags-Labels, bestehende Korpus-API.

**RVTM:** docs/superpowers/rvtm/2026-07-20-the-421-fundament-gate1-rvtm.md
**Spec:** docs/superpowers/specs/2026-07-19-onto-reqharm-path-design.md (Slice G-0 + Slice G)
**Linear:** THE-421 (Parent) · THE-429 (Ontologie, Done — wird erweitert) · THE-430 (Eval-Suite, Done für Typing — wird vervollständigt) · THE-432/433 (bauen morgen darauf auf)

**NICHT in diesem Plan** (bewusst, Nutzer-Entscheid 2026-07-20): Slice T (Klassifizierungs-Batch über 1532 §§, THE-432) · Slice K (Beziehungs-Pipeline, THE-433) · Gate 2/3 · REQHARM-Spur · THE-434.

---

## Design-Entscheidungen (vor den Tasks lesen)

**DD-1 — Prompt aus `TYPING_AXES` ableiten, nicht parallel pflegen.** Der heutige Prelabel-Prompt trägt `'four axes'` und vier Zeilen als Handarbeit neben der Achsen-Liste. Beim Hinzufügen der fünften Achse wird der Prompt **generisch aus `TYPING_AXES` + einer Facetten-Map erzeugt**, damit die nächste Achse nicht wieder zwei Stellen braucht. (Der Compiler fängt `AXIS_VALIDATOR` ohnehin, den Prompt-Text aber nicht — genau die Drift-Quelle.)

**DD-2 — Blindkopie entfernt Labels UND Vorschlag (Korrektheits-Falle).** Der bestehende Ablauf befüllt jeden Prüfer mit dem KI-Vorschlag vor. Sähe Prüfer B denselben Vorschlag, wäre die Einigkeit künstlich hoch und das Freeze-Tor wertlos. `makeBlindTypingCopy`/`makeBlindRelationsCopy` setzen daher **alle Labels auf `undefined` UND entfernen `annotator`/`notes`/`ambiguous`** — der Zweitprüfer sieht nur Rohtext + Optionen. Wird als Test festgenagelt.

**DD-3 — Mehrklassiges Kappa neu.** `cohenKappa` ist binär (`'match'|'no-match'`, 2×2-Erwartungswert). Neu: `cohenKappaMulti(a: string[], b: string[])` mit `pe = Σ_c p_a(c)·p_b(c)`. Sentinels wie in `typingMetrics`: `__na__` für bewusst-nicht-anwendbar. **Konvention:** ist ein Wert auf *einer* Seite offen (`undefined`), wird das Paar aus der Kappa-Rechnung **ausgeschlossen** (spiegelt `axisAccuracy`s `if (g === undefined) continue`) und separat als `skipped` ausgewiesen.

**DD-4 — Paar-Reihenfolge deterministisch, Richtung als eigenes Feld.** Alle Beziehungsarten sind gerichtet, aber **nur zwei** (`DEROGATED_BY` ↔ `PREVAILS_OVER`) haben eine deklarierte Umkehrung. Eine reine „immer A → B"-Konvention wäre unzureichend: `regulationKey` beginnt mit der Quelle (`dora:art-1`), also fixiert lexikografisches Sortieren bei jedem unserer drei Gesetzes-Paare **immer dieselbe** Seite als A (dora<nis2, dsgvo<nis2, dsgvo<eprivacy). Läuft die wahre Beziehung einer der sechs umkehrungslosen Arten (`TRANSPOSES`, `IMPLEMENTS`, `CONCRETIZES`, `SETS_PARAMETER`, `RECOGNIZES_EQUIVALENCE`, `INTERPRETS`) von der später sortierten zur früheren Quelle, wäre sie schlicht nicht labelbar.

Deshalb zweiteilig:
- **Paar-Reihenfolge** bleibt deterministisch sortiert (`a.regulationKey < b.regulationKey`) — das stabilisiert `caseId` und verhindert Duplikate wie (X,Y)/(Y,X).
- **Richtung ist ein eigenes Feld:** `direction: 'a-to-b' | 'b-to-a'`, verpflichtend wenn `relation !== null`, abwesend wenn `relation === null`. Damit ist jede Art in beide Richtungen ausdrückbar, ohne Umkehrungs-Ids erfinden zu müssen.
- **Für die Einigkeits-Messung** ist das Label die Kombination: `relation === null ? '__none__' : `${relation}:${direction}``. Zwei Prüfer, die sich auf die Art einig sind, aber nicht auf die Richtung, sind **uneinig** — das ist inhaltlich richtig (wer verdrängt wen, ist die Aussage).

**DD-5 — KI darf nur `inferred`-Beziehungen vorschlagen.** Vier Arten (`AMENDS`/`CONSOLIDATES`/`REPEALS`/`CITES`) sind laut Ontologie `derivation: 'metadata'` und dürfen laut THE-433 AC-5 **nie** aus einem Sprachmodell kommen. Der Vorschlags-Schritt bietet ausschließlich die 8 `inferred`-Arten an; `isInferredRelation` existiert bereits als Prüfung und wird als Torwächter benutzt.

**DD-6 — Kappa je Typ nur bei n ≥ 10.** Bei seltenen Beziehungsarten ist Cohen's Kappa instabil. Unter n=10 zählt der **aggregierte (Macro-)Wert**; der Bericht weist dünne Typen ausdrücklich als „n zu klein für Einzelwert" aus (Spec §3).

**DD-7 — Eingefrorene Sätze werden nie editiert.** RUBRIC §8: Korrekturen erzeugen die nächste Versionsdatei. Gilt für beide Sätze.

---

## File Structure

**Neu:**
- `packages/server/src/evals/relationsGolden.ts` — Schema/Loader/Stats + `relationLabelForKappa` für den Beziehungs-Prüfsatz (Spiegel von `typingGolden.ts`).
- `packages/server/src/evals/relationsCandidates.ts` — reine Paar-Auswahl (Ähnlichkeits-Rangfolge, Negativ-Bucket, Anker), I/O-frei (Task 12a).
- `packages/server/src/scripts/build-relations-golden.ts` — Entwurfs-Zusammenbau + CLI/Korpus-Beschaffung (Task 12b).
- `packages/server/src/scripts/prelabel-relations.ts` — Vorschlags-Labels, nur `inferred`-Arten.
- `packages/server/src/scripts/relations-worksheet.ts` — Adjudikations-Oberfläche (zwei Texte nebeneinander).
- `packages/server/src/scripts/typing-kappa.ts` — Blind + Vergleich je Achse (Klassifizierung).
- `packages/server/src/scripts/relations-kappa.ts` — Blind + Vergleich (Beziehungen).
- Tests je Datei unter `packages/server/src/__tests__/`.

**Modifiziert (additiv):**
- `packages/shared/src/ontology/norm-ontology.v1.ts` — `provisionKinds`-Facette, Version 1.5.0.
- `packages/shared/src/ontology/norm-ontology.schema.ts` — Facette validieren + Duplikat-Prüfung + `ProvisionKindSchema`.
- `packages/shared/src/ontology/index.ts` — `PROVISION_KIND_IDS`, `isProvisionKind`, `ProvisionKindId`, OntoLearner-Export.
- `packages/shared/src/ontology/CHANGELOG.md` — 1.5.0-Eintrag.
- `packages/server/src/evals/typingGolden.ts` — 5. Achse in Schema/`TYPING_AXES`/Stats.
- `packages/server/src/scripts/prelabel-typing.ts` — Validator + generischer Prompt (DD-1).
- `packages/server/src/scripts/typing-worksheet.ts` — 5. Achse in Optionen/Titeln.
- `packages/server/src/scripts/build-typing-golden.ts` — echte Streuung (RUBRIC §6).
- `packages/server/src/evals/metrics.ts` — `cohenKappaMulti`.
- `packages/server/src/evals/RUBRIC.md` — Abschnitte für Klassifizierung + Beziehungen.
- `packages/server/package.json` — neue Skript-Aliase.

**Unberührt:** `runTypingEval.ts`, `typingMetrics.ts` (beide laufen generisch über `TYPING_AXES` — die 5. Achse kostet dort **null** Änderungen; per Test belegen).

---

## Chunk 1: Slice G-0 — die Vorstufe

### Task 1: `provisionKinds` als Ontologie-Facette (v1.5.0)

**Files:**
- Modify: `packages/shared/src/ontology/norm-ontology.v1.ts`
- Modify: `packages/shared/src/ontology/norm-ontology.schema.ts`
- Modify: `packages/shared/src/ontology/index.ts`
- Modify: `packages/shared/src/ontology/CHANGELOG.md`
- Test: `packages/shared/src/ontology/__tests__/norm-ontology.test.ts` (oder wo die Datei liegt — vorhandenen Pfad benutzen)

- [ ] **Step 1: Failing test** — nach dem Muster des `obligationKinds`-Blocks (dort steht die Vorlage):

```ts
describe('provisionKinds facet (THE-421 G-0)', () => {
  it('ships the closed provision-kind space', () => {
    expect(PROVISION_KIND_IDS).toEqual([
      'scope-applicability', 'definition', 'obligation',
      'enforcement-supervision', 'procedural', 'other',
    ]);
  });
  it('accepts in-ontology values and rejects OOV + wrong case', () => {
    expect(isProvisionKind('scope-applicability')).toBe(true);
    expect(isProvisionKind('Scope-Applicability')).toBe(false);
    expect(isProvisionKind('nonsense')).toBe(false);
  });
  it('ProvisionKindSchema gates membership', () => {
    expect(ProvisionKindSchema.safeParse('obligation').success).toBe(true);
    expect(ProvisionKindSchema.safeParse('obligation ').success).toBe(false);
  });
  it('OntoLearner export covers the new facet', () => {
    expect(exportForOntoLearner().termTypes.provisionKind).toEqual(PROVISION_KIND_IDS);
  });
  it('ontology version is bumped', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.5.0');
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npm test -w @thearchitect/shared` (bzw. der Ort der Ontologie-Tests; falls die Tests im server-Paket liegen: `npm test -w @thearchitect/server -- norm-ontology`). Erwartet: FAIL (`PROVISION_KIND_IDS` existiert nicht).

- [ ] **Step 3: Implement** —
  - `norm-ontology.v1.ts`: neue Facette **nach `obligationKinds`** einfügen, gleicher Kommentar-Stil (erklären, wofür sie da ist: Retrieval-Priorisierung + Harmonisierungs-Bucket):
    ```ts
    /**
     * E6 — funktionale Art einer Provision (orthogonal zu obligationKind).
     * Beantwortet "worum geht es in diesem Paragraphen?", nicht "was gebietet er".
     * Zweck: (a) Geltungsbereichs-Provisions im Retrieval priorisieren (THE-423-Befund:
     * dem Judge lagen nur Durchführungs-§§ vor), (b) Grob-Bucket für die
     * Pflichten-Harmonisierung (THE-438: Pflichten nur mit Pflichten clustern).
     * Bewusst klein gehalten — 'other' fängt den Rest.
     */
    provisionKinds: [
      { id: 'scope-applicability', label: 'Scope / Applicability — Geltungsbereich' },
      { id: 'definition', label: 'Definition — Begriffsbestimmung' },
      { id: 'obligation', label: 'Obligation — materielle Pflicht' },
      { id: 'enforcement-supervision', label: 'Enforcement / Supervision — Aufsicht, Sanktion, Marktüberwachung' },
      { id: 'procedural', label: 'Procedural — Verfahren, Meldung, Fristen, Formalia' },
      { id: 'other', label: 'Other — Übergangs-, Schluss-, sonstige Bestimmungen' },
    ],
    ```
    plus `ontologyVersion: '1.5.0'` und `updatedAt` auf heute.
  - `norm-ontology.schema.ts`: `provisionKinds: z.array(IdLabel).min(1)` ins Schema; Eintrag in die Duplikat-Prüfliste in `assertOntologyValid`; `const provisionKindIds = …` + `export const ProvisionKindSchema = makeMemberSchema(provisionKindIds, 'provisionKinds')`.
  - `index.ts`: `PROVISION_KIND_IDS`, `PROVISION_KIND_ID_SET`, `isProvisionKind`, `ProvisionKindId`, Re-Export von `ProvisionKindSchema`, **und `provisionKind` in `exportForOntoLearner().termTypes`** (der Export-Test prüft Facetten-Vollständigkeit — ohne das schlägt er fehl). **Dabei auch das `OntoLearnerExport`-Interface erweitern** — `termTypes` ist heute ein Objekt mit festen vier Schlüsseln, kein `Record<string,string[]>`; ohne die Interface-Ergänzung kompiliert der neue Schlüssel nicht.
  - `CHANGELOG.md`: `## 1.5.0` mit Begründung + Verweis THE-421/G-0.

- [ ] **Step 4: Run, verify PASS** + shared bauen: `npm run build -w @thearchitect/shared`

- [ ] **Step 5: Commit**
```bash
git add packages/shared && git commit -m "feat(THE-421): provisionKinds facet in E6 ontology (v1.5.0)"
```

### Task 2: Typing-Schema + Achsenliste auf 5 Achsen

**Files:**
- Modify: `packages/server/src/evals/typingGolden.ts`
- Test: `packages/server/src/__tests__/typingGolden.test.ts`

- [ ] **Step 1: Failing test** — ergänzen:
```ts
it('accepts provisionKind and rejects out-of-ontology values', () => {
  const ok = { ...validCase, labels: { provisionKind: 'scope-applicability' } };
  expect(TypingGoldenCaseSchema.safeParse(ok).success).toBe(true);
  const bad = { ...validCase, labels: { provisionKind: 'not-a-kind' } };
  expect(TypingGoldenCaseSchema.safeParse(bad).success).toBe(false);
});
it('TYPING_AXES contains all five axes', () => {
  expect(TYPING_AXES).toEqual(['normKind','bindingness','obligationKind','partyRole','provisionKind']);
});
it('stats count the fifth axis', () => {
  const s = typingGoldenStats(setWithProvisionKind);
  expect(s.labeledPerAxis.provisionKind).toBe(1);
});
```

- [ ] **Step 2: Verify FAIL** — `npm test -w @thearchitect/server -- typingGolden`
- [ ] **Step 3: Implement** — `provisionKind` in `TypingLabelsSchema` (Muster `memberOrNull(PROVISION_KIND_IDS, 'provisionKinds')` — oder `isProvisionKind`-Guard, falls in Task 1 exportiert), `TYPING_AXES` erweitern, **beide Stats-Initialisierer** (`labeledPerAxis`/`notApplicablePerAxis`) um das Feld ergänzen.
- [ ] **Step 4: Verify PASS**
- [ ] **Step 5: Commit** — `git add packages/server/src/evals/typingGolden.ts packages/server/src/__tests__/typingGolden.test.ts && git commit -m "feat(THE-421): typing golden schema on five axes"`

### Task 3: Vorschlags-Schritt auf 5 Achsen — Prompt generisch (DD-1)

**Files:**
- Modify: `packages/server/src/scripts/prelabel-typing.ts`
- Test: `packages/server/src/__tests__/prelabelTyping.test.ts`

- [ ] **Step 1: Failing test**
```ts
it('lists all five axes in the prompt', () => {
  const p = buildPrelabelUserPrompt(provision);
  for (const axis of TYPING_AXES) expect(p).toContain(axis);
  expect(p).toContain('scope-applicability'); // provisionKind-Optionen sind drin
  expect(p).not.toContain('four axes');       // DD-1: kein hartcodierter Zähler mehr
});
it('drops out-of-vocabulary provisionKind and leaves the axis open', () => {
  const { labels, dropped } = parsePrelabelLabels('{"provisionKind":"bogus"}');
  expect(labels.provisionKind).toBeUndefined();
  expect(dropped).toContain('provisionKind');
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** —
  - `AXIS_VALIDATOR` um `provisionKind: isProvisionKind` ergänzen (der `Record<TypingAxis,…>` erzwingt das ohnehin — der Compiler ist hier dein Freund).
  - **Prompt generisch machen (DD-1):** eine `AXIS_FACET: Record<TypingAxis, ReadonlyArray<{id:string;label:string}>>`-Map einführen und Achsen-Zeilen + Antwort-Vorlage per `TYPING_AXES.map(...)` erzeugen, statt fünf Zeilen hart zu schreiben. Der Zähl-Text wird `Classify this provision on ${TYPING_AXES.length} axes.`
- [ ] **Step 4: Verify PASS** — und zusätzlich `npm test -w @thearchitect/server -- runTypingEval` laufen lassen: der Eval-Runner nutzt denselben Prompt, muss grün bleiben.
- [ ] **Step 5: Commit** — `git add -A packages/server && git commit -m "feat(THE-421): prelabel five axes, prompt derived from TYPING_AXES"`

### Task 4: Adjudikations-Oberfläche auf 5 Achsen

**Files:**
- Modify: `packages/server/src/scripts/typing-worksheet.ts`
- Test: `packages/server/src/__tests__/buildTypingGolden.test.ts` (dort liegen die Worksheet-Tests)

- [ ] **Step 1: Failing test** — bestehende Zusicherung „vier Dropdowns" auf fünf anheben; ergänzen, dass die `provisionKind`-Optionen (inkl. `scope-applicability`) im HTML stehen.
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — je ein Eintrag in `AXIS_OPTIONS` (aus `NORM_ONTOLOGY.provisionKinds`) und `AXIS_TITLE` (`'ProvisionKind'`). Kartendarstellung und eingebettetes JS laufen bereits über `TYPING_AXES` — keine weiteren Änderungen.
- [ ] **Step 4: Verify PASS**
- [ ] **Step 5: Commit** — `git add -A packages/server && git commit -m "feat(THE-421): adjudication worksheet on five axes"`

### Task 5: Beleg, dass Eval/Metriken achsen-generisch sind

**Files:**
- Test: `packages/server/src/__tests__/typingMetrics.test.ts`, `packages/server/src/__tests__/runTypingEval.test.ts`

- [ ] **Step 1: Test ergänzen** — der Report deckt jetzt **fünf** Achsen ab, ohne dass `typingMetrics.ts`/`runTypingEval.ts` angefasst wurden:
```ts
it('buildTypingReport covers all five axes without code change', () => {
  const r = buildTypingReport(casesWithProvisionKind);
  expect(Object.keys(r.byAxis).sort()).toEqual([...TYPING_AXES].sort());
});
```
- [ ] **Step 2: Run** — muss **direkt grün** sein (Generizität ist der Punkt). Falls rot: dort ist doch eine Achse hartcodiert → beheben und im Commit vermerken.
- [ ] **Step 3: Commit** — `git add -A packages/server && git commit -m "test(THE-421): prove eval+metrics are axis-generic for the fifth axis"`

---

## Chunk 2: Das Einigkeits-Werkzeug

### Task 6: Mehrklassiges Cohen's Kappa

**Files:**
- Modify: `packages/server/src/evals/metrics.ts`
- Test: `packages/server/src/__tests__/evalCalibration.test.ts` (dort liegen die metrics-Tests) oder neu `multiClassKappa.test.ts`

- [ ] **Step 1: Failing test**
```ts
it('returns 1 for perfect agreement across >2 classes', () => {
  expect(cohenKappaMulti(['a','b','c','a'], ['a','b','c','a'])).toBeCloseTo(1, 6);
});
it('returns ~0 for chance-level agreement', () => {
  // konstruiert: gleiche Randverteilung, Übereinstimmung = Zufall
  expect(Math.abs(cohenKappaMulti(['a','b','a','b'], ['a','b','b','a']))).toBeLessThan(0.1);
});
it('handles a dominant class without claiming agreement (skew)', () => {
  const a = Array(18).fill('none').concat(['x','y']);
  const b = Array(18).fill('none').concat(['y','x']);
  expect(cohenKappaMulti(a, b)).toBeLessThan(0.5); // trotz 90 % Rohübereinstimmung
});
it('throws on length mismatch and on empty input', () => {
  expect(() => cohenKappaMulti(['a'], [])).toThrow();
  expect(() => cohenKappaMulti([], [])).toThrow();
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — `export function cohenKappaMulti(a: string[], b: string[]): number` mit `po = Übereinstimmungsrate`, `pe = Σ_c p_a(c)·p_b(c)`, `κ = (po - pe) / (1 - pe)`; `pe === 1` → `1` zurückgeben (degenerierter Fall: beide konstant und identisch). Doc-Kommentar erklärt, warum das binäre `cohenKappa` bleibt (Mapping-Pfad nutzt es).
- [ ] **Step 4: Verify PASS**
- [ ] **Step 5: Commit** — `git add -A packages/server && git commit -m "feat(THE-421): multi-class Cohen's kappa"`

### Task 7: Blind + Vergleich für die Klassifizierung (DD-2)

**Files:**
- Create: `packages/server/src/scripts/typing-kappa.ts`
- Test: `packages/server/src/__tests__/typingKappa.test.ts`
- Modify: `packages/server/package.json` (Aliase `typing:blind`, `typing:kappa`)

- [ ] **Step 1: Failing test**
```ts
it('blind copy strips ALL labels and the LLM proposal (anti-anchoring)', () => {
  const blind = makeBlindTypingCopy(prelabeledSet);
  for (const c of blind.cases) {
    for (const axis of TYPING_AXES) expect(c.labels[axis]).toBeUndefined();
    expect(c.annotator).toBeUndefined();
    expect(c.notes).toBeUndefined();
    expect(c.ambiguous).toBeUndefined();
    expect(c.labeledAt).toBeUndefined();
  }
  expect(blind.frozen).toBe(false);
  expect(TypingGoldenSetSchema.safeParse(blind).success).toBe(true);
});
it('compares per axis and lists disagreements', () => {
  const r = compareTypingSets(setA, setB);
  expect(Object.keys(r.perAxis).sort()).toEqual([...TYPING_AXES].sort());
  expect(r.perAxis.normKind.kappa).toBeCloseTo(1, 6);
  expect(r.disagreements.map(d => d.caseId)).toContain('case-2');
});
it('excludes pairs where one side left the axis open', () => {
  const r = compareTypingSets(setWithOpenAxis, setFullyLabeled);
  expect(r.perAxis.partyRole.skipped).toBe(1);
});
it('reports cases present in only one file', () => {
  expect(compareTypingSets(setA, setBMissingCase).unmatchedCaseIds).toContain('case-3');
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** —
  - `makeBlindTypingCopy(set): TypingGoldenSet` — alle Achsen auf `undefined`, `annotator`/`notes`/`ambiguous`/**`labeledAt`** weg (Parität zum bestehenden `makeBlindCopy` in `golden-kappa.ts`, das `labeledAt` ebenfalls entfernt), `version: '${v}-blind'`, `frozen: false`. **Das ist DD-2** — Kommentar im Code, warum (sonst ist Prüfer B auf denselben KI-Vorschlag geankert und die Einigkeit künstlich hoch).
  - `compareTypingSets(a, b): TypingKappaComparison` — Join über `caseId`; je Achse `cohenKappaMulti` über die Fälle, bei denen **beide** Seiten einen Wert haben (`null` → `'__na__'`), Rest als `skipped` gezählt; `disagreements: { caseId, axis, a, b }[]`; `unmatchedCaseIds` aus beiden Richtungen.
  - CLI wie `golden-kappa.ts`: `typing-kappa blind <in> <out>` / `typing-kappa compare <a> <b>`; Vergleich druckt je Achse Kappa + Übereinstimmung, dann die Abweichungsliste, dann das Tor:
    ```ts
    const failing = TYPING_AXES.filter(ax => r.perAxis[ax].kappa < 0.6 && r.perAxis[ax].pairs > 0);
    if (failing.length) { console.log(`\n[kappa] ⚠️ Kappa < 0.6 auf: ${failing.join(', ')} — RUBRIC schärfen, nicht das Modell tunen.`); process.exitCode = 1; }
    ```
- [ ] **Step 4: Verify PASS**
- [ ] **Step 5: Commit** — `git add -A packages/server && git commit -m "feat(THE-421): typing blind copy + per-axis kappa gate"`

---

## Chunk 3: Der Klassifizierungs-Prüfsatz

### Task 8: Streuung im Bau-Helfer (RUBRIC §6)

**Files:**
- Modify: `packages/server/src/scripts/build-typing-golden.ts`
- Test: `packages/server/src/__tests__/buildTypingGolden.test.ts`

Heutiger Stand: nimmt **jede** Provision einer Quelle, filtert nur `fullText < 50`. Es gibt keine Streuung.

- [ ] **Step 1: Failing test**
```ts
it('stratifies across sources and languages up to a target size', () => {
  const draft = buildTypingDraft(mixedRegulations, { targetSize: 12 });
  const sources = new Set(draft.cases.map(c => c.source));
  const langs = new Set(draft.cases.map(c => c.language));
  expect(draft.cases).toHaveLength(12);
  expect(sources.size).toBeGreaterThanOrEqual(3);
  expect(langs).toEqual(new Set(['de','en']));
});
it('is deterministic for the same seed', () => {
  const a = buildTypingDraft(regs, { targetSize: 10, seed: 42 });
  const b = buildTypingDraft(regs, { targetSize: 10, seed: 42 });
  expect(a.cases.map(c => c.caseId)).toEqual(b.cases.map(c => c.caseId));
});
it('keeps taking everything when no targetSize is given (backwards compatible)', () => {
  expect(buildTypingDraft(regs).cases).toHaveLength(regs.filter(r => r.fullText.length >= 50).length);
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — **Signatur umstellen (nicht danebenlegen).** Heute: `buildTypingDraft(regulations, ontologyVersion?, version?)`. Ein Options-Objekt als zweites Argument würde mit dem `ontologyVersion: string`-Slot kollidieren und nicht kompilieren. Daher alles in **eine** Optionen-Tasche falten:
```ts
export interface BuildTypingDraftOptions {
  ontologyVersion?: string;   // default NORM_ONTOLOGY.ontologyVersion
  version?: string;           // default 'v1-draft'
  targetSize?: number;        // ohne: bisheriges Verhalten (alles nehmen)
  seed?: number;              // default 42
}
export function buildTypingDraft(regulations: ApiRegulation[], opts: BuildTypingDraftOptions = {}): TypingDraft
```
**Alle Aufrufer mitziehen** (CLI in derselben Datei + bestehende Tests in `buildTypingGolden.test.ts`, die noch positional aufrufen). Ohne `targetSize` bleibt das Verhalten **identisch** (Rückwärtskompatibilität als Test festhalten). Mit `targetSize`: Round-Robin über `source`, innerhalb einer Quelle abwechselnd `de`/`en`, deterministisch über `mulberry32(seed)` aus `metrics.ts`. CLI zusätzlich: `--sources a,b,c` · `--target-size` · `--seed`; `--source` bleibt für Einzelquellen-Läufe erhalten.
- [ ] **Step 4: Verify PASS**
- [ ] **Step 5: Commit** — `git add -A packages/server && git commit -m "feat(THE-421): stratified typing golden draft builder"`

### Task 9: RUBRIC-Abschnitt für die Klassifizierung

**Files:**
- Modify: `packages/server/src/evals/RUBRIC.md`

Die RUBRIC ist heute rein auf die Zuordnungs-Aufgabe geschrieben; die Typing-Skripte verweisen darauf, finden aber keinen einschlägigen Abschnitt. Ohne klare Label-Regeln ist ein Kappa unter 0,6 nicht reparierbar (§7.4 verlangt genau das: Rubrik schärfen, nicht Modell tunen).

- [ ] **Step 1: Abschnitt schreiben** — neuer Abschnitt „Klassifizierung (Term Typing)" mit: Zweck je Achse in einem Satz; **Entscheidungsregeln je Achse** inkl. Abgrenzungen, die erfahrungsgemäß streiten (z. B. `obligation` vs. `procedural`: eine Meldepflicht *ist* eine Pflicht, aber ihre Fristen-/Formregelung ist `procedural`; `scope-applicability` vs. `definition`: Art. 2 „gilt für…" ist Geltungsbereich, Art. 3 „im Sinne dieser Verordnung bezeichnet…" ist Definition); Wann `null` (bewusst nicht anwendbar) statt offen; die Drei-Zustands-Konvention; Verweis auf DD-2 (Zweitprüfer sieht den Vorschlag nicht).
- [ ] **Step 2: Commit** — `git add packages/server/src/evals/RUBRIC.md && git commit -m "docs(THE-421): RUBRIC section for term typing"`

### Task 10 (Ops + Mensch): Klassifizierungs-Prüfsatz bauen, doppelt labeln, einfrieren

**Kein Subagenten-Task — Ablauf mit Nutzer-Beteiligung.** Voraussetzung: Tasks 1-9 gemerged, `TA_API`/`TA_KEY`/`TA_PROJECT` + `ANTHROPIC_API_KEY` gesetzt.

- [ ] **Step 1: Entwurf bauen (Ziel ~60-80 Fälle, gestreut)**
```bash
npm run typing:build -w @thearchitect/server -- \
  --sources dsgvo,nis2,dora,cra,ai-act,lksg --target-size 70 --seed 42 \
  --out src/evals/golden/typing.v1.draft.json
```
Erwartet: 70 Fälle, mehrere Quellen, beide Sprachen. **Prüfen:** deckt die Streuung auch komplexe Normen ab (C_score-Bänder)?

- [ ] **Step 2: Vorschlags-Labels erzeugen**
```bash
npm run typing:prelabel -w @thearchitect/server -- --in src/evals/golden/typing.v1.draft.json
```
Erwartet: `…prelabeled.json`, Log zeigt OOV-Drops + Leakage-Hinweis.

- [ ] **Step 3: Prüfer A adjudiziert (Claude) — Oberfläche erzeugen**
```bash
npm run typing:worksheet -w @thearchitect/server -- \
  src/evals/golden/typing.v1.draft.prelabeled.json /tmp/typing-a.html
```
Ergebnis als `typing.v1.rater-a.json` ablegen.

- [ ] **Step 4: Blindkopie für Prüfer B (≥20 Überlappungsfälle)** — RUBRIC §7 verlangt nur ≥20 doppelt gelabelte Fälle, nicht den ganzen Satz:
```bash
npm run typing:blind -w @thearchitect/server -- \
  src/evals/golden/typing.v1.rater-a.json /tmp/typing-blind.json
npm run typing:worksheet -w @thearchitect/server -- /tmp/typing-blind.json /tmp/typing-b.html
```
**Prüfer B = MikeOSS** (offener Punkt O-1: Zugang klären; Rückfall laut Spec: anderes Modell-Haus mit unabhängigem Prompt). Ergebnis als `typing.v1.rater-b.json`.

- [ ] **Step 5: Einigkeit messen**
```bash
npm run typing:kappa -w @thearchitect/server -- compare \
  src/evals/golden/typing.v1.rater-a.json src/evals/golden/typing.v1.rater-b.json
```
Erwartet: Kappa je Achse + Abweichungsliste. **Exit 1**, wenn eine Achse < 0,6.

- [ ] **Step 6: 🧑 NUTZER-TOR — strittige Fälle entscheiden.** Die Abweichungsliste geht an den Architekten; er entscheidet je Fall, Begründung in `notes` (RUBRIC §7.5 — das Material für spätere Judge-Prompts). **Bei Kappa < 0,6 auf einer Achse: nicht adjudizieren, sondern RUBRIC schärfen (Task 9) und neu labeln.**

- [ ] **Step 7: Einfrieren** — adjudizierte Fassung als `src/evals/golden/typing.v1.json` mit `frozen: true`, `version: 'v1'`, `ontologyVersion: '1.5.0'`. Ab hier gilt DD-7: nie wieder editieren.
```bash
git add packages/server/src/evals/golden/typing.v1.json && \
git commit -m "feat(THE-421): freeze typing golden v1 (kappa >= 0.6, adjudicated)"
```

---

## Chunk 4: Der Beziehungs-Prüfsatz

### Task 11: Schema + Loader für Beziehungs-Fälle

**Files:**
- Create: `packages/server/src/evals/relationsGolden.ts`
- Test: `packages/server/src/__tests__/relationsGolden.test.ts`

- [ ] **Step 1: Failing test** — Schema akzeptiert: (a) `relation: 'DEROGATED_BY', direction: 'b-to-a'`, (b) `relation: null` ohne `direction` (Negativ-Klasse), (c) **`relation` gänzlich abwesend** (offener Entwurfs-Zustand — das brauchen Task 12b/13/15!). Lehnt ab: Art außerhalb der Ontologie · **`metadata`-Art** (`AMENDS`, DD-5) · `relation` gesetzt **ohne** `direction` · `direction` gesetzt bei `relation: null`. Loader wirft bei doppelten `caseId`s und fehlender Datei; Stats zählen je Art + `noneShare`.
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — Spiegel von `typingGolden.ts`. **Wichtig: `relation` ist `.optional()`** — sonst scheitern der offene Entwurf (Task 12b), der OOV-Drop (Task 13) und die Blindkopie (Task 15) an der Schema-Prüfung, weil Zod ein fehlendes Pflichtfeld als „Required" wertet (genau wie `TypingLabelsSchema` seine Achsen optional hält):
```ts
const PairSide = z.object({
  regulationKey: z.string().min(1), source: z.string().min(1), paragraphNumber: z.string().min(1),
  title: z.string().optional(), fullText: z.string().min(50), language: z.enum(['de','en']),
});

export const RelationsGoldenCaseSchema = z.object({
  caseId: z.string().min(1),
  a: PairSide,           // DD-4: deterministisch sortiert, a.regulationKey < b.regulationKey
  b: PairSide,
  /** undefined = offen (ungelabelt) · null = keine Beziehung · sonst: nur 'inferred'-Arten (DD-5). */
  relation: z.union([z.string(), z.null()]).optional()
    .refine(v => v === undefined || v === null || isInferredRelation(v),
      { message: 'relation must be null or an INFERRED relation type (metadata relations are parser-only, THE-433 AC-5)' }),
  /** DD-4: Pflicht wenn relation gesetzt, verboten wenn relation null. */
  direction: z.enum(['a-to-b', 'b-to-a']).optional(),
  ambiguous: z.boolean().optional(), notes: z.string().optional(),
  annotator: z.string().optional(), labeledAt: z.string().optional(),
})
.refine(c => !(typeof c.relation === 'string' && !c.direction), { message: 'direction required when relation is set' })
.refine(c => !(c.relation === null && c.direction), { message: 'direction must be absent when relation is null' })
.refine(c => c.a.regulationKey < c.b.regulationKey, { message: 'pair must be ordered: a.regulationKey < b.regulationKey' });
```
plus `RelationsGoldenSetSchema` (`version`, `frozen`, `ontologyVersion`, `rubricRef`, `cases`), `loadRelationsGolden`, `relationsGoldenStats` (je Art + `noneShare` + `openShare`), und `relationLabelForKappa(c)` → `'__none__' | '__open__' | `${relation}:${direction}`` (die eine Stelle, an der die Kappa-Klasse definiert wird — Task 15 benutzt sie, statt sie nachzubauen).
- [ ] **Step 4: Verify PASS** · **Step 5: Commit** — `git add -A packages/server && git commit -m "feat(THE-421): relations golden schema + loader"`

### Task 12a: Paar-Auswahl als reine Funktion (der risikoreiche Kern)

**Files:**
- Create: `packages/server/src/evals/relationsCandidates.ts`
- Test: `packages/server/src/__tests__/relationsCandidates.test.ts`

Vollkreuzprodukt ist ausgeschlossen (300×300 je Gesetzes-Paar). Die Auswahl-Logik bekommt eine **eigene, I/O-freie Funktion mit eigenem Prüfpunkt** — sie ist der Teil, an dem die Qualität des ganzen Prüfsatzes hängt.

- [ ] **Step 1: Failing test**
```ts
it('ranks candidate pairs by cosine similarity across the two laws', () => {
  const ranked = rankCandidatePairs(lawAParagraphs, lawBParagraphs);
  expect(ranked[0].score).toBeGreaterThan(ranked[ranked.length - 1].score);
  for (const p of ranked) expect(p.a.source).not.toBe(p.b.source);
});
it('selects a deliberate negative share from the DISSIMILAR end', () => {
  const sel = selectCandidates(ranked, { targetSize: 20, negativeShare: 0.3, seed: 42 });
  expect(sel).toHaveLength(20);
  const negatives = sel.filter(p => p.bucket === 'negative');
  expect(negatives).toHaveLength(6);
  // Negative stammen aus dem unteren Ähnlichkeits-Ende
  expect(Math.max(...negatives.map(n => n.score))).toBeLessThan(Math.min(...sel.filter(p => p.bucket === 'similar').map(p => p.score)));
});
it('always includes configured anchor pairs regardless of similarity', () => {
  const sel = selectCandidates(ranked, { targetSize: 5, anchors: [['dora:art-1','nis2:art-1']], seed: 42 });
  expect(sel.some(p => p.a.regulationKey === 'dora:art-1' && p.b.regulationKey === 'nis2:art-1')).toBe(true);
});
it('is deterministic for the same seed', () => {
  const keyOf = (s: any[]) => s.map(p => p.a.regulationKey + '|' + p.b.regulationKey);
  expect(keyOf(selectCandidates(ranked, { targetSize: 10, seed: 7 })))
    .toEqual(keyOf(selectCandidates(ranked, { targetSize: 10, seed: 7 })));
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — `rankCandidatePairs(aParas, bParas)` (Kosinus über die vorhandenen Embeddings, nur quellen-übergreifende Paare, Ergebnis absteigend sortiert) und `selectCandidates(ranked, opts)` (Top-N als Ähnlichkeits-Bucket, Bottom-N als Negativ-Bucket, Anker immer dabei, deterministisch über `mulberry32(seed)`). **Negative sind Pflicht:** ohne sie ist Präzision nicht messbar (Analogon zu RUBRIC §5 Hard Negatives). Kein I/O in dieser Datei.
- [ ] **Step 4: Verify PASS** · **Step 5: Commit**

### Task 12b: Entwurfs-Bau + CLI (Beschaffung und Zusammenbau)

**Files:**
- Create: `packages/server/src/scripts/build-relations-golden.ts`
- Test: `packages/server/src/__tests__/buildRelationsGolden.test.ts`

- [ ] **Step 1: Failing test**
```ts
it('orders each pair deterministically by regulationKey (DD-4)', () => {
  const d = buildRelationsDraft(pairsInput);
  for (const c of d.cases) expect(c.a.regulationKey < c.b.regulationKey).toBe(true);
});
it('only pairs paragraphs from DIFFERENT laws', () => {
  for (const c of buildRelationsDraft(pairsInput).cases) expect(c.a.source).not.toBe(c.b.source);
});
it('includes a deliberate share of negative candidates', () => {
  const d = buildRelationsDraft(pairsInput, { targetSize: 20, negativeShare: 0.3 });
  expect(d.cases.length).toBe(20);
  // Negativ-Kandidaten kommen aus dem unähnlichen Ende — hier über die Auswahl belegt
});
it('leaves relation open (undefined) — never guesses a label', () => {
  for (const c of buildRelationsDraft(pairsInput).cases) expect(c.relation).toBeUndefined();
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — `buildRelationsDraft(selected, opts)` setzt die von Task 12a ausgewählten Paare in schema-gültige Fälle um: `caseId` aus beiden `regulationKey`s, **Paar-Sortierung erzwingen** (DD-4: bei Bedarf a/b tauschen), `relation` bleibt **offen** (`undefined` — nie raten). CLI: `--pairs dora:nis2,dsgvo:nis2,dsgvo:eprivacy --target-size 100 --negative-share 0.3 --seed 42 --out …`. Beschaffung in der CLI (nicht in der reinen Funktion): Paragraphen beider Gesetze über die Korpus-API laden, an `rankCandidatePairs`/`selectCandidates` (Task 12a) übergeben, Ergebnis durch `buildRelationsDraft` und `RelationsGoldenSetSchema.parse` vor dem Schreiben. Anker-Liste (DORA Art. 1/2 ↔ NIS2; DSGVO Art. 32 ↔ NIS2 Art. 21; ePrivacy ↔ DSGVO Art. 95) als konfigurierbare Konstante in der CLI-Datei.
- [ ] **Step 4: Verify PASS** · **Step 5: Commit**

### Task 13: Vorschlags-Labels für Beziehungen (nur `inferred`, DD-5)

**Files:**
- Create: `packages/server/src/scripts/prelabel-relations.ts`
- Test: `packages/server/src/__tests__/prelabelRelations.test.ts`

- [ ] **Step 1: Failing test**
```ts
it('offers ONLY inferred relation types in the prompt (DD-5)', () => {
  const p = buildRelationsPrompt(pairCase);
  expect(p).toContain('DEROGATED_BY');
  expect(p).not.toContain('AMENDS');       // metadata — darf nie vom Modell kommen
  expect(p).toContain('none');
});
it('asks for an explicit direction, not a fixed convention (DD-4)', () => {
  const p = buildRelationsPrompt(pairCase);
  expect(p).toContain('a-to-b');
  expect(p).toContain('b-to-a');
});
it('maps "none" to null with no direction, and drops out-of-vocabulary values', () => {
  const none = parseRelationLabel('{"relation":"none"}');
  expect(none.relation).toBeNull();
  expect(none.direction).toBeUndefined();
  const oov = parseRelationLabel('{"relation":"AMENDS","direction":"a-to-b"}'); // metadata → verboten
  expect(oov.relation).toBeUndefined();
  expect(oov.dropped).toBe(true);
});
it('drops the label when a relation is proposed WITHOUT a valid direction', () => {
  const bad = parseRelationLabel('{"relation":"DEROGATED_BY"}');
  expect(bad.relation).toBeUndefined();
  expect(bad.dropped).toBe(true);
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — Haiku (Instruct), `MAX_TOKENS` klein. Optionsliste aus `NORM_ONTOLOGY.relationTypes.filter(r => isInferredRelation(r.id))` + `none`. Prompt zeigt **beide Texte mit Marke A und B** und verlangt die Richtung ausdrücklich als zweites Feld (`{"relation": "...", "direction": "a-to-b"|"b-to-a"}`) — DD-4, keine implizite Konvention. Parse-Semantik wie beim Typing: `none`→`relation: null` (ohne Richtung), unbekannte oder `metadata`-Art → offen + `dropped`, **Art ohne gültige Richtung → offen + `dropped`** (kein Raten), kaputtes JSON → offen, nie werfen. `annotator: 'llm-prelabel:${model}'`.
- [ ] **Step 4: Verify PASS** · **Step 5: Commit**

### Task 14: Adjudikations-Oberfläche für Beziehungen

**Files:**
- Create: `packages/server/src/scripts/relations-worksheet.ts`
- Test: `packages/server/src/__tests__/relationsWorksheet.test.ts`

- [ ] **Step 1: Failing test** — erzeugtes HTML enthält **beide** Texte mit Quelle/Paragraph (als A und B markiert), ein Dropdown mit den `inferred`-Arten + „keine Beziehung", **ein zweites Bedienelement für die Richtung** (`A → B` / `B → A`, deaktiviert solange „keine Beziehung" gewählt ist — DD-4), `ambiguous`-Haken, `notes`-Feld, Export-Knopf; `AMENDS` taucht **nicht** als Option auf. Export erzeugt schema-gültige Fälle (inkl. der Regel „Richtung nur bei gesetzter Art").
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — `renderRelationsWorksheet(set): string`, pur (kein I/O), Muster und Drei-Zustands-Konvention von `typing-worksheet.ts` übernehmen (`__open` → `undefined`, „keine Beziehung" → `null`, sonst die Art). Zwei-Spalten-Karte für die beiden Texte; das Richtungs-Element wird beim Wechsel auf „keine Beziehung" geleert und gesperrt, damit der Export die Schema-Regel nicht verletzen kann.
- [ ] **Step 4: Verify PASS** · **Step 5: Commit**

### Task 15: Blind + Vergleich für Beziehungen

**Files:**
- Create: `packages/server/src/scripts/relations-kappa.ts`
- Test: `packages/server/src/__tests__/relationsKappa.test.ts`
- Modify: `packages/server/package.json` (`relations:*`-Aliase)

- [ ] **Step 1: Failing test** (explizit, nicht nur beschrieben — die n≥10-Regel und die Klassen-Abbildung sind die fehleranfälligen Teile):
```ts
it('blind copy strips relation, direction and all annotator traces (DD-2)', () => {
  const blind = makeBlindRelationsCopy(prelabeledSet);
  for (const c of blind.cases) {
    expect(c.relation).toBeUndefined();
    expect(c.direction).toBeUndefined();
    expect(c.annotator).toBeUndefined();
    expect(c.notes).toBeUndefined();
    expect(c.ambiguous).toBeUndefined();
    expect(c.labeledAt).toBeUndefined();
  }
  expect(RelationsGoldenSetSchema.safeParse(blind).success).toBe(true);
});
it('treats same type but opposite direction as DISAGREEMENT (DD-4)', () => {
  const r = compareRelationsSets(setDerogatedAtoB, setDerogatedBtoA);
  expect(r.overall.kappa).toBeLessThan(1);
  expect(r.disagreements).toHaveLength(1);
});
it('uses relationLabelForKappa as the single class-space definition', () => {
  // null → '__none__', gesetzte Art → 'TYPE:direction'
  expect(relationLabelForKappa({ relation: null } as any)).toBe('__none__');
  expect(relationLabelForKappa({ relation: 'DEROGATED_BY', direction: 'b-to-a' } as any)).toBe('DEROGATED_BY:b-to-a');
});
it('reports per-type kappa only where n >= 10, else marks it too thin (DD-6)', () => {
  const r = compareRelationsSets(setWith12Derogated_and_3Interprets, otherRater);
  expect(r.perType.DEROGATED_BY.kappa).toBeGreaterThan(0);
  expect(r.perType.INTERPRETS.tooThin).toBe(true);
  expect(r.perType.INTERPRETS.kappa).toBeUndefined();
});
it('counts n per REAL relation type — the none class never gets its own per-type entry', () => {
  const r = compareRelationsSets(setMostlyNone, otherRater);
  expect(Object.keys(r.perType)).not.toContain('__none__');
  expect(r.overall.pairs).toBeGreaterThan(0); // none zählt sehr wohl im Gesamt-Kappa
});
it('excludes pairs left open by either rater, and counts them as skipped', () => {
  expect(compareRelationsSets(setWithOpenCase, fullyLabeled).overall.skipped).toBe(1);
});
```
- [ ] **Step 2: Verify FAIL**
- [ ] **Step 3: Implement** — `makeBlindRelationsCopy`; `compareRelationsSets(a,b)` → `{ overall: { kappa, pairs, agreementRate, skipped }, perType: Record<string,{ n, kappa?, tooThin? }>, disagreements, unmatchedCaseIds }`. Klassenraum ausschließlich über `relationLabelForKappa` (aus Task 11) — nicht nachbauen. `n` je Typ = Anzahl Fälle, in denen **mindestens einer** der Prüfer diesen Typ vergeben hat (die `none`-Klasse bekommt keinen Einzelwert, fließt aber ins Gesamt-Kappa). CLI `blind`/`compare` wie Task 7, Tor `< 0.6` auf dem **Gesamt**-Kappa → Exit 1.
- [ ] **Step 4: Verify PASS** · **Step 5: Commit**

### Task 16: RUBRIC-Abschnitt für Beziehungen

**Files:** Modify `packages/server/src/evals/RUBRIC.md`

- [ ] **Step 1: Abschnitt schreiben** — Zweck; **die Richtungs-Konvention (DD-4) als Regel**; Entscheidungsregeln je `inferred`-Art mit Abgrenzung (v. a. `DEROGATED_BY`/`PREVAILS_OVER` — lex specialis — gegen `CONCRETIZES`/`SETS_PARAMETER`; und wann „dieselbe Pflicht in zwei Gesetzen" **keine** Kanten-Beziehung ist, sondern erst in der Harmonisierung zusammenkommt); wann `null` (die Negativ-Klasse) korrekt ist; Hinweis, dass `metadata`-Arten hier nicht vorkommen (DD-5).
- [ ] **Step 2: Commit**

### Task 17 (Ops + Mensch): Beziehungs-Prüfsatz bauen, doppelt labeln, einfrieren

Analog Task 10:
- [ ] **Step 1: Entwurf** — `relations:build` mit den drei Gesetzes-Paaren, ~100 Paare, 30 % Negativ-Anteil.
- [ ] **Step 2: Vorschlags-Labels** — `relations:prelabel`.
- [ ] **Step 3: Prüfer A adjudiziert** — `relations:worksheet` → `relations.v1.rater-a.json`.
- [ ] **Step 4: Blindkopie + Prüfer B** (≥ 20 Überlappungsfälle) → `relations.v1.rater-b.json`.
- [ ] **Step 5: Einigkeit messen** — `relations:kappa compare …` (Gesamt-Kappa + je Art ab n ≥ 10).
- [ ] **Step 6: 🧑 NUTZER-TOR** — strittige Fälle entscheiden, Begründungen in `notes`. Bei Kappa < 0,6: RUBRIC (Task 16) schärfen statt adjudizieren.
- [ ] **Step 7: Einfrieren** — `src/evals/golden/relations.v1.json`, `frozen: true`, committen.

---

## Chunk 5: Abschluss

### Task 18: Volle Verifikation + Gate-1-Nachweis

- [ ] **Step 1** — `npm test -w @thearchitect/server` (bekannte vorbestehende Flaky-Suiten ignorieren, keine **neuen** Rotfärbungen) und `npm test -w @thearchitect/shared`.
- [ ] **Step 2** — TSC: `npm run build -w @thearchitect/shared && npm run build -w @thearchitect/server`.
- [ ] **Step 3** — **Gate-1-Nachweis dokumentieren:** kurzer Report `docs/superpowers/2026-07-20-the-421-gate1-evidence.md` mit: Kappa je Achse (Klassifizierung), Gesamt- + Per-Art-Kappa (Beziehungen), Anzahl adjudizierter Fälle, Streuungs-Statistik beider Sätze, Verweis auf die beiden eingefrorenen Dateien. **Das ist der Beleg, auf den Slice T und K morgen aufsetzen.**
- [ ] **Step 4** — Final-Review über den gesamten Branch.
- [ ] **Step 5** — Commit + PR.

---

## Verifikationsstrategie

- **Unit:** Ontologie-Facette (Mitgliedschaft, Export, Version) · 5-Achsen-Schema/Stats · generischer Prompt · mehrklassiges Kappa (inkl. Schieflage-Fall) · Blindkopie entfernt wirklich alles (DD-2) · Paar-Sortierung + Negativ-Anteil · `inferred`-Torwächter (DD-5).
- **Generizitäts-Beleg:** Eval + Metriken decken 5 Achsen ab, **ohne** dass ihre Dateien angefasst wurden (Task 5).
- **Rückwärtskompatibilität:** `buildTypingDraft` ohne `targetSize` verhält sich unverändert; das binäre `cohenKappa` bleibt für den Zuordnungs-Pfad.
- **Menschliche Tore:** zweimal (Task 10 Step 6, Task 17 Step 6) — beide als explizite Nutzer-Schritte markiert, nicht an Subagenten delegierbar.
- **Freeze-Disziplin:** eingefrorene Sätze werden nie editiert (DD-7); Korrekturen erzeugen `v2`.

## Offene Punkte

- **O-1 Zugang Zweitprüfer (MikeOSS):** Demo vs. Self-Host. Wird bei Task 10 Step 4 gebraucht (nicht früher). Rückfall laut Spec: anderes Modell-Haus mit unabhängigem Prompt — Unabhängigkeit ist das Kriterium, nicht der Anbieter.
- **O-2 Schwellen für Gate 2/3:** nicht Teil dieses Plans (erst nach dem ersten Eval-Lauf seriös setzbar).
- **O-3 Schreibzugang Korpus:** erst für Slice T (morgen) relevant — der deployte Container liest read-only, der Batch braucht einen Schreib-Zugang. Hier noch nicht nötig.
