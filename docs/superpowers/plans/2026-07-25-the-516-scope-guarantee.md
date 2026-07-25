# Discovery Scope-Guarantee (THE-516) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** ADR-0006 umsetzen — je gefundener Gesetzes-Familie ≤2 Geltungsbereichs-§§ garantiert ins Judge-Beweismaterial, flag-gated dark, weich degradierend mit Sichtbarkeit + Alert.

**ADR (bindend):** `docs/adr/0006-discovery-scope-guarantee.md` (E1–E7) · **Ticket:** THE-516 · **Branch:** `mganzmanninfo/discovery-scope-prio`

**Harte Leitplanken über alle Tasks:**
- Injektion NUR in `candidate.topHits` (Judge-Beweismaterial + evidenceSetHash) — NIE in die Score-Aggregation (`aggregateHitsToCandidates` läuft VOR der Injektion und bleibt unangetastet; injizierte Einträge dürfen Familien-Scores nicht verfälschen).
- Flag aus ⇒ Verhalten byte-identisch zu heute (AC-3).
- Konsumregeln E3 sind nicht verhandelbar: versionHash-Match hart, `rejected` nie, `||` statt `??`.

## Task 1: Purer Kern `scopeGuarantee.service.ts`

**Files:** Create `packages/server/src/services/scopeGuarantee.service.ts` · Test `packages/server/src/__tests__/scopeGuarantee.test.ts`

Reine Funktionen (kein I/O):
- `selectScopeProvisions(docs, opts)` — aus Korpus-Docs einer Familie die konsumierbaren scope-§§ wählen: E3 (typing.provisionKind='scope-applicability', versionHash-Match, status≠rejected) + E2 (max 2, niedrigste Artikelnummer deterministisch — Nummern-Parse aus paragraphNumber, „Art. 2" < „Art. 10"; Sprachwahl: bevorzugt die Sprache mit den meisten vorhandenen Familien-topHits, Fallback deterministisch de).
- `injectScopeHits(candidate, scopeDocs)` — Dedupe gegen vorhandene topHits (regulationKey), Markierung `origin: 'scope-guarantee'` an injizierten Einträgen (CorpusHit additiv erweitern — Typ liegt bei governedRetrieval; Bestands-Hits implizit `retrieval`), Score der injizierten Einträge neutral (0 bzw. undefined — NICHT in Familien-Score einrechnen; der ist zu diesem Zeitpunkt bereits fix).
- `guaranteeStateFor(candidates, injectionResults)` → `'applied' | 'partial' | 'unavailable'` (partial = mind. eine Familie ohne konsumierbare scope-§§; unavailable = Lookup-Fehler).

TDD: E3-Regeln einzeln (stale Anker ⇒ raus; rejected ⇒ raus; suggested+confirmed ⇒ rein), E2 (Kappung, Artikelnummern-Ordnung inkl. zweistelliger Nummern, Sprachwahl, Dedupe), Determinismus, Score-Neutralität.

- [ ] Steps: Tests rot → implementieren → `tsc` + Jest grün → Commit `feat(THE-516): scope-guarantee pure core (E2/E3)`

## Task 2: Verdrahtung in der Discovery

**Files:** Modify `packages/server/src/services/lawDiscovery.service.ts` (+ ggf. `governedRetrieval.service.ts` CorpusHit-Typ additiv, `contextTrace.service.ts` ConsumedRef additiv) · Tests erweitern (`lawDiscovery`-Suiten)

