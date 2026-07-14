---
aliases:
  - UC-WVA-001
  - Workflow Value Assessment
  - Workflow-Wertbemessung
  - n8n Value Score
tags:
  - feature-spec
  - usecase
  - n8n
  - value-scoring
  - compliance
  - requirements
type: feature-spec
status: draft — Tiefenanalyse abgeschlossen, Umsetzung nicht begonnen
owner: Matze Ganzmann
created: 2026-07-14
related:
  - UC-PROV-001 Trust-Spine (Provenance-Felder — Basis des Vertrauensmodells)
  - UC-CERT-001 Zertifizierung (certifiedBy/certifiedAt — Stufe 3)
  - UC-SIM-001 Similarity Foundation
  - UC-RED-001 Redundancy Detector
  - BSH-ESG-Compliance-Transformation (Policy-Engine im Einsatz)
---

# UC-WVA-001 — Workflow Value Assessment

> [!info] Elevator Pitch
> **TheArchitect als Plattform der Wertbemessung für Automatisierungs-Workflows.**
> Workflow-Builder (Freelancer, Agenturen, interne Citizen Developer) verbinden ihre
> n8n-Instanz und erhalten pro Workflow einen belastbaren, telemetrie-gestützten
> **Wertbeitrag in €/Jahr** (als Spanne p10/p50/p90) plus einen **Compliance-Befund**
> (DSGVO / EU AI Act / interne Policies). Das Ergebnis ist vorzeigbar: als Zertifikat,
> als Pitch-Material, als Verhandlungsgrundlage. Unternehmen erhalten im Gegenzug
> Sichtbarkeit und Rechts-Check ihrer Automatisierungs-Schatten-IT.

## 1. Motivation & strategischer Kontext

