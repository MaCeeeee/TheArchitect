import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import HealthScoreRing from '../healthcheck/HealthScoreRing';
import LandingFallback from './LandingFallback';
import TheArchitectLogo from './TheArchitectLogo';
import { useLang } from '../../hooks/useLang';

const LandingScene = lazy(() => import('./LandingScene'));

const API_BASE = import.meta.env.VITE_API_URL || '/api';

type Phase = 'landing' | 'uploading' | 'scanning' | 'results';
type PerfLevel = 'high' | 'low' | 'minimal';

interface ScanResult {
  healthScore: { total: number; factors: Array<{ factor: string; weight: number; score: number; description: string }> };
  insights: Array<{ severity: string; title: string; description: string }>;
  totalElements: number;
  scanDurationMs: number;
  uploadToken: string;
  reportId: string;
}

function detectPerformanceLevel(): PerfLevel {
  // Mobile or very narrow screen → minimal
  if (typeof window !== 'undefined' && window.innerWidth < 768) return 'minimal';
  // Check for WebGL2 support
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'minimal';
  } catch {
    return 'minimal';
  }
  // Low-end desktop
  const cores = navigator.hardwareConcurrency || 2;
  if (cores < 4) return 'low';
  return 'high';
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { lang, setLang, t } = useLang();
  const [phase, setPhase] = useState<Phase>('landing');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  const perfLevel = useMemo(() => detectPerformanceLevel(), []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setPhase('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch(`${API_BASE}/healthcheck/upload`, { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.success) {
        setError(uploadData.message || t('error.upload'));
        setPhase('landing');
        return;
      }

      setPhase('scanning');
      const scanRes = await fetch(`${API_BASE}/healthcheck/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadToken: uploadData.data.uploadToken }),
      });
      const scanData = await scanRes.json();

      if (!scanRes.ok || !scanData.success) {
        setError(scanData.message || t('error.scan'));
        setPhase('landing');
        return;
      }

      setResult(scanData.data);
      setPhase('results');
    } catch {
      setError(t('error.connection'));
      setPhase('landing');
    }
  }, [t]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDemoClick = useCallback(async () => {
    try {
      const res = await fetch('/demo-architecture.csv');
      const blob = await res.blob();
      const file = new File([blob], 'demo-architecture.csv', { type: 'text/csv' });
      handleFile(file);
    } catch {
      setError(t('upload.demoFailed'));
    }
  }, [handleFile, t]);

  // ─── Results View ───
  if (phase === 'results' && result) {
    const criticalCount = result.insights.filter((i) => i.severity === 'critical' || i.severity === 'high').length;

    return (
      <div className="fixed inset-0 overflow-y-auto bg-[#0a0a0a] z-50">
        <header className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <TheArchitectLogo size={32} />
              <span className="text-white font-semibold">TheArchitect</span>
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-12">
          <div className="text-center mb-8">
            <HealthScoreRing score={result.healthScore.total} size={200} />
            <h1 className="text-2xl font-bold text-white mt-4">{t('results.title')}</h1>
            <p className="text-slate-400 mt-1">
              {result.totalElements} {t('results.analyzed.pre')} {(result.scanDurationMs / 1000).toFixed(1)}s
              {criticalCount > 0 && (
                <span className="text-orange-400"> &middot; {criticalCount} {t('results.issuesFound')}</span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-8">
            {result.healthScore.factors.map((f) => (
              <div key={f.factor} className="bg-[#111] border border-[#1a2a1a] rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-white">{f.score}</div>
                <div className="text-xs text-slate-400">{f.factor}</div>
              </div>
            ))}
          </div>

          {result.insights.slice(0, 5).map((ins, i) => (
            <div key={i} className="bg-[#111] border border-[#1a2a1a] rounded-lg p-4 mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium uppercase ${
                  ins.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                  ins.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                  ins.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>{ins.severity}</span>
                <span className="font-medium text-white">{ins.title}</span>
              </div>
              <p className="text-sm text-slate-400 mt-1">{ins.description}</p>
            </div>
          ))}

          <div className="flex gap-4 mt-8">
            <Link
              to={`/login?healthcheck=${result.reportId}&token=${result.uploadToken}`}
              className="flex-1 py-3 bg-[#00ff41] text-[#0a0a0a] rounded-lg hover:bg-[#00ff41]/90 transition-colors font-bold text-center"
            >
              {t('results.save')}
            </Link>
            <button
              onClick={() => navigate(`/report/${result.reportId}`)}
              className="px-6 py-3 border border-white/10 text-slate-300 rounded-lg hover:bg-white/5 transition-colors"
            >
              {t('results.share')}
            </button>
          </div>

          <button
            onClick={() => { setPhase('landing'); setResult(null); }}
            className="w-full mt-3 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            {t('results.uploadAnother')}
          </button>
        </main>
      </div>
    );
  }

  // ─── Landing View ───
  const uploadProps = {
    phase: phase as 'landing' | 'uploading' | 'scanning',
    dragOver,
    setDragOver,
    onDrop,
    onFileSelect,
    onDemoClick,
    error,
    lang,
    setLang,
    t,
  };

  if (perfLevel === 'minimal') {
    return <LandingFallback {...uploadProps} />;
  }

  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-[#0a0a0a] z-50 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
      </div>
    }>
      <LandingScene
        initialPerfLevel={perfLevel === 'high' ? 'high' : 'low'}
        {...uploadProps}
      />
    </Suspense>
  );
}
