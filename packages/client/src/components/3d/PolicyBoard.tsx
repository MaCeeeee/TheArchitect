import { useRef, useState, useMemo, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useUIStore } from '../../stores/uiStore';

interface PolicyBar {
  elementId: string;
  policyId: string;
  name: string;
  source: string;
  violations: number;
  row: number;
  col: number;
}

const SOURCE_ORDER = ['dora', 'nis2', 'togaf', 'custom'] as const;
const SOURCE_LABELS: Record<string, string> = {
  dora: 'DORA',
  nis2: 'NIS2',
  togaf: 'TOGAF',
  custom: 'Custom',
  archimate: 'ArchiMate',
  iso27001: 'ISO 27001',
};

const CELL_SIZE = 1.2;
const BAR_SIZE = 0.8;
const MAX_BAR_HEIGHT = 4;
const MIN_BAR_HEIGHT = 0.15;
// Positioned on the motivation layer (y=16), upper-left corner of the layer plane
const BOARD_POSITION: [number, number, number] = [-14, 16.05, -12];

const colorGreen = new THREE.Color('#22c55e');
const colorRed = new THREE.Color('#ef4444');
const tmpColor = new THREE.Color();

export default function PolicyBoard() {
  const elements = useArchitectureStore((s) => s.elements);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const violationsByPolicy = useComplianceStore((s) => s.violationsByPolicy);
  const showPolicyBoard = useUIStore((s) => s.showPolicyBoard);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Only render when motivation layer is visible and toggle is on
  if (!showPolicyBoard || !visibleLayers.has('motivation')) return null;

  // Build policy bars data
  const policyElements = elements.filter((el) => el.metadata?.isPolicyNode);

  // Group by source, then position in grid
  const sourceGroups = new Map<string, typeof policyElements>();
  for (const el of policyElements) {
    const source = (el.metadata?.source as string) || 'custom';
    const normalized = SOURCE_ORDER.includes(source as typeof SOURCE_ORDER[number])
      ? source
      : 'custom';
    if (!sourceGroups.has(normalized)) sourceGroups.set(normalized, []);
    sourceGroups.get(normalized)!.push(el);
  }

  const bars: PolicyBar[] = [];
  let rowIndex = 0;
  const rowLabels: { label: string; row: number }[] = [];

  for (const source of SOURCE_ORDER) {
    const group = sourceGroups.get(source);
    if (!group || group.length === 0) continue;
    rowLabels.push({ label: SOURCE_LABELS[source] || source, row: rowIndex });
    group.forEach((el, colIndex) => {
      const policyId = el.metadata?.policyId as string;
      bars.push({
        elementId: el.id,
        policyId,
        name: el.name,
        source,
        violations: policyId ? (violationsByPolicy.get(policyId) ?? 0) : 0,
        row: rowIndex,
        col: colIndex,
      });
    });
    rowIndex++;
  }

  if (bars.length === 0) return null;

  const maxViolations = Math.max(1, ...bars.map((b) => b.violations));
  const maxCols = Math.max(...bars.map((b) => b.col)) + 1;

  // Board dimensions for base plate
  const boardWidth = maxCols * CELL_SIZE + 1;
  const boardDepth = rowIndex * CELL_SIZE + 1;

  return (
    <group position={BOARD_POSITION}>
      {/* Base plate */}
      <mesh position={[boardWidth / 2 - 0.5, -0.02, boardDepth / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[boardWidth, boardDepth]} />
        <meshStandardMaterial color="#0a0a0a" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Title label */}
      <Html
        position={[boardWidth / 2 - 0.5, 0.3, -0.8]}
        center
        distanceFactor={20}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          color: '#a78bfa',
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          whiteSpace: 'nowrap',
          textShadow: '0 0 8px rgba(167,139,250,0.4)',
        }}>
          Policy Compliance
        </div>
      </Html>

      {/* Row labels */}
      {rowLabels.map(({ label, row }) => (
        <Html
          key={`label-${row}`}
          position={[-1.2, 0.1, row * CELL_SIZE]}
          center
          distanceFactor={20}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            color: '#94a3b8',
            fontSize: '9px',
            fontWeight: 600,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            textShadow: '0 0 4px rgba(0,0,0,0.8)',
          }}>
            {label}
          </div>
        </Html>
      ))}

      {/* Policy bars */}
      {bars.map((bar) => (
        <PolicyBarMesh
          key={bar.elementId}
          bar={bar}
          maxViolations={maxViolations}
          isHovered={hoveredId === bar.elementId}
          onHover={setHoveredId}
          onSelect={selectElement}
        />
      ))}
    </group>
  );
}

function PolicyBarMesh({
  bar,
  maxViolations,
  isHovered,
  onHover,
  onSelect,
}: {
  bar: PolicyBar;
  maxViolations: number;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const t = bar.violations / maxViolations;
  const barHeight = Math.min(MAX_BAR_HEIGHT, Math.max(MIN_BAR_HEIGHT, bar.violations * 0.4));
  const barColor = useMemo(() => tmpColor.copy(colorGreen).lerp(colorRed, t).getHexString(), [t]);

  const x = bar.col * CELL_SIZE;
  const z = bar.row * CELL_SIZE;

  // Breathing animation for bars with violations
  useFrame((state) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (bar.violations > 0) {
      mat.emissiveIntensity = 0.3 + Math.sin(state.clock.elapsedTime * 2) * 0.15;
    }
    if (isHovered) {
      mat.opacity = 0.95;
    } else {
      mat.opacity = 0.85;
    }
  });

  const handlePointerOver = useCallback((e: THREE.Event) => {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    onHover(bar.elementId);
    document.body.style.cursor = 'pointer';
  }, [bar.elementId, onHover]);

  const handlePointerOut = useCallback(() => {
    onHover(null);
    document.body.style.cursor = 'auto';
  }, [onHover]);

  const handleClick = useCallback((e: THREE.Event) => {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    onSelect(bar.elementId);
  }, [bar.elementId, onSelect]);

  return (
    <group position={[x, 0, z]}>
      <mesh
        ref={meshRef}
        position={[0, barHeight / 2, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[BAR_SIZE, barHeight, BAR_SIZE]} />
        <meshStandardMaterial
          color={`#${barColor}`}
          metalness={0.1}
          roughness={0.2}
          transparent
          opacity={0.85}
          emissive={`#${barColor}`}
          emissiveIntensity={bar.violations > 0 ? 0.3 : 0.05}
        />
      </mesh>

      {/* Hover tooltip */}
      {isHovered && (
        <Html
          position={[0, barHeight + 0.5, 0]}
          center
          distanceFactor={15}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(10,10,10,0.95)',
            border: '1px solid rgba(167,139,250,0.3)',
            borderRadius: '6px',
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ color: '#e2e8f0', fontSize: '11px', fontWeight: 600, marginBottom: '2px' }}>
              {bar.name}
            </div>
            <div style={{ display: 'flex', gap: '8px', fontSize: '9px' }}>
              <span style={{ color: '#94a3b8' }}>{SOURCE_LABELS[bar.source] || bar.source}</span>
              <span style={{ color: bar.violations > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
                {bar.violations} violation{bar.violations !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
