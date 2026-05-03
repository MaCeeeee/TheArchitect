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
import ScenarioLayers from './ScenarioLayers';

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

      {/* Scenario comparison layers — visible in all sub-views when comparison active */}
      <ScenarioLayers />
    </group>
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Bucket-aligned tick labels per subview. Positions correspond to the X-axis
// columns produced by xrayStore.computePositions (5 buckets evenly spread
// across SCALE_WIDTH=24, so bucket b sits at x = (b/4)*24 - 12).
//
// Risk: continuous skala — only show endpoints.
// Cost: continuous skala — only show endpoints.
// Timeline: discrete buckets per status — show one label per used bucket so
//   the user knows column 0 = Current, 1 = Transitional, 3 = Target,
//   4 = Retired (column 2 stays empty as a visual gap).
const SCALE_LABELS: Record<string, { ticks: { x: number; label: string; isAccent?: boolean }[]; lineColor: string }> = {
  risk: {
    ticks: [
      { x: -12, label: 'Low Risk' },
      { x: 12, label: 'Critical Risk', isAccent: true },
    ],
    lineColor: '#ef4444',
  },
  cost: {
    ticks: [
      { x: -12, label: '€ Low' },
      { x: 12, label: '€ High', isAccent: true },
    ],
    lineColor: '#f97316',
  },
  timeline: {
    // Just the endpoints — the bucket positions of intermediate statuses
    // (transitional, target) are visually obvious from the columns themselves.
    // Reduces cognitive load per BSH demo feedback 2026-05-03.
    ticks: [
      { x: -12, label: 'Current' },                  // bucket 0
      { x: 12,  label: 'Retired', isAccent: true },  // bucket 4
    ],
    lineColor: '#3b82f6',
  },
};

function ScaleAxisLabels({ subView }: { subView: XRaySubView }) {
  const elements = useArchitectureStore((s) => s.elements);

  // Find which layers have elements
  const activeLayers = useMemo(() => {
    const layerSet = new Set(elements.map((e) => e.layer));
    return ARCHITECTURE_LAYERS.filter((l) => layerSet.has(l.id));
  }, [elements]);

  const config = SCALE_LABELS[subView];
  if (!config) return null;

  const HALF_WIDTH = 12;

  return (
    <group>
      {activeLayers.map((layer) => (
        <group key={layer.id}>
          {config.ticks.map((tick, idx) => {
            // Push the leftmost tick a bit further left, the rightmost further
            // right, to keep them off the layer-plateau edge.
            const isFirst = idx === 0;
            const isLast = idx === config.ticks.length - 1;
            const xOffset = isFirst ? tick.x - 1.5 : isLast ? tick.x + 1.5 : tick.x;
            return (
              <Html
                key={`${layer.id}-${idx}`}
                position={[xOffset, layer.yPosition, 0]}
                center
                style={{ pointerEvents: 'none' }}
              >
                <div style={{
                  color: tick.isAccent ? config.lineColor : '#22c55e',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 6px rgba(0,0,0,0.8)',
                  opacity: 0.8,
                }}>
                  {tick.label}
                </div>
              </Html>
            );
          })}
          {/* Scale line */}
          <mesh position={[0, layer.yPosition - 0.05, 0]} rotation={[0, 0, 0]}>
            <boxGeometry args={[HALF_WIDTH * 2, 0.02, 0.02]} />
            <meshBasicMaterial color={config.lineColor} transparent opacity={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
