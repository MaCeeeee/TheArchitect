/**
 * ComplianceGlow — UC-ICM-003.1 3D Compliance Heat-Map (THE-281)
 *
 * Akt 1 der BSH-Demo. Färbt jedes Element nach seiner Compliance-Coverage:
 *   - Grün glow:  Element ist gut covered (≥2 high-confidence Mappings)
 *   - Gelb glow:  Element ist partial covered (≥1 Mapping mit ≥0.7)
 *   - Orange glow: Element ist weakly covered (Mappings nur < 0.7)
 *   - Rot glow:   Element hat KEINE Mappings (Gap)
 *
 * Pattern: CriticalityGlow (PulsingHalo + useFrame Animation).
 *
 * Toggle via useComplianceStore.showComplianceGlow.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useComplianceStore } from '../../stores/complianceStore';
import { useArchitectureStore } from '../../stores/architectureStore';

// ─── Coverage-Score Computation ────────────────────────────────
// We rank each element into 4 tiers based on:
//   - count of mappings
//   - max confidence across them
// Score formula keeps it simple + interpretable.
type CoverageTier = 'covered' | 'partial' | 'weak' | 'gap';

const TIER_COLORS: Record<CoverageTier, { color: string; pulseSpeedHz: number; baseScale: number }> = {
  covered: { color: '#22c55e', pulseSpeedHz: 1 / 3.0, baseScale: 1.4 }, // green, slow pulse
  partial: { color: '#eab308', pulseSpeedHz: 1 / 2.5, baseScale: 1.5 }, // yellow, medium pulse
  weak:    { color: '#f97316', pulseSpeedHz: 1 / 2.0, baseScale: 1.6 }, // orange, fast pulse
  gap:     { color: '#ef4444', pulseSpeedHz: 1 / 1.5, baseScale: 1.7 }, // red, urgent pulse
};

export function classifyCoverage(mappingCount: number, maxConfidence: number): CoverageTier {
  if (mappingCount === 0) return 'gap';
  if (mappingCount >= 2 && maxConfidence >= 0.9) return 'covered';
  if (mappingCount >= 1 && maxConfidence >= 0.7) return 'partial';
  return 'weak';
}

// ─── PulsingHalo (mirrors CriticalityGlow pattern) ─────────────
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
    <mesh ref={ref} position={position} renderOrder={-2}>
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

// ─── Main Component ─────────────────────────────────────────────
export function ComplianceGlow() {
  const showComplianceGlow = useComplianceStore((s) => s.showComplianceGlow);
  const mappingsByElement = useComplianceStore((s) => s.mappingsByElement);
  const loadAllMappings = useComplianceStore((s) => s.loadAllMappings);
  const elements = useArchitectureStore((s) => s.elements);
  const projectId = useArchitectureStore((s) => s.projectId);

  // Auto-load mappings when toggle is enabled and we don't have data yet
  useEffect(() => {
    if (!showComplianceGlow || !projectId) return;
    if (mappingsByElement.size === 0) {
      void loadAllMappings(projectId);
    }
  }, [showComplianceGlow, projectId, mappingsByElement.size, loadAllMappings]);

  const halos = useMemo(() => {
    if (!showComplianceGlow) return [];

    return elements
      .map((el) => {
        if (!el.position3D) return null;
        const mappings = mappingsByElement.get(el.id) ?? [];
        const maxConf = mappings.reduce((m, x) => Math.max(m, x.confidence), 0);
        const tier = classifyCoverage(mappings.length, maxConf);
        const { color, pulseSpeedHz, baseScale } = TIER_COLORS[tier];
        return {
          id: el.id,
          position: [el.position3D.x, el.position3D.y, el.position3D.z] as [number, number, number],
          color,
          pulseSpeedHz,
          baseScale,
          tier,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);
  }, [showComplianceGlow, elements, mappingsByElement]);

  if (!showComplianceGlow || halos.length === 0) return null;

  return (
    <group name="compliance-glow-layer">
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

export default ComplianceGlow;
