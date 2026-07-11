# 10 MCP-Use-Cases: Claude ↔ The Architect

*Erstellt aus Repo-Abgleich (CLAUDE.md, PROGRESS.md, Git-Stand Commit `2040309`) und Live-Stand https://thearchitect.site. Stand der Analyse: Juni 2026.*

## Grundlegende Voraussetzung (gilt für alle Use Cases)

Es existiert **noch kein MCP-Server**. Jeder Use Case setzt voraus, dass ein dünner MCP-Server gebaut wird, der die bestehende `/api/<domain>`-REST-Oberfläche kapselt. Gute Nachricht aus dem Repo: API-Key-Auth (`ta_`-Präfix, SHA-256-gehasht) ist bereits vorhanden — der MCP-Server kann sie als Bearer-Credential nutzen, ohne dass ein neues Auth-System gebaut werden muss. Persistenz liegt in MongoDB (Dokumente) und Neo4j (Graph/Abhängigkeiten); Letzteres ist der Schlüssel für alle Abfrage- und Impact-Use-Cases.

**Konvention in diesem Dokument:** `read` = sichere Lese-Aktion, läuft ohne Rückfrage. `write`/`control` = verändernde oder rechenintensive Aktion → MCP-Tool gibt zuerst eine Vorschau zurück und verlangt explizite Nutzerbestätigung, bevor es ausführt.

---

## Dimension 0 — Architektur-Vision / Eintrittspunkt (TOGAF ADM Phase A)

> Methodischer Einstiegspunkt, der den anderen Dimensionen vorausgeht. Ein Architekt startet nicht beim Import, sondern bei der Vision — der Erstbefüllung des Motivation-Layers. Dieser Use Case ist die **Eingangstür**; UC-1 (Paste & See) ist der generische Ingest darunter und teilt sich die Commit-Maschinerie.

### UC-0 — Architecture Vision & Ist-Skizze per Sprache generieren *(Eingangstür, Skill-getrieben)*
**Nutzen:** Der Nutzer beschreibt sein Vorhaben in natürlicher Sprache und erhält in The Architect einen befüllten Motivation-Layer (Architecture Vision nach Phase A) sowie optional eine erste Ist-Skizze für den gewählten Viewpoint — ohne Vision-Authoring-Wizard in der Software.

- **Beispiel-Prompt:** „Wir wollen unsere ERP-Landschaft in die Cloud migrieren, getrieben von NIS2 und Kostendruck. Bau mir daraus eine Architecture Vision und skizziere die heutige Application-Cooperation-Sicht."
- **Architektur-Prinzip (zentral):** Die **Methodik lebt im Claude-Skill** (`togaf-vision-architect`): geführte Phase-A-Elicitation, ArchiMate-Metamodell-Regeln, Viewpoint-Auswahl, Strukturierung. Der **MCP-Server bleibt reiner Write-Layer**. So braucht die Plattform nie eine komplexe Vision-UI — die Komplexität liegt im Gespräch, nicht in der Software.
- **MCP-Tools:**
  - `architect.commit_motivation_model` — *Input:* `projectId`, `motivationElements[]` (Stakeholder, Driver, Assessment, Goal, Outcome, Principle, Constraint, Requirement, Value), `relationships[]` (influence/realization/association); *Output:* angelegte IDs; *Modus:* `write` (Bestätigung)
  - `architect.create_view` — *Input:* `projectId`, `viewpoint`, `elementIds[]`; *Output:* `viewId`; *Modus:* `write` (Bestätigung)
  - *(wiederverwendet)* `architect.commit_elements` aus UC-1 für die Ist-Skizze
