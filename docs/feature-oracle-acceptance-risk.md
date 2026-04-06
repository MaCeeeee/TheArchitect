# Feature: Oracle — Acceptance Risk Assessment

> **Modul:** Oracle  
> **Version:** 3.0  
> **Dokumentenklassifikation:** KSU C3 — VERTRAULICH | BSI-Schutzbedarf: hoch  
> **Compliance:** EU AI Act 2024/1689, EU Data Act 2023/2854

---

## 1. Was macht Oracle?

Oracle ist eine **1-Runden-Stakeholder-Simulation** zur Bewertung des Akzeptanzrisikos von Architektur-Änderungsvorschlägen. Fünf KI-gesteuerte Stakeholder-Personas analysieren einen Proposal unabhängig voneinander und geben ein gewichtetes Urteil ab.

**Kernfrage:** *„Wird diese Änderung von den relevanten Stakeholdern akzeptiert oder blockiert?"*

Oracle liefert innerhalb von 5-10 Sekunden ein quantifiziertes Ergebnis (Score 0-100) mit Begründungen, Widerstandsfaktoren und konkreten Handlungsempfehlungen — ohne den Aufwand einer vollständigen MiroFish-Mehrrundensimulation.

### Einordnung im Toolset

| Tool | Zweck | Aufwand | Wann verwenden |
|---|---|---|---|
| **Oracle** | Akzeptanzrisiko-Schnellcheck | ~5 LLM-Calls, 5-10s | Vor dem Pitch, Go/No-Go-Entscheidung |
| **Scenario Generator** | KI-generierte alternative Proposals | ~1 LLM-Call + opt. Re-Assess | Nach Oracle „contested" oder „rejected" |
| **MiroFish** | Stakeholder-Verhandlungssimulation | ~25-50+ LLM-Calls, Minuten | Nach Oracle „contested", tiefe Analyse |

---

## 2. Technologische Voraussetzungen

### 2.1 LLM-API-Zugang (ZWINGEND)

Oracle benötigt Zugang zu einem Large Language Model über eine API-Schnittstelle. Es werden **mindestens 6 LLM-Aufrufe pro Assessment** durchgeführt (5 Stakeholder-Bewertungen + 1 Mitigation-Generierung).

**Unterstützte Provider:**

| Provider | Environment Variable | Standard-Modell | Empfehlung |
|---|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o-mini` | Schneller, günstiger |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` | Höhere Reasoning-Qualität |

**Konfiguration in `.env`:**
```bash
# Mindestens EINER der beiden Keys muss gesetzt sein:
OPENAI_API_KEY=sk-...
# ODER
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Modell-Override
OPENAI_MODEL=gpt-4o          # Default: gpt-4o-mini
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Default: claude-haiku-4-5-20251001
```

**Fallback-Logik:** OpenAI wird bevorzugt geprüft. Ist kein Key gesetzt, gibt die API `503 Service Unavailable` mit Hinweis zurück.

**Geschätzte Kosten pro Assessment:**
- gpt-4o-mini: ~$0.01-0.03
- gpt-4o: ~$0.05-0.15
- claude-haiku: ~$0.01-0.03
- claude-sonnet: ~$0.10-0.30

### 2.2 Architektur-Daten im Projekt (ZWINGEND)

Oracle bewertet Änderungen **im Kontext der existierenden Architektur**. Folgende Daten müssen im Projekt vorhanden sein:

| Datenquelle | Speicher | Zweck | Minimum |
|---|---|---|---|
| **Architektur-Elemente** | Neo4j | Betroffene Komponenten mit Metadaten | ≥1 Element |
| **Verbindungen/Abhängigkeiten** | Neo4j | Dependency-Graph für Impact-Analyse | Empfohlen |
| **Element-Attribute** | Neo4j Properties | Kosten, Maturity, Risk, Error Rate, User Count | Empfohlen |
| **Business-Layer-Verknüpfungen** | Neo4j | Business Capability Mapping | Optional |

