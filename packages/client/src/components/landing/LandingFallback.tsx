import { Link } from 'react-router-dom';
import { Upload, Box, Shield, BarChart3, Sparkles, Loader2, Cpu, AlertCircle, CheckCircle2, Eye, Brain, Route, Zap } from 'lucide-react';
import MatrixRain from './MatrixRain';
import TheArchitectLogo from './TheArchitectLogo';

interface FallbackProps {
  phase: 'landing' | 'uploading' | 'scanning';
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoClick?: () => void;
  error: string | null;
}

export default function LandingFallback({ phase, dragOver, setDragOver, onDrop, onFileSelect, onDemoClick, error }: FallbackProps) {
  return (
    <div className="fixed inset-0 overflow-y-auto z-50 bg-[#0a0a0a]">
      <MatrixRain opacity={0.04} speed={0.6} density={0.96} />
      <div className="relative z-10">
        <Header />

        <main className="max-w-5xl mx-auto px-6">
          <section aria-label="Hero" id="main-content" className="text-center pt-16 pb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#00ff41]/10 border border-[#00ff41]/20 rounded-full text-sm text-[#00ff41] mb-6">
              <Sparkles className="w-4 h-4" /> AI-Powered Architecture Intelligence
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
              See your architecture<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ff41] to-[#06b6d4]">
                like never before
              </span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
              AI-native architecture analysis with 3D visualization,
              multi-agent simulation, and Monte Carlo roadmaps.
              Built by an Enterprise Architect — for Enterprise Architects.
            </p>

            <UploadZone phase={phase} dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onFileSelect={onFileSelect} onDemoClick={onDemoClick} />

            {error && (
              <div className="max-w-lg mx-auto mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </section>

          <section aria-label="Features" className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-10">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-[#111]/60 border border-white/5 rounded-xl p-6">
                <Icon className="w-8 h-8 mb-3" style={{ color }} />
                <h2 className="text-white font-semibold mb-2">{title}</h2>
                <p className="text-sm text-slate-400">{desc}</p>
              </div>
            ))}
          </section>

          <StatsBar />
          <DifferentiationGrid />
          <TrustBar />

          <div className="text-center pb-8 border-t border-white/5 pt-8">
            <p className="text-slate-500 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-[#00ff41] hover:text-[#00ff41]/80">Sign in</Link>
            </p>
          </div>

          <footer className="border-t border-white/5 py-8">
            <div className="flex flex-col items-center gap-4 text-xs text-slate-500 text-center">
              <div className="flex items-center gap-6">
                <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
                <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
                <Link to="/imprint" className="hover:text-slate-300 transition-colors">Imprint</Link>
              </div>
              <span>&copy; {new Date().getFullYear()} TheArchitect</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ─── Shared sub-components (exported for reuse in LandingOverlay) ───

export function Header() {
  return (
    <header className="border-b border-white/5 bg-[#0a0a0a]/60 backdrop-blur-md sticky top-0 z-30">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#00ff41] focus:text-black focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to content
      </a>
      <div className="w-full px-8 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <TheArchitectLogo size={32} />
          <span className="text-white font-semibold">TheArchitect</span>
        </Link>
        <Link
          to="/login"
          className="px-4 py-2 text-sm font-medium text-slate-200 bg-white/5 border border-white/20 rounded-lg hover:border-[#00ff41]/40 hover:text-[#00ff41] hover:bg-[#00ff41]/5 transition-colors"
        >
          Sign In
        </Link>
      </div>
    </header>
  );
}

export function UploadZone({ phase, dragOver, setDragOver, onDrop, onFileSelect, onDemoClick }: {
  phase: string; dragOver: boolean; setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void; onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoClick?: () => void;
}) {
  return (
    <div className="w-full flex flex-col items-center">
      <div
        className={`max-w-lg w-full border-2 border-dashed rounded-xl p-10 transition-all cursor-pointer text-center ${
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
            <p className="text-sm text-slate-500 mb-3">CSV, Excel, ArchiMate XML, or JSON &middot; Max 10MB</p>
            <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#00ff41] border border-[#00ff41]/30 rounded-lg hover:bg-[#00ff41]/10 transition-colors">
              Browse files
            </span>
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
      <label htmlFor="file-input" className="sr-only">Upload architecture file</label>
      <input
        id="file-input" type="file" className="hidden"
        accept=".csv,.xlsx,.xls,.xml,.archimate,.json"
        onChange={onFileSelect}
      />
      {phase === 'landing' && onDemoClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onDemoClick(); }}
          className="mt-4 text-sm text-slate-400 hover:text-[#00ff41] transition-colors"
        >
          or try with sample data
        </button>
      )}
    </div>
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

export function StatsBar() {
  const STATS = [
    { value: '14', label: 'AI Detectors' },
    { value: '80+', label: 'ArchiMate Types' },
    { value: '3D', label: 'Visualization' },
    { value: 'TOGAF 10', label: 'Compliant' },
  ];

  return (
    <section aria-label="Key statistics" className="border-t border-b border-white/5 py-10 px-6 my-8">
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {STATS.map(({ value, label }) => (
          <div key={label}>
            <div className="text-2xl md:text-3xl font-bold text-[#00ff41]">{value}</div>
            <div className="text-xs text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DifferentiationGrid() {
  const DIFFS = [
    {
      label: 'AI-native — not retrofitted',
      detail: '14 AI detectors, multi-agent simulation, and stochastic analysis are the core, not plugins.',
    },
    {
      label: '3D visualization — not 2D box diagrams',
      detail: 'React Three Fiber with layer planes, fly-to navigation, and WebGPU rendering.',
    },
    {
      label: 'Multi-agent simulation — not static analysis',
      detail: 'MiroFish simulates stakeholder behavior with fatigue index, emergence tracking, and anti-hallucination layer.',
    },
    {
      label: 'Product-led: try before you buy',
      detail: 'Free AI health check — no sales call, no enterprise contract, no setup wizard.',
    },
  ];

  return (
    <section aria-label="Differentiation" className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          Why not LeanIX, Ardoq, or Bizzdesign?
        </h2>
        <p className="text-slate-500 text-center max-w-xl mx-auto mb-10">
          No incumbent has AI-native architecture. Not yet.
        </p>
        <div className="space-y-4">
          {DIFFS.map(({ label, detail }) => (
            <div key={label} className="flex gap-4 rounded-lg border border-white/5 bg-[#111]/60 p-5 hover:border-[#00ff41]/20 transition">
              <CheckCircle2 className="w-5 h-5 text-[#00ff41] shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">{label}</p>
                <p className="text-sm text-slate-500 mt-1">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const FEATURES = [
  { icon: Box, title: '3D Visualization', desc: 'Interactive 3D architecture explorer with layers, connections, and real-time dependency mapping', color: '#00ff41' },
  { icon: Shield, title: 'TOGAF 10 & ArchiMate 3.2', desc: 'Automated compliance checking, ADM governance, and full ArchiMate metamodel support', color: '#06b6d4' },
  { icon: BarChart3, title: 'AI Advisor', desc: '14 detectors finding risks, orphans, circular dependencies, TIME classification, and cost hotspots', color: '#a855f7' },
] as const;
