# Sheet Container (resizable + dockable) Implementation Plan — THE-485

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable `Sheet` container — a right/left-dockable, width-resizable panel shell that all v2 Journey Sheet overlays render inside — and migrate the two existing Slice-1 sheets onto it so "one Sheet at a time" and its chrome become structural, not per-consumer.

**Architecture:** A leaf `Sheet` component owns positioning (`absolute inset-y-0`, left or right), width (from a persisted store value, clamped), the border/background/backdrop/shadow chrome, a drag-resize handle on the inner edge (pointer-capture so the drag never reaches the WebGL canvas / OrbitControls), and a dock-side toggle. Width + dock persist via the repo's existing manual-`localStorage` convention (mirroring `loadFavorites`/`ta_favorite_types`). Content components (`StationSheet`, `PropertyPanel`) render *inside* the Sheet without their own outer chrome. `JourneyShell` renders exactly one `<Sheet>` whose child is chosen by station.

**Tech Stack:** React 18 + TS strict, Zustand, Tailwind v4 (dark theme, CSS vars), Vitest 4 + React Testing Library (jsdom via per-file pragma), lucide-react icons.

**Linear:** [THE-485](https://linear.app/thearchitect/issue/THE-485) (child of Epic THE-481) · **Decisions:** `docs/adr/0005-spatial-journey-ui-restructure.md` · **Vocabulary:** `CONTEXT.md` ("Sheet")

**RVTM:** `docs/superpowers/rvtm/2026-07-16-sheet-container-rvtm.md`

---

## Context the implementing engineer needs (read first)

**What a "Sheet" is** (`CONTEXT.md`): a DOM overlay that slides *over* the persistent 3D World to hold dense, non-spatial content (matrices, tables, property editing); it never changes route and never unmounts the World. Slice 1 shipped two ad-hoc sheets; this slice extracts their shared shell into one reusable `Sheet` and adds resize + dock.

**Exact current state (post-Slice-1 merge, on this branch):**

- `packages/client/src/components/journey/JourneyShell.tsx` (105 LOC) renders two mutually-exclusive right-edge sheets (lines 90-98):
  ```tsx
  {/* Station Sheet: placeholder for stations that migrate in later slices */}
  {station !== 'model' && projectId && <StationSheet station={station} projectId={projectId} />}

  {/* v2: PropertyPanel is an overlay Sheet only on Model, only with a selection — avoids empty-panel clutter + right-edge collision with StationSheet (THE-482 review). */}
  {station === 'model' && isPropertyPanelOpen && selectedElementId && (
    <div className="absolute bottom-0 right-0 top-0 z-30 flex">
      <PropertyPanel />
    </div>
  )}
  ```
  The mutual exclusion (`station !== 'model'` vs `=== 'model'`) is the collision-avoidance hack this slice replaces structurally. Also present: HUD `<header>` at `z-30`, empty-world overlay at `z-10`, `<StationRail>` last.

- `packages/client/src/components/journey/StationSheet.tsx` (37 LOC) declares its OWN outer chrome — `absolute right-0 top-0 bottom-0 z-20 flex pointer-events-none` wrapping an inner `w-[420px] max-w-[40vw] min-w-[300px] ... border-l border-[var(--border-default)] bg-[var(--surface-raised)]/95 backdrop-blur-md shadow-2xl p-6`. This chrome moves into `Sheet`; `StationSheet` becomes content-only.

- `packages/client/src/components/ui/PropertyPanel.tsx` (2081 LOC, shared with classic `ProjectView`) — its rendered root is an `<aside className="w-72 border-l border-[var(--border-subtle)] bg-[var(--surface-raised)] ...">` (fixed 288px). It is used by BOTH classic and v2, so it must not change behavior for classic.

- `packages/client/src/stores/uiStore.ts` (156 LOC) persists UI prefs via a hand-rolled convention, NOT zustand `persist`: loader fns `loadFavorites()` (reads `localStorage 'ta_favorite_types'`, L72-77) and `loadShowAll()` (L79-83), with setters that call `localStorage.setItem` (e.g. `toggleFavoriteType` L135-141). Mirror this exactly for the Sheet.

**Design constraint (from the Pre-Flight, non-negotiable):** the Sheet lives above the 3D `<Canvas>`. The resize handle MUST use pointer-capture + `stopPropagation` so a resize drag never reaches the canvas and fights `OrbitControls`.

**Test conventions:** Vitest 4, `vite.config.ts` `environment: 'node'` + globals; component tests opt into jsdom with a first-line `// @vitest-environment jsdom` pragma and use RTL + `@testing-library/jest-dom/vitest`. Reference: `src/components/journey/StationSheet.test.tsx`, `src/components/journey/JourneyShell.test.tsx`. Run from `packages/client/`: `npx vitest run <path>`. jsdom does NOT implement `setPointerCapture`/`releasePointerCapture` — call them via optional chaining so tests can drive `pointerDown`/`pointerMove`/`pointerUp` without a stub.

**Out of scope (do NOT build):** free-floating drag-anywhere; migrating `ComplianceOverlay`/`MissionControl` (Slice 2 / separate); touch-specific gestures beyond Pointer Events. Keep classic UI behavior byte-identical (only additive changes to shared files).

**Run commands from `packages/client/`.**

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `stores/uiStore.ts` | add `sheetWidth`/`sheetDock` state + loaders + clamped setter + dock toggle | modify (additive) |
| `components/journey/sheetPrefs.ts` | pure helpers: clamp, load/save width & dock (unit-testable without a store) | create |
| `components/journey/Sheet.tsx` | the reusable container: positioning, width, dock, chrome, resize handle, dock toggle, a11y | create |
| `components/journey/StationSheet.tsx` | strip outer chrome → content-only | modify |
| `components/journey/JourneyShell.tsx` | render exactly one `<Sheet>` with station-chosen content | modify |
| `components/ui/PropertyPanel.tsx` | additive `fill?: boolean` prop → root `w-72` becomes `w-full` when filling a Sheet | modify (additive, classic-safe) |

---

## Chunk 1: Container + persistence (Tasks 1–3)

### Task 1: Sheet preference helpers + uiStore wiring

Pure clamp/persist helpers first (easy to unit-test), then wire them into `uiStore` mirroring the existing `loadFavorites` convention.

**Files:**
- Create: `packages/client/src/components/journey/sheetPrefs.ts`
- Test: `packages/client/src/components/journey/sheetPrefs.test.ts`
- Modify: `packages/client/src/stores/uiStore.ts`
- Test: `packages/client/src/stores/uiStore.sheet.test.ts`

- [ ] **Step 1: Write the failing helper test**

```ts
// packages/client/src/components/journey/sheetPrefs.test.ts
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { SHEET_MIN, SHEET_MAX, clampSheetWidth, loadSheetWidth, saveSheetWidth, loadSheetDock, saveSheetDock } from './sheetPrefs';

beforeEach(() => { localStorage.clear(); });

describe('sheetPrefs', () => {
  test('clamp keeps width within [MIN, MAX]', () => {
    expect(clampSheetWidth(10)).toBe(SHEET_MIN);
    expect(clampSheetWidth(99999)).toBe(SHEET_MAX);
    expect(clampSheetWidth(420)).toBe(420);
  });
  test('width persists and reloads clamped; default when absent/garbage', () => {
    expect(loadSheetWidth()).toBe(420); // default
    saveSheetWidth(500);
    expect(localStorage.getItem('ta_sheet_width')).toBe('500');
    expect(loadSheetWidth()).toBe(500);
    localStorage.setItem('ta_sheet_width', 'not-a-number');
    expect(loadSheetWidth()).toBe(420); // falls back to default
    saveSheetWidth(99999); // save clamps
    expect(loadSheetWidth()).toBe(SHEET_MAX);
  });
  test('dock persists; default right; only left/right accepted', () => {
    expect(loadSheetDock()).toBe('right');
    saveSheetDock('left');
    expect(loadSheetDock()).toBe('left');
    localStorage.setItem('ta_sheet_dock', 'sideways');
    expect(loadSheetDock()).toBe('right');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run src/components/journey/sheetPrefs.test.ts`, module not found).

