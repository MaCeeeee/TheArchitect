# Slice T — Typing-Batch + Eval (THE-432) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder der 1532 Korpus-Paragraphen bekommt einen 5-Achsen-Typisierungs-**Vorschlag** (Status `suggested`, volle Provenance), erzeugt durch einen Batch auf Server B, gemessen am eingefrorenen Golden (`typing.v1.json`).

**Architecture:** Der Klassifizierungs-Prompt wandert nach `@thearchitect/shared` (eine Quelle für Eval UND Batch — Messvalidität). Der Batch lebt im Crawler-Paket (Server B, dort ist der Schreibzugriff zuhause; App-Leseseite bleibt read-only). Persistenz additiv als `typing`-Subdokument am Korpus-Doc. Kein Auto-Commit, kein Konsument vor Gate 2.

**Tech Stack:** TypeScript-Monorepo, Mongoose (Korpus-Mongo Server B), Anthropic SDK (Haiku-Instruct — Paper-Guardrail: Instruct schlägt Thinking), Jest.

**RVTM:** docs/superpowers/rvtm/2026-07-22-the-432-slice-t-rvtm.md
**Spec:** docs/superpowers/specs/2026-07-19-onto-reqharm-path-design.md §4
**Baseline (2026-07-22, Haiku vs frozen Golden):** obligationKind 88,8 %/0,794 ✅ · partyRole 85,0 %/0,675 (F1-Miss = Kleinststichproben-Artefakt; über Klassen n≥3: 0,84) · provisionKind 73,8 %/0,676 (Prompt kennt B3a-Präzedenzen noch nicht; nis2-de 28,6 %) · **scope-applicability F1 0,86** (der Gate-2-Konsument).

**Entscheidungen:** O-3 = Batch auf Server B (User, 2026-07-22). O-2 = Schwellen-Vorschlag siehe Task 6. Feldname `obligationKind` (nicht `obligationType` wie im Spec-Text — Konsistenz mit den 5 Achsen überall im Code; bewusste Abweichung).

---

## Chunk 1: Prompt nach shared (Messvalidität)

### Task 1: Typing-Prompt-Modul nach `@thearchitect/shared` verschieben

**Files:**
- Create: `packages/shared/src/typing/prompt.ts`
- Create: `packages/shared/src/typing/index.ts` (Re-Export)
- Modify: `packages/shared/src/index.ts` (Export ergänzen)
- Modify: `packages/server/src/scripts/prelabel-typing.ts` (lokale Definitionen löschen, aus shared importieren, **Re-Export für Bestands-Importe**)
- Modify: `packages/server/src/evals/runTypingEval.ts` (Import-Quelle)
- Test: `packages/server/src/__tests__/prelabelTyping.test.ts` (muss unverändert grün bleiben — Beweis, dass der Umzug verhaltensneutral ist)

**Inhalt `packages/shared/src/typing/prompt.ts`** — 1:1-Umzug (KEINE inhaltliche Änderung in diesem Task) von: `PRELABEL_SYSTEM`, `TYPING_RUBRIC_RULES`, `buildPrelabelUserPrompt`, `parsePrelabelLabels`, `axisFacetOf`, `AXIS_VALIDATOR` (nutzt die shared-Guards `isNormKind`/`isObligationKind`/`isProvisionKind`/`BINDINGNESS_IDS`/`PARTY_ROLE_IDS`), `TYPING_AXES` + Typ `TypingAxis` + Typ `TypingLabels` (plain: `Partial<Record<TypingAxis, string | null>>`).

**NEU dazu:**
```ts
/** Bump bei JEDER inhaltlichen Änderung an System/Rules/Template — Teil der Provenance (AC-1) und der Batch-Idempotenz. */
export const TYPING_PROMPT_VERSION = 'tp-1';
```

`packages/server/src/evals/typingGolden.ts`: `TYPING_AXES`/`TypingAxis` von dort importieren + re-exportieren (Zod-Schemata bleiben im Server — der Crawler braucht sie nicht).

