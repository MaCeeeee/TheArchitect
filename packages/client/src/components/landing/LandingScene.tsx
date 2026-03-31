import { Suspense, useState, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor, Stars } from '@react-three/drei';
import DemoArchitecture from './DemoArchitecture';
import ParticleField from './ParticleField';
import ScrollCamera from './ScrollCamera';
import PostEffects from './PostEffects';
import LandingOverlay from './LandingOverlay';

type PerfLevel = 'high' | 'low';

interface Props {
  initialPerfLevel: PerfLevel;
  phase: 'landing' | 'uploading' | 'scanning';
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
}

export default function LandingScene({
  initialPerfLevel, phase, dragOver, setDragOver, onDrop, onFileSelect, error,
}: Props) {
  const [perfLevel, setPerfLevel] = useState<PerfLevel>(initialPerfLevel);
  const scrollRef = useRef(0); // 0–1 normalized scroll progress

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
          camera={{ fov: 60, near: 0.1, far: 200, position: [0, 5, 18] }}
        >
          <Suspense fallback={null}>
            <PerformanceMonitor onDecline={handleDecline}>
              <ScrollCamera scrollRef={scrollRef} />
              <DemoArchitecture perfLevel={perfLevel} scrollRef={scrollRef} />
              <ParticleField perfLevel={perfLevel} />
              <PostEffects perfLevel={perfLevel} />
            </PerformanceMonitor>

            {/* Lighting */}
            <ambientLight intensity={0.35} />
            <directionalLight position={[10, 20, 10]} intensity={0.6} />
            <pointLight position={[-5, 8, -5]} intensity={0.5} color="#00ff41" distance={50} />
            <pointLight position={[5, -3, 5]} intensity={0.3} color="#06b6d4" distance={35} />

            {perfLevel === 'high' && (
              <Stars radius={80} depth={50} count={2500} factor={3} saturation={0} fade speed={0.4} />
            )}
          </Suspense>
        </Canvas>
      </div>

      {/* ── Scrollable HTML overlay (on top of canvas) ── */}
      <div
        className="absolute inset-0 z-10 overflow-y-auto"
        onScroll={handleScroll}
      >
        <LandingOverlay
          phase={phase}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDrop={onDrop}
          onFileSelect={onFileSelect}
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