- [ ] **Step 3: Implement the helpers**

```ts
// packages/client/src/components/journey/sheetPrefs.ts
// Sheet width/dock persistence — mirrors uiStore's existing manual-localStorage
// convention (ta_favorite_types, ta_show_all_sections), NOT zustand persist().
export type DockSide = 'left' | 'right';

export const SHEET_MIN = 300;
export const SHEET_MAX = 640;
export const SHEET_DEFAULT_WIDTH = 420; // matches Slice-1 StationSheet width
const KEY_W = 'ta_sheet_width';
const KEY_DOCK = 'ta_sheet_dock';

export function clampSheetWidth(w: number): number {
  if (Number.isNaN(w)) return SHEET_DEFAULT_WIDTH;
  return Math.min(SHEET_MAX, Math.max(SHEET_MIN, Math.round(w)));
}

export function loadSheetWidth(): number {
  try {
    const raw = localStorage.getItem(KEY_W);
    if (raw == null) return SHEET_DEFAULT_WIDTH;
    const n = Number(raw);
    return Number.isFinite(n) ? clampSheetWidth(n) : SHEET_DEFAULT_WIDTH;
  } catch { return SHEET_DEFAULT_WIDTH; }
}

export function saveSheetWidth(w: number): number {
  const c = clampSheetWidth(w);
  try { localStorage.setItem(KEY_W, String(c)); } catch { /* ignore */ }
  return c;
}

export function loadSheetDock(): DockSide {
  try {
    return localStorage.getItem(KEY_DOCK) === 'left' ? 'left' : 'right';
  } catch { return 'right'; }
}

export function saveSheetDock(d: DockSide): DockSide {
  try { localStorage.setItem(KEY_DOCK, d); } catch { /* ignore */ }
  return d;
}
```

