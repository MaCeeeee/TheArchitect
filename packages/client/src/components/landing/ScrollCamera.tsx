import { useRef, MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_KEYFRAMES, easeInOutCubic, findCameraKeyframes, SCROLL_ZONES } from './landing.constants';

// Re-export for consumers
export { SCROLL_ZONES };

interface Props {
  scrollRef: MutableRefObject<number>;
}

export default function ScrollCamera({ scrollRef }: Props) {
  const { camera } = useThree();
  const posTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  useFrame(() => {
    const { from, to, t } = findCameraKeyframes(scrollRef.current);

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
