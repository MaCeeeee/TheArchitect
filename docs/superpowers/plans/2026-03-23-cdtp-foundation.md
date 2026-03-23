# CDTP Foundation: Orchestrator + AI Auto-Mapping

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Compliance-Pipeline Orchestrator (F6) and AI Auto-Mapping with Coverage Gaps (F1) — the P0 foundation for the entire CDTP pipeline.

**Architecture:** New `compliance-pipeline.service.ts` orchestrates existing `standards.service.ts`, `ai.service.ts`, and `compliance.service.ts`. One new MongoDB model (CompliancePipelineState). New Zustand store (`complianceStore.ts`) for client state. All new API endpoints under existing `/standards/` routes.

**Tech Stack:** Express.js + TypeScript, MongoDB/Mongoose, React 18 + Zustand, SSE streaming, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-23-cdtp-design.md`
**RVTM:** `docs/superpowers/rvtm/2026-03-23-cdtp-foundation-rvtm.md`

**REQs covered:** REQ-CDTP-028, 029, 030, 031, 032, 033 (F6) + REQ-CDTP-001, 002, 003, 004, 005 (F1)

---

## File Structure

### New Files (Server)
| File | Responsibility |
|------|---------------|
| `packages/server/src/models/CompliancePipelineState.ts` | Pipeline progress per standard |
| `packages/server/src/services/compliance-pipeline.service.ts` | Orchestrator: coordinates AI mapping, pipeline state |
| `packages/server/src/__tests__/compliance-pipeline.test.ts` | Unit tests for orchestrator service + validateConfidence |

### New Files (Client)
| File | Responsibility |
|------|---------------|
| `packages/client/src/stores/complianceStore.ts` | Zustand store for pipeline/compliance state |
| `packages/client/src/components/copilot/CompliancePipelineWizard.tsx` | Step-by-step wizard in Copilot |
| `packages/client/src/components/governance/CompliancePortfolioView.tsx` | Overview of all standards with pipeline status |

### Modified Files
| File | Change |
|------|--------|
| `packages/server/src/models/StandardMapping.ts:14` | Add `suggestedNewElement` sub-document |
| `packages/server/src/routes/standards.routes.ts` | Add pipeline endpoints BEFORE `/:standardId` route (line 112) |
| `packages/server/src/services/ai.service.ts:~377` | Extend prompt with coverage gap instruction |
| `packages/client/src/services/api.ts:~297` | Add `compliancePipelineAPI` facade |
| `packages/client/src/components/copilot/AICopilot.tsx:22` | Add 'pipeline' tab |
| `packages/client/src/components/copilot/ComplianceMatrix.tsx:31` | Add `suggestedNewElement` to Mapping interface + gap indicator |
| `packages/client/src/components/ui/Sidebar.tsx:54` | Add 'compliance' nav item |
| `packages/client/src/stores/uiStore.ts:5` | Add `'compliance'` to `SidebarPanel` type |

---

## Chunk 1: Server Models + Orchestrator Service

### Task 1: CompliancePipelineState Model

**Files:**
- Create: `packages/server/src/models/CompliancePipelineState.ts`

- [ ] **Step 1: Create the model file**

```typescript
// packages/server/src/models/CompliancePipelineState.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICompliancePipelineState extends Document {
  projectId: Types.ObjectId;
  standardId: Types.ObjectId;
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
  roadmapId?: Types.ObjectId;
  lastSnapshotAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CompliancePipelineStateSchema = new Schema<ICompliancePipelineState>(
  {
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    standardId: { type: Schema.Types.ObjectId, required: true, ref: 'Standard' },
    stage: {
      type: String,
      enum: ['uploaded', 'mapped', 'policies_generated', 'roadmap_ready', 'tracking'],
      default: 'uploaded',
    },
    mappingStats: {
      total: { type: Number, default: 0 },
      compliant: { type: Number, default: 0 },
      partial: { type: Number, default: 0 },
      gap: { type: Number, default: 0 },
      unmapped: { type: Number, default: 0 },
    },
    policyStats: {
      generated: { type: Number, default: 0 },
      approved: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
    },
    roadmapId: { type: Schema.Types.ObjectId, ref: 'TransformationRoadmap' },
    lastSnapshotAt: { type: Date },
  },
  { timestamps: true }
);

CompliancePipelineStateSchema.index({ projectId: 1, standardId: 1 }, { unique: true });

export const CompliancePipelineState = mongoose.model<ICompliancePipelineState>(
  'CompliancePipelineState',
  CompliancePipelineStateSchema
);
```

- [ ] **Step 2: Verify build**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/models/CompliancePipelineState.ts
git commit -m "feat(cdtp): add CompliancePipelineState model (REQ-CDTP-029)"
```

---

### Task 2: Extend StandardMapping with suggestedNewElement

**Files:**
- Modify: `packages/server/src/models/StandardMapping.ts:14`

- [ ] **Step 1: Add suggestedNewElement to interface**

In `packages/server/src/models/StandardMapping.ts`, add to `IStandardMapping` interface after the `updatedAt` field:

```typescript
  suggestedNewElement?: {
    name: string;
    type: string;
    layer: string;
    description: string;
  };
```

- [ ] **Step 2: Add to schema**

Add to the schema definition, after `updatedAt`:

```typescript
    suggestedNewElement: {
      type: {
        name: { type: String, required: true },
        type: { type: String, required: true },
        layer: { type: String, required: true },
        description: { type: String, default: '' },
      },
      required: false,
      _id: false,
    },
```

