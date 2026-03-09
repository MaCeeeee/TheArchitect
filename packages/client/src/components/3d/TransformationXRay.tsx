import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useXRayStore } from '../../stores/xrayStore';
import RiskTopology from './RiskTopology';
import CostGravity from './CostGravity';

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
      <ambientLight intensity={0.3} color="#7c3aed" />
      <pointLight position={[0, 25, 0]} intensity={0.4} color="#3b82f6" distance={60} />

      {/* Sub-view specific visuals */}
      {subView === 'risk' && <RiskTopology />}
      {subView === 'cost' && <CostGravity />}
    </group>
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
