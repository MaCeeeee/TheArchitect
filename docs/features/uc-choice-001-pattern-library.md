---
aliases:
  - UC-CHOICE-001
  - Pattern Library
  - Decision Pattern Library
  - Pre-Validated Patterns
tags:
  - feature
  - sprint-3
  - choice-architecture
  - foundation
  - planned
type: use-case
status: code-ready-pending-deploy
sprint: 3
linear_parent: THE-189
linear_reqs:
  - THE-196 (REQ-CHOICE-001.1)
  - THE-197 (REQ-CHOICE-001.2)
  - THE-199 (REQ-CHOICE-001.4)
  - THE-200 (REQ-CHOICE-001.5)
linear_deferred:
  - THE-198 (REQ-CHOICE-001.3 Versionierung) — Sprint 4
related:
  - UC-CHOICE-002 Decision Configurator (downstream)
  - UC-CHOICE-003 Compliance Linting (downstream)
  - UC-CHOICE-004 Smart Defaults (downstream)
  - UC-CHOICE-006 Exception Workflow (downstream)
  - UC-CHOICE-007 Voting & Telemetry (downstream)
implemented: 2026-05-17
owner: Matze Ganzmann
---

# UC-CHOICE-001 — Pre-Validated Pattern Library

> [!success] Foundation für 5 Folge-UCs
> Pattern-Library + Adoption-Telemetrie ist die **Datenquelle** für UC-CHOICE-002 (Configurator), UC-CHOICE-003 (Compliance-Linting), UC-CHOICE-004 (Smart Defaults), UC-CHOICE-006 (Exception Workflow) und vor allem **UC-CHOICE-007 (Voting & Badges)** — der Adoption-Counter speist die "Most Used"/"Trending"-Badges.

## TL;DR

Kuratierte Bibliothek vorgeprüfter Architektur-Entscheidungs-Patterns ("Managed Message Queue", "Managed OAuth Provider", "OpenTelemetry Stack", …) mit Compliance-Score, Cost-Range, Risk-Level und Lifecycle-Status. Architekten wählen statt zu rätseln; jede Adoption wird auditiert und als Telemetrie für Folge-UCs persistiert.

## Workflow

1. Architekt klickt **📚 Pattern Library** Icon in der Toolbar
2. Browse-Modal zeigt 6 Seed-Patterns als Cards, gefiltert nach Kategorie (messaging, security, observability, …)
3. Jede Card zeigt: Name, Beschreibung, Compliance-Bars (TOGAF/DORA/NIS2), Cost (€/€€/€€€), Risk-Pill, Lifecycle-Badge
4. **"Why this?"**-Tooltip enthüllt die Detector-Begründung aus dem AI Advisor
5. **Apply Pattern**-Klick erzeugt Adoption-Event + Audit-Log-Entry
6. Re-Apply ist idempotent erlaubt (Multi-Project-Adoption tracking)

## Architektur

```mermaid
graph LR
  UI[PatternCard + DecisionPatternLibrary Modal] -- authFetch --> API[/api/decision-patterns]
  API -- find/findOne --> Mongo[(DecisionPattern Collection)]
  API -- create --> Adopt[(PatternAdoption Collection)]
  API -- createAuditEntry --> Audit[(AuditLog Collection)]
  Seed[seedDecisionPatterns startup-hook] -- upsert idempotent --> Mongo
  Stats[/:slug/stats Endpoint] -- count + distinct --> Adopt
```

**Komponenten:**

| Layer | Datei | Verantwortung |
|---|---|---|
| Shared-Types | `packages/shared/src/types/decision-pattern.types.ts` | `DecisionPattern`, `PatternAdoptionEvent`, `PatternAdoptionStats` |
| DB-Model | `packages/server/src/models/DecisionPattern.ts` | Mongoose Schema mit Compliance/Cost/Risk/Lifecycle |
| DB-Model | `packages/server/src/models/PatternAdoption.ts` | Telemetrie-Collection mit Compound-Index |
| Seed | `packages/server/src/seeds/decision-patterns.seed.ts` | 6 DACH-relevante Patterns, idempotent via `updateOne({slug}, $setOnInsert)` |
| REST | `packages/server/src/routes/decisionPatterns.routes.ts` | 4 Endpoints (list/get/adopt/stats) |
| API-Client | `packages/client/src/services/decisionPatterns.api.ts` | authFetch-basierter Client |
| Hook | `packages/client/src/hooks/useDecisionPatterns.ts` | Filter + Reload + Adopt |
| UI-Card | `packages/client/src/components/patterns/PatternCard.tsx` | Compliance-Bars, Why-this-Toggle, Apply-Button |
| UI-Modal | `packages/client/src/components/patterns/DecisionPatternLibrary.tsx` | Category-Tabs, Search, Chernev-calibrated Show-More |

