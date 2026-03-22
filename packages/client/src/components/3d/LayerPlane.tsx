import { useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import type { ViewMode } from '../../stores/uiStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';

const LAYER_INDEX = new Map<string, number>(ARCHITECTURE_LAYERS.map((l, i) => [l.id, i]));
const SWIM_LANE_SPACING = 8;

interface LayerPlaneProps {
  layerId: string;
  label: string;
  yPosition: number;
  color: string;
  offsetX?: number;
  workspaceName?: string;
  viewMode?: ViewMode;
}

function computeLayerRiskLevel(
  layerId: string,
  elements: ReturnType<typeof useArchitectureStore.getState>['elements'],
  elementData: ReturnType<typeof useXRayStore.getState>['elementData']
): { avgRisk: number; maxRisk: number; count: number } {
  const layerElements = elements.filter((el) => el.layer === layerId);
  if (layerElements.length === 0) return { avgRisk: 0, maxRisk: 0, count: 0 };

  let totalRisk = 0;
  let maxRisk = 0;
  for (const el of layerElements) {
    const data = elementData.get(el.id);
    const risk = data?.riskScore || 0;
    totalRisk += risk;
    if (risk > maxRisk) maxRisk = risk;
  }
  return { avgRisk: totalRisk / layerElements.length, maxRisk, count: layerElements.length };
}

export default function LayerPlane({ layerId, label, yPosition, color, offsetX = 0, workspaceName, viewMode = '3d' }: LayerPlaneProps) {
  const is2D = viewMode === '2d-topdown';
  const isLayer = viewMode === 'layer';
  const meshRef = useRef<THREE.Mesh>(null);
  const isXRayActive = useXRayStore((s) => s.isActive);
  const xraySubView = useXRayStore((s) => s.subView);
  const xrayElementData = useXRayStore((s) => s.elementData);
  const elements = useArchitectureStore((s) => s.elements);

  const riskInfo = useMemo(() => {
    if (!isXRayActive || xraySubView !== 'risk') return null;
    return computeLayerRiskLevel(layerId, elements, xrayElementData);
  }, [isXRayActive, xraySubView, layerId, elements, xrayElementData]);

  // In X-Ray risk mode: plane color reflects average risk of its elements
  const planeColor = useMemo(() => {
    if (!riskInfo) return color;
    if (riskInfo.avgRisk >= 7) return '#ef4444';
    if (riskInfo.avgRisk >= 5) return '#f97316';
    if (riskInfo.avgRisk >= 3) return '#eab308';
    return '#22c55e';
  }, [riskInfo, color]);

  const planeOpacity = useMemo(() => {
    if (!riskInfo) return 0.05;
    // Higher risk = more visible plane
    return 0.03 + (riskInfo.avgRisk / 10) * 0.12;
  }, [riskInfo]);

  // Position and size based on view mode
  const layerIdx = LAYER_INDEX.get(layerId) ?? 0;
  const groupPosition: [number, number, number] = is2D
    ? [offsetX, 0, layerIdx * -SWIM_LANE_SPACING]
    : isLayer
      ? [offsetX, 0, 0]
      : [offsetX, yPosition, 0];

  const planeWidth = is2D ? 60 : isLayer ? 60 : 30;
  const planeDepth = is2D ? 6 : isLayer ? 60 : 30;
  const labelPos: [number, number, number] = is2D
    ? [-30, 0.1, -2.5]
    : isLayer
      ? [-30, 0.1, -32]
      : [-16, 0.1, -16];

  return (
    <group position={groupPosition}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[planeWidth, planeDepth]} />
        <meshStandardMaterial
          color={planeColor}
          transparent
          opacity={is2D ? 0.08 + (layerIdx % 2) * 0.04 : isLayer ? 0.06 : planeOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Layer border - brighter in X-Ray for high-risk layers */}
      <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(planeWidth, planeDepth)]} />
        <lineBasicMaterial
          color={planeColor}
          transparent
          opacity={is2D ? 0.4 : (riskInfo && riskInfo.avgRisk >= 5 ? 0.6 : 0.3)}
        />
      </lineSegments>

      {/* Workspace name label (shown on top layer only) */}
      {workspaceName && !is2D && !isLayer && (
        <Html
          position={[0, 0.3, -18]}
          center
          style={{
            color: planeColor,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            pointerEvents: 'none',
            opacity: 0.9,
          }}
        >
          {workspaceName}
        </Html>
      )}

      {/* Layer label */}
      <Html
        position={labelPos}
        center={false}
        style={{
          color: planeColor,
          fontSize: isLayer ? '16px' : is2D ? '13px' : '12px',
          fontWeight: isLayer ? 700 : 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
          opacity: is2D ? 0.9 : 0.7,
        }}
      >
        {label}
        {riskInfo && riskInfo.count > 0 && (
          <span style={{ marginLeft: 8, fontSize: '10px', opacity: 0.8 }}>
            (avg risk: {riskInfo.avgRisk.toFixed(1)})
          </span>
        )}
      </Html>
    </group>
  );
}
