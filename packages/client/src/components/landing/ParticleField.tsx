import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT_HIGH = 2000;
const COUNT_LOW = 500;
const SPREAD = 60;
const HEIGHT = 40;
const RESET_Y = -10;
const TOP_Y = 30;

interface Props {
  perfLevel: 'high' | 'low';
}

export default function ParticleField({ perfLevel }: Props) {
  const count = perfLevel === 'high' ? COUNT_HIGH : COUNT_LOW;
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * SPREAD;
      pos[i * 3 + 1] = Math.random() * HEIGHT - 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
      vel[i] = 0.5 + Math.random() * 2;
    }
    return { positions: pos, velocities: vel };
  }, [count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= velocities[i] * delta;
      if (arr[i * 3 + 1] < RESET_Y) {
        arr[i * 3 + 1] = TOP_Y;
        arr[i * 3]     = (Math.random() - 0.5) * SPREAD;
        arr[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          itemSize={3}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#00ff41"
        size={perfLevel === 'high' ? 0.04 : 0.06}
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
