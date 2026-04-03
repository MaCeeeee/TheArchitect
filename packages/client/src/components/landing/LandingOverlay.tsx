import { Link } from 'react-router-dom';
import { Sparkles, AlertCircle, ChevronDown } from 'lucide-react';
import { Header, UploadZone, TrustBar, FEATURES } from './LandingFallback';

interface OverlayProps {
  phase: 'landing' | 'uploading' | 'scanning';
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoClick?: () => void;
  error: string | null;
}

export default function LandingOverlay({ phase, dragOver, setDragOver, onDrop, onFileSelect, onDemoClick, error }: OverlayProps) {
  return (
    <div className="w-full">
      <Header />

      {/* ── Section 1: Hero ── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 relative">
        <div className="text-center max-w-3xl w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#00ff41]/10 border border-[#00ff41]/20 rounded-full text-sm text-[#00ff41] mb-6 backdrop-blur-sm">
            <Sparkles className="w-4 h-4" /> AI-Powered Architecture Intelligence
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-5 drop-shadow-[0_0_30px_rgba(0,255,65,0.15)]">
            Transform your architecture<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ff41] to-[#06b6d4]">
              from chaos to clarity
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300/80 max-w-2xl mx-auto mb-10">
            From startup to enterprise — upload your architecture artifacts and get an AI-powered
            health assessment in 60 seconds. No account required.
          </p>

          <UploadZone phase={phase} dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onFileSelect={onFileSelect} onDemoClick={onDemoClick} />

          {error && (
            <div className="max-w-lg mx-auto mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm backdrop-blur-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="absolute bottom-8 flex flex-col items-center gap-1 text-[#00ff41]/60 animate-bounce">
          <span className="text-xs uppercase tracking-[0.2em]">Scroll to explore</span>
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ── Section 2: Problem → Solution ── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-2xl backdrop-blur-sm bg-[#050508]/30 rounded-2xl p-10 border border-white/5">
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-3 leading-tight">
            Your architecture is <span className="text-red-400">complex</span>.
          </h2>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-8 leading-tight">
            We make it <span className="text-[#00ff41] drop-shadow-[0_0_20px_rgba(0,255,65,0.4)]">visible</span>.
          </h2>
          <p className="text-lg text-slate-400">
            Watch as chaos transforms into clarity — layers emerge, dependencies become traceable,
            and risks surface before they become incidents.
          </p>
        </div>
      </section>

      {/* ── Section 3: Features ── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="max-w-5xl w-full">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
            Everything you need to <span className="text-[#00ff41]">govern</span> your architecture
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="backdrop-blur-md bg-[#050508]/60 border border-white/5 rounded-xl p-7 hover:border-[#00ff41]/20 transition-all hover:bg-[#050508]/80 group">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: `${color}15` }}>
                  <Icon className="w-6 h-6" style={{ color }} />
                </div>
                <h3 className="text-white font-semibold mb-2 text-lg">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: CTA ── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-2xl w-full">
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
            Start your free<br />
            <span className="text-[#00ff41] drop-shadow-[0_0_20px_rgba(0,255,65,0.4)]">health check</span>
          </h2>
          <p className="text-lg text-slate-400 mb-10">
            No sign-up needed. Upload, analyze, transform.
          </p>

          <UploadZone phase={phase} dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onFileSelect={onFileSelect} onDemoClick={onDemoClick} />

          <div className="mt-12">
            <TrustBar />
          </div>

          <div className="mt-8 border-t border-white/5 pt-6">
            <p className="text-slate-500 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-[#00ff41] hover:text-[#00ff41]/80 transition-colors">Sign in</Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} TheArchitect</span>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
            <Link to="/imprint" className="hover:text-slate-300 transition-colors">Imprint</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
