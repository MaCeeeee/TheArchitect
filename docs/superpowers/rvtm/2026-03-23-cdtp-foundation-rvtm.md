# RVTM: CDTP Foundation — Orchestrator + AI Auto-Mapping

**Source:** Spec `docs/superpowers/specs/2026-03-23-cdtp-design.md`
**Plan:** `docs/superpowers/plans/2026-03-23-cdtp-foundation.md`
**Owner:** Matze Ganzmann
**Generated:** 2026-03-23
**Total Requirements:** 11 (Feature 6: 6 REQs + Feature 1: 5 REQs)

---

## Traceability Matrix

| REQ ID | Requirement | Feature | Plan Task(s) | Verification | Status |
|--------|-------------|---------|:------------:|:------------:|:------:|
| REQ-CDTP-028 | Compliance-Pipeline Orchestrator Service (`compliance-pipeline.service.ts` mit `runAutoMapping`, `runPolicyGeneration`, `runComplianceRoadmap`, `captureSnapshot`) | F6 | Task 3 (create service), Task 5b (unit tests) | Test: Jest unit tests for `getOrCreatePipelineState`, `refreshMappingStats`, `refreshPolicyStats`, `getPipelineStatus`, `getPortfolioOverview` | Pending |
| REQ-CDTP-029 | CompliancePipelineState Model — Pipeline-Fortschritt pro Standard tracken: `stage` (uploaded→mapped→policies_generated→roadmap_ready→tracking), `mappingStats`, `policyStats` | F6 | Task 1 (model), Task 4 (API endpoints), Task 5b (unit tests) | Test: Model schema validation + API endpoint returns correct pipeline states | Pending |
| REQ-CDTP-030 | CompliancePipelineWizard UI — Schritt-für-Schritt-Wizard im Copilot-Panel: Upload → Map → Policies → Roadmap → Track | F6 | Task 8 (wizard component), Task 9 (AICopilot integration) | Smoke: Open Pipeline tab → select standard → verify 5 steps with active stage highlighted | Pending |
| REQ-CDTP-031 | CompliancePortfolioView UI — Übersichtsseite mit allen Standards: Pipeline-Status, Maturity-Level, Quick-Actions | F6 | Task 7 (portfolio view), Task 9 (Sidebar integration) | Smoke: Click Compliance sidebar → verify cards with coverage ring, maturity stars, stage label, mapping stats bar | Pending |
| REQ-CDTP-032 | complianceStore.ts — Zustand-Store für Compliance-Daten: pipelineStates, snapshots, checklists, suggestedElements | F6 | Task 6 (store + API facade) | Test: Store actions call correct API endpoints; state updates on load | Pending |
| REQ-CDTP-033 | Sidebar-Integration — "Compliance" Menüpunkt in Sidebar + Pipeline Tab in AICopilot | F6 | Task 9 (uiStore type + AICopilot tab + Sidebar nav) | Smoke: Verify Compliance icon in sidebar + Pipeline tab in Copilot | Pending |
| REQ-CDTP-001 | Coverage-Gap-Erkennung — `generateMappingSuggestions()` identifiziert Sektionen ohne passendes Architektur-Element in zweitem AI-Pass | F1 | Task 5 (AI prompt extension + gap handling in route) | Smoke: AI Auto-Map → verify GAP entries created for unmapped sections with `suggestedNewElement` | Pending |
| REQ-CDTP-002 | SuggestedNewElement — StandardMapping Model unterstützt optionales `suggestedNewElement` Sub-Document: `{ name, type, layer, description }` | F1 | Task 2 (interface + schema extension) | Test: Build passes with new field; gap mappings store `suggestedNewElement` data | Pending |
| REQ-CDTP-003 | Auto-Map bei Upload — Standards Upload unterstützt optionalen `?autoMap=true` Query-Param | F1 | Task 4 Step 2 (auto-create pipeline state on upload) | Smoke: Upload with `?autoMap=true` → pipeline state created at `uploaded` stage | Pending |
| REQ-CDTP-004 | Coverage-Gap UI — ComplianceMatrix zeigt Coverage-Gap-Indikator für Sektionen ohne Mapping + Suggested Element Badge | F1 | Task 10 (Mapping interface extension + GAP indicator + badge) | Smoke: Matrix shows "GAP" text for unmapped cells; drilldown shows purple "Suggested: ..." badge | Pending |
| REQ-CDTP-005 | Confidence-Validierung — AI-Mapping validiert Confidence nach: Layer/Type-Match prüfen, Score anpassen bei Mismatch | F1 | Task 5 Step 2 (validateConfidence function), Task 5b (unit tests) | Test: Jest tests verify confidence penalties for layer mismatch (×0.7), type mismatch (×0.8), compound (×0.56) | Pending |

---

## Verification Methods

| Method | Description |
|--------|-------------|
| Test | Automated unit/integration test (Jest for server, Vitest for client) |
| Smoke | Manual browser-based verification (Task 11, Step 5) |
| Build | TypeScript compilation passes with 0 errors |

---

## Coverage Notes

- **REQ-CDTP-028 partial scope:** This plan implements orchestrator functions for pipeline state management (`getOrCreate`, `refresh*`, `getStatus`, `getPortfolio`). The `runAutoMapping`, `runPolicyGeneration`, `runComplianceRoadmap`, `captureSnapshot` functions will be added in Feature 1-4 plans.
- **REQ-CDTP-003 partial scope:** Pipeline state auto-creation on upload is implemented. The full `?autoMap=true` auto-trigger of AI mapping will be completed when the client-side auto-map flow is connected.
- **REQ-CDTP-032 partial scope:** Store covers `pipelineStates` and `portfolioOverview`. Fields `snapshots`, `checklists`, `suggestedElements` will be added in F4/F5 plans.
- **Policy stats (refreshPolicyStats):** Returns zero-counts until Feature 2 adds `standardId` field to the Policy model.
- **`/portfolio` endpoint:** Added as convenience beyond spec — not listed in spec Section 5.1 but required by `CompliancePortfolioView`.
