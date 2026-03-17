import { Outlet } from 'react-router-dom';
import ATCShader from '../ui/atc-shader';

export default function AuthLayout() {
  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#0f172a] px-4 overflow-hidden">
      {/* Shader background */}
      <ATCShader />

      {/* Content layer */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#7c3aed] drop-shadow-lg">TheArchitect</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Enterprise Architecture Management</p>
        </div>

        {/* Glass card */}
        <div className="rounded-xl border border-[#334155]/50 bg-[#1e293b]/80 backdrop-blur-xl p-6 shadow-2xl shadow-black/20 transition-all">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
