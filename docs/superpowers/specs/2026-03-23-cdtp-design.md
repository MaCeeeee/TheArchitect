# CDTP — Compliance-Driven Transformation Pipeline

**Date:** 2026-03-23
**Status:** Approved
**Author:** Claude Opus 4.6 + User
**Linear Epic:** To be created as part of implementation (Epic + 7 Features + 38 REQs)

---

## 1. Problem Statement

TheArchitect has 80% of the infrastructure for compliance management already built:
- PDF upload and section parsing (`Standard` model)
- Standard-to-architecture mapping (`StandardMapping` with compliant/partial/gap status)
- Policy engine with 9 operators and scope filtering
- AI Advisor with 11 detectors (including compliance)
- Roadmap Generator with Kahn's topological sort and AI recommendations
- Cascade risk propagation with Bayesian probability model

**The gap:** These components are not connected end-to-end. An Enterprise Architect can upload a standard and manually create mappings, but the system cannot automatically detect compliance gaps, generate machine-evaluable policies, or create a compliance-driven transformation roadmap.

**The vision:** Upload a compliance standard PDF (e.g., ISO 21434 Cybersecurity) -> AI analyzes gaps -> generates policies -> creates prioritized compliance roadmap -> tracks progress -> audit-readiness dashboard.

---

## 2. Scope

**Compliance-Portfolio:** Multi-standard management with maturity tracking, audit-readiness dashboards, and historical compliance trends per organization.

### In Scope
- AI auto-mapping with coverage gap detection (Human-in-the-loop)
- AI policy draft generation from standard text
- Compliance-driven roadmap candidate selection with 8-criteria priority scoring
- Compliance snapshot timeline with roadmap wave projections
- Audit-readiness dashboard with checklists, evidence tracking, and responsibility assignments
- Missing element suggestions from coverage gaps
- Compliance-Pipeline Orchestrator service coordinating all steps
- Portfolio view across multiple standards

### Out of Scope (Later Phase)
- Fault Tree Analysis (FTA) — formal top-down tree, minimal cut sets, MOCUS algorithm
- Cross-standard requirement deduplication
- Automated evidence collection from external systems

---

## 3. Architecture

### Decision: Compliance-Pipeline Orchestrator

A new `compliance-pipeline.service.ts` orchestrates existing services in a clear pipeline. This keeps existing services lean while providing a single coordination point.

### Pipeline Data Flow

```
PDF Upload
    |
    v
standards.service.ts --> parseAndStore()  [EXISTS]
    |
    v
compliance-pipeline.service.ts --> runAutoMapping()
    |  |-- ai.service.ts --> generateMappingSuggestions() [EXTENDED: +Coverage Gaps]
    |  '-- Returns: Mappings + SuggestedNewElements
    |
    v
    |-- Human Review (approve/reject Mappings + Element Suggestions)
    |
    v
compliance-pipeline.service.ts --> runPolicyGeneration()
    |  |-- ai.service.ts --> generatePoliciesFromStandard() [NEW]
    |  '-- Returns: PolicyDraft[]
    |
    v
    |-- Human Review (approve/reject Policy Drafts)
    |
    v
compliance-pipeline.service.ts --> runComplianceRoadmap()
    |  |-- compliance.service.ts --> checkCompliance() [EXISTS]
    |  |-- roadmap.service.ts --> generateRoadmap() [EXTENDED: +Compliance Candidates]
    |  '-- Returns: TransformationRoadmap with Compliance Projection
    |
    v
compliance-pipeline.service.ts --> captureSnapshot()
    |  '-- ComplianceSnapshot [NEW MODEL]
    |
    v
Audit-Readiness Dashboard [NEW]
```

### Pipeline States per Standard
`uploaded -> mapped -> policies_generated -> roadmap_ready -> tracking`

Each step is independently callable. The orchestrator tracks progress but does not enforce strict ordering.

### API Routing
All new endpoints are grouped under existing `/standards/` routes to maintain compactness.

---

## 4. Data Models

### 4.1 New: ComplianceSnapshot

Tracks compliance score over time with actual measurements and projected improvements from roadmap waves.

```typescript
interface IComplianceSnapshot {
  projectId: ObjectId;
  standardId?: ObjectId;          // null = overall project score
  type: 'actual' | 'projected';
  waveNumber?: number;            // for projected snapshots
  roadmapId?: ObjectId;
  policyComplianceScore: number;  // 0-100, from checkCompliance()
  standardCoverageScore: number;  // 0-100, from StandardMapping stats
  totalSections: number;
  compliantSections: number;
  partialSections: number;
  gapSections: number;
  totalViolations: number;
  maturityLevel: number;          // 1-5
  createdAt: Date;
}
```

