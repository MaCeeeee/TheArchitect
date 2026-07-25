# THE-519 — INTERPRETS schärfen + Golden v5 (mechanisches Entscheidungs-Instrument) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. **Rev. 2** nach Plan-Review (18 Findings eingearbeitet).

**Goal:** Die Beziehungsart INTERPRETS mechanisch definieren (Schablonen-Parsing + berechnete Richtung), die fehlerhaften v4-Golden-Wahrheiten paar-genau heilen, INTERPRETS auf belastbares n heben (Golden v5, frozen mit Beleg am Fall) und die THE-433-Baseline ehrlich neu messen.

**Architecture:** Reine Prüf-Funktionen in `@thearchitect/shared` (Schablonen-Parser + Prüfbaum P0–P2, Richtung berechnet), gefüttert vom Verweis-Miner (`matched`+`articleHints`) und der Korpus-Typisierung (`provisionKind=definition` als P2-Quelle). Die **Satz-Grenzen-Regel für Pinpoints wandert nach shared**, damit Crawler- UND Server-Mining sie erben. Ein Instrument-Generator rendert die Adjudikations-Artefakte (Slots farbcodiert, Auto-Verdikt, Kalibrier-Karten = **3 echte v4-Fehler + 1 Positiv-Schablone**). Der Architekt entscheidet 2 offene Regeln einmal und auditiert danach nur Belege.

**Tech Stack:** TypeScript · @thearchitect/shared · packages/server (Golden/Eval/Skripte) · packages/compliance-crawler (Miner) · Jest · Anthropic/OpenRouter (Cross-House).

**Architekten-Entscheide (Pre-Flight 2026-07-25, bestätigt):** Instrument-Design wie im THE-519-Kommentar fixiert · Score 77,1.

**Klärung Prompt-Frage (Plan-Entscheid):** Die geschärfte Definition MUSS in den Rater-/Klassifikator-Prompt — sonst wiederholt sich die Rubrik-nicht-im-Prompt-Falle (§7.4-Begründung in `prelabel-relations.ts`). Das ist Definitions-Nachzug wie tp-2→tp-3, kein Post-hoc-Tuning. **Versions-Disziplin:** Task 3 erzeugt einen **rp-3-ENTWURF** (`rp-3-draft`); die **Finalisierung zu `rp-3` geschieht erst in Task 5 NACH den Architekten-Regel-Entscheiden und VOR der Kohärenz-Messung** (sonst misst das Kohärenz-Gate einen Prompt ohne die Regeln A/B — exakt die Falle, die dieser Plan heilt). Jede weitere Änderung = Version-Bump (`rp-3.1`, …).

**Anti-Post-hoc-Leitplanken (hart):**
1. Erfolgskriterium der Schärfung ist der Cross-House-Kappa der Audit-Teilmenge (Kohärenz), NICHT Haikus F1. Modell bleibt Haiku, unverändert.
2. **KEIN Haiku-Lauf gegen v5-Fälle vor dem Freeze-Commit** (weder baseline noch ad-hoc) — sonst kann die Definition unbemerkt aufs Bestehen hin iteriert werden. Das Nachweisdokument listet den rp-3-Freeze-Commit-Hash UND jede baseline-Invocation (wann, gegen welchen Golden-Stand).
3. **Deterministische Fall-Aufnahme:** Pool-Kandidaten in stabiler Sortierung (caseId), **alle** Audit-Überlebenden werden aufgenommen — kein „bis n erreicht"-Picken.

