# RVTM: THE-597 Retrospektives Gate — Slice 0 + 1

**Spec:** Linear [THE-597](https://linear.app/thearchitect/issue/THE-597) (AC-1..AC-4) · Loop-Kontrakt Strang 2 als Kommentar an [THE-604](https://linear.app/thearchitect/issue/THE-604) (20.09.2026) · Pre-Flight-Kommentar an THE-597 (20.09.2026, Stufen 1–5)
**Plan:** `docs/superpowers/plans/2026-09-20-the597-retro-gate-slice01.md`
**Prüfszenarien (versiegelt, Pfad):** `docs/superpowers/pruefszenarien/2026-09-20-the597-retro-gate-slice01-pruefszenarien.md`
**Created:** 2026-09-20
**Last Updated:** 2026-09-20

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| **R-001** | Ein gemeinsames Fehlerfall-Register existiert mit ≥ 9 Fällen; jede Zeile trägt Quelle (Datei:Zeile oder ein committetes Dokument — der zitierte gv3-Lauf liegt als Kopie unter `docs/evals/the597-input-typing-gv3.md`), Facette, „Ausgang bekannt" und erwartete Fang-Schicht; der Kopf benennt die Umbenennung SHACL v0 → Zod-Shape-Set v0 mit Quelle (Voraussetzung AC-2) | Task 1 | `docs/evals/the597-fehlerfall-register.md`, `docs/evals/the597-input-typing-gv3.md` | `grep -c '^| F-'` ≥ 9; Stichprobe 3 Zeilen mit Pfad | PENDING | — |
| **R-002** | `aurocFromSamples`: perfekte Trennung → 1, invertiert → 0, alle gleich → 0,5, eine Klasse fehlt oder leer → `null` (Instrument-Kontrolle) | Task 2 | `packages/server/src/evals/metrics.ts`, `…/__tests__/the597Routing.test.ts` | `npx jest src/__tests__/the597Routing.test.ts` | PENDING | — |
| **R-003** | `thresholdRoutingStats`: geroutet ⇔ `confidence < threshold`; Recall = gefangene falsche / falsche, Fehlalarm = geroutete richtige / richtige, nie NaN; Default-Schwellen 0,6 / 0,8 / 1,0 | Task 2 | wie R-002 | wie R-002 | PENDING | — |
| **R-004** | `axisCalibrationSamples` liefert je Fall mit Gold **und** Confidence genau ein Sample (`null`==`null` korrekt); `axisCalibration` verhält sich unverändert (ohne Confidence `null`) | Task 3 | `packages/server/src/evals/typingMetrics.ts`, `…/__tests__/typingMetrics.test.ts` | `npx jest src/__tests__/typingMetrics.test.ts` (Basislinie + 2) | PENDING | — |
| **R-005** | Der Mapping-Report trägt den Abschnitt `## ECE + Schwellen-Routing (THE-597)` mit Mindest-N-Warnung; das JSON die Keys `calibration` und `routing` | Task 4 | `packages/server/src/evals/runMappingEval.ts` | `npx tsc --noEmit -p .`; Code-Review der Einfügestelle | PENDING | — |
| **R-006** | Der Offline-Lauf scheitert deterministisch (kein Cache-Bucket für Golden-Version `v1-draft`, Cache liegt unter `v1-seed`), der Fehler ist reproduziert und die Register-Zeile „Norm→Element-Mapping / Offline messbar" nennt genau diesen Grund; kein Live-Lauf | Task 4 Step 5–6 | Register Abschnitt C | Konsolenausgabe `--offline: no valid cache for case "dsgvo-art30-vvt"`; Register-Zeile enthält `kein Cache-Bucket` | PENDING | — |
| **R-007** | `aggregateVotes`: Mehrheit je Achse; Konfidenz = Stimmen des Gewinners / k; `null` ist eine Stimme; offene Läufe drücken die Konfidenz; in allen Läufen offen → Achse offen ohne Konfidenz; Tie deterministisch (`null` = Enthaltung gewinnt vor jeder id, sonst Byte-Reihenfolge); `partyRoleObserved` nur bei strikter Mehrheit über alle k Läufe (Review-Entscheid 20.09.); leer → `{ labels: {} }` | Task 5 | `packages/server/src/evals/runTypingEval.ts`, `…/__tests__/runTypingEval.test.ts` | `npx jest src/__tests__/runTypingEval.test.ts` | PENDING | — |
| **R-008** | `withSelfConsistency(inner, k)` ruft `inner` je Fall genau k-mal und aggregiert; k < 2 gibt `inner` selbst zurück | Task 5 | wie R-007 | wie R-007 | PENDING | — |
| **R-009** | `typing:eval --samples k` (k ≥ 2) schreibt `typing-<version>-sc<k>.md/.json`; Markdown hat den Abschnitt `## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=<k>)` mit AUROC und Routing je Achse bei 0,6/0,8/1,0, Akt-Metadaten-Achsen markiert; JSON hat `the597 = {k, goldenSha256, thresholds, axes}` und die Fallzeilen `cases[]` (caseId, source, gold, predicted, confidence); `main()` lädt `.env` selbst, das Modul hat beim Import keinen Seiteneffekt | Task 6 | `packages/server/src/evals/runTypingEval.ts` | Test `renderThe597Section`; Task 7 Step 3 | PENDING | — |
| **R-010** | Der Messlauf gv3 mit k = 5 liegt committet vor unter `docs/evals/the597-typing-gv3-sc5.md/.json` (der Reports-Ordner ist gitignored); `the597.goldenSha256` ist der SHA-256 der Golden-Datei; `report.total` = 70; `samples` = 5; `cases` hat 70 Einträge (AC-1 Reproduzierbarkeit) | Task 7 | `docs/evals/the597-typing-gv3-sc5.md`, `.json` | `shasum -a 256 packages/server/src/evals/golden/typing.gv3.json` vs JSON | PENDING | — |
| **R-011** | Die Instrument-Kontrolle ist ausgewertet: AUROC je Inhalts-Achse (obligationKind, partyRole, provisionKind) steht im Register Abschnitt D mit dem Verdikt **MESSBAR** oder **NICHT MESSBAR** (Prämisse Stufe 3) | Task 8 | `docs/evals/the597-fehlerfall-register.md` | Zahlen im Register = Zahlen im JSON | PENDING | — |
| **R-012** | Die Routing-Zahlen je Inhalts-Achse bei 0,6/0,8/1,0 stehen im Register Abschnitt D (Input für die Kill-Schwelle, AC-2) — **ohne** Go/No-Go | Task 8 | wie R-011 | Sichtprüfung; kein Verdikt-Satz | PENDING | — |
| **R-013** | AC-4: Befund „Feature Oracle Kalibrierung" (Daily 05.04.) steht im Register Abschnitt B mit „wiederverwendbar: nein" und Begründung (Prompt-Tuning, kein Gold) | Task 1 | Register Abschnitt B | Sichtprüfung | PENDING | — |
| **NF-001** | Alle neuen Tests laufen ohne `ANTHROPIC_API_KEY`, ohne Datenbank, ohne Netz | Tasks 2, 3, 5, 6 | Testdateien | `env -u ANTHROPIC_API_KEY npx jest …` | PENDING | — |
| **NF-002** | Basislinie der Suiten `typingMetrics`, `runTypingEval`, `evalCalibration` bleibt grün; Testzahl über die drei = Basislinie + 12 (typingMetrics 12→13, runTypingEval 5→16, evalCalibration 13); die neue Suite `the597Routing` hat 10 Tests; `npx tsc --noEmit -p .` sauber | Vorbereitung; Task 9 Step 1 | — | `npx jest` der vier Suiten + `tsc` | PENDING | — |
| **NF-003** | Build grün | Task 9 Step 1 | — | `npm run build -w @thearchitect/server` | PENDING | — |
| **C-001** | Kein frozen Golden wird verändert | Vorbereitung; Task 9 Step 2 | — | `git diff origin/master --stat -- packages/server/src/evals/golden/` leer | PENDING | — |
| **C-002** | Branch und Commit-Titel tragen THE-597, nie THE-604 (Parent schließt von Hand) | Vorbereitung; Task 9 Step 5 | — | `git log --format=%s origin/master..HEAD` enthält kein `THE-604` | PENDING | — |
| **C-003** | Eigener Worktree mit eigenen `node_modules` | Vorbereitung | — | `git worktree list` zeigt `javis-the597`; `ls javis-the597/node_modules` nicht leer | PENDING | — |
| **C-004** | Kein Implementierer liest `docs/superpowers/pruefszenarien/`; der blinde Prüfer führt den ganzen Katalog aus | Vorbereitung; Task 9 Step 3 | — | Prüfer-Report liegt vor | PENDING | — |
| **C-005** | Slice-1-Artefakte enthalten keinen Go/No-Go-Entscheid; die Kill-Schwelle wird nur zitiert | Task 8 | Register, Report | kein Satz beginnt mit `**Go` / `**No-Go` | PENDING | — |

## Coverage Summary

- **Total Requirements:** 21 (13 × R, 3 × NF, 5 × C)
- **Verified (PASS):** 0
- **Failed (FAIL):** 0
- **Pending:** 21
- **Coverage:** 0 %

## Abnahme-Hinweis

Dieser Plan liefert das **Instrument** und die **Zahlen** für Schicht 1. Ob eine Schicht gebaut wird (Kill-Schwelle ≥ 50 % Recall bei ≤ 10 % Fehlalarm), entscheidet Slice 3 im Messbericht — nicht diese RVTM. Fällt die Instrument-Kontrolle (AUROC ≤ 0,6 auf allen Inhalts-Achsen), ist R-011 mit dem Verdikt NICHT MESSBAR **erfüllt**, nicht gescheitert: der Befund gilt dem Instrument, nicht der Schicht.

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-09-20 | Initial RVTM created | R-001..R-013, NF-001..NF-003, C-001..C-005 | Plan phase |
| 2026-09-20 | Ausführung, Code-Review Task 5: Mehrheitsschwelle für `partyRoleObserved` (kein Beobachtungs-Rauschen ×k), Sentinel `na` durch `null`-Schlüssel ersetzt — Verhalten der Achsen unverändert | R-007 | Execution |
| 2026-09-20 | Review-Loop: Evidenz nach `docs/evals/` (Reports-Ordner gitignored), Offline-Ausgang deterministisch, Tie-Break Enthaltung zuerst, Fallzeilen im JSON, dotenv | R-001, R-006, R-007, R-009, R-010, NF-002 | Plan phase |
