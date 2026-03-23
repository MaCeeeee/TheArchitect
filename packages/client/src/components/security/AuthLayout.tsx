import { Outlet } from 'react-router-dom';
import ATCShader from '../ui/atc-shader';

export default function AuthLayout() {
  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[var(--surface-base)] px-4 overflow-hidden">
      {/* Shader background */}
      <ATCShader />

      {/* Content layer */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#00ff41] drop-shadow-lg">TheArchitect</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Enterprise Architecture Management</p>
        </div>

        {/* Glass card */}
        <div className="rounded-xl border border-[var(--border-subtle)]/50 bg-[var(--surface-raised)]/80 backdrop-blur-xl p-6 shadow-2xl shadow-black/20 transition-all">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
