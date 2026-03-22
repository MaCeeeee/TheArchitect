import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useXRayStore, XRaySubView } from '../../stores/xrayStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared';
import RiskTopology from './RiskTopology';
import CostGravity from './CostGravity';
import SimulationTopology from './SimulationTopology';

/**
 * TransformationXRay is the main orchestrator for X-Ray mode.
 * It mounts inside the Canvas and:
 * 1. Adjusts camera for optimal X-Ray viewing angle
 * 2. Adds additional ambient lighting for the mode
 * 3. Renders the appropriate sub-view component
 * 4. Renders the HUD overlay
 */
export default function TransformationXRay() {
  const isActive = useXRayStore((s) => s.isActive);
  const subView = useXRayStore((s) => s.subView);
  const { camera } = useThree();

  // Smoothly move camera to elevated overview position when X-Ray activates
  useEffect(() => {
    if (!isActive) return;

    const targetPos = new THREE.Vector3(25, 20, 25);
    const currentPos = camera.position.clone();

    let frame: number;
    let progress = 0;

    const animate = () => {
      progress += 0.02;
      if (progress >= 1) {
        camera.position.copy(targetPos);
        camera.lookAt(0, 4, 0);
        return;
      }
      const t = easeInOutCubic(progress);
      camera.position.lerpVectors(currentPos, targetPos, t);
      camera.lookAt(0, 4, 0);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isActive, camera]);

  if (!isActive) return null;

  return (
    <group>
      {/* Extra ambient light for X-Ray mode visibility */}
      <ambientLight intensity={0.3} color="#00ff41" />
      <pointLight position={[0, 25, 0]} intensity={0.4} color="#3b82f6" distance={60} />

      {/* Scale axis labels for risk/cost/timeline views */}
      {subView !== 'simulation' && <ScaleAxisLabels subView={subView} />}

      {/* Sub-view specific visuals */}
      {subView === 'risk' && <RiskTopology />}
      {subView === 'cost' && <CostGravity />}
      {subView === 'simulation' && <SimulationTopology />}
    </group>
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const SCALE_LABELS: Record<string, { left: string; right: string; color: string }> = {
  risk: { left: 'Low Risk', right: 'Critical Risk', color: '#ef4444' },
  cost: { left: '€ Low', right: '€ High', color: '#f97316' },
  timeline: { left: 'Current', right: 'Target', color: '#3b82f6' },
};

function ScaleAxisLabels({ subView }: { subView: XRaySubView }) {
  const elements = useArchitectureStore((s) => s.elements);

  // Find which layers have elements
  const activeLayers = useMemo(() => {
    const layerSet = new Set(elements.map((e) => e.layer));
    return ARCHITECTURE_LAYERS.filter((l) => layerSet.has(l.id));
  }, [elements]);

  const labels = SCALE_LABELS[subView];
  if (!labels) return null;

  const HALF_WIDTH = 12;

  return (
    <group>
      {activeLayers.map((layer) => (
        <group key={layer.id}>
          {/* Left label */}
          <Html
            position={[-HALF_WIDTH - 1.5, layer.yPosition, 0]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              color: '#22c55e',
              fontSize: '10px',
              fontFamily: 'monospace',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textShadow: '0 0 6px rgba(0,0,0,0.8)',
              opacity: 0.8,
            }}>
              {labels.left}
            </div>
          </Html>
          {/* Right label */}
          <Html
            position={[HALF_WIDTH + 1.5, layer.yPosition, 0]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              color: labels.color,
              fontSize: '10px',
              fontFamily: 'monospace',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textShadow: '0 0 6px rgba(0,0,0,0.8)',
              opacity: 0.8,
            }}>
              {labels.right}
            </div>
          </Html>
          {/* Scale line */}
          <mesh position={[0, layer.yPosition - 0.05, 0]} rotation={[0, 0, 0]}>
            <boxGeometry args={[HALF_WIDTH * 2, 0.02, 0.02]} />
            <meshBasicMaterial color={labels.color} transparent opacity={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
