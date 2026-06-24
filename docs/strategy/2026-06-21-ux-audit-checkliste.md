# UX-Audit-Checkliste — TheArchitect gegen die 5 Komplexitäts-Hebel

> **Status:** Audit-Companion zu [`2026-06-21-complexity-comprehension-ux.md`](./2026-06-21-complexity-comprehension-ux.md). Konkret, screen-bezogen, abhakbar.
> **Methode:** Jeder der 5 UI-Hebel → Checkliste gegen reale Components (Pfade relativ zu `packages/client/src`) → Status-Ampel → konkreter Fix.
> **Ampel:** ✅ vorhanden & gut · ⚠️ teilweise / inkonsistent · ❌ fehlt · 🔵 Quick-Win

**Lese-Reihenfolge:** Wenn du wenig Zeit hast, spring zu §6 (Priorisierte Top-10). Die §1–5 sind die Belege.

---

## 1. 🟢 Hebel 1 — Overview First, Zoom & Filter, Details on Demand (Shneiderman)

> **Prüffrage:** Startet jeder Einstieg mit einer Overview, die eine *Frage beantwortet* — oder mit rohem Detail?

| # | Check | Status | Screen / Component | Befund & Fix |
|---|---|---|---|---|
| 1.1 | Portfolio-Einstieg zeigt Overview vor Detail | ✅ | `ui/DashboardPage.tsx`, `dashboard/PortfolioKPIStrip.tsx` | KPI-Strip + Projekt-Cards sind ein sauberer Overview-First-Einstieg. Gut. |
| 1.2 | Architektur-Einstieg (`/project/:id`) startet mit Overview, nicht rohem 3D-Graph | ❌ | `ui/ProjectView.tsx` → `3d/Scene.tsx` | **Kernlücke.** Direkter Einstieg ins volle 3D-Modell mit allen Elementen. Es fehlt ein Eröffnungs-Layer "Wo stehe ich / wo sind die Probleme". → **Fix:** `CriticalHotspotsWidget` + `MissionControl`-Kennzahlen als *Default-Overlay beim ersten Öffnen* eines Projekts, Graph erst auf Interaktion scharf. |
| 1.3 | "At-a-Glance"-Einstieg existiert | ⚠️ | `ui/CriticalHotspotsWidget.tsx`, `ui/MissionControl.tsx` | Beide existieren (UC-CRIT), sind aber **opt-in Overlays**, nicht der garantierte Eröffnungs-Screen. → **Fix:** als Default-Landing der ProjectView setzen. |
| 1.4 | Zoom-Pfad Overview → Detail ist durchgängig | ✅ | `ui/CriticalHotspotsWidget.tsx` → `CameraControls` focus, `ui/CriticalityBreakdownPopover.tsx` | Klick auf Hotspot → Kamera-Fokus → Breakdown-Popover. Sehr gut — genau Shneiderman. |
| 1.5 | Details-on-demand statt Dauer-Anzeige | ✅ | `ui/PropertyPanel.tsx` (4 Tabs), `ui/SelectionActionBar.tsx` | Property-Detail erscheint erst bei Selektion. Gut. |
| 1.6 | Minimap als Re-Orientierung im Detail | ✅ | `ui/Minimap.tsx` | Vorhanden. |
| 1.7 | Analyze/Compliance starten mit Dashboard-Overview | ✅ | `analyze/AnalyzeDashboard.tsx`, `governance/ComplianceDashboard.tsx` | Beide haben Dashboard-Section als Entry. Gut. |

**Hebel-1-Verdikt:** Infrastruktur top, aber der **wichtigste Screen (ProjectView) verletzt Overview-First**. Ein Nutzer landet im Maximal-Detail. Das ist der Haupttreiber des "überfordert"-Feedbacks.

---

## 2. 🟢 Hebel 2 — Architect Elevator / Abstraktions-Zoom (Hohpe / C4)

> **Prüffrage:** Sieht der Nutzer immer *nur eine Flughöhe* scharf — oder kann/muss er alles gleichzeitig einblenden?

