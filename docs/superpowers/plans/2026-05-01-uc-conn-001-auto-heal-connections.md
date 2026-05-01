# UC-CONN-001 — Auto-Heal Isolated ArchiMate Connections — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolated ArchiMate elements (0–1 connections) are automatically connected to compatible neighbors using the existing rule engine, both at element-creation time (Blueprint) and on-demand (Heal Workspace), so the BSH demo on 2026-05-06 shows a fully-vernetzte Architektur and MiroFish simulations have a usable dependency graph.

**Architecture:**
- New server-side `connectionSuggestion.service.ts` reuses `getValidRelationships()` + `getDefaultRelationship()` from `packages/shared/src/constants/archimate-rules.ts` (already encodes 60+ ArchiMate 3.2 rules) to produce ranked suggestions per isolated element.
- New `POST /api/projects/:projectId/heal-connections?mode=dryRun|apply` endpoint exposes the service. Apply mode reuses the existing `createConnection()` Cypher helper and the existing `audit` middleware — connections live only in Neo4j as `CONNECTS_TO` relationships, no MongoDB schema changes.
- Frontend `HealWorkspaceModal` + 3D-toolbar button gives the user a Dry-Run preview with confidence bars and per-suggestion accept/reject.
- `PropertyPanel.handleConnect` is fixed to actually POST to `/connections` instead of mutating only the local store.
- Blueprint generator gets `applyConnections: true` as the new default so freshly-generated workspaces are vernetzt out-of-the-box.

**Tech Stack:** TypeScript strict, Express + Mongoose, Neo4j (Cypher), React 18 + Zustand, Jest (server), Vitest (client), existing `architectureAPI` axios client.

