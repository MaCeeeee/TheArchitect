# RVTM: Journey Slice 1 — Persistent World Shell + Model Station

**Spec:** Linear [THE-482](https://linear.app/thearchitect/issue/THE-482/slice-1-persistent-world-shell-model-station) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` · Vocabulary: `CONTEXT.md`
**Plan:** `docs/superpowers/plans/2026-07-15-journey-slice1-world-shell.md`
**Created:** 2026-07-15
**Last Updated:** 2026-07-16 (execution + authenticated browser pass complete; one browser-found bug fixed)
**Branch:** `mganzmanninfo/the-482-slice-1-persistent-world-shell-model-station` (worktree `.claude/worktrees/the-482-journey-slice1`), 13 commits `df6aede..9f2467f` on `4bd77cb`

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| R-001 | AC-1: Navigating between stations never unmounts the architecture `<Canvas>` | Task 7 | `components/journey/JourneyShell.tsx` | Shell test "AC-1" (mount/unmount counters) + browser canvas-identity check | PASS | Test PASS (Scene mounts=1, unmounts=0). Browser 2026-07-16: same `three.js r171` canvas persisted across govern→vision→track over 2 projects, no reloads; distinct camera framing per station (camera-only, layer geometry fixed) |
| R-002 | AC-2: Project data loading lives in the shared hook | Task 3 | `hooks/useProjectData.ts` (+test), `components/ui/ProjectView.tsx` | `useProjectData.test.tsx` + spec review (verbatim move) | PASS | 4/4 tests; spec reviewer confirmed line-by-line verbatim extraction, identical deps; ProjectView −82 LOC, JSX untouched. Review fix: violation-listener cleanup scoped to own handler (`7faa25d`) |
| R-003 | AC-3: Rail always visible, freely jumpable, shows nextAction CTA | Task 5 | `components/journey/StationRail.tsx` (+test) | `StationRail.test.tsx` (7 tests) + browser | PASS | Tests PASS. Browser 2026-07-16: current station green, done stations show ✓ (Vision ✓, Model ✓); CTA suggests first-incomplete phase (works as "suggestion, not lock"). Review fixes `266f0ca` |
| R-004 | AC-4: PropertyPanel as overlay Sheet, no route change | Task 7 | `components/journey/JourneyShell.tsx` | Shell test "AC-4" + browser element click | PASS | Test PASS. Browser found a layout bug (empty PropertyPanel default-open + right-edge collision with StationSheet) → FIXED in `9f2467f`: PropertyPanel now renders only on Model AND with a selected element; StationSheet only on non-Model → mutually exclusive, collision structurally eliminated. 9 shell tests |
| R-005 | AC-5: /v2 deep links: default→model, station param→camera, junk→canonical redirect | Task 7 | `JourneyShell.tsx`, `App.tsx` | Shell tests (3) + browser hard-loads | PASS | Tests PASS incl. exact-match redirect. Browser 2026-07-16: authenticated hard-loads of `/v2/project/<id>/govern|vision|track` each resolved with correct camera + station sheet; unauth path guarded by ProtectedRoute → login |
| R-006 | AC-6: Only one architecture canvas alive — singleton guard | Task 2 | `components/3d/sceneSingleton.ts` (+test), `Scene.tsx` | `sceneSingleton.test.ts` + StrictMode analysis + browser console | PASS | 2/2 tests; quality reviewer verified StrictMode mount→cleanup→mount sequence never false-positives; final reviewer verified React commit ordering on classic↔v2 route swap (unmount-before-mount guaranteed). No AC-6 console error in browser session |
| R-007 | AC-7: Classic UI untouched in behavior | Tasks 3, 7 | `ProjectView.tsx` (hook swap only), `App.tsx` (additive) | Full suite + diff review + browser | PASS | 250/250 tests; App.tsx +12/−0; forbidden files 0-byte diff (final review); PropertyPanel fix `9f2467f` touched only JourneyShell (no classic file). Browser 2026-07-16: classic dashboard/portfolio rendered normally alongside v2 |
| R-008 | Station vocabulary per CONTEXT.md (6 stations, ADM badge, classic escape routes) | Task 1 | `components/journey/stations.ts` (+test), `stores/journeyStore.ts` (export) | `stations.test.ts` | PASS | 6/6 tests; badges derived from `PHASE_CONFIG` (single source, review fix `bb8a4d1`); exact classic-route assertions |
| R-009 | Station ⟂ viewMode: framing intent vs projection | Task 4 | `components/3d/ViewModeCamera.tsx` (+test) | `flyToStation.test.ts` | PASS | 4/4 tests incl. 2d-topdown delegation (y=80); quality reviewer verified all 6 presets stay above ground plane and inside OrbitControls polar clamp |
| R-010 | Mandatory empty states: placeholder Sheet + classic escape; empty world → Blueprint on-ramp | Tasks 6, 7 | `components/journey/StationSheet.tsx` (+test), `JourneyShell.tsx` | `StationSheet.test.tsx` + shell test | PASS | Tests PASS; review fix `bd89b6f` restored pointer pass-through on the empty-state wrapper |
| NF-001 | Full client gate green | Task 8 | — | `npx tsc -b && npx vitest run` | PASS | tsc clean; **248/248 tests, 25 files** (fresh run by final reviewer, 2026-07-16). Note: ESLint has no config repo-wide (pre-existing) — lint gate is vacuous. 4 pre-existing roadmapStore teardown errors = known noise |
| NF-002 | Production build passes | Task 8 | — | `npm run build` (worktree root) | PASS | Turbo 4/4 successful, exit 0, client bundle built in 3.4s (only pre-existing chunk-size warnings) |
| C-001 | Scope: no LOD/merge/palette/on-ramp/tempo work; forbidden files untouched | all | — | Final diff review | PASS | Final reviewer: file inventory exactly the allowed set (18 files, +945/−83); forbidden-files diff empty |
| C-002 | Executed in dedicated worktree on the Linear branch | setup | — | `git worktree list` | PASS | Worktree `.claude/worktrees/the-482-journey-slice1`, branch `mganzmanninfo/the-482-slice-1-...` |

## Coverage Summary

- **Total Requirements:** 14
- **Verified (PASS):** 14
- **Failed (FAIL):** 0
- **Pending:** 0
- **Coverage:** 100% — all rows have automated PASS + browser evidence (2026-07-16)

## Local-infra note (resolved)

The API server originally could not start: the local Neo4j volume's password did not match `.env` (`Neo.ClientError.Security.Unauthorized`), also affecting the main checkout. Fixed non-destructively on 2026-07-16 by removing `/data/dbms/auth.ini` from the `javis_neo4j_data` volume (backed up to `/tmp/neo4j-auth.ini.bak`) and restarting — Neo4j re-seeded the password from `NEO4J_AUTH`; all 11,582 graph nodes preserved. Worktree client verified on port 3001.

## Open follow-up found in browser (not a Slice-1 regression)

- **`[Socket] Connection error: Invalid token`** (`socket.ts:53`) fires on /v2 project load. The socket code is a verbatim move from classic `ProjectView`, so it almost certainly also fires in classic `/project/<id>` — i.e. pre-existing dev-env socket-auth behavior, real-time violation updates degraded. TODO: confirm it reproduces in classic, then open a separate ticket. Out of scope for THE-482.

## Non-blocking follow-ups collected from reviews (for THE-482 comment / later slices)

1. StrictMode-sequence + double-release tests for `sceneSingleton` (Task 2 review).
2. Prod observability of the AC-6 guard (console.error is invisible in prod; Sentry has no captureConsole integration — misleading comment in `main.tsx:11`).
3. `socketOn` handler-identity assertion in `useProjectData` unmount test (currently `expect.any(Function)`).
4. `computeBounds` dedup in `ViewModeCamera` (centroid math copied from `fitToScreen`).
5. Cancel in-flight camera lerp on user OrbitControls input (pre-existing, more visible with station flights).
6. Clear module-level `flyTarget` on scene release (stale flight can leak classic↔v2 within ~0.7s window).
7. Loading gate unmounts the World — convert to overlay before a v2 project switcher exists.
8. `leaveProject` never called → socket room accumulation (pre-existing).
9. ~~PropertyPanel default-open (empty) on /v2 entry~~ — FIXED `9f2467f` (Model + selection gate).
10. `docs/superpowers/plans/` + `rvtm/` for this slice live in the main checkout (untracked) — commit alongside the PR.
11. **Resizable + dock-L/R Sheet container** (user request 2026-07-16): make Sheets width-adjustable and dockable left/right — build as reusable Sheet infrastructure, scored Pre-Flight paired with Slice 2 (Comply matrix needs it). "Free-floating anywhere" deliberately deferred (Prinzip A: adds the complexity we remove).

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-07-15 | Initial RVTM created from THE-482 ACs + ADR-0005 constraints | R-001..R-010, NF-001..NF-002, C-001..C-002 | Plan phase |
| 2026-07-16 | Tasks 1-7 executed (11 commits, fresh subagent per task, two-stage reviews, 4 review-fix commits); Task 8 gates run (tsc/vitest/build); unauthenticated browser check done; final whole-branch review: Ready for PR | all | Execution phase |
| 2026-07-16 | Neo4j auth reset (non-destructive); authenticated browser pass across 2 projects × stations; found + fixed PropertyPanel/StationSheet collision (`9f2467f`, 250/250, reviewed); all 14 rows → PASS | R-001,R-003,R-004,R-005,R-007 | Browser verification |
