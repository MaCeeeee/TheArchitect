import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useActivityViewStore } from '../../stores/activityViewStore';
import ActivityNode from './ActivityNode';
import ActivityFlowLines from './ActivityFlowLines';
import { layoutLinear, Y_APEX } from '../../utils/pyramidLayout';

const APEX_COLOR = '#22c55e';
const COMPOSITION_COLOR = '#1e3a1e';
const FLOOR_COLOR = '#0a1f0a';

export default function ActivityScene() {
  const current = useActivityViewStore((s) => s.current());
  const stack = useActivityViewStore((s) => s.stack);

  const layout = useMemo(() => {
    if (!current) return null;
    return layoutLinear(current.activities.length);
  }, [current]);

  const positionMap = useMemo(() => {
    if (!current || !layout) return new Map();
    const map = new Map<string, { x: number; y: number; z: number }>();
    current.activities.forEach((a, i) => {
      const pos = layout.positions[i];
      if (pos) map.set(a.id, pos);
    });
    return map;
  }, [current, layout]);

  const indexMap = useMemo(() => {
    if (!current) return new Map<string, number>();
    const map = new Map<string, number>();
    current.activities.forEach((a, i) => map.set(a.id, i));
    return map;
  }, [current]);

  const compositionPoints = useMemo(() => {
    if (!current || !layout) return [];
    return layout.positions.map((pos) => [
      new THREE.Vector3(0, Y_APEX, 0),
      new THREE.Vector3(pos.x, pos.y + 0.5, pos.z),
    ]);
  }, [current, layout]);

  // Floor disc — diameter scales with pyramid base
  const floorRadius = useMemo(() => {
    if (!layout) return 6;
    return Math.max(6, layout.width / 2 + layout.depth / 2 + 2);
  }, [layout]);

  if (!current || !layout) return null;

  return (
    <group>
      {/* Ambient + fill light tuned for green pyramid */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 20, 10]} intensity={0.6} color="#ffffff" />
      <pointLight position={[0, Y_APEX, 0]} intensity={1.6} color={APEX_COLOR} distance={28} />

      {/* Floor disc beneath the pyramid */}
      <mesh position={[0, 7.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[floorRadius, 64]} />
        <meshStandardMaterial color={FLOOR_COLOR} transparent opacity={0.55} />
      </mesh>

      {/* Process apex — leuchtende Bühne */}
      <group position={[0, Y_APEX, 0]}>
        <mesh>
          <cylinderGeometry args={[1.8, 1.8, 2.5, 48]} />
          <meshStandardMaterial
            color={APEX_COLOR}
            emissive={APEX_COLOR}
            emissiveIntensity={0.55}
            metalness={0.4}
            roughness={0.3}
          />
        </mesh>
        <Html
          position={[0, 1.8, 0]}
          center
          distanceFactor={12}
          zIndexRange={[0, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(10,10,10,0.92)',
              border: `1px solid ${APEX_COLOR}`,
              color: APEX_COLOR,
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: '13px',
              fontFamily: 'monospace',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              transform: 'translateX(-50%)',
            }}
          >
            {current.processName}
          </div>
        </Html>
      </group>

      {/* Composition lines — apex → each activity → bilden Pyramidenflanken */}
      <group>
        {compositionPoints.map((pts, i) => (
          <Line
            key={`comp-${i}`}
            points={pts}
            color={COMPOSITION_COLOR}
            lineWidth={1}
            transparent
            opacity={0.55}
          />
        ))}
      </group>

      {/* Activities — BPMN-linear row(s) */}
      <group>
        {current.activities.map((activity, i) => {
          const pos = layout.positions[i];
          if (!pos) return null;
          return (
            <ActivityNode
              key={activity.id}
              activity={activity}
              position={pos}
              index={i}
              totalCount={current.activities.length}
            />
          );
        })}
      </group>

      {/* Flow lines — sequential L→R, bezier on row transitions */}
      <ActivityFlowLines flows={current.flows} positionMap={positionMap} indexMap={indexMap} />

      {/* Stack-depth indicator (Phase 9 stretch) — draws dim outline of parent frames */}
      {stack.length > 1 && (
        <group position={[0, Y_APEX + 4, 0]}>
          <Html center distanceFactor={14} style={{ pointerEvents: 'none' }}>
            <div style={{ color: '#86efac', fontSize: 10, fontFamily: 'monospace', opacity: 0.7 }}>
              Drill-Depth: {stack.length}
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}
