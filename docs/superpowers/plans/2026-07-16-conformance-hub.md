# Conformance Hub in the World — Implementation Plan — THE-487

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Conformance into the v2 Journey world (ADR-0005 "compose" model): on the Explore / Govern / Track stations, replace the placeholder `StationSheet` with the existing `ConformanceHub` rendered inside a `Sheet`, pre-scoped to that station's gate, and surface the existing 3D coverage heatmap (`ComplianceGlow`) as the "results in the World". Deliberately thin — gate cards still deep-link to the classic compliance routes for now.

**Architecture:** No new UI is built. Each ADM station gains an optional `conformanceGate` (`Cover`/`Enforce`/`Attest`) in `stations.ts`; `ConformanceHub` gains an additive `scopeVerb` prop that emphasises one gate and shows a "opens in the classic UI" affordance; `JourneyShell` renders `<ConformanceHub scopeVerb={gate}/>` for stations that have a gate (else the existing placeholder), and enables `ComplianceGlow` while on a conformance station. Classic UI is byte-identical (all changes are additive; the shared `ConformanceHub`/`complianceStore` keep their defaults).

**Tech Stack:** React 18 + TS strict, Zustand, R3F, Tailwind v4, Vitest 4 + RTL (jsdom pragma per file).

**Linear:** [THE-487](https://linear.app/thearchitect/issue/THE-487) (child of Epic THE-481) · **Decisions:** `docs/adr/0005-spatial-journey-ui-restructure.md` (#4 compose) + `docs/adr/0003-conformance-information-architecture.md` · **Vocabulary:** `CONTEXT.md` (Conformance Hub, Subject, Norm)

**RVTM:** `docs/superpowers/rvtm/2026-07-16-conformance-hub-rvtm.md`

---

## Context the implementing engineer needs (read first)

**The model** (ADR-0003 / ADR-0005 #4): "Conformance" asks *does a Subject satisfy a Norm, and where are the gaps?* across three gates — **Cover** (model vs external standards), **Enforce** (model vs internal policies), **Attest** (imported workflow vs statutory records). These map onto three ADM stations: **Explore→Cover, Govern→Enforce, Track→Attest**. There is deliberately **no "Comply" station** and "Comply" must not appear as UI copy (`CONTEXT.md:63`).

**What already exists (verified on this branch, off merged master `8b4482d`):**

- `packages/client/src/components/compliance/ConformanceHub.tsx` (110 LOC) — a pure router, already Sheet-shaped (no viewport wrapper). Exports `GATE_CARDS: GateCard[]` (Cover→target `standards`, Enforce→target `compliance-dashboard`, Attest→target `assess`). The component takes **no props**, reads `projectId` from `useParams`, and each card's `onClick` does `navigate(\`/project/${projectId}/compliance/${card.target}\`)` (classic route). Renders `data-testid="conformance-hub"` and per-card `data-testid="gate-card-{cover|enforce|attest}"`.
- `packages/client/src/components/journey/JourneyShell.tsx` (114 LOC) — the v2 shell. Its `sheetBody` (lines 63-67) is:
  ```tsx
  const sheetBody = !projectId
    ? null
    : station !== 'model'
      ? <StationSheet station={station} projectId={projectId} />
      : (isPropertyPanelOpen && selectedElementId ? <PropertyPanel fill /> : null);
  ```
  rendered as `{projectId && sheetBody ? <Sheet ariaLabel="Station panel">{sheetBody}</Sheet> : null}`.
- `packages/client/src/components/journey/stations.ts` — `StationDef` (key/label/admBadge/phase/classicRoute) + `STATIONS` (vision/model/explore/plan/govern/track).
- `packages/client/src/components/3d/ComplianceGlow.tsx` (136 LOC) — colours elements by coverage; renders only when `complianceStore.showComplianceGlow` is true (toggled in classic via `Toolbar`'s `ComplianceGlowToggle`; there is **no toggle UI in v2**). Mounted in `Scene.tsx` (already runs under the v2 World). It reads `complianceStore.mappingsByElement`.
- `packages/client/src/components/journey/Sheet.tsx` (THE-485) — the dockable/resizable container: `<Sheet ariaLabel>{children}</Sheet>`.

**AC-7 discipline:** `ConformanceHub` and `complianceStore` are shared with the classic UI. Every change to them must default to today's behavior. Do NOT touch `CompliancePage.tsx`, `ComplianceOverlay.tsx`, `Toolbar.tsx`, `ProjectView.tsx`.

**Test conventions:** Vitest 4, `vite.config.ts` `environment:'node'`; component tests use a first-line `// @vitest-environment jsdom` pragma + RTL + `@testing-library/jest-dom/vitest` + `MemoryRouter`. Reference: `src/components/journey/JourneyShell.test.tsx`. Run from `packages/client/`.

**Build gate (important — pre-existing debt, THE-486):** do NOT use `npm run build`/`tsc -b` exit-0 as a gate. This repo has **19 pre-existing `ViolationSeverity` tsc errors** that fail a cold `tsc -b`. Gate = `npx vitest run` green + `npx vite build` green + `npx tsc -b 2>&1 | grep -c "error TS"` stays **≤ 19** with none in the files this slice touches. (`ConformanceHub.tsx` currently has 0 tsc errors; keep it 0.)

**Out of scope (later slices, do NOT build):** Matrix-as-Sheet; findings→fly-to wiring; the 18-section `CompliancePage` migration; deleting `ComplianceOverlay`. The gate cards leaving v2 for classic is the deliberate first-cut handoff.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `components/journey/stations.ts` | add `conformanceGate?` to StationDef + map explore/govern/track | modify (additive) |
| `components/compliance/ConformanceHub.tsx` | additive `scopeVerb` prop: emphasise one gate + "opens in classic UI" affordance | modify (additive, classic-safe) |
| `stores/complianceStore.ts` | additive `setShowComplianceGlow(boolean)` setter | modify (additive) |
| `components/journey/JourneyShell.tsx` | render Hub for gated stations; enable glow on conformance stations | modify |

---

## Chunk 1: Gate mapping + Hub scoping (Tasks 1–2)

### Task 1: Station → conformance gate mapping

**Files:**
- Modify: `packages/client/src/components/journey/stations.ts`
- Test: `packages/client/src/components/journey/stations.conformance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/components/journey/stations.conformance.test.ts
import { describe, test, expect } from 'vitest';
import { STATIONS } from './stations';

describe('station conformance gate mapping (THE-487)', () => {
  const gateOf = (k: string) => STATIONS.find((s) => s.key === k)!.conformanceGate;
  test('explore/govern/track carry their gate; others have none', () => {
    expect(gateOf('explore')).toBe('Cover');
    expect(gateOf('govern')).toBe('Enforce');
    expect(gateOf('track')).toBe('Attest');
    expect(gateOf('vision')).toBeUndefined();
    expect(gateOf('model')).toBeUndefined();
    expect(gateOf('plan')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run src/components/journey/stations.conformance.test.ts`; `conformanceGate` doesn't exist).

- [ ] **Step 3: Add the field** in `stations.ts`:
1. In the `StationDef` interface add: `conformanceGate?: 'Cover' | 'Enforce' | 'Attest';` (string-literal union — do NOT import a type from the compliance domain; keep journey→compliance decoupled).
2. In the `STATIONS` array add `conformanceGate` to exactly three entries: `explore` → `'Cover'`, `govern` → `'Enforce'`, `track` → `'Attest'`. Leave `vision`/`model`/`plan` without the field. Add a one-line comment: `// Conformance gates map onto ADM stations (ADR-0005 #4): Explore=Cover, Govern=Enforce, Track=Attest.`

- [ ] **Step 4: Run it — expect PASS.** `npx tsc -b 2>&1 | grep -c "error TS"` still ≤ 19, none in stations.ts.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/components/journey/stations.ts packages/client/src/components/journey/stations.conformance.test.ts
git commit -m "feat(journey): map Explore/Govern/Track to conformance gates (THE-487)"
```

---

### Task 2: `ConformanceHub` `scopeVerb` prop (emphasis + classic-UI affordance)

Additive prop. When `scopeVerb` is set (v2 context), the matching gate card is visually primary and a small "opens in the classic UI" line appears. Default (no prop, classic) is byte-identical.

**Files:**
- Modify: `packages/client/src/components/compliance/ConformanceHub.tsx`
- Test: `packages/client/src/components/compliance/ConformanceHub.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/components/compliance/ConformanceHub.test.tsx
// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ConformanceHub from './ConformanceHub';

const renderHub = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/project/p1/compliance/hub']}>
      <Routes>
        <Route path="/project/:projectId/compliance/:section" element={<ConformanceHub {...props} />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ConformanceHub scopeVerb (THE-487)', () => {
  test('classic (no prop): renders all 3 gate cards, no in-world affordance', () => {
    renderHub();
    expect(screen.getByTestId('gate-card-cover')).toBeInTheDocument();
    expect(screen.getByTestId('gate-card-enforce')).toBeInTheDocument();
    expect(screen.getByTestId('gate-card-attest')).toBeInTheDocument();
    expect(screen.queryByText(/opens in the classic ui/i)).not.toBeInTheDocument();
  });

  test('scoped: the scoped gate is marked current, and the classic-UI affordance shows', () => {
    renderHub({ scopeVerb: 'Enforce' });
    expect(screen.getByTestId('gate-card-enforce')).toHaveAttribute('data-scoped', 'true');
    expect(screen.getByTestId('gate-card-cover')).toHaveAttribute('data-scoped', 'false');
    expect(screen.getByText(/opens in the classic ui/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Add the prop.** In `ConformanceHub.tsx`:
1. Export the verb type for reuse: `export type GateVerb = GateCard['verb'];`
2. Change the signature to `export default function ConformanceHub({ scopeVerb }: { scopeVerb?: GateVerb } = {}) {`.
3. On each card button, add `data-scoped={scopeVerb === card.verb}` and, when it is the scoped card, an emphasis class + a small "For this station" tag. Concretely, compute `const isScoped = scopeVerb === card.verb;` in the map and:
   - add to the button className (append, don't replace): `${isScoped ? 'border-[#7c3aed] ring-1 ring-[#7c3aed]/40' : ''}`
   - render, right after the verb badge span, `{isScoped && <span className="rounded bg-[#7c3aed]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#a78bfa]">For this station</span>}`
4. When `scopeVerb` is set, render a small footer affordance below the existing explanatory paragraph:
   ```tsx
   {scopeVerb && (
     <p className="text-[10px] text-[var(--text-tertiary)]">Each card opens the full view in the classic UI.</p>
   )}
   ```
   (Text must contain "opens in the classic UI" — reword the sentence to include it exactly, e.g. "Each card opens in the classic UI." to match the test's `/opens in the classic ui/i`.)
Do NOT change the `navigate(...)` targets, the `GATE_CARDS` data, or anything when `scopeVerb` is undefined — classic stays identical.

- [ ] **Step 4: Run it — expect PASS** (2 tests). `npx tsc -b` ConformanceHub.tsx errors still 0; total ≤ 19.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/components/compliance/ConformanceHub.tsx packages/client/src/components/compliance/ConformanceHub.test.tsx
git commit -m "feat(compliance): additive scopeVerb prop on ConformanceHub — gate emphasis + classic-UI affordance (THE-487)"
```

---

## Chunk 2: Shell wiring + results + verification (Tasks 3–5)

### Task 3: `complianceStore.setShowComplianceGlow` (additive)

**Files:**
- Modify: `packages/client/src/stores/complianceStore.ts`
- Test: `packages/client/src/stores/complianceStore.glow.test.ts`

- [ ] **Step 1: Read** `complianceStore.ts` to find `showComplianceGlow` state + `toggleComplianceGlow`. Confirm the field name and default.

- [ ] **Step 2: Failing test**
```ts
// packages/client/src/stores/complianceStore.glow.test.ts
import { describe, test, expect } from 'vitest';
import { useComplianceStore } from './complianceStore';

describe('setShowComplianceGlow (THE-487)', () => {
  test('sets the flag idempotently', () => {
    useComplianceStore.getState().setShowComplianceGlow(true);
    expect(useComplianceStore.getState().showComplianceGlow).toBe(true);
    useComplianceStore.getState().setShowComplianceGlow(false);
    expect(useComplianceStore.getState().showComplianceGlow).toBe(false);
  });
});
```
Run → FAIL.

- [ ] **Step 3: Add the setter** — in the `UIState`/store interface add `setShowComplianceGlow: (v: boolean) => void;` and in the store body add `setShowComplianceGlow: (v) => set({ showComplianceGlow: v }),` next to `toggleComplianceGlow`. Purely additive; do not touch `toggleComplianceGlow` or the default.

- [ ] **Step 4: Run → PASS.** tsc ≤ 19.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/stores/complianceStore.ts packages/client/src/stores/complianceStore.glow.test.ts
git commit -m "feat(store): additive setShowComplianceGlow setter (THE-487)"
```

---

### Task 4: `JourneyShell` — render the Hub for gated stations + enable the World heatmap

**Files:**
- Modify: `packages/client/src/components/journey/JourneyShell.tsx`
- Modify: `packages/client/src/components/journey/JourneyShell.test.tsx`

- [ ] **Step 1: Add failing tests** to `JourneyShell.test.tsx`. The file already mocks `Scene`, `ViewModeCamera`, `useProjectData`, `PropertyPanel` and seeds stores in `beforeEach`. Mock `ConformanceHub` so the test asserts JourneyShell's routing, not the Hub's internals:
```tsx
vi.mock('../compliance/ConformanceHub', () => ({
  default: ({ scopeVerb }: { scopeVerb?: string }) =>
    <div data-testid="conformance-hub" data-scope={scopeVerb ?? ''} />,
}));
```
(Place this with the other `vi.mock` calls at the top.) Then:
```tsx
describe('JourneyShell conformance stations (THE-487)', () => {
  test('govern station renders the ConformanceHub pre-scoped to Enforce', () => {
    renderShell('/v2/project/p1/govern');
    const hub = screen.getByTestId('conformance-hub');
    expect(hub).toBeInTheDocument();
    expect(hub).toHaveAttribute('data-scope', 'Enforce');
  });
  test('vision station still shows the StationSheet placeholder, not the hub', () => {
    renderShell('/v2/project/p1/vision');
    expect(screen.queryByTestId('conformance-hub')).not.toBeInTheDocument();
  });
  test('entering a conformance station enables the coverage heatmap', () => {
    // spy on complianceStore.setShowComplianceGlow
    const spy = vi.spyOn(useComplianceStore.getState(), 'setShowComplianceGlow');
    renderShell('/v2/project/p1/explore');
    expect(spy).toHaveBeenCalledWith(true);
  });
});
```
Import `useComplianceStore` at the top of the test file. If `StationSheet` is not mocked in this file, the vision test still holds because it only queries the hub testid. Confirm the existing `renderShell` signature and that `beforeEach` seeds `useComplianceStore` with a real (or stubbed) `setShowComplianceGlow` — if not, add `useComplianceStore.setState({ setShowComplianceGlow: vi.fn(), showComplianceGlow: false } as never)` to `beforeEach` and spy via the store getState. Adapt precisely to the file.

**MUST FIX an existing test that this change breaks:** the pre-existing test `'placeholder Sheet shows for non-migrated stations, not for model'` renders `/v2/project/p1/govern` and asserts a `getByRole('link', { name: /open in classic ui/i })` (the StationSheet CTA). After this task, `govern` renders `ConformanceHub`, not `StationSheet`, so that assertion fails. Update that existing test to use a station that stays ungated — change its route to `/v2/project/p1/vision` (vision has no `conformanceGate`, so it still renders the `StationSheet` placeholder with the classic-UI link). Do not delete the test; just repoint the station so it still proves the placeholder path for ungated stations.

Run → the new tests FAIL (and, before the fix above, the repointed existing test should pass again).

- [ ] **Step 2: Wire JourneyShell.** Changes:
1. Imports: `import ConformanceHub from '../compliance/ConformanceHub';`, `import { useComplianceStore } from '../../stores/complianceStore';`, and add `STATIONS` to the existing `./stations` import.
2. Add a selector: `const setShowComplianceGlow = useComplianceStore((s) => s.setShowComplianceGlow);`
3. Compute the gate for the current station (near where `station` is derived): `const conformanceGate = STATIONS.find((s) => s.key === station)?.conformanceGate;`
4. Add an effect (with the other effects, above the early returns) to surface results in the World while on a conformance station — and **restore the prior value on leave** so classic stays byte-identical (AC-7):
   ```tsx
   // Conformance stations show the coverage heatmap as "results in the World".
   // showComplianceGlow is a shared global toggle, so save its prior value and
   // restore it when leaving (station change or unmount) — classic UI must not
   // silently inherit the heatmap (AC-7).
   useEffect(() => {
     if (!conformanceGate) return;
     const prev = useComplianceStore.getState().showComplianceGlow;
     setShowComplianceGlow(true);
     return () => setShowComplianceGlow(prev);
   }, [conformanceGate, setShowComplianceGlow]);
   ```
   (This reads `useComplianceStore.getState()` inside the effect — that's intentional; do not add `showComplianceGlow` to the deps or the effect would re-run when the glow itself changes.)
5. Change `sheetBody` so gated stations render the Hub instead of the placeholder:
   ```tsx
   const sheetBody = !projectId
     ? null
     : station === 'model'
       ? (isPropertyPanelOpen && selectedElementId ? <PropertyPanel fill /> : null)
       : conformanceGate
         ? <ConformanceHub scopeVerb={conformanceGate} />
         : <StationSheet station={station} projectId={projectId} />;
   ```
   (So: model → PropertyPanel; explore/govern/track → Hub; vision/plan → StationSheet placeholder. One Sheet at a time is preserved.)
   Keep all hooks unconditional above the early returns.

- [ ] **Step 3: Run** `npx vitest run src/components/journey/JourneyShell.test.tsx` → all pass (existing + 3 new). Verify the existing model/placeholder tests still hold.

- [ ] **Step 4: Full gate.** `npx vitest run` (all green; known noise: 4 roadmapStore teardown errors). `npx tsc -b 2>&1 | grep -c "error TS"` ≤ 19, none in JourneyShell.tsx. `npx vite build` succeeds.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/components/journey/JourneyShell.tsx packages/client/src/components/journey/JourneyShell.test.tsx
git commit -m "feat(journey): Conformance Hub on Explore/Govern/Track + coverage heatmap in the World (THE-487 AC-1/2)"
```

---

### Task 5: End-to-end verification + closeout

- [ ] **Step 1: Client gate** — from `packages/client/`: `npx vitest run` (all pass) + `npx tsc -b 2>&1 | grep -c "error TS"` (≤ 19, none in the 4 touched files) + `npx vite build` (succeeds).

- [ ] **Step 2: Browser verification** (server :4000, worktree client `npx vite --port 3001` in `packages/client` — ensure it runs from THIS worktree; log in). With a project that has compliance mappings:
  1. **AC-1:** `/v2/project/<PID>/govern` → the Sheet shows the Conformance Hub with the **Enforce** card marked "For this station"; `/explore` → Cover scoped; `/track` → Attest scoped. `/vision` and `/plan` still show the plain placeholder.
  2. **AC-2:** on those stations the 3D **coverage heatmap** (ComplianceGlow) is visible on elements (green/yellow/orange/red). `ComplianceGlow` self-loads its mappings (own `useEffect` when `projectId` set and `mappingsByElement` empty), so no extra load wiring is needed — but confirm the project actually HAS mappings; on a project with none, the heatmap correctly shows nothing. Also confirm that leaving a conformance station (→ model, or → classic) restores the prior glow state (AC-7 restore-on-leave).
  3. **AC-3:** clicking a gate card navigates to the classic `/project/<PID>/compliance/...` view (deliberate handoff), with the "opens in the classic UI" line visible in the Hub.
  4. **AC-4:** classic `/project/<PID>` unaffected; `/v2/.../model` still shows the PropertyPanel-on-selection behavior.
  Record results in the RVTM.

- [ ] **Step 3: RVTM + push**
```bash
git add docs/superpowers/plans/2026-07-16-conformance-hub.md docs/superpowers/rvtm/2026-07-16-conformance-hub-rvtm.md
git commit -m "docs(journey): Conformance Hub plan + RVTM (THE-487)"
git push -u origin mganzmanninfo/the-487-slice-2-conformance-hub-in-the-world
```
Then open the PR; move THE-487 → In Review (supervisor via Linear MCP).

---

## Execution notes for the supervisor

- **Worktree:** `.claude/worktrees/the-487-conformance-hub` off merged master `8b4482d` (Slice 1 + Sheet container present). Branch `mganzmanninfo/the-487-slice-2-conformance-hub-in-the-world`.
- **Order:** Tasks 1→4 dependency-ordered (gate mapping → Hub prop → store setter → shell wiring). Task 5 verification.
- **AC-7:** only additive changes to shared files (`ConformanceHub` prop defaults off; `complianceStore` new setter). `CompliancePage`/`ComplianceOverlay`/`Toolbar`/`ProjectView` must have a 0-byte diff.
- **The one real UX seam** is AC-2: whether the heatmap actually shows (mappings loaded). The browser step explicitly checks it; if `ComplianceGlow` doesn't self-load mappings, add a single `loadAllMappings(projectId)` in the Task-4 effect.
- **Build gate is `vite build` + no-new-tsc-errors**, never `npm run build` (19 pre-existing errors, THE-486).
- **Non-blocking follow-up (do NOT fix here):** after this slice, `stations.ts`'s `classicRoute` for explore/govern/track is dead code for those keys (they now render the Hub, not StationSheet) and its `govern` target (`/compliance/policies`) differs from the Enforce gate's actual target (`compliance-dashboard`). Leave a code comment noting it's vestigial; a later slice removes it.
