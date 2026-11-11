# Landkarte, Schnitt 0: Erkundung

Stand: 11. November 2026. Geprüft wurden der Arbeitsstand von `master` (Commit `83f6534` plus nicht committete Dateien), alle lokalen Branches und Worktrees sowie Linear. Produktcode wurde nicht geändert.

Bezug: [BRIEF.md](BRIEF.md), Fassung 2, Abschnitt 9.

## Kurzfassung

Import und Analyse haben eine tragfähige Grundlage. Was das Gedankenexperiment eigentlich ausmacht, fehlt fast ganz: Solver, Jev-Anbindung, Kalibrierung, Schwellen-Routing, Risikobudget (LOPA, Beta-Faktor, THR, Conformal), FCA, Markov-Kette und Event-Log-Import.

Am schwersten wiegt aber das Fehlen von Daten: Es gibt keine Traces echter Agentenläufe und kein Gold zu Agentenfehlern. Diese Welt liegt beim Kunden, nicht in TheArchitect. Ohne einen Piloten mit echten Agentenläufen zeigt Schnitt 2 überall nur „nicht zertifiziert (0 von 29)“.

| Baustein | Stand | Schnitt |
|---|---|---|
| Import (CSV, Excel, ArchiMate-XML, LeanIX, JSON) | ✅ vorhanden | 1 |
| Beziehungsprüfung beim Import | ❌ fehlt, unbekannte Typen werden still zu `association` | 1 |
| Beziehungsprüfung im Client | 🟡 nachträglich je Element | 1 |
| Advisor-Detektoren | ✅ 14 Stück, fest verdrahtet, mit Test | 3 |
| Zyklen | 🟡 Cypher-Pfadsuche, höchstens 3 Treffer | 3 |
| Zusammenhangskomponenten | 🟡 BFS nur in der Kostenrechnung; kein GDS, keine starken Komponenten | 3 |
| Monte Carlo, Bayes-Kaskade | ✅ vorhanden, aber für Elemente und Kosten | – |
| Gold-Sets, κ, ECE | 🟡 vorhanden, aber für Rechtsklassifikation | 2 |
| Kalibrierung (THE-606) | ❌ Todo | 2 |
| Schwellen-Routing (THE-609) | ❌ Backlog | 2 |
| LOPA, Beta-Faktor, THR, Conformal | ❌ nichts | 2 |
| Basis-Schlüssel (Modellversion, Gold-Set, Kontext) | ❌ nichts | 2 |
| Jev | ❌ nur Probe-Skripte, nicht in git | – |
| SAT/SMT-Solver | ❌ nichts im Repo; THE-744 hat entschieden: kein Produktfeature | – |
| FCA | ❌ nichts | – |
| Markov-Kette, Event-Log-Import | ❌ nichts | – |

## Antworten auf Abschnitt 9

### 1. Wie liegt das ArchiMate-Modell in Neo4j?

- **Label:** `ArchitectureElement` mit den Feldern `id`, `projectId`, `name`, `type`, `layer`, `description`, `status`, `riskLevel`, `maturityLevel`, `provenance`, `source`, `createdAt`, `updatedAt`. Bei Importen kommen `sourceRef`, `connectorConfigId` und `importedAt` dazu ([upload.service.ts:595](../../packages/server/src/services/upload.service.ts)).
- **Beziehung:** einheitlich `CONNECTS_TO` mit den Eigenschaften `id`, `type`, `label`, `provenance` ([demo.routes.ts:120](../../packages/server/src/routes/demo.routes.ts)). Der ArchiMate-Beziehungstyp ist also eine Eigenschaft, kein Neo4j-Beziehungstyp. Daneben gibt es selten `VIOLATES` und `INFLUENCES`.
- **Enums:** 8 Layer, darunter `implementation_migration` ([architecture.types.ts:1](../../packages/shared/src/types/architecture.types.ts)), und 11 Beziehungstypen ([archimate-rules.ts:16](../../packages/shared/src/constants/archimate-rules.ts)). Alle 22 Elementtypen und alle 6 Beziehungstypen der Landkarte sind enthalten.

### 2. Welche Importwege gibt es, und welcher eignet sich?