- [ ] **Step 4: Run it — expect PASS** (3 tests).

- [ ] **Step 5: Write the failing uiStore test**

```ts
// packages/client/src/stores/uiStore.sheet.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';
import { SHEET_MAX } from '../components/journey/sheetPrefs';

beforeEach(() => { localStorage.clear(); });

describe('uiStore sheet prefs', () => {
  test('setSheetWidth clamps, updates state, and persists', () => {
    useUIStore.getState().setSheetWidth(500);
    expect(useUIStore.getState().sheetWidth).toBe(500);
    expect(localStorage.getItem('ta_sheet_width')).toBe('500');
    useUIStore.getState().setSheetWidth(99999);
    expect(useUIStore.getState().sheetWidth).toBe(SHEET_MAX);
  });
  test('toggleSheetDock flips and persists', () => {
    const start = useUIStore.getState().sheetDock; // 'right' default
    useUIStore.getState().toggleSheetDock();
    expect(useUIStore.getState().sheetDock).toBe(start === 'right' ? 'left' : 'right');
    expect(localStorage.getItem('ta_sheet_dock')).toBe(useUIStore.getState().sheetDock);
  });
});
```

- [ ] **Step 6: Run it — expect FAIL** (properties don't exist).

- [ ] **Step 7: Wire uiStore** — additive only. In `packages/client/src/stores/uiStore.ts`:

1. Import at top: `import { type DockSide, loadSheetWidth, saveSheetWidth, loadSheetDock, saveSheetDock } from '../components/journey/sheetPrefs';`
2. In the `UIState` interface, add: `sheetWidth: number; sheetDock: DockSide; setSheetWidth: (w: number) => void; toggleSheetDock: () => void;`
3. In the store body (near the other prefs), add initial values + actions:
```ts
  sheetWidth: loadSheetWidth(),
  sheetDock: loadSheetDock(),
  setSheetWidth: (w) => set({ sheetWidth: saveSheetWidth(w) }),
  toggleSheetDock: () => set((s) => {
    const next: DockSide = s.sheetDock === 'right' ? 'left' : 'right';
    saveSheetDock(next);
    return { sheetDock: next };
  }),
```
(No circular-import risk: `sheetPrefs.ts` imports nothing from stores.)

- [ ] **Step 8: Run tests + gate** — `npx vitest run src/components/journey/sheetPrefs.test.ts src/stores/uiStore.sheet.test.ts` (5 pass), then `npx tsc -b` clean.

- [ ] **Step 9: Commit**
```bash
git add packages/client/src/components/journey/sheetPrefs.ts packages/client/src/components/journey/sheetPrefs.test.ts packages/client/src/stores/uiStore.ts packages/client/src/stores/uiStore.sheet.test.ts
git commit -m "feat(journey): sheet width/dock prefs + uiStore wiring (THE-485)"
```

---

### Task 2: `Sheet` container — static shell (dock + width + chrome + dock toggle)

The container without resize yet: dock-aware positioning, width from the store, the border/bg chrome, and the dock-toggle control.

**Files:**
- Create: `packages/client/src/components/journey/Sheet.tsx`
- Test: `packages/client/src/components/journey/Sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/components/journey/Sheet.test.tsx
// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useUIStore } from '../../stores/uiStore';
import Sheet from './Sheet';

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ sheetWidth: 420, sheetDock: 'right' });
});

describe('Sheet container — shell', () => {
  test('renders children inside a panel at the store width', () => {
    render(<Sheet ariaLabel="Test sheet"><div data-testid="body">hi</div></Sheet>);
    expect(screen.getByTestId('body')).toBeInTheDocument();
    const region = screen.getByRole('complementary', { name: 'Test sheet' });
    expect(region).toHaveStyle({ width: '420px' });
  });

  test('dock toggle flips the docked side via the store', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    expect(useUIStore.getState().sheetDock).toBe('right');
    fireEvent.click(screen.getByRole('button', { name: /dock (left|right)/i }));
    expect(useUIStore.getState().sheetDock).toBe('left');
  });

  test('exposes a resize separator with correct ARIA', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('aria-valuenow', '420');
    expect(sep).toHaveAttribute('aria-valuemin', '300');
    expect(sep).toHaveAttribute('aria-valuemax', '640');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module not found).

- [ ] **Step 3: Implement the static shell** (resize handlers stubbed in Task 3)

```tsx
// packages/client/src/components/journey/Sheet.tsx
// The reusable Sheet container (CONTEXT.md / ADR-0005): a DOM overlay docked to
// the left or right of the persistent World, with a user-resizable width. Owns
// positioning + chrome + the single z-index; content renders inside without its
// own outer frame. Width/dock persist via uiStore (sheetPrefs).
import { useUIStore } from '../../stores/uiStore';
import { SHEET_MIN, SHEET_MAX } from './sheetPrefs';
import { PanelLeft, PanelRight } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  ariaLabel: string;
}