- [ ] **Step 3: Verify build**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/models/StandardMapping.ts
git commit -m "feat(cdtp): add suggestedNewElement to StandardMapping (REQ-CDTP-002)"
```

---

### Task 3: Compliance-Pipeline Orchestrator Service

**Files:**
- Create: `packages/server/src/services/compliance-pipeline.service.ts`

- [ ] **Step 1: Create the orchestrator service**

```typescript
// packages/server/src/services/compliance-pipeline.service.ts
import { CompliancePipelineState, ICompliancePipelineState } from '../models/CompliancePipelineState';
import { StandardMapping } from '../models/StandardMapping';
import { Standard } from '../models/Standard';

/**
 * Get or create pipeline state for a standard.
 */
export async function getOrCreatePipelineState(
  projectId: string,
  standardId: string
): Promise<ICompliancePipelineState> {
  let state = await CompliancePipelineState.findOne({ projectId, standardId });
  if (!state) {
    state = await CompliancePipelineState.create({
      projectId,
      standardId,
      stage: 'uploaded',
      mappingStats: { total: 0, compliant: 0, partial: 0, gap: 0, unmapped: 0 },
      policyStats: { generated: 0, approved: 0, rejected: 0 },
    });
  }
  return state;
}

/**
 * Refresh mapping stats from actual StandardMapping documents.
 * Note: s.id comes from IStandardSection.id (randomUUID) — the same value
 * stored in StandardMapping.sectionId when mappings are created.
 */
export async function refreshMappingStats(
  projectId: string,
  standardId: string
): Promise<ICompliancePipelineState> {
  const state = await getOrCreatePipelineState(projectId, standardId);
  const standard = await Standard.findById(standardId);
  if (!standard) throw new Error('Standard not found');

  const mappings = await StandardMapping.find({ projectId, standardId });
  const mappedSectionIds = new Set(mappings.map((m) => m.sectionId));

  const stats = {
    total: standard.sections.length,
    compliant: mappings.filter((m) => m.status === 'compliant').length,
    partial: mappings.filter((m) => m.status === 'partial').length,
    gap: mappings.filter((m) => m.status === 'gap').length,
    unmapped: standard.sections.filter((s) => !mappedSectionIds.has(s.id)).length,
  };

  state.mappingStats = stats;
  // Advance to 'mapped' only when at least one non-gap mapping exists
  if (stats.compliant + stats.partial > 0 && state.stage === 'uploaded') {
    state.stage = 'mapped';
  }
  await state.save();
  return state;
}

/**
 * Refresh policy stats. Note: Policy.standardId does not exist yet —
 * it will be added in Feature 2 (AI Policy Generation). Until then,
 * this function returns zero-counts. This is intentional and not a bug.
 */
export async function refreshPolicyStats(
  projectId: string,
  standardId: string
): Promise<ICompliancePipelineState> {
  const state = await getOrCreatePipelineState(projectId, standardId);

  // Policy.standardId is added in F2 (REQ-CDTP-008). Until then, stats stay at zero.
  state.policyStats = {
    generated: 0,
    approved: 0,
    rejected: 0,
  };

  await state.save();
  return state;
}

/**
 * Get pipeline status for all standards in a project.
 */
export async function getPipelineStatus(
  projectId: string
): Promise<ICompliancePipelineState[]> {
  return CompliancePipelineState.find({ projectId }).sort({ updatedAt: -1 });
}

/**
 * Get portfolio overview: aggregated stats across all standards.
 * Maturity level: coverage < 20% → 1, < 40% → 2, < 60% → 3, < 80% → 4, else → 5
 */
export async function getPortfolioOverview(projectId: string) {
  const states = await getPipelineStatus(projectId);
  const standards = await Standard.find({ projectId }).select('name type version');

  const portfolio = states.map((s) => {
    const std = standards.find((st) => String(st._id) === String(s.standardId));
    const coverage = s.mappingStats.total > 0
      ? Math.round(
          ((s.mappingStats.compliant + s.mappingStats.partial * 0.5) /
            s.mappingStats.total) *
            100
        )
      : 0;
    const maturityLevel = coverage < 20 ? 1 : coverage < 40 ? 2 : coverage < 60 ? 3 : coverage < 80 ? 4 : 5;

    return {
      standardId: String(s.standardId),
      standardName: std?.name ?? 'Unknown',
      standardType: std?.type ?? 'custom',
      standardVersion: std?.version ?? '',
      stage: s.stage,
      mappingStats: s.mappingStats,
      policyStats: s.policyStats,
      coverage,
      maturityLevel,
      updatedAt: s.updatedAt,
    };
  });

  return {
    totalStandards: standards.length,
    trackedStandards: states.length,
    portfolio,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/compliance-pipeline.service.ts
git commit -m "feat(cdtp): add compliance-pipeline orchestrator service (REQ-CDTP-028)"
```

---

### Task 4: Pipeline API Endpoints

**Files:**
- Modify: `packages/server/src/routes/standards.routes.ts`

**CRITICAL: Route ordering.** Express matches routes top-down. The existing route `GET /:projectId/standards/:standardId` at line 112 would swallow `pipeline-status` and `portfolio` as `standardId` values. The new static-segment routes MUST be placed BEFORE line 112 (after the `GET /:projectId/standards` list route at line 97).

- [ ] **Step 1: Add pipeline endpoints BEFORE the `:standardId` route**

In `standards.routes.ts`, add the following import at the top of the file:

```typescript
import {
  getOrCreatePipelineState,
  refreshMappingStats,
  getPipelineStatus,
  getPortfolioOverview,
} from '../services/compliance-pipeline.service';
```

Then add these routes AFTER line 108 (after `GET /:projectId/standards`) and BEFORE line 112 (`GET /:projectId/standards/:standardId`):

```typescript
// --- Compliance Pipeline Endpoints (BEFORE :standardId routes) ---

// GET pipeline status for all standards in project
router.get(
  '/:projectId/standards/pipeline-status',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = pid(req);
      const states = await getPipelineStatus(projectId);
      res.json(states);
    } catch (err) {
      console.error('[Pipeline] Status error:', err);
      res.status(500).json({ error: 'Failed to get pipeline status' });
    }
  }
);