## Acceptance Criteria-Status

| REQ | AC | Status |
|---|---|---|
| 001.1 | Max 5 sichtbare Optionen, "Show More" Affordance | ✅ Implementiert (`INITIAL_VISIBLE = 5`) |
| 001.1 | Sortierung nach Recommendation-Score DESC | ⚠️ Sortiert by name; Score-Sort kommt mit UC-CHOICE-007 |
| 001.2 | Compliance/Cost/Risk/Lifecycle pro Card sichtbar | ✅ Alle 4 Felder gerendert |
| 001.2 | Fehlende Daten als "—" markiert, nicht versteckt | ✅ ComplianceBar handhabt undefined |
| 001.4 | `patternAdoptions`-Collection existiert | ✅ Mongoose model + Compound-Index |
| 001.4 | Adoption-Event bei jedem Apply-Klick | ✅ POST `/:slug/adopt` |
| 001.4 | Stats-Endpoint mit total/last30Days/uniqueProjects | ✅ GET `/:slug/stats` |
| 001.5 | "Why this?"-Tooltip mit Detector-Name + Begründung | ✅ Collapsible Section |
| 001.5 | A11y: Tooltip via Keyboard erreichbar | ✅ Button-Element, Tab + Enter |

## 6 Seed-Patterns

| Slug | Category | Lifecycle | Compliance (TOGAF/DORA/NIS2) |
|---|---|---|---|
| `managed-message-queue` | messaging | approved | 85/90/80 |
| `managed-oauth-provider` | security | approved | 80/95/90 |
| `opentelemetry-stack` | observability | approved | 75/85/70 |
| `managed-api-gateway` | integration | approved | 80/80/75 |
| `managed-postgres` | data | approved | 80/90/80 |
| `managed-kubernetes` | compute | conditional | 75/85/75 |

## Tests

- **11 server supertests** (`decisionPatterns.routes.test.ts`) — list/filter/get/adopt/stats/error-cases
- **9 client vitests** (`decisionPatterns.api.test.ts`) — URL-builder + auth-headers + error-paths
- **Manual E2E**: Open Toolbar → 📚 → Filter by category → Apply pattern → Verify audit-entry

## DSGVO / Audit-Trail

- Jeder Apply-Klick erzeugt `pattern_adopted` Audit-Entry (low risk)
- Audit enthält: userId, projectId, patternSlug, version, ip, userAgent, timestamp
- Audit ist fire-and-forget — blockt nicht den Adopt-Result

## Differenzierung zu existierender `PatternCatalog`

> [!warning] Naming-Disambiguierung
> Existierende `PatternCatalog.tsx` + `pattern-templates.ts` = **ArchiMate-Modeling-Templates** (Mini-Strukturen für Canvas-Insert).
> Neue `DecisionPatternLibrary.tsx` + `DecisionPattern`-Model = **Architektur-Entscheidungs-Patterns** (Lösungs-Optionen mit Compliance-Metadaten).
> Beide existieren parallel; verschiedene Use Cases.

## Was noch fehlt (Sprint 4)

- **REQ-CHOICE-001.3 Versionierung** (THE-198) — Semver + Successor-Verlinkung bei Deprecation
- **UC-CHOICE-007 Adoption-Badges** — "Most Used" / "Trending" / "Architects' Choice" auf den Cards basierend auf Stats-Endpoint
- **AI-Advisor-Integration** für dynamischen Pattern-Vorschlag aus Element-Kontext
- **Score-Sort** statt Name-Sort (kommt mit Voting-Mechanik)

## Sprint-Acceleration

Geschätzt: 4-5 Tage (4 REQs × ~1 Tag).
Tatsächlich: **1 Tag** (Sonntag 2026-05-17, 4 Slices in Sequenz mit DI-Test-Strategie).
**Faktor: 4-5×**.

## Verlinkungen

- [[UC-RED-001 Redundancy Detector]] — vorhergehende UC, gleiches Slice-Pattern-Vorgehen
- [[Predictive Architecture Strategy]] — UC-CHOICE-001 wird später Embedding-Backbone nutzen für Pattern-Similarity
- [[BSH-ESG-Compliance-Transformation]] — wird im Pitch als "TurboTax für Architektur-Entscheidungen" gezeigt
- [[MOC]]
