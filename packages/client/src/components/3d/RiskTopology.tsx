import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';

/**
 * RiskTopology renders additional visual elements in Risk sub-view:
 * - Critical path beams (glowing white connections)
 * - Risk indicator rings below high-risk elements
 * - Pulsing danger aura on critical elements
 *
 * The actual element position displacement is handled in NodeObject3D
 * via the xrayStore data.
 */

function CriticalPathBeam({ start, end }: { start: THREE.Vector3; end: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);
  const particleRef = useRef<THREE.Mesh>(null);

  const curve = useMemo(() => {
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 2;
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [start, end]);

  const points = useMemo(() => curve.getPoints(48), [curve]);

  useFrame((state) => {
    if (!particleRef.current) return;
    const t = (state.clock.elapsedTime * 0.4) % 1;
    const point = curve.getPoint(t);
    particleRef.current.position.copy(point);
  });

  return (
    <group>
      {/* Main beam line */}
      <Line
        points={points}
        color="#ffffff"
        lineWidth={3}
        transparent
        opacity={0.8}
      />
      {/* Glow line underneath */}
      <Line
        points={points}
        color="#ef4444"
        lineWidth={6}
        transparent
        opacity={0.2}
      />
      {/* Traveling particle */}
      <mesh ref={particleRef}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function DangerAura({ position, riskScore }: { position: THREE.Vector3; riskScore: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const intensity = Math.min(riskScore / 10, 1);

  useFrame((state) => {
    if (!ref.current) return;
    const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.15 * intensity;
    ref.current.scale.set(scale, scale, scale);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(state.clock.elapsedTime * 2) * 0.08;
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[1.2 + intensity * 0.5, 16, 16]} />
      <meshBasicMaterial
        color={riskScore >= 8 ? '#ef4444' : '#f97316'}
        transparent
        opacity={0.15}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function RiskRing({ position, riskScore }: { position: THREE.Vector3; riskScore: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.5;
  });

  const color = riskScore >= 8 ? '#ef4444' : riskScore >= 6 ? '#f97316' : '#eab308';
  const radius = 0.8 + (riskScore / 10) * 0.4;

  return (
    <mesh ref={ref} position={[position.x, position.y - 0.6, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.08, radius, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </mesh>
  );
}

export default function RiskTopology() {
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const elementData = useXRayStore((s) => s.elementData);
  const criticalPath = useXRayStore((s) => s.criticalPath);
  const subView = useXRayStore((s) => s.subView);
  const xrayPositions = useXRayStore((s) => s.xrayPositions);

  const elementMap = useMemo(() => {
    const map = new Map<string, (typeof elements)[0]>();
    for (const el of elements) map.set(el.id, el);
    return map;
  }, [elements]);

  /**
   * Resolve the actual rendered position of an element. In X-Ray mode the
   * NodeObject3D component renders elements at xrayPositions[id] (sorted by
   * the active subView's metric, with overflow rows stacked along Z). The
   * critical-path beam must follow the same coordinate system — otherwise it
   * zigzags through empty space because computePositions has reordered the
   * elements onto a 1D scale per layer while the original position3D still
   * reflects the user's manual layout.
   */
  const renderPos = (el: { id: string; position3D: { x: number; y: number; z: number } }) => {
    const xp = xrayPositions.get(el.id);
    if (xp) return { x: xp.x, y: xp.y, z: xp.z };
    return { x: el.position3D.x, y: el.position3D.y, z: el.position3D.z };
  };

  // Critical path beam segments
  const criticalPathSegments = useMemo(() => {
    if (subView !== 'risk') return [];
    const segments: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    for (let i = 0; i < criticalPath.length - 1; i++) {
      const sourceEl = elementMap.get(criticalPath[i]);
      const targetEl = elementMap.get(criticalPath[i + 1]);
      if (!sourceEl || !targetEl) continue;

      const sourceData = elementData.get(sourceEl.id);
      const targetData = elementData.get(targetEl.id);

      // Apply risk displacement to beam positions
      const sourceDisplacement = sourceData ? -(sourceData.riskScore / 10) * 2 : 0;
      const targetDisplacement = targetData ? -(targetData.riskScore / 10) * 2 : 0;

      const sp = renderPos(sourceEl);
      const tp = renderPos(targetEl);
      segments.push({
        start: new THREE.Vector3(sp.x, sp.y + sourceDisplacement, sp.z),
        end:   new THREE.Vector3(tp.x, tp.y + targetDisplacement, tp.z),
      });
    }
    return segments;
  }, [criticalPath, elementMap, elementData, subView, xrayPositions]);

  // High-risk elements for auras and rings
  const highRiskElements = useMemo(() => {
    if (subView !== 'risk') return [];
    return elements
      .filter((el) => {
        const data = elementData.get(el.id);
        return data && data.riskScore >= 5;
      })
      .map((el) => {
        const data = elementData.get(el.id)!;
        const displacement = -(data.riskScore / 10) * 2;
        const p = renderPos(el);
        return {
          id: el.id,
          position: new THREE.Vector3(p.x, p.y + displacement, p.z),
          riskScore: data.riskScore,
        };
      });
  }, [elements, elementData, subView, xrayPositions]);

  if (subView !== 'risk') return null;

  return (
    <group>
      {/* Critical path beams */}
      {criticalPathSegments.map((seg, i) => (
        <CriticalPathBeam key={`cp-${i}`} start={seg.start} end={seg.end} />
      ))}

      {/* Risk auras for critical/high risk elements */}
      {highRiskElements
        .filter((el) => el.riskScore >= 7)
        .map((el) => (
          <DangerAura key={`aura-${el.id}`} position={el.position} riskScore={el.riskScore} />
        ))}

      {/* Risk rings for medium+ risk */}
      {highRiskElements.map((el) => (
        <RiskRing key={`ring-${el.id}`} position={el.position} riskScore={el.riskScore} />
      ))}
    </group>
  );
}