### 4.2 New: AuditChecklist

Tracks audit readiness with item-level evidence and responsibility assignments.

```typescript
interface IAuditChecklist {
  projectId: ObjectId;
  standardId: ObjectId;
  name: string;                   // "ISO 21434 Audit Q3 2026"
  targetDate: Date;
  responsibleUserId?: ObjectId;
  items: IAuditChecklistItem[];
  overallReadiness: number;       // 0-100, computed
  createdAt: Date;
  updatedAt: Date;
}

interface IAuditChecklistItem {
  sectionNumber: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'evidence_collected' | 'verified';
  evidence: Array<{
    type: 'document' | 'mapping' | 'policy';
    referenceId: string;
    description: string;
  }>;
  assignedTo?: ObjectId;
  dueDate?: Date;
  notes: string;
}
```

### 4.3 New: CompliancePipelineState

Tracks orchestrator progress per standard.

```typescript
interface ICompliancePipelineState {
  projectId: ObjectId;
  standardId: ObjectId;
  stage: 'uploaded' | 'mapped' | 'policies_generated' | 'roadmap_ready' | 'tracking';
  mappingStats: {
    total: number;
    compliant: number;
    partial: number;
    gap: number;
    unmapped: number;
  };
  policyStats: {
    generated: number;
    approved: number;
    rejected: number;
  };
  roadmapId?: ObjectId;
  lastSnapshotAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 4.4 New Type: PolicyDraft (intermediate, not persisted)

Used by SSE streaming and the PolicyDraftReview UI. Not a MongoDB model — it's the AI output before human approval converts it into a `Policy` document.

```typescript
interface PolicyDraft {
  name: string;                    // "Technology elements must have maturityLevel >= 3"
  description: string;             // Explanation of what this rule checks
  severity: 'error' | 'warning' | 'info';
  scope: {
    domains: string[];             // TOGAF domains to check
    elementTypes: string[];        // element types to check
    layers: string[];              // layers to check
  };
  rules: Array<{
    field: string;                 // dot-notation path, e.g., "maturityLevel"
    operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'regex';
    value: unknown;
    message: string;               // violation message
  }>;
  sourceSection: string;           // section number reference, e.g., "6.4.2"
  sourceSectionTitle: string;      // section title for display
  confidence: number;              // 0-1, AI confidence in rule extraction
}
```

### 4.5 Extended Existing Models

**StandardMapping** — new optional field:
```typescript
suggestedNewElement?: {
  name: string;
  type: string;
  layer: string;
  description: string;
}
```

**Policy** — new optional fields:
```typescript
standardId?: ObjectId;         // back-reference to Standard
sourceSectionNumber?: string;  // which section this rule came from
```

**RoadmapConfig** (shared type) — new fields:
```typescript
standardId?: string;
includeComplianceCandidates?: boolean;
compliancePriorityWeight?: number; // 0-1, default 0.5
```

**RoadmapSummary** (shared type) — new field:
```typescript
complianceProjection?: Array<{
  waveNumber: number;
  projectedPolicyScore: number;
  projectedCoverageScore: number;
}>;
```

---

## 5. API Endpoints

### 5.1 New Endpoints (under `/standards/` routes)

| Method | Route | Purpose | Feature |
|--------|-------|---------|---------|
| POST | `/:projectId/standards/:standardId/auto-map` | AI auto-mapping + coverage gaps (SSE) | F1 |
| POST | `/:projectId/standards/:standardId/generate-policies` | AI policy drafts (SSE) | F2 |
| POST | `/:projectId/standards/:standardId/approve-policies` | Save approved policy drafts | F2 |
| POST | `/:projectId/standards/:standardId/generate-compliance-roadmap` | Compliance-driven roadmap | F3 |
| GET | `/:projectId/standards/pipeline-status` | Pipeline status all standards | F6 |
| GET | `/:projectId/standards/compliance-snapshots` | Snapshot timeline | F4 |
| POST | `/:projectId/standards/compliance-snapshots/capture` | Manual snapshot capture | F4 |
| GET | `/:projectId/standards/audit-checklists` | List audit checklists | F4 |
| POST | `/:projectId/standards/audit-checklists` | Create audit checklist | F4 |
| PATCH | `/:projectId/standards/audit-checklists/:id/items/:itemId` | Update checklist item | F4 |
| GET | `/:projectId/standards/audit-checklists/:id` | Get single audit checklist | F4 |
| POST | `/:projectId/standards/:standardId/accept-suggested-element` | Create element from suggestion + update mapping | F5 |

### 5.2 Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /:projectId/standards/upload` | + `?autoMap=true` query param |
| `POST /:projectId/roadmaps` | Extended RoadmapConfig |

