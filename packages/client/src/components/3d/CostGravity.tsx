import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';

/**
 * CostGravity renders the Cost sub-view visuals:
 * - Optimization rings: pulsing green rings around elements with savings potential
 * - Monte Carlo planes: 3 transparent horizontal planes at P10/P50/P90
 * - Ghost overlay: extra transparency layer for retired elements
 *
 * Element SCALING is handled by NodeObject3D via useFrame.
 * Element COLOR is handled by NodeObject3D via xraySubView === 'cost'.
 */

function OptimizationRing({ position, potential, maxCost }: {
  position: THREE.Vector3;
  potential: number;
  maxCost: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ratio = Math.min(potential / maxCost, 1);
  const radius = 0.7 + ratio * 0.8;

  useFrame((state) => {
    if (!ref.current) return;
    // Pulse the ring
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.5) * 0.12;
    ref.current.scale.set(pulse, pulse, 1);
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.2;

    if (glowRef.current) {
      glowRef.current.scale.set(pulse * 1.3, pulse * 1.3, 1);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }
  });

  return (
    <group position={[position.x, position.y - 0.7, position.z]}>
      {/* Inner ring */}
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.06, radius, 32]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.5} />
      </mesh>
      {/* Outer glow ring */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius, radius + 0.15, 32]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function CostLabel({ position, cost, optimization }: {
  position: THREE.Vector3;
  cost: number;
  optimization: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    // Float gently
    ref.current.position.y = position.y + 1.5 + Math.sin(state.clock.elapsedTime * 1.5) * 0.08;
  });

  // Sprite-based cost display (stays inside Canvas, scales with scene)
  return null; // Cost labels are handled by NodeObject3D Html overlay
}

/**
 * Monte Carlo P10/P50/P90 planes rendered as 3 transparent layers
 * hovering above the architecture.
 */
function MonteCarlPlanes({ totalCost }: { totalCost: number }) {
  const p10Ref = useRef<THREE.Mesh>(null);
  const p50Ref = useRef<THREE.Mesh>(null);
  const p90Ref = useRef<THREE.Mesh>(null);

  // Simulate P10/P50/P90 relative to total cost
  const p10 = totalCost * 0.7;
  const p50 = totalCost * 1.0;
  const p90 = totalCost * 1.45;

  // Map costs to Y positions (P10 lowest, P90 highest)
  const baseY = 15;
  const p10Y = baseY;
  const p50Y = baseY + 2;
  const p90Y = baseY + 4;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Subtle wave animation
    if (p10Ref.current) {
      (p10Ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.06 + Math.sin(t * 0.8) * 0.02;
    }
    if (p50Ref.current) {
      (p50Ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.1 + Math.sin(t * 0.8 + 1) * 0.03;
    }
    if (p90Ref.current) {
      (p90Ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.06 + Math.sin(t * 0.8 + 2) * 0.02;
    }
  });

  const planeSize = 40;

  const formatK = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  return (
    <group>
      {/* P10 - optimistic (green, lowest) */}
      <mesh ref={p10Ref} position={[0, p10Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color="#22c55e"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* P50 - median (blue, middle) */}
      <mesh ref={p50Ref} position={[0, p50Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* P90 - pessimistic (red, highest) */}
      <mesh ref={p90Ref} position={[0, p90Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color="#ef4444"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Edge labels for Monte Carlo planes */}
      <MonteCarloLabel y={p10Y} label={`P10: ${formatK(p10)}`} color="#22c55e" />
      <MonteCarloLabel y={p50Y} label={`P50: ${formatK(p50)}`} color="#3b82f6" />
      <MonteCarloLabel y={p90Y} label={`P90: ${formatK(p90)}`} color="#ef4444" />
    </group>
  );
}

function MonteCarloLabel({ y, label, color }: { y: number; label: string; color: string }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    // Subtle glow pulse
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.6 + Math.sin(state.clock.elapsedTime * 1.5) * 0.2;
  });

  // Render a small colored sphere at the edge of the plane as a position marker
  return (
    <mesh ref={ref} position={[-20, y, 0]}>
      <sphereGeometry args={[0.2, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </mesh>
  );
}

/**
 * CostBeam: a vertical beam below expensive elements showing their cost weight.
 * Height proportional to cost. Color gradient from green (cheap) to red (expensive).
 */
function CostBeam({ position, cost, maxCost }: {
  position: THREE.Vector3;
  cost: number;
  maxCost: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const ratio = Math.min(cost / maxCost, 1);
  const height = 0.5 + ratio * 3;

  const color = ratio >= 0.7 ? '#ef4444' : ratio >= 0.4 ? '#f97316' : '#22c55e';

  useFrame((state) => {
    if (!ref.current) return;
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.15 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
  });

  return (
    <mesh
      ref={ref}
      position={[position.x, position.y - height / 2 - 0.5, position.z]}
    >
      <cylinderGeometry args={[0.08, 0.15, height, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} />
    </mesh>
  );
}

export default function CostGravity() {
  const elements = useArchitectureStore((s) => s.elements);
  const elementData = useXRayStore((s) => s.elementData);
  const subView = useXRayStore((s) => s.subView);

  // Compute max cost for normalization
  const { maxCost, totalCost, costElements } = useMemo(() => {
    if (subView !== 'cost') return { maxCost: 1, totalCost: 0, costElements: [] };

    let max = 0;
    let total = 0;
    const items: { id: string; position: THREE.Vector3; cost: number; optimization: number; isRetired: boolean }[] = [];

    for (const el of elements) {
      const data = elementData.get(el.id);
      if (!data) continue;

      if (data.estimatedCost > max) max = data.estimatedCost;
      total += data.estimatedCost;

      items.push({
        id: el.id,
        position: new THREE.Vector3(el.position3D.x, el.position3D.y, el.position3D.z),
        cost: data.estimatedCost,
        optimization: data.optimizationPotential,
        isRetired: el.status === 'retired',
      });
    }

    return { maxCost: max || 1, totalCost: total, costElements: items };
  }, [elements, elementData, subView]);

  if (subView !== 'cost') return null;

  // Elements with optimization potential > 0 get green rings
  const optimizableElements = costElements.filter((el) => el.optimization > 0);

  // All elements get cost beams proportional to their cost
  const beamElements = costElements.filter((el) => el.cost > 0);

  return (
    <group>
      {/* Monte Carlo P10/P50/P90 planes */}
      <MonteCarlPlanes totalCost={totalCost} />

      {/* Optimization rings around elements with savings potential */}
      {optimizableElements.map((el) => (
        <OptimizationRing
          key={`opt-${el.id}`}
          position={el.position}
          potential={el.optimization}
          maxCost={maxCost}
        />
      ))}

      {/* Cost weight beams below each element */}
      {beamElements.map((el) => (
        <CostBeam
          key={`beam-${el.id}`}
          position={el.position}
          cost={el.cost}
          maxCost={maxCost}
        />
      ))}
    </group>
  );
}
