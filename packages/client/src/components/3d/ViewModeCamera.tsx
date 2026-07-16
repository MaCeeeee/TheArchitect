import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useUIStore, ViewMode } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { useXRayStore } from '../../stores/xrayStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';
import { computeViewPositions } from '../../hooks/useViewPositions';
import type { StationKey } from '../journey/stations';
import type { DockSide } from '../journey/sheetPrefs';

// ─── Fly-to animation state (module-level for external access) ────────
interface CameraTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

let flyTarget: CameraTarget | null = null;
let flyProgress = 1;

// ─── Public fly-to functions ──────────────────────────────────────────

export function flyToElement(elementPosition: { x: number; y: number; z: number }, elementId?: string) {
  const viewMode = useUIStore.getState().viewMode;

  // Resolve where the element is *actually rendered*. Sidebar callers pass
  // element.position3D, but X-Ray reflows elements onto bucket positions
  // (xrayStore.computePositions) and 2D/Layer views compute their own grid
  // (computeViewPositions). Without this lookup the camera flies to a phantom
  // location while the user-selected element sits 10+ units away.
  const resolvePosition = (): { x: number; y: number; z: number } => {
    if (!elementId) return elementPosition;
    // X-Ray override takes precedence (only in 3D view — the 2D/layer code
    // path has its own grid and ignores X-Ray positioning).
    if (viewMode === '3d') {
      const { isActive, xrayPositions } = useXRayStore.getState();
      if (isActive) {
        const xp = xrayPositions.get(elementId);
        if (xp) return xp;
      }
    }
    return elementPosition;
  };

  const resolved = resolvePosition();

  if (viewMode === '3d') {
    const target = new THREE.Vector3(resolved.x, resolved.y, resolved.z);
    flyTarget = {
      position: target.clone().add(new THREE.Vector3(5, 4, 5)),
      lookAt: target,
    };
  } else {
    // Compute the actual view position for this element
    let targetX = resolved.x;
    let targetZ = resolved.z;

    if (elementId) {
      const { viewMode: vm, focusedLayer } = useUIStore.getState();
      const elements = useArchitectureStore.getState().elements;
      const viewPositions = computeViewPositions(vm, focusedLayer, elements);
      const viewPos = viewPositions.positions.get(elementId);
      if (viewPos) {
        targetX = viewPos.x;
        targetZ = viewPos.z;
      }
    }

    flyTarget = {
      position: new THREE.Vector3(targetX, viewMode === 'layer' ? 40 : 80, targetZ),
      lookAt: new THREE.Vector3(targetX, 0, targetZ),
    };
  }
  flyProgress = 0;
}

// Activity-View pyramid camera — front aufsicht (BPMN-style)
// Apex at (apex.x, apex.y, apex.z); activities spread on a plane below.
export function flyToProcessPyramid(
  apexPosition: { x: number; y: number; z: number },
  activityCount: number,
) {
  const MAX_WIDTH = 30;
  const MAX_PER_ROW = 12;
  const rows = Math.max(1, Math.ceil(Math.max(activityCount, 1) / MAX_PER_ROW));
  const widthEstimate = activityCount === 0 ? 6 : Math.min(MAX_WIDTH, (activityCount - 1) * 3.5);
  const depthEstimate = (rows - 1) * 3.5;
  const dist = Math.max(20, widthEstimate * 0.9 + depthEstimate * 1.5 + 8);

  flyTarget = {
    position: new THREE.Vector3(apexPosition.x, apexPosition.y + 4, apexPosition.z + dist),
    lookAt: new THREE.Vector3(apexPosition.x, apexPosition.y - 2, apexPosition.z),
  };
  flyProgress = 0;
}

export function flyDeeperIntoPyramid(_activityId: string, _activityCount: number) {
  // Phase 9 stub — full implementation lands with recursive drill-down.
}

export function flyBackToWorkspace() {
  flyTarget = {
    position: new THREE.Vector3(20, 15, 20),
    lookAt: new THREE.Vector3(0, 4, 0),
  };
  flyProgress = 0;
}

export function flyToWorkspace(offsetX: number) {
  const viewMode = useUIStore.getState().viewMode;
  if (viewMode === '3d') {
    flyTarget = {
      position: new THREE.Vector3(offsetX + 20, 15, 20),
      lookAt: new THREE.Vector3(offsetX, 4, 0),
    };
  } else {
    flyTarget = {
      position: new THREE.Vector3(offsetX, viewMode === 'layer' ? 40 : 80, 0),
      lookAt: new THREE.Vector3(offsetX, 0, 0),
    };
  }
  flyProgress = 0;
}

