# RVTM — UC-LAW-002 Slice-2a (LLM-Judge + Hybrid-Merge/Lifecycle, Backend)

**Plan:** docs/superpowers/plans/2026-07-18-uc-law-002-slice2a.md
**Parent:** THE-459 · **REQs:** THE-462 (.3 Judge), THE-463 (.4 Merge/Lifecycle)
**Scope:** Backend. UI (THE-464) + Evals (THE-465) = Slice-2b.
**Stand:** Implementiert + beide Reviews bestanden (Spec: 4 Fixes · Quality: 3 Fixes + Minor). 13 Suiten / 104 Tests grün, `tsc --noEmit` sauber. Commits `73b2a1a`→`a3ee91e` (11).

| # | Requirement (AC) | Quelle | Plan-Task | Verifikation | Status |
|---|---|---|---|---|---|
| R1 | THE-462 AC-1: Judge-Input Profil+TopParagraphen; Output-Schema `{applies,confidence,reasoning≤500,elementIds,keyParagraphs}` validiert, Retry bei Schema-Bruch | THE-462 | Task 3+4 | `lawJudge.service.test.ts` (Schema, Retry via Tool-Use) | **Passing** |
| R2 | THE-462 AC-2: Kosten-Disziplin — nur über Schwelle + max Kandidatenzahl (konfigurierbar); Cache je (profileHash,family,corpusVersionHash) ⇒ Re-Run 0 Calls | THE-462 | Task 4+8 | `lawJudge.service.test.ts` (Cache-Test) + `lawDiscovery` (Gating) | **Passing** |
| R3 | THE-462 AC-3: jeder Judge-Call getraced (AiTrace: Modell/Tokens/Kosten) | THE-462 | Task 2+4 | `lawJudge.service.test.ts` (Trace-Mock) + AiTrace op | **Passing** |
| R4 | THE-462 AC-4: kein Auto-Grün — Judge-Ergebnis immer `auto` | THE-462 | Task 6 | `lawDiscoveryFinding.service.test.ts` (persist=auto) | **Passing** |
| R5 | THE-462 AC-5: Anti-Halluzination — keine Gesetze/Elemente außerhalb der geschlossenen Menge; reasoning verweist auf §/Elemente | THE-462 | Task 3+4 | `lawJudge.service.test.ts` (GHOST-family/-elementId verworfen) | **Passing** |
| R6 | THE-462 AC-6: Tests mit gemocktem Provider (Schema, Gating, Cache, Trace) | THE-462 | Task 4 | `lawJudge.service.test.ts` | **Passing** |
| R7 | THE-463 AC-1: Kontrakt `provenance: rules\|corpus\|both`; bei `both` det. Score UND Judge-Confidence getrennt (nicht verrechnet) | THE-463 | Task 1+7 | `lawApplicabilityMerge.test.ts` (both: beide Achsen sichtbar) | **Passing** |
| R8 | THE-463 AC-2: deterministische Urteile autoritativ — Stage B ergänzt, senkt/überschreibt nie | THE-463 | Task 7 | `lawApplicabilityMerge.test.ts` (non-override) | **Passing** |
| R9 | THE-463 AC-3: Lifecycle `auto→confirmed\|rejected` + Dedup `(projectId,family,corpusVersionHash)`; rejected nicht als neu re-erscheinen | THE-463 | Task 5+6 | `lawDiscoveryFinding.*` (rejected bleibt bei Re-Run) | **Passing** |
| R10 | THE-463 AC-4: UC-LAW-001 unverändert (ohne Keys/Korpus identisch) — Regression grün | THE-463 | Task 1+9 | `regulationApplicability.test.ts` grün + additive optionale Felder | **Passing** |
| R11 | THE-463 AC-5: Report weist Deckung ehrlich aus (Stage A: N · Stage B: M · Korpus-Stand X) | THE-463 | Task 7 | `lawApplicabilityMerge.test.ts` (`coverage`) | **Passing** |
| R12 | THE-463 AC-6: Tests Merge-Matrix (rules/corpus/both), Non-Override, Lifecycle-Dedup, LAW-001-Regression | THE-463 | Task 5-7 | Test-Suiten oben | **Passing** |
| R13 | Flag-Gate: `/discover`(+judge) & `/discover/{confirm,reject}` nur bei `LAW_DISCOVERY_ENABLED`; sonst 404 | Owner | Task 9 | `norms.discover.judge.route.test.ts` | **Passing** |
| R14 | Governance: Judge nutzt governten Lesepfad (Kandidaten kommen aus `governedCorpusSearch` via Slice-1) | THE-459 | Task 8 | Reuse `discoverCandidates` | **Passing** |
| R15 | Graceful degradation: kein Provider-Key/Korpus ⇒ reiner Stage-A-Report, kein Fehler | THE-462/463 | Task 8 | `lawDiscovery` (degraded-Pfad) | **Passing** |
| R16 | TSC strict sauber (Server + shared) | Konvention | Task 9 | `tsc --noEmit` | **Passing** |

## Bewusst nicht abgedeckt (Slice-2b)
THE-464 (UI/Provenance-Badges/Confirm-Reject-Buttons), THE-465 (Golden-Set + Eval-Runner + Kalibrierung), Client-`normsAPI.discover`. THE-432 (`provisionKind` dormant).

## Review-Fixes (nachweislich getestet)
- Spec: negative Urteile persistiert (Reuse, AC-2 über Redeploys) · `/discover`-Audit-Entry · Zod-Bounds als Retry-Trigger · `corpus.stale`-Flag für überholte Evidence-Sets.
- Quality: deterministische Familien-Auswahl im Merge (current-Hash gewinnt, keine corpus-only-Duplikate, coverage=Familien) · E11000-Race-Fallback im Upsert · Judge-Cache FIFO-Cap (500) · `0`-Env-Overrides respektiert (MAX_JUDGE=0 = Kill-Switch).
- Akzeptiert ohne Fix: lawJudge↔complianceJudge Retry-Loop-Spiegelung (Rule-of-Three), Prompt-Injection-Risikohaltung wie complianceJudge (keine Regression).
