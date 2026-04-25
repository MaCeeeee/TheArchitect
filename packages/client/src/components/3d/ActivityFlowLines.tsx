import { useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Connection } from '../../stores/architectureStore';
import { isInSameRow, type PyramidPosition } from '../../utils/pyramidLayout';

interface ActivityFlowLinesProps {
  flows: Connection[];
  positionMap: Map<string, PyramidPosition>;
  indexMap: Map<string, number>;
}

const FLOW_COLOR = '#22c55e';
const FLOW_OPACITY = 0.85;
const ARROW_HEAD_LENGTH = 0.6;
const ARROW_HEAD_WIDTH = 0.3;

// Single moving particle along a polyline of points (precomputed total length).
function FlowParticle({
  points,
  speed,
  offset,
}: {
  points: THREE.Vector3[];
  speed: number;
  offset: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  // Precompute cumulative segment lengths for uniform-speed traversal.
  const cum = useMemo(() => {
    const arr: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      arr.push(arr[i - 1] + points[i].distanceTo(points[i - 1]));
    }
    return arr;
  }, [points]);
  const totalLen = cum[cum.length - 1] || 1;

  useFrame((state) => {
    if (!ref.current) return;
    const t = ((state.clock.elapsedTime * speed + offset) % 1) * totalLen;
    // Find segment containing arc-length t
    let i = 1;
    while (i < cum.length && cum[i] < t) i++;
    const a = points[i - 1];
    const b = points[Math.min(i, points.length - 1)];
    const segLen = cum[Math.min(i, cum.length - 1)] - cum[i - 1] || 1;
    const localT = (t - cum[i - 1]) / segLen;
    ref.current.position.lerpVectors(a, b, localT);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.12, 12, 12]} />
      <meshBasicMaterial color={FLOW_COLOR} transparent opacity={0.95} />
    </mesh>
  );
}

function ArrowHead({
  from,
  to,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
}) {
  // Cone pointing from `from` toward `to` placed near the target end of the line
  const direction = useMemo(() => to.clone().sub(from).normalize(), [from, to]);
  const headPosition = useMemo(
    () => to.clone().sub(direction.clone().multiplyScalar(ARROW_HEAD_LENGTH * 0.5)),
    [to, direction]
  );

  // Build quaternion that rotates default cone-up (+y) onto the direction vector
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    q.setFromUnitVectors(up, direction);
    return q;
  }, [direction]);

  return (
    <mesh position={headPosition.toArray()} quaternion={quaternion.toArray() as [number, number, number, number]}>
      <coneGeometry args={[ARROW_HEAD_WIDTH, ARROW_HEAD_LENGTH, 12]} />
      <meshStandardMaterial color={FLOW_COLOR} emissive={FLOW_COLOR} emissiveIntensity={0.5} />
    </mesh>
  );
}

export default function ActivityFlowLines({ flows, positionMap, indexMap }: ActivityFlowLinesProps) {
  const lines = useMemo(() => {
    return flows
      .map((flow) => {
        const start = positionMap.get(flow.sourceId);
        const end = positionMap.get(flow.targetId);
        if (!start || !end) return null;

        const sourceIdx = indexMap.get(flow.sourceId);
        const targetIdx = indexMap.get(flow.targetId);
        const sameRow =
          sourceIdx !== undefined &&
          targetIdx !== undefined &&
          isInSameRow(sourceIdx, targetIdx);

        const startV = new THREE.Vector3(start.x, start.y, start.z);
        const endV = new THREE.Vector3(end.x, end.y, end.z);

        let points: THREE.Vector3[];
        if (sameRow) {
          // straight horizontal line
          points = [startV, endV];
        } else {
          // bezier arc lifting over the gap between rows
          const mid = startV.clone().lerp(endV, 0.5);
          mid.y += 1.2;
          const curve = new THREE.QuadraticBezierCurve3(startV, mid, endV);
          points = curve.getPoints(24);
        }
        return { id: flow.id, points, startV, endV, sameRow };
      })
      .filter((x): x is { id: string; points: THREE.Vector3[]; startV: THREE.Vector3; endV: THREE.Vector3; sameRow: boolean } => Boolean(x));
  }, [flows, positionMap, indexMap]);

  return (
    <group>
      {lines.map((line, idx) => (
        <group key={line.id}>
          <Line
            points={line.points}
            color={FLOW_COLOR}
            lineWidth={2}
            transparent
            opacity={FLOW_OPACITY}
          />
          <ArrowHead
            from={line.points[line.points.length - 2] || line.startV}
            to={line.endV}
          />
          <FlowParticle
            points={line.points}
            speed={0.35}
            offset={(idx % 8) * 0.125}
          />
        </group>
      ))}
    </group>
  );
}
