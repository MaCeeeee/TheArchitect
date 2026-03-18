import { useRef, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';

const CONNECTION_COLORS: Record<string, string> = {
  depends_on: '#ef4444',
  connects_to: '#3b82f6',
  belongs_to: '#22c55e',
  implements: '#f97316',
  data_flow: '#06b6d4',
  triggers: '#eab308',
  uses: '#00ff41',
  produces: '#06b6d4',
  runs_on: '#00ff41',
  stored_in: '#3b82f6',
  integrates: '#f59e0b',
  orchestrated_by: '#ec4899',
  cross_architecture: '#fbbf24',
};

function FlowParticle({ curve, color, speed, offset }: {
  curve: THREE.QuadraticBezierCurve3;
  color: string;
  speed: number;
  offset: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = ((state.clock.elapsedTime * speed + offset) % 1);
    const point = curve.getPoint(t);
    ref.current.position.copy(point);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

function CrossArchitectureLine({ points, color, lineWidth, opacity }: {
  points: THREE.Vector3[];
  color: string;
  lineWidth: number;
  opacity: number;
}) {
  // Render every other segment for a dashed effect
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

export default function ConnectionLines() {
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const selectedConnectionId = useArchitectureStore((s) => s.selectedConnectionId);
  const selectedElementId = useArchitectureStore((s) => s.selectedElementId);

  const isXRayActive = useXRayStore((s) => s.isActive);
  const xraySubView = useXRayStore((s) => s.subView);
  const xrayElementData = useXRayStore((s) => s.elementData);
  const criticalPath = useXRayStore((s) => s.criticalPath);

  const criticalPathSet = useMemo(() => new Set(criticalPath), [criticalPath]);

  const elementMap = useMemo(() => {
    const map = new Map<string, (typeof elements)[0]>();
    for (const el of elements) map.set(el.id, el);
    return map;
  }, [elements]);

  const visibleConnections = useMemo(() => {
    return connections.filter((conn) => {
      const source = elementMap.get(conn.sourceId);
      const target = elementMap.get(conn.targetId);
      if (!source || !target) return false;
      return visibleLayers.has(source.layer) && visibleLayers.has(target.layer);
    });
  }, [connections, elementMap, visibleLayers]);

  return (
    <group>
      {visibleConnections.map((conn) => {
        const source = elementMap.get(conn.sourceId)!;
        const target = elementMap.get(conn.targetId)!;
        const isSelected = selectedConnectionId === conn.id;
        const isHighlighted =
          selectedElementId === conn.sourceId || selectedElementId === conn.targetId;
        const connColor = CONNECTION_COLORS[conn.type] || '#4a5a4a';

        // Apply X-Ray risk displacement to connection endpoints
        let sourceYOffset = 0;
        let targetYOffset = 0;
        if (isXRayActive && xraySubView === 'risk') {
          const sourceData = xrayElementData.get(source.id);
          const targetData = xrayElementData.get(target.id);
          if (sourceData) sourceYOffset = -(sourceData.riskScore / 10) * 2;
          if (targetData) targetYOffset = -(targetData.riskScore / 10) * 2;
        }

        const start = new THREE.Vector3(
          source.position3D.x, source.position3D.y + sourceYOffset, source.position3D.z
        );
        const end = new THREE.Vector3(
          target.position3D.x, target.position3D.y + targetYOffset, target.position3D.z
        );

        const isCrossArchitecture = conn.type === 'cross_architecture';

        const mid = start.clone().lerp(end, 0.5);
        mid.y += isCrossArchitecture ? 4 : 1.5;

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const points = curve.getPoints(32);

        // X-Ray mode: connections between high-risk elements are brighter and thicker
        let lineColor: string;
        let lineWidth: number;
        let opacity: number;
        let showParticles: boolean;

        if (isXRayActive && xraySubView === 'risk') {
          const sourceData = xrayElementData.get(source.id);
          const targetData = xrayElementData.get(target.id);
          const avgRisk = ((sourceData?.riskScore || 0) + (targetData?.riskScore || 0)) / 2;

          const isCriticalConn = criticalPathSet.has(source.id) && criticalPathSet.has(target.id);
          if (isCriticalConn) {
            lineColor = '#ffffff';
            lineWidth = 0.5;
            opacity = 0.1;
            showParticles = false;
          } else if (avgRisk >= 6) {
            lineColor = '#ef4444';
            lineWidth = 2.5;
            opacity = 0.6;
            showParticles = true;
          } else if (avgRisk >= 4) {
            lineColor = '#f97316';
            lineWidth = 1.5;
            opacity = 0.4;
            showParticles = false;
          } else {
            lineColor = '#1a2a1a';
            lineWidth = 0.8;
            opacity = 0.15;
            showParticles = false;
          }
        } else if (isXRayActive && xraySubView === 'cost') {
          const sourceData = xrayElementData.get(source.id);
          const targetData = xrayElementData.get(target.id);
          const avgCost = ((sourceData?.estimatedCost || 0) + (targetData?.estimatedCost || 0)) / 2;

          // Connections between expensive elements are highlighted
          if (avgCost >= 50000) {
            lineColor = '#ef4444';
            lineWidth = 2.5;
            opacity = 0.5;
            showParticles = true;
          } else if (avgCost >= 25000) {
            lineColor = '#f97316';
            lineWidth = 1.8;
            opacity = 0.35;
            showParticles = false;
          } else if (avgCost >= 10000) {
            lineColor = '#3b82f6';
            lineWidth = 1.2;
            opacity = 0.25;
            showParticles = false;
          } else {
            lineColor = '#1a2a1a';
            lineWidth = 0.6;
            opacity = 0.1;
            showParticles = false;
          }

          // Connections involving optimization targets get green tint
          const hasOptimization = (sourceData?.optimizationPotential || 0) > 0
            || (targetData?.optimizationPotential || 0) > 0;
          if (hasOptimization) {
            lineColor = '#22c55e';
            opacity = Math.max(opacity, 0.3);
          }
        } else if (isCrossArchitecture) {
          lineColor = '#fbbf24';
          lineWidth = isSelected ? 3 : 2;
          opacity = isSelected ? 1 : 0.6;
          showParticles = true;
        } else {
          lineColor = isSelected ? '#ffffff' : isHighlighted ? connColor : '#4a5a4a';
          lineWidth = isSelected ? 3 : isHighlighted ? 2 : 1.5;
          opacity = isSelected ? 1 : isHighlighted ? 0.8 : 0.4;
          showParticles = isHighlighted || isSelected;
        }

        return (
          <group key={conn.id}>
            {isCrossArchitecture ? (
              <CrossArchitectureLine points={points} color={lineColor} lineWidth={lineWidth} opacity={opacity} />
            ) : (
              <Line
                points={points}
                color={lineColor}
                lineWidth={lineWidth}
                transparent
                opacity={opacity}
              />
            )}
            {showParticles && (
              <>
                <FlowParticle curve={curve} color={isXRayActive ? lineColor : connColor} speed={isCrossArchitecture ? 0.2 : isXRayActive ? 0.5 : 0.3} offset={0} />
                <FlowParticle curve={curve} color={isXRayActive ? lineColor : connColor} speed={isCrossArchitecture ? 0.2 : isXRayActive ? 0.5 : 0.3} offset={0.5} />
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}
