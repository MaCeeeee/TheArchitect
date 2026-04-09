import { useRef, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import { useXRayStore } from '../../stores/xrayStore';
import { useViewPositions } from '../../hooks/useViewPositions';

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

  const viewMode = useUIStore((s) => s.viewMode);
  const focusedLayer = useUIStore((s) => s.focusedLayer);
  const is2DMode = viewMode !== '3d';
  const isLayerMode = viewMode === 'layer';

  const isXRayActive = useXRayStore((s) => s.isActive);
  const xraySubView = useXRayStore((s) => s.subView);
  const xrayElementData = useXRayStore((s) => s.elementData);
  const criticalPath = useXRayStore((s) => s.criticalPath);
  const xrayPositions = useXRayStore((s) => s.xrayPositions);

  const { positions: viewPositions, visibleElementIds } = useViewPositions();

  const criticalPathSet = useMemo(() => new Set(criticalPath), [criticalPath]);

  const elementMap = useMemo(() => {
    const map = new Map<string, (typeof elements)[0]>();
    for (const el of elements) map.set(el.id, el);
    return map;
  }, [elements]);

  // Build set of policy node IDs to filter their connections
  const policyNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const el of elements) {
      if (el.metadata?.isPolicyNode) ids.add(el.id);
    }
    return ids;
  }, [elements]);

  const visibleConnections = useMemo(() => {
    return connections.filter((conn) => {
      const source = elementMap.get(conn.sourceId);
      const target = elementMap.get(conn.targetId);
      if (!source || !target) return false;
      // Filter out connections to/from policy nodes (INFLUENCES are internal plumbing)
      if (policyNodeIds.has(conn.sourceId) || policyNodeIds.has(conn.targetId)) return false;
      if (!visibleLayers.has(source.layer) || !visibleLayers.has(target.layer)) return false;
      // In layer mode, only show intra-layer connections
      if (isLayerMode) {
        return source.layer === focusedLayer && target.layer === focusedLayer;
      }
      // In 2D/layer modes, both endpoints must be visible
      if (is2DMode) {
        return visibleElementIds.has(source.id) && visibleElementIds.has(target.id);
      }
      return true;
    });
  }, [connections, elementMap, visibleLayers, isLayerMode, is2DMode, focusedLayer, visibleElementIds, policyNodeIds]);

  return (
    <group>
      {visibleConnections.map((conn) => {
        const source = elementMap.get(conn.sourceId)!;
        const target = elementMap.get(conn.targetId)!;
        const isSelected = selectedConnectionId === conn.id;
        const isHighlighted =
          selectedElementId === conn.sourceId || selectedElementId === conn.targetId;
        const connColor = CONNECTION_COLORS[conn.type] || '#4a5a4a';

        // Determine source/target positions based on mode
        let start: THREE.Vector3;
        let end: THREE.Vector3;

        if (isXRayActive && xraySubView !== 'simulation') {
          // Use X-Ray scale positions
          const srcPos = xrayPositions.get(source.id);
          const tgtPos = xrayPositions.get(target.id);
          start = srcPos
            ? new THREE.Vector3(srcPos.x, srcPos.y, srcPos.z)
            : new THREE.Vector3(source.position3D.x, source.position3D.y, source.position3D.z);
          end = tgtPos
            ? new THREE.Vector3(tgtPos.x, tgtPos.y, tgtPos.z)
            : new THREE.Vector3(target.position3D.x, target.position3D.y, target.position3D.z);
        } else if (is2DMode) {
          // Use view-mode computed positions
          const srcPos = viewPositions.get(source.id);
          const tgtPos = viewPositions.get(target.id);
          start = srcPos
            ? new THREE.Vector3(srcPos.x, srcPos.y, srcPos.z)
            : new THREE.Vector3(source.position3D.x, 0.1, source.position3D.z);
          end = tgtPos
            ? new THREE.Vector3(tgtPos.x, tgtPos.y, tgtPos.z)
            : new THREE.Vector3(target.position3D.x, 0.1, target.position3D.z);
        } else {
          start = new THREE.Vector3(source.position3D.x, source.position3D.y, source.position3D.z);
          end = new THREE.Vector3(target.position3D.x, target.position3D.y, target.position3D.z);
        }

        const isCrossArchitecture = conn.type === 'cross_architecture';

        const mid = start.clone().lerp(end, 0.5);
        mid.y += is2DMode ? 0.3 : (isCrossArchitecture ? 4 : 1.5);

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const points = curve.getPoints(is2DMode ? 16 : 32);

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
            {showParticles && !is2DMode && (
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