**Linear:** [THE-211](https://linear.app/thearchitect/issue/THE-211) (UC) → THE-212/213/214/215/216 (5 REQs)

**RVTM:** `docs/superpowers/rvtm/2026-05-01-uc-conn-001-rvtm.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/server/src/services/connectionSuggestion.service.ts` | **Create** | Pure-function batch suggestion engine: takes a project's elements + existing connections → ranked Suggestion[] per isolated element |
| `packages/server/src/__tests__/connectionSuggestion.service.test.ts` | **Create** | Jest unit tests for the service |
| `packages/server/src/routes/architecture.routes.ts` | **Modify** | Add `POST /:projectId/heal-connections` route after the existing `POST /:projectId/connections` block (≈line 477) |
| `packages/server/src/services/blueprint.service.ts` | **Modify** | Add caller-driven `applyConnections` option (default `true`); persist generated connections via `createConnection` helper |
| `packages/client/src/components/ui/PropertyPanel.tsx` | **Modify** | Fix `handleConnect` (lines 732-743) to call `architectureAPI.createConnection`, optimistic update + rollback |
| `packages/client/src/components/copilot/HealWorkspaceModal.tsx` | **Create** | Dry-run preview modal with per-suggestion accept/reject + confidence slider |
| `packages/client/src/components/ui/Toolbar.tsx` (verified — X-Ray toggle lives here, lines 82-105) | **Modify** | Add "Heal Workspace" button next to X-Ray |
| `packages/client/src/services/api.ts` | **Modify** | Add `architectureAPI.healConnections(projectId, mode, opts)` wrapper |

**File-design decisions:**
- The new service is a pure module (no DB calls inside the suggestion math) — it takes `elements` + `connections` as inputs and returns suggestions. The route does the Neo4j read and the Neo4j write. This keeps the suggestion math fully unit-testable without a Neo4j fixture.
- We do NOT introduce a new Mongoose model. ArchiMate connections in this codebase live exclusively in Neo4j as `CONNECTS_TO` relationships (verified across `architecture.routes.ts`, `aiGenerator.routes.ts`, `mirofish/agentContextFilter.ts`). The Linear REQ-02 wording "MongoDB UND Neo4j" is incorrect and is corrected in this plan.

---

## Chunk 1: Backend (Tasks 1–4)

### Task 1: Pre-Flight verification of Toolbar and API client paths

**Why this task:** The plan references `packages/client/src/components/3d/Toolbar.tsx` and `architectureAPI`. Before writing code that imports them, confirm the exact paths in the current branch.

- [ ] **Step 1.1: Locate the 3D toolbar that currently hosts the X-Ray toggle**

```bash
grep -rEn "X-?Ray|x-?ray" /Users/mac_macee/javis/packages/client/src/components/ 2>/dev/null | grep -v node_modules | head -10
```

Expected: at least one `.tsx` file matches. Note the path — that file gets the new "Heal Workspace" button in Task 9.

- [ ] **Step 1.2: Locate `architectureAPI` and confirm `createConnection` already exists there**

```bash
grep -En "architectureAPI|createConnection" /Users/mac_macee/javis/packages/client/src/services/api.ts | head -20
```

Expected: an export named `architectureAPI` with a `createConnection` method. Note the exact method signature — Task 6 mirrors it for `healConnections`.

- [ ] **Step 1.3: Verify the exact `@thearchitect/shared` import path used by `blueprint.service.ts`** *(added per review — was a build-risk in the original plan)*

```bash
grep -nE "@thearchitect/shared" /Users/mac_macee/javis/packages/server/src/services/blueprint.service.ts | head -10
```

Expected: at least one import. Note the exact path style — does it import from `@thearchitect/shared` (top-level), `@thearchitect/shared/dist/...`, or a sub-path? Task 3.1 uses the same form. If the imports look like `from '@thearchitect/shared'` (top-level only), then `archimate-rules` must be re-exported from `packages/shared/src/index.ts`. Verify with:

```bash
grep -nE "archimate-rules|archimate-categories" /Users/mac_macee/javis/packages/shared/src/index.ts
```

If `archimate-rules` is NOT re-exported, add a re-export line as the first sub-task of Task 3 (before writing the service).

- [ ] **Step 1.4: Locate the architecture store and confirm `removeConnection` action**

```bash
grep -nE "removeConnection|addConnection" /Users/mac_macee/javis/packages/client/src/stores/architectureStore.ts 2>/dev/null | head -10
```

If `removeConnection` does not exist, Task 7 needs a sub-step to add it (small, ~3 lines). Note the result.

- [ ] **Step 1.5: Commit nothing; carry the verified paths into Tasks 3, 6, 7, 9**

No code change.

---

### Task 2: Write the failing unit tests for `connectionSuggestion.service`

**Files:**
- Create: `packages/server/src/__tests__/connectionSuggestion.service.test.ts`

- [ ] **Step 2.1: Write the test file with 4 cases**

```typescript
// packages/server/src/__tests__/connectionSuggestion.service.test.ts
import { suggestConnectionsForIsolatedElements } from '../connectionSuggestion.service';

type El = { id: string; type: string; name: string };
type Conn = { id: string; sourceId: string; targetId: string; type: string };

describe('suggestConnectionsForIsolatedElements', () => {
  const stakeholder: El = { id: 's1', type: 'stakeholder', name: 'CFO' };
  const driver:      El = { id: 'd1', type: 'driver',      name: 'CSRD compliance' };
  const goal:        El = { id: 'g1', type: 'goal',        name: 'Reduce carbon 50%' };
  const appComp:     El = { id: 'a1', type: 'application_component', name: 'ESG App' };

  it('returns suggestions for an isolated stakeholder', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver, goal],
      connections: [],
      minConfidence: 0,
    });
    expect(report.elementsAnalyzed).toBe(3);
    const sug = report.perElement.get('s1') ?? [];
    expect(sug.length).toBeGreaterThan(0);
    expect(sug[0].targetId).toMatch(/^(d1|g1)$/);
    expect(sug[0].relationshipType).toMatch(/influence|association/);
    expect(sug[0].confidence).toBeGreaterThan(0);
    expect(sug[0].confidence).toBeLessThanOrEqual(1);
  });

  it('skips already-connected elements', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver],
      connections: [{ id: 'c1', sourceId: 's1', targetId: 'd1', type: 'influence' }],
      minConfidence: 0,
    });
    expect(report.perElement.has('s1')).toBe(false);
    expect(report.perElement.has('d1')).toBe(false);
  });

  it('respects minConfidence threshold', async () => {
    const reportLow = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, appComp],
      connections: [],
      minConfidence: 0,
    });
    const reportHigh = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, appComp],
      connections: [],
      minConfidence: 0.95,
    });
    expect((reportHigh.perElement.get('s1') ?? []).length)
      .toBeLessThanOrEqual((reportLow.perElement.get('s1') ?? []).length);
  });

  it('does not duplicate suggestions and never suggests self-loops', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver, goal],
      connections: [],
      minConfidence: 0,
    });
    for (const [elementId, sugs] of report.perElement.entries()) {
      const targetIds = sugs.map(s => s.targetId);
      expect(new Set(targetIds).size).toBe(targetIds.length);
      expect(targetIds).not.toContain(elementId);
    }
  });

  // — added per review: edge cases —

  it('handles an empty workspace gracefully', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [],
      connections: [],
      minConfidence: 0,
    });
    expect(report.elementsAnalyzed).toBe(0);
    expect(report.suggestionsTotal).toBe(0);
    expect(report.perElement.size).toBe(0);
  });

  it('returns no suggestions for elements with unknown type', async () => {
    const weird: El = { id: 'x1', type: 'not_a_real_archimate_type', name: 'X' };
    const report = await suggestConnectionsForIsolatedElements({
      elements: [weird, driver],
      connections: [],
      minConfidence: 0,
    });
    expect(report.perElement.has('x1')).toBe(false);
  });

  it('analyzes weakly-connected elements when includeWeak=true', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver, goal],
      connections: [{ id: 'c1', sourceId: 's1', targetId: 'd1', type: 'influence' }],
      minConfidence: 0,
      includeWeak: true,
    });
    // s1 has 1 connection — should be analyzed when includeWeak is true
    expect(report.perElement.has('s1')).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run the tests to confirm they fail with "Cannot find module"**

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/connectionSuggestion.service.test.ts
```

Expected: FAIL with `Cannot find module '../connectionSuggestion.service'`.

- [ ] **Step 2.3: Commit the failing tests**

```bash
cd /Users/mac_macee/javis && git add packages/server/src/__tests__/connectionSuggestion.service.test.ts
git commit -m "test(conn-heal): add failing tests for connectionSuggestion service"
```

---

### Task 3: Implement `connectionSuggestion.service.ts`

**Files:**
- Create: `packages/server/src/services/connectionSuggestion.service.ts`

- [ ] **Step 3.1: Write the minimal implementation that passes the tests**

Note (verified in Pre-Flight Step 1.3): the codebase imports from `@thearchitect/shared` top-level only. `archimate-rules` and `archimate-categories` were re-exported in `packages/shared/src/index.ts` during pre-flight, so the imports below resolve.

```typescript
// packages/server/src/services/connectionSuggestion.service.ts
import {
  getValidRelationships,
  getDefaultRelationship,
  CATEGORY_BY_TYPE,
  type StandardConnectionType,
  type ElementType,
} from '@thearchitect/shared';

export interface SuggestionInput {
  id: string;
  type: string;
  name: string;
}
export interface ExistingConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
}
export interface Suggestion {
  sourceId: string;
  targetId: string;
  targetName: string;
  relationshipType: StandardConnectionType;
  confidence: number;        // 0–1
  reasoning: string;         // short human-readable
}
export interface HealReport {
  elementsAnalyzed: number;
  suggestionsTotal: number;
  perElement: Map<string, Suggestion[]>;
}
export interface HealOptions {
  elements: SuggestionInput[];
  connections: ExistingConnection[];
  minConfidence?: number;     // default 0.0 — caller filters
  topNPerElement?: number;    // default 4
  /**
   * If true, weakly-connected elements (1 connection) are also analyzed.
   * If false (default), only fully isolated (0 connections) are analyzed.
   */
  includeWeak?: boolean;
}

const DEFAULT_TOP_N = 4;

/**
 * Pure batch-suggestion engine. Reads the in-memory element + connection
 * lists, produces ranked Suggestion[] per isolated element. Does not touch
 * Neo4j or MongoDB — caller is responsible for IO.
 */
export async function suggestConnectionsForIsolatedElements(
  opts: HealOptions,
): Promise<HealReport> {
  const minConfidence = opts.minConfidence ?? 0;
  const topN = opts.topNPerElement ?? DEFAULT_TOP_N;
  const includeWeak = opts.includeWeak ?? false;

  // Precompute connection counts per element
  const connectionCount = new Map<string, number>();
  const connectedPairs = new Set<string>();
  for (const c of opts.connections) {
    connectionCount.set(c.sourceId, (connectionCount.get(c.sourceId) ?? 0) + 1);
    connectionCount.set(c.targetId, (connectionCount.get(c.targetId) ?? 0) + 1);
    connectedPairs.add(pairKey(c.sourceId, c.targetId));
  }

  const perElement = new Map<string, Suggestion[]>();
  let total = 0;

  for (const el of opts.elements) {
    const cnt = connectionCount.get(el.id) ?? 0;
    const isolated = cnt === 0;
    const weak = cnt === 1;
    if (!isolated && !(includeWeak && weak)) continue;

    const candidates: Suggestion[] = [];
    for (const other of opts.elements) {
      if (other.id === el.id) continue;
      if (connectedPairs.has(pairKey(el.id, other.id))) continue;

      const score = scorePair(el, other);
      if (score.confidence < minConfidence) continue;
      if (score.confidence === 0) continue;

      candidates.push({
        sourceId: el.id,
        targetId: other.id,
        targetName: other.name,
        relationshipType: score.relationshipType,
        confidence: score.confidence,
        reasoning: score.reasoning,
      });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const top = candidates.slice(0, topN);
    if (top.length > 0) {
      perElement.set(el.id, top);
      total += top.length;
    }
  }

  return {
    elementsAnalyzed: opts.elements.length,
    suggestionsTotal: total,
    perElement,
  };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface PairScore {
  confidence: number;
  relationshipType: StandardConnectionType;
  reasoning: string;
}

/**
 * Scoring rule:
 *   confidence = 0.5 * layerCompatibility + 0.5 * aspectMatch
 *   layerCompatibility: 1.0 same layer, 0.7 adjacent layer, 0.4 cross-layer, 0.0 unknown
 *   aspectMatch: 1.0 if a *strong* (non-association) relationship exists, 0.5 if only association is valid, 0.0 if unknown types
 *
 * Embedding similarity is left as a future enhancement (REQ-CONN-001-01 AC-3
 * mentions it as optional). Adding it later only requires bumping the formula.
 */
function scorePair(a: SuggestionInput, b: SuggestionInput): PairScore {
  const ca = CATEGORY_BY_TYPE.get(a.type as ElementType);
  const cb = CATEGORY_BY_TYPE.get(b.type as ElementType);
  if (!ca || !cb) {
    return { confidence: 0, relationshipType: 'association', reasoning: 'unknown element type' };
  }

  const valid = getValidRelationships(a.type as ElementType, b.type as ElementType);
  const hasStrong = valid.some(r => r !== 'association');

  const aspectMatch = hasStrong ? 1.0 : 0.5;
  const layerCompat =
    ca.layer === cb.layer ? 1.0 :
    Math.abs(rank(ca.layer) - rank(cb.layer)) === 1 ? 0.7 :
    0.4;

  const confidence = 0.5 * layerCompat + 0.5 * aspectMatch;

  return {
    confidence: Number(confidence.toFixed(3)),
    relationshipType: getDefaultRelationship(a.type as ElementType, b.type as ElementType),
    reasoning:
      `${a.type} → ${b.type}: ` +
      (ca.layer === cb.layer ? 'same layer' : `${ca.layer}→${cb.layer}`) +
      `, ${hasStrong ? 'strong' : 'association-only'} relationship`,
  };
}

const LAYER_ORDER = [
  'physical', 'technology', 'application', 'information',
  'business', 'strategy', 'motivation', 'implementation_migration',
];
function rank(layer: string): number {
  const i = LAYER_ORDER.indexOf(layer);
  return i === -1 ? 0 : i;
}
```

- [ ] **Step 3.2: Run tests to verify all 4 pass**

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/connectionSuggestion.service.test.ts
```

Expected: PASS — 4 of 4.

- [ ] **Step 3.3: Type-check the package**

```bash
cd /Users/mac_macee/javis/packages/server && npx tsc --noEmit
```

Expected: no errors. If the `@thearchitect/shared` import path resolves to a `dist/` re-export pattern that doesn't expose `archimate-rules` directly, follow the existing pattern used in `blueprint.service.ts` (which already imports from shared) and adjust the import to match.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/server/src/services/connectionSuggestion.service.ts
git commit -m "feat(conn-heal): add pure suggestion engine for isolated elements"
```

---

### Task 4: Add `POST /:projectId/heal-connections` route

**Files:**
- Modify: `packages/server/src/routes/architecture.routes.ts` (insert after the existing `POST /:projectId/connections` block at line 477)

- [ ] **Step 4.1: Read the imports + the area around the existing connection routes**

```bash
sed -n '1,40p;440,520p' /Users/mac_macee/javis/packages/server/src/routes/architecture.routes.ts
```

Note: the file already imports `runCypher`, `requirePermission`, `PERMISSIONS`, `audit`, `uuid`, `z`, and uses Zod schemas. Re-use them.

- [ ] **Step 4.2: Add the route**

Insert *after* the `POST /:projectId/connections` block (≈ after current line 477, before the `DELETE` block). The route reads all elements + connections for the project from Neo4j, calls the suggestion service, and either returns the report (`dryRun`) or persists each accepted suggestion (`apply`).

```typescript
import {
  suggestConnectionsForIsolatedElements,
  type HealReport,
} from '../services/connectionSuggestion.service';

const HealConnectionsBodySchema = z.object({
  mode: z.enum(['dryRun', 'apply']).default('dryRun'),
  minConfidence: z.number().min(0).max(1).default(0.7),
  /**
   * Only used when mode === 'apply'. List of {sourceId, targetId, type}
   * triples the user has whitelisted from the dry-run preview. If absent,
   * apply mode applies ALL suggestions at-or-above minConfidence.
   */
  whitelist: z.array(z.object({
    sourceId: z.string(),
    targetId: z.string(),
    type: z.string(),
  })).optional(),
});

router.post(
  '/:projectId/heal-connections',
  requirePermission(PERMISSIONS.CONNECTION_CREATE),
  audit({ action: 'heal_connections', entityType: 'connection', riskLevel: 'low' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const body = HealConnectionsBodySchema.parse(req.body ?? {});

      // Load all elements for the project
      const elementRecords = await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId})
         RETURN e.id AS id, e.type AS type, e.name AS name`,
        { projectId }
      );
      const elements = elementRecords.map(r => ({
        id: r.get('id'),
        type: r.get('type'),
        name: r.get('name'),
      }));

      // Load all existing connections for the project. Both endpoints AND the
      // edge itself must carry the matching projectId — defensive against any
      // accidental cross-project edge that might have been seeded historically.
      const connectionRecords = await runCypher(
        `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
         WHERE coalesce(r.projectId, $projectId) = $projectId
         RETURN r.id AS id, a.id AS sourceId, b.id AS targetId, r.type AS type`,
        { projectId }
      );
      const connections = connectionRecords.map(r => ({
        id: r.get('id'),
        sourceId: r.get('sourceId'),
        targetId: r.get('targetId'),
        type: r.get('type'),
      }));

      const report: HealReport = await suggestConnectionsForIsolatedElements({
        elements,
        connections,
        minConfidence: body.minConfidence,
      });

      // Convert Map to plain object for JSON
      const perElementJson: Record<string, unknown> = {};
      for (const [k, v] of report.perElement.entries()) perElementJson[k] = v;

      if (body.mode === 'dryRun') {
        res.json({
          success: true,
          mode: 'dryRun',
          data: {
            elementsAnalyzed: report.elementsAnalyzed,
            suggestionsTotal: report.suggestionsTotal,
            perElement: perElementJson,
          },
        });
        return;
      }

      // mode === 'apply'
      const allSuggestions = Array.from(report.perElement.values()).flat();
      const toApply = body.whitelist
        ? allSuggestions.filter(s => body.whitelist!.some(w =>
            w.sourceId === s.sourceId && w.targetId === s.targetId && w.type === s.relationshipType))
        : allSuggestions;

      // Batch-MERGE in a single Cypher round-trip (per review):
      // - UNWIND so 200 suggestions = 1 query, not 200
      // - MERGE on (sourceId,targetId,type) makes the call idempotent — re-runs
      //   and accidental double-clicks no longer create duplicate edges
      // - All writes share one transaction → partial failures roll back atomically
      const rows = toApply.map(s => ({
        sourceId: s.sourceId,
        targetId: s.targetId,
        type: s.relationshipType,
        confidence: s.confidence,
        cid: uuid(),
      }));

      // Two-step transaction: first read which pairs already exist (so we can
      // report created vs existing accurately to the UI), then UNWIND-MERGE.
      // Both run inside the same Neo4j session — cheap.
      let appliedCount = 0;
      let skippedExistingCount = 0;
      const applied: Array<{ id: string; sourceId: string; targetId: string; type: string }> = [];

      if (rows.length > 0) {
        const existingRecords = await runCypher(
          `UNWIND $rows AS row
           OPTIONAL MATCH (a:ArchitectureElement {id: row.sourceId, projectId: $projectId})
                          -[r:CONNECTS_TO {type: row.type}]->
                          (b:ArchitectureElement {id: row.targetId, projectId: $projectId})
           RETURN row.sourceId AS sourceId, row.targetId AS targetId, row.type AS type, r IS NOT NULL AS exists`,
          { rows, projectId }
        );
        const existsKey = (s: string, t: string, ty: string) => `${s}|${t}|${ty}`;
        const alreadyExists = new Set(
          existingRecords
            .filter(r => r.get('exists'))
            .map(r => existsKey(r.get('sourceId'), r.get('targetId'), r.get('type')))
        );
        const newRows = rows.filter(r => !alreadyExists.has(existsKey(r.sourceId, r.targetId, r.type)));
        skippedExistingCount = rows.length - newRows.length;

        if (newRows.length > 0) {
          const writeRecords = await runCypher(
            `UNWIND $rows AS row
             MATCH (a:ArchitectureElement {id: row.sourceId, projectId: $projectId}),
                   (b:ArchitectureElement {id: row.targetId, projectId: $projectId})
             MERGE (a)-[r:CONNECTS_TO {type: row.type, sourceElementId: row.sourceId, targetElementId: row.targetId}]->(b)
             ON CREATE SET r.id = row.cid, r.label = '', r.source = 'ai-heal',
                           r.confidence = row.confidence, r.projectId = $projectId,
                           r.createdAt = timestamp()
             RETURN r.id AS id, row.sourceId AS sourceId, row.targetId AS targetId, row.type AS type`,
            { rows: newRows, projectId }
          );
          for (const rec of writeRecords) {
            applied.push({
              id: rec.get('id'),
              sourceId: rec.get('sourceId'),
              targetId: rec.get('targetId'),
              type: rec.get('type'),
            });
          }
          appliedCount = applied.length;
        }
      }

      res.status(201).json({
        success: true,
        mode: 'apply',
        data: {
          elementsAnalyzed: report.elementsAnalyzed,
          suggestionsConsidered: allSuggestions.length,
          appliedCount,
          skippedAsAlreadyExisting: skippedExistingCount,
          applied,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
        return;
      }
      console.error('Heal connections error:', err);
      res.status(500).json({ success: false, error: 'Failed to heal connections' });
    }
  }
);
```

**Note on rate-limiting (REQ-02 AC-8):** The codebase has a generic `rateLimit` middleware (`packages/server/src/middleware/rateLimit.middleware.ts`). Check whether it accepts a per-route key. If yes, add `rateLimit({ keyByRoute: 'heal-connections', windowMs: 5 * 60_000, max: 1 })` to the middleware chain. If it only does global rate limiting, defer this AC to a follow-up — do NOT block the demo on it.

- [ ] **Step 4.3: Manual smoke-test against a dev project**

```bash
cd /Users/mac_macee/javis && npm run dev
# in another shell, with a real JWT for a project that has isolated elements:
curl -X POST http://localhost:4000/api/architecture/<projectId>/heal-connections \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"dryRun","minConfidence":0.5}'
```

Expected: 200 with `data.suggestionsTotal > 0` for the BSH demo project.

- [ ] **Step 4.4: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/server/src/routes/architecture.routes.ts
git commit -m "feat(conn-heal): add POST /heal-connections endpoint with dryRun/apply modes"
```