export default function Sheet({ children, ariaLabel }: Props) {
  const width = useUIStore((s) => s.sheetWidth);
  const dock = useUIStore((s) => s.sheetDock);
  const toggleSheetDock = useUIStore((s) => s.toggleSheetDock);
  const isRight = dock === 'right';

  // Handle sits on the INNER edge (between World and panel): left edge when
  // docked right, right edge when docked left. flex-row-reverse achieves that.
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 z-30 flex ${isRight ? 'right-0' : 'left-0 flex-row-reverse'}`}
    >
      {/* resize handle — behavior added in Task 3 */}
      <div data-sheet-handle className="pointer-events-auto" />

      <aside
        role="complementary"
        aria-label={ariaLabel}
        style={{ width: `${width}px` }}
        className={`pointer-events-auto relative flex h-full max-w-[40vw] min-w-[300px] flex-col bg-[var(--surface-raised)]/95 shadow-2xl backdrop-blur-md ${isRight ? 'border-l' : 'border-r'} border-[var(--border-default)]`}
      >
        <button
          type="button"
          onClick={toggleSheetDock}
          aria-label={isRight ? 'Dock left' : 'Dock right'}
          className="absolute top-2 z-10 rounded p-1 text-[var(--text-tertiary)] transition hover:text-white right-2"
        >
          {isRight ? <PanelLeft size={14} /> : <PanelRight size={14} />}
        </button>
        <div className="flex-1 overflow-auto">{children}</div>
      </aside>
    </div>
  );
}
```
**No motion by design (AC-6):** the Sheet has NO dock/resize transition — dock switches and resizes are instant. This is deliberate (Prinzip A: instant beats animated for a daily tool, and a width transition would lag the drag). `prefers-reduced-motion` is therefore trivially satisfied — there is nothing to reduce. Do not add a transition; AC-6's substance is keyboard-resize + separator ARIA (Task 3).

Note: the separator element (`role="separator"` with the aria-value attributes the test asserts) is added in Task 3 as the real resize handle — to make Task 2's third test pass now, render it here as a static separator and Task 3 attaches behavior. Add, inside the handle div:
```tsx
      <div
        data-sheet-handle
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={SHEET_MIN}
        aria-valuemax={SHEET_MAX}
        tabIndex={0}
        className="pointer-events-auto w-1.5 cursor-col-resize bg-transparent hover:bg-[var(--border-default)]/60 focus-visible:bg-[#00ff41]/50"
      />
```
(Replace the placeholder `<div data-sheet-handle .../>` above with this.)

- [ ] **Step 4: Run — expect PASS** (3 tests). `npx tsc -b` clean.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/components/journey/Sheet.tsx packages/client/src/components/journey/Sheet.test.tsx
git commit -m "feat(journey): Sheet container shell — dock-aware positioning + chrome + dock toggle (THE-485 AC-1/3)"
```

---

### Task 3: Resize handle — pointer-capture drag + keyboard (AC-2, AC-6)

**Files:**
- Modify: `packages/client/src/components/journey/Sheet.tsx`
- Modify: `packages/client/src/components/journey/Sheet.test.tsx`

- [ ] **Step 1: Add the failing behavior tests**

```tsx
// append to Sheet.test.tsx
describe('Sheet container — resize', () => {
  test('pointer drag on the handle changes width and does not bubble to the canvas', () => {
    const onBubble = vi.fn();
    render(
      <div onPointerMove={onBubble} onPointerDown={onBubble}>
        <Sheet ariaLabel="Test sheet"><div /></Sheet>
      </div>,
    );
    const sep = screen.getByRole('separator');
    // docked right: dragging LEFT (clientX decreases) widens
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 900 }); // -100 → +100 width
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 900 });
    expect(useUIStore.getState().sheetWidth).toBe(520);
    expect(onBubble).not.toHaveBeenCalled(); // stopPropagation kept it off the canvas
  });

  test('drag clamps to MAX', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 0 }); // +1000 → clamps
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 0 });
    expect(useUIStore.getState().sheetWidth).toBe(640);
  });

  test('when docked left, dragging RIGHT widens', () => {
    useUIStore.setState({ sheetDock: 'left', sheetWidth: 420 });
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 180 }); // +80
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 180 });
    expect(useUIStore.getState().sheetWidth).toBe(500);
  });

  test('keyboard: ArrowRight widens, ArrowLeft narrows (slider semantics)', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(useUIStore.getState().sheetWidth).toBe(444); // +24 step
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(useUIStore.getState().sheetWidth).toBe(420);
  });
});
```
(Add `vi` to the vitest import at the top of the file.)

- [ ] **Step 2: Run — expect FAIL** (handle is static).

- [ ] **Step 3: Implement resize** in `Sheet.tsx`. Add a drag ref + handlers; the widen direction depends on dock (`+deltaX` when docked left, `-deltaX` when docked right); persist through `setSheetWidth`. Guard `setPointerCapture` with optional chaining for jsdom.

```tsx
// add imports
import { useRef } from 'react';
// inside component, after the store selectors:
  const setSheetWidth = useUIStore((s) => s.setSheetWidth);
  const KEY_STEP = 24;
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startW: width };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    e.stopPropagation();
    const deltaX = e.clientX - drag.current.startX;
    const next = drag.current.startW + (isRight ? -deltaX : deltaX);
    setSheetWidth(next);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    e.stopPropagation();
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setSheetWidth(width + KEY_STEP); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setSheetWidth(width - KEY_STEP); }
  };