- **Routen:** `POST /:projectId/import/preview`, `/execute` und `/profiles` ([import.routes.ts:16](../../packages/server/src/routes/import.routes.ts)), dazu der CSV-Dialog im Client ([CSVImportDialog.tsx](../../packages/client/src/components/ui/CSVImportDialog.tsx)).
- **Formate:** `detectFormat` erkennt CSV, Excel, ArchiMate-XML, LeanIX und JSON ([upload.service.ts:74](../../packages/server/src/services/upload.service.ts)).
- **Am besten geeignet ist der JSON-Weg** ([upload.service.ts:473](../../packages/server/src/services/upload.service.ts)). Er erwartet `{elements, connections}`. `landkarte.model.json` hat dagegen `nodes` und `edges` mit `from`, `to`, `relation` und Typnamen wie „Course of action“. Es braucht also eine Umwandlung.
- **Drei Fallen beim JSON-Weg:**
  1. Unbekannte Elementtypen erzeugen nur eine Warnung und werden trotzdem angelegt (Z. 502).
  2. Der Layer wird ungeprüft übernommen (Z. 508). „Implementation & Migration“ landete wörtlich in der Datenbank statt als `implementation_migration`.
  3. Beziehungstypen werden gar nicht geprüft, fehlende werden zu `association` (Z. 521). Der CSV-Weg macht dasselbe (Z. 191), der XML-Weg bildet unbekannte Typen auf `association` ab (Z. 447).
- **Folge für Schnitt 1:** Die Abnahme „Ungültige Beziehungen werden gemeldet, nicht stillschweigend korrigiert“ erfüllt der heutige Import nicht. `isValidRelationship` ([archimate-rules.ts:309](../../packages/shared/src/constants/archimate-rules.ts)) nutzen nur der Client und die Vorschläge. Der Hook [useElementHealth.ts:163](../../packages/client/src/hooks/useElementHealth.ts) markiert ungültige Beziehungen **nach** dem Import je Element; ob das als „gemeldet“ reicht, entscheidet Schnitt 1.
- **Zusatzfund:** Laut Kommentar in [connectionSuggestion.service.ts:179](../../packages/server/src/services/connectionSuggestion.service.ts) hat `getValidRelationships` eine Lücke beim Strategy-Aspekt. Die Landkarte hat drei Strategy-Elemente (`option`, `cap`, `vs`), und die beiden verdächtigen Beziehungen hängen an `option`.

### 3. Wo sitzen Kalibrierung (THE-606) und Schwellen-Routing (THE-609)?

- **Linear:** THE-604 (Cluster) ist Todo, THE-606 ist Todo, THE-609 ist Backlog.
- **Code:** Es gibt nur eine Offline-Messung des Expected Calibration Error ([metrics.ts:329](../../packages/server/src/evals/metrics.ts), [typingMetrics.ts:148](../../packages/server/src/evals/typingMetrics.ts), [runDiscoveryEval.ts:389](../../packages/server/src/evals/runDiscoveryEval.ts)). Isotonic oder Platt gibt es nicht, kalibrierte Werte zur Laufzeit auch nicht.
- Die Prompt-Anweisungen „calibrate strictly“ ([lawJudge.prompt.ts:43](../../packages/server/src/prompts/lawJudge.prompt.ts), [complianceMapping.prompt.ts:55](../../packages/server/src/prompts/complianceMapping.prompt.ts)) sind Selbstauskunft des Modells, keine Kalibrierung (ADR-0012).
- Die Schwellen in [register-scoring.constants.ts:12](../../packages/shared/src/constants/register-scoring.constants.ts) sind ausdrücklich unkalibrierte Startwerte.
- **Passung:** Die Akzeptanzkriterien von THE-609 (Schwellen als Daten, Rückfluss von Korrekturen ins Gold, kein Pfad unter der Schwelle ohne Mensch) decken sich mit Schnitt 2. Die Conformal-Fassung aus Fassung 2 hängt nicht mehr an THE-606.

### 4. Wie werden Advisor-Detektoren registriert und getestet?