---

## 6. Service Changes

### 6.1 New: `compliance-pipeline.service.ts`

Orchestrator coordinating existing services:

- `runAutoMapping(projectId, standardId)` — triggers AI mapping + coverage gap detection
- `runPolicyGeneration(projectId, standardId)` — triggers AI policy draft generation
- `runComplianceRoadmap(projectId, standardId, config)` — generates compliance-driven roadmap
- `captureSnapshot(projectId, standardId?)` — creates ComplianceSnapshot
- `getPipelineStatus(projectId)` — returns pipeline state for all standards
- `getPortfolioOverview(projectId)` — aggregated portfolio data

### 6.2 Extended: `ai.service.ts`

- `generateMappingSuggestions()` — extended with:
  - Second AI pass: identify sections with NO matching architecture element
  - Return `coverageGap: true` + `suggestedNewElement` for missing elements (lightweight: name/type/layer only)
  - Post-processing: validate AI confidence (check layer/type match)
  - **Scope:** Quick gap detection during mapping — returns flags, not detailed suggestions
- **NEW** `generatePoliciesFromStandard(standardId, projectId)` — SSE function: standard sections -> PolicyDraft[]
- **NEW** `suggestMissingElements(projectId, standardId)` — standalone deep analysis for coverage gaps. Takes the `coverageGap: true` mappings from `generateMappingSuggestions()` as input and generates detailed SuggestedElement[] with proposed connections, descriptions, and priority. **Division:** `generateMappingSuggestions` flags gaps; `suggestMissingElements` elaborates them into actionable suggestions.

### 6.3 Extended: `roadmap.service.ts`

- **NEW** `identifyComplianceCandidates(projectId, standardId?)` — exported function, queries StandardMapping gaps -> MigrationCandidate[] with 8-criteria scoring
- `generateRoadmap()` (public entry point, line ~68) — extended to call `identifyComplianceCandidates()` when `config.includeComplianceCandidates === true`, then merges results into the candidate pool inside the existing `identifyCandidates()` flow (which is module-private). Merge deduplicates by elementId, keeping the higher priority.
- `calculateSummary()` — extended with `complianceProjection[]` per wave

### 6.4 Extended: `advisor.service.ts`

- **NEW** Detector #12: `detectMissingComplianceElements()` — flags standards with >20% unmapped sections

### 6.5 Extended: `compliance.service.ts`

- **NEW** `captureComplianceSnapshot()` — aggregates mapping stats + policy score

---

## 7. UI Components

### 7.1 New Components (6)

| Component | Location | Description |
|-----------|----------|-------------|
| `CompliancePipelineWizard.tsx` | copilot/ | Step-by-step wizard: Upload -> Map -> Policies -> Roadmap -> Track |
| `PolicyDraftReview.tsx` | governance/ | Card layout for AI policy drafts with approve/reject/edit |
| `SuggestedElements.tsx` | copilot/ | AI-suggested elements with one-click create |
| `ComplianceProgressChart.tsx` | governance/ | Line chart: score over time, actual + projected |
| `AuditReadinessDashboard.tsx` | governance/ | Portfolio overview, ring charts, checklists, deadlines |
| `CompliancePortfolioView.tsx` | governance/ | All standards with pipeline status + maturity level |

### 7.2 Extended Components (4)

| Component | Change |
|-----------|--------|
| `ComplianceMatrix.tsx` | Coverage gap indicator, "Suggested Element" badge |
| `RoadmapPanel.tsx` | "Include Compliance Candidates" checkbox + standard dropdown |
| `AICopilot.tsx` | New "Compliance Pipeline" tab |
| `Sidebar.tsx` | "Compliance" menu item -> Portfolio/Audit views |

### 7.3 New Store

**`complianceStore.ts`**: `pipelineStates`, `snapshots`, `auditChecklists`, `suggestedElements`, `portfolioOverview`, `selectedStandardId` + corresponding actions.

---

## 8. Requirements (38 REQs in 7 Features)

### Feature 6: Compliance-Pipeline Orchestrator + Portfolio (P0)

