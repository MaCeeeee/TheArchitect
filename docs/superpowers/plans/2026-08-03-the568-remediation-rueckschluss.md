# THE-568 (Slice A) — Remediation-Rückschluss Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Der Apply-Pfad der Remediation-Engine verlinkt die erzeugten Architektur-Elemente **mechanisch** mit den auslösenden Anforderungen (`linkedElementIds` + `covered`-Recompute) — die Schleife Gap → Maßnahme → Nachweis schließt sich, ohne LLM (REQ-REQTRACE-001.5a / THE-568).

**Architecture:** Ein neuer, kleiner Service `remediationBacklink.service.ts` kapselt Join + Rückschreiben + Recompute; `remediation-apply.service.ts` ruft ihn an genau zwei Stellen (nach Apply-Insert, vor Rollback-Delete). Der Join ist rein mechanisch: `Proposal.sourceRef.{standardId, sectionIds}` → Requirements mit `projectId` + `normId = upload:<standardId>` + `sectionEId ∈ sectionIds`. Idempotenz über `$addToSet`; Rollback über `$pull`; `covered` via bestehendem `deriveCovered` (THE-557), menschliche Tore unangetastet.

**Pre-Flight-Befund (Grundlage):** `remediation-apply.service.ts` hat heute null Verweise auf `linkedElementIds`/`ComplianceRequirement` — Elemente entstehen, `covered` bleibt unknown.

**Ehrliche Grenzen (im Code-Kommentar + RVTM):**
- Upload-Welt only: der Gap-Kontext der Remediation kennt heute nur Upload-Standard-Sections; der Korpus-/Klausel-Anschluss folgt mit Gap-je-Klausel (ADR-0008 Phase 2).
- Bestands-Requirements ohne `normId` (vor THE-390) werden nicht gejoint — kein Raten über Titel o. Ä.
- `advisor`-/`manual`-Proposals ohne `sourceRef.standardId` → dokumentierter No-op.

**Tech Stack:** TypeScript, Mongoose, jest + mongodb-memory-server (Muster `chainPersistDb.test.ts`).

**RVTM:** docs/superpowers/rvtm/2026-08-03-the568-remediation-rueckschluss-rvtm.md

---

## Task 1: `remediationBacklink.service` — Join, Rückschreiben, Recompute

**Files:**
- Create: `packages/server/src/services/remediationBacklink.service.ts`
- Test: `packages/server/src/__tests__/remediationBacklinkDb.test.ts` (Name ohne Umbenennungs-Risiko — jest-Haste-Falle)

- [x] **Step 1: Failing test** (memory-server; Fixtures: 2 Requirements mit `normId: 'upload:<sid>'` + `sectionEId: 's1'|'s2'`, 1 Requirement fremder Section, 1 ohne normId):
  - `linkAppliedElements` mit `sourceRef {standardId: sid, sectionIds: ['s1','s2']}` + `elementIds ['el-a','el-b']` → beide Treffer-Requirements tragen el-a+el-b in `linkedElementIds`; `gates.covered.state === 'yes'` mit `setBy: 'system'`; Fremd-Section und normId-loses Requirement unverändert; Rückgabe `{ linkedRequirements: 2 }`.
  - **Idempotenz:** zweiter Aufruf identisch → keine Duplikate in `linkedElementIds`, weiterhin 2.
  - **Menschliche Tore unangetastet:** Requirement mit `attested.state='yes'` (via `applyHumanGate`-Fixture) behält attested nach dem Link exakt.
  - `unlinkAppliedElements` (gleiche Args) → Element-Ids entfernt; `covered` neu abgeleitet (bei nun leerer Liste: `state: 'no'` mit System-Grund — exakt `deriveCovered([])`-Verhalten); Evidenz-Dokumente bleiben unberührt.
  - **No-op:** `sourceRef` ohne `standardId` → `{ linkedRequirements: 0 }`, keine Schreiboperation (Spy/Timestamps).

- [x] **Step 2: rot laufen lassen** (`cd packages/server && npx jest src/__tests__/remediationBacklinkDb.test.ts`).

- [x] **Step 3: Implementierung.**