| # | Check | Status | Screen / Component | Befund & Fix |
|---|---|---|---|---|
| 2.1 | Es gibt eine explizite Flughöhen-Achse | ⚠️ | `ui/LayerNavigator.tsx` | Up/Down-Layer-Navigation existiert — das *ist* ein Elevator-Ansatz. Aber sie konkurriert mit freien Layer-Toggles (2.2). |
| 2.2 | Nur eine Ebene scharf, Rest aggregiert/gedimmt | ❌ | `ui/Sidebar.tsx` (`toggleLayer`), `3d/LayerPlane.tsx` | Freie Per-Layer-Toggles erlauben "alles an". Zwei konkurrierende Mentalmodelle (Elevator vs. Toggle). → **Fix:** Elevator als Default ("Single-Altitude-Focus": gewählte Ebene scharf, Nachbarn gedimmt), freie Toggles in "Expert Mode" verschieben. |
| 2.3 | Strategie-Flughöhe (Capabilities/Plateaus) als eigene Stufe | ✅ | `ui/PlateauBar.tsx`, `ui/PlateauHUD.tsx` | Plateau-Ebene existiert als eigene Höhe. Gut. |
| 2.4 | Aggregierte Sicht statt N Einzelknoten auf hoher Flughöhe | ❌ | `3d/ArchitectureElements.tsx` | Auf jeder Höhe werden alle Einzel-Elemente gerendert; keine Cluster-/Aggregat-Knoten ("12 App-Components" als ein Block). → **Fix:** Aggregations-Rendering bei hoher Flughöhe (Miller's 7±2: nie >~9 Knoten gleichzeitig). |
| 2.5 | Übergang zwischen Flughöhen ist animiert/nachvollziehbar | ⚠️ | `3d/ViewModeCamera.tsx`, `3d/CameraControls.tsx` | Kamera-Moves vorhanden, aber kein expliziter "ich fahre jetzt eine Ebene hoch/runter"-Affordance. → **Fix:** Elevator-Metapher sichtbar machen (Breadcrumb "Strategy › Business › Application"). |
| 2.6 | X-Ray-Sub-Views als alternative Flughöhen-Linsen | ✅ | `3d/XRayHUD.tsx` (Risk/Cost/Timeline/DSGVO/Sim) | Sehr stark — analytische Linsen statt Daten-Overload. Vorbildlich. |

**Hebel-2-Verdikt:** Bausteine alle da (Layer-Navigator, Plateau, X-Ray), aber es fehlt die **Erzwingung von "eine Ebene auf einmal"** und **Aggregation auf hoher Flughöhe**. Aktuell kann der Nutzer sich selbst überfordern.

---

## 3. 🔵 Hebel 3 — Tesler's Law: Automation sichtbar machen

> **Prüffrage:** Sieht der Nutzer, *was die Maschine für ihn übernommen hat* — oder passiert es stumm?

| # | Check | Status | Screen / Component | Befund & Fix |
|---|---|---|---|---|
| 3.1 | Auto-Heal zeigt nachvollziehbare Ergebnis-Zusammenfassung | ⚠️ | `copilot/HealWorkspaceModal.tsx` | Modal existiert, aber: gibt es ein "X Verbindungen ergänzt, Y Orphans gefixt"-Resümee *nach* dem Lauf? → **Verify & Fix:** Ergebnis-Summary als Toast/Panel. 🔵 |
| 3.2 | Blueprint-Generierung zeigt, was auto-erzeugt wurde | ✅ | `blueprint/BlueprintWizard.tsx` (Preview-Step), `copilot/ProposalDiffView.tsx` | Preview + Diff-View sind genau richtig. Vorbildlich. |
| 3.3 | AI-Änderungen sind als Diff reviewbar (nicht stumm angewandt) | ✅ | `copilot/ProposalCard.tsx`, `copilot/ProposalDiffView.tsx` | Diff-Review vorhanden. Sehr gut. |
| 3.4 | Redundancy-Detector surface't Ergebnis verständlich | ✅ | `copilot/RedundancyPanel.tsx` | Panel vorhanden. |
| 3.5 | **Globales "Was die Maschine für dich getan hat"-Feedback** | ❌ | — (fehlt) | **Größter Quick-Win.** Es gibt keine zentrale, sitzungsübergreifende Stelle, die Automation-Wins sammelt ("Diese Session: 14 Connections geheilt, 3 Redundanzen erkannt, 8 Prozesse vorgeschlagen"). → **Fix:** "Activity / What-the-AI-did"-Feed in MissionControl oder als dismissable Strip. 🔵 |
| 3.6 | Auto-Suggestions sind als solche erkennbar (nicht mit User-Daten vermischt) | ⚠️ | `copilot/SuggestedElements.tsx`, `ProcessSuggestionModal.tsx`, `DataObjectSuggestionModal.tsx` | Suggestions existieren — visuelle Differenzierung "AI-Vorschlag vs. von dir bestätigt" prüfen. |
| 3.7 | Health-Score erklärt, *warum* er sich ändert | ⚠️ | `copilot/HealthScoreRing.tsx`, `ui/CriticalityBreakdownPopover.tsx` | Ring zeigt %, Breakdown existiert für Criticality — aber koppelt der Health-Ring an "weil AI X tat"? → **Fix:** Delta-Begründung beim Score. |

**Hebel-3-Verdikt:** Die Automation-*Logik* ist exzellent (Diff-Views vorbildlich), aber es fehlt die **aggregierte Sichtbarmachung** (3.5). Das ist der **billigste, größte Wahrnehmungs-Hebel** — kein Backend, nur Surfacing.

---

## 4. 🟡 Hebel 4 — Rollenspezifische Viewpoints (Zachman / ISO 42010)

> **Prüffrage:** Sieht jede Rolle einen *kuratierten Ausschnitt* — oder startet jeder im selben Default?

| # | Check | Status | Screen / Component | Befund & Fix |
|---|---|---|---|---|
| 4.1 | Rollen sind definiert & zuweisbar | ✅ | `settings/RolesAccessSection.tsx` | RBAC vorhanden (owner/editor/reviewer/viewer). Gut. |
| 4.2 | Viewpoint-Filter existiert | ✅ | `togaf/ViewpointSelector.tsx`, Domain-Views (`BusinessArchitecture.tsx` etc.) | ArchiMate-Viewpoints vorhanden. Gut. |
| 4.3 | **Viewpoint ist an Rolle gekoppelt (Default-Ansicht pro Rolle)** | ❌ | — (Kopplung fehlt) | Jeder startet im selben Default unabhängig von der Rolle. Ein Reviewer/CISO sieht denselben Maximal-Graph wie ein Modellierer. → **Fix:** Default-Viewpoint pro Rolle (CISO→Compliance/Risk-Linse, Business-Architekt→Capability, IT-Lead→Application). Deckt BSH-Feedback (Business-Architect-Perspektive). |
| 4.4 | "Alles zeigen" ist immer 1 Klick entfernt (Filter ≠ Zensur) | ⚠️ | `togaf/ViewpointSelector.tsx` | Wenn 4.3 kommt: sicherstellen, dass der gefilterte Default jederzeit aufgehoben werden kann. |
| 4.5 | Stakeholder-/Read-Only-Sichten existieren | ✅ | `portfolio/StakeholderDashboard.tsx`, `portfolio/SharedSnapshotView.tsx`, `healthcheck/HealthReport.tsx` | Sehr gut — externe Stakeholder bekommen kuratierte Read-Only-Sichten. |

**Hebel-4-Verdikt:** Bausteine vollständig (RBAC + Viewpoints + Stakeholder-Views), aber die **Kopplung Rolle→Default-Viewpoint fehlt** (4.3). Mittlerer Aufwand, hoher Personalisierungs-Wert.

---

## 5. 🟡 Hebel 5 — Progressive Disclosure als Narrative (Norman / Sweller)

> **Prüffrage:** Führt die UI durch eine *Erkenntnis-Reise mit Begründung* — oder enthüllt sie nur Features in Reihenfolge?

| # | Check | Status | Screen / Component | Befund & Fix |
|---|---|---|---|---|
| 5.1 | Phasen-Gating existiert & blockt sinnvoll | ✅ | `ui/PhaseBar.tsx`, `ui/PhaseTransition.tsx` | TOGAF-ADM-Gating mit Unlock-Celebration. Gut umgesetzt. |
| 5.2 | Erstnutzer-Onboarding | ✅ | `ui/Walkthrough.tsx` (8 Steps) | Vorhanden. |
| 5.3 | Stepper führt durch Multi-Step-Flows | ✅ | `ui/PipelineStepper.tsx`, `AnalyzeStepper.tsx`, `blueprint/BlueprintProgress.tsx` | Konsistente Stepper. Gut. |
| 5.4 | **Die UI beantwortet eine Frage-Sequenz, nicht nur Phasen** | ⚠️ | `ui/PhaseBar.tsx`, `ui/Sidebar.tsx` (Vision/Explorer/Architect/Comply/Analyze) | Die ADM-Phasen sind *prozessual* ("Phase A→B"), nicht *erkenntnisbezogen* ("Was habe ich? → Wo sind Probleme? → Was tun? → Was kostet's?"). → **Fix (Reframe):** Next-Step-CTAs in die Frage-Form bringen; Sidebar-Reihenfolge an die Erkenntnis-Reise anlehnen. |
| 5.5 | Jeder Schritt erklärt *warum jetzt* (konzeptuelles Modell, Norman) | ⚠️ | `ui/PhaseBar.tsx` (next action), `copilot/AdvisorPanel.tsx` | Next-Action existiert, aber sagt es das *Warum*? → **Fix:** Mikro-Copy "Warum dieser Schritt jetzt" an Gates. |
| 5.6 | Plain Language statt EA-Jargon (für Nicht-Architekten) | ⚠️ | global (`feedback_ux_simplicity`) | Laufendes Thema. Audit-Spot-Check pro neuem Screen. |
| 5.7 | AI-Copilot als roter Faden / "frag mich was als nächstes" | ✅ | `copilot/AICopilot.tsx` (Quick-Actions: Review / What's Missing / Next Steps) | Quick-Actions sind exzellent — genau die Frage-Form. Vorbildlich. |

**Hebel-5-Verdikt:** Stark ausgebaut (Phasen, Stepper, Walkthrough, Copilot-Quick-Actions). Resthebel ist ein **Reframe**: von prozessualen Phasen zur **Erkenntnis-Frage-Sequenz** + "Warum jetzt"-Begründung.

---

## 6. Priorisierte Top-10 (Wert × Aufwand)

Sortiert nach Wert-pro-Aufwand. 🔵 = Quick-Win.

| Rang | Maßnahme | Hebel | Befund-Ref | Aufwand | Wert |
|---|---|---|---|---|---|
| 1 🔵 | **"Was die AI für dich tat"-Feed** (Session-Automation-Wins sammeln) | 3 | 3.5 | niedrig | sehr hoch |
| 2 🔵 | **Auto-Heal Ergebnis-Summary** ("X Connections geheilt") | 3 | 3.1 | niedrig | hoch |
| 3 | **ProjectView Overview-First-Landing** (Hotspots/MissionControl als Default-Overlay) | 1 | 1.2 / 1.3 | mittel | sehr hoch |
| 4 | **Single-Altitude-Focus** (eine Ebene scharf, Rest gedimmt; Toggles → Expert Mode) | 2 | 2.2 | mittel | hoch |
| 5 | **Default-Viewpoint pro Rolle** (CISO/Business/IT) | 4 | 4.3 | mittel | hoch |
| 6 | **Aggregations-Knoten auf hoher Flughöhe** (Miller 7±2) | 2 | 2.4 | mittel-hoch | hoch |
| 7 🔵 | **Health-Score Delta-Begründung** ("+8% weil 3 Gaps geschlossen") | 3 | 3.7 | niedrig | mittel |
| 8 | **Flughöhen-Breadcrumb** ("Strategy › Business › Application") | 2 | 2.5 | niedrig | mittel |
| 9 | **Next-Step-CTAs als Erkenntnis-Fragen + "Warum jetzt"** | 5 | 5.4 / 5.5 | niedrig | mittel |
| 10 | **AI-Vorschlag visuell von bestätigten Daten trennen** | 3 | 3.6 | niedrig | mittel |

---

## 7. Was schon vorbildlich ist (nicht anfassen)

Damit das Audit nicht nur Lücken zeigt — diese Surfaces sind Best-Practice und sollten als interner Standard gelten:

- **Diff-Review für AI-Änderungen** (`ProposalDiffView`, `ProposalCard`) — perfekter Tesler-Transfer mit Transparenz.
- **Hotspot → Fokus → Breakdown-Drilldown** (`CriticalHotspotsWidget` → `CriticalityBreakdownPopover`) — Lehrbuch-Shneiderman.
- **X-Ray-Sub-Views** (`XRayHUD`) — analytische Linsen statt Daten-Overload, exzellente Flughöhen-Idee.
- **Copilot-Quick-Actions** ("What's Missing?", "Next Steps") — die Erkenntnis-Frage-Form in Reinkultur.
- **Stakeholder Read-Only-Snapshots** (`SharedSnapshotView`, `HealthReport`) — kuratierte Rollen-Sichten für Externe.

---

## 8. Anwendung

- **Als Gate für neue UX-UCs:** Jeder neue Screen muss die §-Prüffrage seines Hebels bestehen. Die Lakmustest-Frage aus dem Strategy-Doc (§5): *"Welchen der 5 Hebel bedient dieses Feature — und macht es einen kaputt?"*
- **Reihenfolge:** Top-10 (§6) Rang 1–2 als nächste UX-Pause (Quick-Wins, kein Backend). Rang 3–4 nach 8-Kriterien-Scoring (`feedback_requirement_scoring`) + Pre-Flight-Check als eigenständige UCs.
- **Re-Audit:** Diese Checkliste nach jedem UX-Sprint durchgehen, Ampeln aktualisieren.

> **Single biggest finding:** Der wichtigste Screen — `ProjectView` — verletzt Overview-First (1.2) und Single-Altitude (2.2) gleichzeitig. Ein Nutzer landet im Maximal-Detail auf allen Flughöhen zugleich. Das ist die strukturelle Wurzel des "überfordert"-Feedbacks. Quick-Wins (Hebel 3) lindern die *Wahrnehmung*, aber die *strukturelle* Heilung ist Rang 3 + 4.
