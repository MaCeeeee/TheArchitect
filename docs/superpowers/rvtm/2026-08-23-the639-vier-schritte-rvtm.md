# RVTM: UC-FLOW-001 — Vom Gesetz zur Architektur in vier Schritten

**Ticket:** [THE-639](https://linear.app/thearchitect/issue/THE-639) (Pre-Flight 2026-08-23, WSJF 81,3)
**Plan:** `docs/superpowers/plans/2026-08-23-the639-vier-schritte.md`
> **ÜBERHOLT am 30.08.2026.** Der Prod-Durchstich hat die Prämisse widerlegt (THE-639 heißt jetzt „Der Lauf"). Von den 19 Zeilen bleiben R-004, R-005 und C-003 gültig — sie gehören zu P4, dem einzigen überlebenden Punkt. Der Rest ist gegenstandslos, nicht gescheitert.

**Created:** 2026-08-23
**Last Updated:** 2026-08-23 (Planphase — noch keine Ausführung)

Anforderungen stammen aus den fünf Punkten des Tickets (P1 ist mit THE-638 bereits Done und steht als Schutzraum in der Matrix), aus dem Loop-Kontrakt des Pre-Flight und aus den Regeln, die dieser Schnitt nicht brechen darf.

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| R-001 | Liegt genau eine Norm in der Pipeline, wählt Remediate sie selbst (Schritt 7 fällt weg) | Task 1, Steps 1–4 | `RemediateGateway.tsx` | `npm test -w @thearchitect/client -- RemediateGateway.autoselect` | PENDING | — |
| R-002 | Bei mehreren Normen bleibt die Wahl beim Menschen — keine stille Vorauswahl | Task 1, Step 1 (Test 2) | `RemediateGateway.tsx` | derselbe Lauf, Test „mehrere Normen" | PENDING | — |
| R-003 | Eine bereits getroffene Wahl wird nie still überschrieben | Task 1, Step 1 (Test 3) | `RemediateGateway.tsx` | derselbe Lauf, Test „bereits gewählt" | PENDING | — |
| R-004 | Der Requirements-Generator ist auf der Compliance-Fläche erreichbar (Schritt 2 auffindbar) | Task 2, Steps 1–4 | `CompliancePage.tsx` | `npm test -w @thearchitect/client -- CompliancePage.generator` | PENDING | — |
| R-005 | Der bestehende Einstieg aus der 3D-Werkzeugleiste bleibt bestehen (kein Konventionsbruch, UX-Checkliste §6.7) | Task 2, Step 3 (Hinweis) | `MainLayout.tsx` *(unverändert)* | `grep -n RequirementsGeneratorModal components/ui/MainLayout.tsx` → Treffer vorhanden | PENDING | — |
| R-006 | Wer von einer Lücke auf „Remediate" klickt, bringt deren Norm mit (Schritt 5 hält sein Versprechen) | Task 4, Steps 1–4 | `GapAnalysis.tsx`, `RemediateGateway.tsx` | `npm test -w @thearchitect/client -- RemediateGateway.handover` | PENDING | — |
| R-007 | Die Übergabe gewinnt gegen Auto-Select — auch bei mehreren Normen in der Pipeline | Task 4, Step 1 (Test 1) | `RemediateGateway.tsx` | derselbe Lauf | PENDING | — |
| R-008 | Anforderungen speichern nimmt die Norm in die Pipeline auf (Schritt 6 fällt weg) | Task 5, Steps 1–4 | `RequirementsGeneratorModal.tsx` | `npm test -w @thearchitect/client -- RequirementsGeneratorModal.pipeline` | PENDING | — |
| R-009 | Eine bereits aufgenommene Norm ist kein Fehler (409 gilt als Erfolg) | Task 5, Step 1 (Test 2) | `RequirementsGeneratorModal.tsx` | derselbe Lauf | PENDING | — |
| R-010 | Scheitert die Pipeline-Aufnahme, bleibt das Speichern erfolgreich — Hinweis statt Fehlermeldung | Task 5, Step 1 (Test 3) | `RequirementsGeneratorModal.tsx` | derselbe Lauf | PENDING | — |
| R-011 | Die automatische Pipeline-Aufnahme ist widerrufbar (Watchpoint des Pre-Flight) | Task 5, Step 5 | — | Manuell: Norm unter Standards wieder aus der Pipeline entfernen | PENDING | — |
| R-012 | Der Weg vom Korpus-Gesetz zur Architektur braucht **vier** Schritte | Task 6, Step 1 | — | Klick-Protokoll wie THE-628, gegen lokale Umgebung | PENDING | — |
| R-013 | Mission-Abgleich „Sieben Fragen": Schritte **ohne Ort 2 → 0** | Task 3 Step 3, Task 6 Step 2 | `mission-graph.json` | `npm run nav:graph` | PENDING | — |
| R-014 | Mission-Abgleich: direkte Übergänge **2 → ≥ 4** | Task 6, Step 2 | — | `npm run nav:graph` | PENDING | — |
| C-001 | **Schutzraum:** Die eine Zählweise aus THE-638 bleibt unangetastet — die alte Upload-Route wird nicht gerufen | Tasks 1, 4 (Regression) | `RemediateGateway.tsx` | `npm test -w @thearchitect/client -- RemediateGateway` (bestehende Suite, Negativ-Kontrolle wirft) | PENDING | — |
| C-002 | **Schutzraum:** Navigations-Wächter bleibt grün — keine neue Sackgasse, kein Weltwechsel | Task 3 Step 4, Task 6 Step 2 | `nav-graph-baseline.json` | `npm run nav:check` → Exit 0 | PENDING | — |
| C-003 | Keine Typfehler im Client | Tasks 2, 6 | — | `npx tsc --noEmit -p packages/client/tsconfig.json` | PENDING | — |
| C-004 | Volle Client-Testsuite ohne Regression | Task 6, Step 3 | — | `npm test -w @thearchitect/client` | PENDING | — |
| NF-001 | Die Übergabe der Norm erzeugt keinen Deep-Link-Vertrag (Router-State statt URL-Parameter) | Task 4, Step 3 | `GapAnalysis.tsx` | Code-Review: kein Query-Parameter in der `navigate`-Zeile | PENDING | — |

## Nicht in dieser Matrix (bewusst)

| Thema | Warum | Wohin |
|---|---|---|
| `complianceStore` ohne `persist` — F5 wirft auf Anfang | eigener Befund, nicht auf dem Vier-Schritte-Weg | Nebenbefund in THE-639 |
| `RegulationsPanel` zeigt nach Erfolg weiter „Add to pipeline" | Anzeige zieht nicht nach, eigener Schnitt | Nebenbefund in THE-639 |
| Generator aus der 3D-Werkzeugleiste entfernen | wäre Konventionsbruch — siehe R-005 | — |

## Coverage Summary

- **Total Requirements:** 19 (14 funktional · 4 Constraints · 1 nicht-funktional)
- **Verified (PASS):** 0
- **Failed (FAIL):** 0
- **Pending:** 19
- **Coverage:** 0 % *(Planphase)*

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-08-23 | RVTM erstellt aus Plan + Pre-Flight-Loop-Kontrakt | R-001..R-014, C-001..C-004, NF-001 | Planphase |
