# RVTM: Tier-1 BSH Post-Demo Backlog — WSJF Scoring

**Source:** [docs/superpowers/specs/2026-05-06-bsh-feedback-capture.md](../specs/2026-05-06-bsh-feedback-capture.md)
**Linear Parents:** UC-PLATEAU-001 → [THE-217](https://linear.app/thearchitect/issue/THE-217), UC-DATA-001 → [THE-228](https://linear.app/thearchitect/issue/THE-228)
**Owner:** Matze Ganzmann | **Quelle:** BP_Javis.xlsx Scoring-Schema
**Generated:** 2026-05-07 (nach BSH-Demo, Pre-Flight bereits durch)
**Total scored:** 19 REQs (10 PLATEAU + 9 DATA)

**Scoring:** 0–5 Punkte je Kriterium, 7 Kriterien × 12,5% Gewicht; Status = derived. Formel: `Σ(7 × 0–5) / 35 × 100`.

**Skala-Konvention:**
- BizValue / BizRisk / Compliance / Urgency / Relations / Success: 5 = maximal, 0 = irrelevant
- ImplChall: **5 = leicht/feasible, 0 = blockierend komplex** (höher = niedrigere Hürde)

---

## Top-5 Sprint-1-Recommendation (Dependency-Order, nicht reine Score-Order)

| # | Linear | REQ | Score | Reason für Sprint-1-Position |
|:---:|--------|-----|:-----:|------|
| 1 | THE-218 | REQ-PLATEAU-001 — Datenmodell Schema-Erweiterung | **77,1** | Foundation für alle PLATEAU-REQs (Mongo-Schema-Erweiterung, kein Migration-Drama dank Mixed-Type) |
| 2 | THE-229 | REQ-DATA-001 — LLM-Service `generateDataObjectsFromProcess` | **82,9** | Foundation für alle DATA-REQs (Pattern aus activityGenerator existiert, sofort startbar) |
| 3 | THE-219 | REQ-PLATEAU-002 — PATCH-Endpoint Implementation | **80,0** | API-Layer für PLATEAU, blockiert UI in REQ-PLATEAU-003 |
| 4 | THE-230 | REQ-DATA-002 — Schema-Validation gegen ArchiMate-Rules | **71,4** | Safety-Net gegen LLM-Hallucinations, muss VOR User-Exposure stehen |
| 5 | THE-220 | REQ-PLATEAU-003 — UI-Checkbox in WaveCard | **80,0** | Erstes User-sichtbares Feature, Demo-Wert |

**Sprint-1-Outcome (Vorschlag):**
- ✅ MVP **UC-PLATEAU-001** (Datenmodell + API + Checkbox sichtbar)
- ✅ Foundation **UC-DATA-001** (Service + Validation produktionsreif, UI noch ausstehend)

→ Nach Sprint-1 hast du beide UCs vorzeigbar in einer Mini-Demo, eine voll funktional, eine als API-only.

---

## Traceability Matrix (sortiert nach Priority Score)

| Rank | Linear | REQ | UC | Score | Status | Verification |
|:---:|--------|-----|----|:-----:|--------|:------------:|
| 1 | THE-229 | REQ-DATA-001 — LLM-Service generateDataObjectsFromProcess | DATA | **82,9** | Backlog | Test |
| 1 | THE-236 | REQ-DATA-008 — Sensitivity-Tagging mit Color-Coding | DATA | **82,9** | Backlog | Demo |
| 3 | THE-219 | REQ-PLATEAU-002 — PATCH-Endpoint Wave-Element-Implementation | PLATEAU | **80,0** | Backlog | Test |
| 3 | THE-220 | REQ-PLATEAU-003 — UI-Checkbox in WaveCard | PLATEAU | **80,0** | Backlog | Demo |
| 5 | THE-218 | REQ-PLATEAU-001 — Datenmodell `WaveElement.implementedAt/By/Note` | PLATEAU | **77,1** | Backlog | Test |
| 5 | THE-231 | REQ-DATA-003 — Auto-Connection Process → Data-Object via access | DATA | **77,1** | Backlog | Test |
| 7 | THE-232 | REQ-DATA-004 — UI-Button "Generate Data-Objects" in PropertyPanel | DATA | **74,3** | Backlog | Demo |
| 8 | THE-221 | REQ-PLATEAU-004 — Plateau-Progress-Bar (color-coded) | PLATEAU | **71,4** | Backlog | Demo |
| 8 | THE-227 | REQ-PLATEAU-010 — RBAC ROADMAP_UPDATE-Permission | PLATEAU | **71,4** | Backlog | Test |
| 8 | THE-230 | REQ-DATA-002 — Schema-Validation gegen ArchiMate-Data-Object-Rules | DATA | **71,4** | Backlog | Test |
| 8 | THE-237 | REQ-DATA-009 — Compliance-Hook PII → Auto-Mapping DSGVO | DATA | **71,4** | Backlog | Demo |
| 12 | THE-226 | REQ-PLATEAU-009 — Audit-Trail-Eintrag pro Toggle | PLATEAU | **68,6** | Backlog | Test |
| 13 | THE-225 | REQ-PLATEAU-008 — Optional Element-Status-Sync (Confirm) | PLATEAU | **65,7** | Backlog | Demo |
| 14 | THE-235 | REQ-DATA-007 — CRUD-Matrix-Export (CSV/PDF) | DATA | **62,9** | Backlog | Demo |
| 15 | THE-222 | REQ-PLATEAU-005 — Roadmap-Header Gesamt-Progress + Jump-to-Next | PLATEAU | **60,0** | Backlog | Demo |
| 15 | THE-233 | REQ-DATA-005 — Bulk-Mode "for whole project" | DATA | **60,0** | Backlog | Demo |
| 17 | THE-223 | REQ-PLATEAU-006 — 3D-Check-Badge auf implementierten Elementen | PLATEAU | **54,3** | Backlog | Demo |
| 17 | THE-224 | REQ-PLATEAU-007 — Filter-Toggle Outstanding/Implemented/All | PLATEAU | **54,3** | Backlog | Demo |
| 17 | THE-234 | REQ-DATA-006 — Data-Lineage-View (3D-Filter) | DATA | **54,3** | Backlog | Demo |

---

## Scoring Detail

### UC-PLATEAU-001 (Plateau-Checkbox)

| Linear | REQ | BizValue | BizRisk | ImplChall | Success | Compliance | Relations | Urgency | Score |
|--------|-----|:--------:|:-------:|:---------:|:-------:|:----------:|:---------:|:-------:|------:|
| THE-218 | REQ-PLATEAU-001 (Schema) | 3 | 3 | 5 | 5 | 2 | 5 | 4 | **77,1** |
| THE-219 | REQ-PLATEAU-002 (Endpoint) | 4 | 3 | 4 | 5 | 3 | 5 | 4 | **80,0** |
| THE-220 | REQ-PLATEAU-003 (Checkbox UI) | 5 | 4 | 4 | 5 | 1 | 4 | 5 | **80,0** |
| THE-221 | REQ-PLATEAU-004 (Progress-Bar) | 5 | 3 | 4 | 5 | 1 | 3 | 4 | **71,4** |
| THE-222 | REQ-PLATEAU-005 (Header-Progress) | 4 | 2 | 4 | 5 | 1 | 2 | 3 | **60,0** |
| THE-223 | REQ-PLATEAU-006 (3D-Badge) | 4 | 2 | 3 | 4 | 1 | 2 | 3 | **54,3** |
| THE-224 | REQ-PLATEAU-007 (Filter-Toggle) | 3 | 2 | 4 | 5 | 1 | 2 | 2 | **54,3** |
| THE-225 | REQ-PLATEAU-008 (Status-Sync) | 4 | 3 | 3 | 4 | 3 | 3 | 3 | **65,7** |
| THE-226 | REQ-PLATEAU-009 (Audit) | 2 | 3 | 5 | 5 | 5 | 1 | 3 | **68,6** |
| THE-227 | REQ-PLATEAU-010 (RBAC) | 2 | 4 | 4 | 5 | 4 | 3 | 3 | **71,4** |

### UC-DATA-001 (Generator D Business → Data-Objects)

| Linear | REQ | BizValue | BizRisk | ImplChall | Success | Compliance | Relations | Urgency | Score |
|--------|-----|:--------:|:-------:|:---------:|:-------:|:----------:|:---------:|:-------:|------:|
| THE-229 | REQ-DATA-001 (LLM-Service) | 5 | 4 | 3 | 4 | 4 | 5 | 4 | **82,9** |
| THE-230 | REQ-DATA-002 (Validation) | 3 | 3 | 4 | 5 | 3 | 4 | 3 | **71,4** |
| THE-231 | REQ-DATA-003 (Auto-Connection) | 4 | 3 | 4 | 5 | 3 | 4 | 4 | **77,1** |
| THE-232 | REQ-DATA-004 (UI-Button) | 5 | 3 | 4 | 5 | 2 | 3 | 4 | **74,3** |
| THE-233 | REQ-DATA-005 (Bulk-Mode) | 5 | 2 | 3 | 4 | 2 | 2 | 3 | **60,0** |
| THE-234 | REQ-DATA-006 (Lineage-View) | 4 | 2 | 3 | 4 | 2 | 2 | 2 | **54,3** |
| THE-235 | REQ-DATA-007 (CRUD-Export) | 4 | 2 | 4 | 5 | 4 | 1 | 2 | **62,9** |
| THE-236 | REQ-DATA-008 (Sensitivity) | 5 | 3 | 4 | 5 | 4 | 4 | 4 | **82,9** |
| THE-237 | REQ-DATA-009 (DSGVO-Hook) | 5 | 4 | 3 | 4 | 5 | 1 | 3 | **71,4** |

---

## Sprint-Plan-Vorschlag

### Sprint 1 (1-2 Wochen) — MVP beider UCs vertikal

**Vertikale UC-PLATEAU-001 (Foundation → UI):**
1. THE-218 — Schema-Erweiterung (Schritt 1 weil blockiert alles)
2. THE-219 — PATCH-Endpoint
3. THE-220 — Checkbox in WaveCard

**Vertikale UC-DATA-001 (Service → User-Trigger):**
4. THE-229 — LLM-Service mit Sensitivity-Klassifikation
5. THE-230 — Schema-Validation (Safety-Net)
6. THE-232 — UI-Button in PropertyPanel

**Total:** 6 REQs. **Outcome:** beide UCs zeigbar, eine voll funktional, eine als End-to-End-Pfad mit minimalem UI.

### Sprint 2 (1 Woche) — Erweiterung + Compliance-Layer

**PLATEAU:**
- THE-221 — Plateau-Progress-Bar (Visual-Wert)
- THE-227 — RBAC-Permission (Production-Hardening)
- THE-226 — Audit-Trail (Compliance)
- THE-225 — Status-Sync mit Confirm (Semantic-Link zu Element-Status)

**DATA:**
- THE-231 — Auto-Connection access-Relationship (komplettiert Spec-Chain)
- THE-236 — Sensitivity-Tagging Color-Coding (visueller Wert + DSGVO-Vorbereitung)
- THE-237 — DSGVO-Hook (Compliance-Story)

**Total:** 7 REQs.

### Sprint 3 (1 Woche) — Polish + Power-User-Features

**PLATEAU:**
- THE-222 — Header Gesamt-Progress + Jump-to-Next
- THE-223 — 3D-Check-Badge
- THE-224 — Filter-Toggle

**DATA:**
- THE-233 — Bulk-Mode für ganzes Projekt
- THE-234 — Data-Lineage-View
- THE-235 — CRUD-Matrix-Export

**Total:** 6 REQs.

### Gesamt-Bilanz
- 19 REQs in 3 Sprints
- 4 Wochen kalkuliert
- Tier-1 ist nach Sprint-3 vollständig produktionsreif
- Tier-2 (UC-CRIT-001 + UC-EXEC-001) startet parallel Sprint-3 mit Concept-Workshops

---

## Verification-Methoden

| Method | REQs | Anteil |
|--------|------|:------:|
| Unit-Test | THE-218, 219, 226, 230, 231 | 5 (26%) |
| Integration / Supertest | THE-219, 227, 233 | 3 (16%) |
| Manual Demo | THE-220, 221, 222, 223, 224, 225, 232, 234, 235, 236, 237 | 11 (58%) |

→ Hohe Demo-Quote: viele User-facing Features, sind nur in echtem Klick-Flow validierbar. Gute Test-Coverage trotzdem auf den kritischen Backend-Pfaden.

---

## Risiken / Cross-cutting Concerns

| Risiko | Betroffene REQs | Mitigation |
|---|---|---|
| LLM-Hallucinations bei DATA-001 | THE-229, 230, 232 | Schema-Validation (REQ-DATA-002) als Hard-Gate; LLM-Output nie direkt persistiert |
| Cross-Project-Daten-Leakage | THE-229 (Bulk-Mode + Embedding-Synergie) | Tenant-isolierte Workspace-Boundaries hart durchziehen |
| UI-Pattern-Inkonsistenz beider UCs | THE-220, 232 | Beide nutzen existierende Modal/Confirm-Komponenten — Style-Audit nach Sprint-1 |
| Mongo-Schema-Drift wenn alte Roadmaps | THE-218 | Mixed-Type macht Migration unnötig, Default null wird in Get-Endpoint normalisiert |
| RBAC-Bypass | THE-227 | API-Endpoint-Test mit Viewer-Token muss 403 liefern (Supertest in Sprint 2) |

---

## Nächste Schritte (workflow-konform)

Diese RVTM löst das **Pre-Flight + Scoring** ab. Verbleibende Workflow-Schritte:

1. ✅ Pre-Flight-Check (gestern, 2026-05-06) — alle UCs als additiv verifiziert, 21 Linear-Issues angelegt
2. ✅ **Diese RVTM** (heute, 2026-05-07) — 19 REQs gescored, Top-5 + Sprint-Plan abgeleitet
3. ⏸ **User-Confirmation** der Reihenfolge — sind die Scores plausibel? Sprint-1-Top-5 OK?
4. ⏸ **`writing-plans` Skill** für Sprint-1-Plan (Step-by-Step-Tasks pro REQ)
5. ⏸ **`subagent-driven-development`** Execution

**Empfehlung:** Wenn die Top-5 OK sind, starten wir direkt mit `writing-plans` für REQ-PLATEAU-001 (Schema-Erweiterung) — kleinster, sauberster Einstieg, freigt damit alle anderen PLATEAU-REQs.
