# RVTM — THE-568 (Slice A): Remediation-Rückschluss

**Plan:** docs/superpowers/plans/2026-08-03-the568-remediation-rueckschluss.md
**Parent:** THE-564 (REQ-REQTRACE-001.5) · **Stand:** Plan geschrieben — wartet auf Bau-Freigabe.
**Score (Pre-Flight 2026-08-03, THE-564-Ebene):** ≈ 83 (BV 5 · Risk 4 · Impl 4 · Success 4 · Compliance 5 · Rel 5 · Urg 3 · Status 3).
**Ousterhout (Slice-A-Zuschnitt):** Change Amplification niedrig (1 neuer Service, 2 Aufruf-Stellen, 1 Response-Feld) · Cognitive Load niedrig (kein neues Konzept — ein mechanischer Join) · Unknown Unknowns niedrig (alle Formen im Pre-Flight verifiziert: sourceRef, normId-Konvention, deriveCovered) · Abhängigkeiten niedrig (kein LLM, kein Netz) · Obscurity niedrig (Grenzen im Kommentar-Kopf). **Watch-Point:** Rollback-Reihenfolge — unlink MUSS vor dem Leeren von `appliedElementIds` laufen, sonst ist nichts mehr zu entfernen.

| AC (THE-568) | Plan-Task | Verifikation | Status |
| --- | --- | --- | --- |
| AC1 — Apply ergänzt `linkedElementIds` der gejointen Requirements, idempotent | Task 1, 2 | `remediationBacklinkDb.test.ts` (addToSet, Doppel-Aufruf) + `remediationApplyBacklinkDb.test.ts` (echte Element-Ids, nicht tempIds) | offen (Plan) |
| AC2 — `covered` via `deriveCovered` neu; menschliche Tore unangetastet | Task 1 | Testfall mit `attested: yes`-Fixture bleibt exakt | offen (Plan) |
| AC3 — advisor/manual ohne Requirement-Bezug = byte-gleicher No-op | Task 1, 2 | No-op-Test (0 Schreiboperationen) + Advisor-Regressionstest | offen (Plan) |
| AC4 — Rollback entfernt Verknüpfungen + Recompute; Evidenz unberührt | Task 1, 2 | unlink-Test (`deriveCovered([])`-Verhalten) + Rollback-Reihenfolge | offen (Plan) |
| AC5 — Rückschreibung sichtbar in Antwort + Audit, nie still | Task 2 | Response-Feld `linkedRequirements` (Apply + Batch); `audit()`-Middleware deckt Log | offen (Plan) |
| AC6 — ehrliche Grenze dokumentiert (Upload-Welt; kein normId = kein Join) | Task 1 | Kommentar-Kopf + dieser RVTM-Eintrag | offen (Plan) |

**Bewusst nicht in Slice A:** Harmonisierungs-Vorschlag (THE-569 / Slice B — Judge-Kosten, Mensch-Tor) · Remediation-Input aus Ketten-Anforderungen (Slice C — Prämisse ungemessen, eigenes Entscheidungs-Ticket vor Bau) · Korpus-/Klausel-Gap-Kontext (ADR-0008 Phase 2).