---

### Task 4b: Supertest integration test for `/heal-connections` *(added per review — REQ-04 had only manual verification)*

**Files:**
- Create: `packages/server/src/routes/__tests__/healConnections.routes.test.ts`

The goal is a single happy-path + idempotency test against a real Neo4j (the existing test setup already provisions one — verify by reading any other `__tests__/*.test.ts` for the connect helper).

- [ ] **Step 4b.1: Locate the existing Neo4j test fixture pattern**

```bash
grep -rEn "neo4j|connectNeo4j|runCypher" /Users/mac_macee/javis/packages/server/src/__tests__/ /Users/mac_macee/javis/packages/server/src/routes/__tests__/ 2>/dev/null | head -10
```

If no existing test wires Neo4j, write a lighter test that mocks `runCypher` (less ideal but acceptable for Demo timeline). Note the path you'll use.

- [ ] **Step 4b.2: Write the test**

```typescript
// packages/server/src/routes/__tests__/healConnections.routes.test.ts
import request from 'supertest';
import express from 'express';
import architectureRoutes from '../architecture.routes';
// Adapt the auth/runCypher mocks to whatever pattern the existing tests use:
jest.mock('../../config/neo4j');
jest.mock('../../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { _id: 'u1', role: 'architect' }; next(); },
}));
jest.mock('../../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  PERMISSIONS: { CONNECTION_CREATE: 'connection.create', CONNECTION_READ: 'connection.read', CONNECTION_DELETE: 'connection.delete' },
}));

import { runCypher } from '../../config/neo4j';

const app = express();
app.use(express.json());
app.use('/api/architecture', architectureRoutes);

describe('POST /api/projects/:projectId/heal-connections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('dryRun returns suggestions without persisting', async () => {
    (runCypher as jest.Mock)
      .mockResolvedValueOnce([
        { get: (k: string) => ({ id: 's1', type: 'stakeholder', name: 'CFO' }[k]) },
        { get: (k: string) => ({ id: 'd1', type: 'driver', name: 'CSRD' }[k]) },
      ])
      .mockResolvedValueOnce([]); // no existing connections

    const res = await request(app)
      .post('/api/architecture/p1/heal-connections')
      .send({ mode: 'dryRun', minConfidence: 0 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('dryRun');
    expect(res.body.data.suggestionsTotal).toBeGreaterThan(0);
    // No write call should have happened — only the 2 reads
    expect((runCypher as jest.Mock).mock.calls.length).toBe(2);
  });

  it('apply with empty whitelist applies nothing but returns 201', async () => {
    (runCypher as jest.Mock)
      .mockResolvedValueOnce([
        { get: (k: string) => ({ id: 's1', type: 'stakeholder', name: 'CFO' }[k]) },
        { get: (k: string) => ({ id: 'd1', type: 'driver', name: 'CSRD' }[k]) },
      ])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/architecture/p1/heal-connections')
      .send({ mode: 'apply', minConfidence: 0, whitelist: [] })
      .expect(201);

    expect(res.body.data.appliedCount).toBe(0);
  });

  it('rejects invalid body with 400', async () => {
    const res = await request(app)
      .post('/api/architecture/p1/heal-connections')
      .send({ mode: 'invalid' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
```

