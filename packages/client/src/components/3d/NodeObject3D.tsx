import { useRef, useState, useCallback, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useArchitectureStore, ArchitectureElement } from '../../stores/architectureStore';
import { useUIStore, ViewMode } from '../../stores/uiStore';
import { useXRayStore } from '../../stores/xrayStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useComplianceStore } from '../../stores/complianceStore';
import ArchiMateIconSprite from './ArchiMateIconSprite';

const LAYER_COLORS: Record<string, string> = {
  motivation: '#ec4899',
  strategy: '#ef4444',
  business: '#22c55e',
  information: '#3b82f6',
  application: '#f97316',
  technology: '#00ff41',
};

const TYPE_GEOMETRY: Record<string, 'box' | 'sphere' | 'cylinder' | 'cone'> = {
  business_capability: 'box',
  process: 'cylinder',
  value_stream: 'box',
  business_service: 'sphere',
  application: 'sphere',
  application_component: 'box',
  application_service: 'sphere',
  data_entity: 'box',
  data_model: 'box',
  technology_component: 'cylinder',
  infrastructure: 'box',
  platform_service: 'sphere',
  service: 'cone',
};

interface NodeObject3DProps {
  element: ArchitectureElement;
  viewPosition?: { x: number; y: number; z: number };
}

const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersection = new THREE.Vector3();

