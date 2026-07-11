# Pre-Flight RVTM — UC-CHOICE-002: Architecture Decision Configurator (THE-192)

**Datum:** 2026-07-11
**Status:** Pre-Flight abgeschlossen — REQs bewusst NICHT angelegt (siehe Verdikt)
**Linear:** [THE-192](https://linear.app/thearchitect/issue/THE-192/uc-choice-002-architecture-decision-configurator) (Backlog, angelegt 2026-04-27, seither unverändert)

## 1. Kontext

Pattern B der Bounded-Autonomy-Familie: TurboTax-artiger Wizard für Solution-Architects. Inkompatible Kombinationen werden automatisch ausgeschlossen, Live-Validierung gegen Policy, abhängige Optionen aktivieren/deaktivieren in Echtzeit.

## 2. Linear-Umfeld (Step 1)

| Issue | UC | Status | Relevanz |
|---|---|---|---|
| THE-189 | CHOICE-001 Pattern Library | **Done** (2026-05-17) | Optionskatalog mit Compliance/Cost/Risk-Scores — Datengrundlage vorhanden |
| THE-191 | CHOICE-007 Voting & Badges | **Done** (2026-05-18) | Adoption-Telemetrie nutzbar für Default-Ranking |
| **THE-190** | **CHOICE-003 Real-time Compliance Linting** | **Backlog** (voll spezifiziert, 6 REQs THE-201..206) | **Harter Vorläufer.** THE-192-Text: „Nach Sprint 2 (UC-CHOICE-003) priorisieren, wenn Real-time-Validation-Pipeline steht." Pipeline steht nicht. |
| THE-193/194/195 | CHOICE-004/005/006 | Backlog | Geschwister, keine Blocker |

⚠️ **Befund:** Die Abhängigkeit 002→003 steht nur im Beschreibungstext — `blockedBy` in Linear ist **leer**. Damit greift der Rescore-Trigger (beim Schließen von Blockern Dependents neu bewerten) für THE-192 nicht.

## 3. Codebase-Scan (Step 2)

| Bereich | Existiert | Schlüssel-Dateien | Reuse |
|---|---|---|---|
| Pattern Library | ja | `server/src/models/DecisionPattern.ts`, `shared/src/types/decision-pattern.types.ts`, `client/src/components/patterns/` | Hoch — Optionskatalog inkl. `{togaf, dora, nis2}`-Scores, Cost, Risk |
| Policy-as-Data | ja | `server/src/models/Policy.ts`, `server/src/services/policy-evaluation.service.ts`, `compliance.service.ts` | Sehr hoch — Regel-Schema + Evaluator + Severity + WebSocket-Emit |
| Live-Validation-Loop | teilweise | `policy-evaluation.service.ts` → `violation:update` → `client/src/services/socket.ts` → `ProjectView.tsx` | Echtzeit-Spine existiert; **keine** vereinheitlichte Linting-Pipeline (= Scope von 003) |
| Scenario/MCDA | ja | `server/src/services/scenario.service.ts` (`rankScenariosMCDA`, `rankScenariosTOPSIS`), Snapshot-Modelle | Hoch — Ranking der verbleibenden Optionen, Persistenz als Scenario-Snapshot |
| Wizard-Scaffolding | ja | `client/src/design-system/patterns/Stepper.tsx`, `components/blueprint/BlueprintWizard.tsx` + `BlueprintQuestionnaire.tsx`, `stores/blueprintStore.ts` | Sehr hoch — Configurator ≈ BlueprintWizard mit constraint-bewusstem Options-Step |
| **Constraint-/Exclusion-Engine** | **nein** | `configurator` = 0 Treffer; keine `excludes`/`requires`/`conflictsWith`-Felder auf irgendeinem Modell | **Kern muss neu.** Nächster Verwandter: `shared/src/constants/archimate-rules.ts` (`getValidRelationships` = „compute allowed set") als Strukturvorlage |

Zusätzlich seit Ticket-Erstellung (April) gelandet: Norm-Registry als Data (THE-413/414), Ontologie-enforced Writes (THE-417), Conformance-Gates. Der Ticket-Text referenziert die alte „Compliance Matrix (DORA/NIS2/TOGAF)"-Welt — eine REQ-Spezifikation muss auf die regulation-agnostische Architektur aufsetzen.

## 4. WSJF-Scoring (8-Kriterien, UC-Ebene)

| Kriterium | Score (0–5) | Begründung |
|---|---|---|
| Business Value | 4,0 | Echte Differenzierung (kein EAM-Tool hat das), zahlt auf „App zu komplex"-Feedback ein (geführte Entscheidung = progressive disclosure) |
| Business Risk | 2,0 | Kein Kundenpull dokumentiert (BSH-Feedback erwähnt keinen Configurator), keine Frist |
| Implementation Challenges | 2,0 | Constraint-Solver ist neues Subsystem; Constraint-Datenpflege ungelöst |
| Chance of Success | 2,5 | UI-Teil sicher (Scaffolding da); Nutzwert hängt an Constraint-Daten, die niemand bisher erfasst |
| Compliance | 3,0 | Indirekt — Live-Policy-Check ist eigentlich 003-Scope |
| Relationship to Requirements | 4,0 | Verzahnt mit 001/007 (Done), GOV-001 (Done), Scenario (Done); Fundament für 005 |
| Urgency | 1,0 | Ticket selbst deprioritisiert sich hinter 003 |
| Status | derived | Backlog, faktisch blocked by THE-190 |

**Priority Score ≈ 52,9 / 100** — unteres Mittelfeld (Vergleich: UC-WFCOMP-001 = 82,9 Backlog-#1, CTXGOV Read-Side-Gate = 88,6, ONTO = 80,0, UC-RED-002 = 51,4).

## 5. Komplexitätsbewertung nach Ousterhout (Pflicht-Gate)

| Dimension | Verdikt | Begründung |
|---|---|---|
| Ausweiten von Änderungen | mittel | Constraint-Vokabular streut über shared types, Seeds, Solver, UI — beherrschbar, wenn als Data modelliert (wie Policy/Ontologie) |
| Kognitive Last | hoch | Kombinatorische Kompatibilität über Wizard-Schritte hinweg ist ein neues Denkmodell (bisher: lineare Regel-Evaluation je Element) |
| **Unbekannte Unbekannte** | **hoch** | (a) Constraint-Datenquelle ungeklärt — wer autorisiert Inkompatibilitäten? (b) Solver-Semantik unspezifiziert (c) Verhältnis zur nicht existenten 003-Pipeline offen |
| **Abhängigkeiten** | **hoch** | THE-190 als harter Vorläufer; Pattern-Schema-Erweiterung; Policy-Engine; Scenario-Snapshot. Relation in Linear nicht erfasst |
| Unklarheiten | mittel | Ticket-Text (April) referenziert vor-Registry-Architektur |

**Haupt-Watch-Point:** Constraint-DATEN. Ohne gepflegte Inkompatibilitäts-Regeln ist der Solver ein leerer Wizard. Zweiter Watch-Point: kein zweiter Validierungspfad — 002 muss die 003-Pipeline konsumieren, nicht eigene Validierung bauen.

**Regel-Anwendung:** UU = hoch UND Abhängigkeiten = hoch → UC wird **vor Issue-Erstellung umgeschnitten**, nicht einfach gebaut.

## 6. Verdikt & Optionen

THE-192 ist zum jetzigen Zeitpunkt **nicht spezifikationsreif**. Empfehlung:

- **Option A (empfohlen):** `blockedBy THE-190` in Linear eintragen, THE-192 bleibt Backlog. Nächster Schritt in der CHOICE-Familie ist THE-190 (voll spezifiziert, 6 REQs fertig, High-Priority) — 002 wird danach als UI-Layer auf der Linting-Pipeline neu geschnitten.
- **Option B:** Slice 1 „Configurator ohne Solver" (Wizard + statische Kategorie-Filter + MCDA-Ranking, alles vorhanden) — liefert aber den Kern-USP „Auto-Exclusion" nicht und riskiert Wegwerf-Arbeit am Options-Step.
- **Option C:** Nur dokumentieren (dieser Report als Linear-Kommentar + Relation), keine REQs.

## 7. Traceability

| Artefakt | Referenz |
|---|---|
| Parent-Issue | THE-192 |
| Blocker (vorgeschlagen) | THE-190 (UC-CHOICE-003) |
| REQs | — bewusst nicht angelegt (Komplexitäts-Gate) |
| Codebase-Scan | dieser Report, Abschnitt 3 |
| Scoring | Abschnitt 4 (Sheet-Sync ausstehend) |
