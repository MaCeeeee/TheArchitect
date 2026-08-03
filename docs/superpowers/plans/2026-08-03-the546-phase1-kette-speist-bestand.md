# THE-546 Phase 1 — Die Kette speist das Bestandsobjekt (ADR-0008, accepted)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Die ISO-Kette (Klausel → Stakeholder-Anforderung → Systemanforderung) läuft produktiv hinter dem bestehenden Generator-Endpoint und materialisiert `ComplianceRequirement`-Dokumente mit Provenienz und Rückverweisen — kein Konsument ändert sich (REQ-REQTRACE-001.2 / THE-561 + REQ-REQTRACE-001.3 / THE-562 + ADR-0008 Phase 1).

**Architecture:** Zwei neue Collections (`StakeholderRequirement`, `ChainSystemRequirement`) mit eingebettetem Klausel-Snapshot (contentId aus THE-560). Ein reiner Orchestrierungs-Service (`requirementChain.service`) komponiert die **bestehenden shared-Bausteine** (`reqtrace-prompt.ts`: Prompts, Parser, `isSingular`/`splitByAction`, `violatesImplementationFreedom`; `deadline.ts`: Fristobjekt an der Klausel). Engine-Weiche am Preview-Endpoint (`REQUIREMENTS_ENGINE`, Rollback = `reqgen`); der Save-Pfad persistiert Kette + materialisiertes Requirement (`createdBy: 'chain'`).

