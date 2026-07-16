# RVTM: Command registry + curated per-station actions — THE-492 (Slice 3a)

**Spec:** Linear [THE-492](https://linear.app/thearchitect/issue/THE-492) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` (Kommando-Fläche) · Vocabulary: `CONTEXT.md`
**Plan:** `docs/superpowers/plans/2026-07-16-command-actions.md`
**Created:** 2026-07-16
**Worktree/branch:** `.claude/worktrees/the-492-command-actions` off `origin/master` 7311e7c, branch `mganzmanninfo/the-492-command-actions`
**Status:** DONE — implemented subagent-driven (TDD, 5 commits `0917137..0b69e71`), final whole-branch review (spec ✅ + quality; 1 rework applied: case-only filename collision → renamed data module to `stationCommands.ts`), gate green, browser-verified.

## Traceability Matrix

| ID | Requirement | Plan Task | Files | Verification | Status |
|----|-------------|-----------|-------|--------------|--------|
| R-001 | AC-1: typed `Command = {id, group, label, keywords?, run(ctx), available?(ctx)}` + `buildCommandRegistry(ctx)` assembler of safe (navigation-only) commands; shared foundation 3b's palette reuses (`Object.values`) | Task 1 | `commands.ts` | `commands.test.ts` (registry keyed, `run()` navigates, `resolveActionRoute` sentinel→classic) | PASS |
| R-002 | AC-2: each of 6 stations surfaces **≤4** contextual actions, data-driven (fold `stations.ts` phase + `phases[].nextAction` primary + curated `STATION_SECONDARY`); deduped by resolved route; no hand-wired duplication | Task 2 | `stationActions.ts` | `stationActions.test.ts` (primary first, ≤4, dedup, done-phase→no primary) | PASS |
| R-003 | AC-3: actions **execute** — click runs the command (navigate to classic tool / v2 sheet), replacing the nav-only CTA; classic-context → deep-link | Task 3, Task 4 | `StationActions.tsx`, `StationRail.tsx` | `StationActions.test.tsx` (click → `navigate('/project/p1')`) + rail wiring + browser | PASS |
| R-004 | AC-4: `available?(ctx)` hides inapplicable commands; empty-world state respected | Task 1, Task 3, Task 2 | `commands.ts` (analyze phase≥4 gate), `StationActions.tsx` (empty-world → null) | `commands.test.ts` (analyze gate) + `StationActions.test.tsx` (empty world renders nothing) + `stationActions.test.ts` (filter) | PASS |
| R-005 | AC-5: additive & classic-safe — new files only + one localized `StationRail` edit; no `uiStore` change; **no new global hotkey** (⌘K = 3b); no `palette`/`togglePalette` name collision | Tasks 1-4 | new files + `StationRail.tsx` | diff review (no uiStore/hotkey/cmdk) + `grep -rn "palette\|cmdk\|metaKey" src` on touched files | PASS |
| NF-001 | No regression: full client test suite green (incl. rewritten rail suite) | Task 4, Task 5 | — | `npx vitest run` (4 pre-existing teardown errors = baseline, not +N) | PASS |
| NF-002 | Bundle builds | Task 5 | — | `npx vite build` → ✓ | PASS |
| C-001 | tsc: 0 new errors beyond the THE-486 baseline (19) | Task 5 | — | `npx tsc -b 2>&1 \| grep -c "error TS"` ≤ 19 | PASS |
| C-002 | Scope: no ⌘K palette, no hotkey-registry refactor, no all-55-command wiring, no classic Sidebar/Toolbar deletion | all | — | diff review | PASS |

## Coverage Summary

- **9 requirements — ALL PASS.** Full client suite **292 tests** (35 files), `vite build` ✓, tsc **19** (baseline unchanged, 0 in touched files). The 4 unhandled `EnvironmentTeardownError`s are pre-existing (`roadmapStore.test.ts` teardown), unchanged.
- **Gate (per `reference_client_tsc_cold_fail`):** `npx vitest run` + `npx vite build` + tsc-count ≤ 19. **Never `npm run build`.**
- **Known by-design (not defects):** `vision`/`model` resolve to ≤1 chip (single next action; rail handles nav). AC-4's active production path is the empty-world component gate; per-command `available?` is the typed hook (unit-tested, load-bearing in 3b).
- **Browser check (DOM, WebGL-independent, on `/v2/.../<station>`):** live-confirmed per station — `plan [Create Roadmap, Open Analyze]`, `govern [Generate Policies, Policy approvals]`, `track [Capture Snapshot, Audit checklist]`, `model [Open in classic editor]` (phase 2 done → no primary), `vision` empty (phase 1 done, no secondary). **AC-3 execute confirmed:** clicking `Generate Policies` on govern → `/project/:id/compliance/policies` (deep-link to the classic tool, not a station hop).

## Change Log

| Date | Change | IDs | Author |
|------|--------|-----|--------|
| 2026-07-16 | Initial RVTM from THE-492 ACs + approved plan (1 chunk, 5 tasks). Plan reviewed twice: fixed a gate-breaker (3 obsolete rail tests rewritten + `architectureStore` seeded) + 3 hygiene notes (getNextAction wording, drop dead `hasElements`, 1-chip/AC-4 note). | R-001..R-005, NF/C | Plan phase |
| 2026-07-16 | Executed subagent-driven (TDD, commits `0917137..c328e34`). Final whole-branch review: spec ✅; quality rework applied — the plan's `stationActions.ts`/`StationActions.tsx` differ only by leading-letter case → collides on case-insensitive APFS; renamed data module to `stationCommands.ts` (commit `0b69e71`), reverting a stopgap tsconfig flag + explicit-extension imports. All ACs PASS, gate green, browser-verified. | all | Execution phase |