- **Intern:** Skill erzeugt validiertes Payload → AI Architecture Advisor + Mapping-Pipeline → Persistenz in MongoDB/Neo4j → View-Erzeugung.
- **Sichtbares Ergebnis:** Motivation-Modell im 3D-View, plus optional eine Baseline-Sicht im gewählten Viewpoint. Claude listet Vision-Kern (Stakeholder/Driver/Goals) als Text.
- **Empfohlene Phasierung:** Vision zuerst committen, Ist-Architektur als **optionaler zweiter Schritt** — nicht beides in einem ermüdenden Durchlauf.
- **Machbarkeit:** **mittel (Skill-abhängig).** Bausteine vorhanden (AI Advisor, Text→ArchiMate-Mapping, ArchiMate-3.2-Abdeckung belegt). Neu: der Skill selbst + Motivation-Layer-Commit. **Risiko/Flag:** Motivation-Elemente sind abstrakt → LLM-Output wird leicht generisch (Qualitätskontrolle nötig); und es ist **nicht verifiziert, ob der Motivation-Layer im 3D-View eigenständig rendert / einen eigenen Viewpoint hat** — vor Zusage prüfen.

---

## Dimension A — Befüllung / Import

### UC-1 — „Paste & See": Text/Dokument → ArchiMate-Modell
**Nutzen:** Der Nutzer fügt einen Fließtext, ein Konzeptpapier oder eine Architektur-Beschreibung in Claude ein und bekommt in The Architect ein befülltes ArchiMate-3.2-Modell.

- **Beispiel-Prompt:** „Nimm diese Systembeschreibung und leg daraus ein ArchiMate-Modell im Projekt ‚BSH-Demo' an."
- **MCP-Tools:**
  - `architect.map_text_to_archimate` — *Input:* `text`, `projectId`, `layerHints?`; *Output:* Vorschlag (Elemente + Beziehungen, dedupliziert); *Modus:* `read` (Vorschau)
  - `architect.commit_elements` — *Input:* `projectId`, `elements[]`, `connections[]`; *Output:* IDs der angelegten Knoten; *Modus:* `write` (Bestätigung)
- **Intern:** AI Architecture Advisor + CSV-Import-Pipeline erzeugen Elemente, Duplicate Detection (Name+Type-Matching) verhindert Dubletten, Persistenz in MongoDB/Neo4j.
- **Sichtbares Ergebnis:** Neue Elemente erscheinen live im 3D-View; Claude listet, was angelegt wurde.
- **Machbarkeit:** **mittel.** AI Advisor und Import existieren; nötig ist ein sauberer Ingest-Endpoint mit Vorschau/Commit-Trennung. **Risiko:** LLM-Mapping-Qualität schwankt; ohne Vorschau-Schritt Gefahr von Modell-Verschmutzung.

### UC-2 — BPMN-/n8n-Workflow-Import
**Nutzen:** Bestehende Prozess- oder Automatisierungs-Definitionen werden per Prompt zu Architektur-Elementen.

- **Beispiel-Prompt:** „Importiere diesen n8n-Workflow als Application-/Technology-Layer-Elemente."
- **MCP-Tools:** `architect.import_workflow` — *Input:* `projectId`, `format` (`bpmn`|`n8n`), `payload`; *Output:* Import-Diff; *Modus:* `write` (Bestätigung)
- **Intern:** Vorhandene BPMN/n8n-Import-Funktion mit Skip-in-Merge-Mode-Deduplizierung.
- **Sichtbares Ergebnis:** Workflow-Schritte als verknüpfte Knoten im Graph.
- **Machbarkeit:** **mittel.** Funktion existiert, muss nur API-seitig exponiert werden. **Risiko:** Format-Varianten (n8n-Versionen) brauchen robustes Parsing.

---

## Dimension B — Abfrage / Navigation

### UC-3 — Natürlichsprachige Modell-Abfrage
**Nutzen:** Statt UI-Filtern fragt der Nutzer das Modell in Alltagssprache ab.

- **Beispiel-Prompt:** „Welche Applikationen im Projekt haben keinen Owner und keine Technology-Layer-Anbindung?"
- **MCP-Tools:** `architect.query_model` — *Input:* `projectId`, `naturalLanguageQuery`; *Output:* strukturierte Trefferliste (Elemente + Attribute); *Modus:* `read`
- **Intern:** Übersetzung in Neo4j-Cypher gegen den Abhängigkeitsgraphen.
- **Sichtbares Ergebnis:** Claude antwortet textuell + optional Element-IDs zum Anspringen im 3D-View.
- **Machbarkeit:** **sofort.** Reine Lese-Abfrage gegen vorhandenen Graph, kein Schreibrisiko. **Risiko:** gering; NL→Cypher kann bei Mehrdeutigkeit danebenliegen → Rückgabe der erzeugten Query zur Transparenz.