- **Registrierung:** Es gibt keine Registry. 14 Detektoren stehen als feste Liste in einem `Promise.all` ([advisor.service.ts:85](../../packages/server/src/services/advisor.service.ts)), sortiert nach Schwere (Z. 118). Ein neuer Detektor ist eine Funktion plus ein Listeneintrag.
- **Test:** [advisor.test.ts](../../packages/server/src/__tests__/advisor.test.ts) läuft mit Jest.
- **Zyklen:** `detectCycles` (Z. 272) sucht per Cypher Pfade der Länge 2 bis 6, liefert höchstens 3 Zyklen und verschluckt Fehler (`catch → []`). β₁, starke Komponenten und eine Liste gewollter Schleifen gibt es nicht.
- **Inseln:** `detectOrphans` (Z. 249) findet isolierte Elemente, also einen Teil von β₀.

### 5. Gibt es GDS-Projektionen für Zusammenhangskomponenten?

Nein. Graph Data Science wird nirgends genutzt. Schwache Komponenten werden nur einmal per BFS gerechnet, für Metcalfes Gesetz in der Kostenrechnung ([cost-engine.service.ts:431](../../packages/server/src/services/cost-engine.service.ts)). Starke Komponenten gibt es nicht. Für Schnitt 3 reicht ein Algorithmus in TypeScript (Tarjan) über die geladenen Kanten; GDS ist dafür nicht nötig.

### 6. Wo liegen die Risiko-Engines, und welches Datenmodell nutzen sie?

[stochastic.service.ts](../../packages/server/src/services/stochastic.service.ts) (Linear THE-17, Done):

- Prüfung des Wahrscheinlichkeitsraums (Z. 26), Beta-PERT-Verteilung (Z. 60), Kolmogorov-Smirnov-Test (Z. 146)
- Kaskadenrisiko mit Bayes und logistischem Modell (Z. 207), Plateau-Stabilität (Z. 337), PERT-Monte-Carlo (Z. 448)
- dazu im Client [monteCarlo.worker.ts](../../packages/client/src/workers/monteCarlo.worker.ts)

Das Datenmodell sind Architekturelemente und Kosten (`cost.types.ts`), keine Agentenaktionen. Wiederverwendbar ist am ehesten `betaPertDistribution` als Muster. Ein Risikobudget je Aktion passt in keines der vorhandenen Modelle.

### 7. Wie ist die FCA-Schicht gebaut?

Es gibt keine. Die Frage im Brief setzte sie voraus. Folge für 7.1.3: Der Kostenvektor muss das Schreibrecht direkt aus den `access`-Kanten auf die Stückliste ableiten, oder FCA ist neuer Code.

### 8. Gibt es an Knoten einen Kontext-, Plateau- oder Szenario-Schlüssel?

Nein. `ArchitectureElement` hat keinen solchen Schlüssel (Felder siehe Frage 1). Plateaus werden im Client berechnet ([plateauComputation.ts](../../packages/client/src/utils/plateauComputation.ts)), nicht gespeichert. `scenarioId` gehört zu Szenario-Objekten ([scenario.types.ts:78](../../packages/shared/src/types/scenario.types.ts)), nicht zu Knoten. Ist und Ziel trägt nur das Feld `status` (`current`, `target`, `transitional`, `retired`).

### 9. In welchem Format kommen Event-Logs aus dem Process-Mining-Import?

Es gibt keinen Process-Mining-Import. Der Begriff taucht nur als Typ in `cost.types.ts` auf. Damit hat die Markov-Kette aus 7.2 keine Datenquelle. Übergänge aus Simulationen sind nach ADR-0012 kein Ersatz.

### 10. Welche Befehle gelten für Lint, Typprüfung und Tests?

| Paket | Build / Typprüfung | Lint | Test |
|---|---|---|---|
| Wurzel (turbo) | `npm run build` | `npm run lint` | `npm run test` |
| `shared` | `tsc -b` | `eslint src/` | – |
| `server` | `tsc` | `eslint src/` | `jest` |
| `client` | `tsc -b && vite build` | `eslint src/` | `vitest run` |

Ein eigenes `typecheck`-Skript gibt es nicht; die Typprüfung ist der Build. `shared` muss vor `server` und `client` gebaut werden (CLAUDE.md). Veraltete `tsbuildinfo`-Dateien können Typfehler verdecken.

### 11. Welche Linear-Issues decken die Schnitte ab, und welche fehlen?

