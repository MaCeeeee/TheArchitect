# Landkarte des berechenbaren Unternehmens: Brief für Claude Code

Stand: 11. November 2026, Fassung 2. Ergebnis eines Gedankenexperiments, kein Kundenauftrag. Was sich gegenüber Fassung 1 (10.11.) geändert hat, steht in Abschnitt 12.

## 1. Worum es geht

Eine Unternehmensarchitektur mit KI-Agenten, in der an jedem ArchiMate-Element festgelegt ist, welche Mathematik oder KI dort eine Entscheidung trägt, welcher Baustein fehlt und wo eine prinzipielle Grenze greift. Durchgängiges Beispiel ist eine Stücklistenänderung.

Für TheArchitect ist das Ziel kein Gesamtbau. Vorgesehen sind drei dünne Schnitte, die den Kern „kalibriertes Vertrauen“ (THE-604-Cluster) stärken. Alles Weitere bleibt liegen, bis Nachfrage belegt ist.

## 2. Dateien in diesem Paket

| Datei | Inhalt |
|---|---|
| `BRIEF.md` | dieses Dokument |
| `landkarte.model.json` | Referenzmodell: 24 Elemente, 28 Beziehungen, 33 Methoden mit Begründung je Element, dazu alle Testwerte unter `fixtures` |
| `landkarte.workflow.json` | Archify-Spezifikation des Diagramms |

Neue Fixtures in Fassung 2: `riskBudget.lopa`, `betaFactor`, `costVector`, `thr`, `conformal`, `basis`. Alle Werte darin sind mit Code nachgerechnet, nicht von Hand gesetzt.

## 3. Aufsetzen in Claude Code

1. Im Repo den Ordner `docs/landkarte/` anlegen und die drei Dateien hineinlegen.
2. In die `CLAUDE.md` des Repos nur einen Verweis aufnehmen. Den Brief nicht per `@`-Import einbinden, weil Importe bei jedem Start vollständig in den Kontext geladen werden:

   ```markdown
   ## Landkarte
   Bei Aufgaben zu Risikobudget, Schwellen-Routing, Topologie-Detektoren oder dem
   Referenzmodell zuerst `docs/landkarte/BRIEF.md` lesen.
   ```

3. Die erste Sitzung im Planmodus mit diesem Prompt starten:

   ```text
   Lies docs/landkarte/BRIEF.md und docs/landkarte/landkarte.model.json vollständig.
   Führe nur Schnitt 0 aus: Erkunde das Repo und beantworte die Fragen aus
   Abschnitt 9, jeweils mit Dateipfaden als Beleg. Schreibe das Ergebnis nach
   docs/landkarte/ERKUNDUNG.md. Schreibe keinen Produktcode.
   Schlage danach einen Plan für Schnitt 1 vor und warte auf meine Freigabe.
   ```

## 4. Leitplanken

Diese Regeln gelten für jeden Schnitt und haben Vorrang vor Bequemlichkeit.

- **Suggest, Review, Apply:** Nichts schreibt ohne menschliche Freigabe ins Modell.
- **Mathematik als Code:** FCA, Markov-Kette, Homologie, Risikorechnung und Zertifikate werden berechnet, nie von einem LLM erzählt.
- **Nur zertifizierte Schranken:** Rohwerte eines LLM sind keine Wahrscheinlichkeiten. Eine Schwelle braucht keinen vollständig kalibrierten Score, aber eine bewiesene Fehlerschranke an genau dieser Schwelle (7.12). Fehlt sie, zeigt die Oberfläche „nicht zertifiziert (n von nötigen m)“ statt einer Zahl.
- **Jede Garantie trägt ihre Basis:** Ein Zertifikat gilt nur über dem Gold-Set, der Modellversion und dem Kontext, auf denen es gemessen wurde. Ein Basiswechsel setzt es aus (7.13).
- **Gemessen oder angenommen:** Jede Eingabe einer Rechnung ist entweder gemessen (mit n und Quelle) oder als Annahme markiert. Die Oberfläche zeigt den Unterschied.
- **Kaskade:** erst feste Regel (Lookup), dann zertifiziertes Urteil, dann Mensch. Was eine Tabelle entscheiden kann, entscheidet kein Modell.
- **Herkunft und Konfidenz:** Jeder berechnete Wert trägt seine Eingaben, Annahmen und Quelle.
- **Kein Selbstfreigeben:** Keine Ebene genehmigt Änderungen an ihrem eigenen Gate.
- **Keine Fantasie-Defaults:** Alle Zahlen in diesem Brief sind illustrativ. Sie sind Testwerte, keine Produktvorgaben.
- **Nachfrage vor Aufwand:** Was in Abschnitt 8 unter „Nicht bauen“ steht, bleibt liegen (THE-718).

