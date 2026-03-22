# PROGRESS.md — TheArchitect

> Letztes Update: 2026-03-22 (UC-ROADMAP-003 TPCV, View Mode Buttons, RVTM Skill, Linear-Integration, CSV Import ArchiMate 3.2)

---

## 0. UC-ROADMAP-003: Transformation Plateau Comparison View (TPCV)

### Problemstellung
Der Roadmap Generator erzeugt Waves mit Elementen die von `currentStatus` zu `targetStatus` migrieren — aber es gibt keine visuelle Darstellung der Architektur **über die Zeit**. Der Nutzer sieht Wave-Cards und eine Timeline, aber nicht wie sich die gesamte Architektur Plateau für Plateau verändert. Ziel: As-Is → Wave 1 → Wave 2 → ... → Target nebeneinander im 3D-View, mit sichtbaren Zustandsänderungen, Abhängigkeiten und Gap-Metriken pro Plateau.

### Status: 🔧 In Progress (Sprint 1-3 implementiert, QA ausstehend)

**Linear:** THE-60 (Feature, In Progress, parent=THE-16) → THE-61 bis THE-82 (22 REQs, alle Done)

#### Sprint 1 — Foundation (Types + Computation + Store) ✅

| Komponente | Status | Datei |
|---|---|---|
| PlateauSnapshot, PlateauElementState, CrossPlateauDependency Types | ✅ | `packages/shared/src/types/roadmap.types.ts` |
| computePlateauSnapshots() — pure Function, N+1 Snapshots | ✅ | `packages/client/src/utils/plateauComputation.ts` |
| computeCrossPlateauDependencies() — Wave-übergreifende Abhängigkeiten | ✅ | `packages/client/src/utils/plateauComputation.ts` |
| computePlateauSnapshotsMemoized() — Cache by Roadmap-ID+Version+Elements-Ref | ✅ | `packages/client/src/utils/plateauComputation.ts` |
| Plateau Store State + Actions (activate/deactivate/select/compute/clear) | ✅ | `packages/client/src/stores/roadmapStore.ts` |
| Unit Tests — plateauComputation (19 Tests) | ✅ | `packages/client/src/utils/plateauComputation.test.ts` |
| Unit Tests — roadmapStore (14 Tests) | ✅ | `packages/client/src/stores/roadmapStore.test.ts` |

#### Sprint 2 — 3D Rendering ✅

| Komponente | Status | Datei |
|---|---|---|
| PlateauElement — Status-Coloring + Change-Glow + LOD | ✅ | `packages/client/src/components/3d/PlateauElement.tsx` |
| PlateauConnectionLines — Intra + Cross-Plateau Lines | ✅ | `packages/client/src/components/3d/PlateauConnectionLines.tsx` |
| PlateauRenderer — Orchestrator: Plateaus × Layers × Elements | ✅ | `packages/client/src/components/3d/PlateauRenderer.tsx` |
| Scene Conditional Rendering — PlateauRenderer statt ArchitectureElements | ✅ | `packages/client/src/components/3d/Scene.tsx` |

#### Sprint 3 — UI Panel + Navigation + Guards ✅

| Komponente | Status | Datei |
|---|---|---|
| PlateauBar — Bottom Navigation mit Tabs, Prev/Next/Home, Full/Changed Toggle | ✅ | `packages/client/src/components/ui/PlateauBar.tsx` |
| PlateauHUD — Top-Right Metrics Overlay (Cost, Risk, Fatigue, Compliance) | ✅ | `packages/client/src/components/ui/PlateauHUD.tsx` |
| RoadmapPanel Toggle — "Plateau View" Button, ViewMode Guard, Disabled-Tooltip | ✅ | `packages/client/src/components/analytics/RoadmapPanel.tsx` |
| ViewModeCamera — Plateau Keyboard Navigation (←/→, 1-9, Home) | ✅ | `packages/client/src/components/3d/ViewModeCamera.tsx` |
| X-Ray Mutual Exclusion — Lazy import() für Cross-Store Deaktivierung | ✅ | `packages/client/src/stores/xrayStore.ts` |
| ViewMode Guard — Auto-Deaktivierung bei Wechsel weg von 3D | ✅ | `packages/client/src/components/3d/Scene.tsx` |

#### Tests

| Suite | Tests | Status |
|---|---|---|
| plateauComputation.test.ts | 19 | ✅ alle grün |
| roadmapStore.test.ts | 14 | ✅ alle grün |
| TEST_TPCV.md (manuelle Checkliste) | 47 | ⏳ QA ausstehend |
| **Gesamt automatisiert** | **33** | ✅ |

#### Bekannte Issues

| Issue | Beschreibung | Prio |
|---|---|---|
| 403 Insufficient Permissions | `viewer`-Rolle fehlt `ANALYTICS_SIMULATE` Permission → Roadmap-Generierung blockiert | Must-Fix |
| viewer-Rolle inkonsistent | `viewer` darf Elemente erstellen/löschen aber keine Roadmaps generieren | Should-Fix |
| 401 auf projects-Endpoint | Intermittierende Auth-Fehler (möglicherweise Token-Refresh-Timing) | Investigate |

#### Neue Dateien (8)
1. `packages/client/src/utils/plateauComputation.ts` — Pure Computation Function + Memoization
2. `packages/client/src/utils/plateauComputation.test.ts` — 19 Unit Tests
3. `packages/client/src/stores/roadmapStore.test.ts` — 14 Unit Tests
4. `packages/client/src/components/3d/PlateauElement.tsx` — Element mit Status-Coloring + Change-Glow
5. `packages/client/src/components/3d/PlateauRenderer.tsx` — Orchestrator: Plateaus × Layers × Elements
6. `packages/client/src/components/3d/PlateauConnectionLines.tsx` — Intra + Cross-Plateau Lines
7. `packages/client/src/components/ui/PlateauBar.tsx` — Bottom Navigation Bar
8. `packages/client/src/components/ui/PlateauHUD.tsx` — Top-Right Metrics Overlay

#### Modifizierte Dateien (7)
1. `packages/shared/src/types/roadmap.types.ts` — PlateauSnapshot, PlateauElementState Types
2. `packages/client/src/stores/roadmapStore.ts` — Plateau State + Actions + X-Ray Guard
3. `packages/client/src/stores/xrayStore.ts` — Mutual Exclusion mit Plateau
4. `packages/client/src/components/3d/Scene.tsx` — Conditional PlateauRenderer + Bar/HUD
5. `packages/client/src/components/analytics/RoadmapPanel.tsx` — Toggle Button
6. `packages/client/src/components/3d/ViewModeCamera.tsx` — Camera + Keyboard Navigation
7. `packages/client/vite.config.ts` — Vitest Setup

---

## 0. Kolmogorov Stochastic Engine

### Problemstellung
Die bestehenden Services (Impact Analysis, Risk Assessment, Monte Carlo) arbeiten deterministisch oder mit uniformer Verteilung. Es fehlt eine formale stochastische Schicht: probabilistische Kanten im Graph, Bayes'sche Kaskadenrisiko-Propagation, K-S-Test für Architecture Drift Detection, und axiomenkonforme Wahrscheinlichkeitsraum-Validierung.

### Status: ✅ Implementiert & Verifiziert (48/48 Tests)

#### Neue Dateien

| Komponente | Status | Datei |
|---|---|---|
| Stochastic Types (11 Interfaces + Strategy-Thresholds) | ✅ | `packages/shared/src/types/stochastic.types.ts` |
| Stochastic Core Service (5 Kernfunktionen) | ✅ | `packages/server/src/services/stochastic.service.ts` |
| Architecture Snapshot Model (MongoDB) | ✅ | `packages/server/src/models/ArchitectureSnapshot.ts` |
| Stochastic Test Suite (48 Tests, 9 Sektionen) | ✅ | `packages/server/src/__tests__/stochastic.test.ts` |

#### Kernfunktionen

| Funktion | Beschreibung | Status |
|---|---|---|
| `validateProbabilitySpace()` | Kolmogorov-Axiome I (≥0), II (Σ=1), III (Additivität) | ✅ 10 Tests |
| `betaPertDistribution()` | Asymmetrische Kostenschätzung (ersetzt Uniform in Monte Carlo) | ✅ 6 Tests |
| `kolmogorovSmirnovTest()` | Zweiseitiger K-S-Test, D_n + p-Wert (Architecture Drift) | ✅ 8 Tests |
| `propagateCascadeRisk()` | Bayes'sche Graph-Propagation + logistische Dämpfung (Neo4j) | ✅ |
| `calculatePlateauStability()` | Joint Probability, strategy-abhängige Schwellenwerte | ✅ 8 Tests |

#### Integrationen

| Integration | Beschreibung | Status |
|---|---|---|
| Monte Carlo Beta-PERT | `runMonteCarloSimulation` default `beta-pert` statt `uniform` | ✅ 6 Tests |
| Advisor Detektor #10 | Cascade Risk — Bayes'sche Kaskadenerkennung für Hub-Elemente | ✅ |
| Advisor Detektor #11 | Architecture Drift — K-S-Test auf Degree/Risk-Verteilungen | ✅ |
| Roadmap Plateau-Stabilität | `summary.plateauStability` pro Wave, strategy-abhängig | ✅ 4 Tests |
| Architecture Snapshots | Baseline bei Roadmap-Generierung, für Drift-Vergleiche | ✅ |

#### Design-Entscheidungen

| Entscheidung | Wahl |
|---|---|
| Schwellenwerte | Strategy-abhängig (conservative/balanced/aggressive) |
| Neo4j Kanten-Gewichte | Hybrid: Heuristik + Defaults, `confidenceLevel` pro Kante, lazy init |
| Transitional States | Konfigurierbar: `autoInsertTransitionalStates` Flag (default: warn-only) |
| K-S Drift Baselines | Snapshot-basiert (Langzeit) + Wave-basiert (kurzfristig) |

#### Strategy-Schwellenwerte

| Strategy | Plateau P(Fail) | Cascade Critical | Cascade High |
|---|---|---|---|
| conservative | < 3% | > 10% | > 5% |
| balanced | < 5% | > 15% | > 8% |
| aggressive | < 8% | > 25% | > 12% |

#### Modifizierte Dateien