```
Wire them onto the separator div: `onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={onKeyDown}`. Keep the ARIA attributes from Task 2.

- [ ] **Step 4: Run — expect PASS** (all Sheet tests). `npx tsc -b` clean.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/components/journey/Sheet.tsx packages/client/src/components/journey/Sheet.test.tsx
git commit -m "feat(journey): Sheet resize handle — pointer-capture drag + keyboard, canvas-safe (THE-485 AC-2/6)"
```

---

## Chunk 2: Migration + verification (Tasks 4–6)

### Task 4: Migrate `StationSheet` to content-only + single-Sheet render in `JourneyShell`

**Files:**
- Modify: `packages/client/src/components/journey/StationSheet.tsx`
- Modify: `packages/client/src/components/journey/StationSheet.test.tsx`
- Modify: `packages/client/src/components/journey/JourneyShell.tsx`
- Modify: `packages/client/src/components/journey/JourneyShell.test.tsx`

- [ ] **Step 1: Update StationSheet test** — it must no longer assert outer positioning; it renders content only (heading, badge, link). Keep the existing assertions for heading `Govern`, badge `Phase G`, and the classic link href `/project/p1/compliance/policies` (those still hold). Remove any assertion about `absolute`/`right-0`/width if present (the Slice-1 test only checked heading/badge/link, so likely no change needed — verify).