## 5. Zielbild in fünf Schichten

| Schicht | Aufgabe | Mathematik und KI |
|---|---|---|
| Motivation und Risikobudget | Ziele, Prinzipien, Budget je Aktion | Einheit Mikro-Vorfall; LOPA, Beta-Faktor, THR-Aufteilung, Bayes-Schätzung |
| Ontologie auf ArchiMate 3.2 | Typsystem, Begriffe, Kontexte | NLP-Extraktion, FCA, Kontexte nach Grothendieck |
| Agenten und Workflows | Soll (wer darf was) und Ist (was passiert wie oft) | Graph-Algebra mit Fehlerelement u, absorbierende Markov-Kette mit Kostenvektor |
| Harness | Kaskade aus Regel, Urteil, Mensch; Tests | zertifiziertes Urteil (Conformal, optional Jev), Eulertour-Tests, SMT-Solver, Rekursion mit Basisfällen |
| Analyse und Sichten | Befunde und ehrliche Vergröberung | Homologie, Schleifenprüfung (Kohomologie), Kongruenzen |

## 6. Referenzmodell

Der Status zeigt je Element den härtesten Befund. Die Begründung („warum hier“) je Methode und Element steht in `landkarte.model.json` unter `nodes[].methods[].why`.

| ID | Name | ArchiMate-Typ | Schicht | Status |
|---|---|---|---|---|
| `stake` | Stakeholder | Stakeholder | Motivation | Grenze greift |
| `ziel` | Durchlaufzeit | Goal | Motivation | Grenze greift |
| `prinzip` | Knappe Rechte | Principle | Motivation | Mathematik trägt |
| `anf` | Freigabepflicht | Requirement | Motivation | Mathematik trägt |
| `budget` | Risikobudget | Constraint | Motivation | Mathematik trägt |
| `lage` | Lagebild | Assessment | Motivation | Baustein fehlt |
| `option` | Agenten-Einsatz | Course of action | Strategy | Baustein fehlt |
| `cap` | Änderungswesen | Capability | Strategy | Baustein fehlt |
| `vs` | Änderungsfluss | Value stream | Strategy | Baustein fehlt |
| `obj` | Stückliste | Business object | Business | Mathematik trägt |
| `proc` | Änderungslauf | Business process | Business | Mathematik trägt |
| `rolle` | Freigeber | Business role | Business | Baustein fehlt |
| `onto` | Ontologie | Data object | Application | Grenze greift |
| `agent` | Agenten | Application component | Application | Grenze greift |
| `wf` | Workflow | Application process | Application | Mathematik trägt |
| `gate` | Jev-Gate | Application function | Application | KI trägt |
| `est` | Schätzer | Application function | Application | KI trägt |
| `llm` | LLM-Plattform | Node | Technology | KI trägt |
| `harness` | Harness | System software | Technology | Mathematik trägt |
| `jev` | Jev-Dienst | Node | Technology | KI trägt |
| `traces` | Traces | Artifact | Technology | Grenze greift |
| `plateau` | Ist und Ziel | Plateau | Implementation & Migration | Grenze greift |
| `wp` | Pilot | Work package | Implementation & Migration | Baustein fehlt |
| `gap` | Lücke | Gap | Implementation & Migration | Mathematik trägt |

Die 28 Beziehungen stehen unter `edges` mit den Typen `realization`, `serving`, `assignment`, `access`, `influence` und `association`. Sie sind vereinfacht und nicht einzeln gegen die Beziehungstabelle der ArchiMate-Spezifikation geprüft. Verdächtig sind vor allem `cap realization option` und `plateau realization option`; das entscheidet die Validierung in Schnitt 1. Die Zuordnung der Agenten-Konzepte ist ein Vorschlag: Agent als Application Component, Skill als Application Function, Workflow als Application Process, Gate als Application Function, Risikobudget als Constraint. Alle 22 verwendeten Typen gibt es im Enum von `packages/shared` (in snake_case, etwa `course_of_action`).

## 7. Bausteine mit Formel und Abnahmetest

Alle Testwerte stehen maschinenlesbar unter `fixtures` in `landkarte.model.json`.

### 7.1 Risikobudget

Der Mikro-Vorfall bleibt die Einheit. Gerechnet wird mit vier genormten oder klar hergeleiteten Verfahren statt mit einem freien Produkt. Fassung 1 hatte hier zwei stille Annahmen, die das Urteil über den Workflow drehen konnten (Abschnitt 12).

#### 7.1.1 Einheit und LOPA (`fixtures.riskBudget.lopa`)

