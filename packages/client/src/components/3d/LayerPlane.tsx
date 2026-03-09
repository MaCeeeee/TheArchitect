import { useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';

interface LayerPlaneProps {
  layerId: string;
  label: string;
  yPosition: number;
  color: string;
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

export default function LayerPlane({ layerId, label, yPosition, color }: LayerPlaneProps) {
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

  return (
    <group position={[0, yPosition, 0]}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial
          color={planeColor}
          transparent
          opacity={planeOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Layer border - brighter in X-Ray for high-risk layers */}
      <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(30, 30)]} />
        <lineBasicMaterial
          color={planeColor}
          transparent
          opacity={riskInfo && riskInfo.avgRisk >= 5 ? 0.6 : 0.3}
        />
      </lineSegments>

      {/* Layer label */}
      <Html
        position={[-16, 0.1, -16]}
        center={false}
        style={{
          color: planeColor,
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
          opacity: 0.7,
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