### UC-4 — Impact- / Abhängigkeitsanalyse
**Nutzen:** „Was bricht, wenn X wegfällt?" — Vorausschau vor Entscheidungen.

- **Beispiel-Prompt:** „Zeig mir alle Capabilities und Prozesse, die von System ‚Oracle ERP' abhängen."
- **MCP-Tools:** `architect.impact_analysis` — *Input:* `projectId`, `elementId`, `direction` (`upstream`|`downstream`), `depth?`; *Output:* betroffene Knoten + Pfade; *Modus:* `read`
- **Intern:** Graph-Traversal in Neo4j über die Cross-Architecture-Connections.
- **Sichtbares Ergebnis:** Abhängigkeitsbaum als Liste; im 3D-View hervorhebbar.
- **Machbarkeit:** **sofort.** Graph + Cross-Architecture-Connections sind persistiert. **Risiko:** gering; bei sehr großen Modellen (>50 Elemente) Performance — das geplante LOD-System ist hier komplementär.

---

## Dimension C — Steuerung / Ausführung

### UC-5 — MiroFish-Simulation per Prompt starten *(Kern-USP)*
**Nutzen:** Pre-Decision-Simulation — die eigentliche Differenzierung gegenüber LeanIX/Ardoq/MEGA — wird ohne UI-Klickpfad ausgelöst.

- **Beispiel-Prompt:** „Starte eine MiroFish-Simulation für Szenario ‚Cloud-Migration' mit den Standard-Personas und fass mir Bottlenecks und Emergenz zusammen."
- **MCP-Tools:**
  - `architect.run_simulation` — *Input:* `projectId`, `scenarioId`, `personaSet?`, `iterations?`; *Output:* `runId`; *Modus:* `control` (Bestätigung, da rechenintensiv)
  - `architect.get_simulation_result` — *Input:* `runId`; *Output:* Fatigue/Bottleneck/Emergence/Risk-Cost-Metriken; *Modus:* `read`
- **Intern:** MiroFish-Engine (Phase 1–3 vorhanden, inkl. Persona-Editor und Run-Vergleich), asynchroner Lauf.
- **Sichtbares Ergebnis:** Claude liefert die Kennzahlen + verweist aufs Emergence-Dashboard.
- **Machbarkeit:** **mittel.** Engine ist verifiziert; nötig ist ein Async-/Polling-Pattern (Start → `runId` → Ergebnis). **Risiko:** Bekanntes Rubber-Stamping-Thema (THE-210) ehrlich in der Antwort kennzeichnen; Laufzeit-/Kostensteuerung über `iterations`.

### UC-6 — Transformations-Roadmap + Monte-Carlo
**Nutzen:** Sequenzierte Roadmap mit P10/P50/P90-Bandbreite auf Zuruf.

- **Beispiel-Prompt:** „Generiere eine Transformations-Roadmap für dieses Zielbild und gib mir die P50- und P90-Termine."
- **MCP-Tools:** `architect.generate_roadmap` — *Input:* `projectId`, `targetState`, `iterations?`; *Output:* Phasen + Monte-Carlo-Verteilung; *Modus:* `control` (Bestätigung)
- **Intern:** Roadmap-Generator (Kahn-Sort-Sequenzierung) + Kolmogorov-Stochastic-Engine.
- **Sichtbares Ergebnis:** Roadmap-Tabelle + Konfidenzbänder; im TPCV-View vergleichbar.
- **Machbarkeit:** **mittel.** Beide Engines vorhanden und getestet. **Risiko:** Qualität hängt an Input-Verteilungen — hier wäre Reference-Class-Forecasting (Flyvbjerg) der nächste Reifungsschritt; TPCV-QA steht laut Repo noch aus.

### UC-7 — PDF-Report erzeugen & abrufen
**Nutzen:** Management-/Stakeholder-Report aus dem aktuellen Modell auf einen Satz hin.