- **Einheit:** 1 Mikro-Vorfall (µ) ist die Wahrscheinlichkeit 10⁻⁶, dass eine einzelne Agentenaktion einen fest definierten schweren Referenzvorfall auslöst. Es gibt eine Schwereklasse je Einheit, ohne Umrechnung zwischen Klassen. Leib und Leben gehört nicht in dieses Budget.
- **Verfahren:** Layer of Protection Analysis nach IEC 61511. Auslösendes Ereignis ist der Agentenfehler, unabhängige Schutzschichten (IPL) sind Gate und Mensch, bedingter Faktor ist „schwer, wenn unentdeckt“.
- **Formel:** `r = pAgent * pGateMiss * pHumanMiss * pSevere`. Das ist dieselbe Rechnung wie in Fassung 1, aber LOPA bringt Kriterien mit, wann eine Schicht als IPL zählen darf: unabhängig, spezifisch, verlässlich, prüfbar.
- **Test:** 0,02 × 0,1 × 0,1 × 0,005 ergibt 1 µ, ohne Mensch 10 µ.
- **Herkunft der Eingaben:** `pAgent` ist aus Traces messbar, `pGateMiss` zertifizierbar (7.12), `pHumanMiss` messbar mit eingeschleusten Fehlern. `pSevere` ist für schwere Vorfälle praktisch nicht messbar und bleibt eine markierte Annahme.

#### 7.1.2 Beta-Faktor für korrelierte Schichten (`fixtures.betaFactor`)

- **Problem:** Das Produkt gilt nur bei Unabhängigkeit. Agent und Prüfmodell aus derselben Modellfamilie irren gemeinsam, und Menschen winken durch, was das Gate durchgelassen hat.
- **Verfahren:** Beta-Faktor-Modell für Common-Cause-Fehler nach IEC 61508-6, hier auf bedingte Wahrscheinlichkeiten übertragen: `P(Schicht versagt | Vorschicht versagt) = β + (1 − β) · p`. β = 0 heißt unabhängig, β = 1 heißt blind für genau diesen Fehler.
- **Folge:** Selbst ein perfektes Gate (p = 0) lässt den Anteil β durch. Liegt diese Untergrenze über dem Budget, hilft keine Schwelle mehr, nur Diversität (andere Modellfamilie, andere Information).
- **Test** (Budget 1 µ je Aktion):

| β Agent–Gate | β Gate–Mensch | Risiko je Aktion | Untergrenze bei perfektem Gate | zulässige Roh-Fehlquote des Gates |
|---|---|---|---|---|
| 0 | 0 | 1,0 µ | 0 µ | 0,1 |
| 0,05 | 0 | 1,45 µ | 0,5 µ | 0,0526 |
| 0,1 | 0 | 1,9 µ | 1,0 µ | 0 (nur ein perfektes Gate hält das Budget) |
| 0,1 | 0,1 | 3,61 µ | 1,9 µ | keine; Budget mit keiner Schwelle erreichbar |

- **Wichtig für 7.12:** Misst man das Gate nur an echten Agentenfehlern, misst man direkt `P(Gate verfehlt | Agent irrt)`. Der Anteil β Agent–Gate steckt dann schon in der Messung und muss nicht geschätzt werden. Die zulässige bedingte Fehlquote bleibt 0,1, solange β Gate–Mensch = 0 ist, und sinkt bei β Gate–Mensch = 0,1 auf 0,0526.

#### 7.1.3 Kostenvektor auf der Markov-Kette (`fixtures.costVector`)

- **Problem:** Fassung 1 sagte „Summe aus erwarteten Besuchen je Schritt mal Risiko je Aktion“ (3,025 µ), rechnete in der Fixture aber nur den schreibenden Schritt (0,9 µ). Das eine reißt das Budget, das andere hält es.
- **Formel:** `Risiko je Lauf = N[start] · c`, wobei `c[i]` das Risiko je Besuch von Schritt i ist. Das ist eine Markov-Kette mit Belohnung (Markov reward).
- **Herleitung von c:** nicht gesetzt, sondern aus dem Modell abgeleitet. `c[i] = r`, wenn die Rolle von Schritt i in `fixtures.fca` das Merkmal W (schreibt Stückliste) trägt, sonst 0. Lesende Schritte können den Referenzvorfall nicht auslösen.
- **Test:**

| Variante | c (µ je Besuch) | Risiko je Lauf |
|---|---|---|
| nur schreibende Schritte (gilt) | (0, 0, 1) | 0,9 µ |
| alle Schritte | (1, 1, 1) | 3,025 µ |
| nur schreibend, β = 0,1 / 0,1 | (0, 0, 3,61) | 3,249 µ |
| nur schreibend, Rücksprung schreiben→prüfen 0,10 statt 0,25 | (0, 0, 1) | 0,7826 µ |