**Wichtig:** Je mehr Metadaten die Elemente haben (annualCost, maturityLevel, riskLevel, errorRatePercent, technicalDebtRatio, userCount), desto präziser werden die Stakeholder-Bewertungen. Elemente ohne Metadaten erhalten Defaultwerte.

### 2.3 Datenbanken

| Datenbank | Zweck |
|---|---|
| **MongoDB** | Speicherung der Oracle-Assessments (Proposals, Verdicts, Audit Trails) |
| **Neo4j** | Graph-Abfragen für Element-Details, Dependencies, Business Capabilities |
| **Redis** | Session-Management (für authentifizierte API-Calls) |

### 2.4 Authentifizierung

Oracle-Endpunkte erfordern:
- **JWT-Token** (Access Token) oder **API-Key** (`ta_`-Prefix)
- **Projekt-Zugriff:** Mindestens `viewer`-Rolle im Projekt
- **Permission:** `ANALYTICS_SIMULATE`

---

## 3. Input-Format (Proposal)

### 3.1 API-Endpunkt

```
POST /api/projects/:projectId/oracle/assess
```

### 3.2 Request Body (JSON)

```json
{
  "title": "Migrate MongoDB to PostgreSQL",
  "description": "Replace MongoDB document store with PostgreSQL for all application data. Requires schema redesign from document-based to relational model, ORM migration from Mongoose to Prisma, and data migration scripts for ~500k documents.",
  "affectedElementIds": [
    "csv-1775415356867-uomtyfn",
    "csv-1775415356867-ci0vkpy"
  ],
  "changeType": "migrate",
  "estimatedCost": 120000,
  "estimatedDuration": 4,
  "targetScenarioId": "optional-scenario-id",
  "customStakeholders": [
    {
      "name": "Head of HR",
      "role": "Personalleitung — verantwortlich für Change-Fatigue der Mitarbeitenden",
      "stakeholderType": "hr",
      "weight": "advisory",
      "riskThreshold": "medium",
      "priorities": ["employee_retention", "training_budget"],
      "visibleLayers": ["business", "strategy"],
      "context": "Aktuell laufen bereits 3 parallele Transformationsprojekte"
    }
  ]
}
```

### 3.3 Feld-Validierung (Zod-Schema)

| Feld | Typ | Pflicht | Constraints |
|---|---|---|---|
| `title` | string | ✅ | 1-200 Zeichen |
| `description` | string | ✅ | 10-3000 Zeichen |
| `affectedElementIds` | string[] | ✅ | Mindestens 1 Element-ID |
| `changeType` | enum | ✅ | `retire`, `migrate`, `consolidate`, `introduce`, `modify` |
| `estimatedCost` | number | — | ≥ 0 (Euro/Dollar) |
| `estimatedDuration` | number | — | 1-120 Monate |
| `targetScenarioId` | string | — | Referenz auf Szenario |
| `customStakeholders` | array | — | Max. 5, je mit name/role/type/weight/priorities/layers |

### 3.4 Change Types erklärt

| Change Type | Beschreibung | Typischer Score-Bereich |
|---|---|---|
| `retire` | System/Komponente abschalten | 15-35 (meist akzeptiert) |
| `consolidate` | Mehrere Systeme zusammenführen | 35-55 (contested) |
| `migrate` | Technologie-Wechsel bei gleichem Zweck | 40-60 (contested) |
| `introduce` | Komplett neues System einführen | 45-65 (oft contested) |
| `modify` | Bestehende Komponente anpassen | 20-45 (meist akzeptiert) |

---

## 4. Stakeholder-Personas (KI-Agenten)

### 4.1 Die 5 Preset-Personas

