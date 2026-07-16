# Slice 3b — ⌘K Command Menu (jump to any tool) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (fresh subagent per task + two-stage review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A global **⌘K / Ctrl+K** command menu in the v2 Journey shell that fuzzy-searches a curated ~28-command registry (grouped, keyboard-navigable) and executes on Enter — the "all tools" half of ADR-0005's Kommando-Fläche, on the registry Slice 3a built.

**Architecture:** Three additive pieces + one wiring edit. (1) `commands.ts` grows from 11 to ~28 **safe, route-navigable** commands with `keywords` and `available?` gates reusing `phaseVisibility.getVisibleSections`. (2) A pure `filterCommands(commands, query)` util (multi-term substring match over label+keywords+group — deterministic, no new dependency). (3) `CommandMenu.tsx`: an overlay (own light chrome + `useFocusTrap`) whose **focus always stays in the search input** — list selection moves via state (`aria-activedescendant` pattern), so `ViewModeCamera`'s global keydown (which early-returns on INPUT targets) is structurally silent while the menu is open. (4) `JourneyShell` registers the ⌘K listener and mounts the menu. `uiStore` gets a transient `isCommandMenuOpen` flag.

**Tech Stack:** React 18 + TypeScript, Zustand, Vite, Vitest + React Testing Library, Tailwind. Client package: `packages/client`. **No new npm dependency (no cmdk/kbar).**

