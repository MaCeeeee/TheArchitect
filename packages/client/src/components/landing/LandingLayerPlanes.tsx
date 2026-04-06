import { useRef, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEMO_LAYERS } from './landing.constants';

const BASE_OPACITY = 0.02;
const ACTIVE_OPACITY = 0.08;
const PLANE_SIZE = 30;

interface Props {
  scrollRef: MutableRefObject<number>;
}

export default function LandingLayerPlanes({ scrollRef }: Props) {
  const matRefs = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const edgeMatRefs = useRef<Map<string, THREE.LineBasicMaterial>>(new Map());

  useFrame(() => {
    const s = scrollRef.current;

    DEMO_LAYERS.forEach(layer => {
      const mat = matRefs.current.get(layer.id);
      const edgeMat = edgeMatRefs.current.get(layer.id);
      if (!mat || !edgeMat) return;

      const [start, end] = layer.zone;
      const isActive = s >= start && s < end;
      const targetOpacity = isActive ? ACTIVE_OPACITY : BASE_OPACITY;
      const targetEdge = isActive ? 0.3 : 0.05;

      mat.opacity += (targetOpacity - mat.opacity) * 0.06;
      edgeMat.opacity += (targetEdge - edgeMat.opacity) * 0.06;
    });
  });

  return (
    <group>
      {DEMO_LAYERS.map(layer => (
        <group key={layer.id} position={[0, layer.y - 0.1, 0]}>
          {/* Plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
            <meshStandardMaterial
              ref={(ref) => { if (ref) matRefs.current.set(layer.id, ref); }}
              color={layer.color}
              transparent
              opacity={BASE_OPACITY}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Edge glow */}
          <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE)]} />
            <lineBasicMaterial
              ref={(ref) => { if (ref) edgeMatRefs.current.set(layer.id, ref); }}
              color={layer.color}
              transparent
              opacity={0.05}
            />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}