- [ ] **Step 2: Strip StationSheet chrome** — `StationSheet.tsx` returns content only:
```tsx
export default function StationSheet({ station, projectId }: Props) {
  const def = STATIONS.find((s) => s.key === station)!;
  return (
    <div className="flex flex-col p-6">
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
      <Link to={def.classicRoute(projectId)} className="inline-flex items-center gap-2 self-start rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-2 text-sm font-medium text-[#a78bfa] transition hover:bg-[#7c3aed]/20">
        Open in classic UI <ArrowRight size={14} />
      </Link>
    </div>
  );
}
```
(Outer `absolute/right-0/z-20/pointer-events`/width/border/bg all removed — the Sheet owns them now.)

- [ ] **Step 3: Run StationSheet test — expect PASS.**

- [ ] **Step 4: Update JourneyShell** — replace the two mutually-exclusive sheet blocks (lines 90-98) with a single Sheet whose content is chosen by station:
```tsx
{/* Exactly one Sheet at a time (structural — replaces the Slice-1 station!==model hack). */}
{projectId && (() => {
  const sheetBody =
    station !== 'model'
      ? <StationSheet station={station} projectId={projectId} />
      : (isPropertyPanelOpen && selectedElementId ? <PropertyPanel fill /> : null);
  return sheetBody ? <Sheet ariaLabel="Station panel">{sheetBody}</Sheet> : null;
})()}
```
Add `import Sheet from './Sheet';`. Remove the now-unused inline PropertyPanel wrapper div. (PropertyPanel still imported; `fill` prop added in Task 5.)

**Also fix the left-dock header collision:** the HUD `<header>` (`absolute left-4 top-3 z-30`) shares the z-plane and top-left footprint of a left-docked Sheet, so docking left would cover its "Back to classic UI" link. Raise the header above the Sheet by changing its `z-30` → `z-40` (chrome sits above sheets). This is the only header change.

- [ ] **Step 5: Update JourneyShell test** — verify the existing tests still pass **unchanged**: they query by `data-testid`/`role`, not by the old wrapper markup, so no edits are expected. Concretely: the property-panel mock still resolves via `getByTestId('property-panel')` (now nested inside the `role="complementary"` Sheet); "no panel on govern" and "no panel on model without selection" still hold because `sheetBody` is null → no `<Sheet>` renders; the AC-1 no-remount test is unaffected (Scene is outside the Sheet). Run the suite; ONLY if a query actually broke, fix that exact query — do not rewrite otherwise.

- [ ] **Step 6: Run — expect PASS** (StationSheet + JourneyShell suites). `npx tsc -b` clean.

- [ ] **Step 7: Commit**
```bash
git add packages/client/src/components/journey/StationSheet.tsx packages/client/src/components/journey/StationSheet.test.tsx packages/client/src/components/journey/JourneyShell.tsx packages/client/src/components/journey/JourneyShell.test.tsx
git commit -m "refactor(journey): StationSheet content-only + single-Sheet render — collision now structural (THE-485 AC-5)"
```

---

### Task 5: PropertyPanel `fill` prop (additive, classic-safe)

`PropertyPanel` is shared with classic `ProjectView`; it must stay `w-72` there. Add an optional `fill` prop that switches its root width to `w-full` when it lives inside a Sheet.