export function fitToScreen(elements: { id?: string; position3D: { x: number; y: number; z: number } }[]) {
  if (elements.length === 0) return;
  const { viewMode, focusedLayer } = useUIStore.getState();

  if (viewMode === '3d') {
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
  } else {
    // Use view positions for 2D/Layer center calculation
    const allElements = useArchitectureStore.getState().elements;
    const viewResult = computeViewPositions(viewMode, focusedLayer, allElements);
    const positions = Array.from(viewResult.positions.values());
    if (positions.length === 0) return;

    const center = new THREE.Vector3();
    for (const p of positions) {
      center.add(new THREE.Vector3(p.x, 0, p.z));
    }
    center.divideScalar(positions.length);

    flyTarget = {
      position: new THREE.Vector3(center.x, viewMode === 'layer' ? 40 : 80, center.z),
      lookAt: new THREE.Vector3(center.x, 0, center.z),
    };
  }
  flyProgress = 0;
}

export function fitAllWorkspaces(workspaces: { offsetX: number }[]) {
  if (workspaces.length === 0) return;
  if (workspaces.length === 1) {
    flyToWorkspace(workspaces[0].offsetX);
    return;
  }

  const minX = Math.min(...workspaces.map((ws) => ws.offsetX));
  const maxX = Math.max(...workspaces.map((ws) => ws.offsetX));
  const centerX = (minX + maxX) / 2;
  const span = maxX - minX + 30;
  const distance = Math.max(span * 0.7, 40);

  const viewMode = useUIStore.getState().viewMode;
  if (viewMode === '3d') {
    flyTarget = {
      position: new THREE.Vector3(centerX, distance * 0.5, distance * 0.6),
      lookAt: new THREE.Vector3(centerX, 4, 0),
    };
  } else {
    flyTarget = {
      position: new THREE.Vector3(centerX, viewMode === 'layer' ? 40 : 80, 0),
      lookAt: new THREE.Vector3(centerX, 0, 0),
    };
  }
  flyProgress = 0;
}

// ─── Station framing (ADR-0005 / THE-482) ─────────────────────────────
// A Station sets the camera framing *intent*; viewMode keeps owning the
// projection (Station ⟂ viewMode). In 2D/layer the top-down constraint wins,
// exactly like the other fly-to helpers above — we delegate to fitToScreen.
// Vertical field-of-view of the perspective camera (see <PerspectiveCamera> below).
// Single source so the Sheet-offset math stays in sync with what's actually rendered.
const CAMERA_FOV_DEG = 60;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Per-station framing (THE-482). `dir` = the distinct viewing angle; `distFactor`
// = how far back to pull (× the model's radius). THE-488 tightened the band to
// 1.5–1.9 so every station frames the model at a readable size — the old
// vision 2.2 / track 2.4 pulled the camera so far the model became a speck.
const STATION_FRAMING: Record<StationKey, { dir: [number, number, number]; distFactor: number }> = {
  vision:  { dir: [0.0, 0.9, 0.8],   distFactor: 1.9 }, // elevated total — see the whole intent
  model:   { dir: [0.6, 0.5, 0.6],   distFactor: 1.5 }, // the working angle (matches fitToScreen)
  explore: { dir: [0.5, 0.6, 0.5],   distFactor: 1.6 }, // elevated 3/4 inspection view (~40°, not top-down)
  plan:    { dir: [1.1, 0.35, 0.5],  distFactor: 1.7 }, // dramatic side — world under load
  govern:  { dir: [-0.6, 0.9, 0.6],  distFactor: 1.7 }, // elevated opposite side
  track:   { dir: [0.0, 0.6, 1.2],   distFactor: 1.8 }, // front total — the timeline view
};

/** Median of a numeric list (robust centre/spread — see flyToStation). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Framing modifiers captured at station-arrival (THE-488). */
export interface StationFramingOptions {
  /** CSS-px width of a Sheet docked over the viewport right now (0 / omit = none). */
  sheetOffsetPx?: number;
  /** Which side that Sheet is docked to. Defaults to 'right'. */
  sheetDock?: DockSide;
}