#### 7.1.4 THR-Aufteilung des Budgets (`fixtures.thr`)

- **Problem:** Fassung 1 wies dem Workflow 20 000 µ je Jahr zu, also 20 % des Unternehmensbudgets, ohne Begründung. Gleichmäßig verteilt wären es 5 µ je Lauf gewesen.
- **Verfahren:** Aufteilung einer tolerierbaren Gefährdungsrate von oben nach unten nach EN 50126/50129, mit erklärter Regel und Reserve.
- **Rechnung:** Ziel ist höchstens 1 schwerer Vorfall in 10 Jahren, also 0,1 je Jahr = 100 000 µ je Jahr. Davon gehen 40 % in eine Reserve für nicht modellierte Wege, künftige Workflows und Schätzfehler. Die übrigen 60 000 µ werden nach der Regel „gleiches Risiko je Lauf“ auf alle Agenten-Workflows derselben Schwereklasse verteilt.
- **Test:** Stückliste 20 000, Lieferantenstamm 10 000, Preispflege 30 000 Läufe je Jahr. Das ergibt 1 µ je Lauf und für die Stückliste 20 000 µ je Jahr. Verbraucht werden 18 000 µ (90 %). Mit β = 0,1 / 0,1 wären es 64 980 µ, und das Budget ist gerissen.

#### 7.1.5 Schätzung und Schwelle

- **Schwelle aus dem Budget:** `maxGateMiss = budget / (pAgent * pHumanMiss * pSevere)`, bei Korrelation die Formel aus 7.1.2.
- **Schätzung:** Fehlerraten als Beta-Verteilung, gerechnet wird mit der oberen Grenze. Null Fehler in n Versuchen belegt eine Rate unter ε mit 95 %, sobald `(1 − ε)^n ≤ 0,05`.
- **Test:** Bei einem Budget von 1 µ je Aktion ist `maxGateMiss` 0,1. Dafür reichen exakt 29 fehlerfreie Versuche (0,9²⁹ = 0,047). Die Faustregel 3/n liefert 30 und ist leicht konservativ.

### 7.2 Absorbierende Markov-Kette

- **Eingabe:** Übergangsmatrix zwischen Arbeitsschritten (Q) und in Endzustände (R), geschätzt aus Event-Logs echter Läufe. Übergänge aus Simulationen beschreiben den Simulator, nicht das Unternehmen (ADR-0012).
- **Rechnung:** `N = inverse(I - Q)`. Die Startzeile von N sind die erwarteten Besuche je Schritt, `B = N * R` die Anteile je Endzustand. Risiko und Kosten je Lauf über den Kostenvektor aus 7.1.3.
- **Test:** Besuche 1,0 / 1,125 / 0,9, im Mittel 3,025 Schritte, Enden 67,5 % Fertig, 11,25 % Abgelehnt, 21,25 % Eskalation.
- **Grenzen:** Agenten haben Gedächtnis; wo das zählt, Zustände um einen Versuchszähler erweitern. Je Modellversion neu schätzen (ein Basiswechsel nach 7.13). Zustände nur zusammenfassen, wenn alle Zustände eines Blocks gleich wahrscheinlich in jeden anderen Block wechseln.

### 7.3 Graph-Algebra mit Fehlerelement u

- **Regel:** `x*y = x`, wenn die Kante (x, y) erlaubt ist, sonst `u`. `u` schluckt alles.
- **Klammerung:** Die Operation ist nicht assoziativ. Rechtsklammerung prüft eine Delegationskette, Linksklammerung die eigenen Rechte von x.
- **Zwei Ebenen:** Typen gegen ArchiMate-Regeln (SHACL), Instanzen gegen den Berechtigungsgraphen.
- **Soll gegen Ist:** Jeder beobachtete Übergang muss eine erlaubte Kante sein. Erlaubte Kanten, die nie genutzt werden, sind überschüssige Rechte.
- **Test:** `klassifizierer*(aenderer*stueckliste)` ergibt `klassifizierer`, `(klassifizierer*aenderer)*stueckliste` ergibt `u`.

### 7.4 Formale Begriffsanalyse

- **Eingabe:** Kreuztabelle Objekte mal Merkmale. **Ausgabe:** Begriffe, Ordnung, Implikationen.
- **Einsatz:** Rollenzuschnitt (Merkmalssatz als minimales Rechteprofil), Regelkandidaten, Herleitung des Kostenvektors (7.1.3). Eine Implikation wird erst nach Bestätigung durch einen Menschen zum Constraint.
- **Test:** Die Tabelle unter `fixtures.fca` hat genau fünf Begriffe, darunter ({pruefer, aenderer}, {A, S}), und liefert die Implikation W ⇒ F.