- [ ] **Step 4b.3: Run the test**

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/routes/__tests__/healConnections.routes.test.ts
```

Expected: 3/3 pass. If the existing auth-middleware structure differs from the mocks above, adapt the `jest.mock(...)` calls to match the real exports.

- [ ] **Step 4b.4: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/server/src/routes/__tests__/healConnections.routes.test.ts
git commit -m "test(conn-heal): supertest coverage for dryRun, empty-whitelist apply, and validation"
```

---

### Task 5: Blueprint Service — `applyConnections: true` by default

**Files:**
- Modify: `packages/server/src/services/blueprint.service.ts` (line 448 area)

- [ ] **Step 5.1: Find every caller of `generateBlueprint` so the signature change does not silently break them**

```bash
grep -rEn "generateBlueprint\b" /Users/mac_macee/javis/packages/server/src 2>/dev/null
```

Expected: 1–3 callers, all in route handlers.

- [ ] **Step 5.2: Extend `BlueprintInput` (or add a new options arg) and the function body**

Find the existing `BlueprintInput` interface in `blueprint.service.ts` and add:

```typescript
export interface BlueprintInput {
  // ...existing fields...
  /**
   * If true (default), generated connections are persisted to Neo4j as part of
   * generateBlueprint. If false, only the stream events are emitted and the
   * caller is responsible for persisting.
   */
  applyConnections?: boolean;
  projectId?: string;  // required when applyConnections is true
}
```