- Flag `LAW_DISCOVERY_SCOPE_GUARANTEE==='true'` (Muster `hydeEnabled()`, `||` nie `??`).
- Nach `aggregateHitsToCandidates`, vor der Judge-Schleife: je Familie scope-§§ aus dem Korpus lesen (corpusClient, Quellen der Familie = `candidate.sources`; Query auf typing.provisionKind + E3-Felder; **ein** Mongo-Read für alle Familien, nicht N) → Task-1-Kern anwenden.
- **Weich (E5):** Lookup-Fehler ⇒ Injektion überspringen, `degraded`-Log, `scopeGuarantee:'unavailable'`; dann **Sentry-Alert**: bestehende Sentry-Anbindung nutzen (siehe `src/config/sentry.ts` + Init in index/instrument — erst LESEN, wie captureException/captureMessage hier läuft), `level:'error'`, Tags `component:'law-discovery-scope-guarantee'`. `partial` ⇒ nur Log.
- Sichtbarkeits-Feld `scopeGuarantee` in `DiscoveryResult` (additiv, optional — Flag aus ⇒ Feld fehlt ⇒ byte-identisch).
- ContextTrace: injizierte §§ erscheinen in `consumed` mit additivem optionalem Feld `origin:'scope-guarantee'`; `scopeGuarantee`-Zustand in den Trace-Metadaten. ConsumedRef-Schema additiv (bestehende Traces bleiben schema-gültig).
- evidenceSetHash ändert sich automatisch (E4, gewollt) — Test: mit Flag ≠ ohne Flag; ohne Flag identisch zu HEAD.
- AC-6: Judge-Prompt-Wachstum ≤2 §§/Familie im Code-Kommentar dokumentiert.

- [ ] Steps: Tests rot (Flag aus = unverändert; Flag an = injiziert+markiert+Feld; Lookup-Fehler = weich+unavailable) → implementieren → gezielte Jest-Pattern (`lawDiscovery|contextTrace|scopeGuarantee`) grün → Commit `feat(THE-516): wire scope guarantee into discovery (flag-gated, soft-degrade + alert)`

## Task 3: Offline-Beweis — CRA-Blindfleck-Fixture im Eval-Harness

**Files:** Modify `packages/server/src/evals/runDiscoveryEval.ts` / `discoveryGolden.ts` (Seam) · Fixtures `src/evals/golden/discovery.*` additiv · Tests

- Injektions-Seam: der Harness übergibt eine Fixture-scope-Lookup-Funktion (kein Mongo im Eval — Muster der bestehenden Injektionspunkte dort).
- Fixture-Fall „CRA-Blindfleck": Familie, deren Fixture-topHits nur Durchführungs-§§ sind + scope-§ mit typing im Fixture-Korpus. Assertion AC-1: ohne Garantie judged „gilt nicht", mit Garantie „gilt" (Judge im Eval ist stubbar/deterministisch — vorhandenes Harness-Muster nutzen). Assertion AC-2: alle übrigen Golden-Fälle unverändert (kein „gilt" verschwindet).
- [ ] Steps: rot → grün → Commit `test(THE-516): CRA blindspot fixture proves scope guarantee (AC-1/AC-2)`

## Task 4 (Controller/Ops): Nachweis + PR

- [ ] Offline-Eval-Lauf, Vergleich Flag an/aus dokumentieren
- [ ] tsc alle Pakete, gezielte Suiten, Final-Review über den Branch
- [ ] PR gegen master; Prod-Dunkel-Test (Flag auf realem Projekt) + AC-5-Alert-Verifikation NACH Merge/Deploy (User-Schritt, im PR dokumentiert)
- [ ] Linear THE-516, Memory

## RVTM (kompakt)

| AC | Task | Verifikation |
|---|---|---|
| AC-1 CRA-Fixture kippt | 3 | Eval-Assertion |
| AC-2 keine Recall-Regression | 3 (+4 prod-dunkel) | Golden unverändert |
| AC-3 E3-Regeln + Flag-aus-Identität | 1, 2 | Units + Identitäts-Test |
| AC-4 Markierung + Sichtbarkeits-Feld | 2 | Units (Trace + Result) |
| AC-5 unavailable-Alert erreicht Register | 2 (+4 real) | Unit (Sentry-Call) + einmal real |
| AC-6 ≤2 §§/Familie | 1 | Unit (Kappung) |
| Leitplanke Score-Neutralität | 1, 2 | Unit: Familien-Score identisch mit/ohne Injektion |
