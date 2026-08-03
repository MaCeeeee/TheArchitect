# THE-565 (REQ-001.6) — Bidirektionale Traceability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kette ist in beide Richtungen verfolgbar — vorwärts (Norm → Klauseln → Anforderungen → Maßnahmen: Coverage) und rückwärts (Element → Anforderungen → Gesetze: „Tool ausmustern → welche Gesetze brechen?") — und eine Novelle staled nur die tatsächlich veränderten Klauseln (REQ-REQTRACE-001.6 / THE-565).

**Pre-Flight-Fazit (2026-08-03):**
- **Bestand:** Rückwärts existiert roh (`GET /by-element/:elementId`, THE-305 — liefert nackte Requirements ohne Frist/Rechtsgrundlage/Impact); vorwärts existiert auf Norm-Ebene (Audit-Bundle THE-559 — kennt keine Klauseln). Alle Bausteine für die Anreicherung liegen: `chain.clauseContentId` + `StakeholderRequirement.clause/deadline` (Phase 1), Gates (THE-557), `segmentClauses` deterministisch (Lauf-4-Suiten), contentId novellen-fest (THE-550: 30/30).
- **Prämissen: keine geglaubte.** Alles mechanisch, kein LLM. Datenlage ehrlich: Legacy-Requirements (reqgen) haben keinen Klausel-Anker — sie erscheinen getrennt als „without clause anchor", nie rückwirkend interpretiert (ADR-0008).
- **Text-Quelle für den Klausel-Drift verifiziert:** `getPipelineNorm(projectId, ref).sections[].content` liefert den aktuellen Normtext für **beide** Welten (corpus + upload) — dieselbe Quelle wie die Generate-Route.
- **Score:** BV 4 · Risk 3 · Impl 4 · Success 5 (kein LLM) · Compliance 5 · Rel 5 · Urg 3 · Status 3 → **≈ 84**. **Ousterhout:** überall niedrig bis niedrig-mittel. **Watch-Points:** (1) die THE-305-Route bleibt **byte-gleich** — die reichere Rückwärts-Sicht ist eine NEUE Route; (2) Routen-Reihenfolge (`/trace/*` als explizite Pfade vor `:id`); (3) Drift nur als **expliziter** Aufruf in diesem Slice (Anschluss an den Drift-Cron ist Folgearbeit, vermerkt).

**Architecture:** Ein rein lesender `traceability.service` (forward/backward) + ein mechanischer `chainDrift`-Pass (Re-Segmentierung → contentId-Diff → nur verschwundene Klauseln stalen, Wiederverwendung der THE-558-Bausteine). Zwei GET-Routen + ein expliziter POST. UI: Rückwärts-Anreicherung in der bestehenden `RequirementsForElementSection` (additiv), vorwärts als kleines `ClauseCoveragePanel`.

**Tech Stack:** TypeScript, Mongoose, jest + memory-server, vitest. Kein LLM.

**RVTM:** docs/superpowers/rvtm/2026-08-03-the565-traceability-rvtm.md

---

## Chunk 1: Service (Tasks 1–2) + Routen (Task 3)

### Task 1: `traceability.service.forwardTrace`

**Files:**
- Create: `packages/server/src/services/traceability.service.ts`
- Test: `packages/server/src/__tests__/traceabilityForwardDb.test.ts` (memory-server)

- [ ] **Step 1: Failing test** — Fixtures: 2 Chain-Requirements derselben Klausel (`chain.clauseContentId` gleich, via StR mit Klausel-Snapshot + deadline), 1 Chain-Requirement anderer Klausel, 1 Legacy-Requirement (ohne `chain`):
  - `forwardTrace(projectId)` gruppiert nach `regulationKey` → je Klausel {contentId, path, text (Snapshot), requirements: [{id, title, gates-Zustand, linkedElementIds}]}; die Zwei-Requirements-Klausel trägt beide.
  - Legacy erscheint unter `withoutClauseAnchor` (Anzahl + Ids) — getrennt, nie geraten.
  - Klausel ohne verlinkte Elemente ist als solche erkennbar (die Coverage-Lücke ist der Punkt der Ansicht).
