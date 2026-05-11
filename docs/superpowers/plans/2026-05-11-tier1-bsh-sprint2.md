# Tier-1 BSH Sprint 2 — Implementation Plan

> **Workflow:** subagent-driven-development OR direct implementation. Each task uses checkbox (`- [ ]`).

**Goal:** Sprint 1 hat beide UCs als MVP geliefert. Sprint 2 macht beide **Production-ready** und legt parallel die **Similarity-Foundation** für die Tier-3-UCs (UC-RED-001 + UC-HARM-001) — getriggert durch das 5/5-PASS-Ergebnis des PoC vom 2026-05-11.

**Approach:** 3 Tracks parallel. Foundation-Track (A) hat hohe Priorität wegen Score 88.6 auf REQ-SIM-005 (DSGVO-Hard-Stop). Track B + C laufen daneben.

**Sprint-Scope:** 12 REQs in **2 Wochen** (Sprint 1 war 1 Woche, Sprint 2 verdoppelt wegen neuer SIM-Foundation)

**Linear:** [THE-217](https://linear.app/thearchitect/issue/THE-217), [THE-228](https://linear.app/thearchitect/issue/THE-228), [THE-238](https://linear.app/thearchitect/issue/THE-238) (UC-Parents)

**RVTM:** [docs/superpowers/rvtm/2026-05-11-tier1-sprint2-rvtm.md](../rvtm/2026-05-11-tier1-sprint2-rvtm.md)

**PoC-Findings:** [notebooks/predictive-poc/findings.md](../../../notebooks/predictive-poc/findings.md)

---

## Spike-0 — Embedding-Backend-Decision (Woche 1, Tag 0, ~2h)

**Frage:** Wie lassen wir die Embeddings auf Production laufen?

| Option | Pro | Con |
|---|---|---|
| **A — Voyage AI API** (Anthropic-empfohlen) | Keine Infrastructure, sofort skalierbar, Embeddings-as-a-Service | API-Cost ~$0.05 / 1k tokens, Cross-Border-Datenfluss |
| **B — Lokales Python-Sidecar** (PoC-Setup) | Volle Kontrolle, kein API-Cost, DSGVO-clean | Ein neuer Container, Latenz-Overhead via HTTP, Maintenance |
| **C — Anthropic-Voyage** via existing API-Key | Wir haben den Key schon | Voyage ist eigenes Produkt, separater Sub-Account-Setup nötig |

**Spike-Tasks:**
- [ ] **0.1** — 100 BSH-Demo-Elements via Voyage API embedden (mit Cost-Snapshot)
- [ ] **0.2** — Quality-Vergleich mit PoC-Resultat: ist Voyage gleichgut wie all-mpnet-base-v2?
- [ ] **0.3** — Decision dokumentieren in `notebooks/predictive-poc/embedding-backend-decision.md`

**Recommendation upfront:** Option A wenn Voyage-Quality matched, sonst B. Option C ist Option A unter anderem Namen.

---

## Track A — Similarity-Foundation (~4 Tage)

### Task A1 — REQ-SIM-001 (Service-Skelett)
**Linear:** [THE-239](https://linear.app/thearchitect/issue/THE-239) | **Score:** 80.0 | **Estimate:** 1.5d

- [ ] **A1.1** Neues File `packages/server/src/services/elementSimilarity.service.ts`
- [ ] **A1.2** Qdrant-Client-Setup analog `dataServer.service.ts` Pattern
- [ ] **A1.3** Funktion `embedElement(text)` (calls Voyage oder lokal je nach Spike-Decision)
- [ ] **A1.4** Funktion `findSimilarElements(workspaceId, query, opts)` mit Score-Tier-Mapping
- [ ] **A1.5** Funktion `upsertEmbedding(workspaceId, element)` für Re-Embed-Hook
- [ ] **A1.6** Funktion `deleteEmbedding(workspaceId, elementId)` für Element-Delete-Hook
- [ ] **A1.7** Unit-Tests mit Mock-Qdrant (~10 Cases)
- [ ] **A1.8** Commit: `feat(similarity): elementSimilarity.service.ts foundation (REQ-SIM-001)`

### Task A2 — REQ-SIM-005 (Tenant-Isolation, MUSS vor A3)
**Linear:** [THE-243](https://linear.app/thearchitect/issue/THE-243) | **Score:** 88.6 | **Estimate:** 0.5d

- [ ] **A2.1** Qdrant-Collection-Naming: `elements-{workspaceId}` (NIEMALS global)
- [ ] **A2.2** `WorkspaceMismatchError` exception class
- [ ] **A2.3** Service-Methoden werfen Error wenn Caller-Context ≠ Element-Workspace
- [ ] **A2.4** Audit-Log-Entry pro Workspace-Mismatch-Attempt
- [ ] **A2.5** **5 explizite Tenant-Isolation-Tests** (User-A in B → 403, etc.)
- [ ] **A2.6** Commit: `feat(similarity): hard tenant-isolation per workspace (REQ-SIM-005)`

### Task A3 — REQ-SIM-002 (Re-Embed-Hook)
**Linear:** [THE-240](https://linear.app/thearchitect/issue/THE-240) | **Score:** 71.4 | **Estimate:** 1d

- [ ] **A3.1** Hook in `architecture.routes.ts` POST/PUT/DELETE element
- [ ] **A3.2** Async fire-and-forget, response nicht blockieren
- [ ] **A3.3** Skip-Logic: nur-Position-Updates triggern KEIN Re-Embed
- [ ] **A3.4** Bulk-Endpoint `POST /workspaces/:id/elements/reindex`
- [ ] **A3.5** Spy-Test: position-only update → kein embedding-call
- [ ] **A3.6** Commit: `feat(similarity): async re-embed on element write (REQ-SIM-002)`

### Task A4 — REQ-SIM-003 (User-API)
**Linear:** [THE-241](https://linear.app/thearchitect/issue/THE-241) | **Score:** 82.9 | **Estimate:** 0.5d

- [ ] **A4.1** Neue Route `POST /api/projects/:projectId/elements/similar`
- [ ] **A4.2** Zod-Body-Schema mit topK / scoreThreshold / excludeElementIds
- [ ] **A4.3** Auth + Workspace-Resolution + Rate-Limit (max 30/min)
- [ ] **A4.4** Audit-Log bei Cross-Project-Suchen
- [ ] **A4.5** Supertest-Coverage: 5 happy + 3 error cases
- [ ] **A4.6** Commit: `feat(similarity): POST /elements/similar API (REQ-SIM-003)`

---

## Track B — UC-DATA-001 V2 + Compliance (~3 Tage)

### Task B1 — REQ-DATA-008 (Sensitivity-Color 3D)
**Linear:** [THE-236](https://linear.app/thearchitect/issue/THE-236) | **Score:** 82.9 | **Estimate:** 0.5d

- [ ] **B1.1** Schema: `ArchitectureElement.metadata.sensitivity` Type definieren in shared types
- [ ] **B1.2** REQ-DATA-001-Service schreibt sensitivity ins Element-Metadata bei apply
- [ ] **B1.3** 3D-Rendering: Data-Object-Farbe = sensitivity-Color (PII rot, confidential orange, internal yellow, public green)
- [ ] **B1.4** PropertyPanel: Sensitivity als editable dropdown
- [ ] **B1.5** Manual: BSH-Demo-PII-Elemente werden in 3D rot
- [ ] **B1.6** Commit: `feat(data-gen): sensitivity color-coding in 3D + property-panel (REQ-DATA-008)`

### Task B2 — REQ-DATA-003 (Auto-access-Connection)
**Linear:** [THE-231](https://linear.app/thearchitect/issue/THE-231) | **Score:** 77.1 | **Estimate:** 0.5d

Apply-Endpoint ist schon da (Sprint 1), aber nutzt aktuell `association`-fallback wo `access` korrekt wäre. Track A's REQ-DATA-008-Sensitivity macht das jetzt sauberer:

- [ ] **B2.1** apply-data-objects route: korrekte access-Edge mit read|write|read-write Label (war schon V1, nur sauberer)
- [ ] **B2.2** Idempotenz-Test: 2× apply → 1 Connection
- [ ] **B2.3** Commit: `feat(data-gen): cleaner auto-access connection labels (REQ-DATA-003)`

### Task B3 — REQ-SIM-004 (Generator-D V2 Reuse-Mode)
**Linear:** [THE-242](https://linear.app/thearchitect/issue/THE-242) | **Score:** 77.1 | **Estimate:** 0.5d

→ **Diese REQ ist die Antwort auf die Variante-B-Frage vom 2026-05-07 ("wie erkennt man Redundanzen?")**

- [ ] **B3.1** apply-data-objects route ruft `findSimilarElements()` PRO Vorschlag VOR Cypher-Write
- [ ] **B3.2** Score-Tier-Decision-Logic (auto-reuse / confirm / create)
- [ ] **B3.3** Modal-UI bekommt "Reuse Existing"-Option pro Vorschlag bei Score 0.65-0.85
- [ ] **B3.4** Audit-Log `data_object_reused` mit similarityScore
- [ ] **B3.5** Feature-Flag `ENABLE_DATA_OBJECT_SIMILARITY_REUSE` (Production-Safety)
- [ ] **B3.6** Graceful-Fallback auf V1 (same-name) bei Service-Failure
- [ ] **B3.7** Commit: `feat(data-gen): generator-D V2 reuse via similarity (REQ-SIM-004)`

### Task B4 — REQ-DATA-009 (DSGVO-Hook)
**Linear:** [THE-237](https://linear.app/thearchitect/issue/THE-237) | **Score:** 71.4 | **Estimate:** 1d

- [ ] **B4.1** Hook `onElementSensitivityChanged()` triggert nach Generation oder manuellem Edit
- [ ] **B4.2** Bei `sensitivity === 'PII'` UND DSGVO-Standard im Project → erstelle StandardMapping zu Art. 5/6/9
- [ ] **B4.3** Auto-Mapping confidence=0.7, status='partial'
- [ ] **B4.4** Erscheint in Compliance-Matrix für DSGVO-Spalten
- [ ] **B4.5** User-Reject auf 'rejected' setzen + nicht erneut auto-erstellen
- [ ] **B4.6** Manual: DSGVO-Standard hochladen + PII-Element generieren → auto-mapping
- [ ] **B4.7** Commit: `feat(data-gen): GDPR auto-mapping hook for PII elements (REQ-DATA-009)`

---

## Track C — UC-PLATEAU-001 Production-Polish (~1 Tag)

### Task C1 — REQ-PLATEAU-004 (Plateau-Progress-Bar full version)
**Linear:** [THE-221](https://linear.app/thearchitect/issue/THE-221) | **Score:** 71.4 | **Estimate:** 0.5d

Sprint 1 hat eine Mini-Progress-Anzeige geliefert (Header-Badge "X/Y (Z%)"). Diese REQ ist die volle animierte Plateau-View-Bar.

- [ ] **C1.1** Berechnung in `plateauComputation.ts` als Teil der Snapshot-Metriken
- [ ] **C1.2** Render in `PlateauHUD.tsx` oder `PlateauBar.tsx` als animated Bar mit Color-Bands
- [ ] **C1.3** Real-time Update nach Toggle (kein Reload nötig)
- [ ] **C1.4** Unit-Test 0/5/10/15 → korrekte Color-Bands
- [ ] **C1.5** Commit: `feat(roadmap-ui): full animated plateau progress bar (REQ-PLATEAU-004)`

### Task C2 — REQ-PLATEAU-010 (RBAC ROADMAP_UPDATE)
**Linear:** [THE-227](https://linear.app/thearchitect/issue/THE-227) | **Score:** 71.4 | **Estimate:** 0.5d

- [ ] **C2.1** Neue Permission `ROADMAP_UPDATE` in `packages/shared/src/constants/permissions.ts`
- [ ] **C2.2** PATCH-endpoint (REQ-PLATEAU-002) tauscht ANALYTICS_SIMULATE → ROADMAP_UPDATE
- [ ] **C2.3** WaveCard-Checkbox: disabled-State + Tooltip für User ohne Permission
- [ ] **C2.4** Token mit Viewer-Rolle: API → 403, Checkbox disabled
- [ ] **C2.5** Commit: `feat(roadmap-rbac): ROADMAP_UPDATE permission for implementation toggle (REQ-PLATEAU-010)`

---

## Sprint-Bilanz nach Sprint 2

**Was funktioniert dann production-ready:**
- ✅ UC-PLATEAU-001 vollständig (Done-Häkchen + Progress-Bar + Audit + RBAC; Sprint-3-Polish noch übrig)
- ✅ UC-DATA-001 V2 mit echtem Similarity-Reuse + Sensitivity-Coloring + DSGVO-Hook
- ✅ UC-SIM-001 als Foundation für Tier-3 (UC-RED-001 + UC-HARM-001)

**Was noch in Sprint 3 kommt (Polish):**
- REQ-PLATEAU-005/006/007/008/009 (Header-Progress, 3D-Badge, Filter, Status-Sync, Audit-Filter)
- REQ-DATA-005/006/007 (Bulk-Mode, Lineage-View, CRUD-Export)
- → 8 REQs für Sprint 3

**Strategischer Stand:**
- Tier-1 fast Production-ready
- Tier-3-UCs (UC-RED-001 + UC-HARM-001) können starten sobald Tier-1 done — Foundation steht
- Tier-2-UCs (UC-CRIT-001 + UC-EXEC-001) brauchen weiterhin BSH-Concept-Workshops

---

## Operative Hygiene

- Jeder REQ-Commit referenziert Linear-Issue-ID
- Spike-0 Decision-Doc commit'en BEVOR Track A startet
- TypeScript-Strict bleibt grün (CI-Check)
- Tests pro REQ wo Failure-Chain droht (analog Sprint-1's 51 Tests)
- Linear-Status-Transitions pflegen (Backlog → In Progress → Done)
- Bei unerwarteten Discoveries: separate Linear-Issue, nicht in den REQ stopfen

---

## Was NICHT in Sprint 2 ist (bewusst out-of-scope)

- UC-RED-001 + UC-HARM-001 Implementation (Tier-3, brauchen erst stabile SIM-Foundation)
- UC-DATA-001 V3 mit Field-Level-Schemas (V2-Daten brauchen Connector-Inspection)
- UC-CRIT-001 + UC-EXEC-001 (Tier-2, brauchen Workshops)
- Performance-Tuning >10k Elements (Sprint 3 wenn Bedarf)
- Cross-Workspace-Search-UI (Admin-Feature, post-V1)

---

## Aktueller Status 2026-05-11

- ✅ Sprint 1 deployed-ready (8 Commits, alle Tests grün)
- ✅ Predictive-Architecture-PoC durch (5/5 PASS)
- ✅ Linear-Issues für UC-SIM-001 angelegt (THE-238..243)
- ✅ RVTM aktualisiert mit Sprint-2-Top-10
- ✅ **Dieses Sprint-2-Plan-Doc**
- ⏸ **User-Sign-Off auf 12 REQs in 2 Wochen Sprint 2**
- ⏸ Spike-0 (Voyage vs lokales Inference) — Anfang Woche 1

Sobald Sign-Off da ist, starten wir mit Spike-0 oder direkt mit REQ-SIM-001 + REQ-PLATEAU-004 (Track A + C parallel).
