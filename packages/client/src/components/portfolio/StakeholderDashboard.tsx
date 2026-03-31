import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package, Shield, Activity, Layers, AlertTriangle, DollarSign,
  BarChart3, Share2, TrendingUp, Eye, ArrowLeft, Copy, Check, X,
} from 'lucide-react';
import api from '../../services/api';

interface SummaryData {
  totalApplications: number;
  totalServices: number;
  totalTechnology: number;
  lifecycleDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  criticalityDistribution: Record<string, number>;
  avgMaturity: number;
  totalAnnualCost: number;
  appsNearingEOL: number;
  appsWithoutOwner: number;
}

export default function StakeholderDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}/portfolio/summary`)
      .then(({ data }) => setSummary(data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleShare = async () => {
    if (!projectId || shareLoading) return;
    setShareLoading(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/snapshots`, {
        title: 'Stakeholder Overview',
        description: `Architecture overview for stakeholders — ${summary ? summary.totalApplications + summary.totalServices + summary.totalTechnology : 0} elements`,
        viewType: 'portfolio',
        expiresInHours: 72,
      });
      setShareUrl(`${window.location.origin}/shared/${data.data.token}`);
    } catch (err) {
      console.error('[Stakeholder] Snapshot creation failed:', err);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--text-tertiary)]">No portfolio data available</p>
      </div>
    );
  }

  const total = summary.totalApplications + summary.totalServices + summary.totalTechnology;

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-base)] p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate(`/project/${projectId}/portfolio`)}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition mb-3"
        >
          <ArrowLeft size={16} />
          Back to Portfolio
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Eye size={18} className="text-[#00ff41]" />
              <h1 className="text-xl font-bold text-white">Architecture Overview</h1>
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">
              Read-only stakeholder view — {total} managed elements
            </p>
          </div>
          <button
            onClick={handleShare}
            disabled={shareLoading}
            className="flex items-center gap-1.5 rounded-md bg-[#00ff41]/15 border border-[#00ff41]/30 px-4 py-2 text-xs text-[#00ff41] hover:bg-[#00ff41]/25 transition disabled:opacity-50"
          >
            <Share2 size={14} /> {shareLoading ? 'Creating...' : 'Share Snapshot'}
          </button>
        </div>

        {/* Share URL banner */}
        {shareUrl && (
          <div className="flex items-center gap-3 mt-3 rounded-lg border border-[#00ff41]/20 bg-[#00ff41]/5 px-4 py-2.5">
            <Share2 size={14} className="text-[#00ff41] shrink-0" />
            <span className="text-xs text-[var(--text-secondary)]">Share link (72h):</span>
            <code className="flex-1 text-xs text-[#00ff41] truncate">{shareUrl}</code>
            <button onClick={handleCopy} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#00ff41] hover:bg-[#00ff41]/10 transition">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
            <button onClick={() => setShareUrl(null)} className="text-[var(--text-tertiary)] hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<Package size={20} />} label="Applications" value={summary.totalApplications} color="#00ff41" />
        <KpiCard icon={<Activity size={20} />} label="Services" value={summary.totalServices} color="#22c55e" />
        <KpiCard icon={<Layers size={20} />} label="Technology" value={summary.totalTechnology} color="#3b82f6" />
        <KpiCard icon={<Shield size={20} />} label="Avg Maturity" value={`${summary.avgMaturity}/5`} color="#a855f7" />
      </div>

      {/* Alert Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <AlertCard
          icon={<AlertTriangle size={16} />}
          label="Nearing End of Life"
          value={summary.appsNearingEOL}
          color="#f59e0b"
          alert={summary.appsNearingEOL > 0}
          description="Elements within 6 months of EOL"
        />
        <AlertCard
          icon={<Shield size={16} />}
          label="High/Critical Risk"
          value={(summary.riskDistribution.high || 0) + (summary.riskDistribution.critical || 0)}
          color="#ef4444"
          alert={(summary.riskDistribution.high || 0) + (summary.riskDistribution.critical || 0) > 0}
          description="Elements requiring attention"
        />
        <AlertCard
          icon={<DollarSign size={16} />}
          label="Total Annual Cost"
          value={formatCost(summary.totalAnnualCost)}
          color="#06b6d4"
          description="Aggregated portfolio cost"
        />
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-2 gap-6">
        <DistributionCard title="Status" icon={<TrendingUp size={14} />} data={summary.statusDistribution} colors={STATUS_COLORS} />
        <DistributionCard title="Risk Level" icon={<Shield size={14} />} data={summary.riskDistribution} colors={RISK_COLORS} />
        <DistributionCard title="Lifecycle Phase" icon={<Activity size={14} />} data={summary.lifecycleDistribution} colors={LIFECYCLE_COLORS} />
        <DistributionCard title="Business Criticality" icon={<BarChart3 size={14} />} data={summary.criticalityDistribution} colors={CRIT_COLORS} />
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}

function AlertCard({ icon, label, value, color, alert, description }: {
  icon: React.ReactNode; label: string; value: string | number; color: string; alert?: boolean; description: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--border-subtle)] bg-[var(--surface-raised)]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-medium text-white">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${alert ? 'text-amber-400' : 'text-white'}`}>{value}</div>
      <p className="text-[10px] text-[var(--text-disabled)] mt-1">{description}</p>
    </div>
  );
}

function DistributionCard({ title, icon, data, colors }: {
  title: string; icon: React.ReactNode; data: Record<string, number>; colors: Record<string, string>;
}) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[#00ff41]">{icon}</span>
        <h3 className="text-xs font-semibold text-white">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {entries.map(([key, count]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--text-secondary)] w-24 capitalize truncate">{key.replace(/_/g, ' ')}</span>
            <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-base)] overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                backgroundColor: colors[key] || '#6b7280',
                width: `${Math.round((count / total) * 100)}%`,
              }} />
            </div>
            <span className="text-xs font-medium text-white w-8 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCost(cost: number) {
  if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`;
  if (cost >= 1_000) return `$${(cost / 1_000).toFixed(0)}K`;
  if (cost > 0) return `$${cost}`;
  return '$0';
}

const STATUS_COLORS: Record<string, string> = { current: '#22c55e', target: '#3b82f6', transitional: '#f59e0b', retired: '#6b7280' };
const RISK_COLORS: Record<string, string> = { low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
const LIFECYCLE_COLORS: Record<string, string> = { plan: '#6366f1', design: '#8b5cf6', build: '#3b82f6', test: '#06b6d4', deploy: '#22c55e', operate: '#00ff41', phase_out: '#f59e0b', retire: '#ef4444', unknown: '#6b7280' };
const CRIT_COLORS: Record<string, string> = { low: '#6b7280', medium: '#f59e0b', high: '#f97316', mission_critical: '#ef4444', unknown: '#374151' };