// GET portfolio overview (aggregated)
router.get(
  '/:projectId/standards/portfolio',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = pid(req);
      const overview = await getPortfolioOverview(projectId);
      res.json(overview);
    } catch (err) {
      console.error('[Pipeline] Portfolio error:', err);
      res.status(500).json({ error: 'Failed to get portfolio' });
    }
  }
);
```

Then add this route anywhere AFTER the `:standardId` routes (e.g. after the delete mapping route at ~line 260):

```typescript
// POST refresh mapping stats for a standard
router.post(
  '/:projectId/standards/:standardId/refresh-stats',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const projectId = pid(req);
      const standardId = sid(req);
      const state = await refreshMappingStats(projectId, standardId);
      res.json(state);
    } catch (err) {
      console.error('[Pipeline] Refresh stats error:', err);
      res.status(500).json({ error: 'Failed to refresh stats' });
    }
  }
);
```

- [ ] **Step 2: Hook into upload route — auto-create pipeline state**

In the existing `POST /:projectId/standards/upload` handler (~line 48-95), add after the successful `parseAndStore()` call:

```typescript
      // Create pipeline state for new standard
      await getOrCreatePipelineState(projectId, String(standard._id));
```

- [ ] **Step 3: Verify build**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/standards.routes.ts
git commit -m "feat(cdtp): add pipeline status endpoints + auto-create state on upload (REQ-CDTP-029, REQ-CDTP-003)"
```

---

### Task 5: Extend AI Mapping with Coverage Gap Detection

**Files:**
- Modify: `packages/server/src/services/ai.service.ts`
- Modify: `packages/server/src/routes/standards.routes.ts` (onComplete callback)

This task involves two files because `generateMappingSuggestions()` in `ai.service.ts` uses callback functions (`onChunk`, `onDone`, `onError`) defined by the caller in `standards.routes.ts`.

- [ ] **Step 1: Extend AI prompt for coverage gaps**

In `ai.service.ts`, find the `generateMappingSuggestions` function (~line 377). Locate the system prompt where sections and elements are described. Append to the prompt instructions:

```
Additionally, for any standard section that has NO suitable matching architecture element,
include an entry with:
- sectionId: the section's UUID
- sectionNumber: the section's number (e.g. "4.2.1")
- elementId: "__COVERAGE_GAP__"
- elementName: "Coverage Gap"
- coverageGap: true
- suggestedElementName: a descriptive name for the missing element
- suggestedElementType: appropriate ArchiMate element type
- suggestedElementLayer: "business", "application", or "technology"
- confidence: your confidence that this section needs a new element (0.0-1.0)
```

- [ ] **Step 2: Add confidence validation helper in ai.service.ts**

Add this function BEFORE `generateMappingSuggestions` in `ai.service.ts`:

```typescript
/**
 * Validate and adjust AI confidence based on layer/type consistency.
 * REQ-CDTP-005: post-validate AI confidence scores.
 */
export function validateConfidence(
  suggestion: { confidence?: number; layer?: string; elementType?: string; elementId?: string },
  elements: Array<{ id: string; layer?: string; type?: string }>
): number {
  let confidence = suggestion.confidence || 0.5;
  if (suggestion.elementId && suggestion.elementId !== '__COVERAGE_GAP__') {
    const element = elements.find((e) => e.id === suggestion.elementId);
    if (element) {
      if (suggestion.layer && element.layer !== suggestion.layer) {
        confidence *= 0.7;
      }
      if (suggestion.elementType && element.type !== suggestion.elementType) {
        confidence *= 0.8;
      }
    }
  }
  return Math.round(confidence * 100) / 100;
}
```

- [ ] **Step 3: Handle coverage gaps in route handler's onComplete callback**

In `standards.routes.ts`, find the `ai-suggest` SSE route (~line 263). The `onComplete` callback (defined inside this route handler) receives the `suggestions` array. After the existing `bulkCreateMappings` call, add coverage gap handling:

**CRITICAL:** The existing `bulkCreateMappings(prepared)` call processes ALL suggestions. You must filter OUT coverage gap entries BEFORE that call so they don't get double-inserted. Change the existing line that maps suggestions to:

```typescript
const nonGapSuggestions = suggestions.filter((s: any) => s.coverageGap !== true);
// existing bulkCreateMappings processes only non-gap suggestions
```

Then AFTER `bulkCreateMappings`, add the gap handling:

```typescript
// Coverage gap entries — inserted separately with suggestedNewElement
const coverageGaps = suggestions.filter((s: any) => s.coverageGap === true);
if (coverageGaps.length > 0) {
  const gapMappings = coverageGaps.map((g: any) => ({
    projectId: pid(req),
    standardId: sid(req),
    sectionId: g.sectionId,
    sectionNumber: g.sectionNumber || '',
    elementId: '__COVERAGE_GAP__',
    elementName: 'Coverage Gap',
    elementLayer: g.suggestedElementLayer || 'technology',
    status: 'gap' as const,
    notes: `AI identified coverage gap. Suggested element: ${g.suggestedElementName}`,
    source: 'ai' as const,
    confidence: validateConfidence(g, []),  // No element to compare for gaps
    createdBy: getUserId(req),
    suggestedNewElement: {
      name: g.suggestedElementName || 'Unknown',
      type: g.suggestedElementType || 'application_component',
      layer: g.suggestedElementLayer || 'application',
      description: g.description || '',
    },
  }));
  // Use StandardMapping.insertMany directly since bulkCreateMappings
  // type signature doesn't include suggestedNewElement yet
  await StandardMapping.insertMany(gapMappings);
}
```