| Persona | Stakeholder-Typ | Gewicht | Risk Threshold | Sichtbare Layer | Prioritäten |
|---|---|---|---|---|---|
| **CTO** | c_level | 30% | high | Alle 5 Layer | Innovation, Risikoreduktion, Digitalisierung |
| **Business Unit Lead** | business_unit | 25% | medium | Strategy, Business | Kosten, Effizienz, Time-to-Market |
| **IT Operations Manager** | it_ops | 20% | low | Application, Technology | Stabilität, Security, Wartungskosten |
| **Head of Data & Analytics** | data_team | 15% | medium | Information, Application, Technology | Datenqualität, Compliance, Integration |
| **CISO** | c_level | 10% | low | Application, Technology, Information | Security, Compliance, Risikoreduktion |

### 4.2 Gewichtungs-Normalisierung

- Preset-Gewichte summieren sich auf 100%
- Bei Custom-Stakeholdern: `voting` = 15%, `advisory` = 5%
- Alle Gewichte werden automatisch auf Summe = 1.0 normalisiert

### 4.3 Risk Threshold → Scoring-Verhalten

| Threshold | Scoring-Guidance |
|---|---|
| **HIGH** (CTO) | Konservativ. Score 65-80 für gemischte Trade-offs. Unter 40 nur bei strategischen Kernbedrohungen. |
| **MEDIUM** (Business, Data) | Ausgewogen. Score 50-70. Kein „safe middle" — klare Position beziehen. |
| **LOW** (IT Ops, CISO) | Streng. Fügt die Änderung Risiko HINZU → Score 20-40. REDUZIERT sie Risiko → Score 60-80. |

---

## 5. Output-Format (Verdict)

### 5.1 Response Body (JSON)

```json
{
  "success": true,
  "assessmentId": "69d2d4bc95786436444f2651",
  "data": {
    "acceptanceRiskScore": 58,
    "riskLevel": "medium",
    "overallPosition": "contested",
    "agentVerdicts": [
      {
        "personaId": "cto",
        "personaName": "CTO",
        "stakeholderType": "c_level",
        "position": "approve",
        "reasoning": "Strategisch sinnvoll für Skalierbarkeit...",
        "concerns": ["Migration timeline too aggressive"],
        "acceptanceScore": 75
      }
    ],
    "resistanceFactors": [
      {
        "factor": "Operational complexity increase",
        "severity": "high",
        "source": "IT Operations Manager",
        "description": "..."
      }
    ],
    "mitigationSuggestions": [
      "Implement phased rollout starting with non-critical services..."
    ],
    "fatigueForecast": {
      "projectedDelayMonths": 2.8,
      "budgetAtRisk": 25812,
      "overloadedStakeholders": ["IT Operations Manager", "CISO"]
    },
    "durationMs": 7290,
    "timestamp": "2026-04-05T21:30:00.000Z"
  }
}
```

### 5.2 Score-Interpretation

| Score | Risk Level | Position | Bedeutung |
|---|---|---|---|
| 0-30 | low | likely_accepted | Breite Zustimmung erwartet |
| 31-55 | medium | contested | Geteilte Meinungen — Nacharbeit nötig |
| 56-75 | high | contested | Starker Widerstand — Kompromisse erforderlich |
| 76-100 | critical | likely_rejected | Blockade erwartet — grundlegend überarbeiten |

---

## 6. EU AI Act — Compliance-Anforderungen

### ⚠️ WICHTIG: Nutzer-Commitment erforderlich

Oracle ist ein **KI-gestütztes Entscheidungsunterstützungssystem** und unterliegt dem EU AI Act 2024/1689. Die folgenden Punkte sind **rechtlich bindend** und erfordern explizites Handeln des Nutzers.

### 6.1 Art. 52 — Transparenzpflicht

**Der Nutzer muss wissen und anerkennen:**
- Oracle-Ergebnisse werden von einem KI-System generiert (Large Language Model)
- Die Stakeholder-Personas sind **simuliert**, nicht real
- Bewertungen basieren auf Wahrscheinlichkeiten, nicht auf Fakten
- Das System klassifiziert sich selbst als **„limited risk"** gemäß Art. 6(2)

