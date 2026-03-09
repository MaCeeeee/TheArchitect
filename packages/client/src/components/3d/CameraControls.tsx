import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';

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
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        const elements = useArchitectureStore.getState().elements;
        const selectedId = useArchitectureStore.getState().selectedElementId;
        if (selectedId) {
          const el = elements.find((e) => e.id === selectedId);
          if (el) flyToElement(el.position3D);
        } else {
          fitToScreen(elements);
        }
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
      maxDistance={100}
      maxPolarAngle={Math.PI / 2.1}
      enableDamping
      dampingFactor={0.05}
    />
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
