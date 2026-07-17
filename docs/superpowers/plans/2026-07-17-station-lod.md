# Slice 4 — Station-Adaptive Semantic LOD (salience-driven focus) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (fresh subagent per task + two-stage review). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make each Journey station a *focused lens* on the same model — a pure `stationSalience(element, station)` weight [0..1] (from existing data) drives uniform expression (salient = full/label/pop, non-salient recedes), with Track re-forming into the existing plateau renderer and Explore/Govern receding hard behind the compliance heatmap. Movement = per-node cross-fade on the Slice-5 tempo. **Not** a perf/LOD refactor (no measured perf problem).

**Architecture:** Additive, v2-only. A pure salience module + a `useStationSalience` hook produce a `Map<id, weight>`; `NodeObject3D` and `ConnectionLines` consume it and animate their opacity/scale/label toward the target (instant on revisit, cinematic on first arrival — reusing `stationTempo`). The Station reaches the 3D tree via a new transient `uiStore.journeyStation` signal set by `JourneyShell` (mirroring how it already toggles `showComplianceGlow`). Track's re-form reuses the existing `PlateauRenderer` branch. A "Show all" override flattens salience.

**Tech Stack:** React 18 + TS, R3F/three, Zustand, Vite, Vitest. `packages/client`.

**Spec:** Linear [THE-500](https://linear.app/thearchitect/issue/THE-500) (child of Epic THE-481, ADR-0005 #7 — grilled 2026-07-17). Vocabulary: `CONTEXT.md`.

**RVTM:** `docs/superpowers/rvtm/2026-07-17-station-lod-rvtm.md`

---

## Grounded facts (verified on master `bea8b94` — do not re-derive)

- **The visibility chokepoint** is `useViewPositions.ts` → `{ positions, visibleElementIds }` (memo on viewMode/focusedLayer/elements). Salience is **separate and additive** — it modulates opacity/scale/label, it does NOT change `visibleElementIds`.
- **Elements:** `ArchitectureElements.tsx` filters `visibleElements` (visibleLayers ∩ visibleElementIds, minus policy/activity) and maps → `<NodeObject3D element viewPosition />` (`:60-66`). The natural place to compute the salience map once and pass it as a prop.
- **`NodeObject3D.tsx`:** `materialOpacity` is a `useMemo` (`:359`), applied to `<meshPhysicalMaterial opacity={materialOpacity} transparent={materialOpacity<1}>` (`:400-402`). The normal-mode `useFrame` branch (`:211-220`) already lerps ONE scale target — salience folds into it (do not add a second lerp). (Cosmetic, browser-tunable: salience dims the main mesh only — the icon sprite / selection ring / label border are not dimmed.) There is a `useFrame((state,delta)=>…)` at `:181` (already lerps `meshRef.current.scale` in X-Ray branches). The label conditional is at `:451`: `(is2DMode || hovered || isSelected || (isXRayActive && xrayData?.isCriticalPath))`. `isXRayActive` gates X-Ray behaviour — **salience must NOT apply while X-Ray is active** (X-Ray owns opacity/scale).
- **`ConnectionLines.tsx`:** `visibleConnections` useMemo (`:125`), rendered `:155`; per-connection `opacity` computed `:202-246`, passed to `<Line opacity>`. Multiply by endpoint salience there.
- **`Scene.tsx` branches** (`:113-160`): `isActivityActive ? <ActivityScene/> : isPlateauActive ? <PlateauRenderer/>… : <normal world/>`. `isPlateauActive = roadmapStore.isPlateauViewActive`. **Scene does NOT read the station.** ComplianceGlow is already in the normal branch (`:150`).
- **`stationTempo.ts`:** `decideTempo(projectId, station) → 'cinematic'|'instant'` + `prefersReducedMotion()`. Reuse for the transition tempo (do NOT re-mark seen — `JourneyShell` already does).
- **`JourneyShell.tsx`:** the camera effect (`:39-61`, deps `[station, loading]`) computes tempo, arms the camera, marks the station seen. The station signal + instant flag get set here.
- **Data for salience (all in stores):** `architectureStore.connections` (degree for Model hubs) + `.selectedElementId`; `complianceStore.violationsByElement: Map<id,number>` + `.mappingsByElement: Map<id,DTO[]>`; element `annualCost` + `roadmapStore.roadmaps`/`plateauSnapshots` (Plan/Track membership + "hasRoadmap").
- **Gate = `npx vitest run` + `npx vite build` + tsc ≤ 19. Never `npm run build`.** R3F render effects are browser-verified (WebGL); the pure salience logic + signal plumbing are unit-tested.

## File Structure

- **Create** `components/journey/stationSalience.ts` — `StationKey`-parameterized pure `stationSalience(element, station, ctx): number` + `SalienceContext` type + `buildSalienceContext(...)` helper (pure). One responsibility: importance math.
- **Create** `hooks/useStationSalience.ts` — assembles `SalienceContext` from stores, returns `Map<id, weight>` for the current station; returns all-1 when `salienceOverride` is on or `journeyStation` is null (classic).
- **Modify** `stores/uiStore.ts` — transient `journeyStation: StationKey | null`, `salienceInstant: boolean`, `salienceOverride: boolean` + `setJourneyStation(station, instant)` (sets both) and `toggleSalienceOverride()`.
- **Modify** `components/journey/JourneyShell.tsx` — set `journeyStation`/`salienceInstant` in the camera effect; reset `journeyStation=null` on unmount (classic-safe); fallback hint pill when the station's data is absent.
- **Modify** `components/3d/ArchitectureElements.tsx` — compute the salience map (hook) once, pass `salience` per node.
- **Modify** `components/3d/NodeObject3D.tsx` — `salience?: number` prop; animate opacity/scale toward it in `useFrame` (instant/cinematic); salient → keep label; **skip entirely when `isXRayActive`**.
- **Modify** `components/3d/ConnectionLines.tsx` — dim each line by `min(salience[a], salience[b])`.
- **Modify** `components/3d/Scene.tsx` — Track re-form: render `PlateauRenderer` when `journeyStation==='track' && hasRoadmap`.
- **Modify** `components/journey/commands.ts` — a "Show all detail" command (toggles `salienceOverride`).
- **Tests:** `stationSalience.test.ts`, `useStationSalience.test.ts`(jsdom), extend `JourneyShell.test.tsx`.
- **Docs:** ADR-0005 gets a `#7` addendum recording the grilled decision.

## Design decisions (locked — from the grill)

1. **Salience is additive, not a visibility gate.** Everything visible stays visible; salience only modulates *emphasis*. Low salience floors at `RECEDE = 0.18` (never 0) so nothing fully vanishes.
2. **Per-node imperative animation.** Each `NodeObject3D` lerps its *applied* salience toward the target in `useFrame` (mutating material.opacity + scale — no React re-render); `salienceInstant` snaps it. This IS the cross-fade/dissolve, on the Slice-5 tempo. Labels toggle on the **target** (not animated) to avoid per-frame flicker.
3. **X-Ray owns the node when active** — salience is skipped while `isXRayActive` (X-Ray already drives opacity/scale). Classic UI never sets `journeyStation`, so salience is inert there (all-1) → **classic byte-identical**.
4. **Track = the one true re-form** via the existing `PlateauRenderer`; Explore/Govern "heatmap-dominant" is achieved purely by salience receding boxes hard while the already-present `ComplianceGlow` dominates — no new render mode.
5. **Fallback:** salience returns all-1 (full re-dress) when the station's phase-data is absent; a subtle hint pill points at how to get it. Never an empty re-form.
6. **Per-station importance (browser-tunable starting values):** in `stationSalience`.
7. **English UI. No perf refactor/instancing.** Gate = vitest + vite build.

---

## Chunk 1: Salience backbone + store signals

### Task 1: `stationSalience.ts`

**Files:** Create `packages/client/src/components/journey/stationSalience.ts` + `.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/client/src/components/journey/stationSalience.test.ts
import { describe, test, expect } from 'vitest';
import { stationSalience, RECEDE, type SalienceContext } from './stationSalience';

const el = (over: Record<string, unknown> = {}) =>
  ({ id: 'e', layer: 'application', annualCost: 0, ...over }) as never;

const ctx = (over: Partial<SalienceContext> = {}): SalienceContext => ({
  degreeById: new Map(), coverageGapIds: new Set(), violationIds: new Set(),
  costById: new Map(), roadmapElementIds: new Set(), selectedId: null,
  hasData: { explore: true, govern: true, plan: true, track: true },
  ...over,
});

describe('stationSalience (THE-500)', () => {
  test('Model shows everything at full salience (home view)', () => {
    expect(stationSalience(el(), 'model', ctx())).toBe(1);
  });
  test('Vision lifts motivation/strategy, recedes lower layers', () => {
    expect(stationSalience(el({ layer: 'motivation' }), 'vision', ctx())).toBe(1);
    expect(stationSalience(el({ layer: 'technology' }), 'vision', ctx())).toBe(RECEDE);
  });
  test('Explore: coverage gaps salient, covered recede', () => {
    const c = ctx({ coverageGapIds: new Set(['e']) });
    expect(stationSalience(el({ id: 'e' }), 'explore', c)).toBe(1);
    expect(stationSalience(el({ id: 'x' }), 'explore', c)).toBe(RECEDE);
  });
  test('Govern: violators salient, conform recede', () => {
    const c = ctx({ violationIds: new Set(['e']) });
    expect(stationSalience(el({ id: 'e' }), 'govern', c)).toBe(1);
    expect(stationSalience(el({ id: 'x' }), 'govern', c)).toBe(RECEDE);
  });
  test('Plan: roadmap members salient, rest recede', () => {
    const c = ctx({ roadmapElementIds: new Set(['e']) });
    expect(stationSalience(el({ id: 'e' }), 'plan', c)).toBe(1);
    expect(stationSalience(el({ id: 'x' }), 'plan', c)).toBe(RECEDE);
  });
  test('fallback: absent phase-data → full salience (no empty re-form)', () => {
    const c = ctx({ hasData: { explore: false, govern: false, plan: false, track: false } });
    expect(stationSalience(el(), 'explore', c)).toBe(1);
    expect(stationSalience(el(), 'plan', c)).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`cd packages/client && npx vitest run src/components/journey/stationSalience.test.ts`)

- [ ] **Step 3: Implement**

```ts
// packages/client/src/components/journey/stationSalience.ts
// Semantic LOD by IMPORTANCE, not distance (THE-500, ADR-0005 #7). Each station
// surfaces the elements that matter for its phase, derived from data. Additive:
// low salience recedes to RECEDE, never to 0 (nothing fully vanishes). Values are
// starting defaults — tune in the browser.
import type { StationKey } from './stations';
import type { ArchitectureElement } from '@thearchitect/shared';

export const RECEDE = 0.18;

export interface SalienceContext {
  degreeById: Map<string, number>;   // connection degree (Model hub emphasis)
  coverageGapIds: Set<string>;       // Explore: elements with a compliance coverage gap
  violationIds: Set<string>;         // Govern: elements with ≥1 policy violation
  costById: Map<string, number>;     // Plan: annual cost
  roadmapElementIds: Set<string>;    // Plan/Track: elements referenced by the roadmap
  selectedId: string | null;         // Model: the selected element
  hasData: { explore: boolean; govern: boolean; plan: boolean; track: boolean };
}

const VISION_LAYERS = new Set(['motivation', 'strategy']);

/** Importance weight [0..1] of an element on a given station. */
export function stationSalience(
  el: Pick<ArchitectureElement, 'id' | 'layer'> & { annualCost?: number },
  station: StationKey,
  ctx: SalienceContext,
): number {
  switch (station) {
    case 'model':
      return 1; // home / working view — full detail, nothing recedes
    case 'vision':
      return VISION_LAYERS.has(el.layer) ? 1 : RECEDE;
    case 'explore':
      if (!ctx.hasData.explore) return 1;
      return ctx.coverageGapIds.has(el.id) ? 1 : RECEDE;
    case 'govern':
      if (!ctx.hasData.govern) return 1;
      return ctx.violationIds.has(el.id) ? 1 : RECEDE;
    case 'plan':
      if (!ctx.hasData.plan) return 1;
      return ctx.roadmapElementIds.has(el.id) ? 1 : RECEDE;
    case 'track':
      // Track re-forms into the plateau renderer when roadmap data exists (Scene
      // handles that). This branch only runs in the box-world fallback → full.
      return 1;
  }
}
```

- [ ] **Step 4: Run → PASS** · **Step 5: Commit** `feat(journey): pure stationSalience — importance weight per station (THE-500)`

---

### Task 2: `useStationSalience.ts`

**Files:** Create `packages/client/src/hooks/useStationSalience.ts` + `.test.ts` (jsdom)

- [ ] **Step 1: Failing test** — seed stores, assert the returned map recedes non-salient and honours the override.

```tsx
// @vitest-environment jsdom
// packages/client/src/hooks/useStationSalience.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStationSalience } from './useStationSalience';
import { useUIStore } from '../stores/uiStore';
import { useArchitectureStore } from '../stores/architectureStore';
import { useComplianceStore } from '../stores/complianceStore';
import { RECEDE } from '../components/journey/stationSalience';

const els = [
  { id: 'a', layer: 'motivation' }, { id: 'b', layer: 'technology' },
] as never;

beforeEach(() => {
  useArchitectureStore.setState({ elements: els, connections: [] as never, selectedElementId: null });
  useComplianceStore.setState({ violationsByElement: new Map(), mappingsByElement: new Map() });
  useUIStore.setState({ journeyStation: 'vision', salienceOverride: false });
});

describe('useStationSalience (THE-500)', () => {
  test('vision recedes lower layers', () => {
    const { result } = renderHook(() => useStationSalience());
    expect(result.current.get('a')).toBe(1);
    expect(result.current.get('b')).toBe(RECEDE);
  });
  test('override flattens salience to 1', () => {
    useUIStore.setState({ salienceOverride: true });
    const { result } = renderHook(() => useStationSalience());
    expect(result.current.get('b')).toBe(1);
  });
  test('classic (journeyStation null) → all 1', () => {
    useUIStore.setState({ journeyStation: null });
    const { result } = renderHook(() => useStationSalience());
    expect(result.current.get('b')).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement** — assemble the context from stores; memoize.

```ts
// packages/client/src/hooks/useStationSalience.ts
// Assembles the per-station salience map from the stores (THE-500). Returns all-1
// when a station isn't active (classic) or the user turned on "Show all".
import { useMemo } from 'react';
import { useArchitectureStore } from '../stores/architectureStore';
import { useComplianceStore } from '../stores/complianceStore';
import { useRoadmapStore } from '../stores/roadmapStore';
import { useUIStore } from '../stores/uiStore';
import { stationSalience, type SalienceContext } from '../components/journey/stationSalience';

export function useStationSalience(): Map<string, number> {
  const station = useUIStore((s) => s.journeyStation);
  const override = useUIStore((s) => s.salienceOverride);
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const selectedId = useArchitectureStore((s) => s.selectedElementId);
  const violationsByElement = useComplianceStore((s) => s.violationsByElement);
  const mappingsByElement = useComplianceStore((s) => s.mappingsByElement);
  const roadmaps = useRoadmapStore((s) => s.roadmaps);

  return useMemo(() => {
    const map = new Map<string, number>();
    if (!station || override) {
      for (const el of elements) map.set(el.id, 1);
      return map;
    }
    // degree per element (Connection uses sourceId/targetId — architectureStore.ts:82)
    const degreeById = new Map<string, number>();
    for (const c of connections) {
      degreeById.set(c.sourceId, (degreeById.get(c.sourceId) ?? 0) + 1);
      degreeById.set(c.targetId, (degreeById.get(c.targetId) ?? 0) + 1);
    }
    // coverage gap = element with zero mappings (only meaningful if any mappings exist)
    const coverageGapIds = new Set<string>();
    for (const el of elements) if ((mappingsByElement.get(el.id)?.length ?? 0) === 0) coverageGapIds.add(el.id);
    const violationIds = new Set<string>();
    for (const [id, n] of violationsByElement) if (n > 0) violationIds.add(id);
    const roadmapElementIds = new Set<string>(); // roadmap→element linkage lands with the Plan re-form; empty for now → Plan falls back
    const costById = new Map<string, number>(elements.map((e) => [e.id, e.annualCost ?? 0]));

    const ctx: SalienceContext = {
      degreeById, coverageGapIds, violationIds, costById, roadmapElementIds, selectedId,
      hasData: {
        explore: mappingsByElement.size > 0,
        govern: violationIds.size > 0,
        plan: roadmaps.length > 0 && roadmapElementIds.size > 0,
        track: roadmaps.length > 0,
      },
    };
    for (const el of elements) map.set(el.id, stationSalience(el, station, ctx));
    return map;
  }, [station, override, elements, connections, selectedId, violationsByElement, mappingsByElement, roadmaps]);
}
```

> Note: `roadmapElementIds` (per-element roadmap linkage) is deliberately left empty in this slice → Plan falls back to full (AC-6). Wiring the roadmap→element set is a small follow-up; the fallback keeps it honest. Flag this in the RVTM.

- [ ] **Step 4: Run → PASS** · **Step 5: Commit** `feat(journey): useStationSalience — assemble the per-station salience map (THE-500)`

---

### Task 3: uiStore signals + JourneyShell wiring

**Files:** Modify `stores/uiStore.ts`, `components/journey/JourneyShell.tsx`; extend `JourneyShell.test.tsx`

- [ ] **Step 1: Extend the shell test** — assert `journeyStation`/`salienceInstant` get set on arrival (mock stationTempo or seed localStorage). Add to the existing suite:

```tsx
  test('sets journeyStation + cinematic-first salienceInstant on arrival (THE-500)', () => {
    localStorage.clear();
    renderShell('/v2/project/p1/govern');
    expect(useUIStore.getState().journeyStation).toBe('govern');
    expect(useUIStore.getState().salienceInstant).toBe(false); // first arrival → cinematic
  });
```

Also add `journeyStation: null, salienceOverride: false` to the existing `useUIStore.setState({...})` in this suite's `beforeEach` (test isolation — the new signals otherwise leak across tests).

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3a: uiStore** — add to the interface (near `focusedLayer`) and body:

```ts
  // v2 station-adaptive LOD (THE-500) — transient, v2-only
  journeyStation: import('../components/journey/stations').StationKey | null;
  salienceInstant: boolean;
  salienceOverride: boolean;
  setJourneyStation: (s: import('../components/journey/stations').StationKey | null, instant: boolean) => void;
  toggleSalienceOverride: () => void;
```

```ts
  journeyStation: null,
  salienceInstant: true,
  salienceOverride: false,
  setJourneyStation: (s, instant) => set({ journeyStation: s, salienceInstant: instant }),
  toggleSalienceOverride: () => set((st) => ({ salienceOverride: !st.salienceOverride })),
```

(Prefer a top-level `import type { StationKey }` over the inline `import(...)` if the file's import block allows — match the file's style.)

- [ ] **Step 3b: JourneyShell** — in the camera effect (`:39-61`), right after `const tempo = projectId ? decideTempo(projectId, station) : 'cinematic';`, add:

```tsx
    // Station-adaptive LOD (THE-500): the salience transition rides the same tempo.
    useUIStore.getState().setJourneyStation(station, tempo === 'instant');
```

And in the same effect's/an unmount cleanup (mirror the THE-494 stale-flag reset), clear it:

```tsx
  useEffect(() => () => { useUIStore.getState().setJourneyStation(null, true); }, []);
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/components/journey/JourneyShell.test.tsx`) · **Step 5: Commit** `feat(journey): journeyStation + salience signals wired from the shell (THE-500)`

---

## Chunk 2: Expression at the render chokepoints

### Task 4: NodeObject3D salience (opacity · scale · label)

**Files:** Modify `components/3d/NodeObject3D.tsx`, `components/3d/ArchitectureElements.tsx`

- [ ] **Step 1: ArchitectureElements — compute + pass salience**

Add import + hook, pass the prop:

```tsx
import { useStationSalience } from '../../hooks/useStationSalience';
// …in the component:
const salience = useStationSalience();
// in the visibleElements map:
<NodeObject3D key={element.id} element={element} viewPosition={viewPositions.get(element.id)} salience={salience.get(element.id) ?? 1} />
```

(Proposal overlays stay at default salience 1.)

- [ ] **Step 2: NodeObject3D — consume salience**

Destructure the prop **with a default** (so `undefined` never reaches the math): `export default function NodeObject3D({ element, viewPosition, salience = 1 }: NodeObject3DProps)`, and add `salience?: number;` to `NodeObject3DProps`.

Add near the other hooks a **reactive** "is a station active?" flag (this is what makes classic byte-identical — in classic `journeyStation` is `null` → `journeyActive` false → salience is inert) and a ref for the animated value:

```tsx
const journeyActive = useUIStore((s) => s.journeyStation !== null);
const appliedSalienceRef = useRef(1);
```

**Do NOT add a second `scale.lerp`.** The existing normal-mode branch (`NodeObject3D.tsx:211-220`) already lerps one scale target — **fold salience into it** and set opacity there. Replace that `else { // Normal mode … }` block with:

```tsx
    } else {
      // Normal mode
      if (isSelected && !dragging) {
        meshRef.current.rotation.y += delta * 0.5;
      }
      // Station-adaptive salience (THE-500): fold importance into the ONE scale
      // target + dim opacity. Inert in classic (journeyActive false → factor 1),
      // so classic renders byte-identically. instant = revisit/reduced-motion.
      const instant = useUIStore.getState().salienceInstant;
      const targetS = journeyActive ? salience : 1;
      appliedSalienceRef.current = instant
        ? targetS
        : THREE.MathUtils.lerp(appliedSalienceRef.current, targetS, Math.min(1, delta * 6));
      const s = appliedSalienceRef.current;
      const targetScale = (hovered || isSelected ? 1.15 : 1) * (0.7 + 0.3 * s);
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), instant ? 1 : 0.1);
      const mat = meshRef.current.material as THREE.MeshPhysicalMaterial;
      mat.transparent = materialOpacity < 1 || s < 1;
      mat.opacity = materialOpacity * s;
    }
```

Salient elements keep their label — extend the label conditional (`:451`), **gated on `journeyActive`** (classic term unchanged) and evaluated on the **target** salience (not the animated ref, to avoid flicker):

```tsx
{(is2DMode || hovered || isSelected || (isXRayActive && xrayData?.isCriticalPath) || (journeyActive && !isXRayActive && salience >= 0.5)) && (
```

(`useUIStore` + `THREE` are already imported; `materialOpacity` [useMemo at `:359`], `meshRef`, `hovered`, `isSelected`, `dragging` are in scope. The X-Ray branch of `useFrame` is untouched — X-Ray still owns scale/opacity when active.)

- [ ] **Step 3: Verify no unit regressions** — `npx vitest run src/components/3d/ src/components/journey/` (NodeObject3D has no unit suite; confirm nothing else breaks). Visual effect = browser (Task 8).

- [ ] **Step 4: Commit** `feat(journey): NodeObject3D recedes/pops by station salience, animated on the tempo (THE-500)`

---

### Task 5: ConnectionLines dim by endpoint salience

**Files:** Modify `components/3d/ConnectionLines.tsx`

- [ ] **Step 1:** Add the hook + the X-Ray guard + multiply opacity. Near the top of the component add `const salience = useStationSalience();` (import it) and `const isXRayActive = useXRayStore((s) => s.isActive);` (if not already read). In the render map (`:155`+), where `opacity` is finalized (a mutable `let`, `:203-246`) before `<Line opacity={opacity}>`, multiply — **connections use `sourceId`/`targetId`** (`ConnectionLines.tsx:133-134`), and skip under X-Ray for consistency with the nodes:

```tsx
if (!isXRayActive) {
  const edgeSalience = Math.min(salience.get(conn.sourceId) ?? 1, salience.get(conn.targetId) ?? 1);
  opacity = opacity * edgeSalience;
}
```

Apply to **both** the normal `<Line>` and the `CrossArchitectureLine` opacity path (same `opacity` variable feeds both — `:283`). A connection recedes when *either* endpoint recedes; in classic the map is all-1 → no change.

- [ ] **Step 2:** `npx vitest run src/components/3d/` green. Visual = browser.

- [ ] **Step 3: Commit** `feat(journey): connections dim with endpoint salience (THE-500)`

---

## Chunk 3: Track re-form · control · fallback · closeout

### Task 6: Track re-form (station-driven plateau)

**Files:** Modify `components/3d/Scene.tsx`

- [ ] **Step 1:** Scene reads the station + roadmap presence and renders the existing `PlateauRenderer` when on Track:

Add selectors near the other Scene store reads. **CRITICAL: gate on `plateauSnapshots`, not the roadmaps *list*** — `PlateauRenderer` returns `null` when `plateauSnapshots.length === 0` (`PlateauRenderer.tsx:39`), and snapshots are populated only by `computePlateaus`/`activatePlateauView` (needs a loaded active roadmap), NOT merely by a non-empty `roadmaps` list. Gating on `roadmaps.length` would replace the box-world with an empty `PlateauRenderer` → blank Track (violates decision #5):

```tsx
const journeyStation = useUIStore((s) => s.journeyStation);
const hasPlateaus = useRoadmapStore((s) => s.plateauSnapshots.length > 0);
const trackReform = journeyStation === 'track' && hasPlateaus;
```

Extend the branch condition (`:113`): render the plateau block when `(isPlateauActive || trackReform) && is3D` (keep the existing `isActivityActive` precedence). Reuses the exact existing `<PlateauRenderer/><AgentAvatars3D/><DiscussionBubbles3D plateauMode/>` block — no new renderer. When on Track **without computed plateaus**, `trackReform` is false → the normal box-world renders (salience full, AC-6 fallback) + the Task-7 hint invites activating the plateau/roadmap. (Auto-triggering plateau computation on Track arrival = deliberate follow-up, not this slice.)

- [ ] **Step 2:** `npx vitest run src/components/3d/` green (Scene has light/none unit coverage — confirm no import breakage). Behaviour = browser.

- [ ] **Step 3: Commit** `feat(journey): Track re-forms into the plateau renderer, station-driven (THE-500)`

---

### Task 7: "Show all" override command + fallback hint

**Files:** Modify `components/journey/commands.ts`, `components/journey/JourneyShell.tsx`

- [ ] **Step 1:** Add a command to the registry (`commands.ts`) — note `run` needs store access, so use a non-navigation command (first non-nav command in the registry):

```ts
{ id: 'toggle:show-all', group: 'View', label: 'Toggle: show all detail', keywords: ['lod', 'salience', 'focus', 'detail', 'show all'],
  run: () => useUIStore.getState().toggleSalienceOverride() },
```

(Add `import { useUIStore } from '../../stores/uiStore';` to commands.ts. This is the **first non-`navigate` command** — update the file's header comment, which currently says every command "only navigates" (still v2-safe: it flips transient v2 UI state, not classic state). Extend `commands.test.ts` to assert `toggle:show-all` toggles `salienceOverride`.)

- [ ] **Step 2:** Fallback hint in `JourneyShell` — a subtle pill (reuse the "Click an element" hint styling) shown when the current station's phase-data is absent, gated on `elements.length>0`. Read via `useComplianceStore`/`useRoadmapStore` selectors:
  - Explore & `mappingsByElement.size===0` → "No coverage yet — upload a standard"
  - Plan & `roadmaps.length===0` → "No roadmap yet — plan one"
  - Track & `plateauSnapshots.length===0` → "No plateaus yet — activate a roadmap view"

  (These match the `hasData` fallbacks in `useStationSalience` + the `trackReform` gate, so the hint appears exactly when the station shows the full re-dress fallback instead of its re-form/focus.)

- [ ] **Step 3:** `npx vitest run src/components/journey/` green.

- [ ] **Step 4: Commit** `feat(journey): show-all override command + station data-absent hint (THE-500)`

---

### Task 8: Full gate + browser + ADR addendum + closeout

- [ ] **Step 1:** `cd packages/client && npx vitest run` → all pass (4 pre-existing teardown errors = baseline).
- [ ] **Step 2:** `npx vite build` → ✓.
- [ ] **Step 3:** `npx tsc -b 2>&1 | grep -c "error TS"` → `19`.
- [ ] **Step 4: Browser (the point of this slice — user's eyes, WebGL):** on a project with elements, walk the stations: Model = full; Vision = motivation/strategy pop, lower layers recede; Explore/Govern = boxes recede hard, heatmap/violations dominate; Plan = full (roadmap-linkage deferred); Track = plateau blocks (with a roadmap) or full+hint (without). Confirm the **transition** cross-fades on first arrival and snaps on revisit; reduced-motion → instant. Toggle "Show all" (⌘K) → salience flattens. Confirm classic `/project/:id` is unchanged (journeyStation null → all-1).
- [ ] **Step 5: ADR-0005 #7 addendum** — append the grilled decision (salience-by-importance not distance; re-dress backbone + Track/Explore/Govern re-forms; cross-fade on tempo; fallback; no perf refactor) to `docs/adr/0005-spatial-journey-ui-restructure.md`.
- [ ] **Step 6:** Update the RVTM with evidence; commit docs.
- [ ] **Step 7:** Push + PR (`gh pr create --base master`).

---

## Non-goals (own follow-ups — see THE-500)
- True element-replacing re-forms (Explore heatmap-blob, Plan flow-ribbon) · vertex morph · the roadmap→element linkage that makes Plan non-fallback (small follow-up) · THE-23/58 zoom-aggregation + instancing · any perf work.