- **Beispiel-Prompt:** „Erstell mir den Executive-Report für das Projekt als PDF."
- **MCP-Tools:** `architect.generate_report` — *Input:* `projectId`, `type` (`executive`|`simulation`|`inventory`); *Output:* Download-Link/MinIO-Referenz; *Modus:* `write` (erzeugt Artefakt → Bestätigung)
- **Intern:** Vorhandener PDFKit-Export (3 Report-Typen), Ablage in MinIO.
- **Sichtbares Ergebnis:** Fertiges PDF als Link.
- **Machbarkeit:** **sofort.** Feature existiert vollständig; nur Endpoint kapseln. **Risiko:** gering.

---

## Dimension D — Compliance

### UC-8 — NIS2-/Policy-as-Data-Check über das Modell
**Nutzen:** Compliance-Befunde (NIS2/DORA/ISO 27001) gegen das Modell, ohne manuelle Prüfung.

- **Beispiel-Prompt:** „Prüf das Modell gegen NIS2 und zeig mir die Top-Verstöße."
- **MCP-Tools:** `architect.run_compliance_check` — *Input:* `projectId`, `policySet` (`nis2`|`dora`|`iso27001`); *Output:* Verstoß-Liste + Heatmap-Befunde; *Modus:* `read` (bzw. `control`, falls Crawl/Refresh nötig)
- **Intern:** Policy-as-Data-Engine + Compliance-Heatmap; ggf. RAG-Data-Server für Regelquellen.
- **Sichtbares Ergebnis:** Priorisierte Verstoßliste; 3D-Heatmap-Hervorhebung.
- **Machbarkeit:** **mittel — teils unbestätigt.** Compliance-Positionierung ist Produktkern, aber: im gelesenen Repo-Stand konnte ich **keinen dedizierten Compliance-API-Endpoint eindeutig verifizieren**, und der RAG-Data-Server hat laut PROGRESS.md noch einen **ausstehenden UI-Token-Check** (nur 401-Proof-of-Wiring). **Diesen Use Case daher vor MVP-Zusage technisch gegenchecken.**

---

## Dimension E — Pflege / Qualität

### UC-9 — Modell-Qualitäts- & Konsistenz-Audit
**Nutzen:** Automatisches Aufspüren verwaister Elemente, fehlender Beziehungen und ArchiMate-Regelverstöße.

- **Beispiel-Prompt:** „Audite das Modell: Was ist unverbunden, doppelt oder verletzt ArchiMate-3.2-Regeln?"
- **MCP-Tools:**
  - `architect.audit_model` — *Input:* `projectId`, `rules?`; *Output:* Befundliste mit Schweregrad; *Modus:* `read`
  - `architect.apply_fix` — *Input:* `projectId`, `fixId`; *Output:* Ergebnis; *Modus:* `write` (Bestätigung pro Fix)
- **Intern:** Graph-Queries (Neo4j) + AI-Advisor-Regelprüfung; nutzt vorhandene Duplicate-Detection-Logik.
- **Sichtbares Ergebnis:** Audit-Bericht; optional geführte Korrekturen.
- **Machbarkeit:** **mittel.** Bausteine vorhanden, Regel-Engine muss als Audit-Endpoint zusammengeführt werden. **Risiko:** Auto-Fixes nur mit Bestätigung; sonst Datenverlust-Gefahr.

### UC-10 — RVTM-/Linear-Backlog-Pflege
**Nutzen:** Anforderungen und Feature-Backlog (THE-XXX) aus dem Architektur-Kontext heraus pflegen.

- **Beispiel-Prompt:** „Leg für diese drei Audit-Befunde Linear-Issues im Projekt THE an und verlinke sie mit den betroffenen Elementen."
- **MCP-Tools:** `architect.sync_rvtm` — *Input:* `projectId`, `items[]`, `target` (`linear`|`sheets`); *Output:* erzeugte/aktualisierte Issue-IDs; *Modus:* `write` (Bestätigung)
- **Intern:** Vorhandene RVTM-Skill- + Linear-Integration (Projekt THE, F01–F20).
- **Sichtbares Ergebnis:** Neue/aktualisierte Issues mit Rückverweis aufs Modell.
- **Machbarkeit:** **mittel.** Linear-Integration existiert (und es gibt bereits einen separaten Linear-MCP-Server, der parallel genutzt werden könnte). **Ehrlicher Flag:** Die bidirektionale Synchronisation Linear ↔ Google Sheets ist laut Repo **aktuell noch manuell** — vollautomatischer Zwei-Wege-Sync ist also Mehraufwand, nicht „vorhanden".