| ID | Title | SHALL Statement |
|----|-------|-----------------|
| REQ-CDTP-028 | Compliance-Pipeline Orchestrator | System SHALL provide `compliance-pipeline.service.ts` with pipeline coordination (runAutoMapping, runPolicyGeneration, runComplianceRoadmap, captureSnapshot) |
| REQ-CDTP-029 | CompliancePipelineState Model | System SHALL track pipeline progress per standard: stage (uploaded->mapped->policies_generated->roadmap_ready->tracking), mappingStats, policyStats |
| REQ-CDTP-030 | CompliancePipelineWizard UI | System SHALL provide step-by-step wizard in Copilot panel: Upload -> Map -> Policies -> Roadmap -> Track |
| REQ-CDTP-031 | CompliancePortfolioView UI | System SHALL show overview page with all standards: pipeline status, maturity level, quick actions |
| REQ-CDTP-032 | complianceStore.ts | System SHALL provide Zustand store for compliance data: pipelineStates, snapshots, checklists, suggestedElements |
| REQ-CDTP-033 | Sidebar Integration | System SHALL add "Compliance" menu item to sidebar -> Portfolio/Audit views |

### Feature 1: AI Auto-Mapping + Coverage Gaps (P0)

| ID | Title | SHALL Statement |
|----|-------|-----------------|
| REQ-CDTP-001 | Coverage Gap Detection | `generateMappingSuggestions()` SHALL identify sections with NO matching architecture element in a second AI pass |
| REQ-CDTP-002 | SuggestedNewElement | StandardMapping model SHALL support optional `suggestedNewElement` sub-document: { name, type, layer, description } |
| REQ-CDTP-003 | Auto-Map on Upload | Standards upload SHALL support optional `?autoMap=true` query param -> automatic AI mapping trigger |
| REQ-CDTP-004 | Coverage Gap UI | ComplianceMatrix SHALL show coverage gap indicator for sections with no mapping |
| REQ-CDTP-005 | Confidence Validation | AI mapping SHALL validate confidence: check layer/type match, adjust score on mismatch |

### Feature 2: AI Policy Generation (P1)

| ID | Title | SHALL Statement |
|----|-------|-----------------|
| REQ-CDTP-006 | generatePoliciesFromStandard | System SHALL provide `generatePoliciesFromStandard()` SSE function: standard sections -> PolicyDraft[] |
| REQ-CDTP-007 | PolicyDraft Type | System SHALL define `PolicyDraft` type: name, severity, scope, rules[], sourceSection |
| REQ-CDTP-008 | Policy Model Extension | Policy model SHALL support `standardId` + `sourceSectionNumber` fields |
| REQ-CDTP-009 | Approve/Reject Endpoint | System SHALL provide endpoint to save approved PolicyDrafts as Policies |
| REQ-CDTP-010 | PolicyDraftReview UI | System SHALL provide card layout with approve/reject/edit for AI-generated policy drafts |

### Feature 3: Compliance-Driven Roadmap Candidates (P1)

| ID | Title | SHALL Statement |
|----|-------|-----------------|
| REQ-CDTP-011 | identifyComplianceCandidates | System SHALL provide `identifyComplianceCandidates()`: StandardMapping gaps -> MigrationCandidate[] |
| REQ-CDTP-012 | 8-Criteria Priority Scoring | Compliance candidates SHALL be prioritized with 8-criteria matrix (BizValue, BizRisk, ImplChall, Success, Compliance, Relations, Urgency, Status) |
| REQ-CDTP-013 | RoadmapConfig Extension | RoadmapConfig SHALL support `standardId`, `includeComplianceCandidates`, `compliancePriorityWeight` |
| REQ-CDTP-014 | Candidate Merge | `identifyCandidates()` SHALL merge compliance candidates into pool, deduplication by elementId |
| REQ-CDTP-015 | RoadmapPanel Compliance Toggle | RoadmapPanel SHALL show "Include Compliance Candidates" checkbox + standard dropdown |

### Feature 5: Missing Element Suggestions (P1)

| ID | Title | SHALL Statement |
|----|-------|-----------------|
| REQ-CDTP-024 | suggestMissingElements | System SHALL provide `suggestMissingElements()` AI function: coverage gaps -> SuggestedElement[] |
| REQ-CDTP-025 | Advisor Detector #12 | Advisor SHALL provide `detectMissingComplianceElements()` detector: standards with >20% unmapped sections |
| REQ-CDTP-026 | SuggestedElements UI | System SHALL provide SuggestedElements component with one-click create |
| REQ-CDTP-027 | Roadmap Integration | RoadmapWave SHALL support optional `suggestedNewElements` field |

### Feature 4: Compliance Progress Tracking + Audit Readiness (P2)

