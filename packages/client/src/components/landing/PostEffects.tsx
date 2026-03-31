import { EffectComposer, Bloom, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2 } from 'three';

const CA_OFFSET = new Vector2(0.0005, 0.0005);

interface Props {
  perfLevel: 'high' | 'low';
}

export default function PostEffects({ perfLevel }: Props) {
  if (perfLevel !== 'high') return null;

  return (
    <EffectComposer>
      <Bloom
        intensity={1.2}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={CA_OFFSET}
        radialModulation={false}
        modulationOffset={0.0}
      />
      <Noise
        blendFunction={BlendFunction.SOFT_LIGHT}
        premultiply
      />
    </EffectComposer>
  );
}
