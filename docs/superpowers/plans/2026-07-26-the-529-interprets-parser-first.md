# THE-529: INTERPRETS Parser-first Implementation Plan (Rev.2)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Rev.2** nach Plan-Review 2026-07-26: (P1) `relationsGolden.ts:68 RelationTypeLabel` muss mit auf `inferred ∥ mechanical` — sonst sind v3/v4/v5 + alle Rater-Dateien + kappa/worksheet/prelabel nach dem Registry-Flip unlesbar. (P1) `regulation.model.ts` (Mongoose strict) muss `evidence.sentence`/`pPath` + `relationScan.detectorVersion` kennen — sonst stilles $set-Drop. (P1) `splitSentences` + Satz-Auswahl leben nur im Server-Eval-Skript und müssen nach shared (evidence.matched ist ein Regex-Schnipsel, KEIN Satz). (P2) Schnitt neu: additive Hebungen zuerst (Task 1, grün), dann EIN atomarer Flip (Task 2, grün) — der alte Schnitt hatte keine grünen Zwischencommits. (P2) rp-4-Bump ⇒ Voll-Re-Scan ausgewiesen. (P3) Testpfade korrigiert.

**Goal:** INTERPRETS wird aus dem LLM-Klassifikationspfad genommen und im Prod-Relations-Batch mechanisch erkannt (`auditInterpretsCandidate`, rp-3-Prüfbaum P0→P1→P2), mit berechneter Richtung und Beleg-Provenance am Suggestion-Dokument; danach v5-Freeze + Baseline-Anpassung.

**Architecture:** Die E7-Registry-Kategorie `derivation` ist der dokumentierte Boundary-Contract zwischen deterministischem Parser-Pfad und LLM-Suggestion-Pfad. Neue dritte Kategorie `'mechanical'` — INTERPRETS fällt damit automatisch aus LLM-Optionsliste (`prompt.ts:34`) und OOV-Filter (`prompt.ts:246`); die BEIDEN Zod-Grenzen (`suggestion.ts:49` Schreibgrenze, `relationsGolden.ts:68` Golden-/Rater-Label) werden auf `inferred ∥ mechanical` erweitert. Im Batch-Loop (`relationsBatch.ts processRelationDocGroup`) läuft pro Kandidat ZUERST der mechanische Detektor; nur Nicht-Treffer gehen ans LLM.

**Tech Stack:** TypeScript · @thearchitect/shared (Ontologie, interpretsAudit, lawPatterns) · packages/compliance-crawler (Prod-Batch) · packages/server (Eval/Golden/Baseline) · Jest. Build-Order: shared → server/crawler (`tsc -b`; Tests für shared-Änderungen laufen im Server-Paket).

