# RVTM: Command registry + curated per-station actions — THE-492 (Slice 3a)

**Spec:** Linear [THE-492](https://linear.app/thearchitect/issue/THE-492) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` (Kommando-Fläche) · Vocabulary: `CONTEXT.md`
**Plan:** `docs/superpowers/plans/2026-07-16-command-actions.md`
**Created:** 2026-07-16
**Worktree/branch:** `.claude/worktrees/the-492-command-actions` off `origin/master` 7311e7c, branch `mganzmanninfo/the-492-command-actions`
**Status:** plan approved (2 review rounds — 1 gate-breaker fixed: rail-test rework + architectureStore seed); ready to execute.

## Traceability Matrix

| ID | Requirement | Plan Task | Files | Verification | Status |
|----|-------------|-----------|-------|--------------|--------|
| R-001 | AC-1: typed `Command = {id, group, label, keywords?, run(ctx), available?(ctx)}` + `buildCommandRegistry(ctx)` assembler of safe (navigation-only) commands; shared foundation 3b's palette reuses (`Object.values`) | Task 1 | `commands.ts` | `commands.test.ts` (registry keyed, `run()` navigates, `resolveActionRoute` sentinel→classic) | PENDING |
| R-002 | AC-2: each of 6 stations surfaces **≤4** contextual actions, data-driven (fold `stations.ts` phase + `phases[].nextAction` primary + curated `STATION_SECONDARY`); deduped by resolved route; no hand-wired duplication | Task 2 | `stationActions.ts` | `stationActions.test.ts` (primary first, ≤4, dedup, done-phase→no primary) | PENDING |
| R-003 | AC-3: actions **execute** — click runs the command (navigate to classic tool / v2 sheet), replacing the nav-only CTA; classic-context → deep-link | Task 3, Task 4 | `StationActions.tsx`, `StationRail.tsx` | `StationActions.test.tsx` (click → `navigate('/project/p1')`) + rail wiring + browser | PENDING |
| R-004 | AC-4: `available?(ctx)` hides inapplicable commands; empty-world state respected | Task 1, Task 3, Task 2 | `commands.ts` (analyze phase≥4 gate), `StationActions.tsx` (empty-world → null) | `commands.test.ts` (analyze gate) + `StationActions.test.tsx` (empty world renders nothing) + `stationActions.test.ts` (filter) | PENDING |
| R-005 | AC-5: additive & classic-safe — new files only + one localized `StationRail` edit; no `uiStore` change; **no new global hotkey** (⌘K = 3b); no `palette`/`togglePalette` name collision | Tasks 1-4 | new files + `StationRail.tsx` | diff review (no uiStore/hotkey/cmdk) + `grep -rn "palette\|cmdk\|metaKey" src` on touched files | PENDING |
| NF-001 | No regression: full client test suite green (incl. rewritten rail suite) | Task 4, Task 5 | — | `npx vitest run` (4 pre-existing teardown errors = baseline, not +N) | PENDING |
| NF-002 | Bundle builds | Task 5 | — | `npx vite build` → ✓ | PENDING |
| C-001 | tsc: 0 new errors beyond the THE-486 baseline (19) | Task 5 | — | `npx tsc -b 2>&1 \| grep -c "error TS"` ≤ 19 | PENDING |
| C-002 | Scope: no ⌘K palette, no hotkey-registry refactor, no all-55-command wiring, no classic Sidebar/Toolbar deletion | all | — | diff review | PENDING |

## Coverage Summary

- **9 requirements**, 0 verified yet (pre-execution). Each AC maps to ≥1 TDD task with a co-located vitest; AC-3/AC-5 additionally browser/diff-verified.
- **Gate (per `reference_client_tsc_cold_fail`):** `npx vitest run` + `npx vite build` + tsc-count ≤ 19. **Never `npm run build`.**
- **Known by-design (not defects):** `vision`/`model` resolve to exactly 1 chip (single next action; rail handles nav). AC-4's active production path is the empty-world component gate; per-command `available?` is the typed hook (unit-tested, load-bearing in 3b).
- **Browser check (real browser; automation tab renders WebGL black but DOM works):** per station the ≤4 chips render, primary emphasised, click executes; empty-world project shows the "Generate with AI" CTA instead.

## Change Log

| Date | Change | IDs | Author |
|------|--------|-----|--------|
| 2026-07-16 | Initial RVTM from THE-492 ACs + approved plan (1 chunk, 5 tasks). Plan reviewed twice: fixed a gate-breaker (3 obsolete rail tests rewritten + `architectureStore` seeded) + 3 hygiene notes (getNextAction wording, drop dead `hasElements`, 1-chip/AC-4 note). | R-001..R-005, NF/C | Plan phase |
