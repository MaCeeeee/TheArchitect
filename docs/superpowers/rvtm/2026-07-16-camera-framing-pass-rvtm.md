# RVTM: Camera framing pass — THE-488

**Spec:** Linear [THE-488](https://linear.app/thearchitect/issue/THE-488) (child of Epic THE-481) — Slice-1 follow-up (defect/polish on THE-482's `flyToStation`). Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md`. Vocabulary: `CONTEXT.md`.
**Created:** 2026-07-16
**Worktree/branch:** `.claude/worktrees/the-488-camera-framing` off `origin/master` 8b4482d, branch `mganzmanninfo/the-488-camera-framing`
**Trigger:** browser-observed on Track — the model rendered as a tiny speck in a mostly-empty viewport (user: "warum ist es standardmäßig so klein angezeigt?").

## Traceability Matrix

| ID | Requirement | Files | Verification | Status | Evidence |
|----|-------------|-------|--------------|--------|----------|
| R-001 | AC-1: all 6 stations frame the model at a readable size — `distFactor` band tightened to 1.5–1.9, angles (`dir`) unchanged | `ViewModeCamera.tsx` | `flyToStation.test.ts` (per-station framings differ) + user visual | AUTOMATED PASS · user-visual PENDING | vision 2.2→1.9, explore 1.7→1.6, plan/govern 1.8→1.7, track 2.4→1.8; model 1.5 kept |
| R-002 | AC-2: Sheet-offset — when a Sheet is docked, `flyToStation` pans camera+target along the view-right vector so the model centres in the *visible* area (viewport minus Sheet), dock-aware | `ViewModeCamera.tsx`, `JourneyShell.tsx` | `flyToStation.test.ts` (dock-aware mirror offset: opposite signs, equal magnitude, midpoint = centroid) | AUTOMATED PASS | on-screen shift = `sheetPx/2`, distance-independent (worldShift/worldPerPixel cancel) → never off-screen |
| R-003 | AC-3: no reframe on Sheet **resize** — offset captured at station arrival (deps `[station, loading]`, sheet read via `getState`) | `JourneyShell.tsx` | `JourneyShell.test.tsx` (call-count unchanged across resize) + code review | AUTOMATED PASS | mirrors THE-485 AC-2 (camera still on resize) |
| R-004 | AC-4: back-compat — new `{ sheetOffsetPx, sheetDock }` param optional; no opts ⇒ prior behaviour (lookAt = centroid). Classic UI untouched | `ViewModeCamera.tsx` | `flyToStation.test.ts` (default keeps lookAt on centroid) | AUTOMATED PASS | `opts = {}` default; existing 3 call-shape assertions updated for the arg |
| NF-001 | Full client suite green | — | `npx vitest run` | PASS | 272 pass / 272 (was 270 + 2 new); 4 unhandled teardown errors **pre-exist** on clean origin/master |
| NF-002 | Bundle builds | — | `npx vite build` | PASS | ✓ built |
| C-001 | tsc: 0 new errors beyond the THE-486 baseline (19) | — | `npx tsc -b \| grep -c` | PASS | 19 (unchanged) |

## Coverage Summary

- **Automated (unit + build):** ALL PASS — 272 tests, `vite build` ✓, tsc 19 (0 new). +2 flyToStation tests (dock-aware mirror offset; back-compat centroid). The 4 unhandled `EnvironmentTeardownError`s (activityViewStore/architectureStore async import after teardown) were confirmed pre-existing by re-running the stashed clean base (270 + 4).
- **3D visual — deferred to the user's own browser:** the claude-in-chrome automation tab renders WebGL **black** (no GPU — same limitation the THE-487 RVTM hit for the heatmap), so the model's on-screen size/centering cannot be self-verified here. React/routing/auth/Sheet all confirmed loading on `/v2/.../track`. The offset magnitude is provably safe (shift = half the Sheet width, always within the viewport).
- **User to visually confirm:** on each station the model fills a readable share (no speck), and on stations with a docked Sheet the model sits centred in the area beside the Sheet (not behind it). Starting `distFactor` values are a proposal — easy to tune.

## Change Log

| Date | Change | IDs | Author |
|------|--------|-----|--------|
| 2026-07-16 | Implemented in one pass (single file core + one JourneyShell call-site) + 2 tests; automated gate green; committed b0b1370. 3D visual deferred to user (WebGL black in automation browser). | R-001..R-004, NF-001..NF-002, C-001 | Execution |
