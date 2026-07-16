# Journey Slice 1 — Persistent World Shell + Model Station — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the additive v2 Journey shell in which the 3D World (the one architecture `<Canvas>`) never unmounts, with the Model station fully working, a Station Rail, and route-driven camera/sheet state — without touching the behavior of the classic UI.

**Architecture:** A new route namespace `/v2/project/:projectId/:station?` mounts `JourneyShell` (outside `MainLayout` — the shell owns its chrome). The shell mounts `Scene` exactly once; the `:station` URL param drives only camera framing and which Sheet is open. Project data loading is extracted from `ProjectView` into a shared hook so both shells stay in sync (DRY). Station is orthogonal to `viewMode`: station sets framing *intent*, `viewMode` keeps owning the projection.

**Tech Stack:** React 18 + TypeScript (strict), react-router-dom v7, Zustand, React Three Fiber + drei, Tailwind, Vitest 4 + React Testing Library (jsdom via per-file pragma).

**Linear:** [THE-482](https://linear.app/thearchitect/issue/THE-482/slice-1-persistent-world-shell-model-station) (child of Epic THE-481) · **Decisions:** `docs/adr/0005-spatial-journey-ui-restructure.md` · **Vocabulary:** `CONTEXT.md` (Phase, Station, On-ramp, World, Rail, Sheet)

**RVTM:** `docs/superpowers/rvtm/2026-07-15-journey-slice1-world-shell-rvtm.md`

---

## Context an implementing engineer needs (read first)

**The domain in 60 seconds.** TheArchitect renders an enterprise-architecture model as a 3D world (React Three Fiber). A project moves through 6 TOGAF ADM phases; `packages/client/src/stores/journeyStore.ts` already computes phase completion + `currentPhase` + a per-phase `nextAction`. ADR-0005 renames the phases for the UI surface: **Vision · Model · Explore · Plan · Govern · Track** (ADM label stays as a badge). A **Station** is the spatial home of a Phase: a camera framing + one primary CTA + Sheets. Slice 1 migrates only the **Model** station; other stations get a placeholder Sheet with an "Open in classic UI" escape hatch.

**Key facts about today's code (verified 2026-07-15):**

- There is exactly **one** architecture `<Canvas>`: `packages/client/src/components/3d/Scene.tsx` (default export, no props), mounted **only** in `packages/client/src/components/ui/ProjectView.tsx:201`. Two other `<Canvas>` instances exist (landing page, auth background) — decorative, ignore them.
- Navigation today unmounts the scene: routes swap through `<Outlet/>` in `packages/client/src/components/ui/MainLayout.tsx:57`.
- `ProjectView.tsx:56-124` owns project data loading (elements, connections, project meta, workspaces, envision data, violations, socket join + `violation:update` listener with 1s debounce). This effect must move to a shared hook.
- Camera fly-to lives in `packages/client/src/components/3d/ViewModeCamera.tsx`: module-level `flyTarget`/`flyProgress`, lerped in `useFrame`. Public helpers: `flyToElement`, `flyToWorkspace`, `fitToScreen`, `fitAllWorkspaces`. **Because this state is module-global, two live architecture canvases would fight — that's AC-6.**
- `viewMode` (`'3d' | '2d-topdown' | 'layer'`, `stores/uiStore.ts:5`) is live and owns the projection. Every fly-to helper branches on it. `flyToStation` must do the same (Station ⟂ viewMode).
- The Rail precedent is `packages/client/src/components/ui/PhaseBar.tsx` (rendered inside `Sidebar.tsx:182`); the one-CTA precedent is `design-system/patterns/NextStepBanner.tsx` (used in `ProjectView.tsx:239`). We build a new `StationRail` for v2 and leave both untouched.
- Tests: Vitest 4, config in `packages/client/vite.config.ts` (`environment: 'node'`, globals on). Component tests opt into jsdom with a `// @vitest-environment jsdom` first-line pragma and use RTL + `@testing-library/jest-dom/vitest` + `MemoryRouter` — copy the style of `src/components/ui/TrustSummaryWidget.test.tsx`.
- UI strings are **English** (repo rule). Dark theme, CSS vars like `var(--surface-raised)`, accent `#7c3aed`, action green `#00ff41`.

**Run commands from `packages/client/` unless stated otherwise.** Single test file: `npx vitest run src/path/to/file.test.ts`.

**What is explicitly OUT of scope (later slices — do not build):** semantic LOD, Compliance/Conformance merge, ⌘K palette, Sidebar/Toolbar removal, Genesis/Arrival on-ramps, cinematic two-tempo camera. No feature flag infra: the `/v2` URL namespace *is* the opt-in.

---

## Chunk 1: Foundations (Tasks 1–4)

Pure groundwork — vocabulary constants, the AC-6 guard, the shared data hook, the camera helper. No visible UI change until Chunk 2.

### Task 1: Station definitions (`stations.ts`)

The single source of truth for station keys, surface labels, ADM badges, phase mapping, and classic-UI escape routes.

**Files:**
- Create: `packages/client/src/components/journey/stations.ts`
- Test: `packages/client/src/components/journey/stations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/components/journey/stations.test.ts
import { describe, test, expect } from 'vitest';
import { STATIONS, DEFAULT_STATION, isStationKey, stationForPhase } from './stations';

describe('stations (ADR-0005 vocabulary)', () => {
  test('exposes the six CONTEXT.md stations in ADM order', () => {
    expect(STATIONS.map((s) => s.key)).toEqual(['vision', 'model', 'explore', 'plan', 'govern', 'track']);
    expect(STATIONS.map((s) => s.label)).toEqual(['Vision', 'Model', 'Explore', 'Plan', 'Govern', 'Track']);
    expect(STATIONS.map((s) => s.phase)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('every station carries an ADM badge', () => {
    // Hyphen, not en dash — must equal journeyStore's existing admLabel strings
    expect(STATIONS.map((s) => s.admBadge)).toEqual([
      'Phase A', 'Phases B-D', 'Phase E', 'Phase F', 'Phase G', 'Phase H',
    ]);
  });

  test('default station is model', () => {
    expect(DEFAULT_STATION).toBe('model');
  });

  test('isStationKey narrows correctly', () => {
    expect(isStationKey('govern')).toBe(true);
    expect(isStationKey('compliance')).toBe(false);
    expect(isStationKey(undefined)).toBe(false);
  });

  test('stationForPhase maps 1:1', () => {
    expect(stationForPhase(4).key).toBe('plan');
  });

  test('classic escape routes point into the old UI namespace', () => {
    for (const s of STATIONS) {
      expect(s.classicRoute('p1')).toMatch(/^\/project\/p1/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/journey/stations.test.ts`
Expected: FAIL — `Cannot find module './stations'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/components/journey/stations.ts
// ADR-0005 / CONTEXT.md: a Station is the spatial manifestation of a TOGAF ADM
// Phase — plain-language label on the surface, ADM reference as a badge.
// Arrival/Genesis are On-ramps, NOT stations, and never appear here.
import type { JourneyPhase } from '../../stores/journeyStore';

export type StationKey = 'vision' | 'model' | 'explore' | 'plan' | 'govern' | 'track';

export interface StationDef {
  key: StationKey;
  label: string;    // plain-language surface name (CONTEXT.md)
  admBadge: string; // TOGAF ADM reference, shown as a badge for professionals
  phase: JourneyPhase;
  /** Escape hatch: where this station's work lives in the classic UI today. */
  classicRoute: (projectId: string) => string;
}

export const STATIONS: StationDef[] = [
  { key: 'vision',  label: 'Vision',  admBadge: 'Phase A',    phase: 1, classicRoute: (id) => `/project/${id}` },
  { key: 'model',   label: 'Model',   admBadge: 'Phases B-D', phase: 2, classicRoute: (id) => `/project/${id}` }, // hyphen = journeyStore admLabel
  { key: 'explore', label: 'Explore', admBadge: 'Phase E',    phase: 3, classicRoute: (id) => `/project/${id}/compliance/standards` },
  { key: 'plan',    label: 'Plan',    admBadge: 'Phase F',    phase: 4, classicRoute: (id) => `/project/${id}/compliance/roadmap` },
  { key: 'govern',  label: 'Govern',  admBadge: 'Phase G',    phase: 5, classicRoute: (id) => `/project/${id}/compliance/policies` },
  { key: 'track',   label: 'Track',   admBadge: 'Phase H',    phase: 6, classicRoute: (id) => `/project/${id}/compliance/audit` },
];

export const DEFAULT_STATION: StationKey = 'model';

export function isStationKey(v: string | undefined): v is StationKey {
  return STATIONS.some((s) => s.key === v);
}

export function stationForPhase(phase: JourneyPhase): StationDef {
  // STATIONS covers all six JourneyPhase values 1..6 → find always succeeds.
  return STATIONS.find((s) => s.phase === phase)!;
}
```

Note: the classic routes reuse `journeyStore.getNextAction`'s route targets (`/compliance/standards`, `/compliance/roadmap`, `/compliance/policies`, `/compliance/audit` — see `journeyStore.ts:138-155`), which are known-good `CompliancePage` sections.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/journey/stations.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/stations.ts packages/client/src/components/journey/stations.test.ts
git commit -m "feat(journey): station definitions per ADR-0005 vocabulary (THE-482)"
```

---

### Task 2: Scene singleton guard (AC-6)

`ViewModeCamera`'s fly-to state is module-global. Two simultaneously mounted architecture canvases would fight over it. Add a counter that screams in the console if that ever happens.

**Files:**
- Create: `packages/client/src/components/3d/sceneSingleton.ts`
- Modify: `packages/client/src/components/3d/Scene.tsx` (add one `useEffect`)
- Test: `packages/client/src/components/3d/sceneSingleton.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/components/3d/sceneSingleton.test.ts
import { describe, test, expect, vi, afterEach } from 'vitest';
import { acquireSceneSlot, __liveSceneCount } from './sceneSingleton';

describe('scene singleton guard (ADR-0005 AC-6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('single mount acquires and releases cleanly', () => {
    const release = acquireSceneSlot();
    expect(__liveSceneCount()).toBe(1);
    release();
    expect(__liveSceneCount()).toBe(0);
  });

  test('second concurrent mount logs a loud error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r1 = acquireSceneSlot();
    expect(err).not.toHaveBeenCalled();
    const r2 = acquireSceneSlot();
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain('AC-6');
    r1(); r2();
    expect(__liveSceneCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/3d/sceneSingleton.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/components/3d/sceneSingleton.ts
// ADR-0005 AC-6 guardrail: ViewModeCamera keeps its fly-to target in
// module-level state, so two live architecture canvases would fight over the
// camera. "Parallel v2 shell" means route-level parallelism — v2 OR classic,
// never both mounted at once. This counter makes a violation impossible to miss.
let liveCount = 0;

export function acquireSceneSlot(): () => void {
  liveCount++;
  if (liveCount > 1) {
    console.error(
      `[ADR-0005 AC-6] ${liveCount} architecture canvases are mounted simultaneously. ` +
      'The ViewModeCamera fly-to singleton will misbehave. Mount the v2 JourneyShell ' +
      'OR the classic ProjectView — never both.',
    );
  }
  let released = false;
  return () => {
    if (!released) {
      released = true;
      liveCount--;
    }
  };
}

/** Test-only introspection. */
export function __liveSceneCount(): number {
  return liveCount;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/3d/sceneSingleton.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the guard into `Scene`**

In `packages/client/src/components/3d/Scene.tsx`: add to the imports (top of file, alongside the existing react imports):

```ts
import { useEffect } from 'react';
import { acquireSceneSlot } from './sceneSingleton';
```

(If `useEffect` is already imported, extend the existing import instead of duplicating it.)

Inside `export default function Scene() {` (line 42), as the **first** statement of the component body:

```ts
  // ADR-0005 AC-6: exactly one architecture canvas may live at a time.
  useEffect(() => acquireSceneSlot(), []);
```

- [ ] **Step 6: Type-check and run the full client test suite**

Run: `npx tsc -b && npx vitest run`
Expected: type-check clean; all existing tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/3d/sceneSingleton.ts packages/client/src/components/3d/sceneSingleton.test.ts packages/client/src/components/3d/Scene.tsx
git commit -m "feat(3d): scene singleton guard — one architecture canvas at a time (THE-482 AC-6)"
```

---

### Task 3: Extract project data loading into `useProjectData` (AC-2, AC-7)

Move the data-loading effect out of `ProjectView` into a hook used by **both** shells. Behavior must be byte-for-byte identical for the classic UI.

**Files:**
- Create: `packages/client/src/hooks/useProjectData.ts`
- Modify: `packages/client/src/components/ui/ProjectView.tsx` (delete inline effect, call hook)
- Test: `packages/client/src/hooks/useProjectData.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/hooks/useProjectData.test.tsx
// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getElements = vi.fn();
const getConnections = vi.fn();
const getProject = vi.fn();
const listWorkspaces = vi.fn();
vi.mock('../services/api', () => ({
  architectureAPI: {
    getElements: (...a: unknown[]) => getElements(...a),
    getConnections: (...a: unknown[]) => getConnections(...a),
  },
  projectAPI: { get: (...a: unknown[]) => getProject(...a) },
  workspaceAPI: { list: (...a: unknown[]) => listWorkspaces(...a) },
}));

const socketOn = vi.fn();
const socketOff = vi.fn();
vi.mock('../services/socket', () => ({
  connectSocket: () => ({ on: socketOn }),
  joinProject: vi.fn(),
  getSocket: () => ({ off: socketOff }),
}));

// envision/compliance loads fire-and-forget network calls — stub the stores' load fns
import { useEnvisionStore } from '../stores/envisionStore';
import { useComplianceStore } from '../stores/complianceStore';
import { useArchitectureStore } from '../stores/architectureStore';
import { useProjectData } from './useProjectData';

const ok = (data: unknown) => Promise.resolve({ data: { data } });

beforeEach(() => {
  getElements.mockReset().mockReturnValue(ok([{ id: 'e1', name: 'App', type: 'application_component', layer: 'application', position3D: { x: 0, y: 8, z: 0 } }]));
  getConnections.mockReset().mockReturnValue(ok([]));
  getProject.mockReset().mockReturnValue(ok({ name: 'Acme' }));
  listWorkspaces.mockReset().mockReturnValue(ok([]));
  socketOn.mockReset();
  useEnvisionStore.setState({ load: vi.fn() } as never);
  useComplianceStore.setState({ loadViolations: vi.fn() } as never);
});

describe('useProjectData (ADR-0005 AC-2)', () => {
  test('loads project data into the stores and resolves loading', async () => {
    const { result } = renderHook(() => useProjectData('p1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(useArchitectureStore.getState().elements).toHaveLength(1);
    expect(useArchitectureStore.getState().projectId).toBe('p1');
    expect(socketOn).toHaveBeenCalledWith('violation:update', expect.any(Function));
  });

  test('surfaces load failures as error', async () => {
    getElements.mockReturnValue(Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useProjectData('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load project data');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useProjectData.test.tsx`
Expected: FAIL — `Cannot find module './useProjectData'`.

- [ ] **Step 3: Create the hook — move the effect body verbatim**

Create `packages/client/src/hooks/useProjectData.ts`. The `useEffect` body is **moved, not rewritten**, from `ProjectView.tsx:56-124` (same promises, same debounce, same cleanup). Only the store setters move inside the hook:

```ts
// packages/client/src/hooks/useProjectData.ts
// Owns project bootstrap: elements, connections, project meta, workspaces,
// envision data, violations, socket join + violation:update listener.
// Extracted from ProjectView (ADR-0005 AC-2) so the classic UI and the v2
// JourneyShell share one loading path. Behavior is identical to the old
// inline effect — if you change semantics here, you change both shells.
import { useEffect, useState } from 'react';
import { useArchitectureStore } from '../stores/architectureStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useEnvisionStore } from '../stores/envisionStore';
import { useComplianceStore } from '../stores/complianceStore';
import { architectureAPI, projectAPI, workspaceAPI } from '../services/api';
import { connectSocket, joinProject, getSocket } from '../services/socket';

export function useProjectData(projectId: string | undefined) {
  const setElements = useArchitectureStore((s) => s.setElements);
  const setConnections = useArchitectureStore((s) => s.setConnections);
  const setProjectId = useArchitectureStore((s) => s.setProjectId);
  const setProjectName = useArchitectureStore((s) => s.setProjectName);
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setProjectId(projectId);

    let cancelled = false;
    let violationDebounce: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);

    Promise.all([
      architectureAPI.getElements(projectId),
      architectureAPI.getConnections(projectId),
      projectAPI.get(projectId),
      workspaceAPI.list(projectId).catch(() => ({ data: { data: [] } })),
    ])
      .then(([elemRes, connRes, projRes, wsRes]) => {
        if (cancelled) return;
        setElements(elemRes.data.data || []);
        setConnections(connRes.data.data || []);
        setProjectName(projRes.data.data?.name || projRes.data.name || null);
        const serverWorkspaces = wsRes.data.data || [];
        if (serverWorkspaces.length > 0) {
          setWorkspaces(serverWorkspaces.map((ws: any) => ({
            id: ws._id || ws.id,
            name: ws.name,
            projectId: ws.projectId,
            source: ws.source,
            color: ws.color,
            offsetX: ws.offsetX,
            createdAt: ws.createdAt,
          })));
        }

        // Load envision data (vision + stakeholders) for Phase A
        useEnvisionStore.getState().load(projectId);

        // Load policy violations for real-time compliance visualization
        useComplianceStore.getState().loadViolations(projectId);

        // Connect WebSocket and listen for violation updates (debounced to prevent request storms)
        const sock = connectSocket();
        joinProject(projectId);
        sock.on('violation:update', (data: { projectId: string }) => {
          if (data.projectId === projectId) {
            if (violationDebounce) clearTimeout(violationDebounce);
            violationDebounce = setTimeout(() => {
              useComplianceStore.getState().loadViolations(projectId);
            }, 1000);
          }
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error('Failed to load project data:', err);
        setError('Failed to load project data');
        setElements([]);
        setConnections([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (violationDebounce) clearTimeout(violationDebounce);
      const sock = getSocket();
      if (sock) sock.off('violation:update');
    };
  }, [projectId, setElements, setConnections, setProjectId, setProjectName, setWorkspaces]);

  return { loading, error };
}
```

- [ ] **Step 4: Run the hook test**

Run: `npx vitest run src/hooks/useProjectData.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `ProjectView` to use the hook**

In `packages/client/src/components/ui/ProjectView.tsx`:

1. Add import: `import { useProjectData } from '../../hooks/useProjectData';`
2. Replace the local state pair (lines 41-42) `const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);` with `const { loading, error } = useProjectData(projectId);`
3. Delete the entire data `useEffect` block (`ProjectView.tsx:56-124`).
4. Remove now-unused imports/selectors: `setElements`, `setConnections`, `setProjectId`, `setProjectName`, `setWorkspaces` selector lines (24-28), `useWorkspaceStore`, `useEnvisionStore`, `useComplianceStore` **only if** no other usage remains in the file (check: `useComplianceStore` — ProjectView does not use it elsewhere; `useEnvisionStore` — not elsewhere; `useWorkspaceStore` — not elsewhere), plus `architectureAPI, projectAPI, workspaceAPI` and `connectSocket, joinProject, getSocket` imports. Keep `useState` (still used by `dismissedEmpty`).

The rendered output of `ProjectView` must not change.

- [ ] **Step 6: Type-check, lint, full test run**

Run: `npx tsc -b && npx eslint src/components/ui/ProjectView.tsx src/hooks/useProjectData.ts && npx vitest run`
Expected: all clean/PASS. (TS will flag any unused import you missed in Step 5.)

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/hooks/useProjectData.ts packages/client/src/hooks/useProjectData.test.tsx packages/client/src/components/ui/ProjectView.tsx
git commit -m "refactor(client): extract project bootstrap into useProjectData hook (THE-482 AC-2)"
```

---

### Task 4: `flyToStation` camera framing (Station ⟂ viewMode)

One new exported helper in `ViewModeCamera.tsx`, following the exact conventions of the existing helpers: branch on `viewMode`, set `flyTarget`, reset `flyProgress`.

**Files:**
- Modify: `packages/client/src/components/3d/ViewModeCamera.tsx` (append after `fitAllWorkspaces`, ~line 200)
- Test: `packages/client/src/components/3d/flyToStation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/components/3d/flyToStation.test.ts
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';

// ViewModeCamera imports R3F/drei for its component half — neutralize for node-side testing.
vi.mock('@react-three/fiber', () => ({ useThree: () => ({}), useFrame: () => {} }));
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  OrthographicCamera: () => null,
  PerspectiveCamera: () => null,
}));

import { flyToStation, __getFlyTargetForTests } from './ViewModeCamera';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';

// Include layer/type: the 2D branch delegates to fitToScreen → computeViewPositions,
// which reads elements from the architectureStore and needs these fields.
const elements = [
  { id: 'a', name: 'A', type: 'application_component', layer: 'application', position3D: { x: 0, y: 0, z: 0 } },
  { id: 'b', name: 'B', type: 'node', layer: 'technology', position3D: { x: 10, y: 8, z: 10 } },
];

beforeEach(() => {
  useUIStore.setState({ viewMode: '3d' });
  // Seed the store: the non-3d branch of flyToStation reads elements from here.
  useArchitectureStore.setState({ elements: elements as never });
});

describe('flyToStation (ADR-0005: Station ⟂ viewMode)', () => {
  test('frames the model center in 3d mode', () => {
    flyToStation('model', elements);
    const t = __getFlyTargetForTests();
    expect(t).not.toBeNull();
    // lookAt = element centroid
    expect(t!.lookAt.x).toBeCloseTo(5);
    expect(t!.lookAt.z).toBeCloseTo(5);
  });

  test('different stations produce different framings', () => {
    flyToStation('model', elements);
    const model = __getFlyTargetForTests()!.position.clone();
    flyToStation('track', elements);
    const track = __getFlyTargetForTests()!.position.clone();
    expect(model.distanceTo(track)).toBeGreaterThan(1);
  });

  test('no-op on empty world: fly target is left untouched', () => {
    flyToStation('model', elements);
    const before = __getFlyTargetForTests();
    flyToStation('track', []); // empty world → must not touch the target
    expect(__getFlyTargetForTests()).toBe(before);
  });

  test('in 2d/layer mode the projection wins: top-down framing', () => {
    useUIStore.setState({ viewMode: '2d-topdown' });
    flyToStation('plan', elements);
    const t = __getFlyTargetForTests();
    // top-down: camera directly above, per existing fitToScreen convention
    expect(t!.position.y).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/3d/flyToStation.test.ts`
Expected: FAIL — `flyToStation` / `__getFlyTargetForTests` not exported.

Note: the store seeding in `beforeEach` is mandatory — the 2d-topdown branch delegates to `fitToScreen`, which reads `useArchitectureStore.getState().elements` (not the function argument) via `computeViewPositions`; without seeding it silently no-ops and the y=80 assertion sees the previous test's target. If `computeViewPositions` requires further `Element` fields at runtime, extend the fixtures accordingly.

- [ ] **Step 3: Implement `flyToStation`**

Append to `packages/client/src/components/3d/ViewModeCamera.tsx` directly after `fitAllWorkspaces` (before the layer-navigation helpers, ~line 200):

```ts
// ─── Station framing (ADR-0005 / THE-482) ─────────────────────────────
// A Station sets the camera framing *intent*; viewMode keeps owning the
// projection (Station ⟂ viewMode). In 2D/layer the top-down constraint wins,
// exactly like the other fly-to helpers above — we delegate to fitToScreen.
import type { StationKey } from '../journey/stations';

const STATION_FRAMING: Record<StationKey, { dir: [number, number, number]; distFactor: number }> = {
  vision:  { dir: [0.0, 0.9, 0.8],   distFactor: 2.2 }, // elevated far total — see the whole intent
  model:   { dir: [0.6, 0.5, 0.6],   distFactor: 1.5 }, // the working angle (matches fitToScreen)
  explore: { dir: [0.2, 1.2, 0.4],   distFactor: 1.7 }, // high inspection view
  plan:    { dir: [1.1, 0.35, 0.5],  distFactor: 1.8 }, // dramatic side — world under load
  govern:  { dir: [-0.6, 0.9, 0.6],  distFactor: 1.8 }, // elevated opposite side
  track:   { dir: [0.0, 0.6, 1.2],   distFactor: 2.4 }, // far front total — the timeline view
};

export function flyToStation(
  station: StationKey,
  elements: { id?: string; position3D: { x: number; y: number; z: number } }[],
) {
  if (elements.length === 0) return;
  const viewMode = useUIStore.getState().viewMode;

  if (viewMode !== '3d') {
    // Projection wins: 2D/layer users get the same top-down fit they get today.
    fitToScreen(elements);
    return;
  }

  const center = new THREE.Vector3();
  for (const el of elements) {
    center.add(new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z));
  }
  center.divideScalar(elements.length);

  let maxDist = 0;
  for (const el of elements) {
    const d = center.distanceTo(new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z));
    if (d > maxDist) maxDist = d;
  }

  const f = STATION_FRAMING[station];
  const distance = Math.max(maxDist * f.distFactor, 15);
  const dir = new THREE.Vector3(f.dir[0], f.dir[1], f.dir[2]).normalize();
  flyTarget = {
    position: center.clone().add(dir.multiplyScalar(distance)),
    lookAt: center,
  };
  flyProgress = 0;
}

/** Test-only introspection of the module-level fly target. */
export function __getFlyTargetForTests(): CameraTarget | null {
  return flyTarget;
}
```

Move the `import type { StationKey }` line up to the import block at the top of the file (TS wants imports first; shown inline above only for locality). No import cycle: `journey/stations.ts` imports only `journeyStore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/3d/flyToStation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check + full suite, commit**

Run: `npx tsc -b && npx vitest run`
Expected: clean / all PASS.

```bash
git add packages/client/src/components/3d/ViewModeCamera.tsx packages/client/src/components/3d/flyToStation.test.ts
git commit -m "feat(3d): flyToStation camera framing, station-orthogonal to viewMode (THE-482)"
```

---

## Chunk 2: Shell & Verification (Tasks 5–8)

The visible v2 surface: Rail, Sheets, the persistent shell itself, and the end-to-end proof of all seven ACs.

### Task 5: `StationRail` — the Rail + the one CTA (AC-3)

New v2 navigator: six stations, plain labels + ADM badge, done/current state from `journeyStore`, free jumping (never locked), and `NextStepBanner` as the single CTA pointing at the recommended station. `PhaseBar`/Sidebar stay untouched.

**Files:**
- Create: `packages/client/src/components/journey/StationRail.tsx`
- Test: `packages/client/src/components/journey/StationRail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/components/journey/StationRail.test.tsx
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useJourneyStore, type PhaseInfo } from '../../stores/journeyStore';
import StationRail from './StationRail';

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

const phase = (p: number, isDone: boolean, nextAction: PhaseInfo['nextAction'] = null): PhaseInfo => ({
  phase: p as PhaseInfo['phase'],
  admLabel: `P${p}`,
  name: `Phase ${p}`,
  description: '',
  isDone,
  progress: { current: 0, target: 1, label: '' },
  nextAction,
});

beforeEach(() => {
  // Freeze recompute so seeded state survives the mount effect.
  useJourneyStore.setState({
    recompute: vi.fn(),
    currentPhase: 2,
    phases: [
      phase(1, true),
      phase(2, false, { label: 'Add Connections', route: '__connection_mode__' }),
      phase(3, false), phase(4, false), phase(5, false), phase(6, false),
    ],
  } as never);
});

const renderRail = (station = 'model') =>
  render(
    <MemoryRouter initialEntries={[`/v2/project/p1/${station}`]}>
      <Routes>
        <Route path="/v2/project/:projectId/:station?" element={<><StationRail projectId="p1" station={station as never} /><LocationDisplay /></>} />
      </Routes>
    </MemoryRouter>,
  );

describe('StationRail (ADR-0005 AC-3)', () => {
  test('renders all six stations with plain labels and ADM badges', () => {
    renderRail();
    for (const label of ['Vision', 'Model', 'Explore', 'Plan', 'Govern', 'Track']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText('Phases B-D')).toBeInTheDocument();
  });

  test('free jumping: every station is clickable, even undone ones (no lock)', () => {
    renderRail('model');
    fireEvent.click(screen.getByRole('button', { name: /Track/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/v2/project/p1/track');
  });

  test('current station is marked', () => {
    renderRail('model');
    expect(screen.getByRole('button', { name: /Model/ })).toHaveAttribute('aria-current', 'true');
  });

  test('shows the one CTA from journeyStore.nextAction', () => {
    renderRail();
    expect(screen.getByText('Add Connections')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/journey/StationRail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StationRail`**

```tsx
// packages/client/src/components/journey/StationRail.tsx
// The Rail (CONTEXT.md): the visible Phase navigator of the v2 shell. Shows
// the path, marks progress, is ALWAYS freely jumpable (ADR-0005: free map +
// suggestion, no lock). Tools do not live here.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import NextStepBanner from '../../design-system/patterns/NextStepBanner';
import { STATIONS, stationForPhase, type StationKey } from './stations';

interface Props {
  projectId: string;
  station: StationKey;
}

export default function StationRail({ projectId, station }: Props) {
  const navigate = useNavigate();
  const { phases, currentPhase, recompute } = useJourneyStore();
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);
  const snapshots = useComplianceStore((s) => s.snapshots);

  // Same recompute trigger pattern as PhaseBar.tsx:36-37.
  useEffect(() => {
    if (projectId) recompute(projectId);
  }, [projectId, elements.length, connections.length, pipelineStates, snapshots, recompute]);

  const currentPhaseInfo = phases.find((p) => p.phase === currentPhase);
  const doneByPhase = new Map(phases.map((p) => [p.phase, p.isDone]));

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none">
      {/* The one CTA: recommended next step (suggestion, not a lock).
          Slice 1: navigational only — it flies to the recommended station.
          Executing the action itself (connection mode, envision fields, …)
          needs that station's tools in v2 → later slices. Don't "fix" this. */}
      {currentPhaseInfo?.nextAction && (
        <div className="w-[420px] max-w-[90vw] pointer-events-auto">
          <NextStepBanner
            message={`${stationForPhase(currentPhase).label} — ${currentPhaseInfo.description}`}
            actionLabel={currentPhaseInfo.nextAction.label}
            onAction={() => navigate(`/v2/project/${projectId}/${stationForPhase(currentPhase).key}`)}
            className="backdrop-blur-md bg-[var(--surface-base)]/80 shadow-lg"
          />
        </div>
      )}

      {/* The Rail */}
      <nav
        aria-label="Journey stations"
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)]/85 backdrop-blur-md px-2 py-1.5 shadow-lg"
      >
        {STATIONS.map((s) => {
          const isCurrent = s.key === station;
          const isDone = doneByPhase.get(s.phase) ?? false;
          return (
            <button
              key={s.key}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => navigate(`/v2/project/${projectId}/${s.key}`)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${
                isCurrent
                  ? 'bg-[#00ff41]/10 text-[#00ff41]'
                  : isDone
                    ? 'text-[var(--text-secondary)] hover:text-white'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isCurrent ? 'bg-[#00ff41]' : isDone ? 'bg-[#a78bfa]' : 'bg-[var(--border-default)]'
                }`}
              />
              <span className="font-medium">{s.label}</span>
              <span className="text-[9px] font-mono uppercase tracking-wide text-[var(--text-tertiary)]">
                {s.admBadge}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
```

Check `NextStepBanner`'s prop names before implementing (`design-system/patterns/NextStepBanner.tsx`, 26 LOC): it takes `message`, `actionLabel`, `onAction`, `className` (as used in `ProjectView.tsx:239-256`). If they differ, follow the component.

**Deliberate Slice-1 scope decision:** the CTA is *navigational only* — it flies you to the recommended station; it does not execute the action itself (e.g. `__connection_mode__`, envision field highlighting — see the dispatch logic in `ProjectView.tsx:242-253`). Executing actions requires the target station's tools to exist in v2, which is later-slice work. Keep the comment in the code so nobody "fixes" this prematurely.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/journey/StationRail.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/StationRail.tsx packages/client/src/components/journey/StationRail.test.tsx
git commit -m "feat(journey): StationRail — free-jump rail + single nextAction CTA (THE-482 AC-3)"
```

---

### Task 6: `StationSheet` — placeholder Sheet for not-yet-migrated stations

A Sheet (CONTEXT.md) that slides over the World for stations that arrive in later slices. It is the station's mandatory empty state: it names the station, admits what's missing, and offers the classic-UI escape hatch.

**Files:**
- Create: `packages/client/src/components/journey/StationSheet.tsx`
- Test: `packages/client/src/components/journey/StationSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/components/journey/StationSheet.test.tsx
// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import StationSheet from './StationSheet';

describe('StationSheet placeholder (ADR-0005: empty states are mandatory)', () => {
  test('names the station, shows ADM badge, links to classic UI', () => {
    render(
      <MemoryRouter>
        <StationSheet station="govern" projectId="p1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Govern' })).toBeInTheDocument();
    expect(screen.getByText('Phase G')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /classic/i });
    expect(link).toHaveAttribute('href', '/project/p1/compliance/policies');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/journey/StationSheet.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StationSheet`**

```tsx
// packages/client/src/components/journey/StationSheet.tsx
// A Sheet (CONTEXT.md): a DOM overlay that slides over the World — it never
// unmounts the scene and never changes route by itself. In Slice 1 this is
// the placeholder + escape hatch for stations that migrate in later slices.
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { STATIONS, type StationKey } from './stations';

interface Props {
  station: StationKey;
  projectId: string;
}

export default function StationSheet({ station, projectId }: Props) {
  const def = STATIONS.find((s) => s.key === station)!;
  return (
    <div className="absolute right-0 top-0 bottom-0 z-20 flex pointer-events-none">
      <div className="w-[420px] max-w-[40vw] min-w-[300px] pointer-events-auto flex flex-col border-l border-[var(--border-default)] bg-[var(--surface-raised)]/95 backdrop-blur-md shadow-2xl p-6">
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-lg font-bold text-white">{def.label}</h2>
          <span className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
            {def.admBadge}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)] mb-6">
          This station moves into the Journey shell in a later slice. Your work and data
          are untouched — everything is available in the classic UI today.
        </p>
        <Link
          to={def.classicRoute(projectId)}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-2 text-sm font-medium text-[#a78bfa] transition hover:bg-[#7c3aed]/20"
        >
          Open in classic UI <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/journey/StationSheet.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/StationSheet.tsx packages/client/src/components/journey/StationSheet.test.tsx
git commit -m "feat(journey): StationSheet placeholder with classic-UI escape hatch (THE-482)"
```

---

### Task 7: `JourneyShell` + `/v2` routes — the persistent World (AC-1, AC-4, AC-5, AC-7)

The shell itself: mounts `Scene` once outside any station-keyed subtree, drives camera from the `:station` param, hosts the Rail, the placeholder Sheets, and `PropertyPanel` as an overlay Sheet.

**Files:**
- Create: `packages/client/src/components/journey/JourneyShell.tsx`
- Modify: `packages/client/src/App.tsx` (add `/v2` route)
- Test: `packages/client/src/components/journey/JourneyShell.test.tsx`

- [ ] **Step 1: Write the failing tests (persistence + deep links + property sheet)**

```tsx
// packages/client/src/components/journey/JourneyShell.test.tsx
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// ── Mocks: the shell's heavy edges. The routing/persistence logic stays real. ──
// NOTE: async factory + dynamic import — the package is ESM ("type": "module"),
// so `require` does not exist at runtime inside hoisted vi.mock factories.
let sceneMounts = 0;
let sceneUnmounts = 0;
vi.mock('../3d/Scene', async () => {
  const React = await import('react');
  return {
    default: function MockScene() {
      React.useEffect(() => {
        sceneMounts++;
        return () => { sceneUnmounts++; };
      }, []);
      return <div data-testid="scene" />;
    },
  };
});

const flyToStation = vi.fn();
vi.mock('../3d/ViewModeCamera', () => ({ flyToStation: (...a: unknown[]) => flyToStation(...a) }));

vi.mock('../../hooks/useProjectData', () => ({
  useProjectData: () => ({ loading: false, error: null }),
}));

vi.mock('../ui/PropertyPanel', () => ({ default: () => <aside data-testid="property-panel" /> }));

import { useArchitectureStore } from '../../stores/architectureStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { useUIStore } from '../../stores/uiStore';
import JourneyShell from './JourneyShell';

function NavProbe() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (
    <>
      <div data-testid="loc">{loc.pathname}</div>
      <button data-testid="go-govern" onClick={() => navigate('/v2/project/p1/govern')}>go</button>
    </>
  );
}

const renderShell = (initial = '/v2/project/p1') =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/v2/project/:projectId/:station?"
          element={<><JourneyShell /><NavProbe /></>}
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  sceneMounts = 0;
  sceneUnmounts = 0;
  flyToStation.mockReset();
  useArchitectureStore.setState({
    elements: [{ id: 'e1', position3D: { x: 0, y: 0, z: 0 } }] as never,
  });
  useJourneyStore.setState({ recompute: vi.fn(), phases: [], currentPhase: 1 } as never);
  useUIStore.setState({ isPropertyPanelOpen: false });
});

describe('JourneyShell (ADR-0005)', () => {
  test('AC-5: /v2/project/p1 resolves to the model station', () => {
    renderShell('/v2/project/p1');
    expect(flyToStation).toHaveBeenCalledWith('model', expect.any(Array));
    expect(screen.getByTestId('scene')).toBeInTheDocument();
  });

  test('AC-5: station deep-link sets the camera for that station', () => {
    renderShell('/v2/project/p1/track');
    expect(flyToStation).toHaveBeenCalledWith('track', expect.any(Array));
  });

  test('AC-1: navigating between stations never remounts the Scene', () => {
    renderShell('/v2/project/p1/model');
    expect(sceneMounts).toBe(1);
    fireEvent.click(screen.getByTestId('go-govern'));
    expect(screen.getByTestId('loc')).toHaveTextContent('/v2/project/p1/govern');
    expect(sceneMounts).toBe(1);
    expect(sceneUnmounts).toBe(0);
    expect(flyToStation).toHaveBeenLastCalledWith('govern', expect.any(Array));
  });

  test('AC-4: PropertyPanel appears as an overlay Sheet without a route change', () => {
    renderShell('/v2/project/p1/model');
    expect(screen.queryByTestId('property-panel')).not.toBeInTheDocument();
    act(() => {
      useUIStore.setState({ isPropertyPanelOpen: true });
    });
    expect(screen.getByTestId('property-panel')).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/v2/project/p1/model');
    expect(sceneUnmounts).toBe(0);
  });

  test('placeholder Sheet shows for non-migrated stations, not for model', () => {
    // getByRole, not getByText(/classic/i): the header's "Back to classic UI"
    // and the sheet's body copy would make a text query ambiguous.
    const { unmount } = renderShell('/v2/project/p1/govern');
    expect(screen.getByRole('link', { name: /open in classic ui/i })).toBeInTheDocument();
    unmount(); // screen queries span document.body — unmount before the second render
    renderShell('/v2/project/p1/model');
    expect(screen.queryByRole('link', { name: /open in classic ui/i })).not.toBeInTheDocument();
  });

  test('invalid station param falls back to model (canonical redirect)', () => {
    renderShell('/v2/project/p1/nonsense');
    // Exact match — a substring assertion would also pass on the
    // un-redirected '/v2/project/p1/nonsense' and verify nothing.
    expect(screen.getByTestId('loc').textContent).toMatch(/^\/v2\/project\/p1$/);
  });
});
```

Note on the `MockScene` factory: Vitest hoists `vi.mock` factories above imports; the async `await import('react')` form is required because the client package is ESM (`"type": "module"`) — `require` is undefined at runtime inside the factory.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/journey/JourneyShell.test.tsx`
Expected: FAIL — `JourneyShell` not found.

- [ ] **Step 3: Implement `JourneyShell`**

```tsx
// packages/client/src/components/journey/JourneyShell.tsx
// The v2 Journey shell (ADR-0005, THE-482): ONE persistent World. The Scene
// mounts here exactly once and never unmounts on station changes — the
// :station route param drives only camera framing and which Sheet is open.
// This component deliberately does NOT live under MainLayout: the shell owns
// its own (minimal) chrome. Classic UI stays untouched (additive v2).
import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import Scene from '../3d/Scene';
import PropertyPanel from '../ui/PropertyPanel';
import StationRail from './StationRail';
import StationSheet from './StationSheet';
import { useProjectData } from '../../hooks/useProjectData';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { flyToStation } from '../3d/ViewModeCamera';
import { DEFAULT_STATION, isStationKey, type StationKey } from './stations';

export default function JourneyShell() {
  const { projectId, station: stationParam } = useParams<{ projectId: string; station: string }>();
  const { loading, error } = useProjectData(projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const projectName = useArchitectureStore((s) => s.projectName);
  const isPropertyPanelOpen = useUIStore((s) => s.isPropertyPanelOpen);

  const station: StationKey = isStationKey(stationParam) ? stationParam : DEFAULT_STATION;

  // Station drives the camera framing — and nothing else about how the world
  // is drawn (Station ⟂ viewMode). Deliberately NOT depending on `elements`:
  // we reframe on arrival at a station, not on every model edit.
  useEffect(() => {
    if (!loading && elements.length > 0) {
      flyToStation(station, elements);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, loading]);

  // Canonical URL for junk station params (AC-5 deep-link hygiene).
  if (stationParam && !isStationKey(stationParam)) {
    return <Navigate to={`/v2/project/${projectId}`} replace />;
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-base)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[#00ff41]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-base)]">
        <span className="text-sm text-red-400">{error}</span>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--surface-base)]">
      {/* The World — mounted once, never keyed by station */}
      <Scene />

      {/* Minimal HUD chrome */}
      <header className="absolute left-4 top-3 z-30 flex items-center gap-2 text-xs">
        <span className="font-semibold text-white">{projectName ?? 'Project'}</span>
        <span className="rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#a78bfa]">
          Journey beta
        </span>
        <Link to={`/project/${projectId}`} className="text-[var(--text-tertiary)] underline-offset-2 hover:text-white hover:underline">
          Back to classic UI
        </Link>
      </header>

      {/* Empty world: point at the classic on-ramp (Genesis arrives in Slice 5) */}
      {elements.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/90 p-6 text-center backdrop-blur-md">
            <p className="mb-3 text-sm text-[var(--text-secondary)]">No architecture yet.</p>
            <Link
              to={`/project/${projectId}/blueprint`}
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#6d31d4]"
            >
              Generate with AI →
            </Link>
          </div>
        </div>
      )}

      {/* Station Sheet: placeholder for stations that migrate in later slices */}
      {station !== 'model' && projectId && <StationSheet station={station} projectId={projectId} />}

      {/* PropertyPanel as an overlay Sheet (AC-4) — same component, new posture */}
      {isPropertyPanelOpen && (
        <div className="absolute bottom-0 right-0 top-0 z-30 flex">
          <PropertyPanel />
        </div>
      )}

      {/* The Rail + the one CTA */}
      {projectId && <StationRail projectId={projectId} station={station} />}
    </div>
  );
}
```

- [ ] **Step 4: Register the `/v2` route in `App.tsx`**

In `packages/client/src/App.tsx`:

1. Add import: `import JourneyShell from './components/journey/JourneyShell';`
2. After the protected `MainLayout` route block (after line 72's closing `</Route>`), add:

```tsx
      {/* Journey v2 shell (ADR-0005, THE-482) — additive, opt-in via /v2 URL.
          Outside MainLayout on purpose: the shell owns its chrome. */}
      <Route
        path="/v2/project/:projectId/:station?"
        element={
          <ProtectedRoute>
            <JourneyShell />
          </ProtectedRoute>
        }
      />
```

(react-router v7 supports optional `:station?` segments. If the router version in `package.json` were ever downgraded below 6.5, split into two nested routes instead.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/journey/JourneyShell.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Type-check, lint, full suite**

Run: `npx tsc -b && npx eslint src/components/journey src/App.tsx && npx vitest run`
Expected: clean / all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/journey/JourneyShell.tsx packages/client/src/components/journey/JourneyShell.test.tsx packages/client/src/App.tsx
git commit -m "feat(journey): persistent JourneyShell + /v2 routes — World never unmounts (THE-482 AC-1/4/5/7)"
```

---

### Task 8: End-to-end verification + closeout

No new code. Prove the ACs in a real browser, run the full gate, and close the loop.

**Files:**
- Modify (docs only): this plan's checkboxes; RVTM evidence column.

- [ ] **Step 1: Full client gate**

Run from `packages/client/`: `npx tsc -b && npx eslint src/ && npx vitest run`
Expected: 0 type errors, 0 lint errors, all tests PASS.

- [ ] **Step 2: Build the client**

Run from repo root: `npm run build`
Expected: build succeeds (shared → server → client). Vite build completes without errors.

- [ ] **Step 3: Browser verification (AC-1, AC-4, AC-6, AC-7)**

Start the stack: `npm run dev` from repo root (client on port 3000, `/api` proxied). Log in, note a real project id `<PID>` from the dashboard URL.

1. **AC-7 (classic untouched):** Open `/project/<PID>` — classic UI works exactly as before: scene renders, sidebar, toolbar, property panel on element click.
2. **AC-1 (persistence):** Open `/v2/project/<PID>`. In DevTools console: `window.__c = document.querySelector('canvas')`. Click through all six Rail stations. Then: `document.querySelector('canvas') === window.__c` → must print `true`. No white flash, no scene reload; camera visibly reframes per station.
3. **AC-5 (deep links):** Hard-load `/v2/project/<PID>/govern` — Govern placeholder Sheet + camera framing appear directly. Hard-load `/v2/project/<PID>/nonsense` — URL normalizes to `/v2/project/<PID>`.
4. **AC-4 (property sheet):** In the Model station, click an element — PropertyPanel slides over the world; URL unchanged; scene still live behind it.
5. **AC-6 (guardrail):** Console shows **no** `[ADR-0005 AC-6]` error anywhere in the session. (Navigating `/v2/...` → `/project/<PID>` swaps shells; the counter must never exceed 1.)
6. **Station ⟂ viewMode sanity:** In classic UI switch to 2D top-down (toolbar), go back to `/v2/...` — station clicks still work, camera stays top-down (projection wins).

Record each result in the RVTM evidence column.

- [ ] **Step 4: Commit any doc updates + update Linear**

```bash
git add docs/superpowers/plans/2026-07-15-journey-slice1-world-shell.md docs/superpowers/rvtm/2026-07-15-journey-slice1-world-shell-rvtm.md
git commit -m "docs(journey): slice 1 plan + RVTM evidence (THE-482)"
```

Then set THE-482 → In Review with a comment linking the commits and the RVTM (done by the supervising session via Linear MCP, not by a worker).

---

## Execution notes for the supervisor

- **Worktree:** execute this plan in a dedicated git worktree (`feedback_parallel_session_git_race` — parallel sessions share the git index; a worktree isolates the slice). Suggested branch: `mganzmanninfo/the-482-slice-1-persistent-world-shell-model-station` (Linear's suggested name).
- **Order matters:** Tasks 1→7 are dependency-ordered (stations → guard → data hook → camera → rail → sheet → shell). Do not parallelize 7 before 1-6 exist.
- **Do not touch:** `Sidebar.tsx`, `Toolbar.tsx`, `PhaseBar.tsx`, `CompliancePage.tsx`, `ComplianceOverlay.tsx`, `MainLayout.tsx` — all later slices. The only classic-UI file modified in this slice is `ProjectView.tsx` (Task 3), and only to swap its inline effect for the hook.
- **Server tests:** `packages/server` has 9-10 pre-existing flaky integration suites ('circular structure JSON' at setup) — not regressions, ignore them; this slice never touches the server.
