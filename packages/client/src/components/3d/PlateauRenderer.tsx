import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import LayerPlane from './LayerPlane';
import PlateauElement from './PlateauElement';
import PlateauConnectionLines from './PlateauConnectionLines';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';

// ─── Constants ───

const WORKSPACE_GAP = 40;

const LAYER_CONFIG = ARCHITECTURE_LAYERS.map((l) => ({
  id: l.id,
  label: l.label,
  y: l.yPosition,
  color: l.color,
}));

// ─── Component ───

export default function PlateauRenderer() {
  const plateauSnapshots = useRoadmapStore((s) => s.plateauSnapshots);
  const selectedPlateauIndex = useRoadmapStore((s) => s.selectedPlateauIndex);
  const plateauViewMode = useRoadmapStore((s) => s.plateauViewMode);
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);

  // LOD: full detail for selected ±1, simplified for rest
  const lodInfo = useMemo(() => {
    const map = new Map<number, boolean>(); // index → isLOD
    for (let i = 0; i < plateauSnapshots.length; i++) {
      const distance = selectedPlateauIndex !== null ? Math.abs(i - selectedPlateauIndex) : 0;
      map.set(i, distance > 1);
    }
    return map;
  }, [plateauSnapshots.length, selectedPlateauIndex]);

  if (!plateauSnapshots.length) return null;

  return (
    <group>
      {plateauSnapshots.map((snapshot, i) => {
        const offsetX = i * WORKSPACE_GAP;
        const isLOD = lodInfo.get(i) ?? false;
        const isSelected = selectedPlateauIndex === i;
        const elements = Object.values(snapshot.elements);

        // Filter by view mode and layer visibility
        const visibleElements = elements
          .filter((el) => visibleLayers.has(el.layer))
          .filter((el) => plateauViewMode !== 'changed-only' || el.changeWaveNumber !== null);

        return (
          <group key={`plateau-${i}`}>
            {/* Layer planes (respect visibility toggles) */}
            {LAYER_CONFIG.filter((layer) => visibleLayers.has(layer.id)).map((layer) => (
              <LayerPlane
                key={`p${i}-${layer.id}`}
                layerId={layer.id}
                label={layer.label}
                yPosition={layer.y}
                color={layer.color}
                offsetX={offsetX}
                workspaceName={layer.id === 'strategy' ? snapshot.label : undefined}
                viewMode="3d"
              />
            ))}

            {/* Plateau label above strategy layer */}
            <Html
              position={[offsetX, 18, 0]}
              center
              distanceFactor={30}
              style={{
                color: isSelected ? '#00ff41' : '#888888',
                fontSize: isSelected ? '16px' : '13px',
                fontWeight: isSelected ? 700 : 500,
                fontFamily: 'monospace',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                pointerEvents: 'none',
                textShadow: isSelected ? '0 0 8px rgba(0,255,65,0.5)' : 'none',
              }}
            >
              {snapshot.label}
              {snapshot.changedElementIds.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: '10px', opacity: 0.7 }}>
                  ({snapshot.changedElementIds.length} changes)
                </span>
              )}
            </Html>

            {/* Elements */}
            {visibleElements.map((elState) => (
              <PlateauElement
                key={`p${i}-el-${elState.elementId}`}
                elementState={elState}
                offsetX={offsetX}
                isLOD={isLOD}
                isInSelectedPlateau={isSelected}
              />
            ))}
          </group>
        );
      })}

      {/* Connection lines (intra + cross-plateau) */}
      <PlateauConnectionLines />
    </group>
  );
}