| Issue | Stand | Bezug |
|---|---|---|
| THE-604 Kalibriertes Konfidenz-Atom | Todo | Cluster für Schnitt 2 |
| THE-606 Kalibrierungsschicht | Todo | laut Fassung 2 keine Voraussetzung mehr |
| THE-609 Schwellen-Routing + Gold-Rückfluss | Backlog | Schnitt 2 |
| THE-744 SAT-Konflikterkennung | Done, Option C | Solver kein Produktfeature; Z3-Spike nur im Scratchpad |
| THE-718 Wert-Session-Protokoll | Done | Instrument für „Nachfrage vor Aufwand“ |
| THE-15, THE-47, THE-48 Advisor | Done | Grundlage für Schnitt 3 |
| THE-17 Stochastic Engine | Done | Frage 6 |

**Es fehlen** Tickets für Schnitt 1 (Landkarte-Import, Beziehungsprüfung beim Import), Schnitt 2 (Risikobudget, zertifizierte Schwelle) und Schnitt 3 (Topologie-Detektoren). Eine Suche nach „Risikobudget“ findet nichts. Nach der Pre-Flight-Regel entstehen diese Tickets erst nach dem Pre-Flight, deshalb sind hier keine angelegt.

### 12. Gibt es Gold-Fälle mit echten Agentenfehlern und Gate-Score?

Nein. Gold gibt es reichlich, aber für die Rechtsklassifikation ([goldenSet.ts](../../packages/server/src/evals/goldenSet.ts), laut ADR-0012 3.762 Fälle der Klasse A). Agenten, deren Fehler ein Gate bewerten könnte, laufen im Produkt nicht. Entsprechend gibt es auch keine Mensch-Mensch-Übereinstimmung für ein solches Gold.

### 13. Werden Modellversion, Gold-Set und Kontext an Urteilen gespeichert?

Nein. `modelVersion` kommt nur im ArchiMate-Exchange-Parser vor, mit anderer Bedeutung. Elemente tragen `provenance`, `source`, `sourceRef` und `importedAt`, also eine Teil-Herkunft, aber keinen Basis-Schlüssel nach 7.13.

## Weitere Funde

- **Jev:** Die Probe-Skripte unter `packages/server/scripts/the654-jev-probe/` sind nicht in git. Eine Anbindung gibt es nicht.
- **Solver:** Nirgends im Repo, in keinem Branch und keinem Worktree. Der Python-Sidecar wäre der Ort dafür, steht aber unter Prod-Freeze (#196).
- **Zyklen-Detektor:** Er verschluckt Fehler still ([advisor.service.ts:272](../../packages/server/src/services/advisor.service.ts)). Ein Neo4j-Fehler sieht dann aus wie „keine Zyklen“.

## Was daraus für die Schnitte folgt

- **Schnitt 1** ist machbar, braucht aber zwei Entscheidungen. Erstens: Wird die Landkarte über ein Umwandlungsskript in `{elements, connections}` gebracht, oder wird der JSON-Parser erweitert? Zweitens: Bekommt der Import eine Beziehungsprüfung, die meldet statt still zu korrigieren? Die zweite Frage betrifft jeden Import, nicht nur die Landkarte, und ist damit ein eigenes Ticket.
- **Schnitt 2:** Die reinen Funktionen sind ohne Abhängigkeit baubar und mit den Fixtures testbar. Ihnen fehlen aber Eingaben, die es nur bei einem Kunden mit Agentenläufen gibt. Gebaut zeigt Schnitt 2 heute überall „nicht zertifiziert“.
- **Schnitt 3:** Mit wenig Aufwand machbar. β₀ und β₁ per BFS, starke Komponenten per Tarjan in TypeScript, als 15. Detektor neben `detectCycles`, getestet mit den Fixtures aus 7.6.
- **Das Experiment als Ganzes** setzt Agentenläufe beim Kunden voraus. Das ist eine Frage für die Wert-Sessions (THE-718), nicht für den Code.

## Nächster Schritt

Für Schnitt 1 ist der Pre-Flight fällig, bevor ein Plan entsteht: Bestand ist hier erhoben; offen sind Prämisse, Wert und Komplexität. Kein Bau ohne Freigabe.
