# Slice 3a — Command Registry + Curated Per-Station Actions — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (fresh subagent per task + two-stage review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v2 Journey's single navigation-only CTA into a small cluster of **executable** per-station actions, built on a typed command registry that Slice 3b's ⌘K palette will reuse.

**Architecture:** A pure-data **command registry** (`commands.ts`) exposes typed `Command`s (id, group, label, `run`, `available?`) closed over a `CommandContext` (projectId + navigate + world facts). A per-station **curation table** (`stationActions.ts`) folds the station's live `nextAction` (from `journeyStore`) with a small curated set of registry commands, capped at ≤4, deduped, and `available?`-filtered. A presentational **`StationActions`** component renders the chips and calls `cmd.run(ctx)`. It replaces the `NextStepBanner` block inside `StationRail`. No global hotkey, no ⌘K (that's 3b). Classic UI untouched.

**Tech Stack:** React 18 + TypeScript, Zustand, Vite, Vitest + React Testing Library, Tailwind. Client package: `packages/client`.

**Spec:** Linear [THE-492](https://linear.app/thearchitect/issue/THE-492) (child of Epic THE-481). Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md`. Vocabulary: `CONTEXT.md`.

**RVTM:** `docs/superpowers/rvtm/2026-07-16-command-actions-rvtm.md`

---

## Grounded facts (from Pre-Flight scan — do not re-derive)

- **No command palette / cmdk / ⌘K exists** → the registry is net-new. `ElementPalette.tsx` is an ArchiMate element-picker and **owns `palette`/`togglePalette`/`isPaletteOpen` in `uiStore`** — do NOT reuse those names. This slice uses `stationActions` / `commands` naming only.
- **The seam:** `StationRail.tsx` renders one `NextStepBanner` whose `onAction` only `navigate`s to the recommended station (its comment says executing "needs that station's tools → later slices"). This slice fills that seam.
- **`PhaseInfo.nextAction`** is `{ label, route, field? } | null` (null when the phase is done), read from `phases: PhaseInfo[]` on `journeyStore`. It is derived by a **private `getNextAction` closure inside `recompute`** (journeyStore.ts:124) — NOT a public store method; only consume it via `phases[].nextAction`. Some `route`s are **sentinels** (`__envision__`, `__envision_stakeholders__`, `__connection_mode__`); the rest are real classic routes (`/project/:id/compliance/...`, `/project/:id`).
- **Per-station data lives in `stations.ts`** (`STATIONS: StationDef[]` with `key`, `phase`, `classicRoute(id)`, `conformanceGate?`). `stationForPhase(phase)` and `isStationKey` exist.
- **`phaseVisibility.ts`** exposes `isToolbarActionVisible(action, phase, showAll)` — reuse for `available?` gating; do NOT invent a parallel gate.
- **Classic Sidebar/Toolbar are already excluded from v2** (MainLayout-only) — nothing to remove.
- **Empty-world handling already exists:** `JourneyShell.tsx` renders a "Generate with AI" CTA when `elements.length === 0`. `StationActions` must NOT render in that state (the empty-world CTA owns it).

## File Structure

- **Create** `packages/client/src/components/journey/commands.ts` — `Command`, `CommandContext` types; `resolveActionRoute()`; `buildCommandRegistry(ctx)` returning `Record<string, Command>` of safe (navigation-only) commands. One responsibility: the command vocabulary. (3b's palette will call `Object.values(buildCommandRegistry(ctx))`.)
- **Create** `packages/client/src/components/journey/stationActions.ts` — `STATION_SECONDARY: Record<StationKey, string[]>` (curated registry-command ids per station) + `getStationActions(station, phases, ctx)` folding the live `nextAction` (primary) with the secondaries, resolving routes, `available?`-filtering, deduping by resulting route, capping at 4.
- **Create** `packages/client/src/components/journey/StationActions.tsx` — presentational chip row; renders nothing when there are no actions; calls `cmd.run(ctx)` on click; primary chip visually emphasised.
- **Modify** `packages/client/src/components/journey/StationRail.tsx` — replace the `NextStepBanner` block (lines ~46-55) with `<StationActions station={station} projectId={projectId} />`. Leave `NextStepBanner` the component untouched (still exported for classic/other use).
- **Tests** (co-located, vitest): `commands.test.ts`, `stationActions.test.ts`, `StationActions.test.tsx`, and an update to `StationRail.test.tsx` if it asserts on the banner.

## Design decisions (locked)

1. **Station-scoped, not currentPhase-scoped.** Actions are for the station you are ON. `getStationActions` derives the phase from `STATIONS.find(s => s.key === station).phase`, then reads that phase's `nextAction` from `phases`. (The old CTA showed the *recommended* phase's action only when you were elsewhere; the cluster shows the *current* station's actions always.)
2. **Only safe commands.** Every registry command **navigates** (to a v2 station, a classic route, or a v2 sheet route). No command toggles classic-only UI state (`openComplianceOverlay`, `setSidebarPanel`) — those no-op/break from v2 (command→context risk). Sentinel `nextAction` routes resolve to the classic project view (`/project/:id`) — the safe escape hatch.
3. **≤4, deduped, gated.** Primary (`nextAction`) first, then curated secondaries; drop any secondary whose resolved route equals an already-included route; drop any failing `available?`; cap at 4.
4. **Classic-safe & additive.** New files only + one localized edit in `StationRail`. No `uiStore` changes, no hotkey, no `palette` names. `vite build` + `vitest` gate; 0 new tsc errors beyond the THE-486 baseline (19). **Gate = `npx vitest run` + `npx vite build`, never `npm run build`** (client `tsc -b` cold-fails on 19 pre-existing errors — see `reference_client_tsc_cold_fail`).

## Curated action table (starting point — tunable in browser review)

`STATION_SECONDARY` (registry-command ids appended after the primary `nextAction`):

| Station | Secondary command ids | Rationale |
|---|---|---|
| vision  | `[]` | primary (Define Scope / Write Vision / …) is enough; it opens classic vision |
| model   | `['open:model-classic']` | primary adds elements/connections; explicit "open classic editor" |
| explore | `['open:matrix']` | primary = Upload Standard; matrix is the next Cover step (Hub sheet covers the rest) |
| plan    | `['open:analyze']` | primary = Create Roadmap / Run Simulation; Analyze for cost/scenarios |
| govern  | `['open:approvals']` | primary = Generate / Approve Policies; approvals queue |
| track   | `['open:audit']` | primary = Capture Snapshot; audit checklist |

> This table is a **starting point** (like the framing distFactors were). The mechanism (registry + ≤4 + execute + dedup + gate) is what's built; exact chips get refined in the browser-review step and by the user.
>
> **Known, by-design consequences (not bugs):**
> - **`vision` and `model` resolve to exactly 1 chip** — their secondaries either don't exist (`vision`) or dedup to the primary's route (`model`'s `open:model-classic` and the phase-2 `nextAction` both resolve to `/project/:id`). That's fine: those stations have one clear next action and the rail handles navigation.
> - **AC-4 gating has two layers.** The *active* production path is the **empty-world component gate** (`StationActions` returns `null` when `elements.length === 0`; unit-tested in Task 3). The per-command **`available?(ctx)`** hook (AC-1 shape + the `open:analyze` phase-≥4 example) is deterministic per fixed-phase station in 3a and is exercised by the `stationActions.test.ts` filter test; it becomes dynamically load-bearing when Slice 3b's palette runs the full command set. Both are implemented; do not remove `available?`.

---

## Chunk 1: Command registry, curation, component, wiring

### Task 1: Command registry (`commands.ts`)

**Files:**
- Create: `packages/client/src/components/journey/commands.ts`
- Test: `packages/client/src/components/journey/commands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/components/journey/commands.test.ts
import { describe, test, expect, vi } from 'vitest';
import { buildCommandRegistry, resolveActionRoute, type CommandContext } from './commands';

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  projectId: 'p1',
  navigate: vi.fn(),
  phase: 2,
  ...over,
});

describe('resolveActionRoute (THE-492)', () => {
  test('sentinel routes resolve to the classic project view', () => {
    expect(resolveActionRoute('__envision__', 'p1')).toBe('/project/p1');
    expect(resolveActionRoute('__connection_mode__', 'p1')).toBe('/project/p1');
  });
  test('real routes pass through unchanged', () => {
    expect(resolveActionRoute('/project/p1/compliance/standards', 'p1')).toBe('/project/p1/compliance/standards');
  });
});

describe('buildCommandRegistry (THE-492)', () => {
  test('builds keyed safe commands whose run() navigates', () => {
    const c = ctx();
    const reg = buildCommandRegistry(c);
    expect(reg['goto:model']).toBeDefined();
    expect(reg['open:matrix']).toBeDefined();
    reg['open:matrix'].run(c);
    expect(c.navigate).toHaveBeenCalledWith('/project/p1/compliance/matrix');
  });
  test('analyze command is unavailable before phase 4 (reuses isToolbarActionVisible gating)', () => {
    const early = buildCommandRegistry(ctx({ phase: 3 }));
    const late = buildCommandRegistry(ctx({ phase: 4 }));
    expect(early['open:analyze'].available?.(ctx({ phase: 3 }))).toBe(false);
    expect(late['open:analyze'].available?.(ctx({ phase: 4 }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL** (module not found)

Run: `cd packages/client && npx vitest run src/components/journey/commands.test.ts`
Expected: FAIL — `Failed to resolve import './commands'`.

- [ ] **Step 3: Implement `commands.ts`**

```ts
// packages/client/src/components/journey/commands.ts
// The command vocabulary of the v2 Journey (THE-492, Slice 3a). Every command is
// SAFE — it only navigates (to a v2 station, a classic route, or a v2 sheet).
// Nothing toggles classic-only UI state (that no-ops/breaks from v2). Slice 3b's
// ⌘K palette will reuse Object.values(buildCommandRegistry(ctx)).
import type { JourneyPhase } from '../../stores/journeyStore';
import { isToolbarActionVisible } from '../../utils/phaseVisibility';

export interface CommandContext {
  projectId: string;
  navigate: (to: string) => void;
  phase: JourneyPhase;
}

export interface Command {
  id: string;
  group: string;
  label: string;
  keywords?: string[]; // reserved for 3b palette fuzzy search
  run: (ctx: CommandContext) => void;
  available?: (ctx: CommandContext) => boolean;
}

/** Sentinel nextAction routes (__envision__, __connection_mode__, …) have no v2
 *  home yet → resolve to the classic project view, the safe escape hatch. */
export function resolveActionRoute(route: string, projectId: string): string {
  return route.startsWith('__') ? `/project/${projectId}` : route;
}

/** Build the keyed registry of safe commands, closed over the current context. */
export function buildCommandRegistry(ctx: CommandContext): Record<string, Command> {
  const { projectId } = ctx;
  const nav = (route: string): Command['run'] => (c) => c.navigate(route);

  const list: Command[] = [
    // Station navigation
    { id: 'goto:vision',  group: 'Go to', label: 'Go to Vision',  run: nav(`/v2/project/${projectId}/vision`) },
    { id: 'goto:model',   group: 'Go to', label: 'Go to Model',   run: nav(`/v2/project/${projectId}/model`) },
    { id: 'goto:explore', group: 'Go to', label: 'Go to Explore', run: nav(`/v2/project/${projectId}/explore`) },
    { id: 'goto:plan',    group: 'Go to', label: 'Go to Plan',    run: nav(`/v2/project/${projectId}/plan`) },
    { id: 'goto:govern',  group: 'Go to', label: 'Go to Govern',  run: nav(`/v2/project/${projectId}/govern`) },
    { id: 'goto:track',   group: 'Go to', label: 'Go to Track',   run: nav(`/v2/project/${projectId}/track`) },
    // Classic tools / v2 sheets (deep-links)
    { id: 'open:model-classic', group: 'Model',      label: 'Open in classic editor', run: nav(`/project/${projectId}`) },
    { id: 'open:matrix',        group: 'Compliance', label: 'Coverage matrix',        run: nav(`/project/${projectId}/compliance/matrix`) },
    { id: 'open:approvals',     group: 'Compliance', label: 'Policy approvals',       run: nav(`/project/${projectId}/compliance/approvals`) },
    { id: 'open:audit',         group: 'Compliance', label: 'Audit checklist',        run: nav(`/project/${projectId}/compliance/audit`) },
    {
      id: 'open:analyze', group: 'Analyze', label: 'Open Analyze',
      run: nav(`/project/${projectId}/analyze`),
      available: (c) => isToolbarActionVisible('xray', c.phase, false), // xray/scenario gate = phase ≥ 4
    },
  ];

  return Object.fromEntries(list.map((c) => [c.id, c]));
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd packages/client && npx vitest run src/components/journey/commands.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/commands.ts packages/client/src/components/journey/commands.test.ts
git commit -m "feat(journey): safe command registry for the v2 command surface (THE-492)"
```

---

### Task 2: Per-station curation (`stationActions.ts`)

**Files:**
- Create: `packages/client/src/components/journey/stationActions.ts`
- Test: `packages/client/src/components/journey/stationActions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/components/journey/stationActions.test.ts
import { describe, test, expect, vi } from 'vitest';
import { getStationActions } from './stationActions';
import type { CommandContext } from './commands';
import type { PhaseInfo } from '../../stores/journeyStore';

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  projectId: 'p1', navigate: vi.fn(), phase: 2, ...over,
});

// Minimal phases stub: only the fields getStationActions reads.
const phases = (nextByPhase: Partial<Record<number, PhaseInfo['nextAction']>>): PhaseInfo[] =>
  ([1, 2, 3, 4, 5, 6] as const).map((p) => ({
    phase: p, admLabel: '', name: '', description: '', isDone: !nextByPhase[p],
    progress: { current: 0, target: 1, label: '' },
    nextAction: nextByPhase[p] ?? null,
  }));

describe('getStationActions (THE-492)', () => {
  test('primary is the station-phase nextAction, resolved, first', () => {
    const p = phases({ 2: { label: 'Add Connections', route: '__connection_mode__' } });
    const actions = getStationActions('model', p, ctx());
    expect(actions[0].label).toBe('Add Connections');
    actions[0].run(ctx()); // navigates to the resolved classic route
  });

  test('caps at 4 and dedups by resolved route', () => {
    const p = phases({ 3: { label: 'Map to Matrix', route: '/project/p1/compliance/matrix' } });
    // explore primary already routes to matrix; the 'open:matrix' secondary must be deduped
    const actions = getStationActions('explore', p, ctx({ phase: 3 }));
    expect(actions.length).toBeLessThanOrEqual(4);
    const matrixCount = actions.filter((a) => a.id === 'primary' || a.id === 'open:matrix').length;
    expect(matrixCount).toBe(1);
  });

  test('a done phase (nextAction null) yields no primary but keeps secondaries', () => {
    const actions = getStationActions('govern', phases({}), ctx({ phase: 5 }));
    expect(actions.every((a) => a.id !== 'primary')).toBe(true);
    expect(actions.some((a) => a.id === 'open:approvals')).toBe(true);
  });

  test('drops actions failing available() (analyze before phase 4)', () => {
    const actions = getStationActions('plan', phases({}), ctx({ phase: 3 }));
    expect(actions.some((a) => a.id === 'open:analyze')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `cd packages/client && npx vitest run src/components/journey/stationActions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `stationActions.ts`**

```ts
// packages/client/src/components/journey/stationActions.ts
// Curated per-station action set (THE-492, Slice 3a). Folds the station-phase's
// live nextAction (primary) with a small curated set of registry commands, capped
// at ≤4 (ADR-0005). Station-scoped: actions are for the station you are ON.
import type { PhaseInfo } from '../../stores/journeyStore';
import { STATIONS, type StationKey } from './stations';
import { buildCommandRegistry, resolveActionRoute, type Command, type CommandContext } from './commands';

const MAX_ACTIONS = 4;

// Curated secondary command ids per station (primary nextAction is prepended).
// Starting point — tunable in browser review (see plan).
const STATION_SECONDARY: Record<StationKey, string[]> = {
  vision:  [],
  model:   ['open:model-classic'],
  explore: ['open:matrix'],
  plan:    ['open:analyze'],
  govern:  ['open:approvals'],
  track:   ['open:audit'],
};

/** A stable "route" for dedup: the target a command navigates to. Derived by
 *  running the command against a capturing navigate. */
function routeOf(cmd: Command, ctx: CommandContext): string {
  let captured = '';
  cmd.run({ ...ctx, navigate: (to) => (captured = to) });
  return captured;
}

export function getStationActions(
  station: StationKey,
  phases: PhaseInfo[],
  ctx: CommandContext,
): Command[] {
  const registry = buildCommandRegistry(ctx);
  const phase = STATIONS.find((s) => s.key === station)!.phase;
  const nextAction = phases.find((p) => p.phase === phase)?.nextAction ?? null;

  const out: Command[] = [];

  if (nextAction) {
    const route = resolveActionRoute(nextAction.route, ctx.projectId);
    out.push({ id: 'primary', group: 'Next', label: nextAction.label, run: (c) => c.navigate(route) });
  }

  for (const id of STATION_SECONDARY[station]) {
    const cmd = registry[id];
    if (!cmd) continue;
    if (cmd.available && !cmd.available(ctx)) continue;
    out.push(cmd);
  }

  // Dedup by resolved route, keeping first occurrence; cap at MAX_ACTIONS.
  const seen = new Set<string>();
  const deduped: Command[] = [];
  for (const cmd of out) {
    const route = routeOf(cmd, ctx);
    if (seen.has(route)) continue;
    seen.add(route);
    deduped.push(cmd);
    if (deduped.length >= MAX_ACTIONS) break;
  }
  return deduped;
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd packages/client && npx vitest run src/components/journey/stationActions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/stationActions.ts packages/client/src/components/journey/stationActions.test.ts
git commit -m "feat(journey): curated ≤4 per-station action set folding nextAction + registry (THE-492)"
```

---

### Task 3: `StationActions` component

**Files:**
- Create: `packages/client/src/components/journey/StationActions.tsx`
- Test: `packages/client/src/components/journey/StationActions.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// packages/client/src/components/journey/StationActions.test.tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

// Drive the journey + architecture stores the component reads.
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import StationActions from './StationActions';

const seedPhases = (nextLabel: string | null) =>
  useJourneyStore.setState({
    currentPhase: 2,
    phases: ([1, 2, 3, 4, 5, 6] as const).map((p) => ({
      phase: p, admLabel: '', name: '', description: '', isDone: false,
      progress: { current: 0, target: 1, label: '' },
      nextAction: p === 2 && nextLabel ? { label: nextLabel, route: '__connection_mode__' } : null,
    })),
  });

beforeEach(() => {
  navigate.mockReset();
  useArchitectureStore.setState({ elements: [{ id: 'a' }] as never });
  seedPhases('Add Connections');
});

const renderIt = (station = 'model') =>
  render(<MemoryRouter><StationActions station={station as never} projectId="p1" /></MemoryRouter>);

describe('StationActions (THE-492)', () => {
  test('renders the station actions and executes on click', () => {
    renderIt('model');
    const primary = screen.getByRole('button', { name: /Add Connections/i });
    fireEvent.click(primary);
    expect(navigate).toHaveBeenCalledWith('/project/p1'); // sentinel resolved to classic
  });

  test('renders nothing when the world is empty (empty-world CTA owns that state)', () => {
    useArchitectureStore.setState({ elements: [] as never });
    const { container } = renderIt('model');
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `cd packages/client && npx vitest run src/components/journey/StationActions.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StationActions.tsx`**

```tsx
// packages/client/src/components/journey/StationActions.tsx
// The v2 command surface (THE-492, Slice 3a): the station's ≤4 executable actions,
// replacing the old navigation-only CTA. Renders nothing on an empty world (the
// JourneyShell "Generate with AI" CTA owns that state). No global hotkey (⌘K = 3b).
import { useNavigate } from 'react-router-dom';
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { STATIONS, type StationKey } from './stations';
import { getStationActions } from './stationActions';
import type { CommandContext } from './commands';

interface Props {
  projectId: string;
  station: StationKey;
}

export default function StationActions({ projectId, station }: Props) {
  const navigate = useNavigate();
  const phases = useJourneyStore((s) => s.phases);
  const elements = useArchitectureStore((s) => s.elements);

  if (elements.length === 0) return null; // empty-world CTA owns this state

  const phase = STATIONS.find((s) => s.key === station)!.phase;
  const ctx: CommandContext = { projectId, navigate, phase };
  const actions = getStationActions(station, phases, ctx);
  if (actions.length === 0) return null;

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Station actions">
      {actions.map((cmd, i) => (
        <button
          key={cmd.id}
          onClick={() => cmd.run(ctx)}
          className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md transition ${
            i === 0
              ? 'border-[#00ff41]/40 bg-[#00ff41]/10 text-[#00ff41] hover:bg-[#00ff41]/20'
              : 'border-[var(--border-subtle)] bg-[var(--surface-base)]/80 text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          {cmd.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd packages/client && npx vitest run src/components/journey/StationActions.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/StationActions.tsx packages/client/src/components/journey/StationActions.test.tsx
git commit -m "feat(journey): StationActions chip row — executes the station's ≤4 actions (THE-492)"
```

---

### Task 4: Wire into `StationRail` (replace the nav-only CTA)

**Files:**
- Modify: `packages/client/src/components/journey/StationRail.tsx` (replace the `NextStepBanner` block lines 46-55; import cleanup)
- Modify: `packages/client/src/components/journey/StationRail.test.tsx` — **3 existing tests assert the OLD recommended-phase CTA semantics and MUST be replaced** (they are now obsolete: behaviour is station-scoped, and the suite never seeds `architectureStore` so `StationActions` returns null on an empty world). This is mandatory or Step 5's `vitest run` goes red.

> **Why the 3 tests break:** the old CTA showed the *recommended* phase's action only when you were on a *different* station. `StationActions` is *station-scoped* + hidden on an empty world (`elements.length === 0`). So on the `vision` station (phase 1 `isDone:true` → `nextAction:null`) it renders nothing; on `model` it now DOES render 'Add Connections'. The three "CTA…" tests invert. And the rail suite seeds only `useJourneyStore`, never `useArchitectureStore` (defaults to `elements: []`), so `StationActions` is null throughout unless the new tests seed elements.

- [ ] **Step 1: Edit `StationRail.tsx` — replace the CTA block**

Add near the other journey imports and **remove** the `NextStepBanner` import:

```tsx
import StationActions from './StationActions';
```

Replace the CTA JSX block (the `{currentPhaseInfo?.nextAction && … <NextStepBanner … />}` block, lines ~46-55) with:

```tsx
      {/* The command surface: the station's ≤4 executable actions (THE-492).
          Replaces Slice-1's navigation-only nextAction CTA. */}
      <StationActions station={station} projectId={projectId} />
```

Then remove the code that only fed the old CTA and is now unused (tsc `noUnusedLocals` is OFF so this won't error, but keep it clean — the lint may flag it):
- the `currentPhaseInfo` line (`const currentPhaseInfo = phases.find(...)`)
- `currentPhase` from the `useJourneyStore()` destructure (keep `phases`, `recompute`)
- `stationForPhase` from the `./stations` import (keep `STATIONS`, `type StationKey`)
- the `NextStepBanner` import

- [ ] **Step 2: Rewrite the rail test — delete the 3 obsolete CTA tests, add station-scoped ones + seed `architectureStore`**

In `StationRail.test.tsx`: add the import and reset elements in `beforeEach`:

```tsx
import { useArchitectureStore } from '../../stores/architectureStore';
// …in beforeEach(), after seedStore():
useArchitectureStore.setState({ elements: [] as never });
```

**Delete** these three tests (obsolete recommended-phase semantics):
- `'CTA is shown away from the recommended station and flies to it on click'`
- `'CTA is hidden when already at the recommended station'`
- `'CTA is absent when the current phase has no nextAction'`

**Add** two station-scoped replacements (the click→navigate behaviour is covered by `StationActions.test.tsx`; here we only assert wiring + empty-world):

```tsx
  test('surfaces the current station\'s actions when the world is non-empty', () => {
    useArchitectureStore.setState({ elements: [{ id: 'a' }] as never });
    renderRail('model'); // phase 2, nextAction 'Add Connections'
    expect(screen.getByRole('group', { name: /station actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Connections/i })).toBeInTheDocument();
  });

  test('renders no actions on an empty world (the empty-world CTA owns that state)', () => {
    // beforeEach already set elements to []
    renderRail('model');
    expect(screen.queryByRole('group', { name: /station actions/i })).toBeNull();
  });
```

The 4 rail-nav tests (six stations, free jump, current marked, SR-complete) stay unchanged — they don't touch the CTA and pass with `StationActions` rendering null (empty elements).

- [ ] **Step 3: Run the rail + journey tests — expect PASS**

Run: `cd packages/client && npx vitest run src/components/journey/StationRail.test.tsx src/components/journey/JourneyShell.test.tsx`
Expected: PASS. Then `grep -rn "NextStepBanner" src/components/journey/StationRail.tsx` → expect **no match** (import removed; the component still lives in `design-system/` for `ProjectView`).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/journey/StationRail.tsx packages/client/src/components/journey/StationRail.test.tsx
git commit -m "feat(journey): rail surfaces StationActions instead of the nav-only CTA (THE-492)"
```

---

### Task 5: Full gate + browser verification + closeout

**Files:** none (verification only)

- [ ] **Step 1: Full client test suite**

Run: `cd packages/client && npx vitest run`
Expected: all pass. The 4 pre-existing `EnvironmentTeardownError` unhandled errors are baseline (confirm the count is unchanged, not +N from this slice).

- [ ] **Step 2: Bundle builds**

Run: `cd packages/client && npx vite build`
Expected: `✓ built`.

- [ ] **Step 3: tsc baseline unchanged**

Run: `cd packages/client && npx tsc -b 2>&1 | grep -c "error TS"`
Expected: `19` (the THE-486 baseline; 0 new). If >19, fix the new errors (do NOT touch the pre-existing 19).

- [ ] **Step 4: Browser verification** (real browser — WebGL/nav; the automation tab renders WebGL black but DOM works)

On each station `/v2/project/<id>/<station>`: confirm the action chips render (≤4), the primary chip is emphasised, clicking the primary navigates/executes (sentinel → classic project view; real routes → the classic tool), and an empty-world project shows the "Generate with AI" CTA instead of chips. Note any per-station chip that feels wrong — `STATION_SECONDARY` is tunable.

- [ ] **Step 5: Update the RVTM** with evidence (mark each requirement PASS with the test/browser evidence), then commit docs.

```bash
git add docs/superpowers/rvtm/2026-07-16-command-actions-rvtm.md
git commit -m "docs(journey): RVTM evidence for command actions (THE-492)"
```

- [ ] **Step 6: Push + PR**

```bash
git push -u origin mganzmanninfo/the-492-command-actions
gh pr create --base master --title "feat(journey): Slice 3a — command registry + curated per-station actions (THE-492)" --body "<summary + verification>"
```

---

## Non-goals (explicitly out of scope — own follow-ups)

- **⌘K global palette + fuzzy search + hotkey coexistence** with `ViewModeCamera`'s live `f`/arrows/1-9 keydown → **Slice 3b** (consumes `buildCommandRegistry`).
- Exhaustive wiring of all ~45–55 commands — only the curated safe set here.
- Central hotkey-registry refactor (scattered `keydown` stays).
- Native in-v2 execution of tools that live in classic (deep-link is the first-cut handoff, per the Conformance-gate-card precedent).
- Deleting classic Sidebar/Toolbar (already excluded from v2).
