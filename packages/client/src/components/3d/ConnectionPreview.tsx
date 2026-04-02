/**
 * ConnectionPreview — Real-time dashed line from source element to mouse cursor
 * during connection mode. Rendered inside the R3F Canvas.
 */
import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';

const DASH_SIZE = 0.3;
const GAP_SIZE = 0.15;
const LINE_COLOR = '#00ff41';
const INVALID_COLOR = '#ef4444';

export default function ConnectionPreview() {
  const lineRef = useRef<THREE.Line>(null);
  const { raycaster, pointer, camera } = useThree();
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectPoint = useRef(new THREE.Vector3());

  const isConnectionMode = useUIStore((s) => s.isConnectionMode);
  const sourceId = useUIStore((s) => s.connectionSourceId);
  const showPicker = useUIStore((s) => s.showConnectionPicker);
  const elements = useArchitectureStore((s) => s.elements);

  const sourceEl = useMemo(
    () => elements.find(el => el.id === sourceId),
    [elements, sourceId]
  );

  const material = useMemo(() => {
    return new THREE.LineDashedMaterial({
      color: LINE_COLOR,
      dashSize: DASH_SIZE,
      gapSize: GAP_SIZE,
      transparent: true,
      opacity: 0.6,
      linewidth: 1,
    });
  }, []);

  // Update line endpoints every frame
  useFrame(() => {
    if (!lineRef.current || !sourceEl || !isConnectionMode || !sourceId || showPicker) {
      if (lineRef.current) lineRef.current.visible = false;
      return;
    }

    lineRef.current.visible = true;

    // Source position
    const srcPos = new THREE.Vector3(
      sourceEl.position3D.x,
      sourceEl.position3D.y,
      sourceEl.position3D.z
    );

    // Raycast pointer to a horizontal plane at source Y
    planeRef.current.set(new THREE.Vector3(0, 1, 0), -sourceEl.position3D.y);
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(planeRef.current, intersectPoint.current);

    const tgtPos = intersectPoint.current.clone();

    // Update geometry
    const geometry = lineRef.current.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute('position');
    if (positions) {
      positions.setXYZ(0, srcPos.x, srcPos.y, srcPos.z);
      positions.setXYZ(1, tgtPos.x, tgtPos.y, tgtPos.z);
      positions.needsUpdate = true;
    }

    // Recompute dashes
    lineRef.current.computeLineDistances();

    // Pulse opacity
    const t = Date.now() * 0.003;
    material.opacity = 0.4 + Math.sin(t) * 0.2;
  });

  if (!isConnectionMode || !sourceId) return null;

  return (
    <line ref={lineRef as any}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array(6)}
          itemSize={3}
        />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </line>
  );
}
