# RVTM: THE-597 Slice 3 — Go/No-Go für Schicht 1

**Spec:** `docs/evals/the597-slice3-vorregistrierung.md` (freigegeben 17.11.2026)
**Plan:** `docs/superpowers/plans/2026-11-17-the597-slice3-go-nogo.md`
**Prüfszenarien (versiegelt):** `docs/superpowers/pruefszenarien/2026-11-17-the597-slice3-go-nogo-pruefszenarien.md`
**Created:** 2026-11-17
**Last Updated:** 2026-11-17 (nach Blindprüfung)

**Ergebnis: Schicht 1 = NO-GO** (`docs/evals/the597-slice3-ergebnis.md`).

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| R-001 | Ein Lauf zählt nur mit dem vorregistrierten Instrument: Haiku 4.5, k = 5, Prompt tp-4, Golden-Hash passend zum deklarierten Golden; sonst Abbruch mit Grund | Task 1 (+ Review-Nachzug d4713fc, 202068f) | `src/evals/the597Slice3.ts` | Unit `parseRun`; Blind S-002, S-012, S-013 | PASS | 47/47 Tests; S-012 exit 1 `samples=3`; S-013 exit 1 `goldenSha256=af57…` |
| R-002 | Genau 5 gv3- und 2 gv2-Läufe, keine Datei doppelt, kein Label doppelt | Task 2 | `src/evals/the597Slice3.ts` | Unit; Blind S-003, S-014 | PASS | 7 verschiedene Hashes; S-014 exit 1 `Lauf fehlt` |
| R-003 | Kriterium Recall ≥ 50 % und Fehlalarm ≤ 10 %, inklusiv; leerer Nenner = nicht erfüllt | Task 2 | `src/evals/the597Slice3.ts` | Unit `meetsCriterion` | PASS | 5 Grenzfall-Tests grün |
| R-004 | Bedingung 1: gepoolt über 5 gv3-Läufe | Task 2 | `src/evals/the597Slice3.ts` | Unit; Blind S-006, S-007 (unabhängige Nachrechnung) | PASS | Nachrechnung = Bericht, Abweichung ≤ 0,05 Pp |
| R-005 | Bedingung 2: ≥ 4 von 5 Einzelläufen | Task 2 | `src/evals/the597Slice3.ts` | Unit 3/5 vs. 4/5; Blind S-008 | PASS | stabil 0,0,0,1,0,0 = Bericht |
| R-006 | Bedingung 3: gv2 gepoolt, nur obligationKind/provisionKind | Task 2 | `src/evals/the597Slice3.ts` | Unit; Bericht | PASS | gv2 für keine Achse erfüllt |
| R-007 | partyRole: gv2 geht nicht ein; GO als „ein Gold-Set" beschriftet | Task 2, 3 | `src/evals/the597Slice3.ts` | Unit; Blind S-009, S-010 (Manipulation gv2-partyRole ändert nichts) | PASS | S-010: vorher/nachher NO-GO, partyRole go:false |
| R-008 | Schicht 1 binär GO/NO-GO | Task 2, 3 | `src/evals/the597Slice3.ts` | Blind S-005, S-006 | PASS | `Schicht 1: **NO-GO**`, keine Weichwörter |
| R-009 | Prüf-Last berichtet, entscheidet nicht | Task 2, 3 | `src/evals/the597Slice3.ts` | Unit 55 % → GO; Blind S-011 | PASS | Bericht 4,3–14,3 % = Nachrechnung |
| R-010 | F-04…F-07 beschreibend | Task 3 | `src/evals/the597Slice3.ts` | Unit; Bericht | PASS | F-04 7/1 · F-05 47/3 · F-06 50/8 · F-07 5/0 (falsch / davon < 0,8) |
| R-011 | Reproduzierbar, 7 Input-Hashes | Task 3, Task 5 Step 2 | `src/scripts/the597-slice3.ts`, `docs/evals/the597-slice3-ergebnis.{md,json}` | Task 5 Step 2; Blind S-015, S-016 | PASS | `REPRODUZIERBAR`; 7/7 Hashes im Bericht |
| R-012 | 3 neue gv3- + 2 gv2-Läufe mit unverändertem Instrument | Task 4 | `docs/evals/the597-slice3/*`, `scripts/the597-slice3-runs.sh` | Task 4 Step 0–1, 4; Blind S-001, S-002 | PASS | 5 × 350 Aufrufe, 0 Abbrüche (`lauf-protokoll.log`), 0 offene Achsen |
| R-013 | Rohdaten vor dem Verdikt committet | Task 4 Step 5, Task 5 | — | Blind S-018 | PASS | 79bf81f (Läufe) vor c7c9335 (Bericht) |
| R-014 | Register Abschnitt E | Task 5 Step 3 | `docs/evals/the597-fehlerfall-register.md` | Blind S-017 | PASS | NO-GO, Schicht 2/3 „nicht gemessen" |
| R-015 | Linear-Folgen erst nach User-Go | Task 5 Step 6 | — | Session-Protokoll | PENDING | Verdikt dem User vorgelegt, Folgen warten auf Go |
| C-001 | Regel, Prompt, Goldens, Slice-1-Läufe unverändert | alle | — | Blind S-019; `git diff b2fabff..HEAD` | PASS | S-019 meldete FAIL, weil das Szenario die Vorregistrierung schon auf master annahm — sie entstand im ersten Branch-Commit b2fabff; `git diff --stat b2fabff..HEAD` über alle fünf Pfade ist leer (Szenario-Fehler, kein Implementierungsfehler) |
| C-002 | THE-604/606 nicht im Branch-/Commit-Titel | alle | — | Blind S-020 | PASS | grep leer, Branch `feat/the-597-slice3` |
| C-003 | Nur die Session misst live | Task 4 | — | Session-Protokoll | PASS | Läufe einmalig aus der Session; Subagenten-Prompts verboten typing:eval |
| NF-001 | Typfehlerfrei | Task 1–3 | — | `npx tsc --noEmit -p .`; Blind S-021 | PASS | exit 0 |
| NF-002 | Keine Regression the597Routing | Task 3 | — | Blind S-021 | PASS | 2/2 Suiten, 47/47 Tests |

## Coverage Summary

- **Total Requirements:** 20 (15 R, 3 C, 2 NF)
- **Verified (PASS):** 19
- **Failed (FAIL):** 0
- **Pending:** 1 (R-015 — wartet auf User-Go)
- **Coverage:** 95 %

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-11-17 | Initial RVTM aus der Vorregistrierung | R-001..R-015, C-001..C-003, NF-001..NF-002 | Plan-Phase |
| 2026-11-17 | Chunk 1 umgesetzt (11b60cc, 23cbc21, 38ef075), Review-Nachzüge d4713fc, 202068f; Spec- und Code-Review approved | R-001..R-011, NF-001..NF-002 | Ausführung |
| 2026-11-17 | Läufe (79bf81f), Ergebnis NO-GO (c7c9335), Protokoll (36c080c); Blindprüfung 20/21, S-019 als Szenario-Fehler belegt | alle | Ausführung |
