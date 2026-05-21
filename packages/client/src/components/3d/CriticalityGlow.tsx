import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCriticalityStore } from '../../stores/criticalityStore';
import { useArchitectureStore } from '../../stores/architectureStore';

// Thresholds match the max-blend score model.
const TIER_CRITICAL = 60;
const TIER_HIGH = 40;
const TIER_MEDIUM = 25;

const colorForScore = (score: number): { color: string; pulseSpeedHz: number } => {
  if (score >= TIER_CRITICAL) return { color: '#ef4444', pulseSpeedHz: 1 / 1.5 };
  if (score >= TIER_HIGH) return { color: '#f97316', pulseSpeedHz: 1 / 2.0 };
  if (score >= TIER_MEDIUM) return { color: '#eab308', pulseSpeedHz: 1 / 3.0 };
  return { color: '#94a3b8', pulseSpeedHz: 0 };
};

interface HaloProps {
  position: [number, number, number];
  color: string;
  pulseSpeedHz: number;
  baseScale: number;
}

function PulsingHalo({ position, color, pulseSpeedHz, baseScale }: HaloProps) {
  const ref = useRef<THREE.Mesh>(null);
  const startTime = useRef<number>(performance.now());

  useFrame(() => {
    if (!ref.current) return;
    const elapsed = (performance.now() - startTime.current) / 1000;
    const wave = pulseSpeedHz > 0 ? 0.5 + 0.5 * Math.sin(elapsed * pulseSpeedHz * Math.PI * 2) : 0.8;
    const scale = baseScale * (1 + wave * 0.25);
    ref.current.scale.set(scale, scale, scale);
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.18 + wave * 0.22;
  });

  return (
    <mesh ref={ref} position={position} renderOrder={-1}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.3}
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export function CriticalityGlow() {
  const scores = useCriticalityStore((s) => s.scores);
  const showGlow = useCriticalityStore((s) => s.showGlow);
  const elements = useArchitectureStore((s) => s.elements);

  const halos = useMemo(() => {
    if (!showGlow) return [];
    return scores
      .filter((s) => s.totalScore >= TIER_MEDIUM)
      .slice(0, 10)
      .map((entry) => {
        const el = elements.find((e) => e.id === entry.elementId);
        if (!el?.position3D) return null;
        const { color, pulseSpeedHz } = colorForScore(entry.totalScore);
        const baseScale = 1.4 + (entry.totalScore - 50) / 100;
        return {
          id: entry.elementId,
          position: [el.position3D.x, el.position3D.y, el.position3D.z] as [number, number, number],
          color,
          pulseSpeedHz,
          baseScale,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
  }, [scores, elements, showGlow]);

  if (halos.length === 0) return null;

  return (
    <group name="criticality-glow-layer">
      {halos.map((h) => (
        <PulsingHalo
          key={h.id}
          position={h.position}
          color={h.color}
          pulseSpeedHz={h.pulseSpeedHz}
          baseScale={h.baseScale}
        />
      ))}
    </group>
  );
}

export default CriticalityGlow;
