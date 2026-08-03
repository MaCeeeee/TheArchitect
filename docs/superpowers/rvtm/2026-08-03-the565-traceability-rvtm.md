# RVTM — THE-565 (REQ-001.6): Bidirektionale Traceability

**Plan:** docs/superpowers/plans/2026-08-03-the565-traceability.md
**Parent:** THE-546 (UC-REQTRACE-001) · **Stand:** GEBAUT 2026-08-03 nach Freigabe — 9 neue Server-Tests (3 forward, 2 backward, 4 chainDrift) + 4 neue Client-Tests; Gesamtlauf 92 Server- (11 Suiten) + 81 Client-Tests (gesamte compliance-Suite); tsc sauber überall.
**Score (Pre-Flight):** ≈ 84 (BV 4 · Risk 3 · Impl 4 · Success 5 — kein LLM · Compliance 5 · Rel 5 · Urg 3 · Status 3).
**Ousterhout:** Change Amplification niedrig (rein lesender Service + 3 Routen + additive UI; einzige Schreib-Operation ist der explizite Drift-Pass) · Cognitive Load niedrig (keine neuen Konzepte — Ansichten und ein Diff auf Bestand) · Unknown Unknowns niedrig (Text-Quelle verifiziert: `getPipelineNorm.sections[].content` für corpus UND upload; contentId-Stabilität gemessen THE-550) · Abhängigkeiten niedrig · Obscurity niedrig. **Watch-Points:** (1) THE-305-Route `/by-element` bleibt **byte-gleich** — reichere Sicht = neue Route; (2) `/trace/*` vor `:id`-Routen registrieren; (3) Drift nur explizit (POST), Cron-Anschluss = benannte Folgearbeit.

**Prämissen-Urteil:** keine geglaubte Prämisse — alles mechanisch auf gemessenen Bausteinen (contentId 30/30 novellen-fest THE-550; Segmenter deterministisch; Gates/Evidenz-Regeln THE-557/558). Datenlage ehrlich: Legacy-Requirements ohne Klausel-Anker erscheinen getrennt (`withoutClauseAnchor`), nie rückwirkend interpretiert (ADR-0008).

| AC (THE-565) | Plan-Task | Verifikation | Status |
| --- | --- | --- | --- |
| AC1 — Vorwärts: je Norm die Klauseln mit Anforderungs- und Maßnahmen-Stand | Task 1, 3, 5 | `traceabilityForwardDb.test.ts` (Gruppierung, Coverage-Lücke sichtbar, Legacy getrennt) + Panel-Test | ✅ |
| AC2 — Rückwärts: je Element die Anforderungen samt Rechtsgrundlage + Frist; Ausmustern beantwortbar | Task 2, 3, 5 | `traceabilityBackwardDb.test.ts` (deadline aus StR, legalBasis, `soleCoverage`, impact) + Section-Test (Warnung) | ✅ |
| AC3a — beide Richtungen über contentId | Task 1, 2 | Gruppierung/Join laufen über `chain.clauseContentId` (Tests) | ✅ |
| AC3b — Novelle staled NUR die veränderten Klauseln (Anschluss THE-558) | Task 4 | `chainDriftDb.test.ts`: umnummerierende Novelle → nur die veränderte Klausel mismatch, Nachbar byte-gleich; Evidenz stale + attested fällt via `resetAttestedForStale` (EINE Quelle) | ✅ |

**Benannte Folgearbeit (nicht Teil des Slices):** Anschluss des Klausel-Drifts an den bestehenden Drift-Cron (heute expliziter POST) · Korpus-Klausel-Gap (Gap-Analyse je Klausel, ADR-0008 Phase 2).

**Bau-Nachträge (benannt):**
- `backwardTrace` entstand in Task 1 mit dem Service — die Task-2-Tests liefen nicht rot-zuerst; Schärfe belegt der Impact-Fall (soleCoverage nur beim Einzig-Element-Requirement).
- `regulationVersionMismatch` fehlte am Requirement-Schema (existierte nur am Mapping, THE-368) — additiv ergänzt; der Drift-Test fing das (Feld wurde still gestrippt).
- Fallback-Garantie der Section ist mitgetestet: die Bestandstests laufen mit ABGELEHNTER trace-API und prüfen so das byte-gleiche Alt-Verhalten.
- Drift-Robustheit: der Section-Volltext zählt zusätzlich als eine Klausel (Sections kürzer als jede Absatz-Gliederung stalen nicht fälschlich).
