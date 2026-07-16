# RVTM: Two-Tempi Camera + App On-Ramps — THE-494 (Slice 5)

**Spec:** Linear [THE-494](https://linear.app/thearchitect/issue/THE-494) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` (#8 Tempi, On-ramps) · Vocabulary: `CONTEXT.md`
**Plan:** `docs/superpowers/plans/2026-07-16-tempi-onramps.md`
**Created:** 2026-07-16
**Worktree/branch:** `.claude/worktrees/the-494-tempi-onramps` off `origin/master` 3adba74, branch `mganzmanninfo/the-494-tempi-onramps`
**Status:** plan approved (2 review rounds — 1 medium fixed: `instant` was silently dropped in the non-3d `fitToScreen` branch, an AC-3 violation for 2D/layer arrivals; + 4 minors); ready to execute.

## Traceability Matrix

| ID | Requirement | Plan Task | Files | Verification | Status |
|----|-------------|-----------|-------|--------------|--------|
| R-001 | AC-1: instant camera path — `flyToStation` gains `instant` opt; `useFrame` applies instant targets in ONE frame (no lerp); animated default byte-compatible for all other fly callers; flag survives the non-3d `fitToScreen` branch | Task 2 | `ViewModeCamera.tsx` | `flyToStation.test.ts` (flag carriage, 3d + 2d-topdown branches; default falsy). **One-frame application evidenced by the Task-5 browser check** — the unit suite mocks `useFrame` | PENDING |
| R-002 | AC-2: two tempi — cinematic only FIRST arrival per (project, station), persisted `ta_seen_stations:{projectId}` Set-as-JSON; revisits instant; clearing storage restores cinematic; marked on arrival | Task 1, Task 3 | `stationTempo.ts`, `JourneyShell.tsx` | `stationTempo.test.ts` (first/seen, per-project isolation, persistence shape, corrupt-storage fallback) + `JourneyShell.test.tsx` (first arrival cinematic → revisit instant) + browser | PENDING |
| R-003 | AC-3: `prefers-reduced-motion: reduce` → every arrival instant regardless of seen-state; helper guards missing matchMedia (jsdom) | Task 1, Task 3 | `stationTempo.ts`, `JourneyShell.tsx` | `stationTempo.test.ts` (stubbed matchMedia; jsdom-default false) + `JourneyShell.test.tsx` (reduced motion → instant on first arrival) + browser (OS setting) | PENDING |
| R-004 | AC-4: Dashboard on-ramp — `ProjectCard` optional `onOpenJourney?` prop renders a "Journey" button (stopPropagation, additive); DashboardPage passes `navigate('/v2/project/:id')` | Task 4 | `ProjectCard.tsx`, `DashboardPage.tsx` | `ProjectCard.journey.test.tsx` (button + no-bubble with prop; absent without) + browser | PENDING |
| R-005 | AC-5: classic ProjectView "Journey →" floating link → `/v2/project/:id` (top-right of scene area; no overlay collision — verified vs SelectionActionBar/banners) | Task 4 | `ProjectView.tsx` | browser (no unit suite exists for ProjectView; one-line additive overlay) | PENDING |
| R-006 | AC-6: Genesis round-trip — Blueprint import success CTA navigates `/v2/project/:id/model` (deliberate, user-approved behaviour change; label "Open in 3D View" stays; classic 1 click away via shell escape hatch) | Task 4 | `BlueprintImport.tsx` | browser (full loop: v2 empty world → Generate with AI → import → land in the World) | PENDING |
| R-007 | AC-7: additive & safe — classic edits are additive affordances only (optional prop; overlay; one CTA destination); existing `ProjectCard` callers byte-compatible; English UI strings | Task 4 | — | `ProjectCard.journey.test.tsx` (no-prop = today) + diff review | PENDING |
| NF-001 | Full client suite green | Task 5 | — | `npx vitest run` (4 pre-existing teardown errors = baseline, not +N) | PENDING |
| NF-002 | Bundle builds | Task 5 | — | `npx vite build` ✓ | PENDING |
| C-001 | tsc: 0 new errors beyond the THE-486 baseline (19) | Task 5 | — | `npx tsc -b 2>&1 \| grep -c "error TS"` ≤ 19 | PENDING |
| C-002 | Scope: no landing bridge, no v2-default flip, no new choreography, no walkthrough content, no Try-Demo migration, no instant mode for flyToElement/flyToWorkspace | all | — | diff review | PENDING |

## Coverage Summary

- **11 requirements**, 0 verified yet (pre-execution). Tempo core + card affordance unit-tested fail-first; ProjectView/BlueprintImport are one-line additive edits with no existing suites — browser-verified (documented, not silently skipped).
- **Gate (per `reference_client_tsc_cold_fail`):** `npx vitest run` + `npx vite build` + tsc ≤ 19. **Never `npm run build`.**
- **Plan-review catch:** the `instant` flag would have been silently dropped when `viewMode` ≠ 3d (`fitToScreen` early-return) — a reduced-motion violation on a flow this very slice creates (classic 2D → "Journey →" on-ramp). Fixed pre-execution + dedicated test.
- **Browser checks:** cinematic-first/instant-revisit per station (user's eyes — WebGL), reduced-motion OS setting, the three on-ramps, and the Genesis round-trip loop.

## Change Log

| Date | Change | IDs | Author |
|------|--------|-----|--------|
| 2026-07-16 | Initial RVTM from THE-494 ACs + approved plan (2 chunks, 5 tasks). Plan reviewed twice: fixed non-3d instant drop (medium) + grep paths, afterEach unstub, AC-1 evidence note, citation/label nits. | R-001..R-007, NF/C | Plan phase |