> **→ In der UI wird vor jedem Assessment ein Transparenzhinweis angezeigt. Der Nutzer bestätigt durch Absenden des Proposals, dass er dies zur Kenntnis genommen hat.**

### 6.2 Art. 14 — Menschliche Aufsicht (Human Oversight)

**Jedes Oracle-Assessment startet mit dem Status `pending_review`.**

Das bedeutet: **Das Ergebnis darf NICHT als alleinige Entscheidungsgrundlage verwendet werden**, solange kein menschlicher Reviewer das Assessment geprüft und seinen Status aktualisiert hat.

**Commitment des Nutzers:**

1. **Ergebnis prüfen** — Der Nutzer muss die Stakeholder-Begründungen, Resistance Factors und Mitigations durchlesen und auf Plausibilität prüfen
2. **Status setzen** — Der Nutzer muss den Human-Oversight-Status aktiv ändern:
   - `reviewed` — „Ich habe das Ergebnis gelesen und verstanden"
   - `approved` — „Ich übernehme das Ergebnis als Entscheidungsgrundlage"
   - `rejected` — „Das Ergebnis ist nicht verwertbar"
3. **Notizen hinterlegen** — Bei `approved` oder `rejected` sollte eine Begründung erfasst werden

> **→ Solange der Status auf `pending_review` steht, ist das Assessment ein Entwurf — keine Entscheidung.**

### 6.3 Art. 12 — Protokollierung (Audit Trail)

Jedes Assessment protokolliert automatisch:

| Datum | Was wird gespeichert | Zweck |
|---|---|---|
| **Initiator** | userId, userName, userEmail, authMethod, apiKeyPrefix | Wer hat die Bewertung ausgelöst? (DSGVO Art. 6(1)(c)) |
| **Kontext-Snapshot** | SHA-256-Hash des Architektur-Zustands, Element-/Verbindungsanzahl | Welche Datengrundlage bestand zum Zeitpunkt T? |
| **System-Prompts** | Vollständiger Prompt pro Stakeholder-Persona | Was hat die KI als Anweisung erhalten? |
| **Raw LLM Responses** | Vollständige, ungefilterte KI-Antworten | Was hat die KI tatsächlich geantwortet? |
| **Modell-Parameter** | Provider, Modell, Temperature, MaxTokens, Fallback-Status | Welche KI-Konfiguration wurde verwendet? |
| **Scoring-Methodik** | Gewichtungen, Rohwerte, Rundungen | Wie wurde der Score berechnet? |

### 6.4 Art. 13 — Transparenz der Entscheidungslogik

Die vollständige Entscheidungskette ist nachvollziehbar:

```
Input (Proposal) → Prompt (pro Persona) → LLM Response → Parsing → Score → Gewichtung → Aggregation
```

Jeder Schritt ist im **JSON-Export** und im **PDF-Report** dokumentiert, inklusive:
- Der exakte System-Prompt, der an das LLM gesendet wurde
- Die ungefilterte Antwort des LLM
- Die gefilterte Architektur-Kontext, den jede Persona „sehen" konnte
- Die Gewichtung und gewichtete Risikobeiträge

### 6.5 Dokumentenklassifikation

Alle Oracle-Reports (PDF und JSON) sind klassifiziert nach **BSI IT-Grundschutz**:

```
KSU: C3 — VERTRAULICH | BSI-Schutzbedarf: hoch | Nur für internen Gebrauch
```

**Begründung:** Die Reports enthalten:
- Interne Architektur-Details (Kosten, Risiken, Schwachstellen)
- KI-generierte Bewertungen interner Entscheidungsprozesse
- Vollständige LLM-Prompts mit Unternehmensdaten
- Personenbezogene Daten (Initiator-Identität)

---

## 7. Export-Formate

### 7.1 PDF-Report