Also add the import for `validateConfidence` at the top of `standards.routes.ts`:

```typescript
import { validateConfidence } from '../services/ai.service';
```

And add the import for `StandardMapping`:

```typescript
import { StandardMapping } from '../models/StandardMapping';
```

- [ ] **Step 4: Verify build**

Run: `cd packages/server && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/ai.service.ts packages/server/src/routes/standards.routes.ts
git commit -m "feat(cdtp): extend AI mapping with coverage gap detection + confidence validation (REQ-CDTP-001, REQ-CDTP-005)"
```

---

### Task 5b: Server Unit + API Tests

**Files:**
- Create: `packages/server/src/__tests__/compliance-pipeline.test.ts`

- [ ] **Step 1: Write orchestrator service tests**

```typescript
// packages/server/src/__tests__/compliance-pipeline.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CompliancePipelineState } from '../models/CompliancePipelineState';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import {
  getOrCreatePipelineState,
  refreshMappingStats,
  refreshPolicyStats,
  getPipelineStatus,
  getPortfolioOverview,
} from '../services/compliance-pipeline.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await CompliancePipelineState.deleteMany({});
  await Standard.deleteMany({});
  await StandardMapping.deleteMany({});
});

const PROJECT_ID = new mongoose.Types.ObjectId().toString();
const STANDARD_ID = new mongoose.Types.ObjectId().toString();

describe('getOrCreatePipelineState', () => {
  it('creates a new state if none exists', async () => {
    const state = await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    expect(state.stage).toBe('uploaded');
    expect(state.mappingStats.total).toBe(0);
    expect(state.policyStats.generated).toBe(0);
  });

  it('returns existing state on second call', async () => {
    const first = await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    const second = await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    expect(String(first._id)).toBe(String(second._id));
  });
});

describe('refreshMappingStats', () => {
  it('throws when standard not found', async () => {
    await expect(refreshMappingStats(PROJECT_ID, STANDARD_ID))
      .rejects.toThrow('Standard not found');
  });

  it('computes stats from mappings and advances stage', async () => {
    // Create a standard with 3 sections
    const standard = await Standard.create({
      projectId: PROJECT_ID,
      name: 'Test Standard',
      type: 'custom',
      sections: [
        { number: '1.1', title: 'Section A', content: 'a', level: 1 },
        { number: '1.2', title: 'Section B', content: 'b', level: 1 },
        { number: '1.3', title: 'Section C', content: 'c', level: 1 },
      ],
    });

    const sectionIds = standard.sections.map((s: any) => s.id);

    // Create one compliant mapping for section A
    await StandardMapping.create({
      projectId: PROJECT_ID,
      standardId: String(standard._id),
      sectionId: sectionIds[0],
      elementId: new mongoose.Types.ObjectId().toString(),
      status: 'compliant',
      source: 'manual',
    });

    const state = await refreshMappingStats(PROJECT_ID, String(standard._id));
    expect(state.mappingStats.compliant).toBe(1);
    expect(state.mappingStats.unmapped).toBe(2);
    expect(state.stage).toBe('mapped'); // advanced from 'uploaded'
  });
});

describe('refreshPolicyStats', () => {
  it('returns zero stats (Policy.standardId not yet implemented)', async () => {
    const state = await refreshPolicyStats(PROJECT_ID, STANDARD_ID);
    expect(state.policyStats.generated).toBe(0);
    expect(state.policyStats.approved).toBe(0);
  });
});

describe('getPipelineStatus', () => {
  it('returns all states for a project', async () => {
    await getOrCreatePipelineState(PROJECT_ID, STANDARD_ID);
    await getOrCreatePipelineState(PROJECT_ID, new mongoose.Types.ObjectId().toString());
    const states = await getPipelineStatus(PROJECT_ID);
    expect(states).toHaveLength(2);
  });
});

describe('getPortfolioOverview', () => {
  it('computes maturity levels correctly', async () => {
    const standard = await Standard.create({
      projectId: PROJECT_ID,
      name: 'ISO 21434',
      type: 'iso',
      version: '2021',
      sections: [
        { number: '1', title: 'A', content: 'a', level: 1 },
        { number: '2', title: 'B', content: 'b', level: 1 },
      ],
    });
    await getOrCreatePipelineState(PROJECT_ID, String(standard._id));

    const overview = await getPortfolioOverview(PROJECT_ID);
    expect(overview.totalStandards).toBe(1);
    expect(overview.trackedStandards).toBe(1);
    expect(overview.portfolio[0].maturityLevel).toBe(1); // 0% coverage
    expect(overview.portfolio[0].standardName).toBe('ISO 21434');
  });
});
```

Also add a test for `validateConfidence` (from `ai.service.ts`):

