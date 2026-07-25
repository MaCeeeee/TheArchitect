# THE-433 — Cross-Norm Relation Extraction (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die KI-Extraktions-Pipeline für Cross-Norm-Kanten: verweis-getriebene Kandidaten → rp-2-Klassifikation (Haiku) → Vorschlags-Speicherung am Korpus (suggest-only, Mensch entscheidet) → Baseline gegen das frozen Golden `relations.v4.json`.

**Architecture:** Exakt das Slice-T-Muster (Typisierung), angewandt auf Paare: Batch-CLI im Crawler (Server B, hat Schreibzugriff auf Korpus-Mongo), Kandidaten aus dem bestehenden Verweis-Miner (`referencesLaw` + Pinpoint — NIE Similarity als Positiv-Quelle), Klassifikation mit dem byte-identischen rp-2-Prompt aus `prelabel-relations.ts` (kappa-validiert 0,866), Speicherung als `relationSuggestions[]` am **zitierenden** Korpus-Dokument mit versionHash-Anker **beider** Normen. Metadaten-Typen (AMENDS…) sind hart ausgeschlossen (OOV-Drop) — deren Befüller ist THE-518.

**Tech Stack:** TypeScript · compliance-crawler (mongoose, Fastify) · @thearchitect/shared (Typen) · Anthropic Haiku (Batch) · Jest.

**Architekten-Entscheide (Pre-Flight 2026-07-25):** Speicherort Korpus-Mongo nach typingSuggestion-Muster (nicht Neo4j) · AC-5-Metadaten-Pfad → THE-518 · rp-2 eingefroren bis zur Baseline-Messung (Prompt-Freeze-Ratsche wie tp-2/tp-3).

**Erfolgs-/Abbruchregel (VOR der Messung fixiert):** Baseline = derselbe Klassifikator (Haiku + rp-2) über alle 175 frozen-Golden-Fälle. **Erfolg:** Übereinstimmung mit der Wahrheit gesamt ≥ 0,85 UND `none`-Precision ≥ 0,90 UND INTERPRETS-F1 ≥ 0,70 (die einzige n≥10-Positiv-Klasse) UND 0 metadata-Typ-Vorschläge. Dann bleiben die Vorschläge im Korpus (suggest-only, dark). **Sonst:** Vorschläge werden NICHT geschrieben (Batch bricht nach Eval ab), Fehleranalyse als dokumentierte Grenze ins Nachweisdokument — das ist per Paper §5 ein legitimes Ergebnis. Dünne Klassen (CONCRETIZES 5, EQUIVALENCE 3, PREVAILS 1, SETS_PARAMETER 1) werden ausgewiesen, aber nicht gegated (n≥3-Regel sinngemäß).

---

## Task 1: Shared-Typ + Korpus-Schema für `relationSuggestions`

**Files:**
- Modify: `packages/shared/src/typing/` → neu `packages/shared/src/relations/suggestion.ts` (+ Export in `packages/shared/src/index.ts`)
- Modify: `packages/compliance-crawler/src/db/regulation.model.ts`
- Test: `packages/compliance-crawler/src/lib/__tests__/relationSuggestion.test.ts` (oder bestehendes Test-Verzeichnis-Muster)

- [ ] **Step 1: Failing Test** — Shape-Test: eine `RelationSuggestion` trägt `targetRegulationKey`, `targetVersionHash`, `sourceVersionHash`, `relationType` (nur `inferred`-Ids — Zod-Refine gegen `isInferredRelation`), `direction`, `confidence?`, `evidence` (matched-Ausschnitt + articleHints), `promptVersion`, `model`, `suggestedAt`, `status: 'suggested'|'confirmed'|'rejected'`. Metadata-Typ im Schema → Validierungsfehler.
- [ ] **Step 2: rot laufen lassen.**
- [ ] **Step 3: Implementierung** — Zod-Schema + TS-Typ in shared (Muster: `relationsGolden.ts` RelationTypeLabel); Mongoose-Subschema `relationSuggestions: [ ... ]` + `relationScan: { promptVersion, versionHash, scannedAt }` (Idempotenz-Anker: Scan gilt nur für exakt diesen Text-Stand) am Regulation-Modell — rein additiv.
- [ ] **Step 4: grün.** — [ ] **Step 5: Commit** `feat(the-433): relationSuggestion Typ + Korpus-Schema (additiv)`

## Task 2: Kandidaten-Aufzählung als reine Funktion (+ Dry-Run-Zählung)

**Files:**
- Create: `packages/compliance-crawler/src/lib/relationCandidates.ts`
- Test: analog Task 1

Kern: Für jedes Korpus-Dokument `referencesLaw(fullText, targetSource)` über alle **anderen** Familien (SOURCE_TO_FAMILY aus server/evals — Logik hierher DUPLIZIEREN wäre zweite Wahrheit → **verschieben nach shared** oder aus server importieren; Entscheidung: die Familien-Muster wandern nach `@thearchitect/shared/relations/lawPatterns.ts`, server re-exportiert — ein Ort). Pinpoint-Treffer → Kandidat `(citingKey, targetKey)` wenn die Ziel-Provision im Korpus existiert. Sprachrein bevorzugen (DE↔DE, EN↔EN); Familien-interne Paare (Sprachzwillinge) ausschließen.

