import { useRef, MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const KEYFRAMES = [
  { pos: [0, 5, 18],    lookAt: [0, 1, 0] },   // Section 1: Hero — front view
  { pos: [6, 7, 12],    lookAt: [0, 1, 0] },   // Section 2: Problem/Solution — closer, angled
  { pos: [-8, 4, 14],   lookAt: [0, 1, 0] },   // Section 3: Features — orbit left
  { pos: [0, 10, 22],   lookAt: [0, 0, 0] },   // Section 4: CTA — dramatic pullback
] as const;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Props {
  scrollRef: MutableRefObject<number>;
}

export default function ScrollCamera({ scrollRef }: Props) {
  const { camera } = useThree();
  const posTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  useFrame(() => {
    const offset = scrollRef.current; // 0–1
    const segments = KEYFRAMES.length - 1;
    const raw = offset * segments;
    const i = Math.min(Math.floor(raw), segments - 1);
    const t = easeInOutCubic(Math.min(raw - i, 1));

    const from = KEYFRAMES[i];
    const to = KEYFRAMES[i + 1];

    posTarget.current.set(
      from.pos[0] + (to.pos[0] - from.pos[0]) * t,
      from.pos[1] + (to.pos[1] - from.pos[1]) * t,
      from.pos[2] + (to.pos[2] - from.pos[2]) * t,
    );
    lookTarget.current.set(
      from.lookAt[0] + (to.lookAt[0] - from.lookAt[0]) * t,
      from.lookAt[1] + (to.lookAt[1] - from.lookAt[1]) * t,
      from.lookAt[2] + (to.lookAt[2] - from.lookAt[2]) * t,
    );

    camera.position.lerp(posTarget.current, 0.06);
    camera.lookAt(lookTarget.current);
  });

  return null;
}