```typescript
import { validateConfidence } from '../services/ai.service';

describe('validateConfidence', () => {
  const elements = [
    { id: 'el1', layer: 'application', type: 'application_component' },
    { id: 'el2', layer: 'technology', type: 'node' },
  ];

  it('returns original confidence for coverage gaps', () => {
    const result = validateConfidence({ elementId: '__COVERAGE_GAP__', confidence: 0.8 }, elements);
    expect(result).toBe(0.8);
  });

  it('reduces confidence on layer mismatch', () => {
    const result = validateConfidence(
      { elementId: 'el1', layer: 'technology', confidence: 1.0 },
      elements
    );
    expect(result).toBe(0.7); // 1.0 * 0.7
  });

  it('reduces confidence on type mismatch', () => {
    const result = validateConfidence(
      { elementId: 'el1', elementType: 'node', confidence: 1.0 },
      elements
    );
    expect(result).toBe(0.8); // 1.0 * 0.8
  });

  it('compounds layer + type mismatch penalties', () => {
    const result = validateConfidence(
      { elementId: 'el1', layer: 'technology', elementType: 'node', confidence: 1.0 },
      elements
    );
    expect(result).toBe(0.56); // 1.0 * 0.7 * 0.8
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/server && npx jest src/__tests__/compliance-pipeline.test.ts --verbose`
Expected: All 10 tests pass (6 orchestrator + 4 validateConfidence)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/compliance-pipeline.test.ts
git commit -m "test(cdtp): add orchestrator service unit tests (REQ-CDTP-028, REQ-CDTP-029)"
```

---

## Chunk 2: Client — Store, Wizard, Portfolio, Matrix Enhancement

### Task 6: Compliance API Facade + Zustand Store

**Files:**
- Modify: `packages/client/src/services/api.ts` (after `standardsAPI` at ~line 297)
- Create: `packages/client/src/stores/complianceStore.ts`

- [ ] **Step 1: Add compliancePipelineAPI to api.ts**

In `packages/client/src/services/api.ts`, add after the `standardsAPI` export (~line 297):

```typescript
// Compliance Pipeline API
export const compliancePipelineAPI = {
  getPipelineStatus: (projectId: string) =>
    api.get(`/projects/${projectId}/standards/pipeline-status`),
  getPortfolio: (projectId: string) =>
    api.get(`/projects/${projectId}/standards/portfolio`),
  refreshStats: (projectId: string, standardId: string) =>
    api.post(`/projects/${projectId}/standards/${standardId}/refresh-stats`),
};
```

**Note:** The `api` instance already has `baseURL: '/api'`, so paths must NOT include `/api` prefix.

- [ ] **Step 2: Create the store**

```typescript
// packages/client/src/stores/complianceStore.ts
import { create } from 'zustand';
import { compliancePipelineAPI } from '../services/api';

interface PipelineState {
  standardId: string;
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
  updatedAt: string;
}

interface PortfolioItem {
  standardId: string;
  standardName: string;
  standardType: string;
  standardVersion: string;
  stage: string;
  mappingStats: PipelineState['mappingStats'];
  policyStats: PipelineState['policyStats'];
  coverage: number;
  maturityLevel: number;
  updatedAt: string;
}

interface PortfolioOverview {
  totalStandards: number;
  trackedStandards: number;
  portfolio: PortfolioItem[];
}

interface ComplianceStore {
  // State
  pipelineStates: PipelineState[];
  portfolioOverview: PortfolioOverview | null;
  selectedStandardId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPipelineStatus: (projectId: string) => Promise<void>;
  loadPortfolio: (projectId: string) => Promise<void>;
  refreshStats: (projectId: string, standardId: string) => Promise<void>;
  selectStandard: (standardId: string | null) => void;
  clear: () => void;
}

export const useComplianceStore = create<ComplianceStore>((set) => ({
  pipelineStates: [],
  portfolioOverview: null,
  selectedStandardId: null,
  isLoading: false,
  error: null,

  loadPipelineStatus: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await compliancePipelineAPI.getPipelineStatus(projectId);
      set({ pipelineStates: res.data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load pipeline status';
      set({ error: message, isLoading: false });
    }
  },

  loadPortfolio: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await compliancePipelineAPI.getPortfolio(projectId);
      set({ portfolioOverview: res.data, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load portfolio';
      set({ error: message, isLoading: false });
    }
  },

  refreshStats: async (projectId, standardId) => {
    try {
      await compliancePipelineAPI.refreshStats(projectId, standardId);
    } catch (err: unknown) {
      console.error('[ComplianceStore] Failed to refresh stats:', err);
    }
  },

  selectStandard: (standardId) => set({ selectedStandardId: standardId }),
  clear: () => set({ pipelineStates: [], portfolioOverview: null, selectedStandardId: null, error: null }),
}));
```

- [ ] **Step 3: Verify build**

Run: `cd packages/client && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/services/api.ts packages/client/src/stores/complianceStore.ts
git commit -m "feat(cdtp): add compliancePipelineAPI facade + complianceStore (REQ-CDTP-032)"
```

---

### Task 7: CompliancePortfolioView

**Files:**
- Create: `packages/client/src/components/governance/CompliancePortfolioView.tsx`

- [ ] **Step 1: Create the portfolio view**

**Note:** `useAuthStore` has NO `currentProject` property. Use `useArchitectureStore` for `projectId` — this is the established pattern (see `Sidebar.tsx:68`).

```typescript
// packages/client/src/components/governance/CompliancePortfolioView.tsx
import React, { useEffect } from 'react';
import { Shield, CheckCircle, AlertTriangle, XCircle, Star } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';
import { useArchitectureStore } from '../../stores/architectureStore';

const STAGE_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  mapped: 'Mapped',
  policies_generated: 'Policies',
  roadmap_ready: 'Roadmap',
  tracking: 'Tracking',
};

const STAGE_COLORS: Record<string, string> = {
  uploaded: 'text-gray-400',
  mapped: 'text-blue-400',
  policies_generated: 'text-amber-400',
  roadmap_ready: 'text-green-400',
  tracking: 'text-emerald-400',
};

function MaturityStars({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= level ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}
        />
      ))}
    </div>
  );
}

function CoverageRing({ coverage }: { coverage: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (coverage / 100) * circumference;
  const color = coverage >= 80 ? '#22c55e' : coverage >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-12 h-12">
      <svg width="48" height="48" className="transform -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={radius} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">
        {coverage}%
      </span>
    </div>
  );
}