**Kontext-Belege (Pre-Flight-Scan + Review 2026-07-26):**
- Registry: `packages/shared/src/ontology/norm-ontology.v1.ts:96` (INTERPRETS, `derivation: 'inferred'`); Guard `isInferredRelation` `norm-ontology.schema.ts:139`; kein `isMechanicalRelation`.
- LLM-Seite: `packages/shared/src/relations/prompt.ts:34` (`INFERRED_RELATION_TYPES`), `:246` (OOV-Filter), INTERPRETS-Regelblock `:138-156` (RULE 5a/5b — wandern in den Detektor).
- Zod-Grenzen: `packages/shared/src/relations/suggestion.ts:49` (Schreibgrenze) + **`packages/server/src/evals/relationsGolden.ts:68`** (`RelationTypeLabel` — Golden/Rater; Konsumenten: relations-kappa `:266,292`, prelabel-relations `:190,199`, relations-worksheet `:37,233`, relations-baseline `:509`, build-relations-golden, Tests relationsGolden/buildRelationsGolden).
- Mongoose (strict — stilles Drop unbekannter Felder, dokumentiert `regulation.model.ts:163-166`): evidence-Sub-Schema `:186-195` (nur matched/articleHints), `relationScanSchema:211` (kein detectorVersion).
- Prod-Batch: `relationsBatch.ts` — `assembleRelationSuggestion:86`, `shouldSkipRelationScan:68-76` (skippt bei `promptVersion`-Gleichheit — **rp-4-Bump ⇒ Voll-Re-Scan, GEWOLLT**: Vehikel, um mechanische INTERPRETS korpusweit zu erzeugen; Kostenrahmen wie THE-433-Batch ~110 LLM-Calls < 1 $), `processRelationDocGroup:253`, Loop `:269-308`; CLI-Projektion `cli/relations-batch.ts:90-93` (ohne `typing`).
- Kandidaten: `relationCandidates.ts:100`; `RelationCandidateDoc:41-64` (target.fullText:46, matched/articleHints:215). **`evidence.matched` = `m[0]` des Law-Regex (lawPatterns.ts:305) — Verweis-Schnipsel, kein Satz. Der Detektor splittet IMMER `citing.fullText` in Sätze.**
- Parser: `interpretsAudit.ts` — `parseBorrowTemplate:169`, `auditInterpretsCandidate:260` (rein). Satz-Split `splitSentences` + Satz-Auswahl-Loop leben NUR in `packages/server/src/scripts/build-interprets-audit.ts:182,257-275` → müssen nach shared. `identsForSource` ebd. `:154-170` → muss nach shared.
- Bestehende Test-Pins, die der Flip dreht: `packages/server/src/__tests__/norm-ontology.test.ts:60` (`isInferredRelation('INTERPRETS')===true`), `prelabelRelations.test.ts:151ff` (INTERPRETS-Regeln im Prompt), Fixtures `relationsBatch.test.ts:168`, `relations-routes.test.ts:63` (Crawler), `corpus-relations.route.test.ts:62` (Server), Golden-Tests `relationsGolden.test.ts`, `buildRelationsGolden.test.ts`. Baseline-Gate `relations-baseline.ts:94`.
- Worksheet-Folge (gewollt, ausweisen): INTERPRETS verschwindet aus der Rater-Optionsliste `relations-worksheet.ts:37` — Rater labeln die mechanische Klasse nicht mehr.

**Leitplanken:**
1. Kein menschlich entschiedenes Label überschreiben — `mergeRelationSuggestions` + `relationWriteFilter` (TOCTOU) gelten unverändert auch für mechanische Kanten (Regressionstest Pflicht).
2. rp-3 bleibt als historischer Stand eingefroren (Hash `a29f19f`). Task 2 bumpt auf **`rp-4`**: INTERPRETS-Block + RULE 5a/5b raus (leben im Detektor), Optionsliste folgt dem Registry. Kommentar: „INTERPRETS → mechanical (THE-529); kein Tuning — Strukturwechsel". **Konsequenz: Voll-Re-Scan beim nächsten Batch (gewollt, s.o.).**
3. v5-Wahrheiten sind adjudiziert (2026-07-26) und werden nicht mehr angefasst; Freeze in Task 5 mit Provenance.
4. Skip-Semantik nach Task 4: ein Scan wird übersprungen, wenn `promptVersion` UND `detectorVersion` UND `versionHash` unverändert sind. Ein Detektor-only-Bump re-scannt (Kandidaten-Loop inkl. LLM für Nicht-INTERPRETS-Kandidaten — akzeptiert, ausgewiesen).

---

## Chunk 1: Fundament

### Task 1: Additive Hebungen (alles bleibt grün)

**Files:**
- Modify: `packages/shared/src/relations/lawPatterns.ts` (`identsForSource` + `splitSentences` + Satz-Auswahl hierher)
- Modify: `packages/server/src/scripts/build-interprets-audit.ts` (importiert beides aus shared statt lokal)
- Modify: `packages/shared/src/relations/suggestion.ts` (evidence + `sentence?`/`pPath?`, additiv)
- Modify: `packages/compliance-crawler/src/models/regulation.model.ts` (evidence-Sub-Schema + sentence/pPath; `relationScanSchema` + `detectorVersion?` — additiv)
- Test: `packages/server/src/__tests__/buildInterpretsAudit.test.ts` (identsForSource-Verhalten byte-identisch), Suggestion-Tests (bestehende Datei per grep `RelationSuggestionSchema`), `packages/compliance-crawler/src/__tests__/` (Mongoose-Silent-Drop-Regression)