In `generateBlueprint`, after line 523 (`onEvent({ type: 'connections_ready', count: connections.length });`), add a single-roundtrip UNWIND-MERGE — same pattern as Task 4, idempotent and fast:

```typescript
const shouldApply = input.applyConnections !== false; // default true
if (shouldApply) {
  if (!input.projectId) {
    console.warn('[Blueprint] applyConnections=true but projectId missing; skipping persist');
  } else {
    const rows = connections.map(c => ({
      sourceId: c.sourceId,
      targetId: c.targetId,
      type: c.type,
      label: c.label || '',
      cid: c.id || uuid(),
    }));
    let persisted = 0;
    if (rows.length > 0) {
      try {
        const records = await runCypher(
          `UNWIND $rows AS row
           MATCH (a:ArchitectureElement {id: row.sourceId, projectId: $projectId}),
                 (b:ArchitectureElement {id: row.targetId, projectId: $projectId})
           MERGE (a)-[r:CONNECTS_TO {type: row.type, sourceElementId: row.sourceId, targetElementId: row.targetId}]->(b)
           ON CREATE SET r.id = row.cid, r.label = row.label, r.source = 'blueprint-auto',
                         r.projectId = $projectId, r.createdAt = timestamp()
           RETURN count(r) AS n`,
          { rows, projectId: input.projectId },
        );
        persisted = records[0]?.get('n')?.toNumber?.() ?? rows.length;
      } catch (err) {
        console.warn('[Blueprint] Connection persist failed:', (err as Error).message);
      }
    }
    onEvent({
      type: 'connections_persisted',
      count: persisted,
    } as BlueprintStreamEvent);
  }
}
```

Note: `count(r)` returns the matched-or-created edges, so `persisted` is the upper bound (created + already-existing). For Blueprint this is acceptable since the elements are freshly generated and shouldn't have prior edges; for the stricter accounting in the Heal endpoint we use the two-step exists-then-merge pattern.

Add `'connections_persisted'` to the `BlueprintStreamEvent` union (find the type alias at the top of the file).

- [ ] **Step 5.3: Update each caller from Step 5.1**

For each existing caller of `generateBlueprint`, pass the project's `projectId` (the route handler already has it in `req.params.projectId`). If a caller does not have a `projectId` (e.g. preview-only), pass `applyConnections: false` explicitly to keep the old behavior.

- [ ] **Step 5.4: Run the existing blueprint test suite (if one exists) to confirm no regression**

```bash
cd /Users/mac_macee/javis/packages/server && npx jest blueprint
```