export function CompliancePortfolioView() {
  const { portfolioOverview, isLoading, loadPortfolio } = useComplianceStore();
  const projectId = useArchitectureStore((s) => s.projectId);

  useEffect(() => {
    if (projectId) loadPortfolio(projectId);
  }, [projectId, loadPortfolio]);

  if (isLoading) {
    return (
      <div className="p-4 text-gray-400 text-sm">Loading compliance portfolio...</div>
    );
  }

  if (!portfolioOverview || portfolioOverview.portfolio.length === 0) {
    return (
      <div className="p-4">
        <div className="text-center text-gray-500 py-8">
          <Shield size={32} className="mx-auto mb-2 text-gray-600" />
          <p className="text-sm">No standards uploaded yet.</p>
          <p className="text-xs text-gray-600 mt-1">
            Upload a compliance standard in the AI Copilot → Standards tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Portfolio Summary */}
      <div className="flex gap-3 text-xs">
        <div className="bg-[#111827] border border-[#1e293b] rounded px-3 py-2 flex-1">
          <span className="text-gray-500">Standards</span>
          <span className="text-white font-mono ml-2">
            {portfolioOverview.trackedStandards}/{portfolioOverview.totalStandards}
          </span>
        </div>
      </div>

      {/* Standard Cards */}
      {portfolioOverview.portfolio.map((item) => (
        <div
          key={item.standardId}
          className="bg-[#111827] border border-[#1e293b] rounded-lg p-3 hover:border-[#334155] transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-sm font-medium text-white">{item.standardName}</div>
              <div className="text-xs text-gray-500">
                {item.standardType.toUpperCase()} {item.standardVersion}
              </div>
            </div>
            <CoverageRing coverage={item.coverage} />
          </div>

          <div className="flex items-center justify-between">
            <MaturityStars level={item.maturityLevel} />
            <span className={`text-xs font-mono ${STAGE_COLORS[item.stage] || 'text-gray-400'}`}>
              {STAGE_LABELS[item.stage] || item.stage}
            </span>
          </div>

          {/* Mapping stats bar */}
          <div className="mt-2 flex gap-1 h-1.5 rounded-full overflow-hidden bg-[#1e293b]">
            {item.mappingStats.total > 0 && (
              <>
                <div
                  className="bg-green-500"
                  style={{ width: `${(item.mappingStats.compliant / item.mappingStats.total) * 100}%` }}
                />
                <div
                  className="bg-amber-500"
                  style={{ width: `${(item.mappingStats.partial / item.mappingStats.total) * 100}%` }}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${(item.mappingStats.gap / item.mappingStats.total) * 100}%` }}
                />
              </>
            )}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>
              <CheckCircle size={10} className="inline text-green-500 mr-0.5" />
              {item.mappingStats.compliant}
            </span>
            <span>
              <AlertTriangle size={10} className="inline text-amber-500 mr-0.5" />
              {item.mappingStats.partial}
            </span>
            <span>
              <XCircle size={10} className="inline text-red-500 mr-0.5" />
              {item.mappingStats.gap}
            </span>
            <span className="text-gray-600">{item.mappingStats.unmapped} unmapped</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/client && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/governance/CompliancePortfolioView.tsx
git commit -m "feat(cdtp): add CompliancePortfolioView with coverage rings + maturity (REQ-CDTP-031)"
```

---

### Task 8: CompliancePipelineWizard

**Files:**
- Create: `packages/client/src/components/copilot/CompliancePipelineWizard.tsx`

- [ ] **Step 1: Create the wizard component**

**Note:** Uses `useArchitectureStore` for `projectId` (NOT `useAuthStore.currentProject` which does not exist). All labels in English per CLAUDE.md convention.

```typescript
// packages/client/src/components/copilot/CompliancePipelineWizard.tsx
import React, { useEffect } from 'react';
import { Upload, Map, FileCheck, Route, Activity, ChevronRight } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';
import { useArchitectureStore } from '../../stores/architectureStore';

const PIPELINE_STEPS = [
  { key: 'uploaded', icon: Upload, label: 'Upload', description: 'Standard uploaded' },
  { key: 'mapped', icon: Map, label: 'Mapping', description: 'AI auto-mapping' },
  { key: 'policies_generated', icon: FileCheck, label: 'Policies', description: 'Policy generation' },
  { key: 'roadmap_ready', icon: Route, label: 'Roadmap', description: 'Compliance roadmap' },
  { key: 'tracking', icon: Activity, label: 'Tracking', description: 'Progress tracking' },
] as const;

const STAGE_INDEX: Record<string, number> = {
  uploaded: 0,
  mapped: 1,
  policies_generated: 2,
  roadmap_ready: 3,
  tracking: 4,
};

export function CompliancePipelineWizard() {
  const { portfolioOverview, isLoading, loadPortfolio, selectedStandardId, selectStandard } =
    useComplianceStore();
  const projectId = useArchitectureStore((s) => s.projectId);

  useEffect(() => {
    if (projectId) loadPortfolio(projectId);
  }, [projectId, loadPortfolio]);

  const selectedItem = portfolioOverview?.portfolio.find(
    (p) => p.standardId === selectedStandardId
  );
  const currentStageIndex = selectedItem ? STAGE_INDEX[selectedItem.stage] ?? 0 : -1;

  if (isLoading) {
    return <div className="p-4 text-gray-400 text-sm">Loading pipeline...</div>;
  }

  if (!portfolioOverview || portfolioOverview.portfolio.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <p>No standards in pipeline.</p>
        <p className="text-xs text-gray-600 mt-1">Upload a standard in the Standards tab first.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Standard Selector */}
      <div>
        <label className="text-[10px] uppercase text-gray-500 font-medium">Standard</label>
        <select
          value={selectedStandardId ?? ''}
          onChange={(e) => selectStandard(e.target.value || null)}
          className="w-full mt-1 bg-[#111827] border border-[#1e293b] rounded px-2 py-1.5 text-xs text-white focus:border-[#38bdf8] outline-none"
        >
          <option value="">Select a standard...</option>
          {portfolioOverview.portfolio.map((item) => (
            <option key={item.standardId} value={item.standardId}>
              {item.standardName} ({item.standardType.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      {/* Pipeline Steps */}
      {selectedItem && (
        <div className="space-y-1">
          {PIPELINE_STEPS.map((step, i) => {
            const isCompleted = i < currentStageIndex;
            const isCurrent = i === currentStageIndex;
            const isNext = i === currentStageIndex + 1;
            const Icon = step.icon;

            return (
              <div
                key={step.key}
                className={`flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                  isCurrent
                    ? 'bg-[#1e293b] border border-[#38bdf8] text-white'
                    : isCompleted
                    ? 'bg-[#0f1f0f] border border-[#1a3a1a] text-green-400'
                    : 'bg-[#111827] border border-[#1e293b] text-gray-500'
                }`}
              >
                <Icon size={14} className={isCompleted ? 'text-green-400' : isCurrent ? 'text-[#38bdf8]' : ''} />
                <div className="flex-1">
                  <span className="font-medium">{step.label}</span>
                  <span className="text-gray-500 ml-2">{step.description}</span>
                </div>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#38bdf8]/20 text-[#38bdf8]">
                    Active
                  </span>
                )}
                {isCompleted && (
                  <span className="text-[10px] text-green-500">Done</span>
                )}
                {isNext && (
                  <ChevronRight size={12} className="text-gray-500" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action hints per stage */}
      {selectedItem && currentStageIndex === 0 && (
        <div className="text-xs text-gray-400 bg-[#111827] border border-[#1e293b] rounded p-2">
          Next: Run AI Auto-Mapping in the Matrix tab to detect compliance gaps.
        </div>
      )}
      {selectedItem && currentStageIndex === 1 && (
        <div className="text-xs text-gray-400 bg-[#111827] border border-[#1e293b] rounded p-2">
          Next: Generate policies from the mapped standard sections.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/client && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/copilot/CompliancePipelineWizard.tsx
git commit -m "feat(cdtp): add CompliancePipelineWizard with step visualization (REQ-CDTP-030)"
```

---

### Task 9: Integrate into AICopilot + Sidebar + uiStore

**Files:**
- Modify: `packages/client/src/stores/uiStore.ts:5` — add 'compliance' to SidebarPanel
- Modify: `packages/client/src/components/copilot/AICopilot.tsx:22`
- Modify: `packages/client/src/components/ui/Sidebar.tsx:54`

- [ ] **Step 1: Add 'compliance' to SidebarPanel type**

In `packages/client/src/stores/uiStore.ts`, line 5, change:

```typescript
type SidebarPanel = 'explorer' | 'properties' | 'togaf' | 'analytics' | 'governance' | 'marketplace' | 'copilot' | 'settings' | 'none';
```

to:

```typescript
type SidebarPanel = 'explorer' | 'properties' | 'togaf' | 'analytics' | 'governance' | 'compliance' | 'marketplace' | 'copilot' | 'settings' | 'none';
```

- [ ] **Step 2: Add pipeline tab to AICopilot**

In `AICopilot.tsx`, change the Tab type (line 22):

```typescript
type Tab = 'chat' | 'standards' | 'matrix' | 'advisor' | 'pipeline';
```

Add the import at the top:

```typescript
import { CompliancePipelineWizard } from './CompliancePipelineWizard';
```

Add the tab button in the tab bar (after the last tab button):

```tsx
<button
  onClick={() => setTab('pipeline')}
  className={`px-3 py-1.5 text-xs rounded transition-colors ${
    tab === 'pipeline' ? 'bg-[#38bdf8]/20 text-[#38bdf8]' : 'text-gray-400 hover:text-white'
  }`}
>
  Pipeline
</button>
```

Add the tab content (after the last tab content block):

```tsx
{tab === 'pipeline' && <CompliancePipelineWizard />}
```

- [ ] **Step 3: Add Compliance nav item to Sidebar**

In `Sidebar.tsx`, add the import:

```typescript
import { ShieldCheck } from 'lucide-react';
import { CompliancePortfolioView } from '../governance/CompliancePortfolioView';
```

Add to NAV_ITEMS array (line 54), after `'governance'`:

```typescript
{ id: 'compliance', icon: ShieldCheck, label: 'Compliance' },
```

Add the panel content in the sidebar panel rendering section (look for `activePanel === 'governance'` and add after that block):

```tsx
{sidebarPanel === 'compliance' && (
  <div className="h-full overflow-y-auto">
    <CompliancePortfolioView />
  </div>
)}
```

**Note:** The variable name is `sidebarPanel` (from `useUIStore()` at line 68). All panel checks use `sidebarPanel === '...'`. Step 1 (adding `'compliance'` to `SidebarPanel` type in uiStore.ts) MUST be done before this step — otherwise TypeScript will reject `'compliance'` as an invalid panel value.

- [ ] **Step 4: Verify build**

Run: `cd packages/client && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/uiStore.ts packages/client/src/components/copilot/AICopilot.tsx packages/client/src/components/ui/Sidebar.tsx
git commit -m "feat(cdtp): integrate Pipeline tab in Copilot + Compliance sidebar (REQ-CDTP-033)"
```

---

### Task 10: Coverage Gap Indicator in ComplianceMatrix

**Files:**
- Modify: `packages/client/src/components/copilot/ComplianceMatrix.tsx`

- [ ] **Step 1: Extend Mapping interface**

In `ComplianceMatrix.tsx`, find the `Mapping` interface (line 31-42). Add the `suggestedNewElement` field:

```typescript
interface Mapping {
  _id: string;
  sectionId: string;
  sectionNumber: string;
  elementId: string;
  elementName: string;
  elementLayer: string;
  status: 'compliant' | 'partial' | 'gap' | 'not_applicable';
  notes: string;
  source: 'ai' | 'manual';
  confidence: number;
  suggestedNewElement?: {
    name: string;
    type: string;
    layer: string;
    description: string;
  };
}
```

- [ ] **Step 2: Add GAP indicator in matrix overview cells**

In the matrix overview cell rendering (around line 546-564), find the `<button>` that renders each cell. Add `relative` to its className if not present, then inside the button, add a GAP indicator for unmapped cells:

Find the cell rendering `<button>` (approximately):
```tsx
<button
  key={`${sec.id}-${layer}`}
  className="... relative ..."  // ensure 'relative' is in className
  ...
>
```

Inside the button, after existing content, add:

```tsx
{(!cell || cell.total === 0) && (
  <span className="absolute inset-0 flex items-center justify-center text-[8px] text-red-400/60 font-mono">
    GAP
  </span>
)}
```

- [ ] **Step 3: Add Suggested Element badge in drilldown**

In the drilldown view (around line 320-400), where individual mappings are listed with their status badge, add after the status badge:

```tsx
{mapping.suggestedNewElement && (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 ml-1">
    Suggested: {mapping.suggestedNewElement.name}
  </span>
)}
```

- [ ] **Step 4: Verify build**

Run: `cd packages/client && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/copilot/ComplianceMatrix.tsx
git commit -m "feat(cdtp): add coverage gap indicator + suggested element badge in matrix (REQ-CDTP-004)"
```

---

## Chunk 3: Verification

### Task 11: Build Verification + Lint + Smoke Test

- [ ] **Step 1: Lint all packages**

Run: `npm run lint`
Expected: 0 errors, 0 warnings (or only pre-existing warnings)

- [ ] **Step 2: Build all packages**

Run: `npm run build`
Expected: Turbo output shows `Tasks: 3 successful, 3 total` with 0 error lines. Build order: shared → server → client (handled by Turbo pipeline config in `turbo.json`).

- [ ] **Step 3: Run server tests**

Run: `cd packages/server && npx jest src/__tests__/compliance-pipeline.test.ts --verbose`
Expected: All 11 tests pass (7 orchestrator tests in 5 describe blocks + 4 validateConfidence tests)

- [ ] **Step 4: Start dev servers**

Run: `npm run dev`
Expected: Vite dev server starts on port 5173 (or configured port), Express server starts on its configured port. Look for lines like `Local: http://localhost:5173/` (client) and `Server running on port ...` (server) in the Turbo output.

- [ ] **Step 5: Manual smoke test**

Perform the following checks in the browser at `http://localhost:5173`:

1. **Pipeline tab:** Open AI Copilot panel → verify a "Pipeline" tab appears in the tab bar alongside Chat, Standards, Matrix, Advisor
2. **Compliance sidebar:** In the left sidebar icon strip, verify a new "Compliance" icon (shield with check) appears below "Governance"
3. **Empty portfolio:** Click the Compliance sidebar icon → verify it shows "No standards uploaded yet." with a shield icon
4. **Upload a standard:** Go to AI Copilot → Standards tab → upload any standard PDF → wait for parsing to complete
5. **Pipeline state auto-created:** Verify the API call works: open browser DevTools Network tab and navigate to `GET /api/projects/<projectId>/standards/pipeline-status` — should return an array with one entry at stage `uploaded`
6. **Portfolio card:** Click Compliance sidebar → verify a card appears with the standard name, 0% coverage ring, maturity level 1 star, "Uploaded" stage label
7. **Pipeline wizard:** Go to AI Copilot → Pipeline tab → select the uploaded standard from the dropdown → verify 5 steps are shown with "Upload" highlighted as Active (blue border + "Active" badge)
8. **Matrix empty state:** Go to AI Copilot → Matrix tab → view the matrix for the uploaded standard → verify cells are shown (empty, no mappings yet — "GAP" text only appears after AI mapping creates gap-status entries)
9. **AI Auto-Mapping with gaps:** Trigger AI suggestions (existing "AI Suggest" button) for the standard → after completion, verify: (a) some cells now show compliant/partial mapping colors, (b) cells for sections with no matching element show "GAP" text, (c) click into a GAP cell drilldown and verify the purple "Suggested: ..." badge appears on mappings with `suggestedNewElement` data. **Note:** This step requires AI service to be configured (API key for OpenAI/Anthropic). If not available, verify the endpoint returns 200 and check the SSE stream starts correctly.

- [ ] **Step 6: Commit all remaining changes**

```bash
git status
# Review output — only commit files from this plan
git add packages/server/src/models/CompliancePipelineState.ts \
      packages/server/src/models/StandardMapping.ts \
      packages/server/src/services/compliance-pipeline.service.ts \
      packages/server/src/services/ai.service.ts \
      packages/server/src/routes/standards.routes.ts \
      packages/server/src/__tests__/compliance-pipeline.test.ts \
      packages/client/src/services/api.ts \
      packages/client/src/stores/complianceStore.ts \
      packages/client/src/stores/uiStore.ts \
      packages/client/src/components/governance/CompliancePortfolioView.tsx \
      packages/client/src/components/copilot/CompliancePipelineWizard.tsx \
      packages/client/src/components/copilot/AICopilot.tsx \
      packages/client/src/components/copilot/ComplianceMatrix.tsx \
      packages/client/src/components/ui/Sidebar.tsx
git commit -m "feat(cdtp): CDTP Foundation complete — Orchestrator + AI Auto-Mapping (F6+F1)"
```

**Note:** Do NOT use `git add -A` — it would stage unrelated untracked files (`.claude/`, `TEST_MIROFISH_PHASE3.md`, `docs/`). Always list files explicitly.
