# RVTM — UC-LAW-002 Slice-1 (Corpus-Discovery, deterministisch)

**Plan:** docs/superpowers/plans/2026-07-18-uc-law-002-slice1.md
**Parent:** THE-459 (UC-LAW-002) · **REQs:** THE-460 (.1 Profil), THE-461 (.2 Retrieval)
**Scope:** deterministisch, kein LLM. Judge/Merge/UI/Eval = Slice-2.
**Stand:** Implementiert + beide Reviews (Spec ✅, Code-Quality ✅) bestanden. 9 Suites / 69 Tests grün, `tsc --noEmit` sauber. Commits `62558c8`→`976d265`.

| # | Requirement (AC) | Quelle | Plan-Task | Verifikation | Status |
|---|---|---|---|---|---|
| R1 | THE-460 AC-1: `buildUseCaseProfile` liefert strukturiertes Profil (Kontext, Element-Summaries **je Layer**, Signal-Hints, **Wizard/Sensitivity inline**) | THE-460 | Task 2 (+ `loadProjectFacts` additiv um `layer` erweitert) | `useCaseProfile.test.ts` (Struktur, signalHints, Layer-Gruppierung, PII/AI-Marker) | **Passing** |
| R1x | Review-Fix (HIGH): Signal-Feld ist `detected`, nicht `triggered` — sonst signalHints immer leer | Spec-Review | Task 2 | `useCaseProfile.test.ts` (echte Shape gemockt) | **Passing** |
| R2 | THE-460 AC-2: deterministisch + größenbegrenzt, Priorisierung überlebt Kürzung **über Layer-Grenzen** (Zwei-Pass: Auswahl per Priorität, Rendering per Layer) | THE-460 | Task 2 (+ Spec-Fix) | `useCaseProfile.test.ts` (adversarial: PII in späterem Layer überlebt) | **Passing** |
| R3 | THE-460 AC-3: Reuse `loadProjectFacts` — keine 2. Neo4j-Leselogik | THE-460 | Task 2 | Spec-Review bestätigt (nur Import, kein runCypher) | **Passing** |
| R4 | THE-460 AC-4: Profil nur Modell-/Projektdaten, kein Secret-Material | THE-460 | Task 2 | Spec-Review (Felder verifiziert, keine Credentials) | **Passing** |
| R5 | THE-460 AC-5: Unit-Tests Determinismus/Budget/Priorisierung/leeres Modell | THE-460 | Task 2 | `useCaseProfile.test.ts` | **Passing** |
| R6 | THE-461 AC-1: Query-Embedding über bestehende Infra, gleiches Modell (768/mpnet), kein zweiter Stack | THE-461 | Task 3 | `corpusVectorSearch.test.ts` + Env aus elementSimilarity verifiziert | **Passing** |
| R7 | THE-461 AC-2: Top-K über **alle** Korpus-Sources, K konfigurierbar (`LAW_DISCOVERY_TOP_K`, Default 60) | THE-461 | Task 3+5 (+ Spec-Fix) | Code (`CORPUS_COLLECTION`, env-override) + Test | **Passing** |
| R8 | THE-461 AC-3: Aggregation §→Gesetz, Score∈[0,1] **beidseitig geklemmt**, Top-§ als Evidenz | THE-461 | Task 5 | `lawDiscovery.test.ts` (Aggregation + negativer-Score-Clamp-Test) | **Passing** |
| R9 | THE-461 AC-4: Sprach-Duplikate (de/en) zur Familie mergen | THE-461 | Task 5 | `lawDiscovery.test.ts` (Familien-Merge) | **Passing** |
| R10 | THE-461 AC-5: Graceful degradation — Korpus/Vektor-Backend leer/unkonfiguriert ⇒ leere Liste + Meldung, kein Fehler | THE-461 | Task 3+5 | `lawDiscovery.test.ts` (degraded) + `isCorpusVectorSearchConfigured` | **Passing** |
| R11 | THE-461 AC-6: Tests mit Fixture-Embeddings (Aggregation, Normalisierung, Familien-Merge, Empty) | THE-461 | Task 3+5 | `corpusVectorSearch.test.ts` + `lawDiscovery.test.ts` | **Passing** |
| R12 | Governance-Kontrakt (THE-459): Retrieval MUSS governt sein (Eligibility/Stale-Drop/Pin) — kein ungoverneter Lesepfad | THE-459 | Task 4 | `governedCorpusSearch.test.ts` (stale-drop, unverifiable, pin) + governedRetrieval-Regression | **Passing** |
| R13 | Weg-A-Naht: `provisionKind` als dormanter, dokumentierter Parameter (→ THE-432) | Owner 2026-07-18 | Task 4 | `governedCorpusSearch.test.ts` (dormant-Test) | **Passing** |
| R14 | Slice-1-API: flag-gated `POST /:projectId/norms/discover`, deterministische Kandidaten | Owner 2026-07-18 | Task 6 | `norms.discover.route.test.ts` (Flag an/aus) | **Passing** |
| R15 | TSC strict sauber (Server) | Konvention | Task 6 | `tsc --noEmit` (exit 0) | **Passing** |

## Bewusst nicht abgedeckt (Slice-2 / später)
- THE-462 (LLM-Judge), THE-463 (Hybrid-Merge/Persistenz/Lifecycle), THE-464 (UI), THE-465 (Golden-Set-Evals).
- THE-432 (ONTO Term-Typing) — Voraussetzung, damit `provisionKind` (R13) von dormant → aktiv wird; Trigger = Eval-Gate .6 zeigt Retrieval-Präzision als Bremse.