export default function NodeObject3D({ element, viewPosition }: NodeObject3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const viewMode = useUIStore((s) => s.viewMode);

  const selectedId = useArchitectureStore((s) => s.selectedElementId);
  const selectedIds = useArchitectureStore((s) => s.selectedElementIds);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const toggleSelectElement = useArchitectureStore((s) => s.toggleSelectElement);
  const updateElement = useArchitectureStore((s) => s.updateElement);
  const pushHistory = useArchitectureStore((s) => s.pushHistory);
  const openContextMenu = useArchitectureStore((s) => s.openContextMenu);
  const setDraggingStore = useArchitectureStore((s) => s.setDragging);

  const isSelected = selectedId === element.id || selectedIds.has(element.id);
  const baseColor = LAYER_COLORS[element.layer] || '#4a5a4a';
  const geometry = TYPE_GEOMETRY[element.type] || 'box';

  // Policy violation data
  const elementMeta = (element as ArchitectureElement & { metadata?: Record<string, unknown> }).metadata;
  const isPolicyNode = !!elementMeta?.isPolicyNode;
  const policyId = elementMeta?.policyId as string | undefined;
  // For policy tiles: count violations this policy PRODUCED; for regular elements: count violations ON this element
  const violationCount = useComplianceStore((s) =>
    isPolicyNode && policyId
      ? (s.violationsByPolicy.get(policyId) ?? 0)
      : (s.violationsByElement.get(element.id) ?? 0)
  );

  // X-Ray mode state
  const isXRayActive = useXRayStore((s) => s.isActive);
  const xraySubView = useXRayStore((s) => s.subView);
  const xrayElementData = useXRayStore((s) => s.elementData);
  const xrayPositions = useXRayStore((s) => s.xrayPositions);

  const xrayData = useMemo(() => {
    if (!isXRayActive) return null;
    return xrayElementData.get(element.id) || null;
  }, [isXRayActive, xrayElementData, element.id]);

  // Simulation overlay data (only used in simulation X-Ray sub-view)
  const simRiskDelta = useSimulationStore((s) => s.riskOverlay.get(element.id) ?? 0);
  const simCostDelta = useSimulationStore((s) => s.costOverlay.get(element.id) ?? 0);
  const simCombinedDelta = simRiskDelta + simCostDelta;

  // In X-Ray mode: color based on sub-view
  const color = useMemo(() => {
    // Policy nodes: green (compliant) or red (violations)
    if (isPolicyNode) {
      return violationCount > 0 ? '#ef4444' : '#22c55e';
    }
    if (!isXRayActive || !xrayData) return baseColor;
    if (xraySubView === 'risk') {
      const score = xrayData.riskScore;
      if (score >= 8) return '#ef4444';
      if (score >= 6) return '#f97316';
      if (score >= 4) return '#eab308';
      return '#22c55e';
    }
    if (xraySubView === 'cost') {
      // Color by cost intensity: cheap=green, medium=blue, expensive=red
      const cost = xrayData.estimatedCost;
      if (cost >= 60000) return '#ef4444';
      if (cost >= 30000) return '#f97316';
      if (cost >= 15000) return '#3b82f6';
      return '#22c55e';
    }
    if (xraySubView === 'timeline') {
      const statusColors: Record<string, string> = {
        current: '#3b82f6',
        transitional: '#f97316',
        target: '#22c55e',
        retired: '#6b7280',
      };
      return statusColors[element.status] || '#4a5a4a';
    }
    if (xraySubView === 'simulation') {
      if (simCombinedDelta < -0.5) return '#22c55e';
      if (simCombinedDelta > 0.5) return '#ef4444';
      return '#4a5a4a';
    }
    return baseColor;
  }, [isXRayActive, xrayData, xraySubView, baseColor, simCombinedDelta, element.status, isPolicyNode, violationCount]);

  // X-Ray scale positioning: use precomputed positions when active
  const xrayPosition = useMemo(() => {
    if (!isXRayActive) return null;
    const pos = xrayPositions.get(element.id);
    if (!pos) return null;
    // Only apply scale positioning for risk, cost, timeline views
    if (xraySubView === 'simulation') return null;
    return pos;
  }, [isXRayActive, xrayPositions, element.id, xraySubView]);

  const is2DMode = viewMode !== '3d';
  const isLayerMode = viewMode === 'layer';

  // Final position: X-Ray override > View mode position > Default 3D position
  const finalPosition = useMemo((): [number, number, number] => {
    if (xrayPosition) return [xrayPosition.x, xrayPosition.y, xrayPosition.z];
    if (viewPosition) return [viewPosition.x, viewPosition.y, viewPosition.z];
    return [element.position3D.x, element.position3D.y, element.position3D.z];
  }, [xrayPosition, viewPosition, element.position3D]);

  const { raycaster, camera, gl } = useThree();

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Policy tile animation: emissive glow breathes, tile stays flat
    if (isPolicyNode) {
      if (violationCount > 0) {
        const mat = meshRef.current.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
      }
      return;
    }

    if (isXRayActive && xrayData) {
      // X-Ray mode animations
      if (xraySubView === 'simulation' && Math.abs(simCombinedDelta) > 2) {
        // Large delta elements pulse
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
        meshRef.current.scale.lerp(new THREE.Vector3(pulse, pulse, pulse), 0.15);
      } else if (xrayData.isCriticalPath) {
        // Critical path elements pulse
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.08;
        meshRef.current.scale.lerp(new THREE.Vector3(pulse, pulse, pulse), 0.15);
      } else {
        const baseScale = xraySubView === 'cost'
          ? Math.min(2.0, 0.5 + Math.log10(Math.max(1, xrayData.estimatedCost / 10000)) * 0.5)
          : 1;
        meshRef.current.scale.lerp(new THREE.Vector3(baseScale, baseScale, baseScale), 0.08);
      }
      // Slow rotation for all X-Ray elements
      meshRef.current.rotation.y += delta * 0.2;
    } else {
      // Normal mode
      if (isSelected && !dragging) {
        meshRef.current.rotation.y += delta * 0.5;
      }
      const targetScale = hovered || isSelected ? 1.15 : 1;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();

    // Connection mode: first click = source, second click = open type picker
    const ui = useUIStore.getState();
    if (ui.isConnectionMode) {
      if (!ui.connectionSourceId) {
        ui.setConnectionSource(element.id);
        selectElement(element.id);
      } else if (ui.connectionSourceId !== element.id) {
        // Open the Connection Type Picker instead of hardcoding depends_on
        const screenPos = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
        ui.openConnectionPicker(element.id, screenPos);
      }
      return;
    }

    if (e.nativeEvent.shiftKey) {
      toggleSelectElement(element.id);
    } else {
      selectElement(element.id);
    }
  }, [element.id, selectElement, toggleSelectElement]);

  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    e.nativeEvent.preventDefault();
    const rect = gl.domElement.getBoundingClientRect();
    openContextMenu(
      e.nativeEvent.clientX - rect.left,
      e.nativeEvent.clientY - rect.top,
      element.id,
    );
  }, [element.id, gl.domElement, openContextMenu]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDragging(true);
    setDraggingStore(true);
    pushHistory();
    // In 2D/Layer modes, drag on Y=0.1 plane; in 3D, drag on element's Y layer
    const dragY = is2DMode ? 0.1 : element.position3D.y;
    _dragPlane.set(new THREE.Vector3(0, 1, 0), -dragY);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [element.position3D.y, is2DMode, pushHistory, setDraggingStore]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    if (raycaster.ray.intersectPlane(_dragPlane, _intersection)) {
      updateElement(element.id, {
        position3D: {
          x: Math.round(_intersection.x * 2) / 2,
          y: element.position3D.y,
          z: Math.round(_intersection.z * 2) / 2,
        },
      });
    }
  }, [dragging, camera, raycaster, gl.domElement, element.id, element.position3D.y, updateElement]);

  const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    setDragging(false);
    setDraggingStore(false);
  }, [dragging, setDraggingStore]);

  const renderGeometry = () => {
    // Policy tiles: flat engraved cards on the motivation layer
    if (isPolicyNode) {
      return <boxGeometry args={[2.5, 0.08, 1.4]} />;
    }
    if (is2DMode) {
      // Flat card geometry for 2D/Layer views
      const w = isLayerMode ? 3 : 2;
      const h = isLayerMode ? 2 : 1.2;
      return <boxGeometry args={[w, 0.08, h]} />;
    }
    switch (geometry) {
      case 'sphere':
        return <sphereGeometry args={[0.6, 32, 32]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 32]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  };

  const statusColor =
    element.status === 'retired' ? '#ef4444' :
    element.status === 'transitional' ? '#eab308' :
    element.status === 'target' ? '#06b6d4' : undefined;

  // Compute emissive intensity based on mode
  const emissiveIntensity = useMemo(() => {
    if (isPolicyNode) {
      return violationCount > 0 ? 0.8 : 0.35;
    }
    if (isXRayActive && xrayData) {
      if (xrayData.isCriticalPath) return 0.8;
      if (xraySubView === 'risk') return 0.2 + (xrayData.riskScore / 10) * 0.5;
      if (xraySubView === 'cost') {
        // Expensive elements glow more, optimization targets glow green
        if (xrayData.optimizationPotential > 0) return 0.5;
        return Math.min(0.7, 0.15 + Math.log10(Math.max(1, xrayData.estimatedCost / 10000)) * 0.2);
      }
      return 0.3;
    }
    return dragging ? 0.8 : hovered ? 0.4 : isSelected ? 0.6 : 0.1;
  }, [isXRayActive, xrayData, xraySubView, dragging, hovered, isSelected, isPolicyNode, violationCount]);

  const materialOpacity = useMemo(() => {
    if (isXRayActive && xrayData) {
      if (xraySubView === 'risk' && xrayData.riskScore < 3) return 0.5;
      if (xraySubView === 'cost') {
        if (element.status === 'retired') return 0.15;
        if (xrayData.estimatedCost < 10000) return 0.5;
        return 0.9;
      }
      if (xraySubView === 'simulation') {
        return Math.abs(simCombinedDelta) > 0.1 ? 1 : 0.3;
      }
      if (element.status === 'retired') return 0.25;
    }
    if (element.metadata?.isProposal) return 0.5;
    return element.status === 'retired' ? 0.4 : 1;
  }, [isXRayActive, xrayData, xraySubView, element.status, simCombinedDelta, element.metadata]);

  return (
    <group position={finalPosition}>
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={isXRayActive ? undefined : handlePointerDown}
        onPointerMove={isXRayActive ? undefined : handlePointerMove}
        onPointerUp={isXRayActive ? undefined : handlePointerUp}
        onPointerOver={() => { setHovered(true); gl.domElement.style.cursor = isXRayActive ? 'default' : 'pointer'; }}
        onPointerOut={() => { setHovered(false); gl.domElement.style.cursor = 'auto'; }}
        castShadow
      >
        {renderGeometry()}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={isXRayActive ? 0.5 : 0.3}
          roughness={isXRayActive ? 0.4 : 0.7}
          transparent={materialOpacity < 1}
          opacity={materialOpacity}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.0, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} />
        </mesh>
      )}

      {/* Status indicator dot */}
      {statusColor && (
        <mesh position={[0.6, 0.6, 0.6]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial color={statusColor} />
        </mesh>
      )}

      {/* Violation indicator dot on regular elements */}
      {violationCount > 0 && !isPolicyNode && (
        <mesh position={[-0.6, 0.6, 0.6]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
      )}

      {/* ArchiMate notation icon */}
      <ArchiMateIconSprite
        elementType={element.type}
        layerColor={baseColor}
        is2DMode={is2DMode}
        opacity={materialOpacity}
      />

      {/* Risk glow for high/critical (3D only) */}
      {!is2DMode && (element.riskLevel === 'high' || element.riskLevel === 'critical') && (
        <pointLight
          color={element.riskLevel === 'critical' ? '#ef4444' : '#f97316'}
          intensity={0.5}
          distance={3}
        />
      )}

      {/* Label - always visible in 2D/Layer modes; in X-Ray only for critical path + hover/selection
          (color/size/glow already communicate the metric — labels would obscure connections) */}
      {(is2DMode || hovered || isSelected || (isXRayActive && xrayData?.isCriticalPath)) && (
        <Html
          position={isPolicyNode ? [0, 0.15, 0] : is2DMode ? [0, 0.2, 0] : [0, 1.2, 0]}
          center
          style={{
            background: is2DMode ? 'transparent' : 'rgba(15, 23, 42, 0.9)',
            border: is2DMode ? 'none' : `1px solid ${color}`,
            borderRadius: '6px',
            padding: is2DMode ? '2px 4px' : '4px 10px',
            color: '#e0e0e0',
            fontSize: is2DMode ? '10px' : '11px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textShadow: is2DMode ? '0 0 4px rgba(0,0,0,0.9)' : 'none',
          }}
        >
          <div style={{ maxWidth: isPolicyNode ? '150px' : isLayerMode ? '120px' : '90px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {element.name}
          </div>
          {isPolicyNode ? (
            <div style={{ fontSize: '9px', marginTop: '2px', color: violationCount > 0 ? '#ef4444' : '#22c55e' }}>
              {(() => {
                const meta = (element as ArchitectureElement & { metadata?: Record<string, unknown> }).metadata;
                const source = (meta?.source as string || '').toUpperCase();
                return source ? `${source} · ` : '';
              })()}
              {violationCount > 0 ? `${violationCount} violation${violationCount > 1 ? 's' : ''}` : '✓ compliant'}
            </div>
          ) : isXRayActive && xrayData && xraySubView === 'risk' ? (
            <div style={{ fontSize: '9px', marginTop: '2px', display: 'flex', gap: 8 }}>
              <span style={{ color }}>Risk: {xrayData.riskScore}</span>
              {xrayData.isCriticalPath && (
                <span style={{ color: '#ffffff', fontWeight: 700 }}>CRITICAL PATH</span>
              )}
            </div>
          ) : isXRayActive && xrayData && xraySubView === 'cost' ? (
            <div style={{ fontSize: '9px', marginTop: '2px', display: 'flex', gap: 8 }}>
              <span style={{ color }}>
                €{xrayData.estimatedCost >= 1000 ? `${(xrayData.estimatedCost / 1000).toFixed(0)}K` : xrayData.estimatedCost}
              </span>
              {xrayData.optimizationPotential > 0 && (
                <span style={{ color: '#22c55e', fontWeight: 700 }}>
                  ↓ €{xrayData.optimizationPotential >= 1000 ? `${(xrayData.optimizationPotential / 1000).toFixed(0)}K` : xrayData.optimizationPotential} savings
                </span>
              )}
            </div>
          ) : isLayerMode ? (
            <div style={{ fontSize: '8px', color: '#7a8a7a', marginTop: '1px' }}>
              {element.type.replace(/_/g, ' ')} · {element.status}
            </div>
          ) : (
            <div style={{ fontSize: '9px', color: '#7a8a7a', marginTop: '2px' }}>
              {element.type.replace(/_/g, ' ')}
            </div>
          )}
        </Html>
      )}
    </group>
  );
}
