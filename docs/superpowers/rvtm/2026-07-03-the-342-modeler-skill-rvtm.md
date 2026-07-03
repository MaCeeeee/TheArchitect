# RVTM: THE-342 „Paste & See" Modeler-Skill

**Spec:** Linear [THE-342](https://linear.app/thearchitect/issue/THE-342) + Pre-Flight-AC (dieser Chat, 2026-07-03) — kein separates Spec-File; AC-1…AC-6 sind im Plan-Header dokumentiert
**Plan:** `docs/superpowers/plans/2026-07-03-the-342-modeler-skill.md`
**Created:** 2026-07-03
**Last Updated:** 2026-07-03 (Plan-Phase)

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| R-001 | Skill `the-architect-modeler` existiert (docs/-Quelle + .claude/-Mirror) und triggert auf „Text/Doku → ArchiMate-Modell", klar abgegrenzt vom Vision-Skill (AC-1) | Task 4 (Steps 1–4), Task 5 (Steps 1–2) | — | Frontmatter-Check (`head -20`), Trigger-Description-Review, `test -f .claude/skills/the-architect-modeler/SKILL.md` | PENDING | — |
| R-002 | Extraktion über alle relevanten Layer mit korrektem type+layer+togafDomain (api.md-Enums); ungültige Typen werden nicht committet, sondern im Preview als „unsupported — dropped" markiert (AC-2) | Task 4 Step 2 (Vokabular + Drop-Regel), Task 6 Step 2 (Read-back layer/domain) | — | Read-back: `data_object`→information/data, `node`→technology/technology; Skill-Text enthält Drop-Regel | PENDING | — |
| R-003 | Preview vor jedem Write (Elemente nach Typ, Beziehungen, neu vs. Dublette); Commit erst nach explizitem „ja" (Asilomar #16) (AC-3) | Task 4 Step 2 (Dedup-Preview-Flow + Confirmation-Discipline-Sektion) | — | Manuelle Review der Skill-Sektionen; Beispiel 1–3 im Skill decken den Flow ab | PENDING | — |
| R-004 | Dedup gegen Bestandsmodell (GET /elements, Name+Type case-insensitive); Dubletten nicht neu angelegt, bestehende id für Beziehungen wiederverwendet (AC-4) | Task 4 Step 2 (Dedup-Flow), Task 6 Step 3 (Re-Run-Check) | — | E2E: identische Fixture 2× gegen dasselbe Projekt → 0 neue Elemente, „exists — reuse id" | PENDING | — |
| R-005 | Commit via `commit-model.mjs` + Read-back-Verify (counts by type) + Rückmeldung an User (AC-5) | Task 4 Step 2 (Executor-Note + Output-Format), Task 6 Steps 1–2 | — | E2E: `Elements: 8/8`, `Connections: 6/6`, `VERIFY`-Zeile mit by-type über 4 Layer | PENDING | — |
| R-006 | `domainOf` mappt alle 8 Layer auf die kanonische TOGAF-Domain (information→data, physical→technology, implementation_migration→implementation) (AC-6a) | Task 1 (Steps 1–6) | — | `node --test docs/skills/the-architect-core/scripts/commit-model.test.mjs` — domainOf-Test | PENDING | — |
| R-007 | `layerOf`-Fallback für gängige App/Tech/Data-Typen (Sicherheitsnetz; expliziter `layer` bleibt der Vertrag) (AC-6b) | Task 2 (Steps 1–5) | — | `node --test …/commit-model.test.mjs` — layerOf-Test | PENDING | — |
| R-008 | `autoLayout` erzeugt keine Koordinaten-Kollision zwischen Typen derselben Ebene (Z-Lanes); motivation/strategy/vs/cap-*-Verhalten unverändert (AC-6c) | Task 3 (Steps 1–6) | — | `node --test …/commit-model.test.mjs` — autoLayout-Test + `--demo`-Smoke (erreicht API_KEY-Check ohne JS-Fehler) | PENDING | — |
| R-009 | Multi-Layer-Demo-Nachweis: Fixture (business/application/information/technology) end-to-end committet und verifiziert (AC-6d) | Task 4 Step 1 (Fixture), Task 6 Steps 1–4 | — | E2E gegen lokalen Dev-Server; falls kein Stack verfügbar → BLOCKED dokumentieren, nicht faken | PENDING | — |
| NF-001 | Helpers testbar ohne Netz/Nebenwirkung: Import von `commit-model.mjs` führt `main()` nicht aus (IIFE-Guard, symlink-robust via `pathToFileURL`) | Task 1 Step 1, Task 3 Step 5 | — | Testfile importiert Helpers und läuft grün; `--demo` läuft weiterhin als Skript | PENDING | — |
| C-001 | Kein neuer Endpoint/Service/Schema; Dedup nur Name+Type (kein Qdrant); THE-283-Compliance-Feature unberührt | alle (Out-of-Scope-Sektion) | — | Diff-Review: keine Änderungen unter `packages/server/src` außer keinen; nur docs/skills + .claude-Mirror | PENDING | — |
| C-002 | UI-/Skill-Strings Englisch (English-first), Antworten an User Deutsch | Task 4 | — | Review SKILL.md (englisch) | PENDING | — |
| R-010 | Linear THE-342: AC-1…AC-6 im Issue dokumentiert, Plan + PR verlinkt; Memory nachgezogen | Task 7 (Steps 1–3) | — | Linear-Issue-Check + MEMORY.md-Diff | PENDING | — |

## Coverage Summary

- **Total Requirements:** 13
- **Verified (PASS):** 0
- **Failed (FAIL):** 0
- **Pending:** 13
- **Coverage:** 0 %

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-07-03 | Initial RVTM created (Plan-Phase, Reviewer-approved plan) | R-001..R-010, NF-001, C-001..C-002 | Plan phase |
