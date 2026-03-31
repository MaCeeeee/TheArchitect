import { useRef, useMemo, MutableRefObject } from 'react';
import { Float, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Colors ───
const LAYER_COLORS: Record<string, string> = {
  strategy: '#ef4444',
  business: '#22c55e',
  application: '#f97316',
  technology: '#00ff41',
};

const CONNECTION_COLORS: Record<string, string> = {
  triggers: '#eab308',
  depends_on: '#ef4444',
  uses: '#00ff41',
  data_flow: '#06b6d4',
  runs_on: '#00ff41',
  integrates: '#f59e0b',
};

// ─── Demo nodes ───
interface DemoNode {
  id: string;
  layer: string;
  geometry: 'box' | 'sphere' | 'cylinder' | 'cone';
  pos: [number, number, number];
  chaosPos: [number, number, number];
}

const NODES: DemoNode[] = [
  // Strategy (red)
  { id: 's1', layer: 'strategy',    geometry: 'box',      pos: [-2, 6, 0],    chaosPos: [6, 9, -5] },
  { id: 's2', layer: 'strategy',    geometry: 'box',      pos: [2, 6, -1],    chaosPos: [-7, 4, 6] },
  // Business (green)
  { id: 'b1', layer: 'business',    geometry: 'cylinder', pos: [-3, 3, 1.5],  chaosPos: [5, -2, -6] },
  { id: 'b2', layer: 'business',    geometry: 'sphere',   pos: [0, 3, 2.5],   chaosPos: [-4, 8, 3] },
  { id: 'b3', layer: 'business',    geometry: 'cylinder', pos: [3, 3, -1],    chaosPos: [2, -5, 7] },
  // Application (orange)
  { id: 'a1', layer: 'application', geometry: 'sphere',   pos: [-4, 0, 0],    chaosPos: [7, 3, 2] },
  { id: 'a2', layer: 'application', geometry: 'box',      pos: [0, 0, 1.5],   chaosPos: [-6, -3, -4] },
  { id: 'a3', layer: 'application', geometry: 'cone',     pos: [4, 0, -1],    chaosPos: [3, 7, -7] },
  // Technology (matrix green)
  { id: 't1', layer: 'technology',  geometry: 'box',      pos: [-2.5, -3, 1], chaosPos: [-2, -7, 5] },
  { id: 't2', layer: 'technology',  geometry: 'cylinder', pos: [1.5, -3, -1], chaosPos: [6, -6, -3] },
  { id: 't3', layer: 'technology',  geometry: 'sphere',   pos: [4, -3, 1.5],  chaosPos: [-7, -2, -6] },
];

const CONNECTIONS = [
  { from: 's1', to: 'b1', type: 'triggers' },
  { from: 's2', to: 'b2', type: 'depends_on' },
  { from: 'b1', to: 'a2', type: 'uses' },
  { from: 'b2', to: 'a1', type: 'data_flow' },
  { from: 'b3', to: 'a3', type: 'uses' },
  { from: 'a1', to: 't1', type: 'runs_on' },
  { from: 'a2', to: 't2', type: 'data_flow' },
  { from: 'a3', to: 't3', type: 'runs_on' },
  { from: 'a2', to: 'a1', type: 'integrates' },
];

// ─── Geometry ───
function NodeGeometry({ type }: { type: string }) {
  switch (type) {
    case 'sphere':   return <sphereGeometry args={[0.7, 32, 32]} />;
    case 'cylinder': return <cylinderGeometry args={[0.55, 0.55, 1.1, 32]} />;
    case 'cone':     return <coneGeometry args={[0.55, 1.1, 32]} />;
    default:         return <boxGeometry args={[1.1, 1.1, 1.1]} />;
  }
}

// ─── Flow particle ───
function FlowParticle({ curve, color, speed, offset }: {
  curve: THREE.QuadraticBezierCurve3; color: string; speed: number; offset: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime * speed + offset) % 1;
    const point = curve.getPoint(t);
    ref.current.position.copy(point);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} />
    </mesh>
  );
}

