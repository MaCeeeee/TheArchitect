# THE-597 Retrospektives Gate, Slice 0 + 1 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine reproduzierbare Messung, ob eine Konfidenz-Schwelle die bekannten stillen Typisierungsfehler an einen Menschen geroutet hätte (Recall auf Fehlern) ohne die richtigen Fälle zu fluten (Fehlalarm) — mit einer retrospektiv erzeugten Self-Consistency-Konfidenz auf dem frozen Golden gv3, plus Fehlerfall-Register und ECE/Routing auf dem Mapping-Pfad, der heute schon Confidence trägt.

**Architecture:** Drei reine, testbare Bausteine kommen dazu: (1) generische Metriken `aurocFromSamples` + `thresholdRoutingStats` in `evals/metrics.ts` über das vorhandene `CalibrationSample`, (2) ein Self-Consistency-Wrapper `withSelfConsistency(inner, k)` um den injizierbaren Classifier in `runTypingEval.ts` (Mehrheitslabel je Achse, Konfidenz = Stimmenanteil), (3) ein THE-597-Abschnitt im Typing-Report. Der Live-Lauf ist ein einziger Befehl; alles andere läuft ohne LLM und ohne Datenbank.

**Tech Stack:** TypeScript, Jest (`packages/server`, `testMatch: src/__tests__/**/*.test.ts`), ts-node-Skripte, Anthropic SDK (nur Task 7), frozen Golden `src/evals/golden/typing.gv3.json` (70 Fälle, ontologyVersion 1.7.0).

