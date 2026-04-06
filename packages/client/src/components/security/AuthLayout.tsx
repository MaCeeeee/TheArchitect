import { Suspense, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import MatrixRain3D from '../landing/MatrixRain3D';
import TheArchitectLogo from '../landing/TheArchitectLogo';

export default function AuthLayout() {
  const scrollRef = useRef(0);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#0a0a0a] px-4 overflow-hidden">
      {/* 3D Matrix rain background */}
      <div className="absolute inset-0 z-0">
        <Canvas
          gl={{ antialias: false, alpha: false, powerPreference: 'default' }}
          style={{ background: '#0a0a0a' }}
          dpr={[1, 1.5]}
          camera={{ fov: 60, near: 0.1, far: 200, position: [0, 10, 30] }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.15} />
            <MatrixRain3D perfLevel="low" scrollRef={scrollRef} />
          </Suspense>
        </Canvas>
      </div>

      {/* Content layer */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <TheArchitectLogo size={64} />
          <h1 className="text-3xl font-bold text-[#00ff41] drop-shadow-lg mt-3">TheArchitect</h1>
          <p className="text-sm text-slate-500 mt-1">Enterprise Architecture Management</p>
        </div>

        {/* Glass card */}
        <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl p-6 shadow-2xl shadow-black/40">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
