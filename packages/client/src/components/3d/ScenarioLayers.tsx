import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';

/**
 * ScenarioLayers renders a 3D overlay showing two scenarios as translucent planes.
 * - Scenario A plane (blue, lower)
 * - Scenario B plane (cyan, upper)
 * - Differing elements highlighted with connecting delta lines
 * - Color-coded by cost delta (green = cheaper, red = more expensive)
 */

export default function ScenarioLayers() {
  const comparisonResult = useScenarioStore((s) => s.comparisonResult);
  const elements = useArchitectureStore((s) => s.elements);
  const elementData = useXRayStore((s) => s.elementData);

  if (!comparisonResult) return null;

  return (
    <group>
      {/* Scenario A plane (lower) */}
      <ScenarioPlane
        y={-2}
        color="#3b82f6"
        label={comparisonResult.scenarioA.name}
        cost={comparisonResult.scenarioA.totalCost}
      />
      {/* Scenario B plane (upper) */}
      <ScenarioPlane
        y={2}
        color="#06b6d4"
        label={comparisonResult.scenarioB.name}
        cost={comparisonResult.scenarioB.totalCost}
      />

      {/* Cost delta indicator */}
      <DeltaColumn
        costDelta={comparisonResult.costDelta}
        costDeltaPercent={comparisonResult.costDeltaPercent}
      />

      {/* Dimension delta beams */}
      {Object.entries(comparisonResult.dimensionDeltas)
        .filter(([, v]) => v !== 0)
        .map(([key, value], i) => (
          <DimensionBeam
            key={key}
            index={i}
            total={Object.keys(comparisonResult.dimensionDeltas).length}
            value={value}
            maxValue={Math.max(...Object.values(comparisonResult.dimensionDeltas).map(Math.abs), 1)}
          />
        ))}
    </group>
  );
}

function ScenarioPlane({ y, color, label, cost }: {
  y: number; color: string; label: string; cost: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.08 + Math.sin(state.clock.elapsedTime * 0.8 + y) * 0.03;
  });

  return (
    <group position={[0, y, 0]}>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Edge glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[14.5, 15, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function DeltaColumn({ costDelta, costDeltaPercent }: {
  costDelta: number; costDeltaPercent: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const isPositive = costDelta > 0;
  const color = isPositive ? '#ef4444' : '#22c55e';
  const height = Math.min(Math.abs(costDeltaPercent) / 10, 4); // scale to max 4 units

  useFrame((state) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    ref.current.scale.set(pulse, 1, pulse);
    (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh ref={ref} position={[0, isPositive ? height / 2 : -height / 2, 0]}>
        <cylinderGeometry args={[0.3, 0.3, height || 0.1, 16]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.6}
          emissive={color}
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Arrow indicator */}
      <mesh position={[0, isPositive ? height + 0.3 : -(height + 0.3), 0]}>
        <coneGeometry args={[0.4, 0.6, 8]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.8}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

function DimensionBeam({ index, total, value, maxValue }: {
  index: number; total: number; value: number; maxValue: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const isPositive = value > 0;
  const color = isPositive ? '#ef4444' : '#22c55e';
  const normalizedHeight = (Math.abs(value) / maxValue) * 3;

  // Distribute beams in a ring around center
  const angle = (index / total) * Math.PI * 2;
  const radius = 6;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  useFrame((state) => {
    if (!ref.current) return;
    (ref.current.material as THREE.MeshBasicMaterial).opacity =
      0.3 + Math.sin(state.clock.elapsedTime * 1.5 + index) * 0.15;
  });

  return (
    <mesh
      ref={ref}
      position={[x, isPositive ? normalizedHeight / 2 : -normalizedHeight / 2, z]}
    >
      <boxGeometry args={[0.4, normalizedHeight || 0.1, 0.4]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </mesh>
  );
}