```typescript
/**
 * remediationBacklink — schließt die Schleife Gap → Maßnahme → Nachweis
 * (THE-568, Slice A von REQ-REQTRACE-001.5).
 *
 * Der Apply-Pfad der Remediation erzeugte Elemente, aber die auslösende
 * Anforderung erfuhr es nie — `covered` blieb unknown, obwohl die Maßnahme
 * existierte (Pre-Flight 2026-08-03: null Verweise auf linkedElementIds im
 * Apply-Service). Dieser Service schreibt MECHANISCH zurück:
 *
 *   Proposal.sourceRef.{standardId, sectionIds}
 *     → Requirements { projectId, normId: `upload:<standardId>`,
 *                      sectionEId ∈ sectionIds }
 *     → $addToSet linkedElementIds + covered-Recompute (THE-557).
 *
 * Kein LLM, kein Raten: Requirements ohne normId (Bestand vor THE-390) und
 * Proposals ohne standardId (advisor/manual) sind dokumentierte No-ops.
 * Menschliche Tore (enforced/attested) werden NIE berührt.
 */
```

`linkAppliedElements({ projectId, sourceRef, elementIds })`: Guard (kein standardId / keine sectionIds / keine elementIds → `{linkedRequirements: 0}`); `find` der Treffer; je Doc: `$addToSet: { linkedElementIds: { $each: elementIds } }` + danach Doc-basiert `gates = { ...(doc.gates ?? emptyGates()), covered: deriveCovered(next) }` speichern (ein `updateOne` je Doc mit beidem — Reihenfolge egal, aber covered aus der NEUEN Liste ableiten). `unlinkAppliedElements(...)`: `$pull`-Äquivalent (`$pullAll`) + Recompute. Beide geben `{ linkedRequirements, requirementIds }` zurück (für Response/Audit).

- [x] **Step 4: grün** · **Step 5: Commit** `feat(the-568): remediationBacklink — mechanischer Join, addToSet, covered-Recompute`

## Task 2: Integration in Apply + Rollback + Route-Antwort

**Files:**
- Modify: `packages/server/src/services/remediation-apply.service.ts` (2 Aufrufe)
- Modify: `packages/server/src/routes/remediation.routes.ts` (Response-Feld)
- Test: `packages/server/src/__tests__/remediationApplyBacklinkDb.test.ts`

- [x] **Step 1: Failing test** (memory-server, auf Service-Ebene `applyProposal`/`rollbackProposal` mit minimalem Proposal-Fixture `source:'compliance'` + `sourceRef`):
  - `applyProposal` → Rückgabe enthält `linkedRequirements ≥ 1`; das Treffer-Requirement trägt die NEU erzeugten Element-Ids (nicht tempIds!) und `covered: yes`.
  - `rollbackProposal` → Verknüpfungen wieder entfernt, `covered` erneut abgeleitet; Requirement existiert unverändert weiter (kein Löschen von Evidenz/Gates außer covered).
  - Advisor-Proposal: Apply-Rückgabe `linkedRequirements: 0`, Requirements byte-gleich (Regression).

- [x] **Step 2: rot** · **Step 3: Implementierung.** In `applyProposal`: NACH dem Setzen von `proposal.appliedElementIds` → `linkAppliedElements({ projectId, sourceRef: proposal.sourceRef, elementIds: createdElementIds })`; Rückgabe um `linkedRequirements` erweitern. In `rollbackProposal`: VOR dem Löschen der Elemente/Leeren von `appliedElementIds` → `unlinkAppliedElements(...)` mit den noch vorhandenen Ids. Route: Response-JSON um `linkedRequirements` ergänzen (Apply + Batch) — **die Rückschreibung ist sichtbar, nie still**; die bestehende `audit()`-Middleware (action `apply_remediation`, riskLevel high) deckt den Audit-Eintrag.

- [x] **Step 4: grün + Regressionslauf** `remediation.test.ts` + `remediation-validator.test.ts` (Bestand, 41 Validator-Tests) · **Step 5: Commit** `feat(the-568): Apply/Rollback verlinken Anforderungen — sichtbar in Antwort und Audit`

## Task 3: RVTM + Abschluss

- [x] RVTM-Zeilen gegen alle 6 THE-568-ACs (inkl. der ehrlichen Grenze als eigene Zeile mit Beleg im Code-Kommentar).
- [x] Gesamtlauf: `npx tsc --noEmit` + neue Suiten + Remediation-Bestand + `requirementGates.test.ts` (covered-Invariante) → Commit, Push, PR gegen master; Merge erst nach letztem Push + Nach-Merge-Stichprobe.