**Files:**
- Modify: `packages/client/src/components/ui/PropertyPanel.tsx`
- Test: `packages/client/src/components/ui/PropertyPanel.fill.test.tsx`

- [ ] **Step 1: Write the failing regression+fill test**

```tsx
// packages/client/src/components/ui/PropertyPanel.fill.test.tsx
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useArchitectureStore } from '../../stores/architectureStore';
import PropertyPanel from './PropertyPanel';

// PropertyPanel does data fetching on mount — stub the API surface it touches so
// the empty-state root renders deterministically. Adjust mock to the real api.ts
// export names if they differ (read services/api.ts first).
vi.mock('../../services/api', () => ({}));

beforeEach(() => {
  useArchitectureStore.setState({ selectedElementId: null } as never);
});

describe('PropertyPanel fill prop', () => {
  test('classic (no prop) keeps fixed width w-72', () => {
    const { container } = render(<PropertyPanel />);
    expect(container.querySelector('aside')).toHaveClass('w-72');
  });
  test('fill renders w-full instead of w-72', () => {
    const { container } = render(<PropertyPanel fill />);
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveClass('w-full');
    expect(aside).not.toHaveClass('w-72');
  });
});
```
IMPORTANT: PropertyPanel is 2081 LOC and has 3 `<aside>` roots (empty-state ~L291, default ~L338, `PolicyPropertyView` ~L1614). First READ the component to see which root renders under the test's state and whether the mock needs more than `{}`. If it fetches on mount and throws without a fuller mock, stub only what's needed to reach an `<aside>`. Keep the test minimal but real.

- [ ] **Step 2: Run — expect FAIL** (no `fill` prop; `w-72` static).

- [ ] **Step 3: Add the prop** — additive, default off. In `PropertyPanel.tsx`:
1. Extend the props type (find its `interface`/inline props; if it currently takes none, add `{ fill = false }: { fill?: boolean }`).
2. Replace the literal `w-72` with `${fill ? 'w-full' : 'w-72'}` on **all three** `<aside>` roots that can render in v2 — the empty-state root (~L292), the default root (~L339), AND the `PolicyPropertyView` sub-component root (~L1624), which renders when a selected element is a policy graph-node (`metadata.isPolicyNode`) and is genuinely reachable in the v2 Model station. Thread `fill` into `PolicyPropertyView` (add `fill?: boolean` to its props and pass `fill={fill}` where `PropertyPanel` renders it). Do NOT change any other class. Classic callers pass nothing → `w-72` unchanged on all three.

   Add a second test case to Task 5's test that exercises the policy path: seed a selected policy element (set `selectedElementId` + an element with `metadata.isPolicyNode` in `architectureStore`) and assert the rendered `<aside>` is `w-full` under `<PropertyPanel fill />` and `w-72` without. If reaching that path needs more store/API stubbing than the empty-state test, keep it minimal but real; if it proves impractical to render in jsdom, instead assert via a focused render of `PolicyPropertyView` directly (it's an exported-in-file sibling — export it for the test if needed) and note that.

- [ ] **Step 4: Run — expect PASS** (both tests, incl. the classic-unchanged regression).

- [ ] **Step 5: Gate** — `npx vitest run` from `packages/client` (all green; known noise: 4 pre-existing `roadmapStore.test.ts` teardown errors). Then `npx tsc -b 2>&1 | grep "error TS"` and confirm **no NEW errors vs the baseline** — `PropertyPanel.tsx` must stay at its **10 pre-existing** `ViolationSeverity`-family errors (see the repo-wide 19-error baseline; do NOT try to fix those — out of scope). The `fill` prop must add ZERO new tsc errors. Do NOT rely on `npx tsc -b` exiting 0 — it cannot on this branch until the pre-existing severity-type debt is fixed separately.

- [ ] **Step 6: Commit**
```bash
git add packages/client/src/components/ui/PropertyPanel.tsx packages/client/src/components/ui/PropertyPanel.fill.test.tsx
git commit -m "feat(client): additive PropertyPanel fill prop — fluid width inside a Sheet, classic keeps w-72 (THE-485)"
```

---

