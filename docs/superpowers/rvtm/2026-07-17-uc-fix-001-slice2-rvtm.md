# RVTM — UC-FIX-001 Slice 2 (REQ-FIX-001.2 / THE-502)

**UC:** THE-498 (UC-FIX-001) · **REQ:** THE-502 (Slice 2, 1-Klick-Apply) · **verwandter Bug:** THE-501 (`maturityLevel`-Fix defekt — Grund für dessen Ausschluss aus `AUTO_FIXABLE_FIELDS`)
**Plan:** `docs/superpowers/plans/2026-07-17-uc-fix-001-slice2-one-click-apply.md`
**Branch:** `mganzmanninfo/the-502-req-fix-0012-...` (von `origin/master` 7bc53fb, inkl. Slice 1)
**Stand:** 2026-07-17 — 3 Bau-Tasks je 2-stufig reviewt, Final-Review 0 Critical/Important. Kein Server-Code.

## Traceability

| REQ | AC | Task | Files | Verifikation | Evidence |
|---|---|---|---|---|---|
| REQ-FIX-001.2 | AC-1 (deriveViolationFix schärfen: applicable/action nur equals/gte/lte) | T1 | `shared/utils/violation-fix.ts` | `deriveViolationFix.test.ts` (Operator-Matrix, gt/lt/exists/contains → applicable:false/keine Action, Instruction bleibt) | **PASS** — Vitest, Commit 0c190cb |
| REQ-FIX-001.2 | AC-2 (`AUTO_FIXABLE_FIELDS` + `isAutoFixableField`, type/maturityLevel/layer raus) | T1 | `shared/utils/violation-fix.ts` | `isAutoFixableField`-Unit-Test (4 in / 3 out) | **PASS** — Vitest |
| REQ-FIX-001.2 | AC-3 (`elementId` durchreichen) | T2 | `client/.../ComplianceDashboard.tsx` | Wert schon auf der Wire (`compliance.service.ts:98` `elementId: el.id`); Client-Interface + `!!v.elementId`-Guard | **PASS** — Final-Review an der Quelle verifiziert |
| REQ-FIX-001.2 | AC-4 (await updateElement → runCheck, nicht optimistisch; Toast) | T2 | `client/.../ComplianceDashboard.tsx` | `ComplianceDashboard.applyfix.test.tsx` (Klick → `updateElement('p1','el-1',{status:'current'})` → `checkCompliance` 2×) | **PASS** — Commit 31f8a2f |
| REQ-FIX-001.2 | AC-5 (RBAC-Disable via `ROLE_PERMISSIONS[role]`; Server-403 = Wahrheit) | T3 | `client/.../ComplianceDashboard.tsx` | applyfix-Test viewer: Button disabled + Tooltip + kein `updateElement` | **PASS** — Commit 4ac228a |
| REQ-FIX-001.2 | AC-6 (Unit + Komponente) | T1–T3 | s.o. | 5 Komponententests (show/apply/re-check, contains hidden, type hidden, viewer disabled, malformed null hidden) + Operator-Unit-Tests | **PASS** — 19/19 (3 Files) |

## Härtungen (aus Task-2-Review eingefaltet, T3)
- **Race-Guard:** `disabled={!!applyingKey || !canUpdate}` — alle [Fix]-Buttons sperren während irgendeiner Apply läuft (verhindert 2. applyFix→runCheck-Race); per-Row-Label bleibt. Klarstellungs-Kommentar am Button (ec32524).
- **Null-Guard:** `canOneClick` verlangt zusätzlich `fix.action?.payload?.value != null` — malformte Policy (`expectedValue:null`) rendert keinen Button, der `{field:null}` PUTten würde. Eigener Test.

## Gate (2026-07-17)
Client `deriveViolationFix` + `ComplianceDashboard.applyfix` + `ComplianceDashboard.fixline`: **19/19** (3 Files). `vite build` ✓. Kein Server-Code → kein jest. (`tsc -b` nicht als Gate — 19 vorbestehende ViolationSeverity-Fehler.)

## Slice-3-Merker (Kommentar auf THE-498 / Folge-REQs)
- `regex` + die jetzt applicable:false-Operatoren (`exists/gt/lt/contains`) bleiben instruction-only bis operator-spezifische Semantik gebaut ist (Boundary / Feld-Löschung / Append / echter Wert).
- `maturityLevel` bleibt aus `AUTO_FIXABLE_FIELDS` bis THE-501 (Feldname-Mismatch) behoben ist; danach `maturityLevel` anhängen → `gte/lte`-Ein-Klick leuchtet auf (heute applicable, aber kein numerisches Feld in der Whitelist).
- `layer`-Ein-Klick = eigener REQ mit Bestätigungsdialog (Scope-Kaskade + Re-Embed + Reposition).
- a11y-Politur: disabled [Fix] nutzt `title`-Tooltip (kein `aria-disabled`/AT-Announcement).

## Offene Verifikation
In-Browser-Smoke des [Fix]-Buttons beim Deploy (Unit + 5 Komponententests decken die Logik; Präzedenz THE-442/THE-202/THE-499).