- [ ] Step 1: shared-Modul anlegen (reiner Umzug + `TYPING_PROMPT_VERSION`)
- [ ] Step 2: Server auf shared-Importe umstellen, alte Symbole re-exportieren (kein Konsument bricht)
- [ ] Step 3: `npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p packages/server`, dann shared bauen (`tsc -b packages/shared` — Jest löst gegen dist!)
- [ ] Step 4: `cd packages/server && npx jest --testPathPattern "prelabelTyping|runTypingEval|typingKappa|buildTypingGolden"` → alle grün, UNVERÄNDERT
- [ ] Step 5: Commit `refactor(THE-432): typing prompt to shared — one source for eval and batch`

### Task 2: B3a-Präzedenzen in die Prompt-Regeln

**Files:**
- Modify: `packages/shared/src/typing/prompt.ts` (`TYPING_RUBRIC_RULES` + `TYPING_PROMPT_VERSION` → 'tp-2')
- Test: `packages/server/src/__tests__/prelabelTyping.test.ts` (neue Assertions)

`TYPING_RUBRIC_RULES` um die verdichteten B3a-Präzedenzen ergänzen (englisch, Stil der bestehenden Regeln; Quelle: RUBRIC.md B3a — Verdichtung, keine zweite Wahrheit). Muss abdecken: (1) scope/definition-Artikel → partyRole "na" + obligationKind "na"; (2) Einstufung mit Regime-Folge → scope-applicability; (3) Befreiungs-Artikel → scope-applicability; (4) Komitologie → "na"; (5) Behörden-Verwaltungsmechanik (Kennnummern, Meldeformate, Registrierungs-/Notifizierungsverfahren, Berichte) → procedural — enforcement-supervision NUR für echte Aufsichts-/Untersuchungs-/Sanktionsbefugnisse; (6) Institutions-Gründung → other; (7) echte Verhaltenspflicht bleibt obligation, egal wer sie trägt; (8) Behörden-Ermächtigung → permission (Gesetzesvorbehalt); (9) "only where"-Marktzugangsklausel → prohibition; (10) Vermutungs-/Beweisregel → obligationKind "na" + procedural; (11) Betroffenenrechte → partyRole = Träger der Spiegelpflicht (controller); (12) Richtlinien-Zweischritt → Adressat = bei wem die Pflicht endet; (13) Stammdaten-Registrierung → procedural (anlassbezogene Vorfalls-Meldung bleibt obligation); (14) Akteur ohne Rolle im Werteraum → "na", nie borgen.

- [ ] Step 1: Failing Tests (Schlüssel-Phrasen je Präzedenz-Gruppe, ~6 Assertions)
- [ ] Step 2: Regeln ergänzen, `TYPING_PROMPT_VERSION = 'tp-2'`
- [ ] Step 3: tsc + shared bauen + Jest-Pattern aus Task 1 grün
- [ ] Step 4: Commit `feat(THE-432): B3a precedents into typing prompt (tp-2)`

### Task 3 (Ops, Controller): Re-Eval nach Prompt-Sync

- [ ] `npm run typing:eval -- --golden src/evals/golden/typing.v1.json` (Haiku)
- [ ] Vergleich zu Baseline dokumentieren — **mit In-Sample-Fußnote**: Die B3a-Regeln wurden aus genau diesen 80 Fällen gewonnen; diese Zahlen sind keine unabhängige Bestätigung. Erwartung: provisionKind ↑ (other/procedural/enforcement), partyRole ↑.
- [ ] Gate-Check gegen Task-6-Schwellen → Ergebnis in den Report + THE-432

## Chunk 2: Der Batch im Crawler

### Task 4: Batch-Kern (pur) + CLI im Crawler-Paket