**Spec:** Linear [THE-493](https://linear.app/thearchitect/issue/THE-493) (child of Epic THE-481). Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md`. Vocabulary: `CONTEXT.md`. Builds on THE-492.

**RVTM:** `docs/superpowers/rvtm/2026-07-16-command-menu-rvtm.md`

---

## Grounded facts (verified on master 3dcb060 — do not re-derive)

- **Registry (3a):** `components/journey/commands.ts` exports `CommandContext {projectId, navigate, phase}`, `Command {id, group, label, keywords?, run, available?}`, `resolveActionRoute`, `buildCommandRegistry(ctx)` → 11 commands (6 `goto:*`, 5 `open:*`). **The 5 existing `open:*`/6 `goto:*` ids are a contract — `stationCommands.ts`'s `STATION_SECONDARY` references `goto:model`, `open:model-classic`, `open:matrix`, `open:analyze`, `open:approvals`, `open:audit`. Do NOT rename them.**
- **Keydown coexistence:** `ViewModeCamera.tsx:380-381` — its window keydown handler **early-returns when `e.target` is INPUT/TEXTAREA/SELECT**. Listener registered non-capture at `:473` (f / arrows / 1-9, live in v2). ⌘K itself is unclaimed anywhere (only Toolbar's ⌘1/2/3/Z — classic-only).
- **Focus/overlay substrate:** `hooks/useFocusTrap.ts` — `useFocusTrap(isActive, onEscape)` **returns `containerRef`** (`:48`), auto-focuses first focusable, traps Tab, handles Escape. `design-system/patterns/Modal.tsx` exists but forces a `title` + X-button dialog chrome — wrong shape for a palette; we reuse **`useFocusTrap` only** (deliberate, documented deviation from the issue's "reuses Modal/useFocusTrap" — AC-1's substance is ⌘K/Esc/focus-trap, which `useFocusTrap` covers).
- **Phase gating:** `utils/phaseVisibility.ts:57` — `getVisibleSections(panel, phase, showAll): string[] | null` (null = no filtering; `'comply'`/`'analyze'` return per-phase section arrays; comply is empty for phases 1-2, analyze empty for 1-3). `isToolbarActionVisible` already gates `open:analyze` (phase ≥ 4).
- **Routes (App.tsx):** `/project/:projectId/compliance/:section` (:70), `/project/:projectId/analyze` (:71) + `/analyze/:section` (:72), `/project/:projectId/blueprint`, `/project/:projectId/portfolio` (:66 — there is **NO** top-level `/portfolio`), `/settings`, `/dashboard` all exist.
- **⚠️ Section-id vocabulary mismatch (two known cases):** `phaseVisibility` says `'monte'`/`'dashboard'`, but the PAGES render those sections as `'monte-carlo'` (AnalyzePage.tsx:57) and `'compliance-dashboard'` (CompliancePage.tsx:189). For these two commands the **route** uses the page's id and the **gate** uses phaseVisibility's id — bespoke entries, not the generic helper.
- **uiStore:** owns `isPaletteOpen`/`togglePalette` (ElementPalette — **do not touch**). Transient flags live unpersisted (`showChat` pattern, uiStore.ts:113-114). New: `isCommandMenuOpen` + `setCommandMenuOpen`.
- **JourneyShell (mount point):** `components/journey/JourneyShell.tsx` — root div at `:114`, `<Scene/>` `:116`, `<StationRail/>` `:155`. The station-camera effect + glow effect already live here; the ⌘K listener joins them.
- **journeyStore:** `currentPhase: JourneyPhase` on the store — the palette's gate context (the *project's* phase, unlike StationActions which uses the *station's* phase).

## File Structure

- **Modify** `packages/client/src/components/journey/commands.ts` — grow the registry to ~28 commands (+ `keywords` on all; comply/analyze `available?` via `getVisibleSections`). Existing ids untouched.
- **Create** `packages/client/src/components/journey/commandFilter.ts` — `filterCommands(commands, query)`: multi-term, case-insensitive substring match over `label`+`keywords`+`group`; preserves input order. (Distinct name — no case-only sibling of `CommandMenu.tsx`; lesson from THE-492.)
- **Create** `packages/client/src/components/journey/CommandMenu.tsx` — the overlay: search input (focus never leaves it), grouped list, ↑/↓/Enter/Esc, executes `cmd.run(ctx)` then closes.
- **Modify** `packages/client/src/stores/uiStore.ts` — `isCommandMenuOpen: boolean` + `setCommandMenuOpen(v: boolean)` (transient, additive).
- **Modify** `packages/client/src/components/journey/JourneyShell.tsx` — ⌘K/Ctrl+K window listener + `<CommandMenu projectId={projectId} />` mount.
- **Tests:** extend `commands.test.ts`; create `commandFilter.test.ts`, `CommandMenu.test.tsx`; extend `JourneyShell.test.tsx` (⌘K opens).

## Design decisions (locked)

1. **Focus-stays-in-input coexistence.** The search input keeps focus for the menu's whole lifetime; ↑/↓/Enter are handled by the input's own `onKeyDown` (with `e.preventDefault()`/`e.stopPropagation()`), and list selection is state-driven (`aria-activedescendant`). Because `ViewModeCamera`'s handler early-returns on INPUT targets, arrows/1-9/f **cannot** drive the camera while the menu is open — structurally, not by patching ViewModeCamera. Three escape hatches are explicitly plugged (review finding): **(a) Tab/Shift+Tab** are `preventDefault`ed in the input's `onKeyDown` (useFocusTrap's wrap would otherwise programmatically focus an option BUTTON despite `tabIndex={-1}`, and plain Tab would leave the overlay); **(b) mousedown** on the panel is `preventDefault`ed so clicking options can never steal focus from the input (click still fires); (c) stopPropagation as belt-and-suspenders.
2. **No new dependency.** Filter = multi-term substring (every whitespace-separated token must match label/keywords/group, case-insensitive). Deterministic, unit-testable; real fuzzy ranking is YAGNI for ~28 commands.
3. **Safe-only, route-navigable.** Every new command navigates to an existing route. No classic-only toggles/modals (mission-control, imports). Gating reuses `phaseVisibility` — no parallel gate.
4. **v2-only.** Listener + mount live in `JourneyShell`; classic UI byte-identical. New store flag is transient (not persisted), named `commandMenu` (no `palette` collision).
5. **Existing command ids frozen** (StationActions contract). New ids: `open:comply-*`, `open:analyze-*`, `open:blueprint`, `open:portfolio`, `open:settings`, `open:dashboard`. **Non-regression proof for the new gates on `open:matrix`/`open:approvals`/`open:audit`:** StationActions passes the *station's* phase (explore=3, govern=5, track=6), and `matrix ∈ COMPLY_SECTIONS[3]`, `approvals ∈ COMPLY_SECTIONS[5]`, `audit ∈ COMPLY_SECTIONS[6]` (phaseVisibility.ts:28-31) — the 3a chips survive. Task 1 Step 4 re-runs the 3a suites to prove it.
6. **Gate = `npx vitest run` + `npx vite build` + tsc-count ≤ 19. Never `npm run build`** (THE-486 baseline; see `reference_client_tsc_cold_fail`).

---

## Chunk 1: Registry expansion + filter + menu + wiring

### Task 1: Curated registry expansion (`commands.ts`)

**Files:**
- Modify: `packages/client/src/components/journey/commands.ts`
- Test: `packages/client/src/components/journey/commands.test.ts` (extend)

- [ ] **Step 1: Extend the test with the 3b requirements (failing first)**

Append to `commands.test.ts` (keep the existing tests untouched):

```ts
describe('buildCommandRegistry — 3b curated expansion (THE-493)', () => {
  test('grows to the curated jump-to-any-tool set (≥25 commands)', () => {
    const reg = buildCommandRegistry(ctx({ phase: 6 }));
    expect(Object.keys(reg).length).toBeGreaterThanOrEqual(25);
  });

  test('the 3a command ids stay frozen (StationActions contract)', () => {
    const reg = buildCommandRegistry(ctx());
    for (const id of ['goto:model', 'open:model-classic', 'open:matrix', 'open:analyze', 'open:approvals', 'open:audit']) {
      expect(reg[id]).toBeDefined();
    }
  });

  test('every command carries keywords for the palette search', () => {
    const reg = buildCommandRegistry(ctx());
    for (const cmd of Object.values(reg)) {
      expect(cmd.keywords && cmd.keywords.length > 0).toBe(true);
    }
  });

  test('comply sections are phase-gated via getVisibleSections', () => {
    const reg1 = buildCommandRegistry(ctx({ phase: 1 }));
    const reg5 = buildCommandRegistry(ctx({ phase: 5 }));
    // comply is empty for phases 1-2 → unavailable; visible from its phase on
    expect(reg1['open:comply-standards'].available?.(ctx({ phase: 1 }))).toBe(false);
    expect(reg5['open:comply-standards'].available?.(ctx({ phase: 5 }))).toBe(true);
    expect(reg5['open:comply-approvals'].available?.(ctx({ phase: 5 }))).toBe(true);
  });

  test('analyze sections are phase-gated (empty before phase 4)', () => {
    expect(buildCommandRegistry(ctx({ phase: 3 }))['open:analyze-risk'].available?.(ctx({ phase: 3 }))).toBe(false);
    expect(buildCommandRegistry(ctx({ phase: 4 }))['open:analyze-risk'].available?.(ctx({ phase: 4 }))).toBe(true);
  });

  test('a new command navigates to its real route', () => {
    const c = ctx();
    buildCommandRegistry(c)['open:blueprint'].run(c);
    expect(c.navigate).toHaveBeenCalledWith('/project/p1/blueprint');
  });
});
```

- [ ] **Step 2: Run — expect the new describe to FAIL** (`open:comply-standards` undefined, keywords missing on 3a commands)

Run: `cd packages/client && npx vitest run src/components/journey/commands.test.ts`

- [ ] **Step 3: Implement the expansion**

Replace the `list: Command[]` body in `buildCommandRegistry` with the curated set (existing ids kept, now with `keywords`; helper `sectionGate`):

```ts
import { getVisibleSections, isToolbarActionVisible } from '../../utils/phaseVisibility';
```

```ts
export function buildCommandRegistry(ctx: CommandContext): Record<string, Command> {
  const { projectId } = ctx;
  const nav = (route: string): Command['run'] => (c) => c.navigate(route);
  // Phase-gate a comply/analyze section through the existing progressive-disclosure
  // map (no parallel gate). Sections absent from the phase's list are unavailable.
  const sectionGate = (panel: 'comply' | 'analyze', section: string): Command['available'] =>
    (c) => getVisibleSections(panel, c.phase, false)?.includes(section) ?? true;

  const comply = (section: string, label: string, keywords: string[]): Command => ({
    id: `open:comply-${section}`, group: 'Compliance', label, keywords,
    run: nav(`/project/${projectId}/compliance/${section}`),
    available: sectionGate('comply', section),
  });
  const analyze = (section: string, label: string, keywords: string[]): Command => ({
    id: `open:analyze-${section}`, group: 'Analyze', label, keywords,
    run: nav(`/project/${projectId}/analyze/${section}`),
    available: sectionGate('analyze', section),
  });

  const list: Command[] = [
    // Station navigation (ids frozen — StationActions contract)
    { id: 'goto:vision',  group: 'Go to', label: 'Go to Vision',  keywords: ['station', 'phase a', 'scope'],        run: nav(`/v2/project/${projectId}/vision`) },
    { id: 'goto:model',   group: 'Go to', label: 'Go to Model',   keywords: ['station', 'editor', 'elements'],      run: nav(`/v2/project/${projectId}/model`) },
    { id: 'goto:explore', group: 'Go to', label: 'Go to Explore', keywords: ['station', 'standards', 'cover'],      run: nav(`/v2/project/${projectId}/explore`) },
    { id: 'goto:plan',    group: 'Go to', label: 'Go to Plan',    keywords: ['station', 'roadmap', 'migration'],    run: nav(`/v2/project/${projectId}/plan`) },
    { id: 'goto:govern',  group: 'Go to', label: 'Go to Govern',  keywords: ['station', 'policies', 'enforce'],     run: nav(`/v2/project/${projectId}/govern`) },
    { id: 'goto:track',   group: 'Go to', label: 'Go to Track',   keywords: ['station', 'audit', 'attest'],         run: nav(`/v2/project/${projectId}/track`) },
    // Model / project (ids frozen)
    { id: 'open:model-classic', group: 'Model', label: 'Open in classic editor', keywords: ['3d', 'edit', 'project view'], run: nav(`/project/${projectId}`) },
    { id: 'open:blueprint',     group: 'Model', label: 'Generate with AI (Blueprint)', keywords: ['ai', 'generate', 'import', 'create'], run: nav(`/project/${projectId}/blueprint`) },
    // Compliance sections (id open:matrix frozen; the rest are new open:comply-*)
    { id: 'open:matrix', group: 'Compliance', label: 'Coverage matrix', keywords: ['compliance', 'mapping', 'gaps'], run: nav(`/project/${projectId}/compliance/matrix`), available: sectionGate('comply', 'matrix') },
    comply('standards', 'Standards & regulations', ['upload', 'iso', 'togaf', 'norm']),
    comply('pipeline',  'Compliance pipeline',     ['stages', 'status', 'progress']),
    comply('remediate', 'Gap remediation',         ['fix', 'gaps', 'remediation']),
    comply('policies',  'Policies',                ['rules', 'governance', 'policy']),
    comply('elements',  'Element compliance',      ['violations', 'element']),
    // Bespoke: the page's section id ('compliance-dashboard') ≠ phaseVisibility's gate id ('dashboard').
    { id: 'open:comply-dashboard', group: 'Compliance', label: 'Compliance dashboard', keywords: ['overview', 'kpi'],
      run: nav(`/project/${projectId}/compliance/compliance-dashboard`), available: sectionGate('comply', 'dashboard') },
    comply('progress',  'Compliance progress',     ['snapshot', 'history']),
    comply('roadmap',   'Compliance roadmap',      ['plan', 'waves', 'migration']),
    { id: 'open:approvals', group: 'Compliance', label: 'Policy approvals', keywords: ['approve', 'review', 'sign-off'], run: nav(`/project/${projectId}/compliance/approvals`), available: sectionGate('comply', 'approvals') },
    { id: 'open:audit',     group: 'Compliance', label: 'Audit checklist',  keywords: ['attest', 'checklist', 'evidence'], run: nav(`/project/${projectId}/compliance/audit`), available: sectionGate('comply', 'audit') },
    // Analyze (id open:analyze frozen)
    { id: 'open:analyze', group: 'Analyze', label: 'Open Analyze', keywords: ['analysis', 'insights'], run: nav(`/project/${projectId}/analyze`), available: (c) => isToolbarActionVisible('xray', c.phase, false) },
    analyze('risk',      'Risk analysis',        ['risk', 'criticality']),
    analyze('impact',    'Impact analysis',      ['impact', 'dependencies']),
    analyze('cost',      'Cost analysis',        ['cost', 'budget', 'spend']),
    // Bespoke: the page's section id ('monte-carlo') ≠ phaseVisibility's gate id ('monte').
    { id: 'open:analyze-monte', group: 'Analyze', label: 'Monte Carlo simulation', keywords: ['simulation', 'probability', 'monte carlo'],
      run: nav(`/project/${projectId}/analyze/monte-carlo`), available: sectionGate('analyze', 'monte') },
    analyze('scenarios', 'Scenario planning',    ['what-if', 'scenario', 'oracle']),
    analyze('roadmap',   'Roadmap analysis',     ['roadmap', 'timeline', 'plateau']),
    analyze('portfolio', 'Portfolio analysis',   ['portfolio', 'applications']),
    // Workspace (NOTE: portfolio is project-scoped — there is no top-level /portfolio route)
    { id: 'open:portfolio', group: 'Workspace', label: 'Portfolio', keywords: ['projects', 'overview'], run: nav(`/project/${projectId}/portfolio`) },
    { id: 'open:dashboard', group: 'Workspace', label: 'Dashboard', keywords: ['home', 'projects'],     run: nav('/dashboard') },
    { id: 'open:settings',  group: 'Workspace', label: 'Settings',  keywords: ['preferences', 'account', 'profile'], run: nav('/settings') },
  ];

  return Object.fromEntries(list.map((c) => [c.id, c]));
}
```

(Header comment of the file: update "Slice 3b's ⌘K palette will reuse…" to "…the ⌘K CommandMenu (THE-493) lists this registry".)

- [ ] **Step 4: Run — expect PASS** (old + new tests; also re-run `stationCommands.test.ts` + `StationActions.test.tsx` to prove the 3a contract holds)

Run: `cd packages/client && npx vitest run src/components/journey/commands.test.ts src/components/journey/stationCommands.test.ts src/components/journey/StationActions.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/commands.ts packages/client/src/components/journey/commands.test.ts
git commit -m "feat(journey): curated ~28-command registry with keywords + phase gates (THE-493)"
```

---

### Task 2: Filter util (`commandFilter.ts`) + uiStore flag

**Files:**
- Create: `packages/client/src/components/journey/commandFilter.ts`
- Test: `packages/client/src/components/journey/commandFilter.test.ts`
- Modify: `packages/client/src/stores/uiStore.ts` (2 additive lines in interface + 2 in store)

- [ ] **Step 1: Write the failing filter test**

```ts
// packages/client/src/components/journey/commandFilter.test.ts
import { describe, test, expect } from 'vitest';
import { filterCommands } from './commandFilter';
import type { Command } from './commands';

const cmd = (id: string, label: string, keywords: string[] = [], group = 'G'): Command =>
  ({ id, group, label, keywords, run: () => {} });

const cmds = [
  cmd('a', 'Coverage matrix', ['compliance', 'mapping'], 'Compliance'),
  cmd('b', 'Risk analysis', ['risk'], 'Analyze'),
  cmd('c', 'Go to Model', ['station', 'editor'], 'Go to'),
];

describe('filterCommands (THE-493)', () => {
  test('empty query returns all, in order', () => {
    expect(filterCommands(cmds, '').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  test('matches label substring case-insensitively', () => {
    expect(filterCommands(cmds, 'MATRIX').map((c) => c.id)).toEqual(['a']);
  });
  test('matches keywords and group', () => {
    expect(filterCommands(cmds, 'mapping').map((c) => c.id)).toEqual(['a']);
    expect(filterCommands(cmds, 'analyze').map((c) => c.id)).toEqual(['b']);
  });
  test('multi-term: every token must match somewhere', () => {
    expect(filterCommands(cmds, 'go model').map((c) => c.id)).toEqual(['c']);
    expect(filterCommands(cmds, 'go matrix')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found)

Run: `cd packages/client && npx vitest run src/components/journey/commandFilter.test.ts`

- [ ] **Step 3: Implement filter + store flag**

```ts
// packages/client/src/components/journey/commandFilter.ts
// Palette search (THE-493): multi-term substring match — every whitespace token
// must appear in the command's label, keywords, or group (case-insensitive).
// Deterministic and dependency-free; real fuzzy ranking is YAGNI at ~28 commands.
import type { Command } from './commands';

export function filterCommands(commands: Command[], query: string): Command[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return commands;
  return commands.filter((cmd) => {
    const haystack = [cmd.label, cmd.group, ...(cmd.keywords ?? [])].join(' ').toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
```

`uiStore.ts` — in the `UIState` interface (near `isPaletteOpen`):

```ts
  // v2 command menu (THE-493) — transient, v2-only; NOT the ElementPalette's isPaletteOpen
  isCommandMenuOpen: boolean;
  setCommandMenuOpen: (v: boolean) => void;
```

In the store body (near `togglePalette`):

```ts
  isCommandMenuOpen: false,
  setCommandMenuOpen: (v) => set({ isCommandMenuOpen: v }),
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/client && npx vitest run src/components/journey/commandFilter.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/commandFilter.ts packages/client/src/components/journey/commandFilter.test.ts packages/client/src/stores/uiStore.ts
git commit -m "feat(journey): command filter util + transient isCommandMenuOpen flag (THE-493)"
```

---

### Task 3: `CommandMenu.tsx`

**Files:**
- Create: `packages/client/src/components/journey/CommandMenu.tsx`
- Test: `packages/client/src/components/journey/CommandMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// packages/client/src/components/journey/CommandMenu.test.tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

import { useUIStore } from '../../stores/uiStore';
import { useJourneyStore } from '../../stores/journeyStore';
import CommandMenu from './CommandMenu';

beforeEach(() => {
  navigate.mockReset();
  useUIStore.setState({ isCommandMenuOpen: true });
  useJourneyStore.setState({ currentPhase: 6 }); // everything available
});

const renderMenu = () => render(<MemoryRouter><CommandMenu projectId="p1" /></MemoryRouter>);

describe('CommandMenu (THE-493)', () => {
  test('renders nothing when closed', () => {
    useUIStore.setState({ isCommandMenuOpen: false });
    const { container } = renderMenu();
    expect(container).toBeEmptyDOMElement();
  });

  test('open: search input has focus; typing filters the list', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'matrix' } });
    expect(screen.getByRole('option', { name: /Coverage matrix/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Go to Vision/i })).toBeNull();
  });

  test('Enter runs the top match and closes', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'blueprint' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/project/p1/blueprint');
    expect(useUIStore.getState().isCommandMenuOpen).toBe(false);
  });

  test('ArrowDown moves the active option', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    const first = input.getAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).not.toBe(first);
  });

  test('Tab is swallowed — focus never leaves the search input', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    const e = fireEvent.keyDown(input, { key: 'Tab' });
    // preventDefault called → fireEvent returns false
    expect(e).toBe(false);
    expect(input).toHaveFocus();
  });

  test('Escape closes without running anything', () => {
    renderMenu();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(useUIStore.getState().isCommandMenuOpen).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  test('unavailable commands are hidden (phase gate)', () => {
    useJourneyStore.setState({ currentPhase: 1 });
    renderMenu();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'standards' } });
    expect(screen.queryByRole('option', { name: /Standards & regulations/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found)

Run: `cd packages/client && npx vitest run src/components/journey/CommandMenu.test.tsx`

- [ ] **Step 3: Implement `CommandMenu.tsx`**

```tsx
// packages/client/src/components/journey/CommandMenu.tsx
// The ⌘K command menu (THE-493, Slice 3b): fuzzy-searches the safe command
// registry (THE-492) and executes on Enter. Focus stays in the search input for
// the menu's whole lifetime (list selection via aria-activedescendant) — since
// ViewModeCamera's global keydown early-returns on INPUT targets, the camera's
// f/arrow/number shortcuts are structurally silent while the menu is open.
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { buildCommandRegistry, type Command, type CommandContext } from './commands';
import { filterCommands } from './commandFilter';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  projectId: string;
}

export default function CommandMenu({ projectId }: Props) {
  const navigate = useNavigate();
  const isOpen = useUIStore((s) => s.isCommandMenuOpen);
  const setOpen = useUIStore((s) => s.setCommandMenuOpen);
  const phase = useJourneyStore((s) => s.currentPhase);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Stable callback: useFocusTrap's effect depends on onEscape — an inline arrow
  // would re-subscribe (and re-focus) on every keystroke.
  const close = useCallback(() => setOpen(false), [setOpen]);
  const containerRef = useFocusTrap(isOpen, close);

  const ctx: CommandContext = useMemo(
    () => ({ projectId, navigate, phase }),
    [projectId, navigate, phase],
  );

  const visible: Command[] = useMemo(() => {
    if (!isOpen) return [];
    const all = Object.values(buildCommandRegistry(ctx)).filter(
      (c) => !c.available || c.available(ctx),
    );
    return filterCommands(all, query);
  }, [isOpen, ctx, query]);

  // Reset transient state whenever the menu (re)opens; reset the highlight to the
  // top match on every query change (standard palette behaviour).
  useEffect(() => {
    if (isOpen) { setQuery(''); setActiveIndex(0); }
  }, [isOpen]);
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const runActive = () => {
    const cmd = visible[activeIndex];
    if (!cmd) return;
    setOpen(false);
    cmd.run(ctx);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Keep every key inside the menu — nothing may reach the camera shortcuts.
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    // Tab/Shift+Tab would break the focus-stays-in-input invariant: useFocusTrap's
    // wrap focuses the last FOCUSABLE (an option button, tabIndex=-1 notwithstanding),
    // and plain Tab would leave the overlay. The menu has exactly one focus stop.
    else if (e.key === 'Tab') { e.preventDefault(); }
  };

  // Group headers: render in registry order, header when the group changes.
  let lastGroup = '';

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        // Clicking anywhere in the panel must not steal focus from the input
        // (mousedown moves focus before click) — click handlers still fire.
        onMouseDown={(e) => e.preventDefault()}
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <Search size={14} className="text-[var(--text-tertiary)]" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-menu-list"
            aria-activedescendant={visible[activeIndex] ? `cmd-${visible[activeIndex].id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to any tool…"
            className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <kbd className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">esc</kbd>
        </div>
        <ul id="command-menu-list" role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto py-1">
          {visible.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">No matching commands</li>
          )}
          {visible.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <li key={cmd.id}>
                {header && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    {header}
                  </div>
                )}
                <button
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={runActive}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition ${
                    i === activeIndex
                      ? 'bg-[#7c3aed]/15 text-white'
                      : 'text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  {cmd.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/client && npx vitest run src/components/journey/CommandMenu.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/CommandMenu.tsx packages/client/src/components/journey/CommandMenu.test.tsx
git commit -m "feat(journey): CommandMenu overlay — search, keyboard nav, execute (THE-493)"
```

---

### Task 4: ⌘K wiring in `JourneyShell`

**Files:**
- Modify: `packages/client/src/components/journey/JourneyShell.tsx`
- Test: `packages/client/src/components/journey/JourneyShell.test.tsx` (extend)

- [ ] **Step 1: Extend the shell test (failing first)**

`JourneyShell.test.tsx` mocks heavy edges; add a `CommandMenu` mock next to the existing ones (the real menu is covered by its own suite). Use the **async factory** (hoisting-safe, mirrors the `Scene` mock at the top of the file):

```tsx
vi.mock('./CommandMenu', async () => {
  const { useUIStore } = await import('../../stores/uiStore');
  return {
    default: () => {
      const open = useUIStore((s) => s.isCommandMenuOpen);
      return open ? <div data-testid="command-menu" /> : null;
    },
  };
});
```

Add tests:

```tsx
  test('⌘K opens the command menu; Ctrl+K works too', () => {
    renderShell('/v2/project/p1/model');
    expect(screen.queryByTestId('command-menu')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-menu')).toBeInTheDocument();
  });

  test('⌘K does not open while typing in an input', () => {
    renderShell('/v2/project/p1/model');
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'k', metaKey: true });
    expect(screen.queryByTestId('command-menu')).toBeNull();
    input.remove();
  });
```

Also seed `isCommandMenuOpen: false` in the test's `beforeEach` `useUIStore.setState` block.

- [ ] **Step 2: Run — expect the new tests to FAIL**

Run: `cd packages/client && npx vitest run src/components/journey/JourneyShell.test.tsx`

- [ ] **Step 3: Wire the listener + mount**

In `JourneyShell.tsx`: import `CommandMenu` and add near the other effects:

```tsx
  const setCommandMenuOpen = useUIStore((s) => s.setCommandMenuOpen);

  // ⌘K / Ctrl+K opens the command menu (THE-493). v2-only — the listener lives
  // and dies with the shell. Ignores keystrokes while typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setCommandMenuOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandMenuOpen]);
```

Mount inside the root div (after the Sheet, before `StationRail`):

```tsx
      {projectId && <CommandMenu projectId={projectId} />}
```

- [ ] **Step 4: Run shell + journey folder — expect PASS**

Run: `cd packages/client && npx vitest run src/components/journey/`

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/journey/JourneyShell.tsx packages/client/src/components/journey/JourneyShell.test.tsx
git commit -m "feat(journey): ⌘K opens the CommandMenu in the v2 shell (THE-493)"
```

---

### Task 5: Full gate + browser verification + closeout

**Files:** none (verification only)

- [ ] **Step 1: Full suite** — `cd packages/client && npx vitest run` → all pass (4 pre-existing teardown errors = baseline, not +N).
- [ ] **Step 2: Build** — `npx vite build` → ✓.
- [ ] **Step 3: tsc** — `npx tsc -b 2>&1 | grep -c "error TS"` → `19` (0 new).
- [ ] **Step 4: Browser (DOM-checkable in the automation tab; visual polish in the user's browser):** on `/v2/project/<id>/<station>`: ⌘K opens the menu with focus in the input; typing filters; ↑/↓ moves the highlight; Enter navigates to the tool (e.g. "Coverage matrix" → classic compliance/matrix); Esc / click-outside closes. **Coexistence check:** with the menu open, press ↑/↓ — the 3D camera/plateau selection must NOT move; after closing, `f`/arrows work again.
- [ ] **Step 5: Create/update the RVTM** (`docs/superpowers/rvtm/2026-07-16-command-menu-rvtm.md` — created at plan-approval time via rvtm-traceability) with evidence; commit docs.
- [ ] **Step 6: Push + PR** (`gh pr create --base master …`).

---

## Non-goals (explicitly out of scope — own follow-ups)

- Full ~45–55-command wiring / classic-only toggle or modal commands (mission-control, imports).
- Central hotkey-registry refactor (scattered `keydown` stays).
- Palette in the classic UI (v2-only).
- Recents / frecency / command history; fuzzy *ranking* (filter is match-only).
- New npm dependencies (no cmdk/kbar).
