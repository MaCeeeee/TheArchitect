# RVTM — THE-565 (REQ-001.6): Bidirektionale Traceability

**Plan:** docs/superpowers/plans/2026-08-03-the565-traceability.md
**Parent:** THE-546 (UC-REQTRACE-001) · **Stand:** Pre-Flight + Plan 2026-08-03 — wartet auf Bau-Freigabe.
**Score (Pre-Flight):** ≈ 84 (BV 4 · Risk 3 · Impl 4 · Success 5 — kein LLM · Compliance 5 · Rel 5 · Urg 3 · Status 3).
**Ousterhout:** Change Amplification niedrig (rein lesender Service + 3 Routen + additive UI; einzige Schreib-Operation ist der explizite Drift-Pass) · Cognitive Load niedrig (keine neuen Konzepte — Ansichten und ein Diff auf Bestand) · Unknown Unknowns niedrig (Text-Quelle verifiziert: `getPipelineNorm.sections[].content` für corpus UND upload; contentId-Stabilität gemessen THE-550) · Abhängigkeiten niedrig · Obscurity niedrig. **Watch-Points:** (1) THE-305-Route `/by-element` bleibt **byte-gleich** — reichere Sicht = neue Route; (2) `/trace/*` vor `:id`-Routen registrieren; (3) Drift nur explizit (POST), Cron-Anschluss = benannte Folgearbeit.

**Prämissen-Urteil:** keine geglaubte Prämisse — alles mechanisch auf gemessenen Bausteinen (contentId 30/30 novellen-fest THE-550; Segmenter deterministisch; Gates/Evidenz-Regeln THE-557/558). Datenlage ehrlich: Legacy-Requirements ohne Klausel-Anker erscheinen getrennt (`withoutClauseAnchor`), nie rückwirkend interpretiert (ADR-0008).

| AC (THE-565) | Plan-Task | Verifikation | Status |
| --- | --- | --- | --- |
| AC1 — Vorwärts: je Norm die Klauseln mit Anforderungs- und Maßnahmen-Stand | Task 1, 3, 5 | `traceabilityForwardDb.test.ts` (Gruppierung, Coverage-Lücke sichtbar, Legacy getrennt) + Panel-Test | offen (Plan) |
| AC2 — Rückwärts: je Element die Anforderungen samt Rechtsgrundlage + Frist; Ausmustern beantwortbar | Task 2, 3, 5 | `traceabilityBackwardDb.test.ts` (deadline aus StR, legalBasis, `soleCoverage`, impact) + Section-Test (Warnung) | offen (Plan) |
| AC3a — beide Richtungen über contentId | Task 1, 2 | Gruppierung/Join laufen über `chain.clauseContentId` (Tests) | offen (Plan) |
| AC3b — Novelle staled NUR die veränderten Klauseln (Anschluss THE-558) | Task 4 | `chainDriftDb.test.ts`: umnummerierende Novelle → nur die veränderte Klausel mismatch, Nachbar byte-gleich; Evidenz stale + attested fällt via `resetAttestedForStale` (EINE Quelle) | offen (Plan) |

**Benannte Folgearbeit (nicht Teil des Slices):** Anschluss des Klausel-Drifts an den bestehenden Drift-Cron (heute expliziter POST) · Korpus-Klausel-Gap (Gap-Analyse je Klausel, ADR-0008 Phase 2).