export function flyToStation(
  station: StationKey,
  elements: { id?: string; position3D: { x: number; y: number; z: number } }[],
  opts: StationFramingOptions = {},
) {
  if (elements.length === 0) return;
  const viewMode = useUIStore.getState().viewMode;

  if (viewMode !== '3d') {
    // Projection wins: 2D/layer users get the same top-down fit they get today.
    fitToScreen(elements);
    return;
  }

  // Robust framing (THE-488): use the median centre and a MAD-trimmed radius so
  // a single element with a broken layout position — e.g. z=-1682 while the rest
  // sit within ±20 (data anomaly THE-490) — can't drag the centre off-screen or
  // blow the camera distance up until the whole model is a speck. A mean centroid
  // + raw maxDist did exactly that. On clean models the cutoff sits above the true
  // max, so nothing is trimmed and this matches the old behaviour.
  const center = new THREE.Vector3(
    median(elements.map((e) => e.position3D.x)),
    median(elements.map((e) => e.position3D.y)),
    median(elements.map((e) => e.position3D.z)),
  );
  const dists = elements.map((e) =>
    center.distanceTo(new THREE.Vector3(e.position3D.x, e.position3D.y, e.position3D.z)),
  );
  const medD = median(dists);
  const mad = median(dists.map((d) => Math.abs(d - medD)));
  const cutoff = medD + Math.max(6 * mad, medD); // generous: keeps normal spread, drops gross outliers
  const radius = dists.reduce((mx, d) => (d <= cutoff && d > mx ? d : mx), 0);

  const f = STATION_FRAMING[station];
  const distance = Math.max(radius * f.distFactor, 15);
  const dir = new THREE.Vector3(f.dir[0], f.dir[1], f.dir[2]).normalize();
  const position = center.clone().add(dir.clone().multiplyScalar(distance));
  const lookAt = center.clone();

  // Sheet-offset (THE-488): a docked Sheet covers part of the viewport, so pan
  // camera+target sideways to re-centre the model in the *visible* area rather
  // than behind the Sheet. A pure pan preserves the station's angle+distance.
  // The world shift equals half the Sheet width mapped through the perspective
  // frustum at the model's distance (square px → same world/px on both axes):
  //   worldShift = (sheetPx/2) · (2·distance·tan(fov/2) / viewportH)
  // Captured once here; resizing the Sheet does NOT reframe (THE-485 AC-2).
  const sheetOffsetPx = opts.sheetOffsetPx ?? 0;
  if (sheetOffsetPx > 0) {
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180;
    const worldShift = (sheetOffsetPx * distance * Math.tan(fovRad / 2)) / viewportH;
    const forward = center.clone().sub(position).normalize(); // camera → model
    const right = forward.clone().cross(WORLD_UP).normalize(); // screen-right in world
    // Sheet on the right → pan right so the model sits left-of-centre (and vice-versa).
    const sign = opts.sheetDock === 'left' ? -1 : 1;
    const pan = right.multiplyScalar(sign * worldShift);
    position.add(pan);
    lookAt.add(pan);
  }

  flyTarget = { position, lookAt };
  flyProgress = 0;
}

/** Test-only introspection of the module-level fly target. */
export function __getFlyTargetForTests(): CameraTarget | null {
  return flyTarget;
}

// ─── Layer navigation helpers ─────────────────────────────────────────

const LAYER_IDS = ARCHITECTURE_LAYERS.map((l) => l.id);

export function nextLayer() {
  const { focusedLayer, setFocusedLayer } = useUIStore.getState();
  const idx = LAYER_IDS.indexOf(focusedLayer);
  const next = LAYER_IDS[Math.min(idx + 1, LAYER_IDS.length - 1)];
  setFocusedLayer(next);
}

export function prevLayer() {
  const { focusedLayer, setFocusedLayer } = useUIStore.getState();
  const idx = LAYER_IDS.indexOf(focusedLayer);
  const prev = LAYER_IDS[Math.max(idx - 1, 0)];
  setFocusedLayer(prev);
}

// ─── Component ────────────────────────────────────────────────────────