### Task 6: End-to-end verification + closeout

No new code. Prove the ACs in a real browser, run the full gate, update the RVTM.

- [ ] **Step 1: Client gate** — from `packages/client/`: `npx vitest run` (all pass). Then `npx tsc -b 2>&1 | grep -c "error TS"` and confirm the count is **≤ 19** (the pre-existing baseline) and that no error line references a NEW file/symbol introduced by this slice (`Sheet.tsx`, `sheetPrefs.ts`, `StationSheet.tsx`, `JourneyShell.tsx`, or a NEW PropertyPanel error beyond its 10). The 19 pre-existing `ViolationSeverity`-family errors (PropertyPanel×10, Sidebar×6, governance×3) are OUT OF SCOPE — do not fix. (Repo has no eslint config — lint is a no-op.)

- [ ] **Step 2: Bundle build** — from `packages/client/`: `npx vite build`. Expect success (the app bundles; vite/esbuild ignores the pre-existing type-check errors). Do NOT run `npm run build` as a gate — its `tsc -b &&` prefix fails on the pre-existing 19 errors (a separate, pre-existing issue tracked outside this slice).

- [ ] **Step 3: Browser verification** (server on :4000, worktree client `npx vite --port 3001` in `packages/client`; log in — note the 15-minute token, re-login if you see 401s). With a real project `<PID>`:
  1. **Resize (AC-2):** `/v2/project/<PID>/govern` — drag the Sheet's inner-edge handle; the panel widens/narrows smoothly, clamps at ~300 and ~640px, and the 3D camera does NOT rotate during the drag (pointer-capture working). Reload → width persists.
  2. **Dock (AC-3/4):** click the dock-toggle; the Sheet jumps to the left edge, handle mirrors to its right edge, resize still works. Reload → dock side persists. **Left-dock header check:** the "Back to classic UI" link (top-left HUD) stays visible and clickable on top of the left-docked Sheet (header z-40 above sheet z-30) — no covered/blocked control.
  3. **Single Sheet (AC-5):** navigate govern→model (select an element) — exactly one Sheet at a time; on model the PropertyPanel fills the (resized) Sheet width, not a fixed 288px. Also select a **policy node** (if present) → the PolicyPropertyView fills the Sheet too (not 288px).
  4. **Classic untouched (AC-7):** `/project/<PID>` — PropertyPanel still docks at its fixed w-72, unaffected.
  5. **a11y (AC-6):** focus the handle (Tab), ArrowLeft/ArrowRight resize the panel. (No dock/resize animation exists by design, so there is no motion to check for `prefers-reduced-motion` — it is trivially satisfied.)
  Record each in the RVTM evidence column.

- [ ] **Step 4: Commit RVTM evidence + push**
```bash
git add docs/superpowers/plans/2026-07-16-sheet-container.md docs/superpowers/rvtm/2026-07-16-sheet-container-rvtm.md
git commit -m "docs(journey): sheet container plan + RVTM evidence (THE-485)"
git push -u origin mganzmanninfo/the-485-slice-15-reusable-sheet-container-resizable-dockable-lr
```
Then open the PR and move THE-485 → In Review (supervisor via Linear MCP).

---

## Execution notes for the supervisor

- **Worktree:** already created at `.claude/worktrees/the-485-sheet-container` off merged master (`f2f0cc8`, includes Slice 1). Branch `mganzmanninfo/the-485-slice-15-reusable-sheet-container-resizable-dockable-lr`.
- **Order:** Tasks 1→5 are dependency-ordered (prefs → shell → resize → migrate StationSheet → PropertyPanel fill). Task 6 is verification.
- **The one real risk** is AC-2 pointer-capture vs OrbitControls — the browser step explicitly checks the camera does not move during a resize drag. If it does, the `stopPropagation`/capture on the handle is incomplete.
- **Only shared file touched:** `PropertyPanel.tsx` (additive `fill` prop) and `uiStore.ts` (additive sheet prefs). No other classic component changes. `ComplianceOverlay`/`MissionControl`/`Sidebar`/`Toolbar` must have a 0-byte diff.
- **Server tests:** `packages/server` has pre-existing flaky suites — not this slice's concern (this slice is client-only).
