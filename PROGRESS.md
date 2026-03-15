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

## 5. Steve Jobs Usability Skill

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

## 6. UI-Fixes & Usability

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

---

## Build-Status

- `packages/shared` — ✅ 0 TypeScript-Fehler
- `packages/client` — ✅ 0 TypeScript-Fehler
- `packages/server` — ✅ 0 TypeScript-Fehler

---

## Git-Status

**Branch:** `master`
**Uncommitted:** Alle oben genannten Änderungen sind noch nicht committed.