- **Dateiname:** `TA-ORA_{Projektname}_{Datum}_{ID}.pdf`
- **Inhalt:** Executive Summary, Stakeholder Verdicts, Resistance Factors, Mitigations, Fatigue Forecast, EU AI Act Audit Trail, vollständige System-Prompts und LLM-Responses
- **KSU-Banner** auf jeder Seite
- **Endpunkt:** `GET /api/projects/:projectId/oracle/:assessmentId/report/pdf`

### 7.2 JSON-Export (maschinenlesbar)

- **Dateiname:** `TA-ORA_{Projektname}_{Datum}_{ID}.json`
- **Schema:** `oracle_acceptance_risk_assessment v2.0`
- **Zweck:** Import in Datenbanken, Compliance-Systeme, Archivierung
- **Endpunkt:** `GET /api/projects/:projectId/oracle/:assessmentId/report/json`

### 7.3 History

- **Endpunkt:** `GET /api/projects/:projectId/oracle/history`
- **Limit:** Letzte 20 Assessments, sortiert nach Erstellungsdatum (neueste zuerst)

---

## 8. AI Scenario Generator

### 8.1 Was macht der Scenario Generator?

Der AI Scenario Generator nimmt ein **contested oder rejected** Oracle-Verdict und generiert automatisch 3 alternative Architektur-Vorschläge, die gezielt die stärksten Stakeholder-Widerstände adressieren. Jede Alternative ist ein vollständiger Proposal mit angepasstem Scope, Kosten, Dauer und einem transparenten Anforderungs-Diff.

**Der Generator ist immer verfügbar** — bei akzeptierten Verdicts optimiert er weiter (Kosten/Dauer reduzieren), bei contested/rejected strukturiert er fundamental um.

### 8.2 Workflow

```
Oracle Verdict → Alternativen generieren → Alternativen prüfen → Re-Assess in Oracle → Vergleich in Scenario Engine
```

1. **Generieren:** „Generate Alternatives" bei jedem Assessment klicken (History oder Assess-Tab)
2. **Prüfen:** Jede Alternative zeigt Scope-Änderungen, Kosten-/Dauer-Deltas, adressierte Blocker und Trade-offs
3. **Re-Assess:** „Re-assess in Oracle" füllt das Assess-Formular mit den Daten der Alternative vor — prüfen und absenden
4. **Persistenz:** Generierte Alternativen werden am Assessment gespeichert und sind beim nächsten Besuch sichtbar

### 8.3 Inhalt jeder Alternative

| Feld | Beschreibung |
|---|---|
| **Name** | Beschreibender Titel (max. 60 Zeichen) |
| **Strategie** | 1-2 Sätze Zusammenfassung |
| **Change Type** | Darf vom Original abweichen, wenn strategisch begründet |
| **Angepasste Kosten** | Revidierte Kostenschätzung |
| **Angepasste Dauer** | Revidierte Timeline (Monate) |
| **Scope Changes** | Pro-Element-Aufschlüsselung: retained, modified, removed, phased, added |
| **Adressierte Blocker** | Welche Stakeholder/Widerstandsfaktoren entschärft werden |
| **Trade-offs** | Was verloren geht oder abgeschwächt wird |
| **Rationale** | Warum diese Alternative besser für die blockierenden Stakeholder ist |

### 8.4 Anforderungs-Diff (Requirement Diff)

Jede Alternative enthält ein transparentes `requirementDiff`, das dokumentiert was sich geändert hat:

- **Scope Changes:** Welche Elemente entfernt/verschoben/beibehalten/geändert/hinzugefügt werden, mit Begründung
- **Kosten-Delta:** Original vs. Alternative mit Prozent-Änderung
- **Dauer-Delta:** Original vs. Alternative Timeline mit Prozent-Änderung
- **Change Type Delta:** Ob der Change Type geändert wurde
- **Adressierte Blocker:** Welche Stakeholder-Blocker direkt adressiert werden
- **Trade-offs:** Explizite Liste was geopfert wird

