# View-Mode entfernen (UC-VIEW-001) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 2D-Ansichten („2D“-Draufsicht und „Layers“) verschwinden aus Oberfläche und Code. Der Client kennt keinen View-Mode mehr, nur die 3D-Welt.

**Architecture:** Reiner Rückbau, kein neues Verhalten. Die Verbraucher werden zuerst auf den 3D-Zweig reduziert (Kamera, Render-Komponenten, Scene, Toolbar), erst zum Schluss fallen `ViewMode`, `viewMode`, `setViewMode`, `focusedLayer` und `setFocusedLayer` aus dem `uiStore`. So bleibt `tsc -b` nach jedem Task grün. Ein Wächter-Test hält fest, dass der Store keinen View-Mode mehr hat und kein Quelltext ihn wieder einführt.

**Tech Stack:** React 18, TypeScript, Zustand, react-three-fiber/drei, Vitest.

**Spec:** Linear THE-793 (Parent) mit REQ THE-794 … THE-797.
**RVTM:** `docs/superpowers/rvtm/2026-11-20-the793-view-mode-entfernen-rvtm.md`
**Prüfszenarien (versiegelt):** `docs/superpowers/pruefszenarien/2026-11-20-the793-view-mode-entfernen-pruefszenarien.md` — implementers must not read this file

