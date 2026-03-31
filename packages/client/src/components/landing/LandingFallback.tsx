import { Link } from 'react-router-dom';
import { Upload, Box, Shield, BarChart3, Sparkles, Loader2, Cpu, AlertCircle, ChevronDown } from 'lucide-react';
import ATCShader from '../ui/atc-shader';

interface FallbackProps {
  phase: 'landing' | 'uploading' | 'scanning';
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
}

export default function LandingFallback({ phase, dragOver, setDragOver, onDrop, onFileSelect, error }: FallbackProps) {
  return (
    <div className="fixed inset-0 overflow-y-auto z-50">
      <ATCShader />

      <div className="relative z-10">
        <Header />

        <main className="max-w-5xl mx-auto px-6">
          <section className="text-center pt-16 pb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#00ff41]/10 border border-[#00ff41]/20 rounded-full text-sm text-[#00ff41] mb-6">
              <Sparkles className="w-4 h-4" /> AI-Powered Architecture Intelligence
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
              Transform your architecture<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ff41] to-[#06b6d4]">
                from chaos to clarity
              </span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
              From startup to enterprise — upload your architecture artifacts and get an AI-powered
              health assessment in 60 seconds. No account required.
            </p>

            <UploadZone phase={phase} dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onFileSelect={onFileSelect} />

            {error && (
              <div className="max-w-lg mx-auto mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-10">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-[#0a0a0a]/60 backdrop-blur-md border border-[#00ff41]/10 rounded-xl p-6">
                <Icon className="w-8 h-8 mb-3" style={{ color }} />
                <h3 className="text-white font-semibold mb-2">{title}</h3>
                <p className="text-sm text-slate-400">{desc}</p>
              </div>
            ))}
          </section>

          <TrustBar />

          <div className="text-center pb-12 border-t border-[#334155] pt-8">
            <p className="text-slate-500 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-[#00ff41] hover:text-[#00ff41]/80">Sign in</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Shared sub-components (exported for reuse in LandingOverlay) ───

export function Header() {
  return (
    <header className="border-b border-white/5 bg-[#0a0a0a]/60 backdrop-blur-md sticky top-0 z-30">
      <div className="w-full px-8 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00ff41] to-[#06b6d4] flex items-center justify-center">
            <span className="text-[#0a0a0a] font-bold text-sm">A</span>
          </div>
          <span className="text-white font-semibold">TheArchitect</span>
        </Link>
        <Link
          to="/login"
          className="px-4 py-2 text-sm text-slate-300 border border-white/10 rounded-lg hover:border-[#00ff41]/30 hover:text-[#00ff41] transition-colors"
        >
          Sign In
        </Link>
      </div>
    </header>
  );
}

export function UploadZone({ phase, dragOver, setDragOver, onDrop, onFileSelect }: {
  phase: string; dragOver: boolean; setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void; onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <div
        className={`max-w-lg w-full mx-auto border-2 border-dashed rounded-xl p-10 transition-all cursor-pointer text-center ${
          dragOver ? 'border-[#00ff41] bg-[#00ff41]/10' : 'border-white/10 hover:border-[#00ff41]/40'
        } ${phase !== 'landing' ? 'pointer-events-none opacity-60' : ''} backdrop-blur-sm bg-[#0a0a0a]/30`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        {phase === 'landing' && (
          <>
            <Upload className="w-10 h-10 text-[#00ff41]/50 mx-auto mb-3" />
            <p className="text-white font-medium mb-1">Drop your architecture file here</p>
            <p className="text-sm text-slate-500">CSV, Excel, ArchiMate XML, or JSON &middot; Max 10MB</p>
          </>
        )}
        {phase === 'uploading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-[#00ff41] animate-spin mb-3" />
            <p className="text-white font-medium">Uploading & parsing...</p>
          </div>
        )}
        {phase === 'scanning' && (
          <div className="flex flex-col items-center">
            <Cpu className="w-10 h-10 text-[#00ff41] animate-pulse mb-3" />
            <p className="text-white font-medium">Running AI Health Check...</p>
            <p className="text-sm text-slate-500 mt-1">14 detectors analyzing your architecture</p>
          </div>
        )}
      </div>
      <input
        id="file-input" type="file" className="hidden"
        accept=".csv,.xlsx,.xls,.xml,.archimate,.json"
        onChange={onFileSelect}
      />
    </>
  );
}

export function TrustBar() {
  return (
    <section className="text-center pb-10">
      <div className="flex items-center justify-center flex-wrap gap-x-8 gap-y-2 text-xs text-slate-500">
        <span>80+ ArchiMate element types</span>
        <span className="w-1 h-1 rounded-full bg-slate-600 hidden sm:block" />
        <span>Portfolio Management</span>
        <span className="w-1 h-1 rounded-full bg-slate-600 hidden sm:block" />
        <span>LeanIX & Jira Import</span>
        <span className="w-1 h-1 rounded-full bg-slate-600 hidden sm:block" />
        <span>Stakeholder Sharing</span>
      </div>
    </section>
  );
}

export const FEATURES = [
  { icon: Box, title: '3D Visualization', desc: 'Interactive 3D architecture explorer with layers, connections, and real-time dependency mapping', color: '#00ff41' },
  { icon: Shield, title: 'TOGAF 10 & ArchiMate 3.2', desc: 'Automated compliance checking, ADM governance, and full ArchiMate metamodel support', color: '#06b6d4' },
  { icon: BarChart3, title: 'AI Advisor', desc: '14 detectors finding risks, orphans, circular dependencies, TIME classification, and cost hotspots', color: '#a855f7' },
] as const;
