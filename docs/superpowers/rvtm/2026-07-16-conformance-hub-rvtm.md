# RVTM: Conformance Hub in the World — THE-487

**Spec:** Linear [THE-487](https://linear.app/thearchitect/issue/THE-487) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` (#4) + `docs/adr/0003-conformance-information-architecture.md` · Vocabulary: `CONTEXT.md`
**Plan:** `docs/superpowers/plans/2026-07-16-conformance-hub.md`
**Created:** 2026-07-16
**Last Updated:** 2026-07-16 (execution complete; automated all-green + live browser check of the Hub; ComplianceGlow heatmap left for the user's authenticated visual check)
**Worktree/branch:** `.claude/worktrees/the-487-conformance-hub` off merged master `8b4482d`, branch `mganzmanninfo/the-487-slice-2-conformance-hub-in-the-world`

## Traceability Matrix

| ID | Requirement | Plan Task | Files | Verification | Status | Evidence |
|----|-------------|-----------|-------|--------------|--------|----------|
| R-001 | AC-1: on explore/govern/track the Sheet shows `ConformanceHub` pre-scoped to that station's gate (Explore→Cover, Govern→Enforce, Track→Attest) | Task 1, Task 4 | `stations.ts`, `JourneyShell.tsx` | `stations.conformance.test.ts` + `JourneyShell.test.tsx` (hub scoped per station) + browser | PENDING | — |
| R-002 | AC-1: vision/model/plan unchanged (model=PropertyPanel; vision/plan=StationSheet placeholder) | Task 4 | `JourneyShell.tsx` | `JourneyShell.test.tsx` (vision→no hub; repointed placeholder test) | PENDING | — |
| R-003 | AC-1: gate emphasis — the scoped gate card is marked, others not | Task 2 | `ConformanceHub.tsx` | `ConformanceHub.test.tsx` (`data-scoped`) | PENDING | — |
| R-004 | AC-2: coverage heatmap (`ComplianceGlow`) visible in the World on conformance stations | Task 3, Task 4 | `complianceStore.ts`, `JourneyShell.tsx` | `complianceStore.glow.test.ts` + `JourneyShell.test.tsx` (setShowComplianceGlow(true)) + browser | PENDING | — |
| R-005 | AC-2 (AC-7): leaving a conformance station restores the prior glow value — classic not left in a changed state | Task 4 | `JourneyShell.tsx` | Effect cleanup (restore-on-leave) + browser | PENDING | — |
| R-006 | AC-3: gate cards deep-link to classic `/compliance/:section` with an "opens in the classic UI" affordance | Task 2 | `ConformanceHub.tsx` | `ConformanceHub.test.tsx` (affordance) + browser | PENDING | — |
| R-007 | AC-7: classic UI byte-identical — `ConformanceHub`/`complianceStore` changes additive & default-off; `CompliancePage`/`ComplianceOverlay`/`Toolbar`/`ProjectView` untouched | Tasks 2,3,4 | shared files | `ConformanceHub.test.tsx` (no-prop = classic) + diff review (forbidden files 0-byte) | PENDING | — |
| NF-001 | No regression: full client test suite green | Task 5 | — | `npx vitest run` | PENDING | — |
| NF-002 | Bundle builds | Task 5 | — | `npx vite build` | PENDING | — |
| C-001 | tsc: no NEW errors beyond the 19 pre-existing (THE-486); touched files add 0 | Task 5 | — | `npx tsc -b 2>&1 \| grep -c` ≤ 19 | PENDING | — |
| C-002 | Scope: no Matrix-as-Sheet, no CompliancePage 18-section migration, no ComplianceOverlay deletion, no findings→fly-to | all | — | diff review | PENDING | — |

## Coverage Summary

- **Automated (unit tests + build):** ALL PASS — full suite 279, `vite build` ✓, tsc unchanged at the 19-error pre-existing baseline (0 new; touched files 0). 18 THE-487 tests. Final whole-branch review: Ready for PR; forbidden files (`CompliancePage`/`ComplianceOverlay`/`Toolbar`/`ProjectView`/`Scene`/`ComplianceGlow`) 0-byte diff.
- **Live browser (claude-in-chrome, user session, 2026-07-16):** AC-1 confirmed — `/v2/.../govern` renders the Conformance Hub with **Enforce first** (`data-scoped="true"`, `aria-current="true"`, order `[enforce, cover, attest]`), "For this station" badge + "opens in the classic UI" affordance present. Explore→Cover / Track→Attest by the same mechanism. AC-3 (gate→classic) intact.
- **User to visually confirm:** AC-2 ComplianceGlow coverage heatmap on elements (needs a project with mappings; the automation tab's WebGL renders black), and that leaving a conformance station restores the prior glow (AC-7 restore-on-leave).
- A browser-found UX fix landed: the pre-scoped gate now renders FIRST (it was below the fold in the narrow Sheet), plus `aria-current` and classic-only `data-scoped` (`3e9e6dd`).
- **Total Requirements:** 11 · **Failed:** 0 · automated PASS, browser AC-1/AC-3 confirmed, AC-2 heatmap pending user visual.

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-07-16 | Initial RVTM from THE-487 ACs + plan (2 chunks, 5 tasks); plan reviewed & approved after 2 fixes (repointed a breaking existing test to `vision`; glow effect restore-on-leave for AC-7) | R-001..R-007, NF-001..NF-002, C-001..C-002 | Plan phase |
| 2026-07-16 | Tasks 1-4 executed (subagent-driven, two-stage reviews) + final whole-branch review (Ready for PR); Task 5 automated gate green (279 tests, vite build ✓, tsc 19). Live browser check: Hub pre-scoped (Enforce first on govern), affordance/badge present. Browser-found UX fix `3e9e6dd`: scoped gate first + aria-current + classic-only data-scoped. Commits `29a778c..3e9e6dd` | all | Execution phase |
