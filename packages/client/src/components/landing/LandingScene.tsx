import { Suspense, useState, useCallback, useRef, MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor, Stars } from '@react-three/drei';
import * as THREE from 'three';
import DemoArchitecture from './DemoArchitecture';
import MatrixRain3D from './MatrixRain3D';
import LandingLayerPlanes from './LandingLayerPlanes';
import LandingXRay from './LandingXRay';
import ScrollCamera from './ScrollCamera';
import PostEffects from './PostEffects';
import LandingOverlay from './LandingOverlay';
import { SCROLL_ZONES } from './landing.constants';

type PerfLevel = 'high' | 'low';

// ─── Scroll-reactive lighting ───
function DynamicLighting({ scrollRef }: { scrollRef: MutableRefObject<number> }) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const blueRef = useRef<THREE.PointLight>(null);
  const greenRef = useRef<THREE.PointLight>(null);
  const { scene } = useThree();

  useFrame(() => {
    const s = scrollRef.current;
    const [xStart, xEnd] = SCROLL_ZONES.XRAY;

    let xrayT = 0;
    if (s >= 0.55 && s < 0.62) {
      xrayT = (s - 0.55) / 0.07;
    } else if (s >= 0.62 && s < 0.73) {
      xrayT = 1;
    } else if (s >= 0.73 && s < xEnd) {
      xrayT = 1 - (s - 0.73) / (xEnd - 0.73);
    }
    xrayT = Math.max(0, Math.min(1, xrayT));

    // Ambient: dim during X-Ray
    if (ambientRef.current) {
      ambientRef.current.intensity += ((0.35 - 0.15 * xrayT) - ambientRef.current.intensity) * 0.06;
    }

    // Blue light: ramp up during X-Ray
    if (blueRef.current) {
      blueRef.current.intensity += (0.5 * xrayT - blueRef.current.intensity) * 0.06;
    }

    // Green accent: dim during X-Ray
    if (greenRef.current) {
      greenRef.current.intensity += ((0.5 - 0.4 * xrayT) - greenRef.current.intensity) * 0.06;
    }

    // Background color transition
    const baseColor = new THREE.Color('#050508');
    const xrayColor = new THREE.Color('#080e1a');
    scene.background = baseColor.clone().lerp(xrayColor, xrayT);
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.35} />
      <directionalLight position={[10, 20, 10]} intensity={0.6} />
      <pointLight ref={greenRef} position={[-5, 8, -5]} intensity={0.5} color="#00ff41" distance={50} />
      <pointLight position={[5, -3, 5]} intensity={0.3} color="#06b6d4" distance={35} />
      <pointLight ref={blueRef} position={[0, 25, 0]} intensity={0} color="#3b82f6" distance={60} />
    </>
  );
}

// ─── Main ───
interface Props {
  initialPerfLevel: PerfLevel;
  phase: 'landing' | 'uploading' | 'scanning';
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoClick?: () => void;
  error: string | null;
}

export default function LandingScene({
  initialPerfLevel, phase, dragOver, setDragOver, onDrop, onFileSelect, onDemoClick, error,
}: Props) {
  const [perfLevel, setPerfLevel] = useState<PerfLevel>(initialPerfLevel);
  const scrollRef = useRef(0);

  const handleDecline = useCallback(() => setPerfLevel('low'), []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    scrollRef.current = max > 0 ? el.scrollTop / max : 0;
  }, []);

  return (
    <div className="fixed inset-0 z-50">
      {/* ── Fixed 3D Canvas (background) ── */}
      <div className="absolute inset-0 z-0">
        <Canvas
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          style={{ background: '#050508' }}
          dpr={[1, 2]}
          camera={{ fov: 60, near: 0.1, far: 200, position: [0, 30, 40] }}
        >
          <Suspense fallback={null}>
            <PerformanceMonitor onDecline={handleDecline}>
              <ScrollCamera scrollRef={scrollRef} />
              <DemoArchitecture perfLevel={perfLevel} scrollRef={scrollRef} />
              <LandingLayerPlanes scrollRef={scrollRef} />
              <LandingXRay scrollRef={scrollRef} />
              <MatrixRain3D perfLevel={perfLevel} scrollRef={scrollRef} />
              <PostEffects perfLevel={perfLevel} />
            </PerformanceMonitor>

            <DynamicLighting scrollRef={scrollRef} />

            {perfLevel === 'high' && (
              <Stars radius={80} depth={50} count={2500} factor={3} saturation={0} fade speed={0.4} />
            )}
          </Suspense>
        </Canvas>
      </div>

      {/* ── Scrollable HTML overlay (on top of canvas) ── */}
      <div
        className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden"
        onScroll={handleScroll}
      >
        <LandingOverlay
          phase={phase}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDrop={onDrop}
          onFileSelect={onFileSelect}
          onDemoClick={onDemoClick}
          error={error}
        />
      </div>

      {/* ── Upload/Scan overlay ── */}
      {(phase === 'uploading' || phase === 'scanning') && (
        <div className="absolute inset-0 z-20 bg-[#050508]/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            {phase === 'uploading' && (
              <>
                <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
                <p className="text-white font-medium">Uploading & parsing...</p>
              </>
            )}
            {phase === 'scanning' && (
              <>
                <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-[#00ff41] animate-pulse flex items-center justify-center">
                  <span className="text-[#00ff41] text-lg font-bold">AI</span>
                </div>
                <p className="text-white font-medium">Running AI Health Check...</p>
                <p className="text-sm text-slate-500 mt-1">14 detectors analyzing your architecture</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
