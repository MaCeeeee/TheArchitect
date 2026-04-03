import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Info, CheckCircle, Loader2, ExternalLink, Share2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import HealthScoreRing from './HealthScoreRing';

interface ReportData {
  reportId: string;
  healthScore: {
    total: number;
    factors: Array<{ factor: string; weight: number; score: number; description: string }>;
  };
  insights: Array<{
    category: string;
    severity: string;
    title: string;
    description: string;
    affectedCount: number;
  }>;
  totalElements: number;
  scanDurationMs: number;
  elementStats: {
    byLayer: Record<string, number>;
    byStatus: Record<string, number>;
  };
  createdAt: string;
  expiresAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  high: { icon: AlertCircle, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  warning: { icon: Info, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  info: { icon: CheckCircle, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
};

export default function HealthReport() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) return;
    fetch(`${API_BASE}/healthcheck/report/${reportId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setReport(data.data);
        else setError(data.message || 'Report not found');
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-[#0a0a0a] z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00ff41] animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-[#0a0a0a] z-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Report Not Found</h1>
          <p className="text-slate-400 mb-6">{error || 'This report may have expired or been removed.'}</p>
          <Link to="/" className="px-6 py-3 bg-[#00ff41] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#00ff41]/90 transition-colors">
            Run Your Own Health Check
          </Link>
        </div>
      </div>
    );
  }

  const topInsights = report.insights.slice(0, 5);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#0a0a0a] z-50">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00ff41] to-[#06b6d4] flex items-center justify-center">
              <span className="text-[#0a0a0a] font-bold text-sm">A</span>
            </div>
            <span className="text-white font-semibold">TheArchitect</span>
            <span className="text-slate-500 text-sm hidden sm:inline">Health Report</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }}
              className="p-2 text-slate-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
              title="Copy share link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <Link
              to={`/login`}
              className="px-4 py-2 bg-[#00ff41] text-[#0a0a0a] text-sm font-bold rounded-lg hover:bg-[#00ff41]/90 transition-colors flex items-center gap-2"
            >
              Start Full Analysis <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Score Section */}
        <div className="text-center mb-10">
          <HealthScoreRing score={report.healthScore.total} size={180} />
          <h1 className="text-2xl font-bold text-white mt-4">Architecture Health Score</h1>
          <p className="text-slate-400 mt-1">
            {report.totalElements} elements analyzed in {(report.scanDurationMs / 1000).toFixed(1)}s
          </p>
        </div>

        {/* Factor Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-10">
          {report.healthScore.factors.map((f) => (
            <div key={f.factor} className="bg-[#111] border border-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-white">{f.score}</div>
              <div className="text-xs text-slate-400 mt-1">{f.factor}</div>
              <div className="text-xs text-slate-500">{Math.round(f.weight * 100)}% weight</div>
            </div>
          ))}
        </div>

        {/* Element Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {Object.entries(report.elementStats.byLayer).sort((a, b) => b[1] - a[1]).map(([layer, count]) => (
            <div key={layer} className="bg-[#111] border border-white/10 rounded-lg p-3">
              <div className="text-lg font-bold text-white">{count}</div>
              <div className="text-xs text-slate-400 capitalize">{layer.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>

        {/* Top Insights */}
        <h2 className="text-lg font-semibold text-white mb-4">Top Findings</h2>
        <div className="space-y-3 mb-10">
          {topInsights.map((insight, i) => {
            const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
            const Icon = config.icon;
            return (
              <div key={i} className={`border rounded-lg p-4 ${config.bg}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.color}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{insight.title}</span>
                      {insight.affectedCount > 0 && (
                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-slate-300">
                          {insight.affectedCount} affected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{insight.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {topInsights.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
              No critical issues found
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-r from-[#00ff41]/10 to-[#06b6d4]/10 border border-[#00ff41]/20 rounded-xl p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Want the full picture?</h2>
          <p className="text-slate-300 mb-6">
            Register to unlock continuous monitoring, 3D architecture<br />
            visualization, AI-powered recommendations, and<br />
            collaboration tools.
          </p>
          <Link
            to={`/login?healthcheck=${report.reportId}`}
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#00ff41] text-[#0a0a0a] rounded-lg hover:bg-[#00ff41]/90 transition-colors font-bold"
          >
            Start Full Analysis <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          Generated {new Date(report.createdAt).toLocaleDateString()} · Expires {new Date(report.expiresAt).toLocaleDateString()}
        </p>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
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