**Bewusste Abweichung vom ADR-Wortlaut („Hebung"), begründet:** `evaluateReqtrace` (das Messgerät von Lauf 4) wird NICHT umgebaut. Die gemeinsame Quelle von Eval und Produktion sind die shared-Bausteine — Prompts, Parser und beide Tore sind EINE Quelle; nur die ~30 Zeilen Schleifen-Orchestrierung existieren zweimal (Eval mit Messlogik, Service mit Persistenz-Statistik). Ein Umbau des eingefrorenen Messgeräts wäre Risiko ohne Gewinn.

**Nicht in Phase 1 (bewusst):**
- Verdrängungs-Gate im Generate-Pfad — es ist ein PAAR-Gate (Harmonisierung), die Einzel-Generierung hat kein Paar. Konsum kommt mit REQ-001.5.
- Gap/Drift/Projektion je Klausel — Phase 2, je eigenes Ticket.
- Jede Änderung an Bestands-Dokumenten; `createdBy`-Backfill gibt es nicht (fehlendes `chain`-Feld ⇒ Alt-Pfad).

**Tech Stack:** TypeScript, Mongoose, jest (aus `packages/server`), Stub-`ask` in Tests (kein LLM in CI).

**RVTM:** docs/superpowers/rvtm/2026-08-03-the546-phase1-rvtm.md

---

## Chunk 1: Persistenz (Task 1) + Orchestrierung (Task 2)

### Task 1: Modelle `StakeholderRequirement` + `ChainSystemRequirement`

**Files:**
- Create: `packages/server/src/models/StakeholderRequirement.ts`
- Create: `packages/server/src/models/ChainSystemRequirement.ts`
- Test: `packages/server/src/__tests__/chainModels.test.ts`

- [x] **Step 1: Failing test** — validiert: (a) wohlgeformte Dokumente passieren; (b) `clause.contentId` muss `/^[0-9a-f]{16}$/` sein; (c) `kind` nur `requirement | constraint`; (d) `ChainSystemRequirement.stakeholderRequirementIds` mit `minlength 1` — **Rückverweis-Pflicht ist Schema, nicht Konvention** (ISO §6.4.3.2 f); (e) `deadline` optional — ein Dokument OHNE Frist ist valide (kein erfundenes Fristobjekt, THE-561 AC 3).

- [x] **Step 2: rot laufen lassen** (`npx jest src/__tests__/chainModels.test.ts` aus `packages/server`; Falle aus heute Nacht: greift Babel statt ts-jest, Datei einmal umbenennen).

- [x] **Step 3: Implementierung.** `StakeholderRequirement`: `projectId` (ref, required, index) · `regulationKey` (required) · `clause` Subdoc {`contentId` (16-hex, required, index), `positionalId`, `path`, `text` (required), `regulationVersionHash?`} · `text` (die singuläre Anforderung, required) · `slots` Subdoc {`action`, `recipient`, `modality`, `condition`} (Strings, wie `StakeholderCandidate` sie liefert) · `kind: 'requirement' | 'constraint'` (Verbot → Constraint) · `deadline?` (Mixed — Form aus `parseDeadline`, `⟨Dauer, Bezugspunkt, Stufe⟩`) · timestamps. `ChainSystemRequirement`: `projectId` · `text` (required) · `stakeholderRequirementIds` (ObjectId[], required, `validate: v.length >= 1`) · timestamps. Kommentar-Kopf je Modell: WARUM eingebetteter Klausel-Snapshot (die Referenz muss auch nach einer Novelle auflösbar sein — der Snapshot ist der Beleg-Text zum Zeitpunkt der Ableitung, WORM-Geist THE-558).

- [x] **Step 4: grün** · **Step 5: Commit** `feat(the-561): Ketten-Modelle — Klausel-Snapshot, Singularitaets-Slots, Rueckverweis-Pflicht`

### Task 2: `requirementChain.service` — Orchestrierung der shared-Bausteine

**Files:**
- Create: `packages/server/src/services/requirementChain.service.ts`
- Test: `packages/server/src/__tests__/requirementChain.test.ts`

- [x] **Step 1: Failing test** mit Stub-`ask` (deterministische JSON-Antworten):
  - eine Klausel → 2 singuläre Kandidaten → 2 StR + 2 SysReq; `stats` = {clauses: 1, unreadable: 0, splitCount: 0, withoutRequirement: 0, implFreedomRejected: 0}
  - ein nicht-singulärer Kandidat (zwei Handlungen) wird via `splitByAction` aufgeteilt → `splitCount` zählt (THE-561 AC 1)
  - eine Klausel, deren Extraktion `[]` liefert → `withoutRequirement: 1` — **gültiges Ergebnis, als Quote ausgewiesen** (THE-561 AC 2)
  - unlesbare Extraktion (`parseStakeholderCandidates` ⇒ null) → `unreadable` zählt, Lauf bricht NICHT ab
  - SysReq-Text mit Lexikon-Verstoß (z. B. „mit Kubernetes") → verworfen + `implFreedomRejected` zählt (THE-562 AC 1: geprüft, nicht behauptet — und nie still)
  - Klausel mit „binnen 72 Stunden nach Kenntnisnahme" → StR trägt `deadline` mit Bezugspunkt `kenntnis`; Klausel ohne Frist → StR ohne `deadline` (THE-561 AC 3)
  - Verbots-Kandidat (Modalität „darf nicht") → `kind: 'constraint'` (THE-561 AC 4)

- [x] **Step 2: rot** · **Step 3: Implementierung.** `deriveChain(clauses: Clause[], ctx: {ask: AskFn}): Promise<ChainDerivation>` — REIN bzgl. DB (liefert Plain-Objekte + `stats`; die Persistenz macht Task 5). Je Klausel: `buildStakeholderReqUserPrompt` → `parseStakeholderCandidates` → Singularitätstor (`isSingular` / `splitByAction`) → je Kandidat `parseDeadline(clause.text)` + Verbots-Erkennung → `buildSystemReqUserPrompt` → SysReq-Parse → `violatesImplementationFreedom`-Gate. Kommentar-Kopf: die Ein-Quelle-Begründung (shared-Bausteine) + Verweis auf ADR-0008.

- [x] **Step 4: grün** · **Step 5: Commit** `feat(the-561): requirementChain.service — Kette orchestriert shared-Bausteine, Quoten nie still`

## Chunk 2: Naht (Tasks 3–5) + Sichtbarkeit (Task 6)

### Task 3: `ComplianceRequirement` additiv erweitern

**Files:**
- Modify: `packages/shared/src/types/compliance.types.ts` (`ComplianceRequirementProvenance` + `'chain'`; DTO-Feld `chain?`)
- Modify: `packages/server/src/models/ComplianceRequirement.ts` (optionales `chain` Subdoc, kein default)
- Test: erweitert `packages/server/src/__tests__/` (bestehende Requirement-Model-Tests)

- [x] **Step 1: Failing test** — (a) Bestands-Dokument ohne `chain` bleibt valide (Regression); (b) `createdBy: 'chain'` akzeptiert; (c) `chain` Subdoc {`clauseContentId` 16-hex, `clausePath`, `stakeholderRequirementIds` (min 1), `systemRequirementId`} validiert.
- [x] **Step 2: rot** · **Step 3: Implementierung** (shared zuerst bauen — `tsc -b`-Falle) · **Step 4: grün** · **Step 5: Commit** `feat(the-562): ComplianceRequirement traegt Ketten-Provenienz — additiv, kein default`

### Task 4: Engine-Weiche am Preview-Endpoint

**Files:**
- Modify: `packages/server/src/routes/requirements.routes.ts` (POST `/:projectId/requirements/generate`)
- Create: `packages/server/src/services/chainPreview.service.ts` (dünn: Regulation-Text → Pseudo-Artikel → `segmentClauses` → `deriveChain` → Kandidaten-DTO + `chainStats`)
- Test: `packages/server/src/__tests__/chainPreview.test.ts`

- [x] **Step 1: Failing test** (Service-Ebene, Stub-ask): Regulation-Text rein → Kandidaten im bestehenden DTO-Format, je Kandidat `chain`-Anteil (contentId, StR-Material), Response-`stats` mit den vier Quoten. **Die Quoten stehen in der Antwort, nicht im Log** (THE-561 AC 1+2).
- [x] **Step 2: rot** · **Step 3: Implementierung.** Weiche: `process.env.REQUIREMENTS_ENGINE` — `'chain'` (default) | `'reqgen'` (Rollback, ADR-0008). Der reqgen-Pfad bleibt UNVERÄNDERT bestehen. `.env.example` dokumentiert die Variable (Platzhalter, keine echten Werte).
- [x] **Step 4: grün + Regressionscheck** bestehende Generator-Tests (`requirementsGolden`/Route-Suiten) · **Step 5: Commit** `feat(the-562): Engine-Weiche — chain default, reqgen als Feature-Flag-Rollback`

### Task 5: Save-Pfad persistiert die Kette

**Files:**
- Modify: `packages/server/src/routes/requirements.routes.ts` (POST `/:projectId/requirements`)
- Test: `packages/server/src/__tests__/chainPersist.test.ts` (mongodb-memory-server, Muster bestehender Route-Tests)

- [x] **Step 1: Failing test** — Anlage mit `chain`-Payload erzeugt drei verknüpfte Dokumente (StR → SysReq → ComplianceRequirement mit `createdBy:'chain'` + Refs), `covered`-Ableitung läuft wie bisher; Anlage OHNE `chain` bleibt byte-gleich zum heutigen Verhalten (Regression); Server prüft `violatesImplementationFreedom` **serverseitig erneut** und lehnt Verstöße mit 400 ab (nie dem Client trauen; THE-562 AC 1).
- [x] **Step 2: rot** · **Step 3: Implementierung** (Reihenfolge: StR insertMany → SysReq mit Refs → Requirement mit `chain`; kein Transaktions-Anspruch — bei Teilfehler bleiben Ketten-Objekte ohne Requirement zurück und sind über fehlende Rückreferenz auffindbar; als Grenze im Kommentar).
- [x] **Step 4: grün** · **Step 5: Commit** `feat(the-562): Save persistiert die Kette — Rueckverweise lueckenlos, implFreedom serverseitig`

### Task 6: Sichtbarkeit im Generator-Modal (klein)

**Files:**
- Modify: `packages/client/src/components/compliance/RequirementsGeneratorModal.tsx`
- Modify: `packages/client/src/services/api.ts` (Typen additiv)
- Test: bestehende Modal-Tests erweitern (1–2 Fälle)

- [x] **Step 1/2/3 (TDD):** Engine-Badge („ISO chain" / „legacy"), Quoten-Zeile aus `stats` („X Klauseln · Y ohne Anforderung · Z aufgeteilt · W verworfen (implementierungsgebunden)"), und der Fehlerrest-Satz **in der Fläche**: „In rund 1 von 3 Fällen fasst die Kette zusammen, was ein Architekt getrennt bauen würde (gemessen: 68,8 % Übereinstimmung)." (THE-562 AC 3 — UI, nicht Fußnote.)
- [x] **Step 4: Client-Tests + tsc grün** · **Step 5: Commit** `feat(the-562): Generator-Modal zeigt Engine, Quoten und den gemessenen Fehlerrest`

### Task 7: RVTM + Abschluss

- [x] RVTM-Zeilen gegen THE-561 (4 ACs) + THE-562 (3 ACs) + ADR-0008-Prüfsteine (BSH-Count = Rollout-Schritt vor Deploy, Konsumenten-Suiten grün als Nachweis „kein Lese-Pfad geändert").
- [x] Gesamtlauf: `tsc --noEmit` (shared→server→client) + alle berührten Suiten; Commit, Push, PR gegen master.
