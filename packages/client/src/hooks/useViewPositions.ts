import { useMemo } from 'react';
import { useUIStore, ViewMode } from '../stores/uiStore';
import { useArchitectureStore, ArchitectureElement } from '../stores/architectureStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ArchitectureLayer } from '@thearchitect/shared';

// Map layer id → index (0 = motivation at top, 7 = impl_migration at bottom)
const LAYER_INDEX = new Map<string, number>(
  ARCHITECTURE_LAYERS.map((l, i) => [l.id, i])
);

const SWIM_LANE_SPACING = 8;

export interface ViewPositionResult {
  positions: Map<string, { x: number; y: number; z: number }>;
  visibleElementIds: Set<string>;
}

export function computeViewPositions(
  viewMode: ViewMode,
  focusedLayer: ArchitectureLayer,
  elements: ArchitectureElement[]
): ViewPositionResult {
  const positions = new Map<string, { x: number; y: number; z: number }>();
  const visibleElementIds = new Set<string>();

  for (const el of elements) {
    if (viewMode === '3d') {
      // Identity — use original positions
      positions.set(el.id, { ...el.position3D });
      visibleElementIds.add(el.id);
    } else if (viewMode === '2d-topdown') {
      // Flatten to Y=0.1, map layers to Z swim lanes
      const layerIdx = LAYER_INDEX.get(el.layer) ?? 4;
      const swimZ = layerIdx * -SWIM_LANE_SPACING;
      // Preserve relative Z offset within the lane (original Z clamped to lane width)
      const zOffset = Math.max(-3, Math.min(3, el.position3D.z));
      positions.set(el.id, {
        x: el.position3D.x,
        y: 0.1,
        z: swimZ + zOffset,
      });
      visibleElementIds.add(el.id);
    } else if (viewMode === 'layer') {
      // Only show elements on focused layer
      if (el.layer === focusedLayer) {
        positions.set(el.id, {
          x: el.position3D.x,
          y: 0.1,
          z: el.position3D.z,
        });
        visibleElementIds.add(el.id);
      }
    }
  }

  return { positions, visibleElementIds };
}

export function useViewPositions(): ViewPositionResult {
  const viewMode = useUIStore((s) => s.viewMode);
  const focusedLayer = useUIStore((s) => s.focusedLayer);
  const elements = useArchitectureStore((s) => s.elements);

  return useMemo(
    () => computeViewPositions(viewMode, focusedLayer, elements),
    [viewMode, focusedLayer, elements]
  );
}