Expected: all existing blueprint tests still pass. If there are no blueprint tests, that is acceptable for this task — the manual smoke-test in Task 4.3 plus the heal-connections tests cover the persist path.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/server/src/services/blueprint.service.ts packages/server/src/routes/blueprint.routes.ts
git commit -m "feat(blueprint): persist generated connections by default (applyConnections opt-in to opt-out)"
```

---

## Chunk 2: Frontend (Tasks 6–9) and finalisation

### Task 6: API client wrapper for `healConnections`

**Files:**
- Modify: `packages/client/src/services/api.ts` (find the `architectureAPI` export)

- [ ] **Step 6.1: Find the existing `createConnection` method as a template**

```bash
grep -nE "createConnection|connections" /Users/mac_macee/javis/packages/client/src/services/api.ts | head -20
```

- [ ] **Step 6.2: Add the new method right next to `createConnection`**

```typescript
healConnections: async (
  projectId: string,
  opts: {
    mode: 'dryRun' | 'apply';
    minConfidence?: number;
    whitelist?: Array<{ sourceId: string; targetId: string; type: string }>;
  },
) => {
  const res = await api.post(`/api/architecture/${projectId}/heal-connections`, opts);
  return res.data;
},
```

- [ ] **Step 6.3: Type-check the client**

```bash
cd /Users/mac_macee/javis/packages/client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/client/src/services/api.ts
git commit -m "feat(client): add architectureAPI.healConnections wrapper"
```

---

### Task 7: PropertyPanel `handleConnect` Bugfix (THE-214, Urgent)

**Files:**
- Modify: `packages/client/src/components/ui/PropertyPanel.tsx` (lines 732-743)

- [ ] **Step 7.1: Replace the local-only `handleConnect` with an API call + optimistic update + rollback**

Find the function in the `ConnectionSuggestions` component and replace its body. The current implementation only calls `store.addConnection(...)`. The new implementation:
1. generates a temp id
2. optimistically adds the connection to the store
3. calls `architectureAPI.createConnection({ sourceId, targetId, type })`
4. on success: replace temp id with server id (or just confirm)
5. on failure: remove the optimistic connection + show error toast

```typescript
const handleConnect = async (
  targetEl: { id: string },
  relType: StandardConnectionType,
) => {
  const store = useArchitectureStore.getState();
  const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // optimistic
  store.addConnection({
    id: tempId,
    sourceId: element.id,
    targetId: targetEl.id,
    type: relType,
  });

  try {
    const res = await architectureAPI.createConnection({
      sourceId: element.id,
      targetId: targetEl.id,
      type: relType,
    });
    // swap temp id for real one
    if (res?.data?.id) {
      store.removeConnection(tempId);
      store.addConnection({
        id: res.data.id,
        sourceId: element.id,
        targetId: targetEl.id,
        type: relType,
      });
    }
    toast.success('Connection created');
  } catch (err) {
    store.removeConnection(tempId);
    toast.error(`Failed to create connection: ${(err as Error).message}`);
  }
};
```

If `useArchitectureStore` does not yet expose `removeConnection`, add the matching action — the store is in `packages/client/src/stores/architectureStore.ts` (verify path with `grep`). If `architectureAPI.createConnection` does not return `{data: {id}}` exactly, mirror what the existing route returns (see `architecture.routes.ts:467`).

- [ ] **Step 7.2: Add the import at the top of PropertyPanel.tsx**

```typescript
import { architectureAPI } from '@/services/api';
```

(Verify the alias `@` is configured in this file's existing imports; otherwise use the relative path that other components in `components/ui/` already use.)

- [ ] **Step 7.3: Manual test — Connect & reload**

In the running dev server: open BSH demo project → select an isolated stakeholder → click one Suggested Connection → reload the page. Expected: the connection persists.

- [ ] **Step 7.4: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/client/src/components/ui/PropertyPanel.tsx
git commit -m "fix(property-panel): handleConnect persists connection via API"
```

---

### Task 8: HealWorkspaceModal component *(split into 8a/8b/8c per review — original was ~170 LoC in one step)*

**Files:**
- Create: `packages/client/src/components/copilot/HealWorkspaceModal.tsx`

#### Task 8a: Skeleton — file with imports, types, props, and a render that just shows "Loading..."

- [ ] **Step 8a.1: Write the file with stub render**

```tsx
// packages/client/src/components/copilot/HealWorkspaceModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import { architectureAPI } from '@/services/api';
import { toast } from '@/lib/toast'; // adjust to existing toast import

interface Suggestion {
  sourceId: string;
  targetId: string;
  targetName: string;
  relationshipType: string;
  confidence: number;
  reasoning: string;
}
interface DryRunData {
  elementsAnalyzed: number;
  suggestionsTotal: number;
  perElement: Record<string, Suggestion[]>;
}

export function HealWorkspaceModal({
  projectId,
  isOpen,
  onClose,
  onApplied,
}: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onApplied?: (count: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [data, setData] = useState<DryRunData | null>(null);
  const [minConfidence, setMinConfidence] = useState(0.7);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    architectureAPI
      .healConnections(projectId, { mode: 'dryRun', minConfidence: 0 })
      .then((res) => setData(res.data))
      .catch((err) => toast.error(`Dry-run failed: ${err.message}`))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[640px] max-h-[80vh] flex flex-col bg-[#0f172a] border border-[#334155] rounded-lg shadow-xl">
        <div className="px-4 py-3 border-b border-[#334155] flex items-center gap-2">
          <Sparkles size={16} className="text-[#7c3aed]" />
          <span className="text-white font-medium">Heal Workspace</span>
          <button onClick={onClose} className="ml-auto text-xs text-slate-400">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <div className="text-slate-400 p-8 text-center">Loading...</div>}
          {!loading && <div className="text-slate-500 p-8 text-center text-xs">8b adds the list</div>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8a.2: Type-check**

```bash
cd /Users/mac_macee/javis/packages/client && npx tsc --noEmit
```

Expected: no errors. If `@/services/api` or `@/lib/toast` aliases are wrong, fix per Task 1's findings.

- [ ] **Step 8a.3: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/client/src/components/copilot/HealWorkspaceModal.tsx
git commit -m "feat(client): scaffold HealWorkspaceModal (loading state)"
```

#### Task 8b: List rendering + confidence slider

- [ ] **Step 8b.1: Add the `flatSuggestions` memo, the slider, and the list**

Replace the `<div className="flex-1 overflow-y-auto..."` block with the slider + list. Insert above it:

```tsx
const flatSuggestions = useMemo(() => {
  if (!data) return [];
  return Object.values(data.perElement).flat()
    .filter(s => s.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
}, [data, minConfidence]);

const toggle = (s: Suggestion) => {
  const k = `${s.sourceId}|${s.targetId}|${s.relationshipType}`;
  setRejected(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
};
```

Replace render block:

```tsx
<div className="px-4 py-2 border-b border-[#334155]">
  <label className="text-xs text-slate-300 flex items-center gap-2">
    Min Confidence: {minConfidence.toFixed(2)}
    <input type="range" min={0.5} max={1} step={0.05} value={minConfidence}
           onChange={(e) => setMinConfidence(parseFloat(e.target.value))} className="flex-1" />
  </label>
</div>

<div className="flex-1 overflow-y-auto px-2 py-2">
  {loading && (
    <div className="flex items-center justify-center py-12 text-slate-400">
      <Loader2 className="animate-spin mr-2" size={16} /> Computing suggestions...
    </div>
  )}
  {!loading && flatSuggestions.length === 0 && (
    <div className="text-center text-slate-400 py-12 text-sm">
      No isolated elements at this confidence threshold.
    </div>
  )}
  {!loading && flatSuggestions.map((s) => {
    const k = `${s.sourceId}|${s.targetId}|${s.relationshipType}`;
    const isRejected = rejected.has(k);
    return (
      <button key={k} onClick={() => toggle(s)}
        className={`w-full text-left px-3 py-2 mb-1 rounded border ${
          isRejected ? 'border-slate-700 opacity-40' : 'border-[#334155] hover:bg-[#1e293b]'
        }`}>
        <div className="flex items-center gap-2">
          {!isRejected && <Check size={12} className="text-green-400" />}
          <span className="text-sm text-white truncate flex-1">{s.targetName}</span>
          <span className="text-xs text-slate-400">{s.relationshipType}</span>
          <span className="text-xs text-slate-500 w-12 text-right">{(s.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{s.reasoning}</div>
      </button>
    );
  })}
</div>
```

