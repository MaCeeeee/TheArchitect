import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import type { PlateauSnapshot, CrossPlateauDependency } from '@thearchitect/shared';

// ─── Constants ───

const WORKSPACE_GAP = 40;
const CROSS_PLATEAU_COLOR = '#fbbf24';
const CROSS_PLATEAU_ARC_HEIGHT = 6;
const INTRA_ARC_HEIGHT = 1.5;

// ─── Dashed Line (cross-plateau) ───

function DashedLine({ points, color, lineWidth, opacity }: {
  points: THREE.Vector3[];
  color: string;
  lineWidth: number;
  opacity: number;
}) {
  const segments: THREE.Vector3[][] = [];
  for (let i = 0; i < points.length - 1; i += 2) {
    const seg = [points[i]];
    if (i + 1 < points.length) seg.push(points[i + 1]);
    if (seg.length === 2) segments.push(seg);
  }

  return (
    <group>
      {segments.map((seg, i) => (
        <Line
          key={i}
          points={seg}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={opacity}
        />
      ))}
    </group>
  );
}

// ─── Intra-Plateau Connections ───

function IntraPlateauLines({ snapshot, offsetX }: {
  snapshot: PlateauSnapshot;
  offsetX: number;
}) {
  const connections = useArchitectureStore((s) => s.connections);

  const lines = useMemo(() => {
    const changedSet = new Set(snapshot.changedElementIds);
    const result: {
      id: string;
      points: THREE.Vector3[];
      opacity: number;
    }[] = [];

    for (const conn of connections) {
      const sourceState = snapshot.elements[conn.sourceId];
      const targetState = snapshot.elements[conn.targetId];
      if (!sourceState || !targetState) continue;

      // Check if either endpoint is changed in this plateau
      const hasChangedEndpoint = changedSet.has(conn.sourceId) || changedSet.has(conn.targetId);
      const opacity = hasChangedEndpoint ? 0.4 : 0.15;

      const start = new THREE.Vector3(
        sourceState.position3D.x + offsetX,
        sourceState.position3D.y,
        sourceState.position3D.z,
      );
      const end = new THREE.Vector3(
        targetState.position3D.x + offsetX,
        targetState.position3D.y,
        targetState.position3D.z,
      );

      const mid = start.clone().lerp(end, 0.5);
      mid.y += INTRA_ARC_HEIGHT;

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      result.push({ id: conn.id, points: curve.getPoints(24), opacity });
    }

    return result;
  }, [connections, snapshot, offsetX]);

  return (
    <group>
      {lines.map((line) => (
        <Line
          key={line.id}
          points={line.points}
          color="#4a5a4a"
          lineWidth={1}
          transparent
          opacity={line.opacity}
        />
      ))}
    </group>
  );
}

// ─── Cross-Plateau Dependency Lines ───

function CrossPlateauLines({ deps, snapshots }: {
  deps: CrossPlateauDependency[];
  snapshots: PlateauSnapshot[];
}) {
  const lines = useMemo(() => {
    return deps.map((dep, i) => {
      const sourceSnapshot = snapshots[dep.sourcePlateauIndex];
      const targetSnapshot = snapshots[dep.targetPlateauIndex];
      if (!sourceSnapshot || !targetSnapshot) return null;

      const sourceEl = sourceSnapshot.elements[dep.sourceElementId];
      const targetEl = targetSnapshot.elements[dep.targetElementId];
      if (!sourceEl || !targetEl) return null;

      const sourceOffsetX = dep.sourcePlateauIndex * WORKSPACE_GAP;
      const targetOffsetX = dep.targetPlateauIndex * WORKSPACE_GAP;

      const start = new THREE.Vector3(
        sourceEl.position3D.x + sourceOffsetX,
        sourceEl.position3D.y,
        sourceEl.position3D.z,
      );
      const end = new THREE.Vector3(
        targetEl.position3D.x + targetOffsetX,
        targetEl.position3D.y,
        targetEl.position3D.z,
      );

      const mid = start.clone().lerp(end, 0.5);
      mid.y += CROSS_PLATEAU_ARC_HEIGHT;

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      return { key: `cross-${i}`, points: curve.getPoints(48) };
    }).filter(Boolean) as { key: string; points: THREE.Vector3[] }[];
  }, [deps, snapshots]);

  return (
    <group>
      {lines.map((line) => (
        <DashedLine
          key={line.key}
          points={line.points}
          color={CROSS_PLATEAU_COLOR}
          lineWidth={2}
          opacity={0.6}
        />
      ))}
    </group>
  );
}

// ─── Main Component ───

export default function PlateauConnectionLines() {
  const plateauSnapshots = useRoadmapStore((s) => s.plateauSnapshots);
  const crossPlateauDeps = useRoadmapStore((s) => s.crossPlateauDeps);
  const selectedPlateauIndex = useRoadmapStore((s) => s.selectedPlateauIndex);

  // Only render intra-plateau lines for selected ±1 (LOD)
  const visibleIndices = useMemo(() => {
    if (selectedPlateauIndex === null) return new Set<number>();
    const set = new Set<number>();
    set.add(selectedPlateauIndex);
    if (selectedPlateauIndex > 0) set.add(selectedPlateauIndex - 1);
    if (selectedPlateauIndex < plateauSnapshots.length - 1) set.add(selectedPlateauIndex + 1);
    return set;
  }, [selectedPlateauIndex, plateauSnapshots.length]);

  return (
    <group>
      {/* Intra-plateau connections (selected ±1 only) */}
      {plateauSnapshots.map((snapshot, i) => {
        if (!visibleIndices.has(i)) return null;
        return (
          <IntraPlateauLines
            key={`intra-${i}`}
            snapshot={snapshot}
            offsetX={i * WORKSPACE_GAP}
          />
        );
      })}

      {/* Cross-plateau dependency lines */}
      <CrossPlateauLines deps={crossPlateauDeps} snapshots={plateauSnapshots} />
    </group>
  );
}
