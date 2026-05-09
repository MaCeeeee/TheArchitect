# Tier-1 BSH Sprint 1 — Implementation Plan

> **Workflow:** Use superpowers:subagent-driven-development OR direct implementation. Each task uses checkbox (`- [ ]`) for tracking.

**Goal:** MVP für UC-PLATEAU-001 (Plateau-Done-Häkchen) + UC-DATA-001 (Generator-D Business→DataObjects) parallel hochziehen. Beide UCs nach Sprint 1 demo-fähig.

**Approach:** Vertikale je UC (Foundation → API → UI), nicht beide UCs nacheinander. Damit ist das Risiko verteilt und wir haben am Sprint-Ende beide vorzeigbar.

**Sprint-Scope:** 6 Implementation-REQs + 1 PoC-Side-Quest

**Linear:** [THE-218](https://linear.app/thearchitect/issue/THE-218), [THE-219](https://linear.app/thearchitect/issue/THE-219), [THE-220](https://linear.app/thearchitect/issue/THE-220), [THE-229](https://linear.app/thearchitect/issue/THE-229), [THE-230](https://linear.app/thearchitect/issue/THE-230), [THE-232](https://linear.app/thearchitect/issue/THE-232)

**RVTM:** [docs/superpowers/rvtm/2026-05-07-tier1-bsh-backlog-rvtm.md](../rvtm/2026-05-07-tier1-bsh-backlog-rvtm.md)

---

## Reihenfolge & Dependencies

```
Track A — UC-PLATEAU-001 (Plateau-Done-Häkchen)
    REQ-PLATEAU-001 (Schema)  →  REQ-PLATEAU-002 (Endpoint)  →  REQ-PLATEAU-003 (UI)

Track B — UC-DATA-001 (Generator D)
    REQ-DATA-001 (LLM-Service) → REQ-DATA-002 (Validation) → REQ-DATA-004 (UI-Button)

Side-Quest — Similarity-PoC (Wochenende, 2-3h Time-Box)
    sentence-transformers + 50 Demo-Elements + Notebook-UI
```

Tracks laufen unabhängig parallel. Decision-Gate Ende Sprint 1: PoC-Ergebnis bestimmt ob Sprint 2 die Similarity-Service-Production triggert.

---

## Task 1 — REQ-PLATEAU-001 (Schema-Erweiterung)

**Linear:** [THE-218](https://linear.app/thearchitect/issue/THE-218) | **Score:** 77.1 | **Estimate:** 30 Min

**Files:**
- Modify: `packages/shared/src/types/roadmap.types.ts:22` (WaveElement interface)

**Steps:**
- [ ] **1.1 Schema-Erweiterung** — drei optionale Felder anfügen
- [ ] **1.2 Type-Check** — `cd packages/shared && npm run build`
- [ ] **1.3 Commit** — `feat(roadmap-schema): add WaveElement.implementedAt/By/Note (REQ-PLATEAU-001)`

**Acceptance:**
- TypeScript kompiliert
- Bestehende Roadmaps lesen weiterhin OK (Felder optional)
- Mongoose `Schema.Types.Mixed` akzeptiert die neuen Felder ohne Migration

**Verification:** Type-Check ✅ + manuell: alte Roadmap-Mongo-Doc laden, Felder default `undefined`

---

## Task 2 — REQ-DATA-001 (LLM-Service generateDataObjectsFromProcess)

**Linear:** [THE-229](https://linear.app/thearchitect/issue/THE-229) | **Score:** 82.9 | **Estimate:** 2-3h

**Files:**
- Create: `packages/server/src/services/dataObjectGenerator.service.ts`
- Reuse-Pattern from: `packages/server/src/services/activityGenerator.service.ts`

**Steps:**
- [ ] **2.1 Service-Skelett** — Funktion `generateDataObjectsFromProcess(processId)` mit Streaming-Helper-Pattern
- [ ] **2.2 LLM-Prompt** — *"Welche Daten produziert/konsumiert dieser Process? Pro Datum: name, dataClass (PII/Transactional/Master/Reference), crudOperations (C/R/U/D), sensitivity (PII/confidential/internal/public)."*
- [ ] **2.3 Output-Parsing** — Markdown-Fence-Stripper (analog MiroFish-Parser von gestern), Zod-Validation für `{name, dataClass, sensitivity, crudOperations, description}[]`
- [ ] **2.4 Test:** BSH "Collect Emissions Data" Process → erwartet ≥3 Data-Objects (Emissions-Record, Facility-Master, Audit-Log)
- [ ] **2.5 Commit** — `feat(data-gen): generateDataObjectsFromProcess service (REQ-DATA-001)`

**Acceptance:**
- Service liefert `Promise<DataObjectSuggestion[]>` per Streaming
- Token-Cost geloggt
- Failure-Mode: bei LLM-Error returns empty array + warn-log (nicht throw)

**Verification:** Unit-Test mit BSH-Demo-Process

---

## Task 3 — REQ-PLATEAU-002 (PATCH-Endpoint)

**Linear:** [THE-219](https://linear.app/thearchitect/issue/THE-219) | **Score:** 80.0 | **Estimate:** 1-2h

**Files:**
- Modify: `packages/server/src/routes/roadmap.routes.ts`

**Steps:**
- [ ] **3.1 Route-Definition:** `PATCH /api/projects/:projectId/roadmaps/:roadmapId/waves/:waveNumber/elements/:elementId/implementation`
- [ ] **3.2 Zod-Schema:** Body `{implemented: boolean, note?: string}`
- [ ] **3.3 Implementation:** Mongo-Update auf `roadmap.waves[N].elements[M]` mit `implementedAt = new Date() || null`, `implementedBy = userId`, `implementationNote`
- [ ] **3.4 Idempotenz:** zweiter Call mit gleichem Wert → 200 (no-op), kein doppelter Audit-Log
- [ ] **3.5 Audit:** existing `audit({action: 'mark_implementation', entityType: 'wave_element'})` middleware
- [ ] **3.6 Permission:** Vorerst `requirePermission(PERMISSIONS.ANALYTICS_SIMULATE)` (existing) — `ROADMAP_UPDATE` kommt in REQ-PLATEAU-010
- [ ] **3.7 Tests:** Supertest für (a) toggle-true, (b) double-toggle idempotent, (c) 404 bei unknown roadmap, (d) 400 bei invalidem Body
- [ ] **3.8 Commit** — `feat(roadmap-api): PATCH endpoint mark wave-element implementation (REQ-PLATEAU-002)`

**Acceptance:** alle 4 Test-Cases grün

---

## Task 4 — REQ-DATA-002 (Schema-Validation)

**Linear:** [THE-230](https://linear.app/thearchitect/issue/THE-230) | **Score:** 71.4 | **Estimate:** 1h

**Files:**
- Modify: `packages/server/src/services/dataObjectGenerator.service.ts` (Validator-Block)
- Reuse: `packages/shared/src/constants/archimate-rules.ts`

**Steps:**
- [ ] **4.1 Validator-Function:** `validateDataObjectSuggestion(s)` checkt: layer === 'information', type ∈ {data_object, data_entity, data_model}, sensitivity ∈ {PII, confidential, internal, public}
- [ ] **4.2 Filter-Pattern:** invalid suggestions werden verworfen + `console.warn('[DataGen] dropped invalid suggestion: ...')` — nie silent
- [ ] **4.3 Test:** Hand-craftet invalides LLM-Output (z.B. `type: 'business_thing'`) → wird verworfen, Warning geloggt
- [ ] **4.4 Test:** valides Output → 100% durchgelassen
- [ ] **4.5 Commit** — `feat(data-gen): schema-validation against ArchiMate rules (REQ-DATA-002)`

**Acceptance:** Hallucinierter Type kommt nie in den User-Output

---

## Task 5 — REQ-PLATEAU-003 (UI-Checkbox in WaveCard)

**Linear:** [THE-220](https://linear.app/thearchitect/issue/THE-220) | **Score:** 80.0 | **Estimate:** 2-3h

**Files:**
- Modify: `packages/client/src/components/analytics/WaveCard.tsx`
- Modify: `packages/client/src/services/api.ts` (neuer `roadmapAPI.markImplementation`)
- Modify: `packages/client/src/stores/roadmapStore.ts` (optimistic update)

**Steps:**
- [ ] **5.1 API-Client:** `roadmapAPI.markImplementation(projectId, roadmapId, waveNumber, elementId, opts)`
- [ ] **5.2 Store-Action:** `markImplementation` mit optimistic update + rollback bei API-Error
- [ ] **5.3 Checkbox-UI:** Custom-Checkbox-Component links neben jedem Element in Wave-Card-Liste
- [ ] **5.4 Visual-State:** abgehakt → grünes ✓-Icon + leicht gedimmtes Element-Background
- [ ] **5.5 Manuell-Test:** Klick → optimistic ✓ → API-Call → bei Reload ✓ persistiert
- [ ] **5.6 Manuell-Test:** Server kurz down → API-Error → State revertiert → Toast.error
- [ ] **5.7 Commit** — `feat(roadmap-ui): wave-element implemented checkbox (REQ-PLATEAU-003)`

**Acceptance:** Klick-Reload-Cycle funktioniert für mind. 1 Demo-Wave

---

## Task 6 — REQ-DATA-004 (UI-Button Generate Data-Objects)

**Linear:** [THE-232](https://linear.app/thearchitect/issue/THE-232) | **Score:** 74.3 | **Estimate:** 3-4h

**Files:**
- Create: `packages/client/src/components/copilot/DataObjectSuggestionModal.tsx`
- Modify: `packages/client/src/components/ui/PropertyPanel.tsx` (Button-Block bei Process/Capability/Activity-Types)
- Modify: `packages/server/src/routes/aiGenerator.routes.ts` (neuer POST-Route)
- Modify: `packages/client/src/services/api.ts`

**Steps:**
- [ ] **6.1 Server-Route:** `POST /api/projects/:projectId/processes/:processId/generate-data-objects` ruft `dataObjectGenerator.service.generateDataObjectsFromProcess`
- [ ] **6.2 Client-API:** `aiGeneratorAPI.generateDataObjectsForProcess(...)`
- [ ] **6.3 Modal-Component:** analog `ProcessSuggestionModal.tsx` — Streaming-Output + Per-Item-Toggle + Sensitivity-Color-Pill + Bulk-Apply
- [ ] **6.4 PropertyPanel-Integration:** Button "✨ Generate Data-Objects" wenn `element.type ∈ {process, business_process, business_capability, activity}`
- [ ] **6.5 Apply-Action:** akzeptierte Data-Objects via `architectureAPI.createElement` + `createConnection` mit access-Type (REQ-DATA-003 wäre Pre-Req für sauberen access-Type — V1 fallback: generic `association`-Connection, in Sprint 2 upgrade)
- [ ] **6.6 Manueller-E2E-Test:** Klick auf BSH "Collect Emissions Data" → Modal öffnet → Vorschläge erscheinen streamend → 3 akzeptiert → Reload → Data-Objects in 3D sichtbar
- [ ] **6.7 Commit** — `feat(data-gen): generate data-objects from process UI (REQ-DATA-004)`

**Acceptance:** End-to-End-Flow funktioniert für 1 BSH-Demo-Process

---

## Side-Quest — Similarity-PoC (Wochenende, 2-3h)

**Files:**
- Create: `notebooks/predictive-poc/element-similarity.ipynb`

**Steps:**
- [ ] **PoC-1:** `pip install sentence-transformers qdrant-client`
- [ ] **PoC-2:** Export 5 Demo-Projekte aus Mongo + Neo4j als JSON
- [ ] **PoC-3:** Embed alle Elements via `sentence-transformers/all-mpnet-base-v2` mit Input `{name + description + type + layer}`
- [ ] **PoC-4:** Qdrant-Index lokal (nicht der Production-Qdrant!) für ~1000 Elements
- [ ] **PoC-5:** UI: gib Element-Name ein → top-10 ähnlichste Elements rausgeben
- [ ] **PoC-6:** **5 Test-Queries** mit Erwartungen — mind. 4/5 müssen "intuitiv sinnvolle" Treffer geben

**Decision-Gate:** ja → Sprint 2 baut `elementSimilarity.service.ts` Production. nein → Generator-D bleibt Variante A, Reuse-Mode kommt später.

---

## Sprint-Bilanz nach Abschluss

**Was funktioniert:**
- ✅ User kann in der Roadmap Wave-Elements als "implementiert" abhaken (volles UC-PLATEAU-001-MVP)
- ✅ User kann von einem Process aus Data-Objects generieren lassen (UC-DATA-001-MVP, Variante A: immer neu)
- ✅ Beide Flows demo-fähig für nächsten BSH-Touchpoint

**Was noch fehlt für vollständige UCs (kommt in Sprint 2):**
- Plateau-Progress-Bar (REQ-PLATEAU-004)
- Audit-Trail + RBAC (REQ-PLATEAU-009/010)
- Element-Status-Sync (REQ-PLATEAU-008)
- Auto-Connection access-Relationship (REQ-DATA-003) — V1 nutzt generic association
- Sensitivity-Color-Coding (REQ-DATA-008)
- DSGVO-Hook (REQ-DATA-009)
- Bulk-Mode + Lineage + CRUD-Export (REQ-DATA-005/006/007)

**Strategischer Bonus:**
- Similarity-PoC entscheidet Sprint-2-Track
- Foundation für UC-RED-001 + UC-HARM-001 ist nach PoC klarer

---

## Operative Hygiene während Sprint 1

- Jeder REQ-Commit referenziert Linear-Issue-ID
- TypeScript-Strict bleibt grün (CI würde sonst rot)
- Keine SQL-Injection / XSS / RBAC-Bypass-Lücken einbauen
- Status-Transitions in Linear pflegen (Backlog → In Progress → In Review → Done)
- Bei Discoveries die nicht-trivial sind: separat als Linear-Issue dokumentieren, nicht in den REQ stopfen