### 7.5 Kontexte

- **Idee:** Jeder Knoten trägt den Schlüssel (Kontext, ID). Pfeile zwischen Kontexten gibt es nur entlang erklärter Übersetzungen. Als Kontext taugen Domänen oder Plateaus. Das ist Grothendiecks relativer Standpunkt: Objekte immer über einer Basis.
- **Test:** Übersetzungen müssen sich verketten lassen. A nach B nach C muss dasselbe ergeben wie A nach C direkt.

### 7.6 Homologie

- **Rechnung:** β₀ ist die Zahl der schwachen Zusammenhangskomponenten. β₁ = Kanten − Knoten + β₀ auf dem ungerichteten Multigraphen. Echte Rückkopplungen liefern zusätzlich die starken Zusammenhangskomponenten.
- **Einsatz:** Jede Schleife steht auf einer Liste gewollter Schleifen oder ist ein Befund.
- **Test:** Der Workflow-Graph hat 6 Knoten und 7 Kanten, also β₀ = 1 und β₁ = 2. Die einzige nichttriviale starke Komponente ist {pruefen, schreiben}.

### 7.7 Schleifenprüfung

- **Regel:** Für umkehrbare numerische Übersetzungen muss das Produkt der Faktoren um jede unabhängige Schleife 1 ergeben, innerhalb einer Toleranz. Die Zahl der nötigen Prüfungen ist β₁ des Kontextgraphen; bei n vollständig verbundenen Kontexten sind das (n − 1)(n − 2)/2.
- **Einordnung:** Das ist die Verklebungsbedingung (Kozykelbedingung) aus Grothendiecks Abstiegstheorie. Lokale Übersetzungen verkleben nur dann zu einem globalen Objekt, wenn sie um jede Schleife aufgehen.
- **Befund:** Er gehört der Schleife, nicht einer einzelnen Kante. Die Oberfläche benennt alle beteiligten Übersetzungen.
- **Test:** TE nach Produktion 1, Produktion nach Logistik 10, TE nach Logistik 12: Die Schleife geht nicht auf (10 ≠ 12). Bei 6 Kontexten sind 10 Prüfungen nötig.

### 7.8 Sichten als Quotienten

- **Regel:** Eine Sicht ist ein Paar aus zu erhaltenden Beziehungen und einer Gruppierung. Zwei Elemente dürfen nur verschmelzen, wenn sie bezüglich dieser Beziehungen Zwillinge sind.
- **Test:** Unter Schreibrechten gibt es bei Klassifizierer, Prüfer und Änderer keine Zwillinge. Erhält man nur Zielbeitrag und Risikobudget, verschmelzen alle drei.

### 7.9 Harness-Kaskade

1. Der Agent schlägt eine typisierte Aktion vor.
2. Regelprüfung per Lookup; bei `u` sofort Stopp.
3. Zertifiziertes Urteil aus vielen kleinen typisierten Fragen.
4. Drei Ausgänge: ausführen, an den Menschen, ablehnen. Die Schwellen folgen aus 7.1 und tragen ein Zertifikat nach 7.12.
5. Jeder Ausgang schreibt einen Trace, der Übergänge und Fehlerraten nachführt.

Jev ist dafür eine Option, keine Voraussetzung. Es ist Early Access, und die Leistungsangaben stammen vom Hersteller. Jeder Klassifikator mit Zertifikat auf eigenen Gold-Sets erfüllt die Rolle.

### 7.10 Eulertour-Tests

- **Ziel:** jede Kante des Workflow-Graphen mit möglichst wenigen Läufen abdecken (gerichtetes Chinese-Postman-Problem mit Rücksprung „neuer Lauf“).
- **Test:** 7 Kanten, 4 Läufe, 10 Schritte; die Läufe stehen unter `fixtures.eulerSuite`. Vier Läufe sind das Minimum, weil vier Kanten in Endzustände führen und jeder Lauf in genau einem endet.
- **Einordnung:** Rauchtest vor jedem Release, keine Ratenmessung. Verbotene Kanten stichprobenartig prüfen; sie müssen `u` liefern.

### 7.11 SMT-Solver

Erst sinnvoll, wenn Regeln Bedingungen tragen (Betrag, Datenklasse). Dann beweist er, dass ein verbotener Zustand auf keinem Pfad erreichbar ist, oder liefert das Gegenbeispiel. Solange Rechte reine Ja/Nein-Kanten sind, reicht eine Erreichbarkeitssuche im Graphen.

### 7.12 Zertifizierte Schwelle (`fixtures.conformal`)

