import { useRef, useMemo, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { SCROLL_ZONES, NODES, RISK_NODES, getXRayIntensity } from './landing.constants';

const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

// Critical path: b2 → a2 → t1
const CRITICAL_PATH = [
  { from: 'b2', to: 'a2' },
  { from: 'a2', to: 't1' },
];

interface Props {
  scrollRef: MutableRefObject<number>;
}

export default function LandingXRay({ scrollRef }: Props) {
  const auraRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const auraMats = useRef<Map<string, THREE.MeshBasicMaterial>>(new Map());
  const groupRef = useRef<THREE.Group>(null);
  const intensityRef = useRef(0);

  // Node positions lookup
  const nodePositions = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    NODES.forEach(n => m.set(n.id, n.pos));
    return m;
  }, []);

  // Critical path line points
  const pathLines = useMemo(() =>
    CRITICAL_PATH.map(({ from, to }) => {
      const fromPos = nodePositions.get(from)!;
      const toPos = nodePositions.get(to)!;
      return [fromPos, toPos] as [[number, number, number], [number, number, number]];
    }), [nodePositions]);

  useFrame((state) => {
    const intensity = getXRayIntensity(scrollRef.current);
    intensityRef.current = intensity;

    const time = state.clock.elapsedTime;

    // Danger auras
    Object.entries(RISK_NODES).forEach(([nodeId, { risk }]) => {
      const mesh = auraRefs.current.get(nodeId);
      const mat = auraMats.current.get(nodeId);
      if (!mesh || !mat) return;

      const pulse = 1.5 + Math.sin(time * 3) * 0.3;
      mesh.scale.setScalar(intensity > 0.01 ? pulse : 0);
      mat.opacity = intensity * (risk === 'high' ? 0.25 : 0.15);
      mesh.visible = intensity > 0.01;
    });

    // Toggle group visibility
    if (groupRef.current) {
      groupRef.current.visible = intensity > 0.01;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Danger auras around risk nodes */}
      {Object.entries(RISK_NODES).map(([nodeId, { risk }]) => {
        const pos = nodePositions.get(nodeId);
        if (!pos) return null;
        return (
          <mesh
            key={`aura-${nodeId}`}
            position={pos}
            ref={(ref) => { if (ref) auraRefs.current.set(nodeId, ref); }}
          >
            <sphereGeometry args={[1.5, 24, 24]} />
            <meshBasicMaterial
              ref={(ref) => { if (ref) auraMats.current.set(nodeId, ref); }}
              color={RISK_COLORS[risk]}
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.BackSide}
            />
          </mesh>
        );
      })}

      {/* Critical path beams */}
      {pathLines.map((pts, i) => (
        <Line
          key={`beam-${i}`}
          points={pts}
          color="#ef4444"
          lineWidth={3}
          transparent
          opacity={0.8}
        />
      ))}
    </group>
  );
}
