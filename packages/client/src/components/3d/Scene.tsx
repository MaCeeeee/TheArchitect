import { Canvas } from '@react-three/fiber';
import { Grid, Environment } from '@react-three/drei';
import { Suspense } from 'react';
import LayerPlane from './LayerPlane';
import ArchitectureElements from './ArchitectureElements';
import ConnectionLines from './ConnectionLines';
import CameraControlsWrapper from './CameraControls';
import ContextMenu3D from './ContextMenu3D';
import TransformationXRay from './TransformationXRay';
import XRayHUD from './XRayHUD';
import CursorOverlay from '../collaboration/CursorOverlay';
import WorkspaceBar from '../ui/WorkspaceBar';
import Minimap from '../ui/Minimap';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const LAYER_CONFIG = [
  { id: 'strategy', label: 'Strategy', y: 12, color: '#ef4444' },
  { id: 'business', label: 'Business', y: 8, color: '#22c55e' },
  { id: 'information', label: 'Information / Application', y: 4, color: '#3b82f6' },
  { id: 'application', label: 'Application', y: 0, color: '#f97316' },
  { id: 'technology', label: 'Technology', y: -4, color: '#00ff41' },
] as const;

export default function Scene() {
  const visibleLayers = useArchitectureStore((s) => s.visibleLayers);
  const clearSelection = useArchitectureStore((s) => s.clearSelection);
  const closeContextMenu = useArchitectureStore((s) => s.closeContextMenu);
  const isXRayActive = useXRayStore((s) => s.isActive);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const handleCanvasClick = () => {
    clearSelection();
    closeContextMenu();
  };

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: [20, 15, 20], fov: 60, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: isXRayActive ? '#080e1a' : '#0a0a0a' }}
        onPointerMissed={handleCanvasClick}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={isXRayActive ? 0.25 : 0.4} />
          <directionalLight position={[10, 20, 10]} intensity={isXRayActive ? 0.5 : 0.8} castShadow />
          <pointLight position={[-10, 10, -10]} intensity={0.3} color="#00ff41" />

          {/* Render layer planes per workspace (or once if no workspaces) */}
          {(workspaces.length > 0 ? workspaces : [{ id: 'default', name: '', offsetX: 0 }]).map((ws) =>
            LAYER_CONFIG.map(
              (layer) =>
                visibleLayers.has(layer.id) && (
                  <LayerPlane
                    key={`${ws.id}-${layer.id}`}
                    layerId={layer.id}
                    label={layer.label}
                    yPosition={layer.y}
                    color={layer.color}
                    offsetX={ws.offsetX}
                    workspaceName={layer.id === 'strategy' && workspaces.length > 1 ? ws.name : undefined}
                  />
                )
            )
          )}

          <ArchitectureElements />
          <ConnectionLines />
          {!isXRayActive && <CursorOverlay />}

          {/* TransformationXRay renders its own lights, sub-views, and HUD */}
          <TransformationXRay />

          {/* Dim grid in X-Ray mode */}
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

          <CameraControlsWrapper />
          <Environment preset="night" />
        </Suspense>
      </Canvas>

      {/* Context menu overlay - hide in X-Ray mode */}
      {!isXRayActive && <ContextMenu3D />}

      {/* Workspace navigation bar */}
      {!isXRayActive && <WorkspaceBar />}

      {/* Minimap */}
      {!isXRayActive && workspaces.length > 1 && <Minimap />}

      {/* X-Ray HUD - rendered OUTSIDE Canvas so it stays fixed on screen */}
      {isXRayActive && <XRayHUD />}
    </div>
  );
}