- [ ] **Step 1 (failing Tests):** (a) `identsForSource('dsgvo')`/`('standardisation-en')`/`('emoney-de')` aus shared liefert exakt die bisherige Ausgabe (Golden-Vergleich mit dem alten Server-lokalen Ergebnis, vor dem Umzug einfrieren); (b) `splitSentences` aus shared verhält sich auf 3 Beispieltexten identisch zum Server-Original; (c) Suggestion mit `evidence.sentence`/`pPath` parst und round-trippt; ohne die Felder parst wie bisher; (d) Mongoose: ein `$set` einer Suggestion mit `evidence.sentence`/`pPath` und `relationScan.detectorVersion` persistiert die Felder (Silent-Drop-Regression — Muster aus relationSuggestion.test.ts).
- [ ] **Step 2:** Umzüge + Schema-Erweiterungen implementieren. Server-Skript importiert aus shared; KEINE Logik-Änderung.
- [ ] **Step 3:** `npx tsc -b` (Root) grün; `cd packages/server && npx jest buildInterpretsAudit interpretsAudit` grün; Crawler-Tests grün.
- [ ] **Step 4: Commit** `feat(the-529): shared-Hebungen (idents/splitSentences) + evidence/detectorVersion additiv (Task 1)`

### Task 2: Der atomare Flip — `mechanical` + beide Grenzen + rp-4 + alle Pins

**Files:**
- Modify: `packages/shared/src/ontology/norm-ontology.schema.ts` (Enum + `isMechanicalRelation`)
- Modify: `packages/shared/src/ontology/norm-ontology.v1.ts` (INTERPRETS → `mechanical`, Begründungs-Kommentar THE-529)
- Modify: `packages/shared/src/relations/suggestion.ts:49` (refine `inferred ∥ mechanical`)
- Modify: `packages/server/src/evals/relationsGolden.ts:68` (`RelationTypeLabel` refine `inferred ∥ mechanical`, Kommentar: Golden darf mechanische Wahrheiten tragen)
- Modify: `packages/shared/src/relations/prompt.ts` (INTERPRETS-Absatz + RULE 5a/5b raus; `RELATIONS_PROMPT_VERSION = 'rp-4'` + Kommentar inkl. Voll-Re-Scan-Konsequenz)
- Test-Pins drehen: `packages/server/src/__tests__/norm-ontology.test.ts:60` (neu: `isInferredRelation('INTERPRETS')===false`, `isMechanicalRelation('INTERPRETS')===true`), `prelabelRelations.test.ts` (Optionsliste OHNE INTERPRETS; INTERPRETS-Regel-Assertions raus/invertiert; C4/C5-Kernsätze bleiben), Golden-Tests laufen unverändert grün (INTERPRETS bleibt gültiges Golden-Label!), Fixtures `relationsBatch.test.ts:168` / `relations-routes.test.ts:63` / `corpus-relations.route.test.ts:62` bleiben grün (INTERPRETS-Suggestions sind weiter schreibbar — via `isMechanicalRelation`).
- Ausweisen (kein Codefix nötig): `relations-worksheet.ts:37` verliert INTERPRETS aus der Optionsliste — gewollt.

- [ ] **Step 1 (failing Tests zuerst):** Registry-Tests (isMechanical/isInferred), Prompt-Test „Optionsliste enthält INTERPRETS NICHT", OOV-Test „parseRelationLabel dropt INTERPRETS als LLM-Antwort" (Regressionspin für Drift), Golden-Test „v5 mit INTERPRETS parst weiterhin".
- [ ] **Step 2:** Flip + beide Refines + rp-4 implementieren; alle gelisteten Pins in DEMSELBEN Task drehen.
- [ ] **Step 3:** Voll-Lauf: `npx tsc -b` grün; `cd packages/server && npx jest` (mind. norm-ontology, prelabelRelations, relationsGolden, buildRelationsGolden, relationsKappa, relationsBaseline, buildInterpretsAudit, corpus-relations.route) grün; `cd packages/compliance-crawler && npx jest` grün. Vorbestehend-flaky Suiten (Memory `reference_server_test_flaky_suites`) ausgenommen.
- [ ] **Step 4: Commit** `feat(the-529): INTERPRETS derivation=mechanical — atomarer Flip, beide Zod-Grenzen, rp-4 (Task 2)`