| ID | Title | SHALL Statement |
|----|-------|-----------------|
| REQ-CDTP-016 | ComplianceSnapshot Model | System SHALL provide ComplianceSnapshot model: score timeline with actual/projected types |
| REQ-CDTP-017 | captureComplianceSnapshot | System SHALL provide `captureComplianceSnapshot()`: aggregate mapping stats + policy score |
| REQ-CDTP-018 | Compliance Projection | Roadmap summary SHALL contain `complianceProjection[]` with projected score per wave |
| REQ-CDTP-019 | ComplianceProgressChart UI | System SHALL provide line chart: score over time, actual (solid) + projection (dashed) |
| REQ-CDTP-020 | AuditChecklist Model | System SHALL provide AuditChecklist model: items with status, evidence, responsibilities |
| REQ-CDTP-021 | AuditReadinessDashboard UI | System SHALL provide dashboard with portfolio overview, ring charts, deadlines |
| REQ-CDTP-022 | Maturity Level Tracking | System SHALL track maturity level (1-5) per standard. Computed as: coverage < 20% = 1, < 40% = 2, < 60% = 3, < 80% = 4, >= 80% = 5. Coverage = (compliant + partial*0.5) / totalSections * 100. Manual override allowed. |
| REQ-CDTP-023 | Audit Deadline + Responsibilities | AuditChecklist SHALL support targetDate, responsibleUserId, assignedTo per item |

### Feature 7: Fault Tree Analysis — REFERENCE ONLY, NOT IN CURRENT SCOPE (P3)

> **Note:** These requirements are included for reference and future planning only. They are explicitly OUT OF SCOPE for the current implementation cycle. They will be specced in a separate document when prioritized.

| ID | Title | SHALL Statement |
|----|-------|-----------------|
| REQ-CDTP-034 | FaultTree Types | System SHALL define `FaultTree` + `FaultTreeNode` types: event/gate, AND/OR/VOTING |
| REQ-CDTP-035 | buildFaultTree | System SHALL provide `buildFaultTree()`: Neo4j cascade paths -> tree structure |
| REQ-CDTP-036 | Minimal Cut Set | System SHALL provide MOCUS algorithm for minimal cut set computation |
| REQ-CDTP-037 | AI Top Event Identification | System SHALL provide AI-assisted top event detection from standard sections |
| REQ-CDTP-038 | FaultTree UI | System SHALL provide fault tree visualization as top-down collapsible tree |

---

## 9. Execution Order

```
Feature 6 (Orchestrator + Portfolio)  <- Foundation: pipeline state, store, routing
    |
    v
Feature 1 (AI Auto-Mapping)          <- Core: detect gaps
    |
    v
Feature 2 (Policy Gen) ---+
Feature 3 (Compliance      | can run in parallel
           Roadmap)     ---+
    |
    v
Feature 5 (Missing Elements)
    |
    v
Feature 4 (Tracking + Audit)         <- Needs data from F1-F3-F5
    |
    v
Feature 7 (FTA)                      <- Later phase
```

---

## 10. Effort Estimate

| Feature | REQs | Effort | Priority |
|---------|------|--------|----------|
| F6: Orchestrator + Portfolio | 6 | 4-5 days | P0 |
| F1: AI Auto-Mapping | 5 | 3-4 days | P0 |
| F2: AI Policy Gen | 5 | 4-5 days | P1 |
| F3: Compliance Roadmap | 5 | 3-4 days | P1 |
| F5: Missing Elements | 4 | 2-3 days | P1 |
| F4: Tracking + Audit | 8 | 5-6 days | P2 |
| F7: FTA (later) | 5 | 4-5 days | P3 |
| **Total** | **38** | **~25-32 days** | — |

---

## 11. Verification

### Per Feature
- `npm run build` — 0 TypeScript errors across shared/client/server
- Unit tests for new functions (Vitest for client, Jest for server)
- API endpoint tests with Supertest

### End-to-End
1. Upload standard PDF (e.g., ISO 27001 excerpt) with `?autoMap=true`
2. AI generates mappings + coverage gaps visible in ComplianceMatrix
3. "Generate Policies" -> AI extracts rules -> PolicyDraftReview -> Approve
4. Compliance check shows violations from new policies
5. "Generate Roadmap" + "Include Compliance Candidates" -> roadmap contains gap elements
6. ComplianceProgressChart shows score improvement per wave (projection)
7. AuditReadinessDashboard shows portfolio overview with maturity levels
8. Pipeline status tracks progress per standard: uploaded -> ... -> tracking