export default function ViewModeCamera() {
  const controlsRef = useRef<any>(null);
  const perspRef = useRef<THREE.PerspectiveCamera>(null);
  const orthoRef = useRef<THREE.OrthographicCamera>(null);
  const { camera, size } = useThree();
  const isDragging = useArchitectureStore((s) => s.isDragging);
  const viewMode = useUIStore((s) => s.viewMode);
  const prevViewMode = useRef<ViewMode>(viewMode);

  // Animate camera on mode change
  useEffect(() => {
    if (prevViewMode.current === viewMode) return;
    prevViewMode.current = viewMode;

    if (viewMode === '3d') {
      flyTarget = {
        position: new THREE.Vector3(20, 15, 20),
        lookAt: new THREE.Vector3(0, 4, 0),
      };
    } else if (viewMode === '2d-topdown') {
      flyTarget = {
        position: new THREE.Vector3(0, 80, 0),
        lookAt: new THREE.Vector3(0, 0, 0),
      };
    } else if (viewMode === 'layer') {
      flyTarget = {
        position: new THREE.Vector3(0, 40, 0),
        lookAt: new THREE.Vector3(0, 0, 0),
      };
    }
    flyProgress = 0;
  }, [viewMode]);

  // Fly-to animation
  useFrame((_, delta) => {
    if (flyTarget && flyProgress < 1) {
      flyProgress = Math.min(flyProgress + delta * 1.5, 1);
      const t = easeInOutCubic(flyProgress);

      camera.position.lerp(flyTarget.position, t);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(flyTarget.lookAt, t);
        controlsRef.current.update();
      }

      if (flyProgress >= 1) {
        flyTarget = null;
      }
    }
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // F = fit to screen / fly to selected
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        const elements = useArchitectureStore.getState().elements;
        const selectedId = useArchitectureStore.getState().selectedElementId;
        if (selectedId) {
          const el = elements.find((el) => el.id === selectedId);
          if (el) flyToElement(el.position3D, el.id);
        } else {
          fitToScreen(elements);
        }
      }

      // Plateau View navigation takes priority when active
      const plateauState = useRoadmapStore.getState();
      if (plateauState.isPlateauViewActive) {
        const PLATEAU_GAP = 40;
        const snapshotCount = plateauState.plateauSnapshots.length;
        const current = plateauState.selectedPlateauIndex ?? 0;

        if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const prev = current > 0 ? current - 1 : snapshotCount - 1;
          plateauState.selectPlateau(prev);
          flyToWorkspace(prev * PLATEAU_GAP);
        }
        if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const next = current < snapshotCount - 1 ? current + 1 : 0;
          plateauState.selectPlateau(next);
          flyToWorkspace(next * PLATEAU_GAP);
        }
        if (e.key === 'Home') {
          e.preventDefault();
          fitAllWorkspaces(
            plateauState.plateauSnapshots.map((_, i) => ({ offsetX: i * PLATEAU_GAP })),
          );
        }
        // Number keys 1-9 jump to plateau N
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && num <= snapshotCount && !e.ctrlKey && !e.metaKey) {
          plateauState.selectPlateau(num - 1);
          flyToWorkspace((num - 1) * PLATEAU_GAP);
        }
        return; // Don't process normal workspace navigation
      }

      // Arrow keys for workspace navigation (3D/2D) or layer navigation (Layer)
      const wsState = useWorkspaceStore.getState();
      const workspaces = wsState.workspaces;

      if (useUIStore.getState().viewMode === 'layer') {
        if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          prevLayer();
        }
        if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          nextLayer();
        }
      } else if (workspaces.length > 1) {
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

      // Home = fit all workspaces
      if (e.key === 'Home') {
        fitAllWorkspaces(workspaces);
      }

      // Number keys 1-9 for workspace jump (only when not in layer mode)
      if (useUIStore.getState().viewMode !== 'layer') {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && num <= workspaces.length && !e.ctrlKey && !e.metaKey) {
          const ws = workspaces[num - 1];
          wsState.setActiveWorkspace(ws.id);
          flyToWorkspace(ws.offsetX);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const is2D = viewMode !== '3d';
  const aspect = size.width / size.height;
  const frustumSize = viewMode === 'layer' ? 25 : 50;

  return (
    <>
      {/* Perspective camera for 3D mode */}
      <PerspectiveCamera
        ref={perspRef}
        makeDefault={viewMode === '3d'}
        fov={CAMERA_FOV_DEG}
        near={0.1}
        far={1000}
        position={[20, 15, 20]}
      />

      {/* Orthographic camera for 2D/Layer modes */}
      <OrthographicCamera
        ref={orthoRef}
        makeDefault={is2D}
        near={0.1}
        far={500}
        position={viewMode === 'layer' ? [0, 40, 0] : [0, 80, 0]}
        left={-frustumSize * aspect}
        right={frustumSize * aspect}
        top={frustumSize}
        bottom={-frustumSize}
        zoom={viewMode === 'layer' ? 1.5 : 1}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!isDragging}
        enableRotate={viewMode === '3d'}
        enableDamping
        dampingFactor={0.05}
        minDistance={viewMode === '3d' ? 5 : undefined}
        maxDistance={viewMode === '3d' ? 400 : undefined}
        minZoom={is2D ? 0.2 : undefined}
        maxZoom={is2D ? 5 : undefined}
        maxPolarAngle={viewMode === '3d' ? Math.PI / 2.1 : undefined}
        // In 2D modes: middle mouse = zoom, left = pan
        mouseButtons={is2D ? {
          LEFT: THREE.MOUSE.PAN as any,
          MIDDLE: THREE.MOUSE.DOLLY as any,
          RIGHT: THREE.MOUSE.PAN as any,
        } : undefined}
      />
    </>
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
