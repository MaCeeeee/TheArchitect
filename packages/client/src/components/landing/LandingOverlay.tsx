import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, AlertCircle, ChevronDown, CheckCircle2,
  Shield, Brain, Route, Eye, BarChart3, Loader2, Mail,
} from 'lucide-react';
import { Header, UploadZone, TrustBar, StatsBar, DifferentiationGrid } from './LandingFallback';
import api from '../../services/api';
import type { Lang } from '../../hooks/useLang';

type TFn = (key: string) => string;

interface OverlayProps {
  phase: 'landing' | 'uploading' | 'scanning';
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoClick?: () => void;
  error: string | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

export default function LandingOverlay({ phase, dragOver, setDragOver, onDrop, onFileSelect, onDemoClick, error, lang, setLang, t }: OverlayProps) {
  return (
    <div className="w-full max-w-[100vw]">
      <Header lang={lang} setLang={setLang} t={t} />

      {/* ── Section 0: Hero ── */}
      <section aria-label="Hero" className="min-h-screen flex flex-col items-center justify-center px-6 relative">
        <div className="text-center max-w-3xl w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#00ff41]/10 border border-[#00ff41]/20 rounded-full text-sm text-[#00ff41] mb-6 backdrop-blur-sm">
            <Sparkles className="w-4 h-4" /> {t('hero.badge')}
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-5 drop-shadow-[0_0_30px_rgba(0,255,65,0.15)]">
            {t('hero.title.pre')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ff41] to-[#06b6d4]">
              {t('hero.title.highlight')}
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300/80 max-w-2xl mx-auto mb-10">
            {t('hero.subtitle')}
          </p>
        </div>

        <div className="absolute bottom-8 flex flex-col items-center gap-1 text-[#00ff41]/60 animate-bounce">
          <span className="text-xs uppercase tracking-[0.2em]">{t('hero.scroll')}</span>
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ── Section 1: Strategy Layer ── */}
      <section aria-label="Strategy Layer" className="min-h-screen flex items-center px-6 md:px-12">
        <div className="backdrop-blur-md bg-[#050508]/40 rounded-2xl p-8 md:p-10 border border-white/5 max-w-md">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b5cf6]">
            {t('strategy.eyebrow')}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-4 leading-tight">
            {t('strategy.title')}
          </h2>
          <p className="text-slate-400 leading-relaxed mb-6">
            {t('strategy.body')}
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded-lg text-sm text-[#8b5cf6]">
            <Shield className="w-4 h-4" /> {t('strategy.badge')}
          </div>
        </div>
      </section>

      {/* ── Section 2: Business / Application Layer ── */}
      <section aria-label="Business and Application Layer" className="min-h-[150vh] flex items-center justify-end px-6 md:px-12">
        <div className="backdrop-blur-md bg-[#050508]/40 rounded-2xl p-8 md:p-10 border border-white/5 max-w-md">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#22c55e]">
            {t('biz.eyebrow')}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-4 leading-tight">
            {t('biz.title')}
          </h2>
          <p className="text-slate-400 leading-relaxed mb-6">
            {t('biz.body')}
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-lg text-sm text-[#22c55e]">
            <Brain className="w-4 h-4" /> {t('biz.badge')}
          </div>
        </div>
      </section>

      {/* ── Section 3: X-Ray / Risk View ── */}
      <section aria-label="X-Ray Risk Analysis" className="min-h-screen flex items-center justify-center px-6 bg-[#080e1a]/30">
        <div className="text-center max-w-3xl">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#ef4444] to-[#f59e0b]">
            {t('xray.eyebrow')}
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-3 mb-4 leading-tight">
            {t('xray.title')}
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            {t('xray.body')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Eye, titleKey: 'xray.card1.title', descKey: 'xray.card1.desc', color: '#ef4444' },
              { icon: BarChart3, titleKey: 'xray.card2.title', descKey: 'xray.card2.desc', color: '#f59e0b' },
              { icon: Route, titleKey: 'xray.card3.title', descKey: 'xray.card3.desc', color: '#06b6d4' },
            ].map(({ icon: Icon, titleKey, descKey, color }) => (
              <div key={titleKey} className="backdrop-blur-md bg-[#050508]/60 border border-white/5 rounded-xl p-5 text-left">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${color}15` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <h3 className="text-white font-semibold mb-1">{t(titleKey)}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: Health Check Upload ── */}
      <section aria-label="Architecture Health Check" id="main-content" className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-2xl w-full">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            {t('health.title.pre')}{' '}
            <span className="text-[#00ff41] drop-shadow-[0_0_20px_rgba(0,255,65,0.4)]">{t('health.title.highlight')}</span>
          </h2>
          <p className="text-lg text-slate-400 mb-10">
            {t('health.subtitle')}
          </p>

          <div className="backdrop-blur-xl bg-[#0a0a0a]/60 border border-[#00ff41]/10 rounded-2xl p-8">
            <UploadZone phase={phase} dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onFileSelect={onFileSelect} onDemoClick={onDemoClick} t={t} />
          </div>

          {error && (
            <div className="max-w-lg mx-auto mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm backdrop-blur-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <p className="text-slate-500 text-sm mt-8">
            {t('health.haveAccount')}{' '}
            <Link to="/login" className="text-[#00ff41] hover:text-[#00ff41]/80 transition-colors">{t('health.signin')}</Link>
          </p>
        </div>
      </section>

      {/* ── Section 5: Stats ── */}
      <StatsBar t={t} />

      {/* ── Section 6: Differentiation ── */}
      <DifferentiationGrid t={t} />

      {/* ── Section 7: Waitlist ── */}
      <WaitlistSection t={t} />

      {/* ── Section 8: Footer ── */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4 text-xs text-slate-500 text-center">
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">{t('footer.privacy')}</Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">{t('footer.terms')}</Link>
            <Link to="/imprint" className="hover:text-slate-300 transition-colors">{t('footer.imprint')}</Link>
          </div>
          <span>&copy; {new Date().getFullYear()} TheArchitect</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Waitlist Section ───

function WaitlistSection({ t }: { t: TFn }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');
    try {
      const { data } = await api.post('/waitlist', {
        email,
        name: name || undefined,
        company: company || undefined,
        referrer: document.referrer || undefined,
      });
      setStatus('success');
      setMessage(data.message || t('waitlist.success'));
    } catch (err: any) {
      setStatus('error');
      setMessage(err.response?.data?.error || t('waitlist.error'));
    }
  };

  return (
    <section aria-label="Join the Waitlist" className="min-h-[60vh] flex items-center justify-center px-6 py-20">
      <div className="text-center max-w-lg w-full">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00ff41]">
          {t('waitlist.eyebrow')}
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-white mt-3 mb-3 leading-tight">
          {t('waitlist.title')}
        </h2>
        <p className="text-slate-400 mb-8">
          {t('waitlist.body')}
        </p>

        {status === 'success' ? (
          <div className="flex items-center justify-center gap-3 px-6 py-4 bg-[#00ff41]/10 border border-[#00ff41]/20 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-[#00ff41] shrink-0" />
            <span className="text-[#00ff41]">{message}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('waitlist.emailPlaceholder')}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-[#00ff41]/50 transition text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('waitlist.namePlaceholder')}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-[#00ff41]/50 transition text-sm"
              />
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t('waitlist.companyPlaceholder')}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 outline-none focus:border-[#00ff41]/50 transition text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={status === 'loading' || !email}
              className="w-full py-3 rounded-xl bg-[#00ff41] text-black font-semibold text-sm hover:bg-[#00cc33] disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {status === 'loading' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('waitlist.submitting')}</>
              ) : (
                t('waitlist.submit')
              )}
            </button>
            {status === 'error' && (
              <p className="text-red-400 text-xs flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" /> {message}
              </p>
            )}
            <p className="text-[10px] text-slate-600 mt-2">
              {t('waitlist.legalPre')}{' '}
              <Link to="/privacy" className="text-slate-400 hover:text-white transition">{t('waitlist.legalLink')}</Link>{t('waitlist.legalPost')}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
