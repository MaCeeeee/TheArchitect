import { useRef, useMemo, MutableRefObject } from 'react';
import { Float, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  SCROLL_ZONES, LAYER_COLORS, CONNECTION_COLORS,
  NODES, CONNECTIONS, getLayerEmphasis,
  type DemoNode,
} from './landing.constants';

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
function FlowParticle({ curve, color, speed, offset, scrollRef }: {
  curve: THREE.QuadraticBezierCurve3; color: string; speed: number; offset: number;
  scrollRef: MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    if (!ref.current || !matRef.current) return;
    const t = (state.clock.elapsedTime * speed + offset) % 1;
    const point = curve.getPoint(t);
    ref.current.position.copy(point);

    // Slow down in upload zone
    const s = scrollRef.current;
    const uploadStart = SCROLL_ZONES.UPLOAD[0];
    if (s > uploadStart) {
      matRef.current.opacity = 0.4;
    } else {
      matRef.current.opacity = 0.95;
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial ref={matRef} color={color} transparent opacity={0.95} />
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
      mid.y += 2.5; // Taller arc for bigger Y spread
      return { ...c, curve: new THREE.QuadraticBezierCurve3(start, mid, end), color: CONNECTION_COLORS[c.type] || '#6b7280' };
    }), [nodeMap]);

  // Scroll-driven layer isolation animation
  useFrame(() => {
    const s = scrollRef.current;

    NODES.forEach(node => {
      const mesh = nodeRefs.current.get(node.id);
      const mat = matRefs.current.get(node.id);
      if (!mesh || !mat) return;

      const { scale, opacity, emissive } = getLayerEmphasis(node.layer, s);
      const layerColor = new THREE.Color(LAYER_COLORS[node.layer]);

      // Smooth transitions via lerp
      mesh.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.08);
      mat.opacity += (opacity - mat.opacity) * 0.08;
      mat.emissiveIntensity += (emissive - mat.emissiveIntensity) * 0.08;
      mat.color.lerp(layerColor, 0.08);
      mat.emissive.lerp(layerColor, 0.08);

      // Keep node at its base position
      mesh.position.set(...node.pos);
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
            <FlowParticle curve={c.curve} color={c.color} speed={0.25} offset={0} scrollRef={scrollRef} />
            {perfLevel === 'high' && (
              <FlowParticle curve={c.curve} color={c.color} speed={0.25} offset={0.5} scrollRef={scrollRef} />
            )}
          </group>
        );
      })}
    </group>
  );
}

export { NODES, LAYER_COLORS } from './landing.constants';
