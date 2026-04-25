import { useState, useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArchitectureElement } from '../../stores/architectureStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useActivityViewStore } from '../../stores/activityViewStore';

interface ActivityNodeProps {
  activity: ArchitectureElement;
  position: { x: number; y: number; z: number };
  index: number;
  totalCount: number;
}

function abbreviate(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1).trimEnd() + '…';
}

function labelStyleFor(total: number) {
  if (total <= 6)  return { fontSize: 11, distanceFactor: 22, padding: '3px 8px', maxChars: 36 };
  if (total <= 12) return { fontSize: 9,  distanceFactor: 30, padding: '2px 6px', maxChars: 20 };
  if (total <= 20) return { fontSize: 7,  distanceFactor: 38, padding: '2px 5px', maxChars: 12 };
  return                  { fontSize: 6,  distanceFactor: 46, padding: '1px 4px', maxChars: 8  };
}

const COLOR = '#22c55e';
const HOVER_COLOR = '#86efac';
const SELECTED_COLOR = '#bbf7d0';
const DIMENSIONS: [number, number, number] = [1.6, 0.9, 1.2];

export default function ActivityNode({ activity, position, index, totalCount }: ActivityNodeProps) {
  const labelStyle = labelStyleFor(totalCount);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { gl } = useThree();

  const isSelected = useArchitectureStore((s) => s.selectedElementId === activity.id);
  const selectElement = useArchitectureStore((s) => s.selectElement);
  const toggleSelectElement = useArchitectureStore((s) => s.toggleSelectElement);
  const openContextMenu = useArchitectureStore((s) => s.openContextMenu);

  // Subtle bob — local Y offset within the parent group (which is already at world position.y)
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime() + index * 0.3;
    meshRef.current.position.y = Math.sin(t * 0.8) * 0.04;
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.nativeEvent.shiftKey) {
        toggleSelectElement(activity.id);
      } else {
        selectElement(activity.id);
      }
    },
    [activity.id, selectElement, toggleSelectElement],
  );

  const handleDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // Phase 9 stub: drill deeper into sub-activities
      const drill = useActivityViewStore.getState().drillInto;
      drill(activity.id);
    },
    [activity.id],
  );

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      const rect = gl.domElement.getBoundingClientRect();
      openContextMenu(
        e.nativeEvent.clientX - rect.left,
        e.nativeEvent.clientY - rect.top,
        activity.id,
      );
    },
    [activity.id, gl.domElement, openContextMenu],
  );

  const meshColor = isSelected ? SELECTED_COLOR : hovered ? HOVER_COLOR : COLOR;
  const emissiveIntensity = isSelected ? 0.55 : hovered ? 0.4 : 0.18;

  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={DIMENSIONS} />
        <meshStandardMaterial
          color={meshColor}
          emissive={COLOR}
          emissiveIntensity={emissiveIntensity}
          metalness={0.25}
          roughness={0.55}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -DIMENSIONS[1] / 2 - 0.02, 0]}>
          <ringGeometry args={[1.0, 1.25, 32]} />
          <meshBasicMaterial color={COLOR} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Sequence-number + name label above the box */}
      <Html
        position={[0, DIMENSIONS[1] / 2 + 0.55, 0]}
        center
        distanceFactor={hovered ? 16 : labelStyle.distanceFactor}
        occlude={false}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: hovered || isSelected ? 'rgba(10,10,10,0.92)' : 'rgba(10,10,10,0.55)',
            border: `1px solid ${hovered || isSelected ? COLOR : 'rgba(34,197,94,0.45)'}`,
            color: COLOR,
            padding: hovered ? '4px 10px' : labelStyle.padding,
            borderRadius: 4,
            fontSize: `${hovered ? 13 : labelStyle.fontSize}px`,
            fontFamily: 'monospace',
            fontWeight: hovered || isSelected ? 700 : 500,
            whiteSpace: 'nowrap',
            textAlign: 'center',
            opacity: hovered || isSelected ? 1 : 0.8,
            boxShadow: isSelected ? '0 0 14px rgba(34,197,94,0.85)' : 'none',
          }}
        >
          {String(index + 1).padStart(2, '0')} · {hovered ? activity.name : abbreviate(activity.name, labelStyle.maxChars)}
        </div>
      </Html>
    </group>
  );
}
