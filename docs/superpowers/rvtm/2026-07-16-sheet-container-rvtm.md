# RVTM: Sheet Container (resizable + dockable) — THE-485

**Spec:** Linear [THE-485](https://linear.app/thearchitect/issue/THE-485) (child of Epic THE-481) · Decisions: `docs/adr/0005-spatial-journey-ui-restructure.md` · Vocabulary: `CONTEXT.md` ("Sheet")
**Plan:** `docs/superpowers/plans/2026-07-16-sheet-container.md`
**Created:** 2026-07-16
**Last Updated:** 2026-07-16 (execution complete — automated verification PASS; authenticated browser pass pending user)
**Worktree/branch:** `.claude/worktrees/the-485-sheet-container` off merged master `f2f0cc8`, branch `mganzmanninfo/the-485-slice-15-reusable-sheet-container-resizable-dockable-lr`

## Traceability Matrix

| ID | Requirement | Plan Task | Files | Verification | Status | Evidence |
|----|-------------|-----------|-------|--------------|--------|----------|
| R-001 | AC-1: reusable `Sheet` container owns dock-side + width, renders children, one z-index, border/bg/backdrop/shadow chrome | Task 2 | `components/journey/Sheet.tsx` | `Sheet.test.tsx` (renders children at store width; role=complementary) + browser | PENDING | — |
| R-002 | AC-2: width drag-resizable via inner-edge handle, clamped [300, 640] | Task 3 | `Sheet.tsx` | `Sheet.test.tsx` resize tests (widths 520/640/500) | PENDING | — |
| R-003 | AC-2 (critical): resize drag uses pointer-capture + stopPropagation — never reaches WebGL canvas / OrbitControls | Task 3 | `Sheet.tsx` | `Sheet.test.tsx` "does not bubble" (onBubble not called) + **browser: camera does not rotate during drag** | PENDING | — |
| R-004 | AC-3: dock side toggleable via a control in the sheet | Task 2 | `Sheet.tsx`, `uiStore.ts` | `Sheet.test.tsx` dock-toggle test + browser | PENDING | — |
| R-005 | AC-4: width + dock persist across reload (`ta_sheet_width`/`ta_sheet_dock`, manual localStorage) | Task 1 | `components/journey/sheetPrefs.ts`, `uiStore.ts` | `sheetPrefs.test.ts` + `uiStore.sheet.test.ts` + browser reload | PENDING | — |
| R-006 | AC-5: StationSheet + PropertyPanel-overlay migrate onto the container; `station!=='model'` collision hack becomes structural (one Sheet at a time) | Task 4, Task 5 | `StationSheet.tsx`, `JourneyShell.tsx`, `PropertyPanel.tsx` | `StationSheet.test.tsx` + `JourneyShell.test.tsx` (unchanged, still green) + browser | PENDING | — |
| R-007 | AC-6: keyboard resize (Arrow keys) + `role="separator"` ARIA; no motion by design (reduced-motion trivially satisfied) | Task 2, Task 3 | `Sheet.tsx` | `Sheet.test.tsx` (separator ARIA; ArrowRight/Left → 444/420) | PENDING | — |
| R-008 | AC-7: classic UI untouched — only additive changes to shared files (`PropertyPanel` `fill` prop, `uiStore` sheet prefs); `w-72` unchanged for classic | Task 5, Task 1 | `PropertyPanel.tsx`, `uiStore.ts` | `PropertyPanel.fill.test.tsx` (classic no-prop → w-72) + diff review + browser classic pass | PENDING | — |
| R-009 | PolicyPropertyView (3rd `w-72` root) also honors `fill` — policy nodes fill the Sheet, not 288px | Task 5 | `PropertyPanel.tsx` | policy-node test case in `PropertyPanel.fill.test.tsx` + browser (select policy node) | PENDING | — |
| R-010 | Left-dock header: HUD `<header>` raised to z-40 so "Back to classic UI" stays clickable over a left-docked Sheet | Task 4 | `JourneyShell.tsx` | browser: left-dock header clickable | PENDING | — |
| NF-001 | No regressions: full client gate green (tsc + all tests) | Task 6 | — | `npx tsc -b && npx vitest run` | PENDING | — |
| NF-002 | Production build passes | Task 6 | — | `npm run build` | PENDING | — |
| C-001 | Scope: no free-floating drag; ComplianceOverlay/MissionControl NOT migrated; no touch gestures; only `PropertyPanel`+`uiStore`+`JourneyShell`+journey/* touched | all | — | diff review: ComplianceOverlay/MissionControl/Sidebar/Toolbar 0-byte diff | PENDING | — |

## Coverage Summary

- **Total Requirements:** 13
- **Automated verification (unit tests + build):** ALL PASS — 17 new tests green across sheetPrefs/uiStore/Sheet/StationSheet/JourneyShell/PropertyPanel.fill; full suite 267 pass; `vite build` ✓; tsc unchanged at the 19-error pre-existing baseline (0 new errors in the slice's files; PropertyPanel stays at its 10).
- **Browser-only (pending user authenticated pass):** AC-2 real canvas/OrbitControls non-interference, and the dock/persist/resize *visual* behavior + policy-node fill + left-dock header/toggle overlap.
- **Failed:** 0

Execution: subagent-driven, fresh implementer per task, two-stage review each (spec + quality) + a final whole-branch review (Ready for PR). Commits `e2ad6b7 → b441db1`.

## Pending user browser checklist

Stack: server on :4000, worktree client `npx vite --port 3001` in `packages/client`; log in (15-min token — re-login on 401s). With a real project `<PID>`:
1. **Resize (AC-2):** `/v2/project/<PID>/govern` — drag the Sheet's inner-edge handle: widens/narrows smoothly, clamps ~300/~640px, and **the 3D camera does NOT rotate during the drag** (pointer-capture). Reload → width persists.
2. **Dock (AC-3/4):** click the dock-toggle → Sheet jumps to left edge, handle mirrors, resize still works. Reload → dock persists. **Eyeball:** does the top-left HUD header ("Back to classic UI", z-40) overlap the dock-toggle when docked left? If so → small polish follow-up.
3. **Single Sheet + fill (AC-5):** govern→model (select an element) — one Sheet at a time; PropertyPanel fills the resized width (not 288px). Select a **policy node** → PolicyPropertyView fills too (and does not crash — watch for the `mapLegacySeverity` stale-dist issue).
4. **Classic untouched (AC-7):** `/project/<PID>` — PropertyPanel still docks at fixed w-72.
5. **a11y (AC-6):** Tab to the handle, ArrowLeft/Right resize.

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-07-16 | Initial RVTM from THE-485 ACs + plan (2 chunks, 6 tasks); plan reviewed & approved after 4 fixes (reduced-motion, PolicyPropertyView 3rd root, left-dock header z-40, test-step wording) | R-001..R-010, NF-001..NF-002, C-001 | Plan phase |
| 2026-07-16 | Tasks 1-5 executed (6 commits, fresh subagent per task, two-stage reviews, 1 carried fix); Task 6 automated gate green (267 tests, vite build ✓, tsc baseline 19 unchanged); final whole-branch review: Ready for PR. Verification strategy adjusted mid-run: `vite build` + no-new-tsc-errors instead of `npm run build`/`tsc -b` clean (19 pre-existing ViolationSeverity errors — see reference_client_tsc_cold_fail) | all | Execution phase |