Die KI-/Automatisierungs-Branche steht unter Rechtfertigungsdruck: Der gesellschaftliche
und betriebswirtschaftliche Nutzen muss **messbar** werden (vgl. Nadella-Argument,
Lanz+Precht #253). UC-WVA-001 operationalisiert das im Kleinen: nicht die ganze
Unternehmensarchitektur wird bewertet (das ist der spätere Enterprise-Impact-Score),
sondern **ein einzelner Workflow** — klein, konkret, self-serve, viral.

**Der Kniff:** Der Bewertete (Builder) hat ein direktes wirtschaftliches Interesse an
der Bewertung — er kann den nachgewiesenen Wert „in barer Münze" einfordern bzw. als
Referenz für Neugeschäft nutzen. Das erzeugt organische Nachfrage ohne Enterprise-Sales.

**Zwei Kunden, komplementäre Motive:**
- Der **Builder** will den Wert-Nachweis (Marketing, Honorar, Sichtbarkeit).
- Das **Unternehmen** will den Compliance-Check und Transparenz über Schatten-IT.
Beide ziehen sich gegenseitig auf die Plattform.

> [!warning] Kritischer Erfolgsfaktor: Glaubwürdigkeit des Scores
> Der Bewertete bewertet sein eigenes Werk. Selbst deklarierte Zahlen sind
> Behauptungen, keine Messwerte. **Die Währung „Score" ist nach dem ersten
> aufgeflogenen Fantasie-Wert für alle Nutzer entwertet.** Deshalb ist das
> dreistufige Vertrauensmodell (§4) nicht Ausbaustufe, sondern Kern von v1.

## 2. Personas & Akteure

| Akteur | Beschreibung | Primäres Interesse |
|---|---|---|
| **Builder (extern)** | Freelancer / Automation-Agentur, baut Workflows für Kunden | Verifizierter Track-Record als Verkaufsargument („dieser Workflow spart nachweislich X €/Jahr — das schaffe ich auch bei euch") |
| **Builder (intern)** | Citizen Developer / Fachbereichs-Mitarbeiter | Sichtbarkeit des eigenen Beitrags; Portfolio (bewusst NICHT als Gehaltsforderungs-Beleg gerahmt, s. Risiko R-4) |
| **Auftraggeber / Sponsor** | Kunde des Freelancers bzw. Vorgesetzter | Plausibilitätsprüfung; Gegenzeichnung der Baseline (Stufe 3) |
| **Compliance-Verantwortlicher** | DSB / Legal / IT-Governance | Rechts-Check der Workflows (DSGVO, EU AI Act, interne Policies) |
| **Plattform (TheArchitect)** | System | Score-Integrität, Mandantentrennung, Audit-Trail |

## 3. Use Cases

### UC-WVA-001a — Workflow-Import & Strukturanalyse `[EXISTIERT weitgehend]`
Builder verbindet n8n-Instanz (API-Key), Workflows werden als Architektur-Elemente
importiert (Workflow = `process`-Element, Nodes = gemappte ArchiMate-Typen,
Verbindungen = `flow`/`triggering`/`composition`).
→ Bereits implementiert in `packages/server/src/services/connectors/n8n.connector.ts`.

### UC-WVA-001b — Telemetrie-Sync `[NEU — Kern von v1]`
Das System holt periodisch Ausführungsdaten (`GET /api/v1/executions?workflowId=…`):
Status (success/error), Start-/Stopp-Zeitstempel. Es aggregiert fortlaufend
(Läufe gesamt, Läufe/Monat, Erfolgsquote, Ø-Laufzeit) und schreibt die Aggregate
mit Provenance `import` + `sourceRef` an das Workflow-Element.

> [!warning] n8n-Pruning
> n8n löscht Execution-Historie standardmäßig nach 14 Tagen
> (`EXECUTIONS_DATA_MAX_AGE=336h`). Ein Einmal-Import sieht nur ein Fenster.
> **Konsequenz:** Fortlaufende Aggregation über den vorhandenen Sync-Scheduler
> (`sync-scheduler.service.ts`, `syncIntervalMinutes` in `ConnectorConfig`) mit
> monotonem Zählerstand („seit Anbindung: N protokollierte Läufe"). Lückenlose
> Telemetrie-Historie wird dadurch selbst zum Wert (12 Monate Historie > Momentaufnahme).

### UC-WVA-001c — Wertbeitrag-Berechnung `[NEU, auf vorhandenen Bausteinen]`
Pro Workflow wird der Jahres-Wertbeitrag als Spanne berechnet:

```
Wertbeitrag/Jahr =
    verifizierte Läufe/Jahr
  × Erfolgsquote
  × (manuelle Dauer/Lauf − Automatik-Laufzeit/Lauf)
  × Stundensatz
  − Betriebskosten (Smart-Cost-Benchmark + anteilige n8n-Instanzkosten)
  − Wartungsaufwand (Aufwands-Heuristik je Node-Kategorie, vgl. getN8nEffortHours)
```

- **Telemetrie-Inputs** (Läufe, Quote, Laufzeit): aus UC-WVA-001b — gemessen.
- **Annahme-Inputs** (manuelle Dauer, Stundensatz): deklariert oder gegengezeichnet.
- **Unsicherheit:** Monte-Carlo (vorhandene beta-PERT-Maschinerie,
  `analytics.service.ts runMonteCarloSimulation`) über die Annahme-Inputs
  → Ausweis als **p10 / p50 / p90**, nie als Einzelzahl.

### UC-WVA-001d — Compliance-Check `[ERWEITERUNG der Policy-Engine]`
Struktur-basierte Prüfung des importierten Workflow-Graphen gegen Policies:
- **Datenfluss-Checks** (Graph-Traversal in Neo4j entlang `flow`-Kanten):
  z. B. „Node-Kategorie *Datenbank/CRM* fließt in Node-Kategorie *LLM (US-Anbieter)*"
  → DSGVO-Befund (Drittlandübermittlung, Art. 44 ff.).
- **Node-Checks** (vorhandene Policy-Rule-Evaluation auf `metadata.n8nType`):
  z. B. LLM-Node mit Entscheidungscharakter → EU-AI-Act-Flag (Transparenz-/Risikoklasse),
  Credentials-Hygiene, verbotene Node-Typen laut interner Policy.
- Ergebnis: Befundliste mit Schweregrad je Workflow, gespeichert als
  `PolicyViolation` (vorhandenes Modell), im Zertifikat zusammengefasst als
  Compliance-Status (bestanden / Auflagen / durchgefallen).

### UC-WVA-001e — Wert-Zertifikat & Gegenzeichnung `[NEU]`
Exportierbarer Report (PDF/Web-Link) pro Workflow: Wertspanne, Vertrauensstufe,
Telemetrie-Historie, Compliance-Status, Annahmen transparent ausgewiesen.
Gegenzeichnung der Baseline durch Auftraggeber/Sponsor = Notar-Handlung nach
UC-CERT-001-Muster (`certifiedBy`/`certifiedAt` auf den Annahme-Feldern).

### UC-WVA-001f — Benchmarking `[SPÄTER — nicht v1]`
Anonymisierter Vergleich („dein Workflow liegt im Top-Quartil seiner Kategorie").
Braucht kritische Masse an Daten; bewusst nach v1 verschoben.

## 4. Das dreistufige Vertrauensmodell (Kern des Designs)

| Stufe | Name | Datenlage | Provenance-Abbildung | Aussagekraft |
|---|---|---|---|---|
| **1** | Deklariert | Builder gibt alle Inputs selbst an | `provenance: 'user'` | Rechner, kein Nachweis — UI kennzeichnet unübersehbar „unverifiziert" |
| **2** | Telemetrie-verifiziert | Läufe/Quote/Laufzeit aus n8n-Executions; nur Baseline (manuelle Dauer, Stundensatz) bleibt Annahme | Telemetrie-Felder `provenance: 'import'` + `sourceRef` (Instanz-URL) + `importedAt` | Belastbar für Pitch & Report |
| **3** | Gegengezeichnet | Wie 2, zusätzlich Baseline durch Auftraggeber bestätigt | `certifiedBy`/`certifiedAt` auf Baseline-Feldern (UC-CERT-001) | Zertifikat — „in barer Münze einforderbar" |

Das vorhandene Trust-Spine-System (UC-PROV-001) bildet alle drei Stufen **ohne
Schema-Erweiterung der Provenance-Typen** ab. Die Vertrauensstufe eines Scores ist
die *niedrigste* Stufe seiner Eingangsgrößen (Kette ist so stark wie das schwächste Glied).

## 5. Requirements

### 5.1 Funktionale Requirements

Kennzeichnung: `[HAVE]` existiert, `[EXT]` Erweiterung von Bestehendem, `[NEW]` Neubau.
Priorität nach MoSCoW.

| ID | Requirement | Prio | Status | Andockpunkt |
|---|---|---|---|---|
| FR-WVA-01 | n8n-Workflows inkl. Nodes + Verbindungen als Elemente importieren | Must | `[HAVE]` | `n8n.connector.ts` |
| FR-WVA-02 | Execution-Daten pro Workflow abrufen (Status, Timestamps), API-seitig paginiert | Must | `[NEW]` | neuer Fetch in `n8n.connector.ts` (`/api/v1/executions`) |
| FR-WVA-03 | Execution-Aggregate fortlaufend persistieren: `runsTotal`, `runsPerMonth`, `successRate`, `avgDurationMs`, `telemetrySince`, `lastSyncAt` — monoton, pruning-fest | Must | `[NEW]` | neues Mongo-Modell `WorkflowTelemetry` (keyed workspaceId+n8nWorkflowId) |
| FR-WVA-04 | Periodischer Sync über vorhandenen Scheduler; manueller Sync-Trigger zusätzlich | Must | `[EXT]` | `sync-scheduler.service.ts`, `syncIntervalMinutes` |
| FR-WVA-05 | Baseline-Erfassung pro Workflow: manuelle Dauer/Lauf (min), Stundensatz (€/h), optional Häufigkeit vor Automatisierung — mit Provenance | Must | `[NEW]` | neue Felder am Workflow-Element / UI-Formular |
| FR-WVA-06 | Wertbeitrag-Berechnung nach Formel §3c mit p10/p50/p90 | Must | `[EXT]` | `analytics.service.ts` (Monte-Carlo, N8N-Kostenmodell), `smart-cost.service.ts` |
| FR-WVA-07 | Vertrauensstufe je Score automatisch ableiten (min. Stufe der Inputs) und überall mit ausweisen | Must | `[NEW]` | Trust-Spine-Felder auslesen |
| FR-WVA-08 | Betriebskosten des Workflows schätzen (Node-Kategorien → Benchmark; LLM-Nodes gesondert) | Should | `[EXT]` | `smart-cost.service.ts`, `technology-benchmarks.constants.ts` |
| FR-WVA-09 | Compliance-Node-Checks: Policy-Rules gegen `metadata.n8nType` + Node-Kategorie | Must | `[EXT]` | `policy-evaluation.service.ts`, `compliance.service.ts` |
| FR-WVA-10 | Compliance-Datenfluss-Checks: Pfad-Traversal Quelle→Senke über `flow`-Kanten (z. B. Personendaten-Quelle → US-LLM) | Should | `[NEW]` | Neo4j-Cypher, Muster aus `policy-graph.service.ts` |
| FR-WVA-11 | Policy-Seed „Workflow-Grundschutz": DSGVO-Drittland, EU-AI-Act-Transparenz, Credentials-Hygiene | Should | `[EXT]` | `seed-policies.ts` |
| FR-WVA-12 | Wert-Report pro Workflow als Web-Ansicht + PDF-Export: Spanne, Stufe, Telemetrie-Verlauf, Compliance-Status, Annahmen offen ausgewiesen | Must | `[EXT]` | `report.service.ts`, pdf-Skill |
| FR-WVA-13 | Gegenzeichnung der Baseline durch zweiten User (Rolle Sponsor) — Notar-Handlung, unveränderlich, auditiert | Should | `[EXT]` | UC-CERT-001-Mechanik (`certifiedBy`), `createAuditEntry` |
| FR-WVA-14 | Teilbarer Read-only-Link auf den Report (tokenisiert, widerrufbar) | Should | `[NEW]` | neues Route-Modul |
| FR-WVA-15 | Portfolio-Sicht: alle Workflows eines Workspace mit Wert, Stufe, Compliance-Ampel, Summenzeile | Could | `[EXT]` | `portfolio.service.ts` |
| FR-WVA-16 | Benchmarking / Quartils-Vergleich über Workspaces (anonymisiert) | Won't (v1) | — | UC-WVA-001f |
| FR-WVA-17 | Szenario-Integration: Wertbeitrag als MCDA-Kriterium in Szenario-Rankings | Won't (v1) | — | `scenario.service.ts` (Naht existiert) |

### 5.2 Nicht-funktionale Requirements

| ID | Requirement | Begründung |
|---|---|---|
| NFR-WVA-01 | **Keine Payload-Daten speichern.** Vom Executions-Endpoint werden ausschließlich Metadaten (id, status, startedAt, stoppedAt, workflowId) verarbeitet; Execution-*Inhalte* (Nutzdaten) werden nie abgerufen/persistiert (`includeData=false`) | Execution-Payloads enthalten potenziell personenbezogene Daten — die Plattform darf nicht selbst zum DSGVO-Problem werden |
| NFR-WVA-02 | Mandantentrennung: Telemetrie strikt workspace-isoliert (Muster: Qdrant `elements-{workspaceId}`) | Wert-/Telemetriedaten sind wettbewerbsrelevant |
| NFR-WVA-03 | n8n-API-Keys verschlüsselt at rest (vorhandene `encryptCredentials`-Mechanik) | bestehender Standard |
| NFR-WVA-04 | Score-Transparenz: Jede Zahl im Report trägt Herkunft (gemessen/deklariert/gegengezeichnet) und Berechnungsformel ist einsehbar | Glaubwürdigkeit = Produkt (§1) |
| NFR-WVA-05 | Unveränderlichkeit: Gegengezeichnete Baselines und ausgestellte Zertifikate sind versioniert und nicht nachträglich editierbar; Änderung ⇒ neue Version, alte bleibt referenzierbar | Zertifikats-Integrität |
| NFR-WVA-06 | Audit: Sync-Läufe, Baseline-Änderungen, Zertifikats-Ausstellung, Link-Freigaben → `createAuditEntry` | bestehender Standard für sicherheitsrelevante Aktionen |
| NFR-WVA-07 | Sync-Robustheit: n8n-Instanz nicht erreichbar ⇒ Aggregat bleibt stehen, Lücke wird als solche ausgewiesen (kein stilles Weiterzählen) | Ehrlichkeit der Telemetrie-Historie |
| NFR-WVA-08 | Sync-Last: Executions-Abruf inkrementell (Cursor ab `lastSyncAt`), Rate-Limit-schonend | große Instanzen (>10k Executions/Monat) |

### 5.3 Datenmodell-Änderungen

**Neues Mongo-Modell `WorkflowTelemetry`** (pruning-feste Aggregation):
```
workspaceId, projectId, n8nWorkflowId, connectorConfigId
runsTotal, runsSucceeded, runsFailed          // monotone Zähler
avgDurationMs (gleitend), monthlyBuckets[]     // {yyyymm, runs, failures, avgMs}
telemetrySince, lastSyncAt, lastExecutionSeen  // Cursor + Lückenerkennung
gaps[]                                         // {from, to} — Sync-Ausfälle
```

**Erweiterung Workflow-Element** (nur Baseline + abgeleiteter Score; Telemetrie bleibt im eigenen Modell):
```
metadata.wva = {
  manualMinutesPerRun, hourlyRate,             // Annahmen (ProvenanceFields je Feld)
  valueP10, valueP50, valueP90,                // €/Jahr, berechnet
  trustTier: 1|2|3, complianceStatus,          // abgeleitet
  computedAt, formulaVersion
}
```
Kein Schema-Bruch: alles additiv, `metadata`-Bag bzw. neues Modell (Muster
`CriticalityCache` — berechnete Werte getrennt von Stammdaten).

## 6. Gap-Analyse (Zusammenfassung der Code-Tiefenprüfung)

| Baustein | Zustand | Fundstelle |
|---|---|---|
| Workflow-Struktur-Import | ✅ vorhanden | `n8n.connector.ts` (Workflows + Nodes + Kanten, `n8nWorkflowId` als Anker) |
| Periodischer Connector-Sync | ✅ vorhanden | `sync-scheduler.service.ts` + `ConnectorConfig.syncIntervalMinutes` |
| Execution-/Telemetrie-Abruf | ❌ fehlt komplett | kein Treffer auf `executions` im gesamten Server-Code |
| n8n-Kostenmodell (Stundensatz, Node-Kategorien, Aufwands-Heuristik) | ✅ vorhanden | `analytics.service.ts:401 ff.`, `roadmap.service.ts:896` |
| Betriebskosten-Benchmarks | ✅ vorhanden | `smart-cost.service.ts` (matcht bereits auf `n8nType`) |
| Unsicherheits-Rechnung (beta-PERT Monte-Carlo) | ✅ vorhanden | `analytics.service.ts runMonteCarloSimulation` |
| Provenance/Zertifizierung (3-Stufen-Modell) | ✅ vorhanden | `architecture.types.ts:121–129` (UC-PROV-001, UC-CERT-001) |
| Policy-Engine (Feld-/Scope-Rules, Violations, Neo4j-Sync, WebSocket) | ✅ vorhanden | `policy-evaluation.service.ts`, `policy-graph.service.ts` |
| Datenfluss-Pfad-Checks (Quelle→Senke) | ❌ fehlt | Neo4j-Traversal neu, Kanten (`flow`) liegen aber schon im Graphen |
| Report/PDF | ✅ Grundlage vorhanden | `report.service.ts`, pdf-Skill |
| Teilbarer Public-Link | ❌ fehlt | neu |

**Netto-Neubau in v1:** Executions-Fetch + `WorkflowTelemetry`-Aggregation (FR-02/03),
Baseline-Erfassung (FR-05), Score-Komposition mit Vertrauensstufe (FR-06/07),
Report-Zusammenstellung (FR-12). Alles andere ist Erweiterung.

## 7. Risiken & Gegenmaßnahmen

| ID | Risiko | Gegenmaßnahme |
|---|---|---|
| R-1 | **Score-Gaming** (geschönte Baseline) | Vertrauensstufen unübersehbar; Stufe 1 nie als „Nachweis" bezeichnet; Spannen statt Punktwerte; Formel offen |
| R-2 | **Baseline bleibt kontrafaktisch** (manuelle Dauer ist Annahme) | Monte-Carlo-Spanne; Gegenzeichnung (Stufe 3) als einziger Weg zum „Zertifikat" |
| R-3 | **n8n-Pruning frisst Historie** | fortlaufende Aggregation ab Anbindung; Lücken ehrlich ausweisen (NFR-07) |
| R-4 | **Interner Gehalts-Konflikt** („Plattform sagt, ich bin X wert") | Framing für interne Builder: Portfolio/Sichtbarkeit, nicht Forderungsbeleg; Sprache in UI/Report entsprechend |
| R-5 | **Plattform speichert versehentlich Personendaten** aus Executions | NFR-01 hart: nur Metadaten, `includeData=false`, Review-Gate im Code |
| R-6 | **Falsch-positive Compliance-Befunde** entwerten den Check (vgl. Motivation-Layer-Lektion in `policy-evaluation.service.ts`) | Checks nur gegen Workflow-/Node-Elemente scopen; Schweregrade konservativ; „Hinweis" ≠ „Verstoß" |
| R-7 | **Stundensatz-Streit** (wessen Satz gilt?) | Default aus vorhandenem Modell (100 €/h), überschreibbar, Herkunft ausgewiesen; bei Stufe 3 vom Sponsor bestätigt |

## 8. Offene Fragen (vor Umsetzungsstart zu klären)

1. **Zielgruppen-Schnitt v1:** Nur externe Builder (eigener Workspace, eigene n8n-Instanz) — oder auch interner Modus im Unternehmens-Workspace? (Empfehlung: v1 extern-first, ein Workspace = ein Builder/Agentur.)
2. **Monetarisierung:** Freemium (Stufe 1 gratis als Rechner/Lead-Magnet, Stufe 2+3 bezahlt)? Beeinflusst, wo die Paywall im Flow sitzt.
3. **Zertifikats-Identität:** Läuft das Zertifikat auf die Person (Builder-Profil) oder den Workspace? Relevant für den „Portfolio über mehrere Kunden"-Fall.
4. **EU-AI-Act-Tiefe v1:** Nur Transparenz-Flag für LLM-Nodes (billig, robust) oder echte Risikoklassen-Heuristik (aufwendig, fehleranfällig)? (Empfehlung: v1 nur Flag + Hinweis.)
5. **Baseline-Gegenzeichnung ohne Account?** Sponsor ist oft kein Plattform-Nutzer — E-Mail-basierte Bestätigung mit tokenisiertem Link vs. Pflicht-Account. (Empfehlung: tokenisierter Link, wie FR-14.)

## 9. Schnitt für v1 (Vorschlag)

**v1 = FR-01…07 + FR-09 + FR-12 (Must-Menge):** Import (da), Telemetrie-Sync (neu),
Baseline-Erfassung, Score p10/p50/p90 mit Vertrauensstufe, Node-Compliance-Checks,
Report. → Damit ist Stufe 1 und Stufe 2 komplett erlebbar.
**v1.1:** Gegenzeichnung (FR-13), Public-Link (FR-14), Datenfluss-Checks (FR-10), Policy-Seed (FR-11).
**v2:** Portfolio-Sicht, Benchmarking, Szenario-/MCDA-Integration, Enterprise-Impact-Score-Brücke.

### Akzeptanzkriterien v1 (Auszug)
- [ ] Nach Anbindung einer n8n-Instanz mit ≥1 aktivem Workflow liegen nach dem ersten Sync `runsTotal`, `successRate`, `avgDurationMs` vor und wachsen bei Folge-Syncs monoton.
- [ ] Ein Workflow ohne Baseline zeigt keinen €-Wert, sondern die Aufforderung zur Baseline-Erfassung.
- [ ] Score wird ausschließlich als Spanne (p10/p50/p90) mit Vertrauensstufe angezeigt; Stufe 1 trägt sichtbar „unverifiziert".
- [ ] Sync-Ausfall ≥1 Intervall erzeugt einen `gaps`-Eintrag, der im Report erscheint.
- [ ] Es existiert kein Codepfad, der Execution-Payloads abruft oder speichert (Test + Review-Checkliste).
- [ ] Ein Workflow mit LLM-Node und Datenbank-Quelle erzeugt mindestens einen Compliance-Hinweis.