- **Kerngedanke:** Ob ein Score kalibriert ist, ist eine Aussage über die Welt und nicht beweisbar. Beweisbar ist: „Sind künftige Fälle austauschbar mit dem Gold-Set, dann ist die Fehlquote des Gates an dieser Schwelle mit Wahrscheinlichkeit ≥ 1 − δ höchstens ε.“ Für das Risikobudget reicht diese schwächere Aussage.
- **Schicht (Mondrian):** Gemessen wird nur an Fällen, in denen der Agent tatsächlich geirrt hat. Damit ist die Messgröße genau `P(Gate verfehlt | Agent irrt)`, und die Korrelation Agent–Gate steckt schon darin (7.1.2).
- **Score:** Das Gate meldet, wenn der Score ≥ λ ist. Ein Fehlgriff ist ein Agentenfehler mit Score < λ. Die Fehlquote steigt monoton in λ.
- **Standardverfahren, Learn-then-Test:** λ aufsteigend testen, je λ die Nullhypothese „Fehlquote > ε“ mit `p = BinomCDF(k; n, ε)` prüfen, beim ersten Nicht-Verwerfen stoppen (Fixed-Sequence, ohne Bonferroni). Zertifiziert ist das größte verworfene λ. Die Garantie gilt mit Wahrscheinlichkeit 1 − δ über die Ziehung des Gold-Sets. Das passt zum Notar-Prinzip.
- **Alternative, Conformal Risk Control:** Wähle das größte λ mit `(k + 1)/(n + 1) ≤ α`. Die Garantie gilt im Erwartungswert über Gold-Set und neuen Fall. Das passt formal zum Budget, das selbst ein Erwartungswert ist, ist aber für ein Audit schwächer.
- **Test** (n = 60 Agentenfehler, ε = α = 0,1, δ = 0,05):

| λ | Fehlgriffe k | p-Wert | LTT |
|---|---|---|---|
| 0,1 | 0 | 0,0018 | verworfen |
| 0,2 | 0 | 0,0018 | verworfen |
| 0,3 | 1 | 0,0138 | verworfen |
| 0,4 | 3 | 0,1374 | nicht verworfen, Stopp |
| 0,5 | 8 | – | nicht getestet |

  Learn-then-Test zertifiziert λ = 0,3. Conformal Risk Control erlaubt bis zu 5 Fehlgriffe und wählt λ = 0,4.
- **Mindestzahl an Gold-Fällen:** Für ε = 0,1 reichen 29 Agentenfehler ohne Fehlgriff. Bei β Gate–Mensch = 0,1 sinkt ε auf 0,0526, dann braucht es 56. Gezählt werden nur Agentenfehler, nicht alle Fälle.
- **Unterhalb der Mindestzahl:** Die Oberfläche zeigt „nicht zertifiziert (n von nötigen m)“.
- **Was die Mathematik nicht liefert:** Die Gold-Labels müssen stimmen. Die Garantie gilt relativ zum Gold, und verrauschte Labels schwächen sie. Ohne Mensch-Mensch-Übereinstimmung auf dem Gold-Set ist das Zertifikat nur so gut wie ein einzelner Annotator. Das Gate-Urteil ist eine Klassifikation mit Gold-Ausgang (Klasse A nach ADR-0012) und darf deshalb überhaupt eine Konfidenz tragen.

### 7.13 Jede Garantie trägt ihre Basis (`fixtures.basis`)

- **Idee:** Nach Grothendiecks relativem Standpunkt untersucht man nicht Objekte an sich, sondern Objekte über einer Basis, und fragt, was beim Basiswechsel geschieht. Hier ist das Objekt eine Garantie, und die Basis ist das, worauf sie gemessen wurde. Die Analogie betrifft die Methode; Grothendieck hat nicht über Statistik gearbeitet.
- **Schlüssel eines Zertifikats:** `goldSetId`, `modelVersion`, `gateVersion`, `context`, `n`, `k`, `eps`, `delta`, `validFrom`.
- **Basiswechsel:**

| Ereignis | Wirkung |
|---|---|
| neue Modellversion (Agent oder Gate) | Zertifikat ungültig, neu messen |
| neuer Kontext (Domäne, Rechtsgebiet, Kunde) | kein Zertifikat dort; das alte gilt im neuen Kontext nicht |
| Gold-Set erweitert | neu rechnen; das alte Zertifikat gilt bis dahin weiter |
| Verteilungsverschiebung festgestellt | Zertifikat ausgesetzt |