- [ ] **Step 1: Failing Tests** — (a) Pinpoint auf existierende Ziel-Provision → Kandidat mit Evidence; (b) law-level-Erwähnung → KEIN Kandidat; (c) Sprachzwilling → ausgeschlossen; (d) Ziel-Artikel nicht im Korpus → gezählt als `unresolvedTarget` (laut, nicht still).
- [ ] **Step 2-4: rot → implementieren → grün.**
- [ ] **Step 5: Dry-Run-Modus** — `relations:batch --dry-run` zählt nur: Kandidaten je Familien-Paar + unresolved. Erwartung aus THE-517-Zählung: grob 100–300 Kandidaten korpus-weit.
- [ ] **Step 6: Commit.**

## Task 3: Batch-CLI `relations:batch` (Klassifikation + Schreiben, suggest-only)

**Files:**
- Create: `packages/compliance-crawler/src/lib/relationsBatch.ts` + `src/cli/relations-batch.ts`
- Modify: `packages/compliance-crawler/package.json` (Scripts `relations:batch`, `relations:batch:prod`)
- Test: Batch-Logik-Tests (Muster `typingBatch`-Tests)

Verhalten (Slice-T-Muster, jede Regel hat dort ihren Grund):
- Prompt = **byte-identisch** `buildRelationsPrompt`/`RELATIONS_RUBRIC_RULES` aus einem geteilten Ort (Verschiebung nach shared analog `typing/prompt.ts` — Eval und Batch dürfen nie divergieren). `RELATIONS_PROMPT_VERSION` wandert mit.
- `none` → **kein** Suggestion-Eintrag (nur `relationScan`-Anker aktualisiert). OOV/metadata → Drop-Zähler, nie geschrieben.
- Menschliche Entscheidung schlägt Batch: bestehende `confirmed/rejected`-Einträge werden NIE überschrieben (auch mit `--force` nicht); `$nin`-TOCTOU-Guard beim Write.
- Ausfall (leere Antwort nach Retries) schreibt nichts und wird laut gezählt (Muster `completeWithRetry`).
- Resumable: Docs mit passendem `relationScan`-Anker (gleicher versionHash + promptVersion) werden übersprungen, außer `--force`.

- [ ] **Steps: TDD über die vier Verhaltensregeln, dann CLI-Verdrahtung, Commit.**

## Task 4: Baseline-Eval gegen das frozen Golden (Gate)

**Files:**
- Create: `packages/server/src/scripts/relations-baseline.ts` (Script `relations:baseline`)
- Output: Report auf stdout + `docs/superpowers/2026-07-XX-the-433-baseline.md` (von Hand aus dem Report)

- [ ] **Step 1:** Klassifikator (Haiku + rp-2, identischer Prompt-Import) über alle 175 `relations.v4.json`-Fälle; Vergleich mit Wahrheit: Gesamt-Übereinstimmung, `none`-Precision/Recall, per-Typ-F1 (n≥10-Ausweis-Regel), Richtungs-Fehler getrennt gezählt, 0-metadata-Check.
- [ ] **Step 2:** Ergebnis gegen die **Erfolgs-/Abbruchregel oben** prüfen; Verdikt ins Nachweisdokument.
- [ ] **Step 3: Commit.**

## Task 5: AC-4-Härtetest — DORA↔NIS2-Verdrängung

**Files:** Fixture-Test in crawler (echte Texte aus dem Pool als Fixture)

- [ ] Der Batch-Pfad findet auf dem Paar DORA Art. 1 ↔ NIS2 Art. 4 die Kante `PREVAILS_OVER a→b` (die adjudizierte Wahrheit) ODER der Fall wird als dokumentierte Grenze mit Fehleranalyse ausgewiesen. Kein stilles Bestehen.

## Task 6: Review-Pfad (minimal, Slice 1)

**Files:**
- Create: Fastify-Route im Crawler: `GET /relations/suggestions` (Liste, filterbar) + `POST /relations/decide` (`{regulationKey, targetRegulationKey, decision: confirmed|rejected}`) — der Crawler hat den Schreibzugriff; Server A ist am Korpus **read-only** (THE-440-RO-User!), deshalb läuft die Entscheidung über den Crawler-Service (Tailnet, wie /crawl).
- Server A: schlanker Proxy-Endpunkt `GET /api/regulations/corpus/relations` (read, über corpusClient) — UI-Anbindung ist Slice 2.

- [ ] **Steps: TDD (decide überschreibt nie eine andere menschliche Entscheidung; auth wie /crawl), Commit.**

## Task 7 (User, Ops — nach Merge)

- [ ] Coolify-Redeploy Crawler (Server B) → `relations:batch --dry-run` (Kandidaten-Zählung sichten) → `relations:batch:prod` (~<1 $ bei 100–300 Kandidaten) → Stichprobe: DORA↔NIS2-Kante da? → Nachweisdokument finalisieren, Linear, Daily.

---

## RVTM (kompakt)

| AC (THE-433) | Task | Verifikation |
|---|---|---|
| AC-1 registry-geschlossen, OOV-Drop | 1, 3 | Schema-Test + Batch-Drop-Test |
| AC-2 Provenance beider Normen (eIds + Versionen) | 1, 3 | Shape-Test (`sourceVersionHash`+`targetVersionHash` Pflicht) |
| AC-3 Golden-Eval-Baseline vor default-on | 4 | Baseline-Report vs. Erfolgsregel |
| AC-4 DORA↔NIS2 gefunden oder dokumentierte Grenze | 5 | Fixture-Test |
| AC-5 Metadaten-Pfad | → **THE-518** | Abgrenzung bleibt hier als Drop-Test |
| AC-6 Human-Confirm vor Wirkung | 3, 6 | suggest-only + decide-Endpunkt-Tests; kein Konsument liest `suggested` |