**Files:**
- Create: `packages/compliance-crawler/src/lib/typingBatch.ts` (pur, testbar)
- Create: `packages/compliance-crawler/src/cli/typing-batch.ts` (CLI/Glue)
- Modify: `packages/compliance-crawler/package.json` (dep `@anthropic-ai/sdk`, Script `typing:batch`)
- Test: `packages/compliance-crawler/src/__tests__/typingBatch.test.ts`

**Pure Kernfunktionen** (`typingBatch.ts`):
```ts
export const TYPING_BATCH_MODEL = 'claude-haiku-4-5-20251001';
// AC-5 GUARDRAIL: Instruct-Klasse, NICHT Thinking — OntoLearner §5: Output-Disziplin
// schlägt Reasoning bei Term Typing durchgängig (Extremfall 0,0 F1). Nicht "upgraden".

export interface TypingSuggestion {
  normKind?: string | null; bindingness?: string | null; obligationKind?: string | null;
  partyRole?: string | null; provisionKind?: string | null;
  modelId: string; promptVersion: string; ontologyVersion: string;
  typedAt: Date; status: 'suggested';
  droppedAxes?: string[];           // OOV-Telemetrie je Doc (AC-2)
}

/** Skip-Entscheid: idempotent + AC-4-Schutz. */
export function shouldSkipDoc(doc: { typing?: { status?: string; promptVersion?: string; ontologyVersion?: string; modelId?: string } }, opts: { force: boolean }): { skip: boolean; reason?: 'confirmed' | 'up-to-date' } {
  // 'confirmed'/'rejected' NIE anfassen — menschliche Entscheidung schlägt Batch, auch mit --force (AC-4).
  // 'suggested' mit identischem (promptVersion, ontologyVersion, modelId): skip, außer --force.
}

export function assembleTypingSuggestion(parsed: { labels: TypingLabels; dropped: TypingAxis[] }, meta: { modelId: string; now: Date }): TypingSuggestion { /* Provenance komplett — AC-1 */ }
```

**CLI** (`typing-batch.ts`), Muster `crawl-live.ts`:
- Env: `MONGODB_URI` (Korpus, Schreibrechte auf Server B vorhanden), `ANTHROPIC_API_KEY`
- Flags: `--limit N`, `--source X`, `--dry-run`, `--force`, `--concurrency 4` (Default)
- Ablauf je Doc: `shouldSkipDoc` → `buildPrelabelUserPrompt` (aus shared! Byte-identisch zum Eval) → Anthropic-Call mit **Leer-Antwort-Retry** (3 Versuche, Budget-Verdopplung — Muster raterClient, hier bewusst als lokaler ~30-Zeilen-Helfer statt Import: raterClient lebt im Server-Paket und zöge die OpenAI-Dep mit; die Invariante ist Prompt-Identität, nicht Client-Identität — als Kommentar dokumentieren) → `parsePrelabelLabels` → `assembleTypingSuggestion` → `updateOne({_id}, {$set:{typing}})`
- **Nach 3 leeren Versuchen: NICHTS schreiben** (Doc bleibt untypisiert, caseId in Fehlliste, Re-Run nimmt ihn wieder mit). Fehlgeschlagene Messung ≠ Label — die Lehre von gestern.
- Summary: typed / skipped(confirmed) / skipped(up-to-date) / OOV-Drops je Achse / no-response / Token+Kosten. `no-response > 0` ⇒ Exit 1 + Liste.

- [ ] Step 1: Failing Tests: `shouldSkipDoc` (confirmed nie — auch nicht mit force; up-to-date; force-Re-Lauf; Versions-Wechsel = kein Skip), `assembleTypingSuggestion` (Provenance vollständig, OOV in droppedAxes, na→null), Retry-Helfer (leer→retry→ok; 3×leer→null, kein Write)
- [ ] Step 2: Implementieren, `npx jest` im Crawler grün
- [ ] Step 3: `--dry-run --limit 3` lokal gegen NICHTS (Mongo-frei mit Stub) als Smoke im Test
- [ ] Step 4: Commit `feat(THE-432): typing batch in crawler (suggest-only, resumable)`

