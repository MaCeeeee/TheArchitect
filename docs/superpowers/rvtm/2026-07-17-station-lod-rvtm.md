# RVTM: Station-Adaptive Semantic LOD — THE-500 (Slice 4)

**Spec:** Linear [THE-500](https://linear.app/thearchitect/issue/THE-500) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` (#7, grilled 2026-07-17) · Vocabulary: `CONTEXT.md`
**Plan:** `docs/superpowers/plans/2026-07-17-station-lod.md`
**Created:** 2026-07-17
**Worktree/branch:** `.claude/worktrees/the-500-station-lod` off `origin/master` bea8b94, branch `mganzmanninfo/the-500-station-lod`
**Status:** plan approved (2 review rounds — 4 blockers fixed: connection field names `sourceId`/`targetId`, classic-byte-identical via `journeyActive` gate, scale double-write folded into one target, empty-Track gated on `plateauSnapshots`; + 5 nice-to-haves). Ready to execute.

## Traceability Matrix

| ID | Requirement | Plan Task | Files | Verification | Status |
|----|-------------|-----------|-------|--------------|--------|
| R-001 | AC-1: Station→Scene plumbing — transient `uiStore.journeyStation` set from `JourneyShell` (mirrors `showComplianceGlow`); Scene/children read it | Task 3, Task 6 | `uiStore.ts`, `JourneyShell.tsx`, `Scene.tsx` | `JourneyShell.test.tsx` (journeyStation set on arrival) + browser | PENDING |
| R-002 | AC-2: pure `stationSalience(element, station)→[0..1]` from existing data; uniform expression at chokepoints (opacity·scale·label); low salience recedes to `RECEDE` (never 0) | Task 1, Task 2, Task 4 | `stationSalience.ts`, `useStationSalience.ts`, `NodeObject3D.tsx`, `ArchitectureElements.tsx` | `stationSalience.test.ts` (per-station + fallback) + `useStationSalience.test.ts` (map + override + classic) + browser | PENDING |
| R-003 | AC-3: Track re-form via existing `PlateauRenderer`, station-driven (only when `plateauSnapshots` exist) | Task 6 | `Scene.tsx` | browser (Track with plateaus → blocks; without → box-world + hint) | PENDING |
| R-004 | AC-4: Explore/Govern recede-hard behind `ComplianceGlow` (no new render mode) — via salience floor | Task 1, Task 4 | `stationSalience.ts`, `NodeObject3D.tsx` | `stationSalience.test.ts` (Explore/Govern) + browser | PENDING |
| R-005 | AC-5: cross-fade/dissolve on the Slice-5 tempo — per-node imperative lerp; instant on revisit/reduced-motion (`salienceInstant` from `decideTempo`) | Task 3, Task 4 | `JourneyShell.tsx`, `NodeObject3D.tsx` | `JourneyShell.test.tsx` (cinematic-first flag) + browser (transition) | PENDING |
| R-006 | AC-6: fallback — absent phase-data → full re-dress view + subtle hint; never an empty re-form | Task 1, Task 6, Task 7 | `stationSalience.ts` (hasData), `Scene.tsx` (plateau gate), `JourneyShell.tsx` (hint) | `stationSalience.test.ts` (fallback→1) + browser | PENDING |
| R-007 | AC-7: "Show all" override — uiStore flag + ⌘K command flattens salience on any station | Task 3, Task 7 | `uiStore.ts`, `commands.ts` | `commands.test.ts` (toggles override) + `useStationSalience.test.ts` (override→all-1) + browser | PENDING |
| R-008 | AC-8: additive & classic-safe (classic byte-identical via `journeyActive` gate); no perf refactor/instancing; English strings | all | — | diff review + browser (classic `/project/:id` unchanged) | PENDING |
| NF-001 | Full suite green | Task 8 | — | `npx vitest run` (4 pre-existing teardown errors = baseline) | PENDING |
| NF-002 | Bundle builds | Task 8 | — | `npx vite build` ✓ | PENDING |
| C-001 | tsc: 0 new beyond the THE-486 baseline (19) | Task 8 | — | `npx tsc -b \| grep -c "error TS"` ≤ 19 | PENDING |
| C-002 | Scope: no element-replacing re-forms, no vertex morph, no roadmap→element linkage (Plan stays fallback), no THE-23/58 aggregation, no perf work | all | — | diff review | PENDING |

## Coverage Summary

- **12 requirements**, 0 verified yet. The pure/logic layer (salience math, hook, signal plumbing, override) is fail-first unit-tested; the R3F **render effects** (opacity/scale/label dimming, cross-fade, plateau re-form) are **browser-verified** (WebGL — can't unit-test the visual), matching how the camera work was validated.
- **Gate (per `reference_client_tsc_cold_fail`):** `npx vitest run` + `npx vite build` + tsc ≤ 19. **Never `npm run build`.**
- **Deliberate deferral (honest):** `roadmapElementIds` (per-element roadmap linkage) is left empty this slice → **Plan falls back to full** (AC-6). Wiring it is a small follow-up. Track re-form needs pre-computed `plateauSnapshots` (no auto-trigger this slice → fallback + hint otherwise).
- **Plan-review catches (why they matter):** connection dimming would have been a silent no-op (`source`/`target` vs `sourceId`/`targetId`); classic would have shown all labels + a scale fight (salience firing at weight 1); Track would have gone blank when a roadmap list existed but no snapshots. All fixed pre-execution.
- **Browser checks:** per-station focus feel (Model full · Vision top-layers · Explore/Govern recede-hard+glow · Plan full-fallback · Track plateau/fallback), the cross-fade on first arrival vs snap on revisit, reduced-motion instant, "Show all" flatten, and classic `/project/:id` unchanged.

## Change Log

| Date | Change | IDs | Author |
|------|--------|-----|--------|
| 2026-07-17 | Initial RVTM from THE-500 ACs + grilled/approved plan (3 chunks, 8 tasks). Plan reviewed twice: fixed 4 blockers (conn field names, classic byte-identical `journeyActive` gate, scale-fold, empty-Track `plateauSnapshots` gate) + 5 nice-to-haves. | R-001..R-008, NF/C | Plan phase |
