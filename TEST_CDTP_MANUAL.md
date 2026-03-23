# CDTP Manual Test Checklist

**Datum:** 2026-03-23
**Branch:** `feature/cdtp-foundation`
**URL:** http://localhost:5173 (Client) / http://localhost:3000 (API)

> Voraussetzung: Projekt mit mindestens einer Standard-PDF + Architektur-Elemente in Neo4j.
> AI-Tests benötigen `OPENAI_API_KEY` oder `ANTHROPIC_API_KEY` in `.env`.

---

## F6 — Pipeline Orchestrator + Portfolio (Foundation)

- [ ] **F6-01** Sidebar zeigt "Compliance" Tab im Copilot
- [ ] **F6-02** Pipeline-Tab zeigt CompliancePipelineWizard mit Stages: Upload → Map → Policies → Roadmap → Track
- [ ] **F6-03** Portfolio-Daten laden (Copilot öffnen → Pipeline-Tab, Daten erscheinen)
- [ ] **F6-04** Leeres Projekt: Pipeline zeigt "uploaded" Stage, Stats alle 0

---

## F1 — AI Auto-Mapping + Coverage Gaps

- [ ] **F1-01** Standard-PDF hochladen (Standards-Tab → Upload)
  - Erwartung: Standard mit Sections erscheint, Pipeline-State = "uploaded"
- [ ] **F1-02** AI Auto-Suggest auslösen (Matrix-Tab → Sections auswählen → AI Suggest)
  - Erwartung: SSE-Stream zeigt Progress, dann Mapping-Vorschläge
- [ ] **F1-03** Matrix zeigt Mappings: compliant (grün), partial (gelb), gap (rot)
- [ ] **F1-04** Coverage-Gap-Indicator: Sections ohne Element zeigen roten Gap-Badge
- [ ] **F1-05** "Suggested Element" Badge auf Gap-Mappings sichtbar
- [ ] **F1-06** Pipeline-State wechselt von "uploaded" → "mapped" nach erstem Mapping
- [ ] **F1-07** Edge: Standard mit 100% Coverage → keine Gap-Indicators

---

## F2 — AI Policy Generation

- [ ] **F2-01** Policies-Tab im Copilot öffnen
- [ ] **F2-02** "Generate Policies" Button klicken (braucht mapped Standard)
  - Erwartung: SSE-Stream zeigt Generation-Progress
- [ ] **F2-03** PolicyDraftReview-Cards erscheinen mit:
  - Name, Severity-Badge (error/warning/info), Confidence-Anzeige
  - Source Section Reference (z.B. "Section 6.4.2")
  - Expandierbare Rules (field, operator, value)
- [ ] **F2-04** Einzelne Policy approven → Karte wird grün markiert
- [ ] **F2-05** Einzelne Policy rejecten → Karte wird entfernt/durchgestrichen
- [ ] **F2-06** "Approve All" Button → alle nicht-rejected werden markiert
- [ ] **F2-07** "Submit Approved" Button → Policies werden gespeichert
  - Erwartung: Erfolgs-Meldung, Drafts werden gecleart
- [ ] **F2-08** Pipeline-State wechselt von "mapped" → "policies_generated"
- [ ] **F2-09** Edge: Ohne AI-Key → 503 "AI not configured" Fehler

---

## F3 — Compliance-Driven Roadmap Candidates

- [ ] **F3-01** Analytics → Roadmap-Panel öffnen
- [ ] **F3-02** "Include Compliance Candidates" Checkbox sichtbar (lila Akzent)
- [ ] **F3-03** Checkbox aktivieren → Standard-Dropdown erscheint
- [ ] **F3-04** Standard auswählen + Roadmap generieren
  - Erwartung: Roadmap enthält compliance-getriebene Kandidaten
- [ ] **F3-05** Roadmap-Summary zeigt `complianceProjection` (projectedCoverage pro Wave)
- [ ] **F3-06** Wave-Cards zeigen `suggestedNewElements` wenn Coverage-Gaps existieren
- [ ] **F3-07** Edge: Checkbox aus → normaler Roadmap ohne Compliance-Kandidaten
- [ ] **F3-08** Edge: Standard ohne Gaps → keine zusätzlichen Kandidaten

---

## F5 — Missing Element Suggestions

- [ ] **F5-01** Elements-Tab im Copilot öffnen
- [ ] **F5-02** Standard mit Coverage-Gaps auswählen → AI-Suggestions laden
  - Erwartung: Karten mit Name, Type, Layer, Description, Priority
- [ ] **F5-03** "Create Element" auf Suggestion klicken
  - Erwartung: Element wird in Neo4j erstellt, Mapping aktualisiert
- [ ] **F5-04** Nach Element-Erstellung: Coverage-Stats verbessern sich
- [ ] **F5-05** Advisor-Panel zeigt Warnung wenn Standard >20% unmapped Sections hat
- [ ] **F5-06** Edge: Alle Gaps bereits gedeckt → "No suggestions" Meldung

---

## F4 — Compliance Progress Tracking + Audit Readiness

### Snapshots
- [ ] **F4-01** Progress-Tab im Copilot öffnen
- [ ] **F4-02** "Capture Snapshot" Button klicken
  - Erwartung: Snapshot wird erstellt, Chart aktualisiert
- [ ] **F4-03** Summary-Cards zeigen: Coverage %, Policy %, Maturity Level, Violations
- [ ] **F4-04** SVG-Chart zeigt Datenpunkte (lila = Coverage, grün = Policy)
- [ ] **F4-05** Mehrere Snapshots → Linienverlauf sichtbar
- [ ] **F4-06** Projected-Line (gestrichelt) erscheint wenn Roadmap-Projections existieren
- [ ] **F4-07** Edge: Erster Snapshot → einzelner Punkt statt Linie

### Audit Checklists
- [ ] **F4-08** Audit-Tab im Copilot öffnen
- [ ] **F4-09** "New Checklist" → Formular mit Name, Standard-Dropdown, Target Date
- [ ] **F4-10** Checklist erstellen → Items werden automatisch aus Standard-Sections generiert
- [ ] **F4-11** Checklist expandieren → alle Items mit Section-Nummer und Titel
- [ ] **F4-12** Status-Dropdown pro Item: not_started → in_progress → evidence_collected → verified
- [ ] **F4-13** Status ändern → Readiness-Ring (%) aktualisiert sich
- [ ] **F4-14** Readiness-Ring: rot (<50%), gelb (50-79%), grün (≥80%)
- [ ] **F4-15** Target-Date: "Xd left" Anzeige, rot wenn ≤14 Tage
- [ ] **F4-16** Edge: Überdue-Checklist → "Overdue" in rot

---

## E2E — Vollständiger Pipeline-Durchlauf

- [ ] **E2E-01** Neues Projekt → Standard-PDF hochladen
- [ ] **E2E-02** Auto-Mapping → Matrix prüfen → Gaps sehen
- [ ] **E2E-03** Policies generieren → approven
- [ ] **E2E-04** Roadmap mit Compliance-Candidates generieren
- [ ] **E2E-05** Snapshot capturen → Progress-Chart prüfen
- [ ] **E2E-06** Audit-Checklist erstellen → Items durchklicken
- [ ] **E2E-07** Pipeline-State: uploaded → mapped → policies_generated durchlaufen
- [ ] **E2E-08** Portfolio zeigt korrekten Coverage-% und Maturity-Level

---

**Legende:**
- [ ] = Offen
- [x] = Bestanden
- [!] = Fehler gefunden (Details notieren)
