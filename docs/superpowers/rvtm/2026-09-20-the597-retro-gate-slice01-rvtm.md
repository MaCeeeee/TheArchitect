# RVTM: THE-597 Retrospektives Gate — Slice 0 + 1

**Spec:** Linear [THE-597](https://linear.app/thearchitect/issue/THE-597) (AC-1..AC-4) · Loop-Kontrakt Strang 2 als Kommentar an [THE-604](https://linear.app/thearchitect/issue/THE-604) (20.09.2026) · Pre-Flight-Kommentar an THE-597 (20.09.2026, Stufen 1–5)
**Plan:** `docs/superpowers/plans/2026-09-20-the597-retro-gate-slice01.md`
**Prüfszenarien (versiegelt, Pfad):** `docs/superpowers/pruefszenarien/2026-09-20-the597-retro-gate-slice01-pruefszenarien.md`
**Created:** 2026-09-20
**Last Updated:** 2026-09-20 (Abnahme)

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| **R-001** | Ein gemeinsames Fehlerfall-Register existiert mit ≥ 9 Fällen; jede Zeile trägt Quelle (Datei:Zeile oder ein committetes Dokument — der zitierte gv3-Lauf liegt als Kopie unter `docs/evals/the597-input-typing-gv3.md`), Facette, „Ausgang bekannt" und erwartete Fang-Schicht; der Kopf benennt die Umbenennung SHACL v0 → Zod-Shape-Set v0 mit Quelle (Voraussetzung AC-2) | Task 1 | `docs/evals/the597-fehlerfall-register.md`, `docs/evals/the597-input-typing-gv3.md` | `grep -c '^| F-'` ≥ 9; Stichprobe 3 Zeilen mit Pfad | PASS | Blindprüfung 20.09. (HEAD c53373d): S-001/S-002/S-003/S-039 PASS — 9 F-Zeilen, alle Quellen aufgelöst; Kopf nennt SHACL→Zod mit Quelle |
| **R-002** | `aurocFromSamples`: perfekte Trennung → 1, invertiert → 0, alle gleich → 0,5, eine Klasse fehlt oder leer → `null` (Instrument-Kontrolle) | Task 2 | `packages/server/src/evals/metrics.ts`, `…/__tests__/the597Routing.test.ts` | `npx jest src/__tests__/the597Routing.test.ts` | PASS | S-005–S-008 PASS; `the597Routing.test.ts` 10/10 (93c39ab, cc13c49, 65dcd05) |
| **R-003** | `thresholdRoutingStats`: geroutet ⇔ `confidence < threshold`; Recall = gefangene falsche / falsche, Fehlalarm = geroutete richtige / richtige, nie NaN; Default-Schwellen 0,6 / 0,8 / 1,0 | Task 2 | wie R-002 | wie R-002 | PASS | S-009–S-012 PASS (strikte Schwelle, kein NaN, Defaults 0.6/0.8/1) |
| **R-004** | `axisCalibrationSamples` liefert je Fall mit Gold **und** Confidence genau ein Sample (`null`==`null` korrekt); `axisCalibration` verhält sich unverändert (ohne Confidence `null`) | Task 3 | `packages/server/src/evals/typingMetrics.ts`, `…/__tests__/typingMetrics.test.ts` | `npx jest src/__tests__/typingMetrics.test.ts` (Basislinie + 2) | PASS | S-013/S-014 PASS; `typingMetrics.test.ts` 13/13 (4ef26c0, 65dcd05) |
| **R-005** | Der Mapping-Report trägt den Abschnitt `## ECE + Schwellen-Routing (THE-597)` mit Mindest-N-Warnung; das JSON die Keys `calibration` und `routing` | Task 4 | `packages/server/src/evals/runMappingEval.ts` | `npx tsc --noEmit -p .`; Code-Review der Einfügestelle | PASS | S-031 PASS; Code-Review a85256a/71fca67; `tsc --noEmit` sauber |
| **R-006** | Der Offline-Lauf scheitert deterministisch (kein Cache-Bucket für Golden-Version `v1-draft`, Cache liegt unter `v1-seed`), der Fehler ist reproduziert und die Register-Zeile „Norm→Element-Mapping / Offline messbar" nennt genau diesen Grund; kein Live-Lauf | Task 4 Step 5–6 | Register Abschnitt C | Konsolenausgabe `--offline: no valid cache for case "dsgvo-art30-vvt"`; Register-Zeile enthält `kein Cache-Bucket` | PASS | S-032/S-032b PASS: Exit 1, `no valid cache for case "dsgvo-art30-vvt"`; Register C nennt `kein Cache-Bucket` |
| **R-007** | `aggregateVotes`: Mehrheit je Achse; Konfidenz = Stimmen des Gewinners / k; `null` ist eine Stimme; offene Läufe drücken die Konfidenz; in allen Läufen offen → Achse offen ohne Konfidenz; Tie deterministisch (`null` = Enthaltung gewinnt vor jeder id, sonst Byte-Reihenfolge); `partyRoleObserved` nur bei strikter Mehrheit über alle k Läufe (Review-Entscheid 20.09.); leer → `{ labels: {} }` | Task 5 | `packages/server/src/evals/runTypingEval.ts`, `…/__tests__/runTypingEval.test.ts` | `npx jest src/__tests__/runTypingEval.test.ts` | PASS | S-015–S-019b PASS; `runTypingEval.test.ts` 16/16 (f97fd96, 08dbb47) |
| **R-008** | `withSelfConsistency(inner, k)` ruft `inner` je Fall genau k-mal und aggregiert; k < 2 gibt `inner` selbst zurück | Task 5 | wie R-007 | wie R-007 | PASS | S-020/S-021 PASS (k=4 → 4 Aufrufe, 0.5; k=1 → identische Referenz) |
| **R-009** | `typing:eval --samples k` (k ≥ 2) schreibt `typing-<version>-sc<k>.md/.json`; Markdown hat den Abschnitt `## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=<k>)` mit AUROC und Routing je Achse bei 0,6/0,8/1,0, Akt-Metadaten-Achsen markiert; JSON hat `the597 = {k, goldenSha256, thresholds, axes}` und die Fallzeilen `cases[]` (caseId, source, gold, predicted, confidence); `main()` lädt `.env` selbst, das Modul hat beim Import keinen Seiteneffekt | Task 6 | `packages/server/src/evals/runTypingEval.ts` | Test `renderThe597Section`; Task 7 Step 3 | PASS | S-024/S-025/S-026/S-026b/S-026c PASS (45a6140, 77d7b44, 5b576dc, c53373d) |
| **R-010** | Der Messlauf gv3 mit k = 5 liegt committet vor unter `docs/evals/the597-typing-gv3-sc5.md/.json` (der Reports-Ordner ist gitignored); `the597.goldenSha256` ist der SHA-256 der Golden-Datei; `report.total` = 70; `samples` = 5; `cases` hat 70 Einträge (AC-1 Reproduzierbarkeit) | Task 7 | `docs/evals/the597-typing-gv3-sc5.md`, `.json` | `shasum -a 256 packages/server/src/evals/golden/typing.gv3.json` vs JSON | PASS | S-022/S-022b/S-023 PASS; `docs/evals/the597-typing-gv3-sc5.json` (Lauf 2, c410ee7), goldenSha256 af57f9f5…91b11, 70 Fälle, k=5 |
| **R-011** | Die Instrument-Kontrolle ist ausgewertet: AUROC je Inhalts-Achse (obligationKind, partyRole, provisionKind) steht im Register Abschnitt D mit dem Verdikt **MESSBAR** oder **NICHT MESSBAR** (Prämisse Stufe 3) | Task 8 | `docs/evals/the597-fehlerfall-register.md` | Zahlen im Register = Zahlen im JSON | PASS | S-027/S-028 PASS; Verdikt MESSBAR — AUROC obligationKind 0,656 · partyRole 0,733 · provisionKind 0,637 (Lauf 1: 0,667 · 0,591 · 0,668) |
| **R-012** | Die Routing-Zahlen je Inhalts-Achse bei 0,6/0,8/1,0 stehen im Register Abschnitt D (Input für die Kill-Schwelle, AC-2) — **ohne** Go/No-Go | Task 8 | wie R-011 | Sichtprüfung; kein Verdikt-Satz | PASS | S-029/S-030 PASS; Routing-Tabelle, Prüf-Last und Lesart beider Läufe in Abschnitt D (964cf9b, d8a3642, 8215bae); kein Go/No-Go |
| **R-013** | AC-4: Befund „Feature Oracle Kalibrierung" (Daily 05.04.) steht im Register Abschnitt B mit „wiederverwendbar: nein" und Begründung (Prompt-Tuning, kein Gold) | Task 1 | Register Abschnitt B | Sichtprüfung | PASS | S-004 PASS (Abschnitt B: Prompt-Tuning, kein Gold, „wiederverwendbar: nein") |
| **NF-001** | Alle neuen Tests laufen ohne `ANTHROPIC_API_KEY`, ohne Datenbank, ohne Netz | Tasks 2, 3, 5, 6 | Testdateien | `env -u ANTHROPIC_API_KEY npx jest …` | PASS | S-026d/S-033 PASS: 39 Tests ohne `ANTHROPIC_API_KEY`, Modul-Import injiziert keinen Key |
| **NF-002** | Basislinie der Suiten `typingMetrics`, `runTypingEval`, `evalCalibration` bleibt grün; Testzahl über die drei = Basislinie + 12 (typingMetrics 12→13, runTypingEval 5→16, evalCalibration 13); die neue Suite `the597Routing` hat 10 Tests; `npx tsc --noEmit -p .` sauber | Vorbereitung; Task 9 Step 1 | — | `npx jest` der vier Suiten + `tsc` | PASS | S-034 PASS; Abschluss-Review: 5 Suiten / 59 Tests grün, `tsc --noEmit` sauber |
| **NF-003** | Build grün | Task 9 Step 1 | — | `npm run build -w @thearchitect/server` | PASS | S-035 PASS (`npm run build -w @thearchitect/server` EXIT=0) |
| **C-001** | Kein frozen Golden wird verändert | Vorbereitung; Task 9 Step 2 | — | `git diff origin/master --stat -- packages/server/src/evals/golden/` leer | PASS | S-036 PASS (`git diff origin/master --stat -- …/golden/` leer) |
| **C-002** | Branch und Commit-Titel tragen THE-597, nie THE-604 (Parent schließt von Hand) | Vorbereitung; Task 9 Step 5 | — | `git log --format=%s origin/master..HEAD` enthält kein `THE-604` | PASS | S-037 PASS (Branch `feat/the-597-retro-gate`, 19 Commits ohne THE-604) |
| **C-003** | Eigener Worktree mit eigenen `node_modules` | Vorbereitung | — | `git worktree list` zeigt `javis-the597`; `ls javis-the597/node_modules` nicht leer | PASS | S-038 PASS (`javis-the597`, eigene node_modules) |
| **C-004** | Kein Implementierer liest `docs/superpowers/pruefszenarien/`; der blinde Prüfer führt den ganzen Katalog aus | Vorbereitung; Task 9 Step 3 | — | Prüfer-Report liegt vor | PASS | Frischer Blindprüfer 20.09., HEAD c53373d: 45/45 PASS. Erster Durchlauf 36/45 — 9 Szenarien durch Autorenfehler im Katalog (ts-node strict, unselektiver grep-Anker) nicht ausführbar; Katalog in 8215bae korrigiert, zweiter Durchlauf vollständig |
| **C-005** | Slice-1-Artefakte enthalten keinen Go/No-Go-Entscheid; die Kill-Schwelle wird nur zitiert | Task 8 | Register, Report | kein Satz beginnt mit `**Go` / `**No-Go` | PASS | S-029 PASS; Abschluss-Review bestätigt: kein Go/No-Go in Register, Report oder Kommentaren |

## Coverage Summary

- **Total Requirements:** 21 (13 × R, 3 × NF, 5 × C)
- **Verified (PASS):** 21
- **Failed (FAIL):** 0
- **Pending:** 0
- **Coverage:** 100 %

## Abnahme-Hinweis

Dieser Plan liefert das **Instrument** und die **Zahlen** für Schicht 1. Ob eine Schicht gebaut wird (Kill-Schwelle ≥ 50 % Recall bei ≤ 10 % Fehlalarm), entscheidet Slice 3 im Messbericht — nicht diese RVTM. Fällt die Instrument-Kontrolle (AUROC ≤ 0,6 auf allen Inhalts-Achsen), ist R-011 mit dem Verdikt NICHT MESSBAR **erfüllt**, nicht gescheitert: der Befund gilt dem Instrument, nicht der Schicht.

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-09-20 | Initial RVTM created | R-001..R-013, NF-001..NF-003, C-001..C-005 | Plan phase |
| 2026-09-20 | Ausführung, Code-Review Task 5: Mehrheitsschwelle für `partyRoleObserved` (kein Beobachtungs-Rauschen ×k), Sentinel `na` durch `null`-Schlüssel ersetzt — Verhalten der Achsen unverändert | R-007 | Execution |
| 2026-09-20 | Review-Loop: Evidenz nach `docs/evals/` (Reports-Ordner gitignored), Offline-Ausgang deterministisch, Tie-Break Enthaltung zuerst, Fallzeilen im JSON, dotenv | R-001, R-006, R-007, R-009, R-010, NF-002 | Plan phase |
| 2026-09-20 | Abnahme: Blindprüfung 45/45 (HEAD c53373d), alle 21 Zeilen PASS mit Evidenz | alle | Execution |