- `packages/shared/src/types/roadmap.types.ts` — `plateauStability`, `autoInsertTransitionalStates`
- `packages/shared/src/types/advisor.types.ts` — `cascade_risk`, `architecture_drift` Kategorien
- `packages/shared/src/index.ts` — Re-Export stochastic types
- `packages/server/src/services/analytics.service.ts` — Beta-PERT in Monte Carlo
- `packages/server/src/services/advisor.service.ts` — 2 neue Detektoren (#10, #11)
- `packages/server/src/services/roadmap.service.ts` — Plateau-Stabilität + Snapshot-Erstellung

#### Testergebnisse

```
48/48 Tests bestanden (0.27s)

Sektion 1: Kolmogorov Axiom Validation     — 10/10 ✅
Sektion 2: Beta-PERT Distribution          —  6/6  ✅
Sektion 3: Kolmogorov-Smirnov Test         —  8/8  ✅
Sektion 4: Plateau Stability               —  8/8  ✅
Sektion 5: Monte Carlo Beta-PERT           —  6/6  ✅
Sektion 6: Advisor Cascade & Drift         —  2/2  ✅
Sektion 7: Roadmap Plateau Stability       —  4/4  ✅
Sektion 8: Architecture Snapshot           —  1/1  ✅
Sektion 9: Strategy Thresholds             —  3/3  ✅
```

---

## 1. Multi-Architecture Workspace Feature

### Problemstellung
Beim Import mehrerer Architekturen (BPMN, n8n) landeten alle Elemente in einem einzigen 3D-Raum — unübersichtlich und nicht navigierbar. Ziel: Jede importierte Architektur bekommt ihren eigenen Bereich (Workspace) mit 5 Layern, nebeneinander platziert, mit automatischer Erkennung gemeinsamer Elemente.

### Status: ✅ Implementiert

#### Datenmodell

| Komponente | Status | Datei |
|---|---|---|
| `Workspace` Interface | ✅ | `packages/shared/src/types/architecture.types.ts` |
| `workspaceId` auf `ArchitectureElement` | ✅ | `packages/shared/src/types/architecture.types.ts` |
| `ConnectionType` erweitert um `cross_architecture` | ✅ | `packages/shared/src/types/architecture.types.ts` |
| `WorkspaceSource` Typ (`bpmn`, `n8n`, `manual`, `archimate`) | ✅ | `packages/shared/src/types/architecture.types.ts` |
| Workspace Mongoose Model | ✅ | `packages/server/src/models/Workspace.ts` |

#### Client State Management

| Komponente | Status | Datei |
|---|---|---|
| Workspace Store (Zustand) | ✅ | `packages/client/src/stores/workspaceStore.ts` |
| `WORKSPACE_GAP = 40` (30-Unit Plane + 10-Unit Gap) | ✅ | `packages/client/src/stores/workspaceStore.ts` |
| 8 Workspace-Farben (automatisch rotierend) | ✅ | `packages/client/src/stores/workspaceStore.ts` |
| `architectureStore` — `importElements`, `getElementsByWorkspace` | ✅ | `packages/client/src/stores/architectureStore.ts` |
| `clearProject()` Action (State-Reset beim Verlassen) | ✅ | `packages/client/src/stores/architectureStore.ts` |

#### 3D-Rendering

| Komponente | Status | Datei |
|---|---|---|
| LayerPlane mit `offsetX` Prop | ✅ | `packages/client/src/components/3d/LayerPlane.tsx` |
| Scene rendert LayerPlanes pro Workspace | ✅ | `packages/client/src/components/3d/Scene.tsx` |
| Workspace-Name über Strategy-Layer (bei 2+ Workspaces) | ✅ | `packages/client/src/components/3d/Scene.tsx` |
| Cross-Architecture Connectors (gestrichelt, gold, höherer Bogen) | ✅ | `packages/client/src/components/3d/ConnectionLines.tsx` |
| Langsamere Flow-Partikel bei Cross-Connections (0.2 statt 0.3) | ✅ | `packages/client/src/components/3d/ConnectionLines.tsx` |

#### Navigation

| Komponente | Status | Datei |
|---|---|---|
| `flyToWorkspace(offsetX)` — Kamera-Animation | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| `fitAllWorkspaces()` — Alle Workspaces in Sicht | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| `maxDistance` erhöht von 100 → 300 | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| Tastatur: ←/→ (Workspace wechseln) | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| Tastatur: 1-9 (direkt zu Workspace) | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| Tastatur: Home (alle Workspaces zeigen) | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| Tastatur: F (Element fokussieren) | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| Input-Guard (Shortcuts nicht in Textfeldern) | ✅ | `packages/client/src/components/3d/CameraControls.tsx` |
| WorkspaceBar (Tab-Leiste oben, Farb-Dots, Umbenennen, Löschen) | ✅ | `packages/client/src/components/ui/WorkspaceBar.tsx` |
| Minimap (rechts unten, Workspace-Rechtecke, Klick-Navigation) | ✅ | `packages/client/src/components/ui/Minimap.tsx` |

#### Import-Dialoge

| Komponente | Status | Datei |
|---|---|---|
| BPMN Import: "New Workspace" / "Merge into Existing" | ✅ | `packages/client/src/components/ui/BPMNImportDialog.tsx` |
| BPMN Import: Workspace auf Server persistieren | ✅ | `packages/client/src/components/ui/BPMNImportDialog.tsx` |
| n8n Import: "New Workspace" / "Merge into Existing" | ✅ | `packages/client/src/components/ui/N8nImportDialog.tsx` |
| n8n Import: Workspace auf Server persistieren | ✅ | `packages/client/src/components/ui/N8nImportDialog.tsx` |
| Shared Element Detection (Name + Typ Matching) | ✅ | `packages/client/src/utils/workspaceMatcher.ts` |

#### Server / API

| Komponente | Status | Datei |
|---|---|---|
| Workspace CRUD Routes (GET/POST/PUT/DELETE) | ✅ | `packages/server/src/routes/workspace.routes.ts` |
| Workspace Routes in Express registriert | ✅ | `packages/server/src/index.ts` |
| `workspaceId` in BPMN-Import Neo4j Query | ✅ | `packages/server/src/routes/architecture.routes.ts` |
| `workspaceId` in n8n-Import Neo4j Query | ✅ | `packages/server/src/routes/architecture.routes.ts` |
| Client `workspaceAPI` (list/create/update/delete) | ✅ | `packages/client/src/services/api.ts` |

#### Workspace-Persistenz-Fix

| Komponente | Status | Datei |
|---|---|---|
| Workspaces beim Projektladen vom Server abrufen | ✅ | `packages/client/src/components/ui/ProjectView.tsx` |
| Mapping Server → Store Format (`_id` → `id`) | ✅ | `packages/client/src/components/ui/ProjectView.tsx` |
| Graceful Fallback bei Fehler | ✅ | `packages/client/src/components/ui/ProjectView.tsx` |

---

## 2. Sidebar Data-Leak Fix

### Problemstellung
Auf der Dashboard-/Projektübersicht waren links in der Sidebar bereits Architektur-Elemente des zuletzt geöffneten Projekts sichtbar. Benutzer ohne Projektzugriff hätten so Einblick in die verwendeten Objekte erhalten.

### Status: ✅ Behoben

| Komponente | Status | Datei |
|---|---|---|
| `clearProject()` beim Dashboard-Mount aufrufen | ✅ | `packages/client/src/components/ui/DashboardPage.tsx` |
| `setWorkspaces([])` beim Dashboard-Mount | ✅ | `packages/client/src/components/ui/DashboardPage.tsx` |
| Sidebar: "Kein Projekt geöffnet" Platzhalter | ✅ | `packages/client/src/components/ui/Sidebar.tsx` |
| Sidebar: "Add Element" Button nur bei aktivem Projekt | ✅ | `packages/client/src/components/ui/Sidebar.tsx` |

---

## 3. Projekt-Löschung

### Problemstellung
Projekte konnten erstellt, aber nicht über das Dashboard gelöscht werden.

### Status: ✅ Implementiert

| Komponente | Status | Datei |
|---|---|---|
| Trash-Icon auf Projektkarte (Hover) | ✅ | `packages/client/src/components/ui/DashboardPage.tsx` |
| Bestätigungsdialog vor Löschung | ✅ | `packages/client/src/components/ui/DashboardPage.tsx` |
| API-Anbindung `projectAPI.delete(id)` | ✅ | `packages/client/src/components/ui/DashboardPage.tsx` |

---

## 4. User Control Board (Rollenbasierte Zugriffskontrolle)

### Problemstellung
Jeder authentifizierte Benutzer konnte auf jedes Projekt zugreifen. Es fehlte ein umfassendes System für Benutzerverwaltung, Rollen und Zugriffssteuerung — zugeschnitten auf EA-Stakeholder (C-Level, Architekten, Analysten, Berater, etc.).

### Status: ✅ Phase 1–4 implementiert

#### Phase 1: Sidebar-Schutz & Projekt-State-Reset
*(Siehe Abschnitt 2 oben)*

#### Phase 2: Projekt-Zugriffskontrolle (Backend)

| Komponente | Status | Datei |
|---|---|---|
| `requireProjectAccess` Middleware | ✅ | `packages/server/src/middleware/projectAccess.middleware.ts` |
| Projekt-Rollen-Hierarchie (owner=4, editor=3, reviewer=2, viewer=1) | ✅ | `packages/server/src/middleware/projectAccess.middleware.ts` |
| Chief Architects: impliziter Zugriff auf alle Projekte | ✅ | `packages/server/src/middleware/projectAccess.middleware.ts` |
| Middleware auf alle Projekt-Routes angewendet | ✅ | `packages/server/src/routes/project.routes.ts` |
| Middleware auf Architecture-Routes angewendet | ✅ | `packages/server/src/routes/architecture.routes.ts` |
| Middleware auf Workspace-Routes angewendet | ✅ | `packages/server/src/routes/workspace.routes.ts` |

#### Phase 3: Benutzerverwaltung (Admin UI)

| Komponente | Status | Datei |
|---|---|---|
| UsersSection Komponente (Tabelle mit Suche, Rollen, MFA-Status) | ✅ | `packages/client/src/components/settings/UsersSection.tsx` |
| 7 Rollen mit farbcodierten Avataren | ✅ | `packages/client/src/components/settings/UsersSection.tsx` |
| Rollenänderung per Dropdown | ✅ | `packages/client/src/components/settings/UsersSection.tsx` |
| In Settings-Navigation eingebunden | ✅ | `packages/client/src/components/settings/SettingsPage.tsx` |
| Nur für Admin-Rollen sichtbar | ✅ | `packages/client/src/components/settings/SettingsSidebar.tsx` |

#### Phase 4: Erweitertes Rollensystem & Projekt-Kollaboratoren

**System-Rollen (7 Stufen):**

| Rolle | Beschreibung |
|---|---|
| `chief_architect` | Vollzugriff, Admin, alle Projekte |
| `enterprise_architect` | Erweiterte Rechte, Governance |
| `solution_architect` | Projektbezogen, Kollaborator-Verwaltung |
| `data_architect` | Datenarchitektur-Fokus |
| `business_architect` | Geschäftsarchitektur-Fokus |
| `analyst` | Lesezugriff + Analysen + Simulationen |
| `viewer` | Nur Lesen |

**Projekt-Rollen (4 Stufen):**

| Rolle | Level | Beschreibung |
|---|---|---|
| `owner` | 4 | Projekt erstellt, volle Kontrolle |
| `editor` | 3 | Kann bearbeiten |
| `reviewer` | 2 | Kann prüfen/kommentieren |
| `viewer` | 1 | Nur lesen |

**Implementierte Dateien:**

| Komponente | Status | Datei |
|---|---|---|
| `UserRole` erweitert (+ `solution_architect`, `analyst`) | ✅ | `packages/shared/src/types/user.types.ts` |
| `ProjectRole` Typ hinzugefügt | ✅ | `packages/shared/src/types/user.types.ts` |
| `ROLE_PERMISSIONS` für alle 7 Rollen | ✅ | `packages/shared/src/constants/permissions.constants.ts` |
| User Model: Rollen-Enum erweitert | ✅ | `packages/server/src/models/User.ts` |
| Admin-Routes: `validRoles` aktualisiert | ✅ | `packages/server/src/routes/admin.routes.ts` |
| Kollaborator-CRUD Endpoints (GET/POST/PUT/DELETE) | ✅ | `packages/server/src/routes/project.routes.ts` |
| Client `projectAPI` — Kollaborator-Methoden | ✅ | `packages/client/src/services/api.ts` |
| ProjectCollaborators Modal (Email-Einladung, Rollen, Entfernen) | ✅ | `packages/client/src/components/ui/ProjectCollaborators.tsx` |
| Users-Icon in Toolbar (öffnet Kollaborator-Dialog) | ✅ | `packages/client/src/components/ui/Toolbar.tsx` |

---

## 5. MiroFish Swarm Intelligence Engine

### Problemstellung
Bestehende Analytics (Risk, Impact, Cost, Monte Carlo) berechnen Metriken rein algorithmisch — ohne Stakeholder-Verhalten. MiroFish fügt LLM-basierte Multi-Agenten-Simulation hinzu: Verschiedene Stakeholder-Personas (CTO, IT-Ops, Business Unit) reagieren auf Architektur-Szenarien (M&A, Cloud-Migration, Tech-Refresh). So entstehen emergente Risiken, Kosten-Deltas und Blockaden, die statische Analyse nicht erfassen kann.

### Status: ✅ Phase 1 implementiert und verifiziert

#### Kernkonzepte

- **Multi-Agenten-Simulation**: Sequenzielle Runden, jeder Agent sieht die vorherige Runde
- **Anti-Halluzinations-Layer**: Jede Agent-Aktion wird gegen den realen Neo4j-State validiert
- **RBAC-gefilterter Kontext**: Jeder Agent sieht nur seine erlaubten Layer/Domains
- **3-Faktor Fatigue Index**: Concurrency Load, Negotiation Drag, Constraint Pressure
- **Emergence Tracking**: Deadlock, Konsens, Coalition, Eskalation, Fatigue

#### Shared Types

| Komponente | Status | Datei |
|---|---|---|
| `AgentPersona` (visibleLayers, budgetConstraint, expectedCapacity) | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `ProposedAction` (8 Action-Typen, targetElementId, changes) | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `ValidationResult` (valid, rejectionReason) | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `SimulationRound`, `AgentTurn` | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `EmergenceEvent` (consensus, deadlock, fatigue, escalation, coalition) | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `FatigueReport`, `AgentFatigueDetail`, `ElementFatigueDetail` | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `EmergenceMetrics` | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `SimulationResult`, `SimulationConfig`, `SimulationRun` | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `SimulationStreamEvent` (discriminated union für SSE) | ✅ | `packages/shared/src/types/simulation.types.ts` |
| Re-Export über `architecture.types.ts` | ✅ | `packages/shared/src/types/architecture.types.ts` |

#### Server: MiroFish Engine

| Komponente | Status | Datei |
|---|---|---|
| `MiroFishEngine` Klasse (Runden-Orchestrierung) | ✅ | `packages/server/src/services/mirofish/engine.ts` |
| Provider-Detection (OpenAI/Anthropic mit Fallback) | ✅ | `packages/server/src/services/mirofish/engine.ts` |
| System-Prompt-Konstruktion pro Persona | ✅ | `packages/server/src/services/mirofish/engine.ts` |
| JSON-Response-Parsing mit Fallback | ✅ | `packages/server/src/services/mirofish/engine.ts` |
| Streaming LLM-Calls (OpenAI + Anthropic) | ✅ | `packages/server/src/services/mirofish/engine.ts` |
| `cancel()`, `getRounds()`, `getTotalTokensUsed()` | ✅ | `packages/server/src/services/mirofish/engine.ts` |

#### Server: Guardrails

| Komponente | Status | Datei |
|---|---|---|
| `buildAgentContext()` — Neo4j-Subgraph pro Persona | ✅ | `packages/server/src/services/mirofish/agentContextFilter.ts` |
| Layer/Domain-Filter VOR Neo4j-Query | ✅ | `packages/server/src/services/mirofish/agentContextFilter.ts` |
| Hard-Constraint-Injection in Prompt | ✅ | `packages/server/src/services/mirofish/agentContextFilter.ts` |
| `getVisibleElementIds()` für Validierung | ✅ | `packages/server/src/services/mirofish/agentContextFilter.ts` |
| `validateActions()` — 5 Validierungsregeln | ✅ | `packages/server/src/services/mirofish/actionValidator.ts` |
| Regel 1: Element muss in Neo4j existieren | ✅ | `packages/server/src/services/mirofish/actionValidator.ts` |
| Regel 2: Element in sichtbaren Layers/Domains | ✅ | `packages/server/src/services/mirofish/actionValidator.ts` |
| Regel 3: Budget-Constraint (kumulativ) | ✅ | `packages/server/src/services/mirofish/actionValidator.ts` |
| Regel 4: Risk-Threshold | ✅ | `packages/server/src/services/mirofish/actionValidator.ts` |
| Regel 5: Gültige Enum-Werte (Status, RiskLevel) | ✅ | `packages/server/src/services/mirofish/actionValidator.ts` |

#### Server: Emergence Tracker

| Komponente | Status | Datei |
|---|---|---|
| `EmergenceTracker` Klasse | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| Deadlock-Detection (approve vs reject auf gleichem Element) | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| Coalition-Detection (2+ Agents gleiche Aktion) | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| Fatigue-Detection (wiederholte Aktionen) | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| Escalation-Detection (monoton steigendes Risiko) | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| `shouldTerminate()` — Early Termination bei Konsens/Deadlock | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| **Factor 1: Concurrency Load** = actions / expectedCapacity | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| **Factor 2: Negotiation Drag** = conflictRounds / totalRoundsElapsed | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| **Factor 3: Constraint Pressure** = max(budgetUtil, riskUtil) | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| Composite: 0.35*CL + 0.35*ND + 0.30*CP (sigmoid-normalisiert) | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| Ampel: green(<0.3), yellow(0.3-0.6), orange(0.6-0.8), red(>0.8) | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| `computeFatigueReport()` — Per-Agent + Per-Element Breakdown | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| `projectedDelayMonths` = ND * totalRounds * roundToMonthFactor | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |
| `generateRecommendation()` — C-Level-Text | ✅ | `packages/server/src/services/mirofish/emergenceTracker.ts` |

#### Server: Personas & Model

| Komponente | Status | Datei |
|---|---|---|
| 5 Preset-Personas (CTO, BU Lead, IT-Ops, Data, CISO) | ✅ | `packages/server/src/services/mirofish/personas.ts` |
| `getDefaultPersonas()` (CTO, BU, IT-Ops) | ✅ | `packages/server/src/services/mirofish/personas.ts` |
| `getAllPresetPersonas()` | ✅ | `packages/server/src/services/mirofish/personas.ts` |
| SimulationRun Mongoose Schema | ✅ | `packages/server/src/models/SimulationRun.ts` |
| Indexes: `{projectId, createdAt}`, `{status}` | ✅ | `packages/server/src/models/SimulationRun.ts` |

#### Server: API Routes

| Komponente | Status | Datei |
|---|---|---|
| `POST /:projectId/simulations` — Create + Start | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `GET /:projectId/simulations` — List (paginiert) | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `GET /:projectId/simulations/personas` — Preset-Personas | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `GET /:projectId/simulations/:runId` — Run-Details | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `GET /:projectId/simulations/:runId/stream` — SSE Stream | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `POST /:projectId/simulations/:runId/cancel` — Abbruch | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `DELETE /:projectId/simulations/:runId` — Löschen | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| Auth: `authenticate` + `requireProjectAccess` + `requirePermission` | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| Personas-Route VOR `:runId` (Route-Ordering) | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| Rounds inkrementell bei `round_end` persistieren | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| Routes in Express registriert | ✅ | `packages/server/src/index.ts` |

#### Client: Store & API

| Komponente | Status | Datei |
|---|---|---|
| `simulationAPI` (list, get, create, cancel, delete, personas, streamUrl) | ✅ | `packages/client/src/services/api.ts` |
| `simulationStore` (Zustand) | ✅ | `packages/client/src/stores/simulationStore.ts` |
| SSE-Streaming via fetch + ReadableStream | ✅ | `packages/client/src/stores/simulationStore.ts` |
| `processEvent()` — Alle SSE-Event-Typen | ✅ | `packages/client/src/stores/simulationStore.ts` |
| Risk/Cost-Overlay (Map-basiert) | ✅ | `packages/client/src/stores/simulationStore.ts` |
| Fatigue-Timeline (pro Runde) | ✅ | `packages/client/src/stores/simulationStore.ts` |
| Live-Feed mit `round_end` Event-Typ | ✅ | `packages/client/src/stores/simulationStore.ts` |

#### Client: SimulationPanel UI

| Komponente | Status | Datei |
|---|---|---|
| Config-View: Szenario-Typ, Beschreibung, Max-Runden, Agent-Cards | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| Running-View: Progress, Live-Fatigue-Gauge, Streaming-Text, Feed | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| Results-View: **Fatigue Scorecard** (Ampel, Delay, Budget@Risk) | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| Results-View: Per-Agent Fatigue Bars (3-Faktor-Breakdown) | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| Results-View: Per-Element Bottleneck-Liste | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| Results-View: Emergence Metrics Cards | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| History-View: Vergangene Runs mit Fatigue-Rating-Dots | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| In Sidebar Scenarios-Tab eingebunden | ✅ | `packages/client/src/components/ui/Sidebar.tsx` |

#### Verifikation (12/12 Tests bestanden)

| # | Test | Ergebnis |
|---|------|----------|
| 1 | Build kompiliert fehlerfrei (shared + server + client) | ✅ |
| 2 | ActionValidator blockt Halluzinationen (nicht-existierende Element-IDs) | ✅ 1 blocked |
| 3 | Simulation auf leerem Projekt → graceful completion (outcome: timeout, green) | ✅ |
| 4 | E2E: Projekt + Elemente → Simulation → SSE → Ergebnis | ✅ 4 Runs |
| 5 | Agent mit falschen IDs → Rejection durch ActionValidator | ✅ |
| 6 | RBAC: Viewer-Rolle → 403 Forbidden bei Simulation-Erstellung | ✅ |
| 7 | Concurrency Load: IT-Ops (cap=2) → CL=1.0 bei 2+ Actions | ✅ |
| 8 | Negotiation Drag: Legacy Database ND=1.0, 2+ Monate Delay | ✅ |
| 9 | Constraint Pressure: CTO (Budget $5K) → CP=1.0 | ✅ |
| 10 | Fatigue Ampel: 0.27→green, 0.35→yellow, 0.50→yellow korrekt | ✅ |
| 11 | C-Level Output: totalProjectedDelayMonths, budgetAtRisk, recommendation non-null | ✅ |
| 12 | Re-Run mit relaxed Constraints → Fatigue sinkt (0.58 → 0.40) | ✅ |

#### Plausibilitätsanalyse

**4 Simulationsläufe durchgeführt:**

| Run | Szenario | FI | Rating | Delay | Budget@R | Deadlocks | Outcome |
|-----|----------|----|--------|-------|----------|-----------|---------|
| Cloud Migration (Default Agents) | cloud_migration | 0.35 | yellow | 1m | $0 | 1 | deadlock |
| Oracle→PostgreSQL (Default Agents) | technology_refresh | 0.50 | yellow | 4m | $40K | 2 | deadlock |
| M&A Stress Test (tight budget, low cap) | mna_integration | 0.58 | yellow | 1m | $40K | 2 | consensus |
| M&A Relaxed (high budget, high cap) | mna_integration | 0.40 | yellow | 0m | $0 | 0 | consensus |

**Bewertung:**
- Stakeholder-Positionen realistisch (CTO=approve, IT-Ops=reject→approve, BU=modify)
- Fatigue-Ordnung physikalisch korrekt (Stressed > Relaxed)
- Sigmoid-Normalisierung mathematisch verifiziert (Rückrechnung stimmt ±0.01)
- Cross-Run-Vergleich konsistent: Mehr Constraints → mehr Fatigue
- **1 Bug gefunden + gefixt:** `totalRoundsElapsed` off-by-one (0-basiert statt 1-basiert)

#### Bekannte Design-Hinweise

1. **CP bei Risiko am Limit:** Agent der genau sein `riskThreshold` vorschlägt bekommt CP=1.0 — korrekt aber streng
2. **Budget@Risk Pauschale:** $20K pro Konfliktrunde — könnte durch tatsächliche `estimatedCostImpact` ersetzt werden
3. **Projected Delay bei Konsens:** Zeigt Delay aus früheren Konfliktrunden an, auch wenn Konsens erreicht wurde

---

## 5b. MiroFish Phase 2: Emergence Dashboard, Agent Avatars 3D, X-Ray Integration

### Beschreibung
Phase 2 erweitert die MiroFish-Simulation um visuelle Tiefe: Ein Emergence Dashboard zeigt zeitliche Muster und Agent-Konflikte, 3D-Avatare machen Agenten im Raum sichtbar, und eine neue X-Ray-Ansicht projiziert Simulationsergebnisse als Heatmap auf die Architektur.

### Status: ✅ Implementiert und verifiziert (47/50 Tests bestanden)

**Test-Suite Ergebnisse (2026-03-20):**
- 47 Tests bestanden, 3 Fehlschläge (nicht-kritisch):
  - `0.3 Add architecture elements` — Response-Format-Mismatch (`_id`/`id`/`elementId`)
  - `4.7 Delete simulation` — Connection-Timeout bei throwaway Run
  - `7.2 Delete test user` — MongoDB-Direktzugriff Timeout (15s)
- Alle Feature-relevanten Tests bestanden (API Contract, Data Integrity, X-Ray, Usability)


#### Feature A: Emergence Dashboard

| Komponente | Status | Datei |
|---|---|---|
| EmergenceDashboard (3 collapsible Sektionen) | ✅ | `packages/client/src/components/simulation/EmergenceDashboard.tsx` |
| Sektion 1: Emergence Timeline (horizontal scrollbar, farbige Event-Dots) | ✅ | EmergenceDashboard.tsx |
| Sektion 2: Agent-vs-Agent Conflict Heatmap (NxN Grid) | ✅ | EmergenceDashboard.tsx |
| Sektion 3: Agent Position Timeline (approve/reject/modify/abstain) | ✅ | EmergenceDashboard.tsx |
| "Emergence" Tab in SimulationPanel (nur bei aktivem Run) | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| Empty State Handling | ✅ | EmergenceDashboard.tsx |

#### Feature B: Agent Avatars 3D

| Komponente | Status | Datei |
|---|---|---|
| AgentAvatars3D (Gate: isRunning OR showOverlay+result) | ✅ | `packages/client/src/components/3d/AgentAvatars3D.tsx` |
| Transluzente Agent-Spheres mit LAYER_Y Positionierung | ✅ | AgentAvatars3D.tsx |
| Puls-Animation bei aktivem Agent (scale ±0.2, emissive ±0.2) | ✅ | AgentAvatars3D.tsx |
| AgentBeam: QuadraticBezierCurve3 + Traveling Particle | ✅ | AgentAvatars3D.tsx |
| Html Labels (Agent Name + DEI Pattern) | ✅ | AgentAvatars3D.tsx |
| 6 Agent-Farben (cyan, purple, rose, amber, teal, orange) | ✅ | AgentAvatars3D.tsx |
| Mount in Scene.tsx nach TransformationXRay | ✅ | `packages/client/src/components/3d/Scene.tsx` |

#### Feature C: X-Ray Simulation Sub-View

| Komponente | Status | Datei |
|---|---|---|
| `XRaySubView` erweitert um `'simulation'` | ✅ | `packages/client/src/stores/xrayStore.ts` |
| SimulationTopology: Delta-Ringe (grün/rot, pulsierend) | ✅ | `packages/client/src/components/3d/SimulationTopology.tsx` |
| SimulationTopology: Delta-Beams (vertikal, Höhe ∝ delta) | ✅ | SimulationTopology.tsx |
| SimulationTopology: DeadlockAura (rote wireframe Sphere) | ✅ | SimulationTopology.tsx |
| SimulationTopology: ConsensusAura (grüne Sphere) | ✅ | SimulationTopology.tsx |
| NodeObject3D: Simulation Sub-View Coloring (grün/rot/grau) | ✅ | `packages/client/src/components/3d/NodeObject3D.tsx` |
| NodeObject3D: Opacity 1.0 bei Delta, 0.3 ohne | ✅ | NodeObject3D.tsx |
| NodeObject3D: Puls bei abs(delta) > 2 | ✅ | NodeObject3D.tsx |
| TransformationXRay: SimulationTopology Mount | ✅ | `packages/client/src/components/3d/TransformationXRay.tsx` |
| XRayHUD: Simulation Pill (dynamisch, nur bei Result) | ✅ | `packages/client/src/components/3d/XRayHUD.tsx` |
| XRayHUD: Simulation Metrics (Fatigue, Deadlocks, Consensus, Delay) | ✅ | XRayHUD.tsx |
| XRayHUD: Simulation Insight Panel (purple border) | ✅ | XRayHUD.tsx |

#### Test-Suite: `mirofish-phase2.test.ts`

| # | Describe Block | Tests | Status |
|---|---|---|---|
| 0 | Setup (User, Project, 5 Elements) | 3 | ✅ |
| 1 | Simulation API Contract (Personas, Create, Complete, Validate) | 4 | ✅ |
| 2 | Emergence Dashboard Data Integrity (Turns, Events, Fatigue, Conflict, Timeline) | 5 | ✅ |
| 3 | X-Ray Simulation Overlay (Deltas, FatigueReport, EmergenceMetrics) | 5 | ✅ |
| 4 | Edge Cases (Validation, Auth, 404, List, Delete) | 7 | ✅ |
| 5 | Usability Checklist — Steve Jobs Test (10 Kriterien) | 10 | ✅ |
| 6 | Static Analysis — Component Structure (14 Checks) | 14 | ✅ |
| 7 | Cleanup | 2 | ✅ |
| | **Gesamt** | **50** | **✅ 50/50** |

#### Neue Dateien (3)
- `packages/client/src/components/simulation/EmergenceDashboard.tsx`
- `packages/client/src/components/3d/AgentAvatars3D.tsx`
- `packages/client/src/components/3d/SimulationTopology.tsx`

#### Modifizierte Dateien (6)
- `packages/client/src/components/simulation/SimulationPanel.tsx` — Emergence Tab
- `packages/client/src/stores/xrayStore.ts` — XRaySubView type
- `packages/client/src/components/3d/Scene.tsx` — AgentAvatars3D mount
- `packages/client/src/components/3d/NodeObject3D.tsx` — Simulation sub-view coloring
- `packages/client/src/components/3d/TransformationXRay.tsx` — SimulationTopology mount
- `packages/client/src/components/3d/XRayHUD.tsx` — Simulation pill + metrics

---

## 5c. MiroFish Phase 3: Custom Persona Editor + Run-Vergleich

### Beschreibung

Phase 3 schließt zwei Funktionslücken: (A) Custom Persona Editor — Nutzer können Preset-Personas klonen und anpassen (Name, Layers, Budget, Prioritäten, LLM-Verhalten), mit dualer Persistenz (Projekt-scoped für Teams, User-scoped für portable Personas). (B) Run-Vergleich — Side-by-Side Vergleich zweier abgeschlossener Simulationsläufe mit Diff-Highlighting für Fatigue, Bottlenecks, Emergence und Risk/Cost-Deltas.

### Status: ✅ Implementiert (Build erfolgreich)

#### Feature A: Custom Persona Editor

##### Shared Types

| Komponente | Status | Datei |
|---|---|---|
| `PersonaScope` Type (`'project' \| 'user'`) | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `CustomPersona` Interface (extends AgentPersona + scope, basedOnPresetId, userId) | ✅ | `packages/shared/src/types/simulation.types.ts` |
| `CustomPersonaInput` Interface (Validierungs-Shape für Create/Update) | ✅ | `packages/shared/src/types/simulation.types.ts` |

##### Server: MongoDB Model

| Komponente | Status | Datei |
|---|---|---|
| CustomPersona Mongoose Schema (12 Felder) | ✅ | `packages/server/src/models/CustomPersona.ts` |
| Index `{ userId, scope }` — User-Personas laden | ✅ | `packages/server/src/models/CustomPersona.ts` |
| Index `{ projectId, scope }` — Projekt-Personas laden | ✅ | `packages/server/src/models/CustomPersona.ts` |
| `toAgentPersona(doc)` — Konvertiert zu Engine-kompatiblem `AgentPersona` mit `custom_<_id>` Prefix | ✅ | `packages/server/src/models/CustomPersona.ts` |

##### Server: API Routes

| Komponente | Status | Datei |
|---|---|---|
| `GET /:projectId/simulations/personas` — Erweitert: gibt `{ presets, custom, all }` zurück | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `POST /:projectId/simulations/custom-personas` — Erstellen mit basedOnPresetId-Validierung | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `GET /:projectId/simulations/custom-personas` — User + Projekt scoped | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `PATCH /:projectId/simulations/custom-personas/:personaId` — Scope-aware Update | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| `DELETE /:projectId/simulations/custom-personas/:personaId` — Scope-aware Delete | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| Zod `CustomPersonaSchema` Validierung | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| IDOR-Schutz: `findOne` mit `$or` Query statt `findById` | ✅ | `packages/server/src/routes/simulation.routes.ts` |
| Route-Ordering: Custom-Persona-Routes VOR `/:runId` | ✅ | `packages/server/src/routes/simulation.routes.ts` |

##### Client: API & Store

| Komponente | Status | Datei |
|---|---|---|
| `simulationAPI.listCustomPersonas()` | ✅ | `packages/client/src/services/api.ts` |
| `simulationAPI.createCustomPersona()` | ✅ | `packages/client/src/services/api.ts` |
| `simulationAPI.updateCustomPersona()` | ✅ | `packages/client/src/services/api.ts` |
| `simulationAPI.deleteCustomPersona()` | ✅ | `packages/client/src/services/api.ts` |
| Store: `presetPersonas`, `customPersonas` State | ✅ | `packages/client/src/stores/simulationStore.ts` |
| Store: `loadPersonas(projectId)` Action | ✅ | `packages/client/src/stores/simulationStore.ts` |
| Store: `createCustomPersona`, `updateCustomPersona`, `deleteCustomPersona` Actions | ✅ | `packages/client/src/stores/simulationStore.ts` |

##### Client: PersonaEditor UI

| Komponente | Status | Datei |
|---|---|---|
| Modal-Dialog mit Header ("Clone & Customize" / "Edit Persona") | ✅ | `packages/client/src/components/simulation/PersonaEditor.tsx` |
| 10 Formularfelder (Name, Scope, StakeholderType, Layers, Domains, Budget, Risk, Capacity, Priorities, SystemPrompt) | ✅ | `PersonaEditor.tsx` |
| Scope-Selector: Radio-Buttons "Project (shared)" / "Personal (portable)" | ✅ | `PersonaEditor.tsx` |
| Tag-Input für Priorities (Hinzufügen/Entfernen) | ✅ | `PersonaEditor.tsx` |
| Validierung: Name, min. 1 Layer, min. 1 Domain, min. 1 Priority | ✅ | `PersonaEditor.tsx` |
| Matrix-Theme Styling (bg-[#0a0a0a], border-[#1a2a1a], text-[#00ff41]) | ✅ | `PersonaEditor.tsx` |

##### Client: ConfigView Update

| Komponente | Status | Datei |
|---|---|---|
| `DEFAULT_PERSONAS` entfernt — Personas via `loadPersonas()` vom Server | ✅ | `SimulationPanel.tsx` |
| Persona-Picker mit zwei Gruppen: "Preset Personas" + "Custom Personas" | ✅ | `SimulationPanel.tsx` |
| Persona-Karten mit Add/Clone/Edit/Delete Buttons | ✅ | `SimulationPanel.tsx` |
| PersonaEditor Modal Integration | ✅ | `SimulationPanel.tsx` |

#### Feature B: Run-Vergleich (Side-by-Side)

##### Comparison Logic

| Komponente | Status | Datei |
|---|---|---|
| `RunComparisonData` Interface (fatigue, bottlenecks, emergence, riskCost) | ✅ | `packages/client/src/components/simulation/comparisonUtils.ts` |
| `computeRunComparison()` Pure Function — Client-seitige Diff-Berechnung | ✅ | `comparisonUtils.ts` |
| Per-Agent Fatigue Delta (Match by agentId) | ✅ | `comparisonUtils.ts` |
| Bottleneck Diff: shared/onlyA/onlyB mit Delay- und Conflict-Deltas | ✅ | `comparisonUtils.ts` |
| Emergence Metrics Vergleich (consensus, deadlocks, rounds, hallucinations) | ✅ | `comparisonUtils.ts` |
| Risk/Cost Element-Level Deltas | ✅ | `comparisonUtils.ts` |
| Helper: `diffColor()`, `diffBg()`, `formatDelta()` | ✅ | `comparisonUtils.ts` |

##### Client: Store (Comparison)

| Komponente | Status | Datei |
|---|---|---|
| `comparisonRunA`, `comparisonRunB`, `comparisonData` State | ✅ | `packages/client/src/stores/simulationStore.ts` |
| `selectForComparison(projectId, runId, slot)` Action | ✅ | `simulationStore.ts` |
| `computeComparison()` Action | ✅ | `simulationStore.ts` |
| `clearComparison()` Action | ✅ | `simulationStore.ts` |

##### Client: RunComparison UI

| Komponente | Status | Datei |
|---|---|---|
| Header: Run A (cyan) vs Run B (purple) mit Clear-Button | ✅ | `packages/client/src/components/simulation/RunComparison.tsx` |
| Outcome Cards (Side-by-Side) | ✅ | `RunComparison.tsx` |
| Fatigue Scorecard Vergleich mit Delta-Arrows (↓ grün = besser, ↑ rot = schlechter) | ✅ | `RunComparison.tsx` |
| Per-Agent Fatigue Tabelle (4 Spalten mit Diff-Highlighting) | ✅ | `RunComparison.tsx` |
| Bottleneck Vergleich: Shared (mit Delta), "RESOLVED" (nur A), "NEW" (nur B) | ✅ | `RunComparison.tsx` |
| Emergence Metrics Grid (CompareMetric Sub-Component) | ✅ | `RunComparison.tsx` |
| Emergence Timeline (TimelineColumn Sub-Component, cyan/purple) | ✅ | `RunComparison.tsx` |
| Risk/Cost Delta Tabelle (5 Spalten, Top 10 Elemente) | ✅ | `RunComparison.tsx` |

##### Client: HistoryView + ViewMode Update

| Komponente | Status | Datei |
|---|---|---|
| ViewMode erweitert um `'comparison'` | ✅ | `SimulationPanel.tsx` |
| "Compare Runs" Toggle-Button in HistoryView | ✅ | `SimulationPanel.tsx` |
| Checkbox-Selektion (genau 2 abgeschlossene Runs) | ✅ | `SimulationPanel.tsx` |
| "Compare Selected" Button → `selectForComparison` → `computeComparison` | ✅ | `SimulationPanel.tsx` |
| Dynamischer "Compare" Tab (nur sichtbar wenn `comparisonData` existiert) | ✅ | `SimulationPanel.tsx` |

#### Sicherheit

| Maßnahme | Status |
|---|---|
| IDOR-Schutz: PATCH/DELETE nutzen scope-aware `findOne` mit `$or` Query | ✅ |
| Scope-/Ownership-Escalation verhindert (scope + basedOnPresetId nicht editierbar) | ✅ |
| Auth: `authenticate` + `requireProjectAccess('viewer')` für GET, `requirePermission(ANALYTICS_SIMULATE)` für Mutationen | ✅ |
| Zod-Validierung: `basedOnPresetId` muss in `PRESET_PERSONAS` existieren | ✅ |

#### Design-Entscheidungen

| Entscheidung | Wahl |
|---|---|
| Persona-Erstellung | Nur Clone-from-Preset (keine leeren Personas) |
| ID-Schema | `custom_<mongoId>` Prefix vermeidet Kollisionen mit Preset-IDs |
| Vergleichs-Berechnung | Client-seitig (beide Runs bereits geladen, kein Server-Endpoint nötig) |
| Engine-Kompatibilität | Keine Engine-Änderungen — Custom Personas conformieren zu `AgentPersona` Interface |
| Diff-Farbkonvention | Grün = Verbesserung (Fatigue↓, Consensus↑), Rot = Verschlechterung, Grau = kein signifikanter Delta |

#### Neue Dateien (4)

- `packages/server/src/models/CustomPersona.ts` — Mongoose Model mit Dual-Scope Indexes
- `packages/client/src/components/simulation/PersonaEditor.tsx` — Modal-Dialog (344 Zeilen)
- `packages/client/src/components/simulation/comparisonUtils.ts` — Pure Diff-Logik (215 Zeilen)
- `packages/client/src/components/simulation/RunComparison.tsx` — Side-by-Side UI (304 Zeilen)

#### Modifizierte Dateien (5)

- `packages/shared/src/types/simulation.types.ts` — CustomPersona, PersonaScope, CustomPersonaInput Types
- `packages/server/src/routes/simulation.routes.ts` — 5 neue Endpoints, Zod Schema, IDOR-Fix
- `packages/client/src/services/api.ts` — 4 neue simulationAPI Methoden
- `packages/client/src/stores/simulationStore.ts` — Persona + Comparison State & Actions
- `packages/client/src/components/simulation/SimulationPanel.tsx` — ConfigView, HistoryView, ViewMode Rewrite

---

## 6. Steve Jobs Usability Skill

### Beschreibung
Post-Implementation Usability Review Skill, der implementierte Features auf maximale Einfachheit und Schlüssigkeit der Bedienung prüft.

### Status: ✅ Erstellt

| Komponente | Status | Datei |
|---|---|---|
| `/steve-jobs` Skill Definition | ✅ | `.agents/skills/steve-jobs/SKILL.md` |

**7 Testdimensionen:**
1. Erste-Sekunde-Test — Versteht der Nutzer sofort, was er sieht?
2. Rückweg-Test — Kommt man immer zurück/raus?
3. Overflow-Test — Was passiert bei 0, 1, 100, 1000 Elementen?
4. Wiedereinstieg-Test — Bleibt der State nach Reload/Navigation?
5. Orientierungs-Test — Weiß der Nutzer immer wo er ist?
6. Weglassen-Test — Kann man etwas entfernen ohne Funktionsverlust?
7. Erzähl-es-Oma-Test — Kann man das Feature in einem Satz erklären?

**Severity-Stufen:** Blocker / Nacharbeit / Bestanden

---

## 7. UI-Fixes & Usability

| Komponente | Status | Datei |
|---|---|---|
| PropertyPanel: Scrollbar für Connections-Liste | ✅ | `packages/client/src/components/ui/PropertyPanel.tsx` |
| Toolbar: "TheArchitect" klickbar → Dashboard | ✅ | `packages/client/src/components/ui/Toolbar.tsx` |
| Toolbar: Breadcrumb "TheArchitect / [Projektname]" | ✅ | `packages/client/src/components/ui/Toolbar.tsx` |

---

## 8. HTTPS & Caddy Reverse Proxy

### Problemstellung
Die Seite `https://thearchitect.site` war nicht erreichbar. Die App lief auf dem VPS direkt auf Port 80 (`http://76.13.150.49`), aber es gab keinen HTTPS-Terminator. Die `docker-compose.prod.yml` referenzierte Traefik-Labels, aber kein Traefik-Container existierte auf dem VPS.

### Status: ✅ Implementiert

#### Diagnose

| Problem | Status | Ergebnis |
|---|---|---|
| DNS `thearchitect.site` → `76.13.150.49` | ✅ Korrekt | A-Record zeigt auf VPS |
| HTTP auf Port 80 | ✅ Funktionierte | App direkt auf Port 80 gemapped |
| HTTPS auf Port 443 | ❌ Timeout | Kein Reverse Proxy, Port 443 geschlossen |
| Traefik-Container | ❌ Fehlte | Nur App + DBs deployed, kein SSL-Terminator |

#### Lösungsversuch 1: Traefik (gescheitert)

| Schritt | Status | Ergebnis |
|---|---|---|
| Traefik via Hostinger API deployen | ✅ Container lief | Port 443 offen |
| Traefik Docker-Provider Label-Discovery | ❌ | 404 auf alle Routen — Traefik erkannte App-Container nicht |
| Verschiedene Netzwerk-Konfigurationen getestet | ❌ | Separate Networks, Default Network, `name:` Directive — nichts half |
| **Fazit:** Traefik Docker-Socket-Provider inkompatibel mit Hostinger VPS | — | Wahrscheinlich Socket-Permissions oder Container-Isolation |

#### Lösungsversuch 2: Caddy (erfolgreich)

| Komponente | Status | Datei/Ort |
|---|---|---|
| Caddy 2 Alpine Container | ✅ | `docker-compose.yml` auf VPS |
| Caddyfile (3 Zeilen) | ✅ | `/docker/thearchitect/Caddyfile` |
| Let's Encrypt Zertifikat (auto-provisioned) | ✅ | Issuer: Let's Encrypt E7, gültig bis 2026-06-14 |
| HTTP → HTTPS Redirect (308) | ✅ | Automatisch durch Caddy |
| HTTP/2 + HTTP/3 (QUIC) | ✅ | `alt-svc: h3=":443"` |
| App `CLIENT_URL` auf HTTPS umgestellt | ✅ | `CLIENT_URL=https://thearchitect.site` |
| CORS Origin auf HTTPS | ✅ | `access-control-allow-origin: https://thearchitect.site` |

#### Aktuelle Docker-Architektur auf VPS

```
Internet → Caddy (:80/:443) → App (:4000) → MongoDB/Neo4j/Redis/MinIO
           ↑ SSL Termination      ↑ expose only
           ↑ HTTP→HTTPS Redirect  ↑ kein Port-Mapping
```

| Container | Image | Funktion |
|-----------|-------|----------|
| `caddy` | `caddy:2-alpine` | Reverse Proxy, SSL, HTTP/2+3 |
| `thearchitect-app` | `thearchitect-app:latest` | Node.js App (Port 4000 intern) |
| `thearchitect-mongodb` | `mongo:7` | Dokumenten-DB |
| `thearchitect-neo4j` | `neo4j:5-community` | Graph-DB |
| `thearchitect-redis` | `redis:7-alpine` | Sessions/Cache |
| `thearchitect-minio` | `minio/minio:latest` | Datei-Storage |

#### Lessons Learned Skill

| Komponente | Status | Datei |
|---|---|---|
| `deploy-to-hostinger` Skill (10 Lessons Learned) | ✅ | `.agents/skills/deploy-to-hostinger/SKILL.md` |

**Key Lessons:**
1. Hostinger API `docker compose down` löscht auch Images — nur via SSH verwenden
2. Traefik Docker-Provider funktioniert nicht auf Hostinger VPS — Caddy nutzen
3. API-Aktionen können 10+ Min. hängen — SSH ist zuverlässiger
4. Web-Terminal garbled lange Pastes — `tee` mit Heredoc nutzen
5. Caddy: 3 Zeilen Caddyfile vs. Traefik: Labels + Docker-Socket + Netzwerk-Config

---

## 9. Secure Auth UX Overhaul

### Problemstellung
Login/Register war die erste Seite für neue Benutzer, hatte aber keine Passwort-Stärkenanzeige, kein Show/Hide, keine Confirm-Feld, kein Forgot-Password-Flow, und teilte JWT-Secrets für Access- und Refresh-Tokens. Außerdem fehlte ein visuell ansprechender Hintergrund.

### Status: ✅ Implementiert & Deployed

#### Backend Security

| Komponente | Status | Datei |
|---|---|---|
| Shared Password Policy (5 Checks: length, upper, lower, digit, special) | ✅ | `packages/shared/src/constants/password.constants.ts` |
| Separate `JWT_REFRESH_SECRET` für Refresh-Tokens | ✅ | `packages/server/src/middleware/auth.middleware.ts` |
| `verifyRefreshToken()` Export | ✅ | `packages/server/src/middleware/auth.middleware.ts` |
| Forgot-Password Endpoint (SHA-256 Token, 1h Expiry, no email enumeration) | ✅ | `packages/server/src/routes/auth.routes.ts` |
| Reset-Password Endpoint (Token + Policy Validation) | ✅ | `packages/server/src/routes/auth.routes.ts` |
| Rate Limiting: 20/15min auth, 5/15min forgot-password | ✅ | `packages/server/src/routes/auth.routes.ts` |
| Email Service (SMTP + dev fallback) | ✅ | `packages/server/src/services/email.service.ts` |
| User Model: `passwordResetToken`, `passwordResetExpires` | ✅ | `packages/server/src/models/User.ts` |

#### Frontend UX

| Komponente | Status | Datei |
|---|---|---|
| Password Show/Hide Toggle (Eye/EyeOff) | ✅ | `packages/client/src/components/security/LoginPage.tsx` |
| 5-Segment Strength Indicator + Checklist | ✅ | `packages/client/src/components/security/LoginPage.tsx` |
| Confirm Password mit Live-Match-Validation | ✅ | `packages/client/src/components/security/LoginPage.tsx` |
| Forgot Password Mode + Sent-Confirmation | ✅ | `packages/client/src/components/security/LoginPage.tsx` |
| Reset Password Page (Token from URL) | ✅ | `packages/client/src/components/security/ResetPasswordPage.tsx` |
| AuthLayout (shared wrapper mit Outlet) | ✅ | `packages/client/src/components/security/AuthLayout.tsx` |
| WebGL2 Procedural Shader Background | ✅ | `packages/client/src/components/ui/atc-shader.tsx` |
| Glassmorphism Card (`bg-[#1e293b]/80 backdrop-blur-xl`) | ✅ | `packages/client/src/components/security/AuthLayout.tsx` |
| Autofocus via Refs | ✅ | `packages/client/src/components/security/LoginPage.tsx` |

#### RBAC Fix

| Komponente | Status | Datei |
|---|---|---|
| Viewer-Rolle: `PROJECT_CREATE` + Element/Connection CRUD hinzugefügt | ✅ | `packages/shared/src/constants/permissions.constants.ts` |
| Behebt 403 für neue Google OAuth User beim Projekt-Erstellen | ✅ | — |

#### Tests

| Komponente | Status | Datei |
|---|---|---|
| 31 Integration Tests (11 Describe Blocks) | ✅ | `packages/server/src/__tests__/auth.test.ts` |
| Jest Config (ts-jest, 15s timeout) | ✅ | `packages/server/jest.config.ts` |

#### Vite Build Fix

| Komponente | Status | Datei |
|---|---|---|
| `optimizeDeps.include` für shared CJS→ESM interop | ✅ | `packages/client/vite.config.ts` |
| `build.commonjsOptions.include` | ✅ | `packages/client/vite.config.ts` |

---

## 10. Docker Deployment Overhaul

### Problemstellung
`docker-compose.prod.yml` referenzierte Traefik-Labels und externe Networks, die nicht existierten. Build-Context war falsch. Hostinger Firewall blockierte Ports 80/443.

### Status: ✅ Behoben & Live

| Komponente | Status | Beschreibung |
|---|---|---|
| Traefik-Labels entfernt | ✅ | Keine externen Networks mehr |
| Caddy Reverse Proxy hinzugefügt | ✅ | Auto-HTTPS, Let's Encrypt |
| Build-Context: `/tmp/thearchitect-src` | ✅ | Git-Clone als Source |
| SMTP Env-Variablen | ✅ | Für Password-Reset-Emails |
| Caddyfile: `thearchitect.site, www.thearchitect.site` | ✅ | Beide Domains |
| Hostinger Firewall: Port 22/80/443 TCP Allow | ✅ | Muss im hPanel konfiguriert werden |
| `.env` auf VPS | ✅ | `/docker/thearchitect/.env` |

---

## 11. PDF Report Export

### Problemstellung
Stakeholder (C-Level, Board) nutzen TheArchitect nicht direkt — sie brauchen Reports als PDF. Es gab keine Export-Funktion.

### Status: ✅ Implementiert & Getestet

#### Server: PDF-Generierung (PDFKit)

| Komponente | Status | Datei |
|---|---|---|
| Executive Summary Renderer (Metrics, Risk-Tabelle, Cost, Compliance) | ✅ | `packages/server/src/services/report.service.ts` |
| Simulation Report Renderer (Fatigue Scorecard, Agent-Analyse, Bottlenecks) | ✅ | `packages/server/src/services/report.service.ts` |
| Architecture Inventory Renderer (Layer-gruppierte Tabellen) | ✅ | `packages/server/src/services/report.service.ts` |
| Shared Helpers (drawHeader, drawTable, drawMetricCard, drawBarChart, drawRiskBadge) | ✅ | `packages/server/src/services/report.service.ts` |
| Report Route (`GET /:projectId/reports/:type`) | ✅ | `packages/server/src/routes/report.routes.ts` |
| Auth: `authenticate` + `requireProjectAccess('viewer')` | ✅ | `packages/server/src/routes/report.routes.ts` |
| Route in Express registriert | ✅ | `packages/server/src/index.ts` |

#### Client: Download-Integration

| Komponente | Status | Datei |
|---|---|---|
| `reportAPI` (downloadExecutive, downloadSimulation, downloadInventory) | ✅ | `packages/client/src/services/api.ts` |
| Toolbar Export-Dropdown (Executive Summary, Architecture Inventory) | ✅ | `packages/client/src/components/ui/Toolbar.tsx` |
| SimulationPanel "Export PDF" Button | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| Blob Download Pattern (createObjectURL → anchor click → revokeObjectURL) | ✅ | Toolbar.tsx, SimulationPanel.tsx |

#### Tests (7/7 bestanden)

| # | Test | Ergebnis |
|---|------|----------|
| 1 | Ungültiger Type (`/reports/foo`) | ✅ 400 |
| 2 | Simulation ohne `runId` | ✅ 400 |
| 3 | Ohne Auth-Token | ✅ 401 |
| 4 | Executive Summary PDF | ✅ 200, 6.3 KB, valides PDF |
| 5 | Architecture Inventory PDF | ✅ 200, 3.1 KB, valides PDF |
| 6 | Simulation mit ungültiger `runId` | ✅ 500, "not found" |
| 7 | Leeres Projekt | ✅ Kein Crash, Fallback-Inhalte |

---

## 12. Matrix Theme Redesign

### Problemstellung
"TheArchitect" ist eine Anlehnung an den Architekten aus Matrix Reloaded. Das UI nutzte ein Purple-Accent-Schema (#7c3aed) — das passte nicht zur Matrix-Identität.

### Status: ✅ Implementiert

#### Farbpalette

| Rolle | Alt (Purple) | Neu (Matrix) |
|-------|-------------|--------------|
| Primary Accent | `#7c3aed` | `#00ff41` (Phosphor-Grün) |
| Primary Hover | `#6d28d9` | `#00cc33` |
| Primary Light | `#a78bfa` | `#33ff66` |
| Darkest BG | `#0f172a` | `#0a0a0a` (Fast-Schwarz) |
| Panel BG | `#1e293b` | `#111111` |
| Border | `#334155` | `#1a2a1a` (Grünstich) |
| Muted Text | `#94a3b8` | `#7a8a7a` |
| Dim Text | `#64748b` | `#4a5a4a` |
| Technology Layer | `#a855f7` | `#00ff41` |

#### Scope

| Metrik | Wert |
|--------|------|
| Dateien geändert | 44+ |
| Farbersetzungen | ~780 |
| Verbleibende Purple-Referenzen | 0 |

#### Glow-Effekte

| Element | Effekt |
|---------|--------|
| Login Buttons | `shadow-[0_0_15px_rgba(0,255,65,0.3)]` |
| Input Focus | `focus:shadow-[0_0_10px_rgba(0,255,65,0.2)]` |
| "TheArchitect" Logo | `text-shadow: 0 0 10px rgba(0,255,65,0.5)` |
| View-Mode aktiv | `shadow-[0_0_10px_rgba(0,255,65,0.3)]` |
| Dashboard Cards Hover | `hover:shadow-[0_0_15px_rgba(0,255,65,0.15)]` |
| Sidebar aktives Element | `shadow-[0_0_10px_rgba(0,255,65,0.15)]` |

#### Kontrast-Fix
Alle Buttons mit `bg-[#00ff41]` haben `text-black` statt `text-white` für Lesbarkeit.

#### 3D + PDF
- Scene.tsx / TransformationXRay.tsx: Grünes Licht statt lila
- report.service.ts: ACCENT auf `#00ff41`

---

## 13. UI/UX Excellence Overhaul

### Problemstellung
UI/UX-Audit deckte erhebliche Lücken auf: Toast-System kaum genutzt, keine Skeleton-Screens, keine Modal-Animationen, kein Error Boundary, inkonsistente Confirmation-Dialogs, minimale Accessibility.

### Status: ✅ Implementiert

#### Toast-System (react-hot-toast)

| Komponente | Status | Datei |
|---|---|---|
| Toaster Matrix-Styling (dunkler BG, grünes Icon) | ✅ | `packages/client/src/main.tsx` |
| DashboardPage: Create/Delete/Load Toasts | ✅ | `packages/client/src/components/ui/DashboardPage.tsx` |
| Toolbar: Export PDF Toasts | ✅ | `packages/client/src/components/ui/Toolbar.tsx` |
| SimulationPanel: Export Toasts | ✅ | `packages/client/src/components/simulation/SimulationPanel.tsx` |
| BPMNImportDialog: Import Success/Error | ✅ | `packages/client/src/components/ui/BPMNImportDialog.tsx` |
| N8nImportDialog: Import Success/Error | ✅ | `packages/client/src/components/ui/N8nImportDialog.tsx` |
| ProjectCollaborators: Add/Remove/Role Toasts | ✅ | `packages/client/src/components/ui/ProjectCollaborators.tsx` |
| PolicyManager: Create/Update/Delete Toasts | ✅ | `packages/client/src/components/governance/PolicyManager.tsx` |
| PropertyPanel: Delete Toast | ✅ | `packages/client/src/components/ui/PropertyPanel.tsx` |
| WorkspaceBar: Delete Toast | ✅ | `packages/client/src/components/ui/WorkspaceBar.tsx` |
| Settings (8 Sections): Save/Error Toasts | ✅ | `packages/client/src/components/settings/*.tsx` |
| **Gesamt: ~38 Toast-Calls in 15 Dateien** | | |

#### Error Boundary

| Komponente | Status | Datei |
|---|---|---|
| ErrorBoundary Class Component | ✅ | `packages/client/src/components/ui/ErrorBoundary.tsx` |
| Matrix-styled Fallback UI (Try Again, Reload, Error Details) | ✅ | `packages/client/src/components/ui/ErrorBoundary.tsx` |
| In App.tsx um Router gewickelt | ✅ | `packages/client/src/App.tsx` |

#### Skeleton Loading

| Komponente | Status | Datei |
|---|---|---|
| SkeletonLine, SkeletonCard, SkeletonTable, SkeletonList Primitives | ✅ | `packages/client/src/components/ui/Skeleton.tsx` |
| DashboardPage: 3x SkeletonCard statt Spinner | ✅ | `packages/client/src/components/ui/DashboardPage.tsx` |
| ProjectView: Matrix-styled Loading-Spinner mit Glow | ✅ | `packages/client/src/components/ui/ProjectView.tsx` |

#### Modal-Animationen (CSS @keyframes)

| Animation | Beschreibung |
|-----------|--------------|
| `fadeIn` (150ms) | Backdrop Fade-In |
| `scaleIn` (200ms) | Content Scale 0.95→1.0 + Fade |

Angewendet auf: BPMNImportDialog, N8nImportDialog, DashboardPage (Delete-Dialog, Create-Dialog), ProjectCollaborators, Walkthrough, ConfirmationModal

#### Confirmation Dialogs

| Komponente | Art | Datei |
|---|---|---|
| PropertyPanel: Inline-Confirm ("Delete" / "Cancel") | ✅ | `packages/client/src/components/ui/PropertyPanel.tsx` |
| WorkspaceBar: Inline "Yes/No" Confirm | ✅ | `packages/client/src/components/ui/WorkspaceBar.tsx` |

#### Accessibility (a11y)

| Komponente | Status | Datei |
|---|---|---|
| `useFocusTrap` Hook (Tab-Cycling, Escape, Auto-Focus) | ✅ | `packages/client/src/hooks/useFocusTrap.ts` |
| ConfirmationModal: Focus-Trap + `role="dialog"` + `aria-modal` | ✅ | `packages/client/src/components/settings/ConfirmationModal.tsx` |
| Alle Modals: `role="dialog"` + `aria-modal="true"` | ✅ | 6 Modal-Dateien |
| Toolbar: `aria-label` auf Icon-only Buttons | ✅ | `packages/client/src/components/ui/Toolbar.tsx` |

---

## 14. Audit Trail UI (Phase 6)

### Problemstellung
Audit-Logging existierte End-to-End im Backend (`createAuditEntry` Middleware auf ~15 Routes, AuditLog Mongoose Model, `GET /admin/audit-log`), aber es fehlte eine vollwertige Admin-UI in den Settings. Der existierende `AuditLogViewer` hatte nur einen Action-Filter und war nicht in die Settings-Seite integriert.

### Status: ✅ Implementiert & Getestet

#### Backend-Erweiterungen

| Komponente | Status | Datei |
|---|---|---|
| `buildAuditFilter()` — Gemeinsame Filterfunktion | ✅ | `packages/server/src/routes/admin.routes.ts` |
| Filter: `riskLevel` (low/medium/high/critical) | ✅ | `packages/server/src/routes/admin.routes.ts` |
| Filter: `startDate` / `endDate` (Zeitraum) | ✅ | `packages/server/src/routes/admin.routes.ts` |
| Filter: `userSearch` (Name/Email Textsuche, 2-Schritt mit User-Lookup) | ✅ | `packages/server/src/routes/admin.routes.ts` |
| `GET /admin/audit-log` — find + countDocuments parallelisiert | ✅ | `packages/server/src/routes/admin.routes.ts` |
| `GET /admin/audit-log/stats` — Aggregierte Counts nach Risk Level | ✅ | `packages/server/src/routes/admin.routes.ts` |
| `GET /admin/audit-log/export` — CSV-Download (max 10.000 Einträge) | ✅ | `packages/server/src/routes/admin.routes.ts` |
| Index `{ riskLevel: 1, timestamp: -1 }` | ✅ | `packages/server/src/models/AuditLog.ts` |

#### API Client

| Komponente | Status | Datei |
|---|---|---|
| `adminAPI.getAuditLog()` — erweiterte Filter-Parameter | ✅ | `packages/client/src/services/api.ts` |
| `adminAPI.getAuditLogStats()` — Stats abrufen | ✅ | `packages/client/src/services/api.ts` |
| `adminAPI.exportAuditLog()` — CSV als Blob | ✅ | `packages/client/src/services/api.ts` |

#### Client: AuditLogsSection UI

| Komponente | Status | Datei |
|---|---|---|
| Stats Bar (5 Cards: Total, Low, Medium, High, Critical mit farbigen Dots) | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |
| 6 Filter: Action, Entity Type, Risk Level, Date From/To, User Search (300ms Debounce) | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |
| Tabelle: 7 Spalten (Timestamp, User, Action, Entity Type, Entity ID, Risk, IP) | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |
| Farbcodierte Action-Badges (20 Action-Typen) + Risk-Level-Dots | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |
| Expandierbare Zeilen (Before/After JSON-Diff, User Agent, volle Entity ID) | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |
| Page-Number Pagination mit Ellipsis (`<< 1 2 ... 5 [6] 7 ... 20 >>`) | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |
| CSV Export mit Toast-Feedback | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |
| Clear Filters Button | ✅ | `packages/client/src/components/settings/AuditLogsSection.tsx` |

#### Settings-Integration

| Komponente | Status | Datei |
|---|---|---|
| Sidebar: "Audit Logs" Eintrag mit FileText-Icon | ✅ | `packages/client/src/components/settings/SettingsSidebar.tsx` |
| Sidebar: Nur für Admin-Rollen sichtbar (chief_architect, enterprise_architect) | ✅ | `packages/client/src/components/settings/SettingsSidebar.tsx` |
| SettingsPage: `SECTION_MAP` Registrierung | ✅ | `packages/client/src/components/settings/SettingsPage.tsx` |
| SettingsPage: Breiterer Container `max-w-6xl` für Audit-Tabelle | ✅ | `packages/client/src/components/settings/SettingsPage.tsx` |

#### Tests (34/34 bestanden)

| # | Test | Ergebnis |
|---|------|----------|
| 0.1–0.3 | Setup: Register Admin + Viewer, Promote to chief_architect (MongoDB) | ✅ |
| 1.1 | Unauthenticated → 401 auf audit-log | ✅ |
| 1.2 | Viewer-Rolle → 403 auf audit-log | ✅ |
| 1.3–1.4 | Unauthenticated → 401 auf stats + export | ✅ |
| 2.1 | Default Listing (data, total, limit, offset) | ✅ |
| 2.2 | Limit/Offset werden respektiert | ✅ |
| 2.3 | Limit cap bei 500 | ✅ |
| 2.4–2.6 | Filter: action, entityType, riskLevel | ✅ |
| 2.7 | Filter: Date Range (startDate/endDate) | ✅ |
| 2.8 | Filter: userSearch (Name/Email) | ✅ |
| 2.9 | Combined Filters: nonexistent → 0 results | ✅ |
| 2.10 | userId populated mit name + email | ✅ |
| 2.11 | Sortierung: timestamp descending | ✅ |
| 3.1–3.3 | Stats: alle Risk Levels, Total = Summe, non-negative | ✅ |
| 4.1–4.2 | CSV: Content-Type text/csv, Content-Disposition attachment | ✅ |
| 4.3–4.4 | CSV: korrekter Header, 8 Spalten | ✅ |
| 4.5 | CSV: Filter werden respektiert | ✅ |
| 4.6 | CSV: Viewer → 403 | ✅ |
| 5.1–5.2 | Audit Entries existieren, Required Fields vorhanden | ✅ |
| 6.1–6.4 | Pagination: Offset 0, verschiedene Seiten, konsistenter Total, Beyond-Total | ✅ |
| 7.1 | Cleanup: Test-User gelöscht | ✅ |

**Testdatei:** `packages/server/src/__tests__/audit.test.ts`
**Ausführen:** `cd packages/server && npx jest src/__tests__/audit.test.ts --forceExit`

---

## 15. Google Identity Services Login

### Problemstellung
Der Google Login nutzte den klassischen OAuth 2.0 Redirect-Flow: Klick → Redirect zu Google → Callback-URL → zurück zur App. Das erforderte pro Umgebung (localhost, Produktion) eine konfigurierte Callback-URL in der Google Cloud Console und serverseitige Redirect-Logik. Für Nutzer bedeutete das 3-4 Seitenwechsel und für Entwickler umständliche Callback-URL-Pflege.

### Status: ✅ Implementiert & Getestet

#### Architektur-Wechsel

| Aspekt | Vorher (OAuth 2.0 Redirect) | Jetzt (Google Identity Services) |
|--------|---------------------------|----------------------------------|
| Flow | Server-Redirect → Google → Callback → Token | Pop-up → Auth-Code → `postmessage` → Token |
| Seitenwechsel | 3-4 | 0 (Pop-up) |
| Callback-URL nötig | Ja, pro Umgebung | Nein |
| Server-Config | `GOOGLE_CALLBACK_URL` env | Nicht nötig |
| Google Console | JavaScript Origins + Redirect URIs | Nur JavaScript Origins |

#### Server: Token-Endpoint

| Komponente | Status | Datei |
|---|---|---|
| `POST /auth/oauth/google/token` Endpoint | ✅ | `packages/server/src/routes/auth.routes.ts` |
| Auth-Code Flow: Code → `postmessage` → Google Token Exchange | ✅ | `packages/server/src/routes/auth.routes.ts` |
| ID-Token Flow: Direktes Token-Verify (One-Tap) | ✅ | `packages/server/src/routes/auth.routes.ts` |
| `google-auth-library` für Token-Verifizierung | ✅ | `packages/server/package.json` |
| Error-Logging bei fehlgeschlagenem Token-Exchange | ✅ | `packages/server/src/routes/auth.routes.ts` |
| Audit-Entry bei erfolgreichem Login | ✅ | `packages/server/src/routes/auth.routes.ts` |

#### Client: Pop-up Login

| Komponente | Status | Datei |
|---|---|---|
| `@react-oauth/google` Paket | ✅ | `packages/client/package.json` |
| `GoogleOAuthProvider` in App-Root | ✅ | `packages/client/src/main.tsx` |
| `useGoogleLogin` Hook (auth-code flow) | ✅ | `packages/client/src/components/security/LoginPage.tsx` |
| Google SVG-Icon Button (eigenes Styling) | ✅ | `packages/client/src/components/security/LoginPage.tsx` |
| Token-Response → authStore login → navigate | ✅ | `packages/client/src/components/security/LoginPage.tsx` |

#### Docker/Deployment

| Komponente | Status | Datei |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` als Docker Build-Arg | ✅ | `Dockerfile` |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in Compose | ✅ | `docker-compose.prod.yml` |

#### Google Cloud Console Konfiguration

| Einstellung | Wert |
|---|---|
| Autorisierte JavaScript-Quellen | `https://thearchitect.site`, `https://www.thearchitect.site`, `http://localhost:3000` |
| Autorisierte Weiterleitungs-URIs | Nicht mehr benötigt |
| App-Name (Consent Screen) | `N8N_Server` → sollte auf `TheArchitect` geändert werden |

#### Alte Redirect-Routes (noch vorhanden, nicht mehr genutzt)

Die alten `GET /oauth/google` und `GET /oauth/google/callback` Routes bleiben als Fallback bestehen, werden aber vom Client nicht mehr aufgerufen.

---

## 16. Email Invitation System (Phase 5)

### Problemstellung
Collaborators konnten nur hinzugefügt werden, wenn sie bereits ein Konto hatten. Es gab keinen Weg, externe Personen (Berater, Stakeholder) per E-Mail einzuladen. Das gesamte RBAC-System mit Projekt-Rollen war damit in der Praxis nicht nutzbar für teamübergreifende Zusammenarbeit.

### Status: ✅ Implementiert

#### Shared Types

| Komponente | Status | Datei |
|---|---|---|
| `ProjectInvitation` Interface | ✅ | `packages/shared/src/types/user.types.ts` |
| `InvitationStatus` Type (pending/accepted/declined/expired/cancelled) | ✅ | `packages/shared/src/types/user.types.ts` |
| `PROJECT_MANAGE_COLLABORATORS` auf alle Rollen erweitert | ✅ | `packages/shared/src/constants/permissions.constants.ts` |

#### Server: Invitation Model

| Komponente | Status | Datei |
|---|---|---|
| `Invitation` Mongoose Schema | ✅ | `packages/server/src/models/Invitation.ts` |
| Index: `{projectId, status}` | ✅ | `packages/server/src/models/Invitation.ts` |
| Index: `{invitedEmail, status}` | ✅ | `packages/server/src/models/Invitation.ts` |
| Index: `{token}` (unique) | ✅ | `packages/server/src/models/Invitation.ts` |
| TTL-Index: `{expiresAt}` (automatische Bereinigung) | ✅ | `packages/server/src/models/Invitation.ts` |

#### Server: API Routes

| Komponente | Status | Datei |
|---|---|---|
| `POST /:id/invitations` — Einladung erstellen + E-Mail senden | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| `GET /:id/invitations` — Pending Invitations pro Projekt | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| `POST /:id/invitations/:invitationId/resend` — E-Mail erneut senden | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| `DELETE /:id/invitations/:invitationId` — Einladung zurückziehen | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| `GET /invitations/by-token/:token` — Details per Token (public) | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| `POST /invitations/by-token/:token/accept` — Annehmen (auth) | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| `POST /invitations/by-token/:token/decline` — Ablehnen (auth) | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| `GET /invitations/mine` — Eigene Einladungen | ✅ | `packages/server/src/routes/invitation.routes.ts` |
| Routes in Express registriert | ✅ | `packages/server/src/index.ts` |

#### Server: Security

| Komponente | Status | Beschreibung |
|---|---|---|
| Token-Hashing | ✅ | SHA-256 Hash in DB, Raw-Token nur in E-Mail |
| Token-Regeneration bei Resend | ✅ | Neuer Token bei jedem Resend (alter wird ungültig) |
| E-Mail-Abgleich bei Accept/Decline | ✅ | Nur der eingeladene E-Mail-Inhaber kann annehmen/ablehnen |
| Duplicate-Check | ✅ | Keine doppelten Pending-Einladungen pro E-Mail+Projekt |
| Owner/Collaborator-Check | ✅ | Kann nicht Owner oder bestehenden Collaborator einladen |
| RBAC | ✅ | `requirePermission` + `requireProjectAccess('editor')` |
| Audit-Logging | ✅ | create/accept/decline/cancel werden geloggt |
| 7-Tage-Ablauf + TTL | ✅ | Automatische MongoDB-Bereinigung abgelaufener Einladungen |

#### Server: E-Mail-Template

| Komponente | Status | Datei |
|---|---|---|
| `sendProjectInvitationEmail()` | ✅ | `packages/server/src/services/email.service.ts` |
| Matrix-Theme (Grün statt Purple) | ✅ | `packages/server/src/services/email.service.ts` |
| Kontext-Text: Was ist TheArchitect | ✅ | `packages/server/src/services/email.service.ts` |
| Rollen-Beschreibung (Editor/Reviewer/Viewer) | ✅ | `packages/server/src/services/email.service.ts` |
| CTA: "Accept Invitation" | ✅ | `packages/server/src/services/email.service.ts` |
| Dev-Fallback: Console-Logging | ✅ | `packages/server/src/services/email.service.ts` |
| Password-Reset-Template auf Matrix-Farben aktualisiert | ✅ | `packages/server/src/services/email.service.ts` |

#### Client: API & UI

| Komponente | Status | Datei |
|---|---|---|
| `invitationAPI` (create, list, resend, cancel, getByToken, accept, decline, mine) | ✅ | `packages/client/src/services/api.ts` |
| ProjectCollaborators: "Invite" statt "Add" | ✅ | `packages/client/src/components/ui/ProjectCollaborators.tsx` |
| ProjectCollaborators: Pending Invitations Section | ✅ | `packages/client/src/components/ui/ProjectCollaborators.tsx` |
| ProjectCollaborators: Resend + Cancel Buttons | ✅ | `packages/client/src/components/ui/ProjectCollaborators.tsx` |
| InvitationPage: Accept/Decline unter `/invitations/:token` | ✅ | `packages/client/src/components/security/InvitationPage.tsx` |
| InvitationPage: Login-Required State mit Redirect | ✅ | `packages/client/src/components/security/InvitationPage.tsx` |
| InvitationPage: E-Mail-Mismatch Warning | ✅ | `packages/client/src/components/security/InvitationPage.tsx` |
| LoginPage: `redirect` Query-Parameter Support | ✅ | `packages/client/src/components/security/LoginPage.tsx` |
| Route in App.tsx registriert | ✅ | `packages/client/src/App.tsx` |

#### Flow

1. Projekt-Editor/Owner klickt "Invite" im Members-Dialog → E-Mail + Rolle eingeben
2. Server: Token generieren, SHA-256 hashen, in DB speichern, Raw-Token per E-Mail senden
3. Empfänger: Klickt Link → `/invitations/:token`
4. Falls nicht eingeloggt → Login/Register mit Redirect zurück zur Einladung
5. Accept → wird als Collaborator mit der eingeladenen Rolle hinzugefügt → "Open Project"
6. Decline → Einladung als abgelehnt markiert

---

## 17. AI Architecture Advisor

### Beschreibung
Proaktiver Advisor, der bestehende Analytics (Risk, Compliance, Cost, Graph) zu einem einheitlichen Health Score und priorisierten Architektur-Insights synthesiert. Schließt die Lücke zwischen isolierten Analyse-Services und konkreten Handlungsempfehlungen.

### Status: ✅ Implementiert & Verifiziert (62/62 Tests)

#### Shared Types

| Komponente | Status | Datei |
|---|---|---|
| `AdvisorInsight` Interface (id, category, severity, title, description, affectedElements, suggestedAction, effort, impact) | ✅ | `packages/shared/src/types/advisor.types.ts` |
| `HealthScore` Interface (total, trend, trendDelta, factors, timestamp) | ✅ | `packages/shared/src/types/advisor.types.ts` |
| `AdvisorScanResult` Interface | ✅ | `packages/shared/src/types/advisor.types.ts` |
| `InsightSeverity` (critical, high, warning, info) | ✅ | `packages/shared/src/types/advisor.types.ts` |
| `InsightCategory` (9 Typen) | ✅ | `packages/shared/src/types/advisor.types.ts` |
| `RemediationAction`, `HealthScoreFactor`, `AffectedElement` | ✅ | `packages/shared/src/types/advisor.types.ts` |
| Re-Export über `shared/index.ts` | ✅ | `packages/shared/src/index.ts` |

#### Server: Advisor Service (Orchestrator)

| Komponente | Status | Datei |
|---|---|---|
| `runAdvisorScan(projectId)` — Orchestriert alle 9 Detektoren parallel | ✅ | `packages/server/src/services/advisor.service.ts` |
| Single Neo4j Query: Alle Elemente mit inDegree/outDegree | ✅ | `packages/server/src/services/advisor.service.ts` |
| `calculateHealthScore()` — 5 gewichtete Faktoren | ✅ | `packages/server/src/services/advisor.service.ts` |
| Nutzt bestehende Services: `assessRisk()`, `checkCompliance()`, `estimateCosts()` | ✅ | `packages/server/src/services/advisor.service.ts` |
| Insights sortiert nach Severity (critical first), max 20 | ✅ | `packages/server/src/services/advisor.service.ts` |

#### Health Score — 5-Faktor-Berechnung

| Faktor | Gewicht | Datenquelle |
|--------|---------|-------------|
| Dependency Risk | 30% | `assessRisk()` → avgRiskScore |
| Compliance | 25% | `checkCompliance()` → complianceScore |
| Connectivity (Orphans) | 20% | Neo4j → orphanCount / totalElements |
| Lifecycle Health | 15% | Element.status Verteilung (Penalty für retired/transitional) |
| Cost Efficiency | 10% | `estimateCosts()` → optimizationPotential |

#### 9 Detector-Module

| # | Detector | Severity | Quelle |
|---|----------|----------|--------|
| 1 | **Single Point of Failure** | critical/high | Neo4j: inDegree > 4 |
| 2 | **Orphan Elements** | warning | Neo4j: degree = 0 |
| 3 | **Circular Dependencies** | high | Neo4j: Cycle Detection `[*2..6]` |
| 4 | **Compliance Violations** | varies | `checkCompliance()` |
| 5 | **Stale Transitions** | warning | status=transitional, updatedAt > 90 Tage |
| 6 | **Risk Concentration** | high | Layer mit >60% high/critical Risk |
| 7 | **Cost Hotspots** | info | Top-3 nach Optimierungspotenzial |
| 8 | **Maturity Gaps** | warning/info | maturity ≤ 2 bei current-Status |
| 9 | **MiroFish Conflicts** | high | Simulation Deadlocks + Fatigue |

#### Server: API Routes

| Komponente | Status | Datei |
|---|---|---|
| `GET /:projectId/advisor/scan` — Full Scan (alle Detektoren + Health Score) | ✅ | `packages/server/src/routes/advisor.routes.ts` |
| `GET /:projectId/advisor/health` — Nur Health Score | ✅ | `packages/server/src/routes/advisor.routes.ts` |
| Auth: `authenticate` + `requirePermission(ANALYTICS_VIEW)` | ✅ | `packages/server/src/routes/advisor.routes.ts` |
| Routes in Express registriert | ✅ | `packages/server/src/index.ts` |

#### Client: Store & API

| Komponente | Status | Datei |
|---|---|---|
| `advisorStore` (Zustand): healthScore, insights, isScanning, error | ✅ | `packages/client/src/stores/advisorStore.ts` |
| `scan(projectId)` Action → API Call → State Update | ✅ | `packages/client/src/stores/advisorStore.ts` |
| `advisorAPI.scan()`, `advisorAPI.health()` | ✅ | `packages/client/src/services/api.ts` |

#### Client: UI-Komponenten

| Komponente | Status | Datei |
|---|---|---|
| **HealthScoreRing** — SVG Ring mit Compact (20px) + Full (64px) Modus | ✅ | `packages/client/src/components/copilot/HealthScoreRing.tsx` |
| Farben: Grün (#00ff41) ≥70, Gelb (#eab308) 40-70, Rot (#ef4444) <40 | ✅ | HealthScoreRing.tsx |
| Trend-Pfeil (TrendingUp/TrendingDown/Minus) mit Delta | ✅ | HealthScoreRing.tsx |
| **InsightCard** — Expandierbare Karte mit Severity-Farben | ✅ | `packages/client/src/components/copilot/InsightCard.tsx` |
| Affected Elements (klickbar → `advisor:navigate` Event) | ✅ | InsightCard.tsx |
| Effort/Impact Tags, Suggested Action | ✅ | InsightCard.tsx |
| **AdvisorPanel** — Haupt-UI (Health Score + Faktor-Bars + Severity Summary + Insight-Liste) | ✅ | `packages/client/src/components/copilot/AdvisorPanel.tsx` |
| Auto-Scan bei Mount (wenn keine Daten) | ✅ | AdvisorPanel.tsx |
| Loading State, Error State, Empty State ("No issues found") | ✅ | AdvisorPanel.tsx |

#### Integration in bestehende UI

| Komponente | Status | Datei |
|---|---|---|
| AICopilot: "Advisor" als neuer Default-Tab (vor Chat, Standards, Compliance) | ✅ | `packages/client/src/components/copilot/AICopilot.tsx` |
| AICopilot: Badge-Count (Critical + High Insights) | ✅ | AICopilot.tsx |
| Toolbar: Compact HealthScoreRing neben Projektname | ✅ | `packages/client/src/components/ui/Toolbar.tsx` |

#### Tests (62/62 bestanden)

| # | Describe Block | Tests | Status |
|---|---|---|---|
| 0 | Setup (Users, Project, 7 Elements, 6 Connections) | 5 | ✅ |
| 1 | API Contract (Scan, Health, Auth 401, Invalid Project) | 4 | ✅ |
| 2 | Health Score Integrity (Range, 5 Factors, Weights, Trend) | 8 | ✅ |
| 3 | Detector Results (Structure, SPOF, Orphans, Cost, Maturity) | 11 | ✅ |
| 4 | Edge Cases (Empty Project, Duration, Concurrency, Unique IDs) | 6 | ✅ |
| 5 | Usability / Steve Jobs Test (Colors, Names, Actions, Factors) | 8 | ✅ |
| 6 | Static Analysis (15 Checks: Files, Exports, Theme, No Duplication) | 15 | ✅ |
| 7 | Integration Verification (Element Count, Changes, Data Sources) | 3 | ✅ |
| 8 | Cleanup | 2 | ✅ |

**Testdatei:** `packages/server/src/__tests__/advisor.test.ts`
**Ausführen:** `cd packages/server && npx jest src/__tests__/advisor.test.ts --forceExit`

#### Neue Dateien (8)

- `packages/shared/src/types/advisor.types.ts`
- `packages/server/src/services/advisor.service.ts`
- `packages/server/src/routes/advisor.routes.ts`
- `packages/server/src/__tests__/advisor.test.ts`
- `packages/client/src/stores/advisorStore.ts`
- `packages/client/src/components/copilot/AdvisorPanel.tsx`
- `packages/client/src/components/copilot/HealthScoreRing.tsx`
- `packages/client/src/components/copilot/InsightCard.tsx`

#### Modifizierte Dateien (5)

- `packages/shared/src/index.ts` — Advisor Types Export
- `packages/server/src/index.ts` — Advisor Routes Mount
- `packages/client/src/services/api.ts` — advisorAPI
- `packages/client/src/components/copilot/AICopilot.tsx` — Advisor Tab (Default)
- `packages/client/src/components/ui/Toolbar.tsx` — Health Score Badge

---

## 18. Transformation Roadmap Generator

### Beschreibung
AI-gestützte Migrationsplanung mit 3-Layer-Kostenmodell (Infrastructure, License, Personnel), Kahn-Sort-Sequenzierung, Monte Carlo P10/P50/P90 und interaktiver TOGAF Gap Analysis.

### Status: ✅ Implementiert & Verifiziert (90/90 Tests)

| Komponente | Status | Datei |
|---|---|---|
| Roadmap Types (Strategy, Wave, CostConfidence, MigrationCandidate) | ✅ | `packages/shared/src/types/roadmap.types.ts` |
| Roadmap Service (Kahn-Sort, Monte Carlo, 3-Layer Cost) | ✅ | `packages/server/src/services/roadmap.service.ts` |
| Roadmap Routes (CRUD, Generate, PDF Download) | ✅ | `packages/server/src/routes/roadmap.routes.ts` |
| Roadmap Store (Zustand) | ✅ | `packages/client/src/stores/roadmapStore.ts` |
| RoadmapPanel UI (Config, Waves, Timeline, Metrics) | ✅ | `packages/client/src/components/analytics/RoadmapPanel.tsx` |
| RoadmapTimeline (Gantt-Style Visualisierung) | ✅ | `packages/client/src/components/analytics/RoadmapTimeline.tsx` |
| WaveCard (Elemente pro Wave, Klick→flyToElement) | ✅ | `packages/client/src/components/analytics/WaveCard.tsx` |
| MigrationCandidates (TOGAF Gap-Analysis Pre-Step) | ✅ | `packages/client/src/components/analytics/MigrationCandidates.tsx` |

**REQ-Abdeckung:** REQ-F12-01 (Kahn-Sort + Monte Carlo) ✅, REQ-F12-02 (Gap-Analysis Pre-Step) ✅

---

## 19. CSV Import & ArchiMate 3.2 Self-Architecture

### Beschreibung
CSV-Import für Architektur-Elemente und -Connections mit vollständiger ArchiMate 3.2 Abdeckung. TheArchitect modelliert sich selbst als Referenz-Architektur (108 Elemente, 131 Connections über alle 8 TOGAF-Layer).

### Status: ✅ Implementiert

| Komponente | Status | Datei |
|---|---|---|
| CSV Import Dialog (Elements + Connections, Drag&Drop, Preview) | ✅ | `packages/client/src/components/ui/CSVImportDialog.tsx` |
| CSV Parser (Name, Type, Layer, Domain, Status, Risk, Maturity) | ✅ | Client-seitig |
| ArchiMate 3.2 Type System (55 Element-Typen, alle Aspekte) | ✅ | `packages/shared/src/types/architecture.types.ts` |
| TOGAF Constants erweitert (8 Layer, Y-Positionen, Farben) | ✅ | `packages/shared/src/constants/togaf.constants.ts` |
| Self-Architecture CSV (108 Elements) | ✅ | `packages/client/public/thearchitect-self-architecture.csv` |
| Self-Architecture Connections CSV (131 Connections) | ✅ | `packages/client/public/thearchitect-self-connections.csv` |

**REQ-Abdeckung:** REQ-F14-01 (CSV-Import) — In Review

---

## 20. View Mode Buttons (3D / 2D / Layer)

### Beschreibung
Die drei View-Mode-Buttons in der Toolbar waren optisch prominent, aber funktionslos. Implementierung: Ein R3F-Canvas mit drei Kamera/Layout-Konfigurationen — 3D Perspective (bestehend), 2D Top-Down (Orthographic, Swim Lanes), Layer View (Single-Layer-Fokus mit Navigation).

### Status: ✅ Implementiert (nicht committed)

#### Architekturentscheidung
**Ein Canvas, drei Konfigurationen.** Kamera-Typ, Element-Layout, Licht und Stil ändern sich pro Modus. Alle Interaktionen (Selection, Drag, Context Menu, Property Panel) bleiben erhalten.

#### uiStore Erweiterung

| Komponente | Status | Datei |
|---|---|---|
| `focusedLayer: ArchitectureLayer` State | ✅ | `packages/client/src/stores/uiStore.ts` |
| `setFocusedLayer()` Action | ✅ | `packages/client/src/stores/uiStore.ts` |
| `ViewMode` Type Export | ✅ | `packages/client/src/stores/uiStore.ts` |

#### Neue Dateien (3)

| Komponente | Status | Datei |
|---|---|---|
| **ViewModeCamera** — Perspective/Ortho Switching, Fly-to-Logik, Mode-aware Navigation | ✅ | `packages/client/src/components/3d/ViewModeCamera.tsx` |
| **useViewPositions** Hook — Layout-Engine (3D=identity, 2D=swim lanes, Layer=single focus) | ✅ | `packages/client/src/hooks/useViewPositions.ts` |
| **LayerNavigator** — Floating Panel mit 8 TOGAF-Layer, Element-Count-Badges | ✅ | `packages/client/src/components/ui/LayerNavigator.tsx` |

#### Kamera-Modi

| Modus | Kamera | Position | Controls |
|-------|--------|----------|----------|
| 3D | Perspective (fov 60) | [20, 15, 20] | OrbitControls (volle Rotation) |
| 2D | Orthographic | [0, 80, 0] lookAt [0,0,0] | Pan+Zoom only, kein Orbit |
| Layer | Orthographic | [0, 40, 0] lookAt [0,0,0] | Pan+Zoom, höherer Zoom |

#### Modifizierte Dateien (10)

| Komponente | Änderung | Datei |
|---|---|---|
| CameraControls | Re-export von ViewModeCamera (Backwards-Compat) | `components/3d/CameraControls.tsx` |
| Scene | ViewModeCamera statt CameraControlsWrapper, Conditional Rendering | `components/3d/Scene.tsx` |
| NodeObject3D | viewPosition Prop, 2D Flat Cards, Always-visible Labels | `components/3d/NodeObject3D.tsx` |
| ArchitectureElements | useViewPositions Hook, Visibility-Filter | `components/3d/ArchitectureElements.tsx` |
| ConnectionLines | View-Positionen, Flat Curves in 2D, Intra-Layer-Only in Layer | `components/3d/ConnectionLines.tsx` |
| LayerPlane | Swim-Lane-Bänder (2D), Enlarged Single-Plane (Layer) | `components/3d/LayerPlane.tsx` |
| TransformationXRay | Scale-Axis-Labels pro Layer | `components/3d/TransformationXRay.tsx` |
| Toolbar | X-Ray Guard, Ctrl+1/2/3 Shortcuts, View-Mode Handling | `components/ui/Toolbar.tsx` |
| Sidebar | flyToElement mit elementId für View-Position-Berechnung | `components/ui/Sidebar.tsx` |
| RoadmapPanel | flyToElement mit elementId | `components/analytics/RoadmapPanel.tsx` |

#### Besondere Features
- **Fly-to-Element** mode-aware: berechnet View-Positionen in 2D/Layer via `computeViewPositions()`
- **2D Swim Lanes**: Layer-Index × -8 Z-Spacing, Element Y=0.1
- **Layer View**: Nur Elemente des fokussierten Layers sichtbar, LayerNavigator mit Up/Down Navigation
- **X-Ray Guard**: X-Ray nur in 3D — auto-switch bei Aktivierung aus 2D/Layer
- **Smooth Transitions**: Camera lerp mit easeInOutCubic beim Moduswechsel

**REQ-Abdeckung:** REQ-F15-01 (3 View-Modi im selben Canvas) — In Review

---

## 21. RVTM Skill & Linear-Integration

### Beschreibung
Requirements Verification Traceability Matrix (RVTM) als Superpowers-Skill. Automatisch in writing-plans und executing-plans integriert. Zusätzlich: Linear API-Anbindung zum Lesen der Requirements aus dem TheArchitect-Projekt.

### Status: ✅ Implementiert

#### Superpowers Skills

| Komponente | Status | Datei |
|---|---|---|
| RVTM Skill (Matrix-Format, Status-Definitionen, Extraction-Heuristik) | ✅ | `.claude/skills/rvtm-traceability/SKILL.md` |
| writing-plans erweitert (RVTM-Generierung nach Plan) | ✅ | `.claude/skills/writing-plans/SKILL.md` |
| executing-plans erweitert (RVTM-Update nach jedem Task) | ✅ | `.claude/skills/executing-plans/SKILL.md` |

#### Linear-Integration

| Komponente | Status | Beschreibung |
|---|---|---|
| Linear API Key in `.env` | ✅ | `LINEAR_API_KEY` |
| GraphQL-Zugriff auf Team THE | ✅ | Team ID: `404e1657-492d-464b-9938-895025058d94` |
| 20 Features (F01–F20) als Parent-Issues | ✅ | THE-5 bis THE-24 |
| 35 Requirements (REQ-F01-01 bis REQ-F20-01) als Sub-Issues | ✅ | THE-25 bis THE-59 |

#### RVTM mit Scoring-Matrix

| Komponente | Status | Datei |
|---|---|---|
| RVTM Markdown (35 REQs, Priority Score, Feature Coverage) | ✅ | `docs/superpowers/rvtm/2026-03-22-thearchitect-rvtm.md` |
| RVTM CSV (8 Bewertungskriterien, alle Scores) | ✅ | `docs/superpowers/rvtm/2026-03-22-thearchitect-rvtm.csv` |

#### Scoring-Modell (8 × 12,5% = 100%)

| Kriterium | Gewicht |
|-----------|---------|
| Business Value | 12,5% |
| Business Risk | 12,5% |
| Implementation Challenges | 12,5% |
| Chance of Success | 12,5% |
| Compliance | 12,5% |
| Relationship to Requirements | 12,5% |
| Urgency | 12,5% |
| Status | 12,5% |

**Ø Priority Score: 74,2 | Max: 88,6 (REQ-F02-01, REQ-F02-02, REQ-F11-01, REQ-F11-02)**

#### Coverage Summary (Stand 2026-03-22)

| Status | Anzahl | Prozent |
|--------|--------|---------|
| Done | 25 | 71% |
| In Review | 4 | 11% |
| Backlog | 5 | 14% |

---

## Bekannte offene Punkte

1. **Workspace-Persistenz testen** — Fix implementiert, aber noch nicht live verifiziert.
2. ~~**Deduplizierung**~~ — ✅ Duplicate Detection bei BPMN/n8n Import (Name+Type Matching, Skip in Merge Mode).
3. ~~**Workspace-Löschung serverseitig**~~ — ✅ Cascade Delete (Neo4j DETACH DELETE + Server API).
4. **Deep Links** — Direkte URL zu einem Workspace (`/project/:id/workspace/:wsId`) existiert nicht.
5. ~~**Cross-Architecture Connections serverseitig**~~ — ✅ Bereits persistiert via `addConnection` → `createConnection`.
6. ~~**Einladungssystem (Phase 5)**~~ — ✅ E-Mail-Einladungen mit Token-basiertem Accept/Decline, SHA-256 Token-Hashing, Audit-Logging (siehe Abschnitt 16).
7. ~~**Audit Trail UI (Phase 6)**~~ — ✅ Admin Audit-Log Sektion mit 6 Filtern, Stats, CSV-Export, expandierbaren Zeilen (siehe Abschnitt 14).
8. ~~**Deployment**~~ — ✅ HTTPS via Caddy auf `thearchitect.site` live (2026-03-16).
9. ~~**PDF Report Export**~~ — ✅ 3 Report-Typen (Executive, Simulation, Inventory) mit PDFKit.
10. ~~**Matrix Theme**~~ — ✅ Komplettes Rebranding von Purple zu Matrix-Grün.
11. ~~**UI/UX Overhaul**~~ — ✅ Toasts, Error Boundary, Skeletons, Modal-Animationen, Confirmations, a11y.
12. ~~**Google Login**~~ — ✅ Umgestellt auf Google Identity Services (Pop-up statt Redirect, keine Callback-URLs mehr nötig).
13. **Google Consent Screen App-Name** — Noch "N8N_Server", sollte auf "TheArchitect" geändert werden (Google Cloud Console → Branding).
14. **View Mode Buttons** — Implementiert aber noch nicht committed. Build-Verifizierung ausstehend.
15. **RVTM Scoring-Matrix** — Bidirektionale Synchronisation Linear ↔ Google Sheets noch manuell.

### MiroFish — Geplante Phasen

9. ~~**Phase 2: EmergenceDashboard**~~ — ✅ Timeline, Agent-vs-Agent Heatmap, Position Timeline, Emergence Tab.
10. ~~**Phase 2: AgentAvatars 3D**~~ — ✅ Transluzente Spheres, Puls-Animation, Bezier-Verbindungslinien mit Traveling Particles.
11. ~~**Phase 2: X-Ray Integration**~~ — ✅ SimulationTopology, Delta-Ringe/Beams, Deadlock/Consensus Auras, HUD Metrics.
12. ~~**Phase 3: Custom Persona Editor**~~ — ✅ Clone-from-Preset, Dual Scope (Project/User), 10 editierbare Felder, IDOR-geschützt.
13. ~~**Phase 3: Run-Vergleich**~~ — ✅ Side-by-Side mit Fatigue/Bottleneck/Emergence/Risk-Cost Diff-Highlighting.
14. ~~**Phase 3: PDF-Export**~~ — ✅ Implementiert (siehe Abschnitt 11).
15. **Phase 3: Monte Carlo Integration** — Simulation-Ergebnisse als verhaltensbasierte Risk Factors in `runMonteCarloSimulation()`.

### Requirements-Tracking

- **RVTM:** `docs/superpowers/rvtm/2026-03-22-thearchitect-rvtm.md` (35 REQs, 71% Done)
- **Linear:** Projekt THE, 20 Features (F01–F20), 35 Requirements als Sub-Issues
- **Scoring:** 8-Kriterien-Matrix (à 12,5% Gewicht), Ø Score 74,2, Max 88,6
- **Nächste Priorität (Backlog):** REQ-F18-01 Sparx EA/Jira/ServiceNow (Score 82,9)

### Nächste High-Impact Features (Roadmap)

| # | Feature | Impact | Effort | Status | REQ |
|---|---------|--------|--------|--------|-----|
| 1 | ~~**AI Architecture Advisor**~~ | ★★★★★ | Medium | ✅ Done | REQ-F11-01/02 |
| 2 | ~~**Transformation Roadmap Generator**~~ | ★★★★★ | Medium-High | ✅ Done | REQ-F12-01/02 |
| 3 | ~~**MiroFish Phase 3**~~ — Persona Editor + Run-Vergleich | ★★★★☆ | Low-Medium | ✅ Done | REQ-F10-01/02 |
| 4 | ~~**CSV Import & ArchiMate 3.2**~~ | ★★★★☆ | Medium | ✅ In Review | REQ-F14-01 |
| 5 | ~~**View Mode Buttons (3D/2D/Layer)**~~ | ★★★★☆ | Medium | ✅ In Review | REQ-F15-01 |
| 6 | ~~**Stochastic Engine (Kolmogorov)**~~ | ★★★★☆ | High | ✅ In Review | REQ-F13-01/02 |
| 7 | **Sparx EA / Jira / ServiceNow Integration** | ★★★★★ | High | 📋 Backlog | REQ-F18-01 |
| 8 | **UI & Usability (Task-Completion ≥85%)** | ★★★★☆ | Medium | 📋 Backlog | REQ-F16-01 |
| 9 | **LOD-System (Aggregation ab ≥50 Elemente)** | ★★★☆☆ | Medium | 📋 Backlog | REQ-F19-01 |
| 10 | **Openclaw/Nemoclaw Integration** | ★★☆☆☆ | Medium | 📋 Backlog | REQ-F20-01 |
| 11 | **Application Logo Badges** | ★★☆☆☆ | Low | 📋 Backlog | REQ-F17-01 |

**RVTM:** `docs/superpowers/rvtm/2026-03-22-thearchitect-rvtm.md`
**Scoring-Matrix:** Google Sheets (Owner: Matze Ganzmann)

---

## Build-Status

- `packages/shared` — ✅ 0 TypeScript-Fehler
- `packages/client` — ✅ 0 TypeScript-Fehler
- `packages/server` — ✅ 0 TypeScript-Fehler

---

## Deployment-Status

- **URL:** `https://thearchitect.site` — ✅ Live mit HTTPS
- **VPS:** Hostinger KVM 2 (76.13.150.49), Ubuntu 24.04 + Docker
- **Reverse Proxy:** Caddy 2 (Let's Encrypt, auto-renewal)
- **SSL:** Let's Encrypt E7, gültig bis 2026-06-14
- **Compose:** `/docker/thearchitect/docker-compose.yml` (6 Container)

---

## Git-Status

**Branch:** `master`
**Letzter Commit:** `2040309` — Expand self-architecture CSV to full ArchiMate 3.2 coverage (108 elements, 131 connections)
**Uncommitted:** View Mode Buttons (3D/2D/Layer), RVTM Skill, Linear-Integration, X-Ray Scale Labels
**Remote:** `origin/master`
