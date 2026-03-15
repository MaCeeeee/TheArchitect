# PROGRESS.md — TheArchitect

> Letztes Update: 2026-03-15

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

## Bekannte offene Punkte

1. **Workspace-Persistenz testen** — Fix implementiert, aber noch nicht live verifiziert.
2. **Deduplizierung** — Kein Schutz gegen mehrfachen Import desselben Workflows.
3. **Workspace-Löschung serverseitig** — `WorkspaceBar` löscht lokal, aber Server-seitige Löschung der zugehörigen Elemente fehlt.
4. **Deep Links** — Direkte URL zu einem Workspace (`/project/:id/workspace/:wsId`) existiert nicht.
5. **Cross-Architecture Connections serverseitig** — Shared Elements nur lokal, nicht auf dem Server persistiert.
6. **Einladungssystem (Phase 5)** — E-Mail-Einladungen, zeitlich begrenzter Zugang für Berater — geplant, nicht implementiert.
7. **Audit Trail UI (Phase 6)** — Admin Audit-Log Sektion mit Filtern — geplant, nicht implementiert.
8. **Deployment** — Alle Änderungen sind lokal, nicht auf dem VPS deployed.

### MiroFish — Geplante Phasen

9. **Phase 2: EmergenceDashboard** — Timeline-Ansicht der Emergence-Events, Agent-vs-Agent Heatmap, Sub-Tab unter Scenarios.
10. **Phase 2: AgentAvatars 3D** — Transluzente Spheres über Layern, Pulsier-Animation bei Reasoning, Verbindungslinien zu adressierten Elementen.
11. **Phase 2: X-Ray Integration** — SimulationOverlay auf Risk/Cost-Heatmap, pulsierend bei Deltas.
12. **Phase 3: Custom Persona Editor** — Name, Layers, Constraints frei konfigurierbar.
13. **Phase 3: Run-Vergleich** — Zwei Simulationsläufe nebeneinander vergleichen.
14. **Phase 3: PDF-Export** — Simulation Report als PDF.
15. **Phase 3: Monte Carlo Integration** — Simulation-Ergebnisse als verhaltensbasierte Risk Factors in `runMonteCarloSimulation()`.

---

## Build-Status

- `packages/shared` — ✅ 0 TypeScript-Fehler
- `packages/client` — ✅ 0 TypeScript-Fehler
- `packages/server` — ✅ 0 TypeScript-Fehler

---

## Git-Status

**Branch:** `master`
**Letzter Commit:** `6d9408b` — Fix off-by-one in EmergenceTracker totalRoundsElapsed
**Remote:** `origin/master` — up to date