## Chunk 2: Detektor im Prod-Batch

### Task 3: `typing.provisionKind` am Kandidaten

**Files:**
- Modify: `packages/compliance-crawler/src/cli/relations-batch.ts` (Projektion + `typing`)
- Modify: `packages/compliance-crawler/src/lib/relationCandidates.ts` (`RelationCandidateDoc` + `provisionKind?`; Durchreichen nur bei `typing.status !== 'rejected'`)
- Test: `packages/compliance-crawler/src/__tests__/relationCandidates.test.ts` (bestehende Datei — Name per grep verifizieren)

- [ ] **Step 1 (failing):** Kandidat trägt `target.provisionKind==='definition'` bei `typing:{provisionKind:'definition',status:'confirmed'}`; bei `status:'rejected'` fehlt das Feld; ohne typing fehlt es.
- [ ] **Step 2:** Implementieren, grün, `tsc -b`.
- [ ] **Step 3: Commit** `feat(the-529): provisionKind am Relations-Kandidaten (P2-Quelle) (Task 3)`

### Task 4: Mechanischer Detektor im Kandidaten-Loop + Skip-Semantik

**Files:**
- Modify: `packages/compliance-crawler/src/lib/relationsBatch.ts`
- Test: `packages/compliance-crawler/src/__tests__/relationsBatch.test.ts`

- [ ] **Step 1 (failing Tests):** (a) Kandidat, dessen zitierender `fullText` einen Borrow-Satz auf den Paar-Artikel enthält (P0✓P1✓P2✓ — P2 via `provisionKind:'definition'`) → Suggestion `INTERPRETS`, direction **berechnet** (`deriveDirection`), `evidence.sentence` = der volle Beleg-Satz (aus `splitSentences(citing.fullText)`, NICHT `evidence.matched`), `evidence.pPath` gesetzt, `model:'mechanical:interprets-audit-v1'`, `promptVersion` unverändert gestempelt; **Spy: `deps.complete` für diesen Kandidaten NICHT aufgerufen**. (b) Kandidat ohne Schablonen-Treffer → LLM-Pfad unverändert. (c) LLM antwortet `INTERPRETS` → OOV-Drop (Pin). (d) Menschlich `confirmed`/`rejected` Suggestion wird vom mechanischen Re-Scan nicht überschrieben (merge-Pin). (e) Skip-Semantik: gleicher `promptVersion`+`detectorVersion`+`versionHash` → skip; Detektor-only-Bump → re-scan.
- [ ] **Step 2:** Detektor einbauen: Inputs `citingSentence` via shared `splitSentences`-Auswahl (Task-1-Logik), `pairTargetArticle` aus `evidence.articleHints`/target.paragraphNumber, `targetLawIdents = identsForSource(target.source)`, `targetProvisionKind` (Task 3), `targetFullText`. Verdikt `interprets` → mechanische Suggestion via `assembleRelationSuggestion`-Erweiterung; sonst LLM.
- [ ] **Step 3:** `shouldSkipRelationScan` + `relationScan`-Write um `detectorVersion` erweitern (Leitplanke 4).
- [ ] **Step 4:** Alle Crawler-Tests grün; `tsc -b` grün.
- [ ] **Step 5: Commit** `feat(the-529): mechanischer INTERPRETS-Detektor im Prod-Batch + Skip-Semantik (Task 4)`

## Chunk 3: Eval + Freeze + Baseline

### Task 5: Parser-Eval gegen v5 + v5-Freeze