### 8.5 Re-Assess-Flow

Klick auf „Re-assess in Oracle" bei einer Alternative:
1. Wechselt zum Assess-Tab
2. Füllt vor: Title, Description, Change Type, Kosten, Dauer
3. Setzt Affected Elements: Alle Original-Elemente **minus** explizit als removed/phased markierte
4. User prüft/passt an und klickt „Consult Oracle" für ein neues Verdict

### 8.6 Optionen

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `maxAlternatives` | number | 3 | Anzahl Alternativen (1-5) |
| `focusStakeholders` | string[] | — | Nur bestimmte Blocker-Personas adressieren |
| `preserveChangeType` | boolean | false | Alternativen müssen gleichen Change Type beibehalten |
| `autoAssess` | boolean | false | Jede Alternative automatisch durch Oracle re-assessen (~20 LLM-Calls) |

### 8.7 API-Endpunkt

```
POST /api/projects/:projectId/oracle/:assessmentId/generate-alternatives
```

**Auth:** JWT/API-Key + `ANALYTICS_SIMULATE`

**Request Body (optional):**
```json
{
  "maxAlternatives": 3,
  "focusStakeholders": ["IT Operations Manager"],
  "preserveChangeType": false,
  "autoAssess": false
}
```

**Geschätzte Kosten:** ~$0.01-0.05 pro Generierung (1 LLM-Call). Mit `autoAssess: true`: ~$0.10-0.50 (zusätzliche Oracle-Assessments pro Alternative).

---

## 9. API-Referenz

| Methode | Endpunkt | Auth | Beschreibung |
|---|---|---|---|
| `POST` | `/api/projects/:projectId/oracle/assess` | JWT/API-Key + `ANALYTICS_SIMULATE` | Neues Assessment durchführen |
| `GET` | `/api/projects/:projectId/oracle/history` | JWT/API-Key + `ANALYTICS_SIMULATE` | Assessment-Historie abrufen |
| `POST` | `/api/projects/:projectId/oracle/:assessmentId/generate-alternatives` | JWT/API-Key + `ANALYTICS_SIMULATE` | Alternative Proposals generieren |
| `GET` | `/api/projects/:projectId/oracle/:assessmentId/report/pdf` | JWT/API-Key | PDF-Report herunterladen |
| `GET` | `/api/projects/:projectId/oracle/:assessmentId/report/json` | JWT/API-Key | JSON-Export herunterladen |

### Error Codes

| Code | Bedeutung |
|---|---|
| `400` | Validation Error — Proposal entspricht nicht dem Schema |
| `401` | Nicht authentifiziert |
| `403` | Keine Berechtigung (fehlende Permission oder Projektzugang) |
| `404` | Assessment oder Projekt nicht gefunden |
| `503` | Kein LLM-API-Key konfiguriert (`OPENAI_API_KEY` oder `ANTHROPIC_API_KEY` fehlt) |

---

## 10. Checkliste: Vor dem ersten Oracle-Assessment

- [ ] **LLM-API-Key** in `.env` gesetzt (`OPENAI_API_KEY` oder `ANTHROPIC_API_KEY`)
- [ ] **Projekt existiert** mit mindestens einem Architektur-Element in Neo4j
- [ ] **Elemente haben Metadaten** (annualCost, maturityLevel, riskLevel — empfohlen für präzise Bewertung)
- [ ] **User ist authentifiziert** und hat `ANALYTICS_SIMULATE`-Permission
- [ ] **User versteht:** Oracle ist KI-gestützt, Ergebnisse sind Empfehlungen, keine Entscheidungen
- [ ] **User versteht:** Jedes Assessment muss manuell reviewed werden (Human Oversight, Art. 14)
- [ ] **User versteht:** Reports sind KSU C3 / VERTRAULICH und dürfen nicht an Externe weitergegeben werden