**Regeln für diesen Bau**
- **Nicht committen, nicht pushen.** Der PO gibt Commits ausdrücklich frei. Jeder Task endet mit grünem `tsc -b` und grünen Tests, nicht mit einem Commit.
- **`packages/client/src/components/ui/WorkspaceBar.tsx` nicht anfassen** — sie braucht keine Änderung (PR #206 ist seit 576c39a in master).
- Arbeitszweig: `feat/uc-view-001-nur-3d` auf `origin/master` 576c39a (Worktree `.claude/worktrees/pensive-saha-bb1b57`). Keine Ticket-ID im Zweignamen (Linear-Autoclose).
- Alle Befehle aus `packages/client` laufen lassen; alle Pfade in Befehlen sind relativ dazu (`src/...`). `tsc -b` meint `npx tsc -b` in `packages/client`.
- ESLint ist im Repo nicht eingerichtet. Ersatz für „keine ungenutzten Imports“: `npx tsc -p tsconfig.json --noEmit --noUnusedLocals`, Zahl vorher/nachher.
- `plateauViewMode` (roadmapStore) und der lokale `ViewMode` in `components/simulation/SimulationPanel.tsx` sind **andere Begriffe** und bleiben unverändert.

---

## Dateikarte

| Datei | Änderung |
|---|---|
| `src/stores/uiStore.viewMode.test.ts` | **neu** — Wächter-Test (Store + Quelltext-Scan) |
| `src/components/3d/ViewModeCamera.tsx` | 2D-Zweige, Orthographic-Kamera, Layer-Navigation raus |
| `src/components/3d/flyToStation.test.ts` | zwei 2D-Fälle und 2D-Setup raus |
| `src/components/journey/JourneyShell.tsx` | nur Kommentar „Station ⟂ viewMode“ |
| `src/hooks/useViewPositions.ts` | **löschen** |
| `src/components/3d/ArchitectureElements.tsx` | ohne `useViewPositions` |
| `src/components/3d/NodeObject3D.tsx` | ohne `viewPosition`, `is2DMode`, `isLayerMode` |
| `src/components/3d/ArchiMateIconSprite.tsx` | Prop `is2DMode` raus |
| `src/components/3d/PlateauElement.tsx` | Aufruf ohne `is2DMode` |
| `src/components/3d/ConnectionLines.tsx` | ohne `useViewPositions`, `is2DMode`, `isLayerMode` |
| `src/components/3d/LayerPlane.tsx` | Prop `viewMode` und Swim-Lane-Geometrie raus |
| `src/components/3d/PlateauRenderer.tsx` | Aufruf ohne `viewMode` |
| `src/components/3d/Scene.tsx` | ohne `is3D`, `isLayerView`, `LayerNavigator`, Guards |
| `src/components/ui/LayerNavigator.tsx` | **löschen** |
| `src/components/ui/Toolbar.tsx` | View-Mode-Gruppe, Ctrl+1/2/3, X-Ray-Guard raus |
| `src/components/analytics/RoadmapPanel.tsx` | „auf 3D schalten“-Guard raus |
| `src/components/ui/ElementPalette.tsx` | ohne `focusedLayer` |
| `src/stores/uiStore.ts` | `ViewMode`, `viewMode`, `setViewMode`, `focusedLayer`, `setFocusedLayer` raus |

---

## Chunk 1: Wächter, Kamera, Render-Komponenten

### Task 1: Wächter-Test (rot)

**Files:**
- Create: `packages/client/src/stores/uiStore.viewMode.test.ts`

- [ ] **Step 1: Test schreiben**

```ts
// packages/client/src/stores/uiStore.viewMode.test.ts
// @vitest-environment jsdom
// THE-793: Die Welt kennt nur noch 3D. Weder Store noch Quelltext dürfen einen
// View-Mode (3D / 2D / Layer) wieder einführen.
import { describe, test, expect } from 'vitest';
import { useUIStore } from './uiStore';

// Quelltexte über Vite lesen statt über node:fs — das Client-tsconfig kennt
// nur `vite/client`-Typen, `node:*`-Imports würden `tsc -b` brechen.
const SOURCES = import.meta.glob(['../**/*.{ts,tsx}', '!../stores/uiStore.viewMode.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('THE-793: kein View-Mode mehr', () => {
  test('uiStore hat keinen View-Mode und keinen Layer-Fokus', () => {
    const state = useUIStore.getState() as unknown as Record<string, unknown>;
    for (const key of ['viewMode', 'setViewMode', 'focusedLayer', 'setFocusedLayer']) {
      expect(key in state, `uiStore.${key}`).toBe(false);
    }
  });

  test('kein Quelltext kennt 2D-/Layer-Modus, View-Positionen oder LayerNavigator', () => {
    // Store-bezogen formuliert: SimulationPanel hat einen eigenen, lokalen
    // `viewMode`/`setViewMode` (useState) — der ist ein anderer Begriff und bleibt.
    const forbidden = /2d-topdown|s\.setViewMode\b|setViewMode\('(3d|layer)'\)|s\.viewMode\b|\bis2DMode\b|\bisLayerMode\b|\bisLayerView\b|\buseViewPositions\b|\bcomputeViewPositions\b|\bLayerNavigator\b|\bOrthographicCamera\b/;
    const hits = Object.entries(SOURCES).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
        .filter(({ line }) => forbidden.test(line))
        .map(({ at }) => at),
    );
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50); // Glob greift wirklich
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Laufen lassen, Rot bestätigen**

Run: `npx vitest run src/stores/uiStore.viewMode.test.ts`
Expected: beide Tests FAIL. Der erste nennt `uiStore.viewMode`, der zweite listet Treffer u. a. in `Toolbar.tsx`, `ViewModeCamera.tsx`, `Scene.tsx`, `useViewPositions.ts`.

Der Test bleibt rot bis Task 6. Das ist gewollt.

- [ ] **Step 3: tsc bleibt grün, Ausgangswert für ungenutzte Bezeichner notieren**

ESLint ist im Repo nicht eingerichtet (`npm run lint` → `eslint: command not found`). Ersatzprüfung für ungenutzte Imports/Variablen:

Run: `npx tsc -b && npx tsc -p tsconfig.json --noEmit --noUnusedLocals 2>&1 | grep -c "error TS"`
Expected: `tsc -b` ohne Ausgabe. Die Zahl aus dem zweiten Befehl im Task-Bericht festhalten — sie ist die Vergleichsbasis für Task 6.

### Task 2: Kamera nur noch 3D

**Files:**
- Modify: `packages/client/src/components/3d/ViewModeCamera.tsx`
- Modify: `packages/client/src/components/3d/flyToStation.test.ts`

- [ ] **Step 1: Tests zuerst anpassen**

In `flyToStation.test.ts`:
- Zeile 9 `OrthographicCamera: () => null,` löschen.
- Zeile 14 `import { useUIStore } …` und Zeile 15 `import { useArchitectureStore } …` löschen.
- Kommentar Zeilen 17–18 ersetzen durch `// Fixture: two elements, centroid (5, 4, 5).`
- Den ganzen `beforeEach`-Block (Zeilen 24–28) löschen. Falls `beforeEach` danach ungenutzt ist, aus dem vitest-Import entfernen.
- `describe('flyToStation (ADR-0005: Station ⟂ viewMode)'` umbenennen in `describe('flyToStation (ADR-0005)'`.
- Test `'in 2d/layer mode the projection wins: top-down framing'` komplett löschen.
- Test `'instant survives the non-3d branch (fitToScreen path)'` komplett löschen.

Run: `npx vitest run src/components/3d/flyToStation.test.ts`
Expected: PASS (die verbliebenen 3D-Tests hängen nicht am Store).

- [ ] **Step 2: Imports bereinigen**

```ts
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { useXRayStore } from '../../stores/xrayStore';
import type { StationKey } from '../journey/stations';
import type { DockSide } from '../journey/sheetPrefs';
```

(`useUIStore`, `ViewMode`, `ARCHITECTURE_LAYERS`, `computeViewPositions` fallen weg.)

- [ ] **Step 3: `flyToElement` auf 3D reduzieren**

```ts
export function flyToElement(elementPosition: { x: number; y: number; z: number }, elementId?: string) {
  // Resolve where the element is *actually rendered*. Sidebar callers pass
  // element.position3D, but X-Ray reflows elements onto bucket positions
  // (xrayStore.computePositions). Without this lookup the camera flies to a
  // phantom location while the user-selected element sits 10+ units away.
  let resolved = elementPosition;
  if (elementId) {
    const { isActive, xrayPositions } = useXRayStore.getState();
    const xp = isActive ? xrayPositions.get(elementId) : undefined;
    if (xp) resolved = xp;
  }

  const target = new THREE.Vector3(resolved.x, resolved.y, resolved.z);
  flyTarget = {
    position: target.clone().add(new THREE.Vector3(5, 4, 5)),
    lookAt: target,
  };
  flyProgress = 0;
}
```

- [ ] **Step 4: `flyToWorkspace`, `fitToScreen`, `fitAllWorkspaces` auf 3D reduzieren**

```ts
export function flyToWorkspace(offsetX: number) {
  flyTarget = {
    position: new THREE.Vector3(offsetX + 20, 15, 20),
    lookAt: new THREE.Vector3(offsetX, 4, 0),
  };
  flyProgress = 0;
}

export function fitToScreen(elements: { id?: string; position3D: { x: number; y: number; z: number } }[]) {
  if (elements.length === 0) return;

  const center = new THREE.Vector3();
  for (const el of elements) {
    center.add(new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z));
  }
  center.divideScalar(elements.length);

  let maxDist = 0;
  for (const el of elements) {
    const d = center.distanceTo(new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z));
    if (d > maxDist) maxDist = d;
  }

  const distance = Math.max(maxDist * 1.5, 15);
  flyTarget = {
    position: center.clone().add(new THREE.Vector3(distance * 0.6, distance * 0.5, distance * 0.6)),
    lookAt: center,
  };
  flyProgress = 0;
}
```

In `fitAllWorkspaces` den Block ab `const viewMode = useUIStore.getState().viewMode;` bis vor `flyProgress = 0;` ersetzen durch:

```ts
  flyTarget = {
    position: new THREE.Vector3(centerX, distance * 0.5, distance * 0.6),
    lookAt: new THREE.Vector3(centerX, 4, 0),
  };
```

- [ ] **Step 5: `flyToStation` ohne 2D-Zweig**

Unter `// ─── Station framing (ADR-0005 / THE-482) ───` die drei Zeilen

```ts
// A Station sets the camera framing *intent*; viewMode keeps owning the
// projection (Station ⟂ viewMode). In 2D/layer the top-down constraint wins,
// exactly like the other fly-to helpers above — we delegate to fitToScreen.
```

ersetzen durch

```ts
// A Station sets the camera framing *intent*: its viewing angle and distance.
```

Die beiden folgenden Zeilen zu `CAMERA_FOV_DEG` („Vertical field-of-view …“, „Single source …“) bleiben stehen.

Außerdem in `src/components/journey/JourneyShell.tsx` (um Zeile 44–45) den Kommentar `// is drawn (Station ⟂ viewMode). Deliberately NOT depending on \`elements\`:` ändern zu `// is drawn. Deliberately NOT depending on \`elements\`:`.

In `flyToStation` die Zeile `const viewMode = useUIStore.getState().viewMode;` und den gesamten Block `if (viewMode !== '3d') { … return; }` löschen. Der Rest der Funktion bleibt wörtlich.

- [ ] **Step 6: Layer-Navigation löschen**

Den Abschnitt `// ─── Layer navigation helpers ───` mit `LAYER_IDS`, `nextLayer` und `prevLayer` komplett löschen.

- [ ] **Step 7: Komponente auf 3D reduzieren**

Im Komponentenkopf:

```ts
export default function ViewModeCamera() {
  const controlsRef = useRef<any>(null);
  const perspRef = useRef<THREE.PerspectiveCamera>(null);
  const { camera } = useThree();
  const isDragging = useArchitectureStore((s) => s.isDragging);
```

Den `useEffect` „Animate camera on mode change“ komplett löschen.

Im Tastatur-Handler den Block ab `// Arrow keys for workspace navigation (3D/2D) or layer navigation (Layer)` bis vor `// Home = fit all workspaces` ersetzen durch:

```ts
      // Arrow keys for workspace navigation
      const wsState = useWorkspaceStore.getState();
      const workspaces = wsState.workspaces;

      if (workspaces.length > 1) {
        if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
          const idx = workspaces.findIndex((ws) => ws.id === wsState.activeWorkspaceId);
          const prev = idx > 0 ? idx - 1 : workspaces.length - 1;
          wsState.setActiveWorkspace(workspaces[prev].id);
          flyToWorkspace(workspaces[prev].offsetX);
        }
        if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
          const idx = workspaces.findIndex((ws) => ws.id === wsState.activeWorkspaceId);
          const next = idx < workspaces.length - 1 ? idx + 1 : 0;
          wsState.setActiveWorkspace(workspaces[next].id);
          flyToWorkspace(workspaces[next].offsetX);
        }
      }
```

und den Block `// Number keys 1-9 for workspace jump (only when not in layer mode)` ersetzen durch:

```ts
      // Number keys 1-9 for workspace jump
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= workspaces.length && !e.ctrlKey && !e.metaKey) {
        const ws = workspaces[num - 1];
        wsState.setActiveWorkspace(ws.id);
        flyToWorkspace(ws.offsetX);
      }
```

Den Teil ab `const is2D = viewMode !== '3d';` bis zum Ende des `return (…)` ersetzen durch:

```tsx
  return (
    <>
      <PerspectiveCamera
        ref={perspRef}
        makeDefault
        fov={CAMERA_FOV_DEG}
        near={0.1}
        far={1000}
        position={[20, 15, 20]}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!isDragging}
        enableRotate
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={400}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
}
```

- [ ] **Step 8: Prüfen**

Run: `npx tsc -b && npx vitest run src/components/3d/flyToStation.test.ts`
Expected: tsc 0 Fehler (der Store hat `viewMode` noch, also bricht nichts), Tests PASS.

### Task 3: Render-Komponenten ohne View-Positionen

**Files:**
- Delete: `packages/client/src/hooks/useViewPositions.ts`
- Modify: `ArchitectureElements.tsx`, `NodeObject3D.tsx`, `ArchiMateIconSprite.tsx`, `PlateauElement.tsx`, `ConnectionLines.tsx`, `LayerPlane.tsx`, `PlateauRenderer.tsx` (alle unter `packages/client/src/components/3d/`)

- [ ] **Step 1: `ArchitectureElements.tsx`**
  - Import `useViewPositions` löschen.
  - Zeile `const { positions: viewPositions, visibleElementIds } = useViewPositions();` löschen.
  - Filter: `(el) => visibleLayers.has(el.layer) && visibleElementIds.has(el.id)` → `(el) => visibleLayers.has(el.layer)`.
  - Prop `viewPosition={viewPositions.get(element.id)}` am `<NodeObject3D>` löschen.

- [ ] **Step 2: `NodeObject3D.tsx`**
  - Import `import { useUIStore, ViewMode } from '../../stores/uiStore';` → `import { useUIStore } from '../../stores/uiStore';`. Wird `useUIStore` danach nirgends mehr benutzt, den Import löschen (`grep -n useUIStore`).
  - Prop-Interface: Zeile `viewPosition?: …` löschen; Signatur ohne `viewPosition`.
  - `const viewMode = useUIStore((s) => s.viewMode);` löschen.
  - `const is2DMode …` und `const isLayerMode …` löschen.
  - `finalPosition`:
    ```ts
    // Final position: X-Ray override > Default 3D position
    const finalPosition = useMemo((): [number, number, number] => {
      if (xrayPosition) return [xrayPosition.x, xrayPosition.y, xrayPosition.z];
      return [element.position3D.x, element.position3D.y, element.position3D.z];
    }, [xrayPosition, element.position3D]);
    ```
  - `handlePointerDown`: Kommentar `// In 2D/Layer modes …` → `// Drag on the element's own layer plane`; `const dragY = is2DMode ? 0.1 : element.position3D.y;` → `const dragY = element.position3D.y;`; Deps `[element.position3D.y, pushHistory, setDraggingStore]`.
  - `renderGeometry`: den Block `if (is2DMode) { … }` löschen.
  - Hypothesen-Ring: `args={[is2DMode ? (isLayerMode ? 1.9 : 1.3) : 1.15, …]}` → `args={[1.15, 0.04, 6, 8, HYPOTHESIS_DASH_ARC]}`.
  - `<ArchiMateIconSprite … is2DMode={is2DMode} …/>`: Zeile `is2DMode={is2DMode}` löschen.
  - Risiko-Licht: `{!is2DMode && (element.riskLevel === 'high' || …) && (` → `{(element.riskLevel === 'high' || element.riskLevel === 'critical') && (`; Kommentar `(3D only)` streichen.
  - Label-Bedingung: `(is2DMode || hovered || …)` → `(hovered || …)`; Kommentar `always visible in 2D/Layer modes;` streichen.
  - Label-Stil auf die 3D-Werte festsetzen: `position={isPolicyNode ? [0, 0.15, 0] : [0, 1.2, 0]}`, `background: 'rgba(15, 23, 42, 0.9)'`, ``border: `1px solid ${color}` ``, `padding: '4px 10px'`, `fontSize: '11px'`, `textShadow: 'none'`.
  - `maxWidth: isPolicyNode ? '150px' : isLayerMode ? '120px' : '90px'` → `maxWidth: isPolicyNode ? '150px' : '90px'`.
  - Den Zweig `) : isLayerMode ? ( <div …>{element.type…} · {element.status}…</div> )` löschen, sodass nach dem `cost`-Zweig direkt `) : (` mit dem Default-Typ-Label folgt.

- [ ] **Step 3: `ArchiMateIconSprite.tsx` und `PlateauElement.tsx`**

`ArchiMateIconSprite.tsx` (ab Zeile ~969):

```tsx
interface ArchiMateIconSpriteProps {
  elementType: string;
  layerColor: string;
  opacity?: number;
  scale?: number;
}

export default function ArchiMateIconSprite({
  elementType,
  layerColor,
  opacity = 1,
  scale = 0.4,
}: ArchiMateIconSpriteProps) {
  const material = useMemo(
    () => getSpriteMaterial(elementType, layerColor, opacity),
    [elementType, layerColor, opacity],
  );

  // Above the shape, slightly towards the viewer.
  const position: [number, number, number] = [0, 0.85, 0.55];
```

`PlateauElement.tsx`: Zeile `is2DMode={false}` am `<ArchiMateIconSprite>` löschen.

- [ ] **Step 4: `ConnectionLines.tsx`**
  - Import `useViewPositions` löschen; Zeilen `const viewMode …`, `const focusedLayer …`, `const is2DMode …`, `const isLayerMode …` und `const { positions: viewPositions, visibleElementIds } = useViewPositions();` löschen. Wird `useUIStore` danach nicht mehr benutzt, den Import löschen.
  - In `visibleConnections` die Blöcke `// In layer mode …` und `// In 2D/layer modes …` löschen; Deps: `[connections, elementMap, visibleLayers, policyNodeIds, activityIds]`.
  - Den Zweig `} else if (is2DMode) { … }` bei der Positionsbestimmung löschen.
  - `mid.y += is2DMode ? 0.3 : (isCrossArchitecture ? 4 : 1.5);` → `mid.y += isCrossArchitecture ? 4 : 1.5;`
  - `curve.getPoints(is2DMode ? 16 : 32)` → `curve.getPoints(32)`
  - `{showParticles && !is2DMode && (` → `{showParticles && (`

- [ ] **Step 5: `LayerPlane.tsx` und `PlateauRenderer.tsx`**

`LayerPlane.tsx`:
  - Import `import type { ViewMode } …` sowie `ARCHITECTURE_LAYERS`, `LAYER_INDEX`, `SWIM_LANE_SPACING` löschen.
  - Prop `viewMode?: ViewMode;` und `viewMode = '3d'` aus der Signatur löschen; `const is2D …`, `const isLayer …` löschen.
  - Den Kommentar `// Position and size based on view mode`, die Zeile `const layerIdx = LAYER_INDEX.get(layerId) ?? 0;` und den Positions-/Größenblock ersetzen durch:
    ```ts
    const groupPosition: [number, number, number] = [offsetX, yPosition, 0];
    const planeWidth = 30;
    const planeDepth = 30;
    const labelPos: [number, number, number] = [-16, 0.1, -16];
    ```
  - `opacity={is2D ? … : planeOpacity}` → `opacity={planeOpacity}`.
  - `opacity={is2D ? 0.4 : (riskInfo && riskInfo.avgRisk >= 5 ? 0.6 : 0.3)}` → `opacity={riskInfo && riskInfo.avgRisk >= 5 ? 0.6 : 0.3}`.
  - `{workspaceName && !is2D && !isLayer && (` → `{workspaceName && (`.
  - Label-Stil: `fontSize: '9px'`, `fontWeight: 500`, `opacity: 0.45`.

`PlateauRenderer.tsx`: Zeile `viewMode="3d"` am `<LayerPlane>` löschen.

`Scene.tsx`: am `<LayerPlane>` in der Workspace-Schleife (um Zeile 146) die Prop-Zeile `viewMode={viewMode}` löschen — sonst meldet `tsc -b` TS2322. Der Rest von Scene bleibt bis Task 4 unverändert.

- [ ] **Step 6: Hook löschen**

Run: `grep -rn useViewPositions src` — darf nur noch `src/hooks/useViewPositions.ts` selbst und den Wächter-Test treffen. Dann `git rm src/hooks/useViewPositions.ts`. (`git rm` staged nur, committet nicht.)

- [ ] **Step 7: Prüfen**

Run: `npx tsc -b && npx vitest run src/components/3d`
Expected: tsc 0 Fehler, Tests PASS.

---

## Chunk 2: Scene, Toolbar, Store

### Task 4: Scene ohne View-Mode, LayerNavigator weg

**Files:**
- Modify: `packages/client/src/components/3d/Scene.tsx`
- Delete: `packages/client/src/components/ui/LayerNavigator.tsx`

- [ ] **Step 1: Scene reduzieren**
  - Import `LayerNavigator` (Zeile 26) löschen.
  - Zeilen `const viewMode = …`, `const focusedLayer = …`, `const is3D = …`, `const isLayerView = …` löschen.
  - `const deactivatePlateauView = …` und `const exitActivityView = …` löschen (nur von den Guards benutzt).
  - Beide Guard-Effekte („auto-deactivate Plateau View / Activity View when leaving 3D mode“) löschen.
  - Canvas-Hintergrund: `background: isXRayActive ? '#080e1a' : '#0a0a0a'`.
  - Licht:
    ```tsx
          <ambientLight intensity={isXRayActive ? 0.25 : 0.4} />
          <directionalLight position={[10, 20, 10]} intensity={isXRayActive ? 0.5 : 0.8} castShadow />
          <pointLight position={[-10, 10, -10]} intensity={0.3} color="#00ff41" />
    ```
    Kommentar `{/* Lighting adapts to view mode */}` → `{/* Lighting */}`.
  - `{isActivityActive && is3D ? (` → `{isActivityActive ? (`; `(isPlateauActive || trackReform) && is3D ? (` → `(isPlateauActive || trackReform) ? (`.
  - In der LayerPlane-Schleife Kommentar und Zeile `if (isLayerView && layer.id !== focusedLayer) return null;` löschen sowie Prop `viewMode={viewMode}` löschen.
  - `{is3D && <TransformationXRay />}` → `<TransformationXRay />`; dasselbe für `AgentAvatars3D`, `DiscussionBubbles3D`, `PolicyBoard`, `<Environment …/>`.
  - `{is3D && ( <Grid … /> )}` → nur `<Grid … />`; Kommentar `{/* Grid only in 3D mode */}` → `{/* Ground grid */}`.
  - `{is3D && ( <EffectComposer>…</EffectComposer> )}` → nur `<EffectComposer>…</EffectComposer>`; im Kommentar `Only in 3D.` streichen.
  - HUDs: in den Zeilen für `WorkspaceBar`, `PlateauBar`, `PlateauHUD`, `ActivityHUD`, `Minimap` jeweils `&& is3D` bzw. `is3D &&` streichen, z. B. `{!isXRayActive && !isPlateauActive && <WorkspaceBar />}`.
  - Kommentar + Zeile `{isLayerView && !isXRayActive && <LayerNavigator />}` löschen.

- [ ] **Step 2: LayerNavigator löschen**

Run: `grep -rn LayerNavigator src` → nur noch die Datei selbst und der Wächter-Test. Dann `git rm src/components/ui/LayerNavigator.tsx`.

- [ ] **Step 3: Prüfen**

Run: `npx tsc -b`
Expected: 0 Fehler.

### Task 5: Toolbar und RoadmapPanel ohne Umschalter

**Files:**
- Modify: `packages/client/src/components/ui/Toolbar.tsx`
- Modify: `packages/client/src/components/analytics/RoadmapPanel.tsx`

- [ ] **Step 1: Toolbar**
  - lucide-Import: `Box,` und `Grid3x3,` löschen (`Layers` bleibt, wird weiter unten benutzt — vorher `grep -n "Box\|Grid3x3\|Layers" Toolbar.tsx` prüfen).
  - Aus der `useUIStore()`-Destrukturierung `viewMode,` und `setViewMode,` löschen.
  - `handleXRayToggle` ersetzen durch direkten Aufruf: Funktion löschen und ihre Aufrufer `handleXRayToggle` → `toggleXRay` (`grep -n handleXRayToggle`).
  - `handleSetViewMode` samt Kommentar löschen.
  - Im Keydown-Handler den Block `// Ctrl+1/2/3 for view mode switching` mit allen drei `if`s löschen.
  - Im JSX den Block `{/* Center section - View modes + Viewpoint */}`: das innere `<div className="flex items-center gap-1 rounded-lg bg-[var(--surface-base)] p-0.5">…</div>` mit den drei `ViewModeButton`s löschen; Kommentar → `{/* Center section - Viewpoint */}`.
  - Funktion `ViewModeButton` am Dateiende löschen.
  - Falls `toast` danach ungenutzt ist, Import löschen (`grep -n "toast" Toolbar.tsx`).

- [ ] **Step 2: RoadmapPanel**

In `PlateauViewToggle`: die Zeilen `const viewMode = …`, `const setViewMode = …`, `const is3D = …` sowie im `handleToggle` den Kommentar `// Ensure 3D mode is active` und `if (!is3D) setViewMode('3d');` löschen. Wird `useUIStore` in der Datei danach nicht mehr benutzt, den Import löschen.

- [ ] **Step 3: Prüfen**

Run: `npx tsc -b && npx tsc -p tsconfig.json --noEmit --noUnusedLocals 2>&1 | grep -E "Toolbar|RoadmapPanel"`
Expected: `tsc -b` ohne Ausgabe; der zweite Befehl zeigt keine Zeile, die auf diesen Bau zurückgeht (ungenutzte `Box`, `Grid3x3`, `toast`, `useUIStore` usw.). Vorbestehende Treffer sind zulässig.

### Task 6: Store bereinigen — Wächter wird grün

**Files:**
- Modify: `packages/client/src/stores/uiStore.ts`
- Modify: `packages/client/src/components/ui/ElementPalette.tsx`

- [ ] **Step 1: ElementPalette ohne `focusedLayer`**

```ts
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set(['business']));
```

Die Zeile `const focusedLayer = useUIStore(s => s.focusedLayer);` und den Effekt `// Auto-expand focused layer when it changes` löschen. Ist `useEffect` danach ungenutzt, aus dem React-Import nehmen.

- [ ] **Step 2: uiStore**
  - `export type ViewMode = …` löschen.
  - Im Interface `viewMode: ViewMode;`, `focusedLayer: ArchitectureLayer;`, `setViewMode: …`, `setFocusedLayer: …` löschen.
  - Im Initialzustand `viewMode: '3d',` und `focusedLayer: 'business',` löschen; Setter `setViewMode` und `setFocusedLayer` löschen.
  - Ist `ArchitectureLayer` danach ungenutzt, den Typ-Import löschen.

- [ ] **Step 3: Wächter grün**

Run: `npx vitest run src/stores/uiStore.viewMode.test.ts`
Expected: PASS (2/2).

- [ ] **Step 4: Vollprüfung kalt (REQ THE-797)**

```bash
(cd ../shared && npm run build)
find . -name "*.tsbuildinfo" -not -path "./node_modules/*" -delete
npx tsc -b
npm test
npx tsc -p tsconfig.json --noEmit --noUnusedLocals 2>&1 | grep -c "error TS"
```

Expected: `tsc -b` ohne Ausgabe (0 Fehler); `npm test` grün; die letzte Zahl ist nicht größer als der Ausgangswert aus Task 1, Step 3.

- [ ] **Step 5: Rest-Grep (REQ THE-795)**

Run: `grep -rnE "viewMode|ViewMode|is3D|is2D|isLayerMode|isLayerView|useViewPositions|OrthographicCamera|focusedLayer" src`
Expected: nur `plateauViewMode`/`setPlateauViewMode` (roadmapStore, PlateauBar, PlateauRenderer, Tests), `ViewModeCamera` als Dateiname/Import/Kommentar, der lokale `viewMode`/`ViewMode` in `SimulationPanel.tsx` und die Muster im Wächter-Test.

---

## Abschluss (nicht Teil der Implementer-Tasks)

1. Browser-Beweis (REQ THE-796): `preview_start` mit einer Client-Konfiguration für diesen Worktree, Demo-Projekt öffnen, Screenshot der 3D-Welt, Toolbar ohne View-Mode-Gruppe, Ctrl+2/Ctrl+3 ohne Wirkung in der App, Pfeiltasten wechseln Workspaces. Hinweis: Ohne die alten Handler ruft niemand mehr `preventDefault` für ⌘/Ctrl+1–3 — der Browser darf die Kombination selbst nutzen (Tab-Wechsel). Das ist gewollt und kein Fehlschlag.
2. Blinder Prüfer gegen die versiegelten Szenarien.
3. RVTM-Evidenz eintragen, Ergebnis an den PO. Commit/Push nur auf Anfrage.
