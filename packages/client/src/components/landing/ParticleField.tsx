import { useRef, useMemo, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SCROLL_ZONES } from './landing.constants';

const COUNT_HIGH = 2000;
const COUNT_LOW = 500;
const SPREAD = 60;
const HEIGHT = 40;
const RESET_Y = -10;
const TOP_Y = 30;

const COLOR_GREEN = new THREE.Color('#00ff41');
const COLOR_RED = new THREE.Color('#ef4444');

interface Props {
  perfLevel: 'high' | 'low';
  scrollRef: MutableRefObject<number>;
}

export default function ParticleField({ perfLevel, scrollRef }: Props) {
  const count = perfLevel === 'high' ? COUNT_HIGH : COUNT_LOW;
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

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
    if (!pointsRef.current || !matRef.current) return;
    const s = scrollRef.current;

    // Speed multiplier: slow down in upload zone
    const uploadStart = SCROLL_ZONES.UPLOAD[0];
    const speedMul = s > uploadStart ? 0.4 : 1;

    // Color: lerp to red in X-Ray zone
    const [xStart, xEnd] = SCROLL_ZONES.XRAY;
    let xrayT = 0;
    if (s >= xStart && s < xEnd) {
      xrayT = Math.min((s - xStart) / (xEnd - xStart) * 2, 1);
    }
    const targetColor = COLOR_GREEN.clone().lerp(COLOR_RED, xrayT);
    matRef.current.color.lerp(targetColor, 0.06);

    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= velocities[i] * delta * speedMul;
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
        ref={matRef}
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
