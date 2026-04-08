import { Canvas } from '@react-three/fiber';
import { Grid, Environment } from '@react-three/drei';
import { Suspense, useEffect } from 'react';
import LayerPlane from './LayerPlane';
import ArchitectureElements from './ArchitectureElements';
import ConnectionLines from './ConnectionLines';
import ViewModeCamera from './ViewModeCamera';
import ContextMenu3D from './ContextMenu3D';
import TransformationXRay from './TransformationXRay';
import PlateauRenderer from './PlateauRenderer';
import AgentAvatars3D from './AgentAvatars3D';
import DiscussionBubbles3D from './DiscussionBubbles3D';
import ConnectionPreview from './ConnectionPreview';
import XRayHUD from './XRayHUD';
import CursorOverlay from '../collaboration/CursorOverlay';
import WorkspaceBar from '../ui/WorkspaceBar';
import PlateauBar from '../ui/PlateauBar';
import PlateauHUD from '../ui/PlateauHUD';
import Minimap from '../ui/Minimap';
import LayerNavigator from '../ui/LayerNavigator';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useUIStore } from '../../stores/uiStore';
import { useXRayStore } from '../../stores/xrayStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';

const LAYER_CONFIG = ARCHITECTURE_LAYERS.map(l => ({
  id: l.id,
  label: l.label,
  y: l.yPosition,
  color: l.color,
}));

export default function Scene() {
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const clearSelection = useArchitectureStore((s) => s.clearSelection);
  const closeContextMenu = useArchitectureStore((s) => s.closeContextMenu);
  const viewMode = useUIStore((s) => s.viewMode);
  const focusedLayer = useUIStore((s) => s.focusedLayer);
  const isXRayActive = useXRayStore((s) => s.isActive);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const isPlateauActive = useRoadmapStore((s) => s.isPlateauViewActive);
  const deactivatePlateauView = useRoadmapStore((s) => s.deactivatePlateauView);
  const is3D = viewMode === '3d';
  const isLayerView = viewMode === 'layer';

  // Guard: auto-deactivate Plateau View when leaving 3D mode
  useEffect(() => {
    if (!is3D && isPlateauActive) {
      deactivatePlateauView();
    }
  }, [is3D, isPlateauActive, deactivatePlateauView]);

  const handleCanvasClick = () => {
    clearSelection();
    closeContextMenu();
  };

  return (
    <div className="relative w-full h-full">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        style={{ background: isXRayActive ? '#080e1a' : is3D ? '#0a0a0a' : '#0d1117' }}
        onPointerMissed={handleCanvasClick}
      >
        <Suspense fallback={null}>
          {/* Lighting adapts to view mode */}
          <ambientLight intensity={is3D ? (isXRayActive ? 0.25 : 0.4) : 0.8} />
          <directionalLight position={[10, 20, 10]} intensity={is3D ? (isXRayActive ? 0.5 : 0.8) : 0.4} castShadow={is3D} />
          {is3D && <pointLight position={[-10, 10, -10]} intensity={0.3} color="#00ff41" />}

          {/* Plateau View: replaces normal architecture rendering */}
          {isPlateauActive && is3D ? (
            <>
              <PlateauRenderer />
              <AgentAvatars3D />
              <DiscussionBubbles3D plateauMode />
            </>
          ) : (
            <>
              {/* Render layer planes per workspace (or once if no workspaces) */}
              {(workspaces.length > 0 ? workspaces : [{ id: 'default', name: '', offsetX: 0 }]).map((ws) =>
                LAYER_CONFIG.map(
                  (layer) => {
                    // In layer view, only show the focused layer
                    if (isLayerView && layer.id !== focusedLayer) return null;
                    if (!visibleLayers.has(layer.id)) return null;
                    return (
                      <LayerPlane
                        key={`${ws.id}-${layer.id}`}
                        layerId={layer.id}
                        label={layer.label}
                        yPosition={layer.y}
                        color={layer.color}
                        offsetX={ws.offsetX}
                        workspaceName={layer.id === 'strategy' && workspaces.length > 1 ? ws.name : undefined}
                        viewMode={viewMode}
                      />
                    );
                  }
                )
              )}

              <ArchitectureElements />
              <ConnectionLines />
              <ConnectionPreview />
              {!isXRayActive && <CursorOverlay />}

              {/* TransformationXRay renders its own lights, sub-views, and HUD */}
              {is3D && <TransformationXRay />}

              {/* MiroFish Agent Avatars + Discussion Bubbles (visible during/after simulation) */}
              {is3D && <AgentAvatars3D />}
              {is3D && <DiscussionBubbles3D />}
            </>
          )}

          {/* Grid only in 3D mode */}
          {is3D && (
            <Grid
              args={[50, 50]}
              position={[0, -6, 0]}
              cellSize={1}
              cellThickness={isXRayActive ? 0.2 : 0.5}
              cellColor={isXRayActive ? '#0a0a0a' : '#111111'}
              sectionSize={5}
              sectionThickness={isXRayActive ? 0.3 : 1}
              sectionColor={isXRayActive ? '#111111' : '#1a2a1a'}
              fadeDistance={50}
              infiniteGrid
            />
          )}

          <ViewModeCamera />
          {is3D && <Environment files="/hdri/dikhololo_night_1k.hdr" />}
        </Suspense>
      </Canvas>

      {/* Context menu overlay - hide in X-Ray mode */}
      {!isXRayActive && <ContextMenu3D />}

      {/* Workspace navigation bar (hidden during plateau view) */}
      {!isXRayActive && !isPlateauActive && is3D && <WorkspaceBar />}

      {/* Plateau navigation bar + HUD */}
      {isPlateauActive && is3D && <PlateauBar />}
      {isPlateauActive && is3D && <PlateauHUD />}

      {/* Minimap */}
      {!isXRayActive && !isPlateauActive && is3D && workspaces.length > 1 && <Minimap />}

      {/* Layer Navigator - only in Layer view */}
      {isLayerView && !isXRayActive && <LayerNavigator />}

      {/* X-Ray HUD - rendered OUTSIDE Canvas so it stays fixed on screen */}
      {isXRayActive && <XRayHUD />}
    </div>
  );
}