- **Stabilität:** Die Garantie ist unter Basiswechsel nicht stabil. Sie überträgt sich nur, wenn das Verhältnis der Verteilungen bekannt ist (gewichtetes Conformal). Das ist die ehrliche Grenze.
- **Verkleben:** Gelten die Schranken aller Kontexte gleichzeitig, ist die globale Fehlquote höchstens `Σ w_c · ε_c` mit Wahrscheinlichkeit ≥ `1 − Σ δ_c` (Union Bound). Dabei ist `w_c` der Anteil des Kontexts an den Agentenfehlern.
- **Test:** DE-Recht (w = 0,7, ε = 0,05, δ = 0,025) und EU-Recht (w = 0,3, ε = 0,1, δ = 0,025) ergeben global ε = 0,065 mit 95 %.
- **Bezug:** Die Schleifenprüfung (7.7) ist dieselbe Idee für Übersetzungen, die Neuschätzung je Modellversion (7.2) dieselbe Idee für Übergänge. Herkunft und Konfidenz (Abschnitt 4) bekommen damit eine gemeinsame Grundlage.

## 8. Schnitte in dieser Reihenfolge

**Schnitt 0: Erkundung.** Kein Code. Ergebnis ist `ERKUNDUNG.md` mit Antworten auf Abschnitt 9.

**Schnitt 1: Referenzmodell importieren.**
- `landkarte.model.json` als Beispielmodell laden, über den vorhandenen Importweg.
- Abnahme: 24 Elemente und 28 Beziehungen sind sichtbar. Typen und Beziehungen laufen durch die vorhandene Validierung. Ungültige Beziehungen werden gemeldet, nicht stillschweigend korrigiert.

**Schnitt 2: Zertifizierte Schwellen aus dem Risikobudget (dockt an THE-609 an).**
- Reine Funktionen ohne Seiteneffekte für 7.1.1 bis 7.1.5 (LOPA, Beta-Faktor, Kostenvektor, THR, Mindestzahl) und für 7.12 (Learn-then-Test, Conformal Risk Control). Die Fixtures sind die Unit-Tests.
- Eingabe für 7.12 ist ein Gold-Set aus echten Agentenfehlern mit Gate-Score. Ein vollständig kalibrierter Score (THE-606) ist dafür nicht nötig.
- Abnahme: Die Oberfläche zeigt neben jeder Schwelle ihre Herleitung, ihr Zertifikat mit Basis (7.13) und je Eingabe „gemessen (n, Quelle)“ oder „Annahme“. Unterhalb der Mindestzahl steht „nicht zertifiziert (n von nötigen m)“ statt einer Zahl. Ein Basiswechsel setzt das Zertifikat sichtbar aus.

**Schnitt 3: Topologie-Detektoren im Architecture Advisor.**
- β₀, β₁ und starke Zusammenhangskomponenten nach 7.6, mit Liste gewollter Schleifen.
- Abnahme: Die Testwerte aus 7.6 stimmen. Jeder Befund nennt die beteiligten Elemente.

**Danach, nur bei belegter Nachfrage:** Markov-Kette aus Event-Logs (7.2), Kontexte mit Schleifenprüfung (7.5, 7.7), Sichtenprüfung (7.8), SMT (7.11), Messung von β Gate–Mensch mit eingeschleusten Fehlern, laufende Prüfung der Austauschbarkeit (konforme Martingale), Übertragung über Basiswechsel (gewichtetes Conformal).

**Nicht bauen:**
- eine Agenten-Laufzeit oder ein Harness als Kundenfunktion,
- Kolmogorov-Arnold-Netze, Co-Design, Kausalmodell,
- eine Jev-Anbindung als Pflichtbestandteil,
- eine Kalibrierung des ganzen Scores (etwa Venn-Abers), solange eine Schranke an der Schwelle reicht.

## 9. Fragen an das Repo für Schnitt 0

1. Wie liegt das ArchiMate-Modell in Neo4j (Labels, Beziehungstypen, Pflichtfelder)?
2. Welche Importwege gibt es, und welcher eignet sich für `landkarte.model.json`?
3. Wo sitzen Kalibrierung (THE-606) und Schwellen-Routing (THE-609), und wie weit sind sie?
4. Wie werden Detektoren des Architecture Advisor registriert und getestet?
5. Gibt es schon GDS-Projektionen für schwache und starke Zusammenhangskomponenten?
6. Wo liegen die Risiko-Engines (Bayesian Cascade, Monte Carlo), und welches Datenmodell nutzen sie?
7. Wie ist die FCA-Schicht gebaut (Sprache, Ein- und Ausgabeformat)?
8. Gibt es an Knoten bereits einen Kontext-, Plateau- oder Szenario-Schlüssel?
9. In welchem Format kommen Event-Logs aus dem Process-Mining-Import an?
10. Welche Befehle gelten für Lint, Typprüfung und Tests?
11. Welche Linear-Issues decken die Schnitte ab, und welche fehlen?
12. Gibt es Gold-Fälle mit echten Agentenfehlern und gespeichertem Gate-Score, und wie viele (ADR-0012, Golden-Sets aus THE-430)? Gibt es dafür eine Mensch-Mensch-Übereinstimmung?
13. Werden an Urteilen Modellversion, Gold-Set und Kontext gespeichert, sodass ein Zertifikat seine Basis tragen kann?

