# RVTM: THE-597 Slice 3 — Go/No-Go für Schicht 1

**Spec:** `docs/evals/the597-slice3-vorregistrierung.md` (freigegeben 17.11.2026)
**Plan:** `docs/superpowers/plans/2026-11-17-the597-slice3-go-nogo.md`
**Prüfszenarien (versiegelt):** `docs/superpowers/pruefszenarien/2026-11-17-the597-slice3-go-nogo-pruefszenarien.md`
**Created:** 2026-11-17
**Last Updated:** 2026-11-17 (Plan-Phase)

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| R-001 | Ein Lauf zählt nur mit dem vorregistrierten Instrument: Haiku 4.5, k = 5, Prompt tp-4, Golden-Hash passend zum deklarierten Golden; sonst Abbruch mit Grund | Task 1 | `src/evals/the597Slice3.ts` | Unit `parseRun` (7 Fälle inkl. 5 Abweichungen, gv3-als-gv2); Blindprüfung | PENDING | — |
| R-002 | Genau 5 gv3- und 2 gv2-Läufe, keine Datei doppelt, kein Label doppelt — sonst kein Verdikt | Task 2 | `src/evals/the597Slice3.ts` | Unit `decideSlice3` (Anzahl, Duplikat); Task 4 Step 3 (7 verschiedene Hashes); Blindprüfung | PENDING | — |
| R-003 | Kriterium: Recall ≥ 50 % **und** Fehlalarm ≤ 10 %; Grenzen inklusiv; ohne falsche oder ohne richtige Fälle nicht erfüllt | Task 2 | `src/evals/the597Slice3.ts` | Unit `meetsCriterion` (5 Grenzfälle) | PENDING | — |
| R-004 | Bedingung 1: gepoolt über 5 gv3-Läufe erfüllt | Task 2 | `src/evals/the597Slice3.ts` | Unit `decideSlice3`; unabhängige Nachrechnung (Blindprüfung) | PENDING | — |
| R-005 | Bedingung 2: in ≥ 4 von 5 Einzelläufen erfüllt (3/5 reicht nicht, auch wenn gepoolt erfüllt) | Task 2 | `src/evals/the597Slice3.ts` | Unit „3 von 5 → NO-GO", „4 von 5 genügen" | PENDING | — |
| R-006 | Bedingung 3: gepoolt über 2 gv2-Läufe erfüllt — nur obligationKind, provisionKind | Task 2 | `src/evals/the597Slice3.ts` | Unit „gv2 repliziert nicht → kein GO" | PENDING | — |
| R-007 | partyRole: gv2 geht nicht ein; ein partyRole-GO wird als „ein Gold-Set" beschriftet | Task 2, Task 3 | `src/evals/the597Slice3.ts` | Unit partyRole-Test, Render-Test; Blindprüfung (Manipulation gv2-partyRole ändert nichts) | PENDING | — |
| R-008 | Schicht 1 = GO genau dann, wenn ≥ 1 Kombination (Achse × Schwelle 0,8/1,0) GO ist; sonst NO-GO; kein dritter Ausgang | Task 2, Task 3 | `src/evals/the597Slice3.ts` | Unit (GO/NO-GO, 6 Kombinationen); Render-Test; Blindprüfung | PENDING | — |
| R-009 | Prüf-Last je Kombination berichtet, entscheidet nicht | Task 2, Task 3 | `src/evals/the597Slice3.ts` | Unit „60 % Prüf-Last → trotzdem GO"; Render-Test | PENDING | — |
| R-010 | F-04…F-07 beschreibend berichtet (gepoolt gv3), entscheiden nicht | Task 3 | `src/evals/the597Slice3.ts` | Unit `knownErrorClasses` | PENDING | — |
| R-011 | Bericht reproduzierbar: 7 Input-Hashes genannt, zweiter Lauf byte-gleich | Task 3, Task 5 Step 2 | `src/scripts/the597-slice3.ts`, `docs/evals/the597-slice3-ergebnis.{md,json}` | Render-Test (Hashes); Task 5 Step 2 `REPRODUZIERBAR` | PENDING | — |
| R-012 | 3 neue gv3- + 2 gv2-Läufe mit unverändertem Instrument liegen in `docs/evals/the597-slice3/` | Task 4 | `docs/evals/the597-slice3/*`, `scripts/the597-slice3-runs.sh` | Task 4 Step 0–1 (shared-Build, Instrument-Stand), Step 4 (7 verschiedene Hashes); Lauf-Skript überschreibt keinen fertigen Lauf | PENDING | — |
| R-013 | Rohdaten werden committet, bevor das Verdikt berechnet wird | Task 4 Step 5, Task 5 | — | `git log` Reihenfolge (Blindprüfung) | PENDING | — |
| R-014 | Register Abschnitt E: Verdikt wie Bericht, Schicht 2/3 „nicht gemessen" | Task 5 Step 3 | `docs/evals/the597-fehlerfall-register.md` | Blindprüfung | PENDING | — |
| R-015 | Linear-Folgen (THE-597 Kommentar, THE-604/606, ADR-0012) erst nach User-Go, gemäß vorregistriertem Ausgang | Task 5 Step 6 | — | Session-Protokoll | PENDING | — |
| C-001 | Regel, Prompt, Goldens und Slice-1-Läufe bleiben unverändert | alle | — | `git diff origin/master..HEAD` auf diese Pfade leer | PENDING | — |
| C-002 | THE-604/THE-606 weder im Branch- noch im Commit-Titel (kein Auto-Close) | alle | — | `git log` (Blindprüfung) | PENDING | — |
| C-003 | Subagenten führen keine Live-Läufe aus; nur die Session in Task 4 | Task 4 | — | Session-Protokoll; Kostenbelege | PENDING | — |
| NF-001 | Typfehler frei (ts-jest sieht sie nicht) | Task 1–3 | — | `npx tsc --noEmit -p .` | PENDING | — |
| NF-002 | Keine Regression in `the597Routing.test.ts` | Task 3 Step 7 | — | `npx jest src/__tests__/the597Routing.test.ts` | PENDING | — |

## Coverage Summary

- **Total Requirements:** 20 (15 R, 3 C, 2 NF)
- **Verified (PASS):** 0
- **Failed (FAIL):** 0
- **Pending:** 20
- **Coverage:** 0 %

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-11-17 | Initial RVTM aus der Vorregistrierung | R-001..R-015, C-001..C-003, NF-001..NF-002 | Plan-Phase |
