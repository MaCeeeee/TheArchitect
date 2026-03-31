import {
  Package, Activity, Layers, Shield, AlertTriangle, DollarSign,
  Users, Clock, TrendingUp, BarChart3,
} from 'lucide-react';
import { usePortfolioStore } from '../../stores/portfolioStore';
import TIMEGrid from './TIMEGrid';

interface Props {
  projectId: string;
  onElementClick?: (elementId: string) => void;
}

export default function PortfolioDashboard({ projectId, onElementClick }: Props) {
  // Parent (PortfolioPage) already fetches summary + inventory — no useEffect needed here
  const summary = usePortfolioStore((s) => s.summary);

  if (!summary) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards — 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-3">
        <DashboardCard
          icon={<Package size={16} />}
          label="Applications"
          value={summary.totalApplications}
          color="#00ff41"
          subtitle={`${summary.totalServices} services, ${summary.totalTechnology} tech components`}
        />
        <DashboardCard
          icon={<Shield size={16} />}
          label="Avg Maturity"
          value={`${summary.avgMaturity}/5`}
          color="#a855f7"
          subtitle="Across all elements"
        />
        <DashboardCard
          icon={<DollarSign size={16} />}
          label="Total Annual Cost"
          value={formatCost(summary.totalAnnualCost)}
          color="#06b6d4"
          subtitle="Aggregated from inventory"
        />
        <DashboardCard
          icon={<AlertTriangle size={16} />}
          label="Nearing EOL"
          value={summary.appsNearingEOL}
          color="#f59e0b"
          subtitle="Within 6 months"
          warning={summary.appsNearingEOL > 0}
        />
        <DashboardCard
          icon={<Users size={16} />}
          label="Without Owner"
          value={summary.appsWithoutOwner}
          color="#ef4444"
          subtitle="Missing business owner"
          warning={summary.appsWithoutOwner > 0}
        />
        <DashboardCard
          icon={<TrendingUp size={16} />}
          label="Portfolio Total"
          value={summary.totalApplications + summary.totalServices + summary.totalTechnology}
          color="#3b82f6"
          subtitle="All managed elements"
        />
      </div>

      {/* Distribution charts */}
      <div className="grid grid-cols-2 gap-4">
        {/* Status distribution */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-[#00ff41]" />
            Status Distribution
          </h4>
          <DistributionBar data={summary.statusDistribution} colors={STATUS_COLORS} />
        </div>

        {/* Risk distribution */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
            <Shield size={14} className="text-[#a855f7]" />
            Risk Distribution
          </h4>
          <DistributionBar data={summary.riskDistribution} colors={RISK_COLORS} />
        </div>

        {/* Lifecycle distribution */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
            <Clock size={14} className="text-[#3b82f6]" />
            Lifecycle Distribution
          </h4>
          <DistributionBar data={summary.lifecycleDistribution} colors={LIFECYCLE_COLORS} />
        </div>

        {/* Criticality distribution */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
            <Activity size={14} className="text-[#f59e0b]" />
            Business Criticality
          </h4>
          <DistributionBar data={summary.criticalityDistribution} colors={CRITICALITY_COLORS} />
        </div>
      </div>

      {/* TIME Grid */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
        <TIMEGrid onElementClick={onElementClick} />
      </div>
    </div>
  );
}

// ─── Sub-components ───

function DashboardCard({ icon, label, value, color, subtitle, warning }: {
  icon: React.ReactNode; label: string; value: string | number; color: string; subtitle: string; warning?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${warning ? 'text-amber-400' : 'text-white'}`}>{value}</div>
      <p className="text-[10px] text-[var(--text-disabled)] mt-1">{subtitle}</p>
    </div>
  );
}

function DistributionBar({ data, colors }: { data: Record<string, number>; colors: Record<string, string> }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;

  return (
    <div className="space-y-2">
      {entries.map(([key, count]) => {
        const pct = Math.round((count / total) * 100);
        const color = colors[key] || '#6b7280';
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-secondary)] w-20 capitalize truncate">{key.replace('_', ' ')}</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--surface-base)] overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ backgroundColor: color, width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-[var(--text-tertiary)] w-8 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatCost(cost: number) {
  if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`;
  if (cost >= 1_000) return `$${(cost / 1_000).toFixed(0)}K`;
  if (cost > 0) return `$${cost}`;
  return '$0';
}

const STATUS_COLORS: Record<string, string> = {
  current: '#22c55e',
  target: '#3b82f6',
  transitional: '#f59e0b',
  retired: '#6b7280',
};

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const LIFECYCLE_COLORS: Record<string, string> = {
  plan: '#6366f1',
  design: '#8b5cf6',
  build: '#3b82f6',
  test: '#06b6d4',
  deploy: '#22c55e',
  operate: '#00ff41',
  phase_out: '#f59e0b',
  retire: '#ef4444',
  unknown: '#6b7280',
};

const CRITICALITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#f97316',
  mission_critical: '#ef4444',
  unknown: '#374151',
};