**Files:**
- Create: `packages/server/src/scripts/interprets-parser-eval.ts`
- Modify: `packages/server/src/evals/golden/relations.v5.json` (`frozen: true` + Provenance)
- Modify: `packages/server/package.json` (`relations:parser-eval`)
- Test: Unit-Suite für die reine Eval-Kernfunktion

- [ ] **Step 1 (failing):** Eval-Kern rein: Input v5-Fälle + Pool-Texte → {tp, fp, fn, precision, recall, Fall-Listen}. Mini-Fixtures.
- [ ] **Step 2:** Skript + npm-Alias; Lauf gegen echtes v5 + Pool. Erwartung P=1,0/R=1,0 auf den 16 — **im Report ehrlich ausweisen: der Detektor IST die Quelle der Wahrheiten; dieser Lauf beweist die Verdrahtung (Ende-zu-Ende), nicht die Wahrheit. Die Wahrheits-Validierung ist die Architekten-Adjudikation + Kimi-Fremd-Check (92,6 %).**
- [ ] **Step 3: Freeze** — `frozen: true` + Provenance-Notes (Adjudikation 2026-07-26, 3-Häuser-Triangulation, rp-3-Hash a29f19f, Gate-Riss 0,35 → Architekten-Entscheid mechanical). Schema-Tor frozen⇒evidence muss grün parsen.
- [ ] **Step 4: Commit** `feat(the-529): Parser-Eval + relations.v5 FROZEN (Task 5)`

### Task 6: Baseline ohne INTERPRETS-LLM-Gate

**Files:**
- Modify: `packages/server/src/scripts/relations-baseline.ts` (Default-Golden → v5; INTERPRETS aus LLM-F1-Gate; Report-Text; übrige Schwellen/Logik UNANGETASTET)
- Modify: `packages/server/src/__tests__/relationsBaseline.test.ts`
- Modify: `docs/evals/typing-release-gates.md` (Relations-Abschnitt: mechanischer Pfad + v5-Messstand)

- [ ] **Step 1 (failing):** Baseline über v5-artigen Fixture-Satz: INTERPRETS-Fälle aus der LLM-F1-Rechnung ausgeschlossen, als `mechanical: n=…` ausgewiesen; übrige Klassen-Gates byte-gleich.
- [ ] **Step 2:** Implementieren; Report: „INTERPRETS wird mechanisch erkannt (THE-529); LLM-Gate misst nur die LLM-Klassen."
- [ ] **Step 3:** Suiten grün; `tsc -b` grün.
- [ ] **Step 4: Commit** `feat(the-529): Baseline v5 — INTERPRETS aus dem LLM-Gate (Task 6)`

---

## RVTM (kompakt)

| Anforderung (AC) | Task | Verifikation |
|---|---|---|
| AC-1 LLM-Optionsliste ohne INTERPRETS; OOV-Drop | 2 | prelabelRelations-Pins (Optionsliste, OOV), Regressionstest 4.1c |
| AC-2 Batch erzeugt INTERPRETS nur mechanisch, mit Beleg | 1, 3, 4 | relationsBatch-Tests (Spy deps.complete; evidence.sentence/pPath/direction; Mongoose-Silent-Drop-Regression) |
| AC-3 Parser-Eval P=1,0 auf den 16 + ehrlicher Verdrahtungs-Ausweis | 5 | interprets-parser-eval gegen v5+Pool |
| AC-4 v5 frozen mit Provenance | 5 | Schema-Tor frozen⇒evidence grün |
| AC-5 menschliche Labels unantastbar | 4 | merge-/TOCTOU-Pin 4.1d |
| Golden/Kappa/Worksheet bleiben lesbar (P1-Fund) | 2 | relationsGolden/buildRelationsGolden/relationsKappa grün mit INTERPRETS-Fällen |
| rp-4-Voll-Re-Scan gewollt + Kosten ausgewiesen | 2, 4 | Plan-Header + prompt.ts-Kommentar + Skip-Semantik-Test 4.1e |
