import { Link } from 'react-router-dom';
import { Upload, Box, Shield, BarChart3, Sparkles, Loader2, Cpu, AlertCircle, CheckCircle2 } from 'lucide-react';
import MatrixRain from './MatrixRain';
import TheArchitectLogo from './TheArchitectLogo';
import { useLang, type Lang } from '../../hooks/useLang';

type TFn = (key: string) => string;

interface FallbackProps {
  phase: 'landing' | 'uploading' | 'scanning';
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoClick?: () => void;
  error: string | null;
  lang?: Lang;
  setLang?: (l: Lang) => void;
  t?: TFn;
}

export default function LandingFallback({ phase, dragOver, setDragOver, onDrop, onFileSelect, onDemoClick, error, lang: langProp, setLang: setLangProp, t: tProp }: FallbackProps) {
  // Fallback to own useLang when mounted standalone (minimal perfLevel path)
  const own = useLang();
  const lang = langProp ?? own.lang;
  const setLang = setLangProp ?? own.setLang;
  const t = tProp ?? own.t;

  return (
    <div className="fixed inset-0 overflow-y-auto z-50 bg-[#0a0a0a]">
      <MatrixRain opacity={0.04} speed={0.6} density={0.96} />
      <div className="relative z-10">
        <Header lang={lang} setLang={setLang} t={t} />

        <main className="max-w-5xl mx-auto px-6">
          <section aria-label="Hero" id="main-content" className="text-center pt-16 pb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#00ff41]/10 border border-[#00ff41]/20 rounded-full text-sm text-[#00ff41] mb-6">
              <Sparkles className="w-4 h-4" /> {t('hero.badge')}
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
              {t('hero.title.pre')}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ff41] to-[#06b6d4]">
                {t('hero.title.highlight')}
              </span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
              {t('hero.subtitle')}
            </p>

            <UploadZone phase={phase} dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onFileSelect={onFileSelect} onDemoClick={onDemoClick} t={t} />

            {error && (
              <div className="max-w-lg mx-auto mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </section>

          <section aria-label="Features" className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-10">
            {FEATURES.map(({ icon: Icon, titleKey, descKey, color }) => (
              <div key={titleKey} className="bg-[#111]/60 border border-white/5 rounded-xl p-6">
                <Icon className="w-8 h-8 mb-3" style={{ color }} />
                <h2 className="text-white font-semibold mb-2">{t(titleKey)}</h2>
                <p className="text-sm text-slate-400">{t(descKey)}</p>
              </div>
            ))}
          </section>

          <StatsBar t={t} />
          <DifferentiationGrid t={t} />
          <TrustBar t={t} />

          <div className="text-center pb-8 border-t border-white/5 pt-8">
            <p className="text-slate-500 text-sm">
              {t('health.haveAccount')}{' '}
              <Link to="/login" className="text-[#00ff41] hover:text-[#00ff41]/80">{t('health.signin')}</Link>
            </p>
          </div>

          <footer className="border-t border-white/5 py-8">
            <div className="flex flex-col items-center gap-4 text-xs text-slate-500 text-center">
              <div className="flex items-center gap-6">
                <Link to="/privacy" className="hover:text-slate-300 transition-colors">{t('footer.privacy')}</Link>
                <Link to="/terms" className="hover:text-slate-300 transition-colors">{t('footer.terms')}</Link>
                <Link to="/imprint" className="hover:text-slate-300 transition-colors">{t('footer.imprint')}</Link>
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

export function Header({ lang, setLang, t }: { lang: Lang; setLang: (l: Lang) => void; t: TFn }) {
  return (
    <header className="border-b border-white/5 bg-[#0a0a0a]/60 backdrop-blur-md sticky top-0 z-30">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#00ff41] focus:text-black focus:rounded-lg focus:text-sm focus:font-medium">
        {t('header.skipToContent')}
      </a>
      <div className="w-full px-8 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <TheArchitectLogo size={32} />
          <span className="text-white font-semibold">TheArchitect</span>
        </Link>
        <div className="flex items-center gap-3">
          <div role="group" aria-label="Language" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setLang('de')}
              aria-pressed={lang === 'de'}
              className={`px-2.5 py-0.5 rounded-full transition-colors ${
                lang === 'de' ? 'bg-[#00ff41]/20 text-[#00ff41]' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              DE
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
              className={`px-2.5 py-0.5 rounded-full transition-colors ${
                lang === 'en' ? 'bg-[#00ff41]/20 text-[#00ff41]' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              EN
            </button>
          </div>
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-medium text-slate-200 bg-white/5 border border-white/20 rounded-lg hover:border-[#00ff41]/40 hover:text-[#00ff41] hover:bg-[#00ff41]/5 transition-colors"
          >
            {t('header.signin')}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function UploadZone({ phase, dragOver, setDragOver, onDrop, onFileSelect, onDemoClick, t }: {
  phase: string; dragOver: boolean; setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void; onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoClick?: () => void;
  t: TFn;
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
            <p className="text-white font-medium mb-1">{t('upload.drop')}</p>
            <p className="text-sm text-slate-500 mb-3">{t('upload.formats')}</p>
            <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#00ff41] border border-[#00ff41]/30 rounded-lg hover:bg-[#00ff41]/10 transition-colors">
              {t('upload.browse')}
            </span>
          </>
        )}
        {phase === 'uploading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-[#00ff41] animate-spin mb-3" />
            <p className="text-white font-medium">{t('upload.uploading')}</p>
          </div>
        )}
        {phase === 'scanning' && (
          <div className="flex flex-col items-center">
            <Cpu className="w-10 h-10 text-[#00ff41] animate-pulse mb-3" />
            <p className="text-white font-medium">{t('upload.scanning')}</p>
            <p className="text-sm text-slate-500 mt-1">{t('upload.scanningDesc')}</p>
          </div>
        )}
      </div>
      <label htmlFor="file-input" className="sr-only">{t('upload.srLabel')}</label>
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
          {t('upload.demo')}
        </button>
      )}
    </div>
  );
}

export function TrustBar({ t }: { t: TFn }) {
  return (
    <section className="text-center pb-10">
      <div className="flex items-center justify-center flex-wrap gap-x-8 gap-y-2 text-xs text-slate-500">
        <span>{t('trust.1')}</span>
        <span className="w-1 h-1 rounded-full bg-slate-600 hidden sm:block" />
        <span>{t('trust.2')}</span>
        <span className="w-1 h-1 rounded-full bg-slate-600 hidden sm:block" />
        <span>{t('trust.3')}</span>
        <span className="w-1 h-1 rounded-full bg-slate-600 hidden sm:block" />
        <span>{t('trust.4')}</span>
      </div>
    </section>
  );
}

export function StatsBar({ t }: { t: TFn }) {
  const STATS = [
    { value: '14', labelKey: 'stats.1.label' },
    { value: '80+', labelKey: 'stats.2.label' },
    { value: '3D', labelKey: 'stats.3.label' },
    { value: 'TOGAF 10', labelKey: 'stats.4.label' },
  ];

  return (
    <section aria-label="Key statistics" className="border-t border-b border-white/5 py-10 px-6 my-8">
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {STATS.map(({ value, labelKey }) => (
          <div key={labelKey}>
            <div className="text-2xl md:text-3xl font-bold text-[#00ff41]">{value}</div>
            <div className="text-xs text-slate-500 mt-1">{t(labelKey)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DifferentiationGrid({ t }: { t: TFn }) {
  const DIFFS = [
    { labelKey: 'diff.1.label', detailKey: 'diff.1.detail' },
    { labelKey: 'diff.2.label', detailKey: 'diff.2.detail' },
    { labelKey: 'diff.3.label', detailKey: 'diff.3.detail' },
    { labelKey: 'diff.4.label', detailKey: 'diff.4.detail' },
  ];

  return (
    <section aria-label="Differentiation" className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-4">
          {t('diff.heading')}
        </h2>
        <p className="text-slate-500 text-center max-w-xl mx-auto mb-10">
          {t('diff.subheading')}
        </p>
        <div className="space-y-4">
          {DIFFS.map(({ labelKey, detailKey }) => (
            <div key={labelKey} className="flex gap-4 rounded-lg border border-white/5 bg-[#111]/60 p-5 hover:border-[#00ff41]/20 transition">
              <CheckCircle2 className="w-5 h-5 text-[#00ff41] shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">{t(labelKey)}</p>
                <p className="text-sm text-slate-500 mt-1">{t(detailKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const FEATURES = [
  { icon: Box, titleKey: 'features.1.title', descKey: 'features.1.desc', color: '#00ff41' },
  { icon: Shield, titleKey: 'features.2.title', descKey: 'features.2.desc', color: '#06b6d4' },
  { icon: BarChart3, titleKey: 'features.3.title', descKey: 'features.3.desc', color: '#a855f7' },
] as const;