## 10. Bekannte Unsicherheiten

- **Abbildung auf TheArchitect:** Sie stammt aus Beschreibungen des Produkts, nicht aus dem Code. Issue-Nummern und Build-Stand sind vom Spätsommer 2026. Schnitt 0 existiert, um das zu prüfen.
- **Mikro-Vorfall:** nur noch Einheit. Gerechnet wird nach LOPA (IEC 61511), korreliert nach dem Beta-Faktor-Modell (IEC 61508-6), verteilt nach THR (EN 50126). Die Übertragung dieser Normen von technischen Systemen auf LLM-Agenten ist eine eigene Anpassung, keine Normanwendung.
- **Unabhängigkeit der Schutzschichten:** jetzt ein Parameter statt einer stillen Annahme. Die Korrelation Agent–Gate wird durch die Messung an echten Agentenfehlern (7.12) mit erfasst. Gate–Mensch bleibt geschätzt, bis eingeschleuste Fehler sie messen, und Menschen winken mit der Zeit mehr durch.
- **pSevere:** für schwere Vorfälle praktisch nicht messbar. Es bleibt eine Annahme und wird als solche angezeigt.
- **Gold-Labels:** Ein Zertifikat gilt relativ zum Gold. Verrauschte Labels schwächen jede Garantie, und eine Mensch-Mensch-Übereinstimmung fehlt bisher.
- **Austauschbarkeit:** die einzige Voraussetzung der Zertifikate und nicht beweisbar. Sie lässt sich nur bezeugen und überwachen.
- **Grothendieck:** Die Parallele (relativer Standpunkt, Basiswechsel, Verkleben) betrifft die Methode, nicht seine Sätze.
- **Schleifenprüfung:** sauber nur für umkehrbare Übersetzungen wie Einheiten. Darüber hinaus Forschungsniveau.
- **Homologie:** sieht keine Richtung und vermischt Rückkopplung mit Alternativweg.
- **Angriffe:** Gezielte Angriffe wie Prompt Injection sind kein Zufall. Dafür gelten harte Verbote, kein Budget.

## 11. Archify-Diagramm neu rendern

- Gerendert mit Archify 2.17.0-dev.1, Commit `629155a4` von `tt-a1i/archify`. Das ist der letzte Stand mit geführten Ansichten; Archify 3 hat sie entfernt.
- Befehl: `node <archify>/bin/archify.mjs finalize workflow docs/landkarte/landkarte.workflow.json landkarte-archify.html --quality standard --json`
- Die langen Kanten sind über feste `via`-Koordinaten geführt, passend zur Knotenbreite 136. Wer Knotenbreiten oder Beschriftungen direkt gegenüberliegender Kanten ändert, verschiebt die Spalten und muss diese Koordinaten neu setzen.
- Das strengere Profil `showcase` scheitert allein an der Höhe: Sechs Bahnen passen nicht auf einen Desktop-Bildschirm.
- Fassung 2 ändert das Diagramm nicht. Die neuen Methoden stehen nur im Modell.

## 12. Änderungen gegenüber Fassung 1

| Stelle | Fassung 1 | Fassung 2 |
|---|---|---|
| Risiko je Lauf | Text: alle Schritte (3,025 µ); Fixture: nur schreibend (0,9 µ) | Kostenvektor aus dem FCA-Merkmal W, beide Varianten als Test (7.1.3) |
| Budget je Lauf | 20 % des Unternehmensbudgets ohne Begründung | THR-Aufteilung mit 40 % Reserve und gleichem Risiko je Lauf (7.1.4) |
| Unabhängigkeit | nur als Unsicherheit genannt | Beta-Faktor mit Testfällen; Untergrenze bei perfektem Gate (7.1.2) |
| Regel der Drei | 30 Versuche | exakt 29; 30 ist die konservative Faustregel |
| Leitplanke Kalibrierung | „nur kalibrierte Werte“ | „nur zertifizierte Schranken“, dazu „jede Garantie trägt ihre Basis“ |
| Schnitt 2 | hängt an THE-606 | Conformal-Fassung; braucht Gold-Fälle mit Agentenfehlern, keinen voll kalibrierten Score |
| Neu | – | 7.12 Zertifizierte Schwelle, 7.13 Basis; Fragen 12 und 13 |