- [ ] **Step 2: rot** · **Step 3: Implementierung** (Join Requirement→StR über `chain.stakeholderRequirementIds[0]` für Snapshot+deadline; rein lesend; Kommentar-Kopf: Vorwärts = „was verlangt die Norm, Klausel für Klausel — und wo steht es?").
- [ ] **Step 4: grün** · **Step 5: Commit** `feat(the-565): forwardTrace — Norm nach Klauseln, Anforderungs- und Massnahmen-Stand je Klausel`

### Task 2: `traceability.service.backwardTrace` — das Ausmustern-Szenario

**Files:**
- Modify: `packages/server/src/services/traceability.service.ts`
- Test: `packages/server/src/__tests__/traceabilityBackwardDb.test.ts`

- [ ] **Step 1: Failing test** — Fixtures: Requirement A (Element `el-x` als EINZIGES, Chain mit deadline ⟨72 h, kenntnis⟩), Requirement B (`el-x` + `el-y`), Requirement C (nur `el-y`):
  - `backwardTrace(projectId, 'el-x')` liefert A+B, je mit `legalBasis` (regulationKey bzw. legacy-Fallback normId/sourceParagraph), `deadline` (aus der StR, null wenn keine), `gates`, und `soleCoverage: true` NUR für A.
  - `impact`: {wouldLoseCoverage: 1 (nur A — covered fiele auf no), laws: ['nis2']} — die Antwort auf „Tool ausmustern → welche Gesetze brechen?".
  - C erscheint nicht.
- [ ] **Step 2: rot** · **Step 3: Implementierung** (Impact ist `deriveCovered`-Semantik: verlöre das Requirement sein letztes Element? — mechanisch, kein Orakel; Kommentar sagt das).
- [ ] **Step 4: grün** · **Step 5: Commit** `feat(the-565): backwardTrace — Element zu Anforderungen samt Frist, Rechtsgrundlage und Ausmustern-Impact`

### Task 3: Routen — additiv, THE-305 bleibt byte-gleich

**Files:**
- Modify: `packages/server/src/routes/requirements.routes.ts`

- [ ] **Step 1–3:** `GET /:projectId/requirements/trace/forward` (viewer) + `GET /:projectId/requirements/trace/by-element/:elementId` (viewer) — dünne Handler auf den Service; die bestehende `/by-element/:elementId`-Route bleibt unverändert (THE-305-Konsumenten!). Registrierung VOR den `:id`-Routen (bei den Harmonization-Routen).
- [ ] **Step 4: tsc + Reihenfolge geprüft** · **Step 5: Commit** `feat(the-565): trace-Routen — vorwaerts und rueckwaerts, Bestand byte-gleich`

## Chunk 2: Klausel-Drift (Task 4) + UI (Task 5) + Abschluss (Task 6)

### Task 4: `chainDrift` — eine Novelle staled nur die veränderten Klauseln

**Files:**
- Modify: `packages/server/src/services/traceability.service.ts` (oder eigener `chainDrift.service.ts`, wenn > ~80 Zeilen)
- Modify: `packages/server/src/routes/requirements.routes.ts` (POST `/:projectId/requirements/trace/drift-check`, editor, explizit)
- Test: `packages/server/src/__tests__/chainDriftDb.test.ts`

- [ ] **Step 1: Failing test** — Fixtures: 2 Chain-Requirements zu (normId, sectionEId) mit contentIds aus dem ECHTEN Segmenter über einen Fixture-Text; `getPipelineNorm` gemockt:
  - Unveränderter Text → `{checked: 2, staled: 0}`; nichts angefasst.
  - **Umnummerierende Novelle** (das THE-550-Szenario als Produkttest): Klausel von Requirement 1 textlich verändert, Requirement 2 unverändert → NUR Requirement 1 bekommt `regulationVersionMismatch: true`; Requirement 2 bleibt byte-gleich — **das ist der gemessene Vorteil der contentId (24/30 vs 30/30) als Produktverhalten**.
  - Gestaltes Requirement: zugehörige frische Evidenz wird `stale`, `attested: yes` fällt via `resetAttestedForStale` mit sichtbarem Grund (Wiederverwendung THE-558 — EINE Quelle).
  - Welt ohne abrufbaren Text (getPipelineNorm null) → `skipped` gezählt, nie still.
- [ ] **Step 2: rot** · **Step 3: Implementierung** — je distinct (normId, sectionEId) der Chain-Requirements: aktuellen `section.content` holen → `segmentClauses` → contentId-Set → Requirements mit `chain.clauseContentId ∉ Set` markieren + Evidenz-Pass. Expliziter POST; **Anschluss an den bestehenden Drift-Cron ist benannte Folgearbeit**, nicht Teil dieses Slices.
- [ ] **Step 4: grün** · **Step 5: Commit** `feat(the-565): chainDrift — Novelle staled nur die veraenderte Klausel (THE-550 als Produktverhalten)`

### Task 5: UI — Rückwärts anreichern, vorwärts sichtbar

**Files:**
- Modify: `packages/client/src/components/compliance/RequirementsForElementSection.tsx` (additiv: Frist-Chip, Rechtsgrundlage, Ausmustern-Warnung)
- Create: `packages/client/src/components/compliance/ClauseCoveragePanel.tsx` (+ Montage CompliancePage)
- Modify: `packages/client/src/services/api.ts` (traceAPI + Typen)
- Test: bestehende Section-Tests erweitern + `ClauseCoveragePanel.test.tsx` (vitest)

- [ ] **Step 1: Failing tests** — Section: bei `soleCoverage` erscheint „Retiring this element breaks N law(s)"-Warnung; Frist als Chip („72h from knowledge"). Panel: je Klausel Pfad + Anforderungszahl + Gates-Ampel; `withoutClauseAnchor` als eigener Hinweis; leerer Zustand ist ein gültiges Ergebnis.
- [ ] **Step 2: rot** · **Step 3: Implementierung** (UI-Strings Englisch; bestehende Palette; die Section nutzt die NEUE trace-Route, fällt aber bei Fehler auf das alte Verhalten zurück — kein Regressionsrisiko).
- [ ] **Step 4: vitest + client tsc grün** · **Step 5: Commit** `feat(the-565): Traceability sichtbar — Frist, Rechtsgrundlage, Ausmustern-Warnung, Klausel-Coverage`

### Task 6: RVTM + Abschluss

- [ ] RVTM gegen die 3 THE-565-ACs (AC 3 zweigeteilt: Richtungen-über-contentId ✅ Ansicht, Novelle-staled-nur-Veränderte ✅ Drift) + benannte Folgearbeit (Drift-Cron-Anschluss).
- [ ] Gesamtlauf (neue Suiten + Drift/Evidenz/Gates/Reqtrace-Bestand + client); Commit, Push, PR; Merge nach letztem Push + Stichprobe.