**Erfolgs-/Abbruchregel (VOR der Messung fixiert):**
1. **Kohärenz-Gate:** Cross-House-Kappa (Opus vs. GPT-5, rp-3, blind) über die **Audit-Teilmenge** ≥ **0,80**. Die Audit-Teilmenge ist die von Task 4 gesammelte Fall-Liste (a∪b∪c, siehe Task 4) und wird **VOR dem Rating als caseId-Liste eingefroren** (Datei im Commit). Gate-Zahl = **Gesamt-Kappa dieses Teilmengen-Laufs** (`relations-kappa compare` auf den Teilmengen-Dateien). **Komposition-Pflicht** (gegen degeneriertes Kappa): die Teilmenge MUSS Negative enthalten — mindestens je 3 Fälle der erwarteten Nicht-INTERPRETS-Verdikte (`none-usage`, `pair-artifact`-Ersatzpaare bzw. andere none) — Werteraum also mindestens {INTERPRETS:b-to-a, INTERPRETS:a-to-b, none}; ist eine Klasse im Rating-Ergebnis konstant, wird das ausgewiesen (B4a-Analogie).
2. **Freeze-Gate:** v5 frozen nur mit INTERPRETS **n ≥ 12 sauberen** Fällen (Puffer über der Gate-Mindest-Stützung 10, damit ein einzelner Messausfall die Klasse nicht still unter das Baseline-Gate drückt). **Ergeben alle Audit-Überlebenden < 12:** NICHT freezen und NICHT die „sauber"-Definition lockern — dann ist das eine dokumentierte Grenze (zu wenig saubere Anleihen im Korpus) und der Korpus-/Pool-Ausbau ein Follow-up-Entscheid. **„Sauber" ist definiert als:** (a) Beleg-Satz + P0–P2-Pfad am Fall gespeichert, (b) kein Korpus-Defekt an einer der beiden Provisions (THE-517-Klasse), (c) **Sprachzwillinge zählen einfach** — dieselbe Anleihe in DE- und EN-Variante darf als zwei Fälle gespeichert sein, zählt für n aber nur einmal (Feld `languageTwinOf` am Zwilling).
3. **Re-Baseline-Gate:** Haiku + rp-3 über alle v5-Fälle. **Schwellen + Gate-LOGIK byte-gleich zu THE-433** (gesamt ≥ 0,85 UND none-Precision ≥ 0,90 UND jede Klasse mit gemessenem n ≥ 10 F1 ≥ 0,70 UND 0 metadata). Der **beschreibende Regel-TEXT** in `relations-baseline.ts` (nennt heute „rp-2" und „175 Fälle") wird auf rp-3/v5 aktualisiert — im Nachweisdokument als nicht-substanzielle Textänderung ausgewiesen. **Messausfälle auf INTERPRETS-Fällen werden vor dem Verdikt pflicht-wiederholt** (Re-Run nur der Ausfälle); erst wenn sie gemessen sind, gilt das Verdikt. Erfolg → `relations:batch:prod` darf laufen. Sonst → endgültige dokumentierte Grenze für Haiku in Slice 1; Modellwechsel (Sonnet) = NEUER Architekten-Entscheid außerhalb dieses Plans.

---

## Task 0 (User, Ops, ~5 Min): Pool-Export um `provisionKind` erweitern + neu ziehen

Der Generator (Task 4) braucht je Ziel-Provision den `provisionKind` (P2). Der bestehende Export (`packages/compliance-crawler/scripts/export-relations-pool.cjs`, THE-517 AC-2) liefert ihn noch nicht.

**Files:** Modify: `packages/compliance-crawler/scripts/export-relations-pool.cjs`

- [ ] **Step 1:** Export erweitern: pro Provision zusätzlich `provisionKind` aus dem Subdokument **`typing.provisionKind`** (Status auf **`typing.status`**: suggested ODER confirmed; rejected → Feld weglassen — Feldpfade siehe `IRegulationTyping` in `regulation.model.ts`). Ein Doc ohne Typing-Label → Feld fehlt, wird gezählt und im stderr-Report ausgewiesen (laut, nie still).
- [ ] **Step 2 (User, Server B):** Skript per scp/docker cp nach `/app` in den Crawler-Container, `node /app/export-pool.cjs > /tmp/relations-pool.json`, Datei zurück auf den Mac (Scratchpad). Ablauf identisch zu THE-517 (dokumentiert im THE-517-Kommentar). **Erwartung:** 1532 Provisions, `provisionKind`-Abdeckung ~100 % (Korpus ist voll typisiert).
- [ ] **Step 3: Commit** `feat(the-519): Pool-Export trägt provisionKind (P2-Quelle für das Audit-Instrument)`.

