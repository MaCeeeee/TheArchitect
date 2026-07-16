# RVTM: ⌘K Command Menu (jump to any tool) — THE-493 (Slice 3b)

**Spec:** Linear [THE-493](https://linear.app/thearchitect/issue/THE-493) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` (Kommando-Fläche) · Vocabulary: `CONTEXT.md` · Builds on THE-492
**Plan:** `docs/superpowers/plans/2026-07-16-command-menu.md`
**Created:** 2026-07-16
**Worktree/branch:** `.claude/worktrees/the-493-command-menu` off `origin/master` 3dcb060, branch `mganzmanninfo/the-493-command-menu`
**Status:** plan approved (2 review rounds — fixed 3 dead-route commands [/portfolio, monte-carlo, compliance-dashboard vocab mismatches] + a real focus-trap hole [Tab/Shift+Tab/mousedown would let arrows reach the camera]); ready to execute.

## Traceability Matrix

| ID | Requirement | Plan Task | Files | Verification | Status |
|----|-------------|-----------|-------|--------------|--------|
| R-001 | AC-1: ⌘K/Ctrl+K opens the overlay in `JourneyShell` (v2-only); Esc + click-outside close; focus trapped (single focus stop: the input; Tab swallowed, mousedown can't steal focus); transient `isCommandMenuOpen` flag | Task 2, Task 3, Task 4 | `uiStore.ts`, `CommandMenu.tsx`, `JourneyShell.tsx` | `JourneyShell.test.tsx` (⌘K opens; not while typing in a field) + `CommandMenu.test.tsx` (Escape closes; Tab swallowed + focus stays) + browser | PENDING |
| R-002 | AC-2: grouped list of registry commands; search over label+keywords+group (multi-term substring); ↑/↓ selection (aria-activedescendant), Enter runs, Esc closes; empty query = all, grouped | Task 2, Task 3 | `commandFilter.ts`, `CommandMenu.tsx` | `commandFilter.test.ts` (4 cases) + `CommandMenu.test.tsx` (filter, ArrowDown moves active, Enter runs top match + closes) | PENDING |
| R-003 | AC-3: curated registry grows to **30** safe route-navigable commands (10 comply, 8 analyze, 2 model, 3 workspace, 6 stations, +analyze-main) with `keywords`; `available?` gates via `phaseVisibility.getVisibleSections` (no parallel gate); 2 bespoke entries where page-section id ≠ gate id (monte-carlo, compliance-dashboard); NO classic-only toggles | Task 1 | `commands.ts` | `commands.test.ts` (≥25, keywords on all, comply gated ph1 vs ph5, analyze gated ph3 vs ph4, blueprint route) | PENDING |
| R-004 | AC-4: while the menu is open its keys never drive `ViewModeCamera` — focus-stays-in-input design (INPUT early-return) + Tab/mousedown guards + stopPropagation; closing restores normal shortcuts | Task 3 | `CommandMenu.tsx` | design-by-construction (INPUT guard ViewModeCamera.tsx:380) + Tab-swallow test + **browser coexistence check** (menu open: arrows don't move camera/plateau; after close: f/arrows work) | PENDING |
| R-005 | AC-5: additive & classic-safe — classic UI byte-identical; no `palette` collision (`commandMenu` naming); **StationActions (3a) unaffected** (frozen ids; new gates on matrix/approvals/audit proven in-phase: matrix∈COMPLY[3], approvals∈[5], audit∈[6]); no hotkey-registry refactor | all | — | diff review + Task 1 Step 4 re-runs 3a suites (`stationCommands.test.ts`, `StationActions.test.tsx`) | PENDING |
| NF-001 | Full client test suite green | Task 5 | — | `npx vitest run` (4 pre-existing teardown errors = baseline, not +N) | PENDING |
| NF-002 | Bundle builds; **no new npm dependency** (no cmdk/kbar) | Task 5 | — | `npx vite build` ✓ + package.json diff empty | PENDING |
| C-001 | tsc: 0 new errors beyond the THE-486 baseline (19) | Task 5 | — | `npx tsc -b 2>&1 \| grep -c "error TS"` ≤ 19 | PENDING |
| C-002 | Scope: no full ~55-command wiring, no classic-only toggle/modal commands, no classic-UI palette, no recents/frecency/fuzzy-ranking | all | — | diff review | PENDING |

## Coverage Summary

- **9 requirements**, 0 verified yet (pre-execution). Every AC maps to ≥1 fail-first vitest; AC-4 additionally verified by construction (INPUT guard) + a mandatory browser coexistence check; AC-5 by diff review + 3a-suite re-run.
- **Gate (per `reference_client_tsc_cold_fail`):** `npx vitest run` + `npx vite build` + tsc-count ≤ 19. **Never `npm run build`.**
- **Plan-review catches (why these matter):** 3 commands would have navigated to dead/blank routes (`/portfolio` doesn't exist top-level; `monte` and `dashboard` are phaseVisibility vocab, the pages render `monte-carlo`/`compliance-dashboard`); and useFocusTrap's Tab-wrap would have focused an option BUTTON (uncovered by ViewModeCamera's INPUT guard) — arrows would have driven the camera with the menu open. All fixed in the plan pre-execution.

## Change Log

| Date | Change | IDs | Author |
|------|--------|-----|--------|
| 2026-07-16 | Initial RVTM from THE-493 ACs + approved plan (1 chunk, 5 tasks). Plan reviewed twice: fixed 3 dead-route commands + focus-trap hole (Tab/mousedown guards + test), async mock factory, useCallback onEscape, activeIndex reset, count re-verified (30 ≥ 25). | R-001..R-005, NF/C | Plan phase |