- [ ] **Step 8b.2: Type-check + visual smoke test**

```bash
cd /Users/mac_macee/javis/packages/client && npx tsc --noEmit
```

If feasible, run `npm run dev` and click the (still-to-come) toolbar button to see the modal — slider should filter the list live.

- [ ] **Step 8b.3: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/client/src/components/copilot/HealWorkspaceModal.tsx
git commit -m "feat(client): HealWorkspaceModal list + confidence slider"
```

#### Task 8c: Apply button + footer

- [ ] **Step 8c.1: Add `acceptedCount`, `apply` handler, and footer**

Insert above the JSX return:

```tsx
const acceptedCount = flatSuggestions.filter(
  s => !rejected.has(`${s.sourceId}|${s.targetId}|${s.relationshipType}`)
).length;

const apply = async () => {
  if (acceptedCount === 0) return;
  setApplying(true);
  try {
    const whitelist = flatSuggestions
      .filter(s => !rejected.has(`${s.sourceId}|${s.targetId}|${s.relationshipType}`))
      .map(s => ({ sourceId: s.sourceId, targetId: s.targetId, type: s.relationshipType }));
    const res = await architectureAPI.healConnections(projectId, {
      mode: 'apply',
      minConfidence,
      whitelist,
    });
    toast.success(`Applied ${res.data.appliedCount} connections`);
    onApplied?.(res.data.appliedCount);
    onClose();
  } catch (err) {
    toast.error(`Apply failed: ${(err as Error).message}`);
  } finally {
    setApplying(false);
  }
};
```

Replace the close-button-only header with a proper footer:

```tsx
<div className="px-4 py-3 border-t border-[#334155] flex items-center gap-2">
  <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
    Cancel
  </button>
  <button onClick={apply} disabled={applying || acceptedCount === 0}
    className="ml-auto px-4 py-1.5 text-sm bg-[#7c3aed] text-white rounded hover:bg-[#8b5cf6] disabled:opacity-50 flex items-center gap-2">
    {applying && <Loader2 className="animate-spin" size={12} />}
    Apply {acceptedCount} Connection{acceptedCount === 1 ? '' : 's'}
  </button>
</div>
```

- [ ] **Step 8c.2: Type-check**

```bash
cd /Users/mac_macee/javis/packages/client && npx tsc --noEmit
```

- [ ] **Step 8c.3: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/client/src/components/copilot/HealWorkspaceModal.tsx
git commit -m "feat(client): HealWorkspaceModal apply handler + footer"
```

---

<details>
<summary>Original single-task version (kept for reference, do not implement)</summary>

- [ ] **Step 8.1 (legacy): Skeleton with confidence slider, list of suggestions, accept/reject toggles, Apply button**