---

## Priorisierung (Nutzwert × Machbarkeit)

| # | Use Case | Dimension | Nutzwert | Machbarkeit | Modus | Rang |
|---|----------|-----------|----------|-------------|-------|------|
| UC-0 | Architecture Vision (Skill) | Eintrittspunkt | ★★★★★ | mittel (Skill-abh.) | write | **strateg. #1** |
| UC-3 | NL-Modell-Abfrage | Abfrage | ★★★★☆ | sofort | read | **techn. #1** |
| UC-1 | Paste & See | Import | ★★★★★ | mittel | write | **2** |
| UC-5 | MiroFish-Simulation | Steuerung | ★★★★★ | mittel | control | **3** |
| UC-4 | Impact-Analyse | Abfrage | ★★★★☆ | sofort | read | 4 |
| UC-7 | PDF-Report | Steuerung | ★★★☆☆ | sofort | write | 5 |
| UC-6 | Roadmap + Monte-Carlo | Steuerung | ★★★★☆ | mittel | control | 6 |
| UC-9 | Qualitäts-Audit | Pflege | ★★★★☆ | mittel | read/write | 7 |
| UC-2 | BPMN/n8n-Import | Import | ★★★☆☆ | mittel | write | 8 |
| UC-10 | RVTM/Linear-Sync | Pflege | ★★★☆☆ | mittel | write | 9 |
| UC-8 | NIS2-Compliance-Check | Compliance | ★★★★★ | mittel/unbestätigt | read | 10 |

## Empfehlung: Aufbaureihenfolge für den MVP

Bewusst zweigleisig — strategischer Wert und technisches Risiko zeigen nicht aufs selbe.

1. **Fundament zuerst: UC-3 (NL-Abfrage, read) + die Commit-Plumbing aus UC-1.** Risikoärmster Einstieg, etabliert Auth-Flow und Tool-Schema, sofort baubar. Die Commit-Tools werden von UC-0 ohnehin wiederverwendet.
2. **Dann UC-0 (Architecture Vision, Skill-getrieben) als methodische Eingangstür obendrauf.** Strategisch die Nummer 1: löst das Leeres-Modell-Problem, ist TOGAF-nativ und demo-stark („Absatz → Vision in 3D"). Kein Sonderweg, sondern Veredelung der Basis aus Schritt 1.
3. **Dann UC-5 (MiroFish-Simulation)** für den eigentlichen USP (Pre-Decision-Simulation) gegenüber LeanIX/Ardoq/MEGA.

**Quick-Win-Bonus:** UC-7 (PDF-Report) ist „sofort" und mit minimalem Aufwand mitnehmbar.

---

## Ehrliche Unsicherheiten (nicht überlesen)

- **Kein MCP-Server existiert** — das hier ist ein Design-Vorschlag auf Basis bestätigter Features, keine Doku vorhandener Endpoints.
- Ich konnte die **exakten Route-Namen nicht vollständig enumerieren** (GitHub-API lief ins Rate-Limit). Die Tool-Namen oben sind Vorschläge; die `/api/<domain>`-Konvention und der Feature-Stand sind aus CLAUDE.md/PROGRESS.md belegt.
- **UC-0 (Architecture Vision):** ArchiMate-3.2-*Abdeckung* ist belegt, aber **nicht verifiziert, ob der Motivation-Layer im 3D-View eigenständig rendert / einen eigenen Viewpoint hat** — der eine Punkt, der vor einer MVP-Zusage zu prüfen ist.
- **UC-8 (Compliance)** ist der einzige Use Case mit echtem Verifikationsbedarf: dedizierter Compliance-API-Endpoint im gelesenen Stand nicht eindeutig bestätigt, RAG-Token-Check ausstehend.
- **UC-10 (Zwei-Wege-Sync)** ist heute teilmanuell — als „mittel", nicht „sofort" eingestuft.
