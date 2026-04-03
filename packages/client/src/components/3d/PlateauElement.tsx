import { useRef, useMemo, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlateauElementState } from '@thearchitect/shared';
import { useArchitectureStore } from '../../stores/architectureStore';
import ArchiMateIconSprite from './ArchiMateIconSprite';

// ─── Constants ───

const LAYER_COLORS: Record<string, string> = {
  motivation: '#ec4899',
  strategy: '#ef4444',
  business: '#22c55e',
  information: '#3b82f6',
  application: '#f97316',
  technology: '#00ff41',
  physical: '#14b8a6',
  implementation_migration: '#6366f1',
};

const STATUS_COLORS: Record<string, string> = {
  current: '',        // uses layer color
  transitional: '#f59e0b',
  target: '#22c55e',
  retired: '#ef4444',
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
  data_object: 'box',
  technology_component: 'cylinder',
  infrastructure: 'box',
  platform_service: 'sphere',
  service: 'cone',
};

const BADGE_LABELS: Record<string, string> = {
  current: 'current',
  transitional: 'transitional',
  target: 'target',
  retired: 'retired',
};

// ─── Props ───

interface PlateauElementProps {
  elementState: PlateauElementState;
  offsetX: number;
  isLOD: boolean;
  isInSelectedPlateau: boolean;
}

// ─── Component ───

export default function PlateauElement({
  elementState,
  offsetX,
  isLOD,
  isInSelectedPlateau,
}: PlateauElementProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const selectElement = useArchitectureStore((s) => s.selectElement);

  const layerColor = LAYER_COLORS[elementState.layer] || '#666666';
  const statusOverride = STATUS_COLORS[elementState.status];
  const color = statusOverride || layerColor;
  const geometry = TYPE_GEOMETRY[elementState.type] || 'box';
  const isRetired = elementState.status === 'retired';

  const position = useMemo((): [number, number, number] => [
    elementState.position3D.x + offsetX,
    elementState.position3D.y,
    elementState.position3D.z,
  ], [elementState.position3D, offsetX]);

  // Pulsing animation for changed elements
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (elementState.isChanged && isInSelectedPlateau) {
      const pulse = Math.sin(clock.getElapsedTime() * 3) * 0.25 + 0.55;
      (meshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectElement(elementState.elementId);
  }, [elementState.elementId, selectElement]);

  const renderGeometry = () => {
    if (isLOD) {
      return <sphereGeometry args={[0.4, 8, 8]} />;
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

  const emissiveIntensity = elementState.isChanged && isInSelectedPlateau ? 0.55 : 0.1;
  const opacity = isRetired ? 0.4 : isLOD ? 0.6 : 1;

  return (
    <group position={position}>
      {/* Main mesh */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); (e.target as HTMLElement).style?.cursor && ((e.target as any).ownerDocument.body.style.cursor = 'pointer'); }}
        onPointerOut={(e) => { e.stopPropagation(); }}
        castShadow
      >
        {renderGeometry()}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.3}
          roughness={0.7}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>

      {/* Change highlight ring */}
      {elementState.isChanged && isInSelectedPlateau && !isLOD && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
          <ringGeometry args={[0.7, 0.85, 32]} />
          <meshBasicMaterial
            color={statusOverride || '#00ff41'}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* ArchiMate notation icon */}
      {!isLOD && (
        <ArchiMateIconSprite
          elementType={elementState.type}
          layerColor={layerColor}
          is2DMode={false}
          opacity={opacity}
        />
      )}

      {/* Label (only for non-LOD, visible in selected plateau ±1) */}
      {!isLOD && (
        <Html
          position={[0, 1.0, 0]}
          center
          distanceFactor={15}
          style={{
            color: '#e0e0e0',
            fontSize: '10px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            pointerEvents: 'none',
            textShadow: '0 0 4px rgba(0,0,0,0.8)',
            opacity: isInSelectedPlateau ? 1 : 0.5,
          }}
        >
          {elementState.name}
        </Html>
      )}

      {/* Status transition badge for changed elements */}
      {elementState.isChanged && isInSelectedPlateau && !isLOD && (
        <Html
          position={[0, -1.0, 0]}
          center
          distanceFactor={12}
          style={{
            fontSize: '8px',
            fontFamily: 'monospace',
            padding: '1px 4px',
            borderRadius: '3px',
            backgroundColor: 'rgba(0,0,0,0.85)',
            border: `1px solid ${statusOverride || '#00ff41'}`,
            color: statusOverride || '#00ff41',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {BADGE_LABELS[elementState.previousStatus] || elementState.previousStatus}
          {' → '}
          {BADGE_LABELS[elementState.status] || elementState.status}
        </Html>
      )}
    </group>
  );
}
