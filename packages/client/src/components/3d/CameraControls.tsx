import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

interface CameraTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

let flyTarget: CameraTarget | null = null;
let flyProgress = 1;

export function flyToElement(elementPosition: { x: number; y: number; z: number }) {
  const target = new THREE.Vector3(elementPosition.x, elementPosition.y, elementPosition.z);
  const offset = new THREE.Vector3(5, 4, 5);
  flyTarget = {
    position: target.clone().add(offset),
    lookAt: target,
  };
  flyProgress = 0;
}

export function flyToWorkspace(offsetX: number) {
  const lookAt = new THREE.Vector3(offsetX, 4, 0);
  flyTarget = {
    position: new THREE.Vector3(offsetX + 20, 15, 20),
    lookAt,
  };
  flyProgress = 0;
}

export function fitToScreen(elements: { position3D: { x: number; y: number; z: number } }[]) {
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

export function fitAllWorkspaces(workspaces: { offsetX: number }[]) {
  if (workspaces.length === 0) return;
  if (workspaces.length === 1) {
    flyToWorkspace(workspaces[0].offsetX);
    return;
  }

  const minX = Math.min(...workspaces.map((ws) => ws.offsetX));
  const maxX = Math.max(...workspaces.map((ws) => ws.offsetX));
  const centerX = (minX + maxX) / 2;
  const span = maxX - minX + 30; // include layer plane width
  const distance = Math.max(span * 0.7, 40);

  flyTarget = {
    position: new THREE.Vector3(centerX, distance * 0.5, distance * 0.6),
    lookAt: new THREE.Vector3(centerX, 4, 0),
  };
  flyProgress = 0;
}

export default function CameraControlsWrapper() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const isDragging = useArchitectureStore((s) => s.isDragging);

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
      // Skip if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        const elements = useArchitectureStore.getState().elements;
        const selectedId = useArchitectureStore.getState().selectedElementId;
        if (selectedId) {
          const el = elements.find((el) => el.id === selectedId);
          if (el) flyToElement(el.position3D);
        } else {
          fitToScreen(elements);
        }
      }

      // Arrow keys to cycle workspaces
      const wsState = useWorkspaceStore.getState();
      const workspaces = wsState.workspaces;
      if (workspaces.length <= 1) return;

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

      // Home key to fit all
      if (e.key === 'Home') {
        fitAllWorkspaces(workspaces);
      }

      // Number keys 1-9 to jump to workspace by index
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= workspaces.length && !e.ctrlKey && !e.metaKey) {
        const ws = workspaces[num - 1];
        wsState.setActiveWorkspace(ws.id);
        flyToWorkspace(ws.offsetX);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!isDragging}
      minDistance={5}
      maxDistance={300}
      maxPolarAngle={Math.PI / 2.1}
      enableDamping
      dampingFactor={0.05}
    />
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