**Fallback, falls `provisionKind` für einzelne Ziele fehlt:** P2 stützt sich dann nur auf den Definiendum-Check (`targetFullText` enthält den Begriff als definierten Ausdruck) und der Fall wird im Artefakt als `P2:fallback` markiert.

## Task 1: Shared — Schablonen-Parser + Prüfbaum als reine Funktionen

**Files:**
- Create: `packages/shared/src/relations/interpretsAudit.ts` (+ Export in `relations/index.ts`)
- Test: `packages/server/src/__tests__/interpretsAudit.test.ts` (shared trägt keine eigenen Tests — Server-Testort, wie bei prompt.ts)

- [ ] **Step 1: Failing Tests — 3 Fehler-Kalibrier-Fälle + 1 Positiv-Schablone** (echte Texte aus `relations.v4.json` ziehen):
  - **Positiv-Schablone** `data-act-de-art-2__dsgvo-art-4` („personenbezogene Daten im Sinne des Artikels 4 Nummer 1…"; in v4 KORREKT gelabelt): alle Slots gefüllt, P0–P2 ✓, Verdikt `interprets`, Richtung = vom Ziel (dsgvo) weg.
  - **Fehler 1** `cra-en-art-3__nis2-art-6` („‘incident' means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555"; v4 speichert fälschlich a-to-b): Verdikt `interprets`, berechnete Richtung = von NIS2 (Ziel/Definierer) weg — der Test beweist, dass der v4-Fehler nicht reproduzierbar ist.
  - **Fehler 2** `dora-de-art-46__psd2-de-art-33` („bei Zahlungsinstituten, einschließlich der nach der Richtlinie…"; v4 fälschlich INTERPRETS): P0 ✗ → Verdikt `none-usage`, Operator-Slot als fehlend benannt.
  - **Fehler 3** `dsgvo-art-4__nis2-de-art-35` (zitierender Satz nennt Ziel-Artikel 35 nicht; v4 fälschlich gepaart+gelabelt): P1 ✗ → Verdikt `pair-artifact` (Paar raus, KEIN Label).
- [ ] **Step 2: Implementierung.**
  - `parseBorrowTemplate(sentence: string, targetLawIdents: string[]): {term?, operator?, targetArticle?, targetLawHit?}` — Operatoren DE+EN: „im Sinne von/des", „as defined in", „as referred to in", „bezeichnet … gemäß", „pursuant to" (letzteres NUR im Begriffs-Kontext: Satz trägt ein Definiendum-Muster `„X" bezeichnet/means/ist`). Term = Ausdruck in Anführungszeichen bzw. Nummern-Item vor dem Operator.
  - `auditInterpretsCandidate(input: {citingSide: 'a'|'b', citingSentence: string, pairTargetArticle: string, targetLawIdents: string[], targetProvisionKind?: string, targetFullText?: string}): InterpretsAudit` mit `InterpretsAudit = {slots, p0: boolean, p1: boolean, p2: boolean|'fallback', verdict: 'interprets'|'none-usage'|'pair-artifact'|'policy-A', direction?: 'a-to-b'|'b-to-a', reasons: string[]}`.
  - **Richtungs-Konverter explizit:** Die Richtung zeigt vom Definierer (= Ziel-Seite) weg. Ist die zitierende Seite `a`, ist das Ziel `b` → `direction = 'b-to-a'`; ist die zitierende Seite `b` → `'a-to-b'`. Als eigene, getestete Funktion `deriveDirection(citingSide): Direction`.
  - `policy-A` = P0 ✓ ∧ P1 ✓ ∧ P2 ✗ (geprägter Begriff über Sach-Artikel) — die Klasse bleibt offen, bis Architekten-Regel A sie einmal entscheidet; danach wird die Entscheidung hier als Konstante eingesetzt.
- [ ] **Step 3: Tests grün, `cd packages/shared && npx tsc -b --force`, Commit** `feat(the-519): Schablonen-Parser + Prüfbaum — INTERPRETS mechanisch (Richtung berechnet)`.

## Task 2: Satz-Grenzen-Regel für Pinpoints — in SHARED, beide Mining-Pfade

Der Artefakt-Fall `dsgvo-4↔nis2-35` entstand über den **Server**-Mining-Pfad (Fenster über Satzgrenzen). Der Fix gehört in die geteilte Quelle, damit Crawler UND Server ihn erben.

**Files:**
- Modify: `packages/shared/src/relations/lawPatterns.ts` (`referencesLaw`: `articleHints` eines Matches enden an der Satzgrenze des Verweis-Satzes; **Achtung: das anaphorische Fenster aus 5d9edcc ist 200-Zeichen-/Nächste-Zitierung-begrenzt, NICHT satzbegrenzt — beim Kappen an der Satzgrenze muss der DORA-Präzedenzfall explizit grün bleiben:** `doraNis2Hardening.test.ts` (Anapher „for the purposes of Article 4 of that Directive" steht im selben Satz) ist der benannte Nicht-Regressionsfall)
- Test: `packages/server/src/__tests__/relationsCandidates.test.ts` (Regressionstest über den Re-Export: der dsgvo-4-Satzverbund darf Art. 35 nicht als Hint für den NIS2-Verweis liefern)
- Test: `packages/compliance-crawler/src/__tests__/relationCandidates.test.ts` (Crawler-Pfad: Kandidat nur, wenn `pairTargetArticle` in den Hints DESSELBEN Matches)

- [ ] **Step 1: Failing Tests beide Pfade** (konstruierter Mehr-Satz-Text: Satz 1 zitiert Gesetz X mit Art. 5, Satz 2 nennt Art. 35 ohne Gesetzes-Bezug → Hint „35" darf dem X-Verweis NICHT zugeschlagen werden; plus der echte dsgvo-4↔nis2-35-Regressionsfall).
- [ ] **Step 2: Implementierung in shared** — Hint-Suche je Match auf den Satz des Matches begrenzt (Satz-Segmentierung wie im Miner üblich; Fenster-Konstanten bleiben, werden aber an der Satzgrenze gekappt). Aussortierte Doc-weite Paarungen zählt der Crawler in `stats.pairPrecisionRejected` (laut).
- [ ] **Step 3: ALLE bestehenden Miner-Tests (Server 49+, Crawler) grün — Verhaltensänderung nur für satzübergreifende Hints. Commit** `fix(the-519): Pinpoint-Hints enden an der Satzgrenze — Paar-Artefakte beider Mining-Pfade abgestellt`.

## Task 3: RUBRIC Teil C (C-v1.2) + rp-3-ENTWURF

**Files:**
- Modify: `packages/server/src/evals/RUBRIC.md` (neuer Abschnitt C5b + Changelog C-v1.2)
- Modify: `packages/shared/src/relations/prompt.ts` (`RELATIONS_PROMPT_VERSION='rp-3-draft'`; RULE 5 ersetzt)
- Test: `packages/server/src/__tests__/prelabelRelations.test.ts` (Assertions auf die neuen Kernsätze)

- [ ] **Step 1: C5b schreiben** — Schablone (4 Slots) als verbindlicher Test; Richtungs-Regel als **Berechnungsvorschrift** („zitierende Seite = Nutzer, zitierte = Definierer, Pfeil vom Definierer weg — die Richtung wird nie frei vergeben"); Minimalpaar-Tabelle (JA/NEIN nebeneinander, Unterschied = markierter Slot); die 4 Kalibrier-Fälle als Worked Examples inkl. der ursprünglichen v4-Fehl-Labels; **Platzhalter-Blöcke für Architekten-Regeln A und B** (werden in Task 5 gefüllt — bis dahin trägt C5b den Vermerk ENTWURF).
- [ ] **Step 2: rp-3-draft** — RULE 5 neu (Schablone + „direction is DERIVED, never judged: it points FROM the norm that DEFINES the term"), Version `rp-3-draft`, Kommentar „Definitions-Nachzug C-v1.2; Finalisierung zu rp-3 erst nach Architekten-Regeln A/B (Task 5) — §7.4: kein Tuning, die Definition selbst hat sich geändert".
- [ ] **Step 3: Tests grün, Commit** `feat(the-519): RUBRIC C5b (ENTWURF) + rp-3-draft — Schablonen-Regel, Richtung berechnet`. **Assertion-Disziplin:** Die Tests asserten KERNSÄTZE der Regeln (z. B. „direction is DERIVED"), NIEMALS das Versions-Literal (`rp-3-draft`) oder exakten RULE-Wortlaut — sonst bricht die Task-5-Finalisierung sie.

## Task 4: Instrument-Generator (Adjudikations-Artefakt + Sidecar)

**Files:**
- Create: `packages/server/src/scripts/build-interprets-audit.ts`
- Modify: `packages/server/package.json` (Script `relations:audit-interprets`)
- Test: `packages/server/src/__tests__/buildInterpretsAudit.test.ts`

- [ ] **Step 1: Failing Tests der Sammel-Logik.** Der Generator sammelt die **Audit-Teilmenge**:
  - (a) alle v4-Fälle mit `relation='INTERPRETS'`,
  - (b) alle v4-`none`-Fälle, deren zitierender Satz einen Leih-Operator enthält (potenzielle False Negatives),
  - (c) neue Miner-Kandidaten mit P0 ✓ aus dem Pool (`--pool <relations-pool.json>` — Format des THE-517-Exports inkl. `provisionKind` aus Task 0; Kandidaten via `enumerateRelationCandidates` aus dem Crawler-Lib-Import bzw. identischer shared-Logik), in **stabiler caseId-Sortierung**.
  - **Ableitung für v4-Fälle (die kein evidence-Feld tragen):** `citingSentence` + `pairTargetArticle` werden durch Re-Run von `referencesLaw` über BEIDE Seiten + Satz-Segmentierung gewonnen (der Satz, dessen Match den Paar-Ziel-Artikel nennt; Seite mit Match = zitierende Seite). Findet sich kein solcher Satz → der Fall ist per Definition `pair-artifact` (genau der dsgvo-4↔nis2-35-Mechanismus).
- [ ] **Step 2: Ausgabe.** (1) HTML-Artefakt: Kalibrier-Karten oben (3 Fehler + 1 Positiv), Regel-Fragen-Block A/B, je Fall die 4 Slots farbcodiert + Auto-Verdikt + P-Pfad; Sprache ausschließlich beobachtend („Der markierte Satz enthält …"), keine Interpretations-Verben. (2) **JSON-Sidecar**: `{frozenAt, caseIds: [...], perCase: {caseId: {verdict, direction?, slots, pPath, languageTwinOf?}}}` — die caseId-Liste IST die eingefrorene Audit-Teilmenge fürs Kohärenz-Gate. Sprachzwillinge werden erkannt (gleiche Familie beider Seiten + gleiche Artikel) und markiert.
- [ ] **Step 3: Tests grün (Sammel-Logik + Ableitung + Zwillings-Erkennung mit Fixtures), Commit** `feat(the-519): Instrument-Generator — Audit-Teilmenge, Slots, Auto-Verdikt, Sidecar`.

## Task 5: Adjudikations-Sitzung + rp-3-Freeze + Golden v5 + Kohärenz-Gate

**Files:**
- Modify: `packages/server/src/evals/relationsGolden.ts` (**Schema-Erweiterung**: optionales `evidence: {sentence, slots?, auditPath?}` je Fall + optionales `languageTwinOf`; **Refine auf SET-Ebene und NUR bei `frozen: true`**: „frozen ⇒ jeder INTERPRETS-Fall trägt evidence". NICHT als Fall-Refine — Rater-/Blind-/Draft-Dateien laufen durch dieselbe Parse-Kette (prelabel-relations.ts schreibt via Schema-Parse, kappa lädt via loadRelationsGolden), und ein Rater DARF einen (b)-Fall ohne evidence als INTERPRETS labeln, ohne den bezahlten Lauf zu crashen)
- Modify: `packages/shared/src/relations/prompt.ts` (Finalisierung `rp-3`)
- Modify: `packages/server/src/__tests__/prelabelRelations.test.ts` (falls die Finalisierung Assertions berührt — per Task-3-Assertion-Disziplin sollte nichts brechen, aber die Datei gehört zum Task-Scope)
- Modify: `packages/server/src/evals/RUBRIC.md` (Regeln A/B eintragen, ENTWURF-Vermerk entfernen)
- Create: `packages/server/src/evals/golden/relations.v5.json`
- Modify (falls nötig): `packages/server/src/scripts/build-relations-golden.ts` (`--from-audit <sidecar.json>`)
- Test: `packages/server/src/__tests__/relationsGolden.test.ts` (Schema-Refine + Twin-Feld)

- [ ] **Step 1: Schema zuerst (TDD):** failing Tests „`frozen:true` + INTERPRETS ohne evidence → Parse-Fehler; `frozen:false` + INTERPRETS ohne evidence → ok (Rater-Datei-Fall!); none ohne evidence → ok; languageTwinOf wird erhalten" → Schema erweitern → grün.
- [ ] **Step 2: Sitzung (Architekt):** Generator-Artefakt vorlegen. Entscheidungen: **Regel A** (policy-A-Fälle: INTERPRETS / none / eigener Sub-Typ) · **Regel B** (Nutzungs-Referenz = none festzurren) · Beleg-Audits (nur Abweichungen vom Auto-Verdikt melden). **Regel C ist durch Task 2 mechanisch erledigt — nur zur Kenntnis.**
- [ ] **Step 3: rp-3 FINALISIEREN** (Regeln A/B einarbeiten, Version `rp-3`, Commit-Hash notieren) — VOR jeder Messung. **Schleifen-Invariante:** Falls das Kohärenz-Gate später reißt und Schablone/Regeln geändert werden: neue Prompt-Version (`rp-3.1`), frisches blindes Rating, Re-Audit der betroffenen Wahrheiten — niemals stilles Nach-Editieren.
- [ ] **Step 4: Wahrheiten setzen** (aus Sidecar + Architekten-Audits, `--from-audit`): v4-Korrekturen (`cra-en-art-3__nis2-art-6` → direction b-to-a; `dora-de-art-46__psd2-de-art-33` → none; `dsgvo-art-4__nis2-de-art-35` → RAUS als pair-artifact; policy-A-Fälle nach Regel A), False-Negative-Funde aus (b) umgelabelt, **alle** Audit-überlebenden (c)-Kandidaten aufgenommen (deterministisch, Leitplanke 3). `dora-de-art-3__psd2-de-art-4` bleibt draußen (Korpus-Defekt, THE-517). Jeder INTERPRETS-Fall trägt `evidence`.
- [ ] **Step 5: Kohärenz-Gate messen.** Blindkopie der Audit-Teilmenge → Rater A **Opus** (`ANTHROPIC_API_KEY=… ANTHROPIC_MODEL=claude-opus-4-8`) + Rater B GPT-5 (OpenRouter) → `relations:kappa compare` auf den Teilmengen-Dateien. **Harte Leakage-Sperre (in build-interprets-audit oder kappa-Aufruf für diesen Zweck): bricht ab, wenn Rater-A-annotator „haiku" enthält oder Rater-B-annotator nicht „openrouter" enthält.** Gate: Gesamt-Kappa ≥ 0,80; konstante Klassen werden ausgewiesen (B4a). Reißt das Gate → zurück zu Task 3/4 mit Schleifen-Invariante.
- [ ] **Step 6: Freeze.** INTERPRETS-Zählung nach „sauber"-Definition (Twins einfach) ≥ 12 → `relations.v5.json` mit `frozen: true` + Provenance (v4-Basis, Korrektur-Liste, Kohärenz-Kappa, rp-3-Hash, Audit-Teilmengen-Datei). **Commit** `feat(the-519): Golden v5 frozen — INTERPRETS saniert, Beleg am Fall, Kohärenz <kappa>`.

## Task 6: Re-Baseline + Nachweis

**Files:**
- Modify: `packages/server/src/scripts/relations-baseline.ts` (Default-Golden → v5; beschreibenden Regel-Text auf rp-3/v5/n aktualisieren — Schwellen + Logik UNANGETASTET; veraltete v4/175-Kommentare an `DEFAULT_BASELINE_GOLDEN_PATH` nachziehen)
- Create: `docs/superpowers/2026-07-XX-the-519-evidence.md`
- Modify: `docs/evals/typing-release-gates.md` (Relations-Abschnitt: v5-Messstand)

- [ ] **Step 1 (User, Mac):** `ANTHROPIC_API_KEY=<key> npm run relations:baseline` (Haiku + rp-3 gegen v5 — ERSTER Haiku-Kontakt mit v5, per Leitplanke 2). Messausfälle auf INTERPRETS-Fällen → Pflicht-Re-Run vor dem Verdikt.
- [ ] **Step 2: Nachweisdokument:** Kohärenz-Kappa der Audit-Teilmenge, vollständige Korrektur-Liste (welche v4-Wahrheit warum geändert, mit Beleg-Satz), Re-Baseline-Zahlen + Verdikt, rp-3-Freeze-Hash + Liste aller baseline-Invocations (Leitplanke 2), die nicht-substanzielle Regel-Text-Änderung ausgewiesen. Ehrliche Einordnung auch bei ABBRUCH (dann ist Haiku die dokumentierte Grenze; Sonnet = neuer Entscheid).
- [ ] **Step 3: Commit + PR.**

## Task 7 (User, Ops — nur bei Re-Baseline-ERFOLG)

- [ ] Server B: `relations:batch:prod` (~110 Kandidaten, <1 $) → Stichprobe DORA↔NIS2 (`PREVAILS_OVER`) unter den Vorschlägen (AC-4 live) → Review-Pfad einmal real (`GET /relations/suggestions`, ein `decide`) → Linear/Daily.

---

## RVTM (kompakt)

| Anforderung | Task | Verifikation |
|---|---|---|
| Richtung wird berechnet, nie gefragt | 1, 3 | Kalibrier-Test: cra-en-art-3__nis2-art-6 kann nicht mehr a-to-b werden; `deriveDirection`-Unit-Test |
| Paar-Artefakte beider Mining-Pfade abgestellt | 2 | Regressionstests Server- UND Crawler-Pfad (dsgvo-4↔nis2-35) |
| Wahrheit trägt Beleg am Fall | 5 | Schema-Refine-Test: INTERPRETS ohne evidence → Parse-Fehler |
| Kohärenz vor Freeze, Teilmenge vorregistriert | 4, 5 | Sidecar-caseId-Liste im Commit VOR dem Rating; Kappa ≥ 0,80; Komposition mit Negativen |
| Leakage unmöglich | 5 | harte Abbruch-Sperre auf annotator (haiku/openrouter-Check) + Log-Sichtprüfung |
| Ehrliche Re-Messung | 6 | Schwellen/Logik byte-gleich; Modell unverändert Haiku; Ausfall-Re-Run vor Verdikt |
| Anti-Post-hoc | 3, 5, 6 | rp-3-Freeze-Hash vor Baseline; kein Haiku-Kontakt mit v5 vor Freeze (Invocation-Liste im Nachweis); deterministische Aufnahme |