// ─── Glow ring around nodes ───
function GlowRing({ color, radius }: { color: string; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.5;
    ref.current.rotation.x = Math.PI / 2;
  });
  return (
    <mesh ref={ref}>
      <ringGeometry args={[radius, radius + 0.06, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Main ───
interface Props {
  perfLevel: 'high' | 'low';
  scrollRef: MutableRefObject<number>;
}

export default function DemoArchitecture({ perfLevel, scrollRef }: Props) {
  const nodeRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const matRefs = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());

  const nodeMap = useMemo(() => {
    const m = new Map<string, DemoNode>();
    NODES.forEach(n => m.set(n.id, n));
    return m;
  }, []);

  const curves = useMemo(() =>
    CONNECTIONS.map(c => {
      const from = nodeMap.get(c.from)!;
      const to = nodeMap.get(c.to)!;
      const start = new THREE.Vector3(...from.pos);
      const end = new THREE.Vector3(...to.pos);
      const mid = start.clone().lerp(end, 0.5);
      mid.y += 1.8;
      return { ...c, curve: new THREE.QuadraticBezierCurve3(start, mid, end), color: CONNECTION_COLORS[c.type] || '#6b7280' };
    }), [nodeMap]);

  // Scroll-driven animations
  useFrame(() => {
    const s = scrollRef.current;

    NODES.forEach(node => {
      const mesh = nodeRefs.current.get(node.id);
      const mat = matRefs.current.get(node.id);
      if (!mesh || !mat) return;

      const layerColor = new THREE.Color(LAYER_COLORS[node.layer]);
      const chaosColor = new THREE.Color('#ef4444');

      if (s >= 0.2 && s <= 0.5) {
        const sectionT = (s - 0.2) / 0.3;
        if (sectionT < 0.4) {
          const t = sectionT / 0.4;
          mesh.position.set(
            node.pos[0] + (node.chaosPos[0] - node.pos[0]) * t,
            node.pos[1] + (node.chaosPos[1] - node.pos[1]) * t,
            node.pos[2] + (node.chaosPos[2] - node.pos[2]) * t,
          );
          mat.color.copy(layerColor).lerp(chaosColor, t);
          mat.emissive.copy(layerColor).lerp(chaosColor, t);
          mat.emissiveIntensity = 0.4 + t * 0.6;
        } else {
          const t = (sectionT - 0.4) / 0.6;
          mesh.position.set(
            node.chaosPos[0] + (node.pos[0] - node.chaosPos[0]) * t,
            node.chaosPos[1] + (node.pos[1] - node.chaosPos[1]) * t,
            node.chaosPos[2] + (node.pos[2] - node.chaosPos[2]) * t,
          );
          mat.color.copy(chaosColor).lerp(layerColor, t);
          mat.emissive.copy(chaosColor).lerp(layerColor, t);
          mat.emissiveIntensity = 1.0 - t * 0.6;
        }
      } else {
        mesh.position.set(...node.pos);
        mat.color.set(LAYER_COLORS[node.layer]);
        mat.emissive.set(LAYER_COLORS[node.layer]);
        mat.emissiveIntensity = 0.4;
      }

      // Section 3: Feature highlights
      if (s >= 0.5 && s <= 0.75) {
        const ft = (s - 0.5) / 0.25;
        const highlightMap: Record<number, string[]> = {
          0: ['a1', 'a2', 'a3'],
          1: ['s1', 's2'],
          2: ['b2'],
        };
        const third = Math.min(Math.floor(ft * 3), 2);
        const ids = highlightMap[third] || [];
        if (ids.includes(node.id)) {
          const pulse = 1.15 + Math.sin(ft * Math.PI * 6) * 0.1;
          mesh.scale.setScalar(pulse);
          mat.emissiveIntensity = 1.0;
        } else {
          mesh.scale.setScalar(1);
        }
      } else if (s < 0.2 || s > 0.5) {
        mesh.scale.setScalar(1);
      }
    });
  });

  const useFloatWrap = perfLevel === 'high';

  return (
    <group>
      {/* Nodes */}
      {NODES.map(node => {
        const color = LAYER_COLORS[node.layer];
        const inner = (
          <mesh
            key={node.id}
            position={node.pos}
            ref={(ref) => { if (ref) nodeRefs.current.set(node.id, ref); }}
          >
            <NodeGeometry type={node.geometry} />
            <meshStandardMaterial
              ref={(ref) => { if (ref) matRefs.current.set(node.id, ref); }}
              color={color}
              emissive={color}
              emissiveIntensity={0.4}
              metalness={0.4}
              roughness={0.5}
              transparent
              opacity={0.92}
            />
          </mesh>
        );

        return useFloatWrap ? (
          <Float key={node.id} speed={1.2 + Math.random() * 0.8} rotationIntensity={0.15} floatIntensity={0.3}>
            {inner}
            <GlowRing color={color} radius={0.9} />
          </Float>
        ) : (
          <group key={node.id}>
            {inner}
          </group>
        );
      })}

      {/* Connections */}
      {curves.map((c, i) => {
        const points = c.curve.getPoints(48);
        return (
          <group key={i}>
            <Line points={points} color={c.color} lineWidth={2} transparent opacity={0.35} />
            <FlowParticle curve={c.curve} color={c.color} speed={0.25} offset={0} />
            {perfLevel === 'high' && (
              <FlowParticle curve={c.curve} color={c.color} speed={0.25} offset={0.5} />
            )}
          </group>
        );
      })}
    </group>
  );
}
