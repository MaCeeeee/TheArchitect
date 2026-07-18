# RVTM — UC-LAW-002 Slice-2b (UI + Evals)

**Plan:** docs/superpowers/plans/2026-07-18-uc-law-002-slice2b.md
**Parent:** THE-459 · **REQs:** THE-464 (.5 UI), THE-465 (.6 Evals inkl. AC-7/AC-8 Owner-Scope 2026-07-18)
**Stand:** Implementierung abgeschlossen (Chunks 1-5, Tasks 1-7 inkl. aller vier Review-Fixes). Golden-Set = Claude-Entwurf, `frozen:false` bis Owner-Abnahme. Precompute (Task 6 Script) NICHT ausgeführt — kein Netz in dieser Session; `eval:discovery --offline` verifiziert dadurch nur den Fail-Fast-Pfad, nicht einen vollständigen Baseline-Report (Controller-Schritt laut Plan-Abschluss).

| # | Requirement (AC) | Quelle | Plan-Task | Verifikation | Status |
|---|---|---|---|---|---|
| R1 | 464 AC-1: „Discover from corpus"-Button + Kosten-Hinweis; disabled+Erklärung ohne Provider-Key/Korpus; unsichtbar ohne Flag | THE-464 | T1+T3 | Route-Test (`discovery`-Feld) + Component-Tests (Gating) | Done |
| R2 | 464 AC-2: Provenance-Badges `rules|corpus|both`; `auto`-Status sichtbar bis Entscheidung | THE-464 | T3 | Component-Tests (Badges) | Done |
| R3 | 464 AC-3: Confirm/Reject je Korpus-Befund; rejected verschwindet, einsehbar via „show rejected" | THE-464 | T1 (findings-Route) + T3 | Component-Tests (Flows) + Route-Test | Done |
| R4 | 464 AC-4: Evidenz-Drilldown — Top-§§ (Titel+Nr) UND referenzierte Elemente, konsistent zum LAW-001-Drilldown | THE-464 | T3 | Component-Test (Drilldown) | Done |
| R5 | 464 AC-5: Add-to-pipeline für confirmed Korpus-Befunde (workId-Mechanik) | THE-464 | T3 | bestehende addToPipeline-Mechanik + Component-Test | Done |
| R6 | 464 AC-6: Deckungs-Zeile (Stage A N · Stage B M · Korpus-Stand); Disclaimer permanent | THE-464 | T3 | Component-Test (coverage) | Done |
| R7 | 464 AC-7: Component-Tests Button-Gating/Badges/Confirm-Reject/Loading/Error/Empty | THE-464 | T3 | vitest-Suite (15 Tests, `ApplicabilityCheck.discover.test.tsx`) | Done |
| R7a | UI-Adressierung: `corpusVersionHash` im `corpus`-Block (confirm/reject-Body) | Plan T3a | T3a | Merge-Test-Assertion | Done |
| R7b | Review-Fix 1: corpus-only bekommt `workId` (`deriveNormWorkId`) + echtes `inPipeline` via World-State — sonst AC-5 unimplementierbar | Plan-Review | T3a | Merge-Tests (world) + Component-Test (confirmed ⇒ Add-Button) | Done |
| R7c | Review-Fix 2: Reject-Update unterscheidet `both` (nur corpus-Block weg, Stage-A bleibt) vs. `corpus` (Assessment weg) | Plan-Review | T3 | Component-Tests (beide Varianten) | Done |
| R7d | Review-Fix 4: persistierte confirmed/auto-Findings sind beim normalen `GET /applicability` sichtbar (billiger Mongo-Merge, kein LLM/Retrieval; kein stale-Flag dort — dokumentiert) | Plan-Review | T1 | Route-Test (`norms.applicability.discovery.route.test.ts`) | Done |
| R7e | Review-Fix 3: Runner-Fail-Fast bei fehlenden Vektoren („run eval:discovery:build first") statt NaN-Scores | Plan-Review | T7 | Runner-Test (Guard) + realer `npm run eval:discovery -- --offline`-Lauf gegen die geshippten (vektorlosen) Fixtures | Done |
| R8 | 465 AC-1: Golden-Set ≥10 Architektur-Fixtures inkl. erwarteter Nicht-Treffer (Hard Negatives) | THE-465 | T5 | `discoveryGolden.test.ts` + 12-Case-Set | Done |
| R9 | 465 AC-2: Metriken jenseits Accuracy — P/R je Gesetz, Judge-Kalibrierung (ECE/Bands), FP/FN getrennt | THE-465 | T7 | Runner-Tests + Report | Done |
| R10 | 465 AC-3: Determinismus-Tests Profil (.1) + Aggregation (.2) bit-stabil | THE-465 | bestehende Unit-Tests (useCaseProfile/lawDiscovery) + T4-Regression | jest grün (unverändert) | Done |
| R11 | 465 AC-4: Kosten-Regression — LLM-Calls+Tokens protokolliert, Budget-Warnung im Report | THE-465 | T7 | Runner-Test (Zähler); Token-Detail NICHT verfügbar (judgeCandidate gibt keine usage zurück) — nur Call-Count geloggt, dokumentierte Einschränkung | Done (eingeschränkt) |
| R12 | 465 AC-5: DE/EN-Konsistenz — familien-konsistente Ergebnisse (de/en-Fixtures im Korpus) | THE-465 | T5+T7 | Konsistenz-Check im Runner + ai-act-de/-en im Fixture-Korpus | Done |
| R13 | 465 AC-6: Eval reproduzierbar ohne Live-Korpus (Fixture-Korpus + vorberechnete Embeddings im Repo, `--offline`) | THE-465 | T5+T6+T7 | Fail-Fast-Pfad verifiziert; VOLLER `eval:discovery --offline`-Lauf braucht den Controller-Precompute-Schritt (kein Netz in dieser Session) | Blocked auf Controller-Schritt |
| R14 | 465 AC-7 (Owner 2026-07-18): Retrieval-Recall SEPARAT vom Judge; `ruleLessGold`-Familien nur im Korpus (Stage-A-blind) mit eigenem Recall-Ausweis | THE-465 | T5 (ruleLessGold) + T7 (Verlust-Attribution) | Runner-Tests + Report-Spalten | Done |
| R15 | 465 AC-8 (Owner 2026-07-18): offline HyDE-Vergleichslauf — Baseline vs. HyDE-Recall + Δ mit bootstrapCI; NICHT im Prod-Pfad | THE-465 | T6 (--hyde Precompute) + T7 | Runner-Tests + Report; realer Lauf braucht Controller-Precompute mit `--hyde` | Done (Code), Lauf ausstehend |
| R16 | Golden-Governance: `frozen:false` bis Owner-Abnahme; Report trägt PRELIMINARY-Banner | Owner 2026-07-18 | T5+T7 | Loader-Flag + Report-Test | Done |
| R17 | Aggregations-Reuse ohne Verhaltens-Change (Runner nutzt exakt Prod-Aggregation) | Plan T4 | T4 | bestehende lawDiscovery-Tests unverändert grün | Done |
| R18 | TSC strict sauber (shared+server+client), UI-Strings Englisch | Konvention | alle | tsc ×3 + Review | Done |

## Bewusst nicht abgedeckt
HyDE/Übersetzung im Prod-Pfad (Folge-REQ nur bei belegter Recall-Lücke) · THE-432/`provisionKind` (Trigger = `ruleLessGold`-Recall-Befund) · Freitext-Input · Journey-Einbettung.