**Linear:** [THE-597](https://linear.app/thearchitect/issue/THE-597) (REQ, In Progress, fällig 02.10.) · Parent [THE-604](https://linear.app/thearchitect/issue/THE-604) (Loop-Kontrakt Strang 2 als Kommentar) · Kill-Schwelle an [THE-606](https://linear.app/thearchitect/issue/THE-606)

**RVTM:** `docs/superpowers/rvtm/2026-09-20-the597-retro-gate-slice01-rvtm.md`

**Prüfszenarien (versiegelt):** `docs/superpowers/pruefszenarien/2026-09-20-the597-retro-gate-slice01-pruefszenarien.md` — implementers must not read this file

---

## Kontext: was der Pre-Flight (20.09.) gemessen hat

- Die Messinfrastruktur steht: `expectedCalibrationError` (`src/evals/metrics.ts:369`), `CalibrationSample {confidence, correct}` (`:338`), `axisCalibration` (`src/evals/typingMetrics.ts:148`), injizierbarer Classifier `evaluateTyping({golden, classify, bandOf, collect})` (`src/evals/runTypingEval.ts:52`), `Classification.confidence?: Partial<Record<TypingAxis, number>>` (`:44`).
- **Die Typisierung erzeugt heute keine Confidence.** Der Prompt fragt nur nach einer id je Achse (`packages/shared/src/typing/prompt.ts:256-268`), `anthropicClassify` gibt `{labels, partyRoleObserved}` zurück (`runTypingEval.ts:196`). `axisCalibration` liefert deshalb auf allen fünf Achsen `null`. Isotonic/Platt/Brier: 0 Treffer im Repo.
- Bekannte Fehlerfälle: THE-542 (`packages/shared/src/obligations/slots.ts:31-53`, verbot 0/219), THE-588 (`src/services/addresseeLexicon.ts:43-66`), ≥5 Fehlklassifikationen in `src/evals/reports/typing-gv3.md`, stiller Mongoose-strict-Drop (`packages/compliance-crawler/src/db/regulation.model.ts:165-172`).
- **Versteckte Prämisse (Stufe 3):** „Schicht 1 lässt sich retrospektiv messen" setzt ein Confidence-Signal voraus. Ohne Gegenmaßnahme misst dieses Ticket ein No-Go, weil das Instrument fehlt. Gegenmaßnahme ist Slice 1; ihre Positivkontrolle ist **AUROC > 0,6** der Rohkonfidenz gegen richtig/falsch auf mindestens einer Inhalts-Achse (obligationKind, partyRole, provisionKind). Darunter heißt der Befund „nicht messbar", nie „No-Go".

**Kill-Kriterium (Kontrakt an THE-604):** greift erst in Slice 3 (Go/No-Go je Schicht, ≥ 50 % Recall bei ≤ 10 % Fehlalarm). Dieser Plan liefert die Zahlen dafür, entscheidet aber nichts. Time-Box Slice 1: zwei Tage; THE-597 gesamt fällig 02.10.

## Vorbereitung (vor Task 1)

- [ ] **Eigener Worktree.** Im Hauptrepo liegen uncommitted Änderungen anderer Sessions (character-scene, docs). Ein geteilter Git-Index führt zu Races.

```bash
cd /Users/mac_macee/javis && git fetch origin && git worktree add /Users/mac_macee/javis-the597 -b feat/the-597-retro-gate origin/master
```

- [ ] **Branch-Name ist Absicht.** Er trägt **THE-597** (das REQ), nicht THE-604 (Parent). Linear schließt Tickets über Branch-Name *und* Commit-Titel; THE-597 darf beim Merge schließen (der Messbericht ist sein Deliverable, der Go/No-Go-Kommentar kommt von Hand), THE-604 nie automatisch.

- [ ] **Worktree hat keine eigenen `node_modules`** — Tests liefen sonst still gegen das `shared` des Hauptrepos:

```bash
cd /Users/mac_macee/javis-the597 && npm install && npm run build --workspace=@thearchitect/shared
```

- [ ] **Plan, RVTM und versiegelten Katalog auf den Branch legen.** Sie liegen im Hauptrepo uncommitted; ein Worktree von `origin/master` kennt sie sonst nicht, und die RVTM wird im Worktree gepflegt. `cp` liest nichts in den Kontext — die Siegelregel bleibt unberührt.

```bash
cd /Users/mac_macee/javis-the597 && mkdir -p docs/superpowers/plans docs/superpowers/rvtm docs/superpowers/pruefszenarien && cp /Users/mac_macee/javis/docs/superpowers/plans/2026-09-20-the597-retro-gate-slice01.md docs/superpowers/plans/ && cp /Users/mac_macee/javis/docs/superpowers/rvtm/2026-09-20-the597-retro-gate-slice01-rvtm.md docs/superpowers/rvtm/ && cp /Users/mac_macee/javis/docs/superpowers/pruefszenarien/README.md /Users/mac_macee/javis/docs/superpowers/pruefszenarien/2026-09-20-the597-retro-gate-slice01-pruefszenarien.md docs/superpowers/pruefszenarien/ && git add docs/superpowers && git commit -m "docs(the-597): Plan, RVTM und versiegelte Prüfszenarien für Slice 0+1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git show --stat HEAD | tail -1
```

Expected: `4 files changed, …`.

- [ ] **Wissen, was das Repo ignoriert.** `packages/server/src/evals/reports/.gitignore` ist `*` + `!.gitignore` — Eval-Läufe sind Lauf-Artefakte, nur Kuratiertes gehört ins Repo. Deshalb wandert **jede Evidenz dieses Plans nach `docs/evals/`** (Konvention der 48 Dateien dort); ein `git add …/reports/…` fügt still nichts hinzu.

- [ ] **Basislinie festhalten** (drei bestehende Suiten müssen am Ende genauso grün sein; Zahl **je Suite** notieren — heute 30 Tests über die drei):

```bash
cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/typingMetrics.test.ts src/__tests__/runTypingEval.test.ts src/__tests__/evalCalibration.test.ts 2>&1 | tail -5
```

Expected: `Tests: N passed` (N notieren).

- [ ] **Kein Implementierer öffnet** `docs/superpowers/pruefszenarien/`. **Kein Implementierer ändert** eine Datei unter `src/evals/golden/`.

## File Structure

| Datei | Art | Verantwortung |
|---|---|---|
| `docs/evals/the597-fehlerfall-register.md` | Create | Das gemeinsame Fehlerfall-Register: jeder bekannte stille Fehler mit Quelle, Facette, erwarteter Fang-Schicht, „Ausgang bekannt". Wird in Slice 2/3 je Schicht ausgefüllt. |
| `packages/server/src/evals/metrics.ts` | Modify (additiv, ans Ende) | `aurocFromSamples`, `thresholdRoutingStats`, Typ `RoutingStat`. Generisch über `CalibrationSample`. |
| `packages/server/src/__tests__/the597Routing.test.ts` | Create | Tests für die beiden Metriken, ohne LLM. |
| `packages/server/src/evals/typingMetrics.ts` | Modify | `axisCalibrationSamples(cases, axis)` herausziehen; `axisCalibration` benutzt sie (Verhalten unverändert). |
| `packages/server/src/__tests__/typingMetrics.test.ts` | Modify (append) | Ein Test, dass `axisCalibrationSamples` offene Achsen und fehlende Confidence auslässt. |
| `packages/server/src/evals/runTypingEval.ts` | Modify | `aggregateVotes`, `withSelfConsistency`, `renderThe597Section`; CLI-Flag `--samples k`; `.env` wird in `main()` geladen (nicht beim Import); Report-Suffix `-sc<k>`; JSON um `model`, `samples`, `the597` und die Fallzeilen `cases[]` erweitert. |
| `packages/server/src/__tests__/runTypingEval.test.ts` | Modify (append) | Tests für Voting, Wrapper, Abschnitt — mit Stub-Classifier und Fixture-Golden. |
| `packages/server/src/evals/runMappingEval.ts` | Modify | Abschnitt „ECE + Schwellen-Routing (THE-597)" im Markdown und zwei Keys im JSON, direkt neben dem vorhandenen Band-Block. |
| `docs/evals/the597-input-typing-gv3.md` | Create (Task 1, Kopie) | Kopie des lokalen gv3-Laufs (`src/evals/reports/typing-gv3.md`, gitignored) — der Input, den das Register zitiert; sonst kann ein Prüfer fünf von neun Zeilen nicht nachschlagen. |
| `docs/evals/the597-typing-gv3-sc5.md` / `.json` | Create (Task 7, Kopie des Laufs) | Der Messlauf mit k = 5. `src/evals/reports/` ist gitignored; die Kopie in `docs/evals/` ist die committete Evidenz (AC-1). |

---

## Chunk 1: Slice 0 — Register und Metriken (kein LLM, keine Datenbank)

### Task 1: Fehlerfall-Register anlegen

**Files:**
- Create: `docs/evals/the597-input-typing-gv3.md` (Kopie)
- Create: `docs/evals/the597-fehlerfall-register.md`

- [ ] **Step 0: Den zitierten gv3-Lauf ins Repo kopieren** (er liegt nur lokal, gitignored):

```bash
cd /Users/mac_macee/javis-the597 && cp packages/server/src/evals/reports/typing-gv3.md docs/evals/the597-input-typing-gv3.md && grep -c '^## ' docs/evals/the597-input-typing-gv3.md
```

Expected: eine Zahl ≥ 6 (Beobachtungskanal + fünf Achsen-Abschnitte).

- [ ] **Step 1: Datei mit diesem Inhalt anlegen** (Zahlen stammen aus dem Pre-Flight vom 20.09.; jede Zeile trägt ihre Quelle, damit ein Prüfer sie nachschlagen kann)

```markdown
# THE-597 — Fehlerfall-Register (Stand 2026-09-20, Slice 0)

Ein Ort für alle bekannten *stillen* Klassifikationsfehler, gegen die die drei Kandidaten-Schichten
(1 Kalibrierung/Schwelle · 2 Zod-Shape-Set v0 · 3 FCA/Statistik) retrospektiv gemessen werden.
„Still" heißt: der Fehler erzeugte keinen Alarm, er wurde durch Gegenprobe oder Zufall gefunden.
Spalte **Ausgang bekannt** = es gibt eine Gold-Wahrheit oder eine dokumentierte Messung, gegen die
„gefangen / nicht gefangen" entschieden werden kann.

**Benennung von Schicht 2:** Im Ticket (THE-597, THE-607) heißt sie „SHACL v0-Entwurf". SHACL wurde am
05.07.2026 bewusst verworfen (`docs/strategy/2026-07-05-canon-architecture-design.md:1130`, keine
SPARQL-Steuer); das Äquivalent im Repo ist die Zod-Schreibgrenze. Hier als **Zod-Shape-Set v0** geführt;
Slice 3 ordnet sein Go/No-Go der Ticket-Schicht „SHACL v0" zu.

## A. Fehlerfälle

| ID | Fall | Facette | Quelle (Datei:Zeile / Report) | Ausgang bekannt | Erwartete Fang-Schicht | Warum diese Schicht |
|---|---|---|---|---|---|---|
| F-01 | THE-542/543: Modalität 219/219 „gemessen", aber nur 2 Werte belegt (pflicht 210, erlaubnis 9, **verbot 0**) | obligationKind / modalitaet | `packages/shared/src/obligations/slots.ts:31-53`; `src/scripts/obligation-slots.ts:190-207` | ja (Verteilung dokumentiert; Ursache Korpus-Zuschnitt, nicht Prompt) | 3 | Eine Konstante ist ein statistischer Befund (Verteilungs-Wächter), keine Einzelfall-Frage |
| F-02 | THE-588: „oder"-Aufzählung im Adressaten-Lexikon wählte die erstbeste Regel (Zeilenreihenfolge entschied, nicht der Text) | partyRole | `src/services/addresseeLexicon.ts:43-66`; Sonde `src/scripts/the588-impact-probe.ts`; `docs/evals/scf-gold-produktpfad.md:140-165` | ja (gefixt; 12 eingefrorene Werte in der Sonde) | 2 | Zwei Rollen im Text, eine im Ergebnis: eine Shape-Regel „Aufzählung ⇒ Mehrfachrolle oder null" |
| F-03 | `partyRoleObserved` verschwand still: mongoose strict streicht unbekannte Pfade bei `$set` kommentarlos | (Schreibpfad) | `packages/compliance-crawler/src/db/regulation.model.ts:165-173`; Typing-Assembler ohne `.parse()` `packages/compliance-crawler/src/lib/typingBatch.ts:145` | ja (dokumentiert; gefixt durch Schema-Feld + `strict: 'throw'`) | 2 | Genau der Fall, den eine Schreibgrenze laut abweist |
| F-04 | `obligationKind`/`prohibition`: P 0,33 · R 0,33 · F1 0,33 bei support 3 (gv3, Haiku 4.5); auf gv2 F1 0,00 | obligationKind | `docs/evals/the597-input-typing-gv3.md`; `docs/evals/typing-release-gates.md:103` | ja (Gold gv3 frozen) | 1 | Eine niedrige Konfidenz auf dieser Klasse würde den Fall an den Menschen routen |
| F-05 | `partyRole`/`supervisory_authority`: R 0,36 bei support 14, gedrückt von `conformity_assessment_body` (P 0,44, R 1,00) | partyRole | `docs/evals/the597-input-typing-gv3.md`; `docs/evals/typing-release-gates.md:100-102` | ja (Gold gv3) | 1 | Verwechslung zweier Nachbarklassen — Self-Consistency sollte hier schwanken |
| F-06 | `provisionKind`/`procedural`: R 0,36 bei support 14 | provisionKind | `docs/evals/the597-input-typing-gv3.md` | ja (Gold gv3) | 1 | wie F-05 |
| F-07 | `partyRole`/`member_state`: P 0,38 bei support 6 | partyRole | `docs/evals/the597-input-typing-gv3.md` | ja (Gold gv3) | 1 | wie F-05 |
| F-08 | `provisionKind`/`definition`: F1 0,00 bei n = 1 | provisionKind | `docs/evals/the597-input-typing-gv3.md`; Klassen-Regel n ≥ 3 in `docs/evals/typing-release-gates.md:34-48` | ja, aber n = 1 | 1 (nur deskriptiv) | Unter der Klassen-Regel; wird berichtet, nicht gewertet |
| F-09 | Tote Achsen: `bindingness` 99,9 % `binding` (0,014 Bit), `normKind` 97 % `legislation` (0,224 Bit) — Trivial-Messlatte „immer häufigste Klasse" erreicht 100 %; Freigabe-Schwelle ≥ 0,85 war ein grünes Licht, das nichts prüft | bindingness, normKind | `docs/evals/the691-achsen-implikationen.md`; `docs/daily-2026-08-13.md:101-113`; `runTypingEval.ts:31-36` (AKT_METADATEN_ACHSEN) | ja (Korpus-Messung 1750 Bestimmungen) | 3 | Bereits von der FCA-Sonde gefunden — der Nachweis, dass Schicht 3 einen Fall fängt, existiert |

## B. AC-4 — „Feature Oracle Kalibrierung" (Daily 2026-04-05)

Kein Kalibrierungsverfahren, sondern Prompt-Tuning: Score-Spannen je `riskThreshold` wurden in den
System-Prompt von `oracle.service.ts` geschrieben (HIGH → 65–80, MEDIUM → 50–70, LOW → 20–40/60–80) und
gegen eine *erwartete Spanne* geprüft, nicht gegen Gold. Kein Eval, keine Reliability-Prüfung.
**Wiederverwendbar: nein.** Wert für THE-597: das Negativbeispiel einer Zahl mit „kalibriert"-Etikett
ohne Messinstrument dahinter (vgl. ADR-0012).

## C. Wo heute Confidence entsteht — und wo nicht

| Pfad | Feld | Stelle | Gold-Pairing vorhanden | Offline messbar |
|---|---|---|---|---|
| Norm→Element-Mapping | `confidence` (Schwelle 0,5) | `src/services/complianceMapping.service.ts:79,502` | ja (`mapping.v1/v2`, 15 Fälle, **nicht frozen**) | nur bei gültigem Cache (`--offline`) |
| REQGEN | `extractionConfidence` | `src/services/requirementGenerator.service.ts:43,278` | nein | nein |
| Discovery-Judge | `confidence` | `src/services/lawDiscovery.service.ts:433` | ja, aber nur mit `--judge` live | nein |
| Relations-Vorschlag | `confidence` (optional) | `packages/shared/src/relations/suggestion.ts:59` | Gold ja (relations.v5), Confidence im Baseline-Lauf nicht erhoben | nein |
| **Typisierung (5 Achsen)** | **keine** | `packages/shared/src/typing/prompt.ts:256-268`; `runTypingEval.ts:196` | ja (gv3 frozen, 70 Fälle) | **nein — Slice 1 erzeugt das Signal** |

Konsequenz: Schicht 1 wird in Slice 1 auf der Typisierung gemessen, mit einer retrospektiv erzeugten
Self-Consistency-Konfidenz. Positivkontrolle des Instruments: AUROC > 0,6 auf mindestens einer
Inhalts-Achse. Fällt sie, lautet der Befund „nicht messbar", nicht „No-Go".

## D. Slice-1-Ergebnis

_(wird in Task 8 ausgefüllt)_
```

- [ ] **Step 2: Sichtprüfung** — neun F-Zeilen, jede mit Quelle; Abschnitt D leer.

Run: `grep -c '^| F-' /Users/mac_macee/javis-the597/docs/evals/the597-fehlerfall-register.md`
Expected: `9`

- [ ] **Step 3: Commit**

```bash
cd /Users/mac_macee/javis-the597 && git add docs/evals/the597-fehlerfall-register.md docs/evals/the597-input-typing-gv3.md && git commit -m "docs(the-597): Fehlerfall-Register — neun bekannte stille Fehler mit Quelle und Fang-Schicht

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: AUROC und Schwellen-Routing als generische Metriken

**Files:**
- Modify: `packages/server/src/evals/metrics.ts` (ans Dateiende, additiv)
- Test: `packages/server/src/__tests__/the597Routing.test.ts`

Semantik (steht so auch im Code-Kommentar): Ein Vorschlag wird an den Menschen geroutet, wenn `confidence < threshold`. **Recall** = geroutete falsche / alle falschen. **Fehlalarm** = geroutete richtige / alle richtigen. AUROC = Wahrscheinlichkeit, dass ein zufälliger richtiger Vorschlag höhere Konfidenz hat als ein zufälliger falscher (Ties zählen 0,5); 0,5 = die Konfidenz trägt keine Information.

- [ ] **Step 1: Failing Test schreiben**

```ts
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
    expect(t08).toMatchObject({ caught: 3, falseAlarms: 1 });
    expect(t10).toMatchObject({ caught: 3, falseAlarms: 3 });
    expect(t10.recall).toBeCloseTo(0.75);
    expect(t10.falseAlarmRate).toBeCloseTo(0.5);
  });
  it('keine falschen Fälle → recall 0, keine richtigen → falseAlarmRate 0 (nie NaN)', () => {
    const [only] = thresholdRoutingStats([S(0.3, true)], [0.6]);
    expect(only.recall).toBe(0);
    expect(only.falseAlarmRate).toBe(1);
    const [none] = thresholdRoutingStats([], [0.6]);
    expect(none.recall).toBe(0);
    expect(none.falseAlarmRate).toBe(0);
  });
  it('Default-Schwellen sind 0.6, 0.8, 1.0', () => {
    expect(thresholdRoutingStats(samples).map((s) => s.threshold)).toEqual([0.6, 0.8, 1.0]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/the597Routing.test.ts`
Expected: FAIL — `TypeError: (0 , _metrics.aurocFromSamples) is not a function` (ts-jest läuft transpile-only; den Typfehler TS2305 zeigt erst `npx tsc --noEmit -p .`).

- [ ] **Step 3: Metriken implementieren** — ans Ende von `src/evals/metrics.ts` anhängen:

```ts
// ─── THE-597: Schwellen-Routing + AUROC (retrospektives Gate) ────
//
// Frage des Gates: Hätte eine Konfidenz-Schwelle die bekannten Fehler an den
// Menschen geroutet — und wie viele richtige Fälle hätte sie mitgerissen?
// Routing-Regel: confidence < threshold ⇒ Mensch. Generisch über
// CalibrationSample, damit Mapping, Typing und Relations dieselbe Rechnung
// benutzen (Kill-Schwelle laut Kontrakt an THE-604: ≥ 50 % Recall bei
// ≤ 10 % Fehlalarm).

export interface RoutingStat {
  threshold: number;
  wrong: number;
  correct: number;
  /** falsche Vorhersagen mit confidence < threshold (geroutet = gefangen) */
  caught: number;
  /** richtige Vorhersagen mit confidence < threshold (geroutet = Fehlalarm) */
  falseAlarms: number;
  /** caught / wrong; 0 wenn wrong = 0 */
  recall: number;
  /** falseAlarms / correct; 0 wenn correct = 0 */
  falseAlarmRate: number;
}

export function thresholdRoutingStats(
  samples: CalibrationSample[],
  thresholds: number[] = [0.6, 0.8, 1.0]
): RoutingStat[] {
  const wrong = samples.filter((s) => !s.correct);
  const correct = samples.filter((s) => s.correct);
  return thresholds.map((threshold) => {
    const caught = wrong.filter((s) => s.confidence < threshold).length;
    const falseAlarms = correct.filter((s) => s.confidence < threshold).length;
    return {
      threshold,
      wrong: wrong.length,
      correct: correct.length,
      caught,
      falseAlarms,
      recall: wrong.length ? caught / wrong.length : 0,
      falseAlarmRate: correct.length ? falseAlarms / correct.length : 0,
    };
  });
}

/**
 * AUROC der Konfidenz als Richtig/Falsch-Trenner: P(conf(richtig) > conf(falsch)),
 * Ties zählen 0,5. 0,5 = keine Information; null, wenn eine Klasse fehlt
 * (dann ist die Frage nicht gestellt, nicht „bestanden"). O(n·m) — für
 * Eval-Größen (≤ 10⁴ Paare) bewusst simpel statt sortiert.
 */
export function aurocFromSamples(samples: CalibrationSample[]): number | null {
  const pos = samples.filter((s) => s.correct).map((s) => s.confidence);
  const neg = samples.filter((s) => !s.correct).map((s) => s.confidence);
  if (pos.length === 0 || neg.length === 0) return null;
  let sum = 0;
  for (const p of pos) for (const n of neg) sum += p > n ? 1 : p === n ? 0.5 : 0;
  return sum / (pos.length * neg.length);
}
```

- [ ] **Step 4: Test grün**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/the597Routing.test.ts`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/mac_macee/javis-the597 && git add packages/server/src/evals/metrics.ts packages/server/src/__tests__/the597Routing.test.ts && git commit -m "feat(evals): THE-597 Schwellen-Routing + AUROC über CalibrationSample

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Kalibrierungs-Samples je Achse herausziehen

**Files:**
- Modify: `packages/server/src/evals/typingMetrics.ts:146-158` (Funktion `axisCalibration`)
- Test: `packages/server/src/__tests__/typingMetrics.test.ts` (append)

Grund: Slice 1 braucht dieselben `(confidence, correct)`-Paare je Achse für Routing und AUROC. Die Logik existiert schon in `axisCalibration` — sie wird herausgezogen, nicht kopiert.

- [ ] **Step 1: Failing Test anhängen** an `src/__tests__/typingMetrics.test.ts` (Importzeile oben um `axisCalibrationSamples` ergänzen; falls die Datei `TypingEvalCase` noch nicht importiert, ebenfalls ergänzen):

```ts
describe('axisCalibrationSamples (THE-597)', () => {
  it('liefert je Fall mit Gold UND Confidence genau ein Sample; null==null ist korrekt', () => {
    const cases: TypingEvalCase[] = [
      { caseId: 'a', source: 's', language: 'de', gold: { partyRole: 'controller' }, predicted: { partyRole: 'controller' }, confidence: { partyRole: 0.8 } },
      { caseId: 'b', source: 's', language: 'de', gold: { partyRole: 'controller' }, predicted: { partyRole: 'processor' }, confidence: { partyRole: 0.4 } },
      { caseId: 'c', source: 's', language: 'de', gold: { partyRole: null }, predicted: { partyRole: null }, confidence: { partyRole: 1.0 } },
      { caseId: 'd', source: 's', language: 'de', gold: { partyRole: 'controller' }, predicted: { partyRole: 'controller' } }, // keine Confidence → kein Sample
      { caseId: 'e', source: 's', language: 'de', gold: {}, predicted: { partyRole: 'controller' }, confidence: { partyRole: 0.9 } }, // Gold offen → kein Sample
    ];
    expect(axisCalibrationSamples(cases, 'partyRole')).toEqual([
      { confidence: 0.8, correct: true },
      { confidence: 0.4, correct: false },
      { confidence: 1.0, correct: true },
    ]);
  });
  it('axisCalibration liefert weiterhin null ohne Confidence', () => {
    const cases: TypingEvalCase[] = [
      { caseId: 'a', source: 's', language: 'de', gold: { partyRole: 'controller' }, predicted: { partyRole: 'controller' } },
    ];
    expect(axisCalibration(cases, 'partyRole')).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag sehen**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/typingMetrics.test.ts`
Expected: FAIL — `axisCalibrationSamples` nicht exportiert.

- [ ] **Step 3: Refactor** — in `src/evals/typingMetrics.ts` die Zeilen 146–159 (von der Kommentar-Überschrift `// ─── Kalibrierung je Achse …` bis zur schließenden Klammer von `axisCalibration`) ersetzen durch:

```ts
// ─── Kalibrierung je Achse (nur wenn Confidence vorhanden) ──────

/**
 * (confidence, correct)-Paare je Achse — ein Sample je Fall, der Gold UND
 * Confidence trägt. Gold `null` und Vorhersage `null` zählen als korrekt.
 * THE-597 benutzt dieselben Paare für Routing (Recall/Fehlalarm) und AUROC,
 * deshalb herausgezogen statt in axisCalibration versteckt.
 */
export function axisCalibrationSamples(cases: TypingEvalCase[], axis: TypingAxis): CalibrationSample[] {
  const samples: CalibrationSample[] = [];
  for (const c of cases) {
    const conf = c.confidence?.[axis];
    const g = c.gold[axis];
    if (conf === undefined || g === undefined) continue;
    const p = c.predicted[axis];
    const correct = (g === null && p === null) || (g !== null && g === p);
    samples.push({ confidence: conf, correct });
  }
  return samples;
}

export function axisCalibration(cases: TypingEvalCase[], axis: TypingAxis): CalibrationReport | null {
  const samples = axisCalibrationSamples(cases, axis);
  return samples.length ? expectedCalibrationError(samples) : null;
}
```

- [ ] **Step 4: Beide Suiten grün, Basislinie unverändert**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/typingMetrics.test.ts src/__tests__/runTypingEval.test.ts src/__tests__/evalCalibration.test.ts`
Expected: PASS; Anzahl über die drei Suiten = Basislinie + 2.

- [ ] **Step 5: Commit**

```bash
cd /Users/mac_macee/javis-the597 && git add packages/server/src/evals/typingMetrics.ts packages/server/src/__tests__/typingMetrics.test.ts && git commit -m "refactor(evals): axisCalibrationSamples herausgezogen — Basis für THE-597 Routing je Achse

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Mapping-Report um ECE und Routing erweitern; Offline-Lauf versuchen

**Files:**
- Modify: `packages/server/src/evals/runMappingEval.ts` — in der Report-Funktion direkt **nach** dem Block, der `## Precision je Confidence-Band` schreibt (die `for (const b of bands)`-Schleife endet mit `lines.push('');`), und im JSON-Objekt neben `confidenceBands:` (Zeile ~387)

Der Mapping-Pfad ist der einzige, der heute Confidence **und** Gold hat. Der Report zeigt Precision je Band, aber weder ECE noch Routing. Beides kommt additiv dazu; die Rechnung ist dieselbe wie in Slice 1.

- [ ] **Step 1: Imports ergänzen** — in der bestehenden Import-Liste aus `./metrics` (dort steht bereits `precisionByConfidenceBand`) drei Namen hinzufügen:

```ts
  calibrationSamplesFromOutcomes,
  expectedCalibrationError,
  thresholdRoutingStats,
```

- [ ] **Step 2: Markdown-Abschnitt einfügen** — unmittelbar nach der `bands`-Schleife (nach deren abschließendem `lines.push('');`, vor `lines.push('## Fehler-Detail (FP/FN je Case)');`):

```ts
  // THE-597: dieselbe Rechnung wie das retrospektive Gate — ECE plus
  // Schwellen-Routing (confidence < t ⇒ Mensch). Unter 30 Samples ist das
  // eine Beobachtung, keine Kalibrierung (THE-606: Mindest-N je Facette).
  const calSamples = calibrationSamplesFromOutcomes(outcomes);
  const cal = expectedCalibrationError(calSamples);
  lines.push('## ECE + Schwellen-Routing (THE-597)');
  lines.push('');
  lines.push(`ECE: **${cal.ece.toFixed(3)}** über ${cal.samples} Vorhersagen${cal.samples < 30 ? ' — ⚠️ unter Mindest-N, `uncalibrated`' : ''}`);
  lines.push('');
  lines.push('| Schwelle | falsche | gefangen | Recall | richtige | Fehlalarme | Fehlalarmquote |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of thresholdRoutingStats(calSamples)) {
    lines.push(`| < ${r.threshold.toFixed(1)} | ${r.wrong} | ${r.caught} | ${pct(r.recall)} | ${r.correct} | ${r.falseAlarms} | ${pct(r.falseAlarmRate)} |`);
  }
  lines.push('');
```

- [ ] **Step 3: JSON ergänzen** — im Objekt, das `confidenceBands: precisionByConfidenceBand(run.outcomes),` enthält, zwei Zeilen darunter:

```ts
          calibration: expectedCalibrationError(runCalSamples),
          routing: thresholdRoutingStats(runCalSamples),
```

und direkt **vor** dem `fs.writeFileSync(`, das dieses JSON schreibt, einmal hochziehen:

```ts
    const runCalSamples = calibrationSamplesFromOutcomes(run.outcomes);
```

- [ ] **Step 4: Typprüfung**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx tsc --noEmit -p .`
Expected: keine Fehler.

- [ ] **Step 5: Offline-Lauf — der erwartete Fehlschlag** (kein API-Key nötig). Gemessen im Pre-Flight-Review: `mapping.v1.json` trägt `"version": "v1-draft"` (umbenannt in Commit 3f7416e), der committete Cache liegt unter `src/evals/cache/v1-seed/`; `predictCase` sucht `cache/<version>/…`, also `cache/v1-draft/`, das es nicht gibt. Der Lauf scheitert deterministisch am ersten Fall — unabhängig vom Prompt-Hash.

Run: `cd /Users/mac_macee/javis-the597/packages/server && npm run eval:mapping -- --offline --golden src/evals/golden/mapping.v1.json 2>&1 | tail -3`
Expected: `[eval] FAILED: --offline: no valid cache for case "dsgvo-art30-vvt" / model "…" (model/prompt/text changed …)` und Exit ≠ 0 (Modellname kommt aus `ANTHROPIC_MODEL` in `.env`). **Kein Live-Lauf** in diesem Slice (Time-Box; n = 15, nicht frozen). Der Code-Zusatz aus Step 2–3 bleibt: er ist die Rechnung, die THE-606 später auf dem Mapping-Pfad braucht.

- [ ] **Step 6: Register nachtragen** — in `docs/evals/the597-fehlerfall-register.md`, Abschnitt C, Zeile „Norm→Element-Mapping", Spalte „Offline messbar" ersetzen durch:

`nein (kein Cache-Bucket für Golden-Version v1-draft — der committete Cache liegt unter v1-seed; Fehler reproduziert in Task 4) — Live-Lauf n = 15, nicht frozen: Beobachtung, keine Kalibrierung`

- [ ] **Step 7: Commit**

```bash
cd /Users/mac_macee/javis-the597 && git add packages/server/src/evals/runMappingEval.ts docs/evals/the597-fehlerfall-register.md && git commit -m "feat(evals): Mapping-Report zeigt ECE + Schwellen-Routing (THE-597 Slice 0)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 2: Slice 1 — Self-Consistency-Konfidenz auf gv3 (ein LLM-Lauf)

### Task 5: Mehrheits-Voting und Wrapper um den Classifier

**Files:**
- Modify: `packages/server/src/evals/runTypingEval.ts` (nach `evaluateTyping`, vor `// ─── Markdown-Report (rein)`)
- Test: `packages/server/src/__tests__/runTypingEval.test.ts` (append)

Regeln: Je Achse zählt jeder Lauf eine Stimme (`null` = Stimme „nicht anwendbar"; `undefined` = offen, keine Stimme). Gewinner = häufigste Stimme. **Tie deterministisch: `na` gewinnt vor jeder id (Enthaltung ist die konservative Wahl für ein Gate), sonst Label-String aufsteigend** — und die Konfidenz bleibt der Stimmenanteil (≤ 0,5), sodass ein Tie geroutet wird. **Konfidenz = Stimmen des Gewinners / k** — offene Läufe drücken die Konfidenz, weil Schweigen Unsicherheit ist. Bleibt eine Achse in allen Läufen offen, bleibt sie offen und bekommt keine Konfidenz.

- [ ] **Step 1: Failing Tests anhängen** an `src/__tests__/runTypingEval.test.ts` (Importzeile um `aggregateVotes, withSelfConsistency, type Classification` ergänzen):

```ts
describe('aggregateVotes (THE-597 Self-Consistency)', () => {
  const run = (labels: Classification['labels'], partyRoleObserved?: string): Classification => ({ labels, partyRoleObserved });

  it('Mehrheit je Achse, Konfidenz = Stimmen/k', () => {
    const out = aggregateVotes([
      run({ partyRole: 'controller', provisionKind: 'obligation' }),
      run({ partyRole: 'controller', provisionKind: 'obligation' }),
      run({ partyRole: 'processor', provisionKind: 'obligation' }),
      run({ partyRole: 'controller', provisionKind: 'procedural' }),
      run({ partyRole: 'controller', provisionKind: 'obligation' }),
    ]);
    expect(out.labels.partyRole).toBe('controller');
    expect(out.confidence?.partyRole).toBeCloseTo(0.8);
    expect(out.labels.provisionKind).toBe('obligation');
    expect(out.confidence?.provisionKind).toBeCloseTo(0.8);
  });

  it('null ist eine Stimme („nicht anwendbar"); offene Läufe drücken die Konfidenz', () => {
    const out = aggregateVotes([run({ partyRole: null }), run({ partyRole: null }), run({}), run({ partyRole: 'controller' })]);
    expect(out.labels.partyRole).toBeNull();
    expect(out.confidence?.partyRole).toBeCloseTo(0.5); // 2 von 4 Läufen
  });

  it('in allen Läufen offen → Achse bleibt offen, keine Konfidenz', () => {
    const out = aggregateVotes([run({}), run({})]);
    expect(out.labels.partyRole).toBeUndefined();
    expect(out.confidence?.partyRole).toBeUndefined();
  });

  it('Tie ist deterministisch (Label-String aufsteigend)', () => {
    const a = aggregateVotes([run({ partyRole: 'processor' }), run({ partyRole: 'controller' })]);
    const b = aggregateVotes([run({ partyRole: 'controller' }), run({ partyRole: 'processor' })]);
    expect(a.labels.partyRole).toBe('controller');
    expect(b.labels.partyRole).toBe('controller');
    expect(a.confidence?.partyRole).toBeCloseTo(0.5);
  });

  it('Tie zwischen null und einer id → null gewinnt (Enthaltung), Konfidenz 0.5', () => {
    const a = aggregateVotes([run({ partyRole: 'controller' }), run({ partyRole: null })]);
    const b = aggregateVotes([run({ partyRole: null }), run({ partyRole: 'supervisory_authority' })]);
    expect(a.labels.partyRole).toBeNull();
    expect(b.labels.partyRole).toBeNull();
    expect(a.confidence?.partyRole).toBeCloseTo(0.5);
  });

  it('leere Eingabe → nur leere Labels', () => {
    expect(aggregateVotes([])).toEqual({ labels: {} });
  });

  it('partyRoleObserved: häufigste nicht-leere Beobachtung', () => {
    const out = aggregateVotes([run({}, 'Betreiber'), run({}, 'Anbieter'), run({}, 'Betreiber')]);
    expect(out.partyRoleObserved).toBe('Betreiber');
  });
});

describe('withSelfConsistency (THE-597)', () => {
  const golden = loadTypingGolden(FIXTURE);

  it('ruft den inneren Classifier genau k-mal je Fall und aggregiert', async () => {
    let calls = 0;
    const inner: Classify = async () => {
      calls++;
      return { labels: { partyRole: calls % 3 === 0 ? 'processor' : 'controller' } };
    };
    const wrapped = withSelfConsistency(inner, 3);
    const out = await wrapped(golden.cases[0]);
    expect(calls).toBe(3);
    expect(out.labels.partyRole).toBe('controller');
    expect(out.confidence?.partyRole).toBeCloseTo(2 / 3);
  });

  it('k < 2 → der innere Classifier selbst', () => {
    const inner: Classify = async (c) => ({ labels: c.labels });
    expect(withSelfConsistency(inner, 1)).toBe(inner);
  });

  it('Konfidenz landet über evaluateTyping in der Achsen-Kalibrierung', async () => {
    let i = 0;
    const flaky: Classify = async (c) => ({ labels: i++ % 2 === 0 ? c.labels : { ...c.labels, normKind: 'guideline' } });
    const report = await evaluateTyping({ golden, classify: withSelfConsistency(flaky, 4) });
    expect(report.axes.normKind.calibration).not.toBeNull();
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/runTypingEval.test.ts`
Expected: FAIL — `aggregateVotes`/`withSelfConsistency` nicht exportiert.

- [ ] **Step 3: Implementieren** — in `src/evals/runTypingEval.ts` nach `evaluateTyping` einfügen:

```ts
// ─── THE-597: Self-Consistency als retrospektive Konfidenz ──────
//
// Die Typisierung trägt heute keine Confidence (tp-4 fragt nur nach ids).
// Für das retrospektive Gate wird sie erzeugt, ohne den Prompt zu ändern:
// k Läufe je Fall, Mehrheit je Achse, Konfidenz = Stimmenanteil. Das ist
// dasselbe Signal wie `selfConsistency` in escalation.service.ts, nur je
// Achse statt je Element. Rein und ohne LLM testbar.

/** `null` (nicht anwendbar) braucht einen Schlüssel, der mit keiner E6-id kollidiert; „na" ist der Prompt-Marker. */
const NA_VOTE = 'na';
/** Tie-Break: `na` (Enthaltung) vor jeder id, dann String aufsteigend — '' sortiert vor allem. */
const tieRank = (key: string): string => (key === NA_VOTE ? '' : key);
/** Byte-Reihenfolge statt localeCompare: ids tragen `_` und `-`, ICU-Kollation ist maschinenabhängig. */
const byteCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function aggregateVotes(runs: Classification[]): Classification {
  const labels: TypingLabels = {};
  const confidence: Partial<Record<TypingAxis, number>> = {};
  const k = runs.length;
  if (k === 0) return { labels };
  for (const axis of TYPING_AXES) {
    const counts = new Map<string, number>();
    for (const r of runs) {
      const v = r.labels[axis];
      if (v === undefined) continue; // offen = keine Stimme
      const key = v === null ? NA_VOTE : v;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size === 0) continue; // in allen Läufen offen → bleibt offen
    const [winner, votes] = [...counts.entries()].sort((a, b) => b[1] - a[1] || byteCompare(tieRank(a[0]), tieRank(b[0])))[0];
    labels[axis] = winner === NA_VOTE ? null : winner;
    confidence[axis] = votes / k;
  }
  const observed = new Map<string, number>();
  for (const r of runs) if (r.partyRoleObserved) observed.set(r.partyRoleObserved, (observed.get(r.partyRoleObserved) ?? 0) + 1);
  const topObserved = [...observed.entries()].sort((a, b) => b[1] - a[1] || byteCompare(a[0], b[0]))[0]?.[0];
  return { labels, confidence, ...(topObserved ? { partyRoleObserved: topObserved } : {}) };
}

/** k Läufe des inneren Classifiers je Fall, sequenziell (Rate-Limits), aggregiert. k < 2 = unverändert. */
export function withSelfConsistency(inner: Classify, k: number): Classify {
  if (k < 2) return inner;
  return async (c) => {
    const runs: Classification[] = [];
    for (let i = 0; i < k; i++) runs.push(await inner(c));
    return aggregateVotes(runs);
  };
}
```

Hinweis: `TYPING_AXES`, `TypingLabels`, `TypingAxis` sind in der Datei bereits importiert (Zeile 24). `Classification` ist bereits exportiert.

- [ ] **Step 4: Tests grün + Typprüfung** (ts-jest läuft transpile-only, `isolatedModules: true` — nur `tsc` findet Typfehler)

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/runTypingEval.test.ts && npx tsc --noEmit -p .`
Expected: PASS, 15 Tests in dieser Suite (5 bestehende + 10 neue); keine TS-Fehler.

- [ ] **Step 5: Commit**

```bash
cd /Users/mac_macee/javis-the597 && git add packages/server/src/evals/runTypingEval.ts packages/server/src/__tests__/runTypingEval.test.ts && git commit -m "feat(evals): Self-Consistency-Konfidenz je Typing-Achse (THE-597 Slice 1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: `--samples k`, Report-Abschnitt und JSON-Block

**Files:**
- Modify: `packages/server/src/evals/runTypingEval.ts` — neue reine Funktion `renderThe597Section` (vor `main`), Flag-Parsing und Ausgabe in `main`
- Test: `packages/server/src/__tests__/runTypingEval.test.ts` (append)

- [ ] **Step 1: Failing Test anhängen** (Import um `renderThe597Section` ergänzen; `TypingEvalCase` aus `../evals/typingMetrics` importieren, falls noch nicht):

```ts
describe('renderThe597Section (rein)', () => {
  it('schreibt je Inhalts-Achse AUROC und Routing bei 0.6/0.8/1.0; Akt-Metadaten markiert', () => {
    const c = (id: string, gold: string | null, pred: string | null, conf: number): TypingEvalCase => ({
      caseId: id, source: 's', language: 'de', gold: { partyRole: gold }, predicted: { partyRole: pred }, confidence: { partyRole: conf },
    });
    const cases = [c('a', 'controller', 'controller', 1.0), c('b', 'controller', 'processor', 0.4), c('c', 'processor', 'processor', 0.8)];
    const { markdown, json } = renderThe597Section(cases, 5, 'deadbeef');
    expect(markdown).toContain('## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=5)');
    expect(markdown).toContain('| partyRole |');
    expect(json.k).toBe(5);
    expect(json.goldenSha256).toBe('deadbeef');
    expect(json.axes.partyRole.samples).toBe(3);
    expect(json.axes.partyRole.auroc).toBe(1);
    expect(json.axes.partyRole.routing.map((r) => r.threshold)).toEqual([0.6, 0.8, 1.0]);
    expect(json.axes.partyRole.routing[0]).toMatchObject({ caught: 1, wrong: 1, falseAlarms: 0 });
    expect(json.axes.normKind.samples).toBe(0);
    expect(json.axes.normKind.auroc).toBeNull();
    expect(json.axes.normKind.aktMetadatum).toBe(true);
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/runTypingEval.test.ts -t renderThe597Section`
Expected: FAIL — nicht exportiert.

- [ ] **Step 3: Funktion implementieren** — in `runTypingEval.ts` vor `async function main()`. Imports oben ergänzen: `import { config as loadEnv } from 'dotenv';` (bisher liest dieses Skript `.env` nicht, `getClient()` verlangt die Variable in der Umgebung; **nicht** `dotenv/config` als Import-Seiteneffekt, sonst lädt jeder Test, der dieses Modul importiert, den echten Key), dazu `import crypto from 'node:crypto';`, aus `./typingMetrics` zusätzlich `axisCalibrationSamples`, aus `./metrics`: `import { aurocFromSamples, thresholdRoutingStats, type RoutingStat } from './metrics';`. Im Kopfkommentar (`:14-15`) und in der Usage-Zeile in `main` `[--samples <k>]` ergänzen. Als **erste Anweisung** in `main()`: `loadEnv();` (lädt `packages/server/.env`, dem Muster von `runMappingEval.ts` in der Wirkung gleich, ohne Import-Seiteneffekt).

```ts
// ─── THE-597: Report-Abschnitt (rein) ───────────────────────────

export interface The597AxisResult {
  samples: number;
  wrong: number;
  auroc: number | null;
  routing: RoutingStat[];
  aktMetadatum: boolean;
}
export interface The597Json {
  k: number;
  goldenSha256: string;
  thresholds: number[];
  axes: Record<TypingAxis, The597AxisResult>;
}

export function renderThe597Section(
  cases: TypingEvalCase[],
  k: number,
  goldenSha256: string,
  thresholds: number[] = [0.6, 0.8, 1.0]
): { markdown: string; json: The597Json } {
  const axes = {} as The597Json['axes'];
  const lines: string[] = [];
  lines.push(`## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=${k})`);
  lines.push('');
  lines.push('Konfidenz = Stimmenanteil der Mehrheit über k Läufe. Routing: confidence < Schwelle ⇒ Mensch.');
  lines.push('Recall = geroutete falsche / alle falschen · Fehlalarm = geroutete richtige / alle richtigen.');
  lines.push('Instrument-Kontrolle: AUROC > 0,6 auf mindestens einer Inhalts-Achse, sonst „nicht messbar".');
  lines.push(`Golden-Hash: \`${goldenSha256}\``);
  lines.push('');
  lines.push('| Achse | Samples | falsche | AUROC | ' + thresholds.map((t) => `Recall <${t.toFixed(1)}`).join(' | ') + ' | ' + thresholds.map((t) => `Fehlalarm <${t.toFixed(1)}`).join(' | ') + ' |');
  lines.push('|' + '---|'.repeat(4 + thresholds.length * 2));
  for (const axis of TYPING_AXES) {
    const samples = axisCalibrationSamples(cases, axis);
    const routing = thresholdRoutingStats(samples, thresholds);
    const auroc = aurocFromSamples(samples);
    const aktMetadatum = AKT_METADATEN_ACHSEN.has(axis);
    axes[axis] = { samples: samples.length, wrong: samples.filter((s) => !s.correct).length, auroc, routing, aktMetadatum };
    const name = aktMetadatum ? `${axis} ⚠️` : axis;
    lines.push(
      `| ${name} | ${samples.length} | ${axes[axis].wrong} | ${auroc === null ? '—' : auroc.toFixed(3)} | ` +
        routing.map((r) => pct(r.recall)).join(' | ') + ' | ' + routing.map((r) => pct(r.falseAlarmRate)).join(' | ') + ' |'
    );
  }
  lines.push('');
  lines.push('_⚠️ = Akt-Metadatum (THE-691), zählt nicht als Klassifikator-Leistung._');
  lines.push('');
  return { markdown: lines.join('\n'), json: { k, goldenSha256, thresholds, axes } };
}
```

- [ ] **Step 4: `main` erweitern** — drei Änderungen, je an der genannten Stelle:

(a) Flag lesen, direkt nach dem `--purpose`-Block:

```ts
  // THE-597: k Läufe je Fall → Self-Consistency-Konfidenz (Default 1 = unverändert).
  // Ganzzahl erzwingen: k = 2,5 liefe 3× und teilte durch 2,5.
  const si = argv.indexOf('--samples');
  const samples = si !== -1 ? Math.max(1, parseInt(argv[si + 1] ?? '1', 10) || 1) : 1;
```

(b) Classifier wrappen — die Zeile `classify: anthropicClassify(getClient(), model, { purposeBySource, oovDrops }),` ersetzen durch:

```ts
    classify: withSelfConsistency(anthropicClassify(getClient(), model, { purposeBySource, oovDrops }), samples),
```

(c) Abschnitt anhängen und Suffix — nach dem `if (purposeBySource) { … }`-Block, vor `const outDir = …`:

```ts
  let the597: The597Json | undefined;
  if (samples > 1) {
    const goldenSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(goldenPath))).digest('hex');
    const sec = renderThe597Section(collected, samples, goldenSha256);
    md += `\n${sec.markdown}`;
    the597 = sec.json;
  }
```

und die Zeile `const base = path.join(outDir, \`typing-${golden.version}${purposeBySource ? '-purpose' : ''}\`);` ersetzen durch:

```ts
  const base = path.join(outDir, `typing-${golden.version}${purposeBySource ? '-purpose' : ''}${samples > 1 ? `-sc${samples}` : ''}`);
```

und im `writeFileSync`-JSON das Objekt um `the597` **und die Fallzeilen** ergänzen (ohne sie ist der Bezug zu F-04…F-07 in Task 8 nicht reproduzierbar; `collected` wird sonst nie persistiert):

```ts
  const cases = collected.map(({ caseId, source, gold, predicted, confidence }) => ({ caseId, source, gold, predicted, confidence }));
```

und dann `JSON.stringify({ variante, model, samples, report, oovDrops: Object.fromEntries(oovDrops), majority: maj, the597, cases }, null, 2)`.

Hinweis für den Report: `oovDrops` zählt je **innerem** Lauf, bei k = 5 also bis zu fünfmal je Fall. Die THE-683-Zeile deshalb wörtlich so ändern: `md += \`OOV-Drops je Achse (AC-4${samples > 1 ? \`, je Lauf, k=${samples}\` : ''}): ${…unverändert…}\n\n\`;`

- [ ] **Step 5: Tests grün + Typprüfung**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/runTypingEval.test.ts && npx tsc --noEmit -p .`
Expected: PASS; keine TS-Fehler.

- [ ] **Step 6: Commit**

```bash
cd /Users/mac_macee/javis-the597 && git add packages/server/src/evals/runTypingEval.ts packages/server/src/__tests__/runTypingEval.test.ts && git commit -m "feat(evals): typing:eval --samples k schreibt THE-597-Abschnitt (AUROC, Routing je Achse)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: Der Messlauf auf gv3 (einziger LLM-Schritt)

**Files:**
- Create (generiert): `packages/server/src/evals/reports/typing-gv3-sc5.md`, `packages/server/src/evals/reports/typing-gv3-sc5.json`

Kosten: 70 Fälle × 5 Läufe = 350 Haiku-Aufrufe (~0,5 M Input-Tokens, unter 1 €). Dauer 5–10 Minuten, sequenziell. Der Lauf ist stochastisch (Temperature-Default 1,0 — das ist gewollt, sonst gäbe es keine Varianz zwischen den Läufen).

- [ ] **Step 1: Umgebung prüfen** (seit Task 6 lädt das Skript `.env` selbst)

Run: `cd /Users/mac_macee/javis-the597/packages/server && test -n "$ANTHROPIC_API_KEY" && echo KEY_OK || grep -c '^ANTHROPIC_API_KEY=' .env`
Expected: `KEY_OK` oder `1` (`packages/server/.env` ist ein Symlink auf die Root-`.env`; `TA_PROJECT` ist optional, ohne ihn bleibt der Band-Breakdown leer).

- [ ] **Step 2: Lauf**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npm run typing:eval -- --golden src/evals/golden/typing.gv3.json --samples 5 2>&1 | tail -3`
Expected: `[typing-eval] Report (tp-4) → …/reports/typing-gv3-sc5.md / .json`

- [ ] **Step 3: Plausibilität** (keine Wertung, nur „ist der Abschnitt da")

Run: `cd /Users/mac_macee/javis-the597/packages/server && grep -A 15 '## THE-597' src/evals/reports/typing-gv3-sc5.md && python3 -c "import json; d=json.load(open('src/evals/reports/typing-gv3-sc5.json')); print(len(d['cases']), {a: (v['samples'], v['auroc']) for a, v in d['the597']['axes'].items()})"`
Expected: Tabelle mit fünf Achsen (Kopf, Trennzeile, fünf Zeilen, Fußnote); `70` Fallzeilen; `partyRole`, `provisionKind`, `obligationKind` mit `samples` > 40 und `auroc` als Zahl (oder `null`, wenn eine Achse gar keine falschen Fälle hat — dann steht das so im Register).

- [ ] **Step 4: Evidenz nach `docs/evals/` kopieren** (`src/evals/reports/` ist gitignored)

```bash
cd /Users/mac_macee/javis-the597 && cp packages/server/src/evals/reports/typing-gv3-sc5.md docs/evals/the597-typing-gv3-sc5.md && cp packages/server/src/evals/reports/typing-gv3-sc5.json docs/evals/the597-typing-gv3-sc5.json && git status --short docs/evals/
```

Expected: zwei neue Dateien `?? docs/evals/the597-typing-gv3-sc5.md` / `.json`.

- [ ] **Step 5: Commit (Evidenz)**

```bash
cd /Users/mac_macee/javis-the597 && git add docs/evals/the597-typing-gv3-sc5.md docs/evals/the597-typing-gv3-sc5.json && git commit -m "eval(the-597): Messlauf gv3 mit Self-Consistency k=5 — Konfidenz, AUROC, Routing je Achse

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: Instrument-Kontrolle und Register-Nachtrag

**Files:**
- Modify: `docs/evals/the597-fehlerfall-register.md` (Abschnitt D)

Hier wird **nicht** über Go/No-Go entschieden (das ist Slice 3). Hier wird festgehalten, ob das Instrument trägt, und welche Zahlen die Kill-Schwelle später sieht.

- [ ] **Step 1: Abschnitt D füllen** — Vorlage; jede `<…>`-Stelle mit den Werten aus `docs/evals/the597-typing-gv3-sc5.json` ersetzen. Die Zeilen mit `<analog>` folgen dem Satzmuster der F-04-Zeile:

```markdown
## D. Slice-1-Ergebnis (Self-Consistency k=5 auf gv3, Lauf vom <Datum>, Modell <model>)

Golden-Hash: `<goldenSha256>` · Report: `docs/evals/the597-typing-gv3-sc5.md`

### Instrument-Kontrolle (Positivkontrolle: AUROC > 0,6 auf ≥ 1 Inhalts-Achse)

| Achse | Samples | falsche | AUROC | Verdikt |
|---|---|---|---|---|
| obligationKind | <n> | <w> | <auroc> | <trägt / trägt nicht / keine falschen Fälle> |
| partyRole | <n> | <w> | <auroc> | … |
| provisionKind | <n> | <w> | <auroc> | … |

**Instrument-Verdikt:** <MESSBAR: Self-Consistency trennt richtig von falsch auf <Achsen> | NICHT MESSBAR: AUROC ≤ 0,6 auf allen Inhalts-Achsen — Schicht 1 kann mit diesem Signal nicht bewertet werden; das ist ein Befund über das Instrument, kein No-Go für THE-606>

### Routing-Zahlen für die Kill-Schwelle (≥ 50 % Recall bei ≤ 10 % Fehlalarm; entschieden wird in Slice 3)

| Achse | Schwelle | Recall (falsche gefangen) | Fehlalarm (richtige geroutet) |
|---|---|---|---|
| partyRole | < 0,6 / < 0,8 / < 1,0 | <r1> / <r2> / <r3> | <f1> / <f2> / <f3> |
| provisionKind | … | … | … |
| obligationKind | … | … | … |

### Bezug zu den Fehlerfällen

- F-04 (prohibition): <in gv3-sc5: von <k> prohibition-Gold-Fällen wurden <m> falsch klassifiziert, davon <c> mit Konfidenz < 0,8>
- F-05/F-07 (partyRole): <analog>
- F-06 (procedural): <analog>
```

Für den Bezug zu F-04…F-07 die Fallzeilen `cases[]` aus `docs/evals/the597-typing-gv3-sc5.json` filtern (`gold.<axis>` = Klasse, `predicted.<axis>` ≠ `gold.<axis>`, `confidence.<axis>` < 0,8), z. B.: `python3 -c "import json; c=json.load(open('docs/evals/the597-typing-gv3-sc5.json'))['cases']; g=[x for x in c if x['gold'].get('obligationKind')=='prohibition']; w=[x for x in g if 'obligationKind' in x['predicted'] and x['predicted'].get('obligationKind')!='prohibition']; print(len(g), len(w), sum(1 for x in w if (x.get('confidence') or {}).get('obligationKind',1)<0.8))"` (aus dem Worktree-Root). Der `in`-Filter lässt Achsen aus, die in allen Läufen offen blieben — genau wie `axisCalibrationSamples`, sonst weichen Register und JSON ab.

- [ ] **Step 1b: Gegenprobe auf Abschnitt D**

Run: `cd /Users/mac_macee/javis-the597 && ! grep -nE '^\*\*(Go|No-Go)' docs/evals/the597-fehlerfall-register.md && grep -c 'Instrument-Verdikt:' docs/evals/the597-fehlerfall-register.md && python3 -c "import json; print(json.load(open('docs/evals/the597-typing-gv3-sc5.json'))['the597']['axes']['partyRole']['auroc'])"`
Expected: kein Verdikt-Satz (erster Befehl still), `1`, und der ausgegebene AUROC-Wert steht identisch (3 Dezimalen) in der Tabelle „Instrument-Kontrolle".

- [ ] **Step 2: Commit**

```bash
cd /Users/mac_macee/javis-the597 && git add docs/evals/the597-fehlerfall-register.md && git commit -m "docs(the-597): Slice-1-Ergebnis — Instrument-Kontrolle und Routing-Zahlen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: Abschluss — Gesamtlauf, blinder Prüfer, Übergabe

- [ ] **Step 1: Alle betroffenen Suiten + Build**

Run: `cd /Users/mac_macee/javis-the597/packages/server && npx jest src/__tests__/typingMetrics.test.ts src/__tests__/runTypingEval.test.ts src/__tests__/evalCalibration.test.ts src/__tests__/the597Routing.test.ts && npx tsc --noEmit -p . && npm run build -w @thearchitect/server`
Expected: alle PASS — die drei Basissuiten = Basislinie + 13 (typingMetrics +2, runTypingEval +11), dazu `the597Routing` mit 7; keine TS-Fehler; Build grün.

- [ ] **Step 2: Goldens unangetastet**

Run: `cd /Users/mac_macee/javis-the597 && git diff origin/master --stat -- packages/server/src/evals/golden/`
Expected: leere Ausgabe.

- [ ] **Step 3: Blinder Prüfer** — nach `.agents/skills/subagent-driven-development/blind-verifier-prompt.md` einen frischen Subagenten mit der versiegelten Datei dispatchen; Findings (Eingabe, erwartet, tatsächlich) beheben, Loop-Budget 3; danach RVTM-Status je Zeile setzen.

- [ ] **Step 4: Kommentar an THE-597** (durch die Session, nicht den Subagenten): Instrument-Verdikt, AUROC je Achse, Routing-Tabelle, Pfad des Reports, Mapping-Ausgang aus Task 4. Kein Go/No-Go.

- [ ] **Step 5: PR** `feat/the-597-retro-gate` → `master`, Titel `THE-597 Slice 0+1: Fehlerfall-Register + Self-Consistency-Konfidenz auf gv3`. Beim Merge schließt Linear THE-597 automatisch; der Slice-3-Bericht (Go/No-Go je Schicht) wird dann als Kommentar nachgetragen, oder das Ticket wird für Slice 2/3 wieder geöffnet.

## Was dieser Plan bewusst nicht tut

- Kein Isotonic/Platt (das ist THE-606 und setzt den Fang-Nachweis voraus).
- Keine Prompt-Änderung an tp-4 (Konfidenz kommt aus Wiederholung, nicht aus Selbstauskunft — Selbstauskunft wäre genau die „Behauptung statt Eigenschaft", die THE-606 abschafft).
- Kein Live-Lauf des Mapping-Evals (n = 15, nicht frozen; Time-Box).
- Keine Slices 2 und 3 (Zod-Shape-Set und FCA retrospektiv, Messbericht mit Go/No-Go) — eigener Plan nach dem Instrument-Verdikt.