### Task 5: Additive Schema-Erweiterung (beide Seiten)

**Files:**
- Modify: `packages/compliance-crawler/src/db/regulation.model.ts` (`typing`-Subschema, `_id:false`, alle Felder optional)
- Modify: `packages/server/src/services/corpusClient.service.ts` (`ICorpusRegulation.typing?` + Schema-Feld — die spätere Gate-2-Leseseite)
- Tests: bestehende Suiten beider Pakete bleiben grün (additiv-Beweis)

- [ ] Step 1: Beide Schemata erweitern (identische Feldnamen!)
- [ ] Step 2: tsc beide Pakete + Jest-Pattern `corpus|regulation` grün
- [ ] Step 3: Commit `feat(THE-432): additive typing subdoc on corpus schema`

### Task 6: Schwellen-Doku fixieren (O-2, AC-3/AC-5)

**Files:** Modify: `docs/evals/typing-release-gates.md`

- [ ] `provisionKind`-Zeile: Accuracy ≥ 0,75 · macro-F1 ≥ 0,70
- [ ] partyRole-Präzisierung: macro-F1 über Klassen mit **n ≥ 3** (dünnere im Report ausgewiesen, nicht eingerechnet)
- [ ] **Gate-2-Regel (klassen-spezifisch):** Discovery-Priorisierung wird freigegeben, wenn `scope-applicability` **F1 ≥ 0,80** am frozen Golden hält — der Konsument hängt an dieser Klasse, nicht am Achsen-Durchschnitt. Baseline 2026-07-22: 0,86 ✅
- [ ] In-Sample-Fußnote als stehende Regel: Nach Rubrik-Schärfung aus Golden-Fällen sind Re-Eval-Zahlen auf demselben Golden als in-sample zu kennzeichnen
- [ ] Commit `docs(THE-432): gate-2 thresholds fixed (O-2)`

## Chunk 3: Lauf + Nachweis

### Task 7 (Ops, 🧑 User auf Server B + Controller):

- [ ] **Voraussetzung: PR #89 gemerged** (Coolify deployt von master)
- [ ] 🧑 Coolify: Crawler-Service redeployen; `ANTHROPIC_API_KEY` in der Service-Env prüfen/setzen
- [ ] 🧑 Im Crawler-Container: `npm run typing:batch:prod -- --limit 20` (Probelauf) → Summary prüfen → voller Lauf (~1532 §§, ≈3–5 $). WICHTIG: das Prod-Image enthält nur `dist/` (kein `src/`, kein ts-node-dev) — `typing:batch` (ts-node-dev) existiert dort nicht, `typing:batch:prod` läuft auf `dist/cli/typing-batch.js`.
- [ ] Controller: Verifikation read-only — Anzahl typisierter Docs = Korpusgröße − Fehlliste; Stichprobe 5 Docs (Provenance vollständig, Status suggested)
- [ ] Controller: Gate-2-Entscheid dokumentieren (`docs/superpowers/2026-07-XX-the-432-gate2-evidence.md`), Linear THE-432/421/430 aktualisieren
- [ ] Final-Review über den Branch-Zuwachs

## Verifikationsstrategie

Unit auf den puren Kernen (Skip/Assemble/Retry/Prompt-Phrasen) · Verhaltensneutralität des Umzugs über unveränderte Bestands-Suiten · Messvalidität strukturell (ein Prompt-Modul, `TYPING_PROMPT_VERSION` in Provenance UND Idempotenz) · menschliche Entscheidung unantastbar (`confirmed` schlägt `--force`) · fehlgeschlagene Messung schreibt nie ein Label.

## Ausgegrenzt

Stichproben-Confirm-UI (späterer Scope, spec-konform) · Discovery-Priorisierung selbst (separater Bau NACH Gate-2-Entscheid, flag-gated dark) · Slice K.
