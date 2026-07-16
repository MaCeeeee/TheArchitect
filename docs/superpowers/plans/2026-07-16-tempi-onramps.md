# Slice 5 — Two-Tempi Camera + App On-Ramps — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (fresh subagent per task + two-stage review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the World its two tempi (cinematic only on the FIRST arrival per project+station, instant otherwise, `prefers-reduced-motion` always instant — ADR-0005 #8) and make v2 **reachable** for the first time: Dashboard cards, classic ProjectView, and the Blueprint success CTA all gain on-ramps into `/v2`.

**Architecture:** A pure `stationTempo.ts` module decides the tempo (`decideTempo(projectId, station)`) from a per-project Set-as-JSON localStorage key + a reduced-motion check. `flyToStation` gains an `instant` option; the `useFrame` loop applies instant targets in one frame (no lerp). `JourneyShell` wires tempo into its existing camera effect and marks the station seen. On-ramps are three small **additive** classic edits: an optional `onOpenJourney` prop on `ProjectCard`, a floating "Journey" link in `ProjectView`, and `BlueprintImport`'s success CTA now navigating to the World.

**Tech Stack:** React 18 + TypeScript, Zustand, Vite, Vitest + RTL, Tailwind. Client package: `packages/client`.

**Spec:** Linear [THE-494](https://linear.app/thearchitect/issue/THE-494) (child of Epic THE-481). Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` (#8, on-ramps). Vocabulary: `CONTEXT.md`.

**RVTM:** `docs/superpowers/rvtm/2026-07-16-tempi-onramps-rvtm.md`

---

## Grounded facts (verified on master 3adba74 — do not re-derive)

- **Fly loop:** `ViewModeCamera.tsx` — module state `flyTarget: CameraTarget | null` / `flyProgress` (`:21-22`); the ONLY animation path is the `useFrame` at `:360-375` (lerp, `delta * 1.5`, `easeInOutCubic`). `flyToStation` (ends ~`:298`) arms `flyTarget = { position, lookAt }; flyProgress = 0;`. `CameraTarget` = `{position, lookAt}` (`:16-19`). `StationFramingOptions` (`:230`) currently has `sheetOffsetPx?`/`sheetDock?`. Other fly functions (flyToElement/flyToWorkspace/fitToScreen/mode-change at `:52,72,93,105,115-125`) also arm `flyTarget` — they must stay animated (instant is opt-in via the new flag, default off).
- **JourneyShell camera effect** (`JourneyShell.tsx:38-54`): calls `flyToStation(station, elements, { sheetOffsetPx, sheetDock })`, deps `[station, loading]`. `projectId` is in scope (useParams).
- **Seen-once precedent:** `PhaseTransition.tsx:57-73` — Set-as-JSON in localStorage (`ta_phase_tutorials_seen`), try/catch-wrapped. Our key is **per-project**: `ta_seen_stations:{projectId}`.
- **Reduced-motion idiom:** `MatrixRain.tsx:101` — `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. **jsdom does NOT implement `matchMedia`** → the helper must guard `typeof window.matchMedia === 'function'`, and tests stub it.
- **Dashboard card:** `components/ui/DashboardPage.tsx:205-217` renders `<ProjectCard … onClick={() => navigate(\`/project/${project._id}\`)} onDelete={…} />`. `ProjectCard` (`components/ui/ProjectCard.tsx`) props at `:7-25` (`onClick`, `onDelete` required); card root `onClick` at `:51`; the delete button stopPropagates (`:103`) — same pattern for the new affordance.
- **ProjectView:** `components/ui/ProjectView.tsx:18` — `const { projectId } = useParams<{ projectId: string }>()`; imports `useNavigate` (`:2`) and lucide icons (`:3`). Main return `:118` — `<div className="flex h-full"><div className="flex-1 relative"><Scene />…` with absolute overlays inside the scene div (connection banner `top-4 left-1/2`).
- **Blueprint success CTA:** `components/blueprint/BlueprintImport.tsx:28-33` — `handleOpenInView = () => { reset(); navigate(\`/project/${projectId}\`); }`; button "Open in 3D View" at `:62-66`.
- **v2 entry today:** NONE — zero `/v2` links outside the journey shell itself (route at App.tsx:78; comment :75-77 "opt-in via /v2 URL"). These three edits are the first.
- **AC-4 label:** the affordance is the button `Journey` with `title="Open in the Journey world"` — the AC's "Open Journey" describes the affordance, not a literal label (CONTEXT.md vocabulary; English UI).
- **Gate = `npx vitest run` + `npx vite build` + tsc ≤ 19 (THE-486 baseline). Never `npm run build`.**

## File Structure

- **Create** `packages/client/src/components/journey/stationTempo.ts` — `prefersReducedMotion()`, `getSeenStations(projectId)`, `markStationSeen(projectId, station)`, `decideTempo(projectId, station)`. Pure + localStorage; one responsibility: the tempo decision.
- **Modify** `packages/client/src/components/3d/ViewModeCamera.tsx` — `CameraTarget.instant?`, `StationFramingOptions.instant?`, flyToStation passes it through, `useFrame` applies instant targets in one frame.
- **Modify** `packages/client/src/components/journey/JourneyShell.tsx` — tempo wiring in the camera effect + `markStationSeen`.
- **Modify** `packages/client/src/components/ui/ProjectCard.tsx` — optional `onOpenJourney?` prop → small "Journey" button (stopPropagation).
- **Modify** `packages/client/src/components/ui/DashboardPage.tsx` — pass `onOpenJourney` on the card (1 line).
- **Modify** `packages/client/src/components/ui/ProjectView.tsx` — floating "Journey" link (additive overlay).
- **Modify** `packages/client/src/components/blueprint/BlueprintImport.tsx` — success CTA → `/v2/project/:id/model`.
- **Tests:** create `stationTempo.test.ts`, `ProjectCard.journey.test.tsx`; extend `flyToStation.test.ts`, `JourneyShell.test.tsx`. (`ProjectView`/`BlueprintImport`/`DashboardPage` have no test files — their one-line changes are browser-verified; do NOT scaffold heavy suites for them.)

## Design decisions (locked)

1. **Instant is opt-in on the target, applied in the loop.** `flyToStation` has no camera reference (module function); the `useFrame` loop owns the camera. So instant = a flag on `CameraTarget`; the loop `copy()`s position+target in one frame and clears. Every other fly caller leaves the flag off → animated, byte-compatible behaviour.
2. **Mark seen immediately on arrival** (not after the animation finishes) — simpler, and an interrupted flight still counts as visited.
3. **Reduced motion beats seen-state** (AC-3): `decideTempo` checks `prefersReducedMotion()` first.
4. **On-ramps are additive affordances.** `ProjectCard.onOpenJourney` is optional (absent = today's card, byte-compatible for other callers). ProjectView gets a floating overlay link (no Toolbar edit). BlueprintImport is the ONE deliberate behaviour change (AC-6, user-approved): the success CTA now opens the World; label stays "Open in 3D View" (the World *is* the 3D view); classic remains one click away via the shell's "Back to classic UI".
5. **English UI strings** ("Journey", "Open in 3D View").
6. **Storage:** `ta_seen_stations:{projectId}` (Set-as-JSON, try/catch), mirrors `sheetPrefs`/`PhaseTransition` conventions.

---

## Chunk 1: Tempo core + camera + shell

### Task 1: `stationTempo.ts`

**Files:**
- Create: `packages/client/src/components/journey/stationTempo.ts`
- Test: `packages/client/src/components/journey/stationTempo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// packages/client/src/components/journey/stationTempo.test.ts
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { decideTempo, markStationSeen, getSeenStations, prefersReducedMotion } from './stationTempo';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('stationTempo (THE-494, ADR-0005 #8)', () => {
  test('first arrival is cinematic; after markStationSeen it is instant', () => {
    expect(decideTempo('p1', 'model')).toBe('cinematic');
    markStationSeen('p1', 'model');
    expect(decideTempo('p1', 'model')).toBe('instant');
    // other stations and other projects are unaffected
    expect(decideTempo('p1', 'track')).toBe('cinematic');
    expect(decideTempo('p2', 'model')).toBe('cinematic');
  });

  test('persists per project as ta_seen_stations:{projectId}', () => {
    markStationSeen('p1', 'model');
    markStationSeen('p1', 'govern');
    expect(JSON.parse(localStorage.getItem('ta_seen_stations:p1')!).sort()).toEqual(['govern', 'model']);
    expect(getSeenStations('p1').has('govern')).toBe(true);
  });

  test('prefers-reduced-motion forces instant regardless of seen-state', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    expect(decideTempo('p1', 'model')).toBe('instant'); // never seen, still instant
  });

  test('prefersReducedMotion is false when matchMedia is unavailable (jsdom default)', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  test('corrupt storage falls back to cinematic, never throws', () => {
    localStorage.setItem('ta_seen_stations:p1', '{not json');
    expect(decideTempo('p1', 'model')).toBe('cinematic');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found)

Run: `cd packages/client && npx vitest run src/components/journey/stationTempo.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/client/src/components/journey/stationTempo.ts
// The two tempi (ADR-0005 #8, THE-494): a station arrival is CINEMATIC only the
// first time this browser reaches that station in this project; afterwards it is
// INSTANT. prefers-reduced-motion always wins → instant. Persistence mirrors the
// PhaseTransition Set-as-JSON convention, but keyed PER PROJECT.
import type { StationKey } from './stations';

export type Tempo = 'cinematic' | 'instant';

const storageKey = (projectId: string) => `ta_seen_stations:${projectId}`;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function getSeenStations(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markStationSeen(projectId: string, station: StationKey): void {
  try {
    const seen = getSeenStations(projectId);
    seen.add(station);
    localStorage.setItem(storageKey(projectId), JSON.stringify([...seen]));
  } catch {
    /* storage unavailable — every arrival stays cinematic, which is safe */
  }
}

export function decideTempo(projectId: string, station: StationKey): Tempo {
  if (prefersReducedMotion()) return 'instant';
  return getSeenStations(projectId).has(station) ? 'instant' : 'cinematic';
}
```

- [ ] **Step 4: Run — expect PASS** (5 tests)
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/stationTempo.ts packages/client/src/components/journey/stationTempo.test.ts
git commit -m "feat(journey): per-project station tempo decision (cinematic once, instant after) (THE-494)"
```

---

### Task 2: Instant camera path (`ViewModeCamera.tsx`)

**Files:**
- Modify: `packages/client/src/components/3d/ViewModeCamera.tsx`
- Test: `packages/client/src/components/3d/flyToStation.test.ts` (extend)

- [ ] **Step 1: Extend the test (failing first)**

Append to `flyToStation.test.ts`:

```ts
  // THE-494 — instant tempo
  test('instant option is carried on the fly target; default is animated', () => {
    flyToStation('model', elements, { instant: true });
    expect(__getFlyTargetForTests()!.instant).toBe(true);
    flyToStation('model', elements);
    expect(__getFlyTargetForTests()!.instant).toBeFalsy();
  });

  test('instant survives the non-3d branch (fitToScreen path)', () => {
    useUIStore.setState({ viewMode: '2d-topdown' });
    flyToStation('plan', elements, { instant: true });
    expect(__getFlyTargetForTests()!.instant).toBe(true);
  });
```

> **Evidence note (AC-1):** this suite mocks `useFrame`, so it proves flag **carriage** only; the one-frame **application** (no lerp) is evidenced by the Task-5 browser check. State this in the RVTM.

- [ ] **Step 2: Run — expect FAIL** (`instant` not a known property / undefined !== true)

Run: `cd packages/client && npx vitest run src/components/3d/flyToStation.test.ts`

- [ ] **Step 3: Implement**

Three edits in `ViewModeCamera.tsx`:

(a) `CameraTarget` (`:16-19`) gains the flag:

```ts
interface CameraTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  /** Apply in one frame (no lerp) — the second tempo (THE-494). */
  instant?: boolean;
}
```

(b) `StationFramingOptions` gains:

```ts
  /** Apply the framing in one frame instead of the cinematic lerp (THE-494). */
  instant?: boolean;
```

and `flyToStation`'s final arming becomes:

```ts
  flyTarget = { position, lookAt, instant: opts.instant };
  flyProgress = 0;
```

**Also the non-3d branch** (`:245-249` — `viewMode` 2d-topdown/layer delegates to `fitToScreen` and returns): the flag must not be dropped there, or a user arriving from classic with a non-3d viewMode gets the lerp even under reduced-motion (AC-3 violation). After `fitToScreen(elements);` add:

```ts
    // Carry the tempo onto whatever fitToScreen armed (THE-494). The
    // flyProgress === 0 guard skips the case where fitToScreen no-opped
    // (empty view positions) and a stale in-flight target is still armed.
    if (opts.instant && flyTarget && flyProgress === 0) flyTarget.instant = true;
```

(c) The `useFrame` loop (`:360-375`) gets the instant branch FIRST (all other fly callers leave `instant` undefined → the existing lerp path is untouched):

```ts
  // Fly-to animation
  useFrame((_, delta) => {
    if (!flyTarget) return;

    // Instant tempo (THE-494): apply in one frame, no lerp.
    if (flyTarget.instant) {
      camera.position.copy(flyTarget.position);
      if (controlsRef.current) {
        controlsRef.current.target.copy(flyTarget.lookAt);
        controlsRef.current.update();
      }
      flyTarget = null;
      flyProgress = 1;
      return;
    }

    if (flyProgress < 1) {
      flyProgress = Math.min(flyProgress + delta * 1.5, 1);
      const t = easeInOutCubic(flyProgress);

      camera.position.lerp(flyTarget.position, t);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(flyTarget.lookAt, t);
        controlsRef.current.update();
      }

      if (flyProgress >= 1) {
        flyTarget = null;
      }
    }
  });
```

- [ ] **Step 4: Run — expect PASS** (full flyToStation suite; also `npx vitest run src/components/3d/` for neighbours)
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/3d/ViewModeCamera.tsx packages/client/src/components/3d/flyToStation.test.ts
git commit -m "feat(journey): instant camera path — one-frame framing without lerp (THE-494)"
```

---

### Task 3: Two-tempi wiring in `JourneyShell`

**Files:**
- Modify: `packages/client/src/components/journey/JourneyShell.tsx`
- Test: `packages/client/src/components/journey/JourneyShell.test.tsx` (extend)

- [ ] **Step 1: Extend the shell test (failing first)**

The suite mocks `flyToStation` (`const flyToStation = vi.fn()` + module mock). Add `localStorage.clear()` to the existing `beforeEach` AND an `afterEach(() => vi.unstubAllGlobals())` at suite level (the file has none — without it a failing reduced-motion assertion would leak the matchMedia stub into later tests), then:

```tsx
  test('two tempi: first arrival cinematic, revisit instant (per project+station)', () => {
    renderShell('/v2/project/p1/model');
    // first arrival → cinematic (instant false/undefined)
    expect(flyToStation.mock.calls[0][2]?.instant).toBeFalsy();
    // the arrival was persisted per project
    expect(JSON.parse(localStorage.getItem('ta_seen_stations:p1')!)).toContain('model');
    // a fresh mount of the same station is now instant
    flyToStation.mockClear();
    renderShell('/v2/project/p1/model');
    expect(flyToStation.mock.calls[0][2]?.instant).toBe(true);
  });

  test('reduced motion forces instant even on a first arrival', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    renderShell('/v2/project/p1/track');
    expect(flyToStation.mock.calls[0][2]?.instant).toBe(true);
    vi.unstubAllGlobals();
  });
```

(If the suite's `renderShell` cannot be called twice in one test because of the Scene singleton mock, unmount the first render — `const { unmount } = renderShell(…); … unmount();` — before the second. Follow whichever pattern the existing tests use.)

- [ ] **Step 2: Run — expect the new tests to FAIL**
- [ ] **Step 3: Wire the tempo**

In `JourneyShell.tsx`, import the tempo module and extend the camera effect (`:38-54`):

```tsx
import { decideTempo, markStationSeen } from './stationTempo';
```

```tsx
  useEffect(() => {
    if (loading || elements.length === 0) return;
    const ui = useUIStore.getState();
    const { selectedElementId: selId } = useArchitectureStore.getState();
    const sheetShown = station !== 'model' || (ui.isPropertyPanelOpen && !!selId);
    // Two tempi (ADR-0005 #8): cinematic only on the FIRST arrival at this
    // station in this project; instant afterwards. Reduced motion always instant.
    const tempo = projectId ? decideTempo(projectId, station) : 'cinematic';
    flyToStation(station, elements, {
      sheetOffsetPx: sheetShown ? ui.sheetWidth : 0,
      sheetDock: ui.sheetDock,
      instant: tempo === 'instant',
    });
    // Mark on arrival (not after the flight) — an interrupted flight still counts.
    if (projectId) markStationSeen(projectId, station);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, loading]);
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run src/components/journey/`)
- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/JourneyShell.tsx packages/client/src/components/journey/JourneyShell.test.tsx
git commit -m "feat(journey): two-tempi station arrivals — cinematic once per project, instant after (THE-494)"
```

---

## Chunk 2: On-ramps

### Task 4: Dashboard card + ProjectView + Blueprint on-ramps

**Files:**
- Modify: `packages/client/src/components/ui/ProjectCard.tsx` (optional prop + button)
- Modify: `packages/client/src/components/ui/DashboardPage.tsx` (pass the prop, 1 line)
- Modify: `packages/client/src/components/ui/ProjectView.tsx` (floating link)
- Modify: `packages/client/src/components/blueprint/BlueprintImport.tsx` (success CTA destination)
- Test: `packages/client/src/components/ui/ProjectCard.journey.test.tsx` (create)

- [ ] **Step 1: Write the failing ProjectCard test**

```tsx
// @vitest-environment jsdom
// packages/client/src/components/ui/ProjectCard.journey.test.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProjectCard from './ProjectCard';

const project = { _id: 'p1', name: 'Test project' };

describe('ProjectCard journey on-ramp (THE-494)', () => {
  test('renders a Journey button when onOpenJourney is provided; click does not bubble to onClick', () => {
    const onClick = vi.fn();
    const onOpenJourney = vi.fn();
    render(<ProjectCard project={project} onClick={onClick} onDelete={vi.fn()} onOpenJourney={onOpenJourney} />);
    const btn = screen.getByRole('button', { name: /journey/i });
    fireEvent.click(btn);
    expect(onOpenJourney).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled(); // stopPropagation — card open must not also fire
  });

  test('no Journey button without the prop (existing callers byte-compatible)', () => {
    render(<ProjectCard project={project} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /journey/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (unknown prop / button absent)

Run: `cd packages/client && npx vitest run src/components/ui/ProjectCard.journey.test.tsx`

- [ ] **Step 3: Implement the four edits**

**(a) `ProjectCard.tsx`** — add to `ProjectCardProps` (after `onDelete: () => void;`):

```ts
  /** On-ramp into the v2 Journey world (THE-494). Optional — absent = no button. */
  onOpenJourney?: () => void;
```

Destructure `onOpenJourney` in the component signature. Next to the delete button (`:103`, same stopPropagation pattern), add:

```tsx
          {onOpenJourney && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenJourney(); }}
              title="Open in the Journey world"
              className="rounded px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#a78bfa] border border-[#7c3aed]/40 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 transition"
            >
              Journey
            </button>
          )}
```

(Place it in the same action row as the delete button; if the row is a flex container, it just joins it. Read the surrounding JSX and match its structure — do not restyle anything else.)

**(b) `DashboardPage.tsx:214`** — add one prop to the `<ProjectCard …>`:

```tsx
                onOpenJourney={() => navigate(`/v2/project/${project._id}`)}
```

**(c) `ProjectView.tsx`** — inside the scene wrapper (`<div className="flex-1 relative">`, directly after `<Scene />` at the top of the overlay stack), add the floating on-ramp (uses the file's existing `projectId` from useParams `:18` and `navigate` `:2`):

```tsx
        {/* On-ramp into the v2 Journey world (THE-494) — mirror of the shell's
            "Back to classic UI" escape hatch. */}
        <button
          onClick={() => navigate(`/v2/project/${projectId}`)}
          className="absolute right-4 top-4 z-20 rounded-full border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1.5 text-xs font-medium text-[#a78bfa] backdrop-blur-md transition hover:bg-[#7c3aed]/20"
        >
          Journey →
        </button>
```

**(d) `BlueprintImport.tsx:28-33`** — the deliberate AC-6 behaviour change:

```tsx
  const handleOpenInView = () => {
    reset();
    if (projectId) {
      // Genesis round-trip (THE-494): a freshly generated architecture opens in
      // the World (v2 Journey). Classic stays one click away in the shell.
      navigate(`/v2/project/${projectId}/model`);
    }
  };
```

(Button label "Open in 3D View" stays — the World IS the 3D view.)

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/client && npx vitest run src/components/ui/ProjectCard.journey.test.tsx src/components/journey/`
Then (still from `packages/client`) `grep -rn "/v2/project" src/components/ui src/components/blueprint` → expect exactly the three new call sites (DashboardPage, ProjectView, BlueprintImport; baseline before this task is zero).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/ui/ProjectCard.tsx packages/client/src/components/ui/ProjectCard.journey.test.tsx packages/client/src/components/ui/DashboardPage.tsx packages/client/src/components/ui/ProjectView.tsx packages/client/src/components/blueprint/BlueprintImport.tsx
git commit -m "feat(journey): app on-ramps — Dashboard card, ProjectView link, Blueprint success opens the World (THE-494)"
```

---

### Task 5: Full gate + browser verification + closeout

**Files:** none (verification only)

- [ ] **Step 1: Full suite** — `cd packages/client && npx vitest run` → all pass (4 pre-existing teardown errors = baseline, not +N).
- [ ] **Step 2: Build** — `npx vite build` → ✓.
- [ ] **Step 3: tsc** — `npx tsc -b 2>&1 | grep -c "error TS"` → `19` (0 new).
- [ ] **Step 4: Browser:**
  - **Tempi (user's eyes needed — WebGL):** open a station never visited in this project → cinematic flight; revisit → instant snap. `localStorage.removeItem('ta_seen_stations:<id>')` restores the cinematic pass. With OS reduced-motion on → always instant.
  - **On-ramps (DOM-checkable):** Dashboard card shows "Journey" → lands on `/v2/project/:id`; classic ProjectView shows "Journey →" top-right → v2; Blueprint import success "Open in 3D View" → `/v2/project/:id/model`. Round trip: v2 empty world → "Generate with AI" → import → back in the World.
- [ ] **Step 5: Create/update the RVTM** (`docs/superpowers/rvtm/2026-07-16-tempi-onramps-rvtm.md`, created at plan approval) with evidence; commit docs.
- [ ] **Step 6: Push + PR** (`gh pr create --base master …`).

---

## Non-goals (explicitly out of scope — own follow-ups)

- **Landing bridge** (public marketing page → World) — own slice.
- Making v2 the default for create/demo (deliberate flip, later).
- New cinematic choreography (the existing eased lerp IS the cinematic tempo).
- v2 walkthrough/first-arrival tutorial content.
- Migrating THE-84 Try-Demo to v2.
- Instant mode for other fly callers (flyToElement/flyToWorkspace stay animated).