```tsx
// packages/client/src/components/copilot/HealWorkspaceModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import { architectureAPI } from '@/services/api';
import { toast } from '@/lib/toast'; // adjust to existing toast import path

interface Suggestion {
  sourceId: string;
  targetId: string;
  targetName: string;
  relationshipType: string;
  confidence: number;
  reasoning: string;
}
interface DryRunData {
  elementsAnalyzed: number;
  suggestionsTotal: number;
  perElement: Record<string, Suggestion[]>;
}

export function HealWorkspaceModal({
  projectId,
  isOpen,
  onClose,
  onApplied,
}: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onApplied?: (count: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [data, setData] = useState<DryRunData | null>(null);
  const [minConfidence, setMinConfidence] = useState(0.7);
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    architectureAPI
      .healConnections(projectId, { mode: 'dryRun', minConfidence: 0 })
      .then((res) => setData(res.data))
      .catch((err) => toast.error(`Dry-run failed: ${err.message}`))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  const flatSuggestions = useMemo(() => {
    if (!data) return [];
    return Object.values(data.perElement).flat()
      .filter(s => s.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }, [data, minConfidence]);

  const acceptedCount = flatSuggestions.filter(
    s => !rejected.has(`${s.sourceId}|${s.targetId}|${s.relationshipType}`)
  ).length;

  const toggle = (s: Suggestion) => {
    const k = `${s.sourceId}|${s.targetId}|${s.relationshipType}`;
    setRejected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const apply = async () => {
    setApplying(true);
    try {
      const whitelist = flatSuggestions
        .filter(s => !rejected.has(`${s.sourceId}|${s.targetId}|${s.relationshipType}`))
        .map(s => ({ sourceId: s.sourceId, targetId: s.targetId, type: s.relationshipType }));
      const res = await architectureAPI.healConnections(projectId, {
        mode: 'apply',
        minConfidence,
        whitelist,
      });
      toast.success(`Applied ${res.data.appliedCount} connections`);
      onApplied?.(res.data.appliedCount);
      onClose();
    } catch (err) {
      toast.error(`Apply failed: ${(err as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[640px] max-h-[80vh] flex flex-col bg-[#0f172a] border border-[#334155] rounded-lg shadow-xl">
        <div className="px-4 py-3 border-b border-[#334155] flex items-center gap-2">
          <Sparkles size={16} className="text-[#7c3aed]" />
          <span className="text-white font-medium">Heal Workspace</span>
          <span className="ml-auto text-xs text-slate-400">
            {data ? `${data.elementsAnalyzed} elements analyzed` : ''}
          </span>
        </div>

        <div className="px-4 py-2 border-b border-[#334155]">
          <label className="text-xs text-slate-300 flex items-center gap-2">
            Min Confidence: {minConfidence.toFixed(2)}
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="flex-1"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={16} /> Computing suggestions...
            </div>
          )}
          {!loading && flatSuggestions.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-sm">
              No isolated elements at this confidence threshold.
            </div>
          )}
          {!loading && flatSuggestions.map((s) => {
            const k = `${s.sourceId}|${s.targetId}|${s.relationshipType}`;
            const isRejected = rejected.has(k);
            return (
              <button
                key={k}
                onClick={() => toggle(s)}
                className={`w-full text-left px-3 py-2 mb-1 rounded border ${
                  isRejected ? 'border-slate-700 opacity-40' : 'border-[#334155] hover:bg-[#1e293b]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {!isRejected && <Check size={12} className="text-green-400" />}
                  <span className="text-sm text-white truncate flex-1">{s.targetName}</span>
                  <span className="text-xs text-slate-400">{s.relationshipType}</span>
                  <span className="text-xs text-slate-500 w-12 text-right">
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{s.reasoning}</div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-[#334155] flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={applying || acceptedCount === 0}
            className="ml-auto px-4 py-1.5 text-sm bg-[#7c3aed] text-white rounded hover:bg-[#8b5cf6] disabled:opacity-50 flex items-center gap-2"
          >
            {applying && <Loader2 className="animate-spin" size={12} />}
            Apply {acceptedCount} Connection{acceptedCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2 (legacy): Type-check**

```bash
cd /Users/mac_macee/javis/packages/client && npx tsc --noEmit
```

- [ ] **Step 8.3 (legacy): Commit** — single fat commit; use 8a/8b/8c above instead.

</details>

---

### Task 9: 3D Toolbar — "Heal Workspace" button

**Files:**
- Modify: the toolbar file located in Task 1.1 (likely `packages/client/src/components/3d/Toolbar.tsx` or near the 3D scene)

- [ ] **Step 9.1: Add a button next to X-Ray that opens the modal**

In the toolbar component, add a `useState` for `healOpen` and a button:

```tsx
import { Sparkles } from 'lucide-react';
import { HealWorkspaceModal } from '@/components/copilot/HealWorkspaceModal';

// inside component:
const [healOpen, setHealOpen] = useState(false);
const projectId = useArchitectureStore(s => s.currentProjectId); // or however it's read elsewhere

// in JSX, near the X-Ray toggle:
<button
  onClick={() => setHealOpen(true)}
  title="Heal Workspace — auto-connect isolated elements"
  className="..."
>
  <Sparkles size={14} />
</button>

{projectId && (
  <HealWorkspaceModal
    projectId={projectId}
    isOpen={healOpen}
    onClose={() => setHealOpen(false)}
    onApplied={(n) => {
      // refresh connections in the store
      useArchitectureStore.getState().refresh?.();
    }}
  />
)}
```

Verify the exact `currentProjectId` selector and the `refresh` action by reading the toolbar's existing imports — they will already access the store.

- [ ] **Step 9.2: Manual test on BSH demo**

1. Run `npm run dev`.
2. Open the BSH demo project.
3. Click the new "Heal Workspace" button.
4. Modal shows ~50 suggestions for the BSH project.
5. Tune the confidence slider, reject 1–2 suggestions, click Apply.
6. Modal closes, toast shows "Applied N connections", 3D scene updates with new lines.
7. Right-click the previously isolated stakeholder → Health is now ≥85%.

- [ ] **Step 9.3: Commit**

```bash
cd /Users/mac_macee/javis && git add packages/client/src/components/3d/<toolbar-file>.tsx
git commit -m "feat(3d-toolbar): add Heal Workspace button + modal integration"
```

---

### Task 10: End-to-end demo verification

- [ ] **Step 10.1: Restart server and client cleanly**

```bash
cd /Users/mac_macee/javis && npm run build && npm run dev
```

Expected: shared → server → client all compile. No type errors.

- [ ] **Step 10.2: Run all touched test suites**

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/connectionSuggestion.service.test.ts
cd /Users/mac_macee/javis/packages/server && npx jest blueprint || true   # only if blueprint tests exist
cd /Users/mac_macee/javis/packages/client && npx vitest run --reporter=basic
```

Expected: connectionSuggestion 4/4 pass; blueprint suite still green; client vitest green.

- [ ] **Step 10.3: Walkthrough of UC-CONN-001 Acceptance Criteria**

For each of UC-CONN-001 (THE-211) ACs and the per-REQ ACs:

| AC | How to verify |
|---|---|
| UC-AC-1: 0 isolated stakeholders after heal | Open BSH demo → Heal Workspace → Apply → click each stakeholder, check Health ≥80% |
| UC-AC-2: Confidence threshold tunable | Slider in modal, default 0.7, drag and watch list filter |
| UC-AC-3: Audit log per heal | Mongo query: `db.auditlogs.find({action:'heal_connections'}).sort({_id:-1}).limit(1)` returns the apply call |
| UC-AC-4: MiroFish uses new connections | Run a MiroFish simulation on BSH project; verify in the agent context that the new stakeholder→driver edges appear |
| UC-AC-5: Dry-run no persistence | `curl -X POST .../heal-connections -d '{"mode":"dryRun"}'` then `MATCH ()-[r:CONNECTS_TO]->() WHERE r.source='ai-heal' RETURN count(r)` is unchanged |
| UC-AC-6: Rate-limit | Two consecutive `apply` calls within 5 min — second should 429 (only verify if rate-limit middleware was wired in 4.2) |
| UC-AC-7: PropertyPanel persists | Click Suggested Connection in PropertyPanel → reload → connection still there |
| UC-AC-8: Blueprint default-applies | Generate a fresh blueprint via the existing blueprint UI → after generation completes, query connections — count > 0 |

- [ ] **Step 10.4: Update Linear**

Move THE-212 / THE-213 / THE-214 / THE-215 / THE-216 from `Backlog` to `In Review` (or `Done` after the BSH walkthrough). Move THE-211 to `In Review`.

```bash
# manual via Linear UI, or via the MCP linear tools
```

- [ ] **Step 10.5: Final commit & push**

```bash
cd /Users/mac_macee/javis && git status
git push origin feature/mirofish-context-grounding
```

---

## Out-of-Scope (do not implement here)

- Embedding-similarity in the confidence formula (mentioned as optional in REQ-CONN-001-01 AC-3) — leave the `// embedding similarity TBD` slot in `scorePair`.
- Auto-Delete of misplaced connections (REQ-CONN-001 Out-of-Scope).
- Cross-Workspace connection healing (separate UC).
- Rate-limit middleware retrofit if it requires non-trivial changes — fall back to "demo-only single user, lock postponed".

## Demo-Day Fallback (if anything in this plan blocks 2026-05-06)

If by 2026-05-04 EOD the heal endpoint is not stable, run this Cypher script directly against the BSH project to seed reasonable connections so the demo still looks vernetzt:

```cypher
MATCH (s:ArchitectureElement {projectId: $bshProjectId, type: 'stakeholder'})
MATCH (d:ArchitectureElement {projectId: $bshProjectId})
WHERE d.type IN ['driver', 'goal', 'principle']
WITH s, d LIMIT 200
CREATE (s)-[r:CONNECTS_TO {id: randomUUID(), type: 'influence', label: '', source: 'demo-seed'}]->(d);
```

Then ship just THE-214 (the PropertyPanel bugfix, smallest blast-radius) and revisit the rest after the demo.
