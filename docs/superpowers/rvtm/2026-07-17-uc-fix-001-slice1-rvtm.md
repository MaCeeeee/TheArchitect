# RVTM — UC-FIX-001 Slice 1 (REQ-FIX-001.1 / THE-499)

**UC:** THE-498 (UC-FIX-001, Violation-Remediation) · **REQ:** THE-499 (Slice 1, deterministischer Fix + ComplianceDashboard-Anzeige, kein LLM)
**Plan:** `docs/superpowers/plans/2026-07-17-uc-fix-001-slice1-deterministic-violation-fix.md`
**Branch:** `mganzmanninfo/the-499-req-fix-0011-deterministischer-violation-fix-anzeige-in` (von `origin/master` 05bb126)
**Stand:** 2026-07-17 — alle 5 Tasks gebaut, je 2-stufig reviewt, Final-Review 0 Critical/Important.

## Traceability

| REQ | AC | Task | Files | Verifikation | Evidence |
|---|---|---|---|---|---|
| REQ-FIX-001.1 | AC-1 (jeder Operator + korrigiertes `not_equals`) | T1 | `shared/utils/violation-fix.ts` | `deriveViolationFix.test.ts` (11 Fälle) | **PASS** — Vitest 11/11; `not_equals`→applicable:false/keine Action test-gepinnt (Commit a2229f7/a5160c1) |
| REQ-FIX-001.1 | AC-2 (`edit_field`-Action mit `payload{field,value}`, Typ-Reuse) | T1 | `shared/utils/violation-fix.ts` | edit_field/payload-Assertions | **PASS** — Vitest; kein neuer Action-Typ (RemediationAction wiederverwendet) |
| REQ-FIX-001.1 | AC-3 (`operator` persistiert + DTO + Passthrough + Graceful Fallback) | T2, T3 | `models/PolicyViolation.ts`, `services/policy-evaluation.service.ts` (beide Upserts), `shared/types/compliance.types.ts`, `services/compliance.service.ts` | `policy-evaluation.test.ts` (persistiert), `compliance-operator.test.ts` (Report-Pfad), `governance.routes.ts` toObject-Passthrough (verifiziert, kein Code) | **PASS** — Jest 62/62 (inkl. compliance-score-Regression); Fallback bei fehlendem operator im T1-Test |
| REQ-FIX-001.1 | AC-4 (Dashboard Fix-Imperativ + Transition-Zeile, kein Button) | T4 | `client/components/governance/ComplianceDashboard.tsx` | `ComplianceDashboard.fixline.test.tsx` (echtes Render, deriveViolationFix NICHT gemockt) | **PASS** — Vitest; „Add description" + „Field description:" gerendert, kein [Fix]-Button |
| REQ-FIX-001.1 | AC-5 (Unit-Edge-Cases) | T1 | `client/utils/deriveViolationFix.test.ts` | regex, missing-operator, unknown-operator (default), leeres currentValue, Objekt/Leerstring-expectedValue | **PASS** — Vitest 11/11 |

## Datenfluss (zwei Pfade, beide additiv)

- **Report-Pfad (speist das Dashboard, AC-4):** `checkCompliance` → `ComplianceViolation.operator` → Client `Violation.operator` → `deriveViolationFix` → „Fix"-Zeile.
- **Persistierter Pfad (Fundament Slice-2-[Fix]-Button, AC-3):** `evaluateElementPolicies`/`evaluateAllForPolicy` `$set operator` → `PolicyViolation.operator` → `PolicyViolationDTO` via `getViolations` toObject-Spread. In Slice 1 vom Dashboard NICHT konsumiert.

## Gate (2026-07-17)
Server `policy-evaluation|compliance-operator|compliance-score`: **62/62** (3 Suites). Client `deriveViolationFix` + `ComplianceDashboard.fixline`: **12/12** (2 Files). `vite build` ✓. (Volle Server-Suite nicht als Gate — 9-10 vorbestehend flaky; `tsc -b` nicht als Gate — 19 vorbestehende ViolationSeverity-Fehler.)

## Slice-2-Merker (Kommentar auf THE-498)
1. `[Fix]`-Executor MUSS operator-aware sein (blindes `payload.value`-Schreiben fixt `gt/lt/exists:false/contains` nicht — Tabelle auf THE-498).
2. `applicable:false`-Instruktionen (not_equals/regex/missing) visuell abheben + `[Fix]`-Button auf `fix.applicable` gaten.
3. Optional: `fmt` (shared) und `fmtValue` (Dashboard) vereinheitlichen.

## Offene Verifikation
In-Browser-Smoke der Dashboard-Fix-Zeile beim Deploy (Unit + Komponenten-Test decken die Logik; Präzedenz THE-442/THE-202: Prod-Smoke nach Merge).
