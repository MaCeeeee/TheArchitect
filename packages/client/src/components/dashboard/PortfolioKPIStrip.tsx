import { useMemo } from 'react';
import { Briefcase, TrendingUp, TrendingDown, Minus, ShieldAlert, CheckCircle } from 'lucide-react';
import { ProgressRing } from '../../design-system';
import type { Project, ProjectStats, HealthData, RiskData, CostData, ComplianceData } from '../../hooks/usePortfolioData';

interface Props {
  projects: Project[];
  stats: Record<string, ProjectStats | null>;
  health: Record<string, HealthData | null>;
  risk: Record<string, RiskData | null>;
  cost: Record<string, CostData | null>;
  compliance: Record<string, ComplianceData | null>;
  enriching: boolean;
}

export default function PortfolioKPIStrip({ projects, stats, health, risk, cost, compliance, enriching }: Props) {
  const agg = useMemo(() => {
    let healthSum = 0, healthCount = 0, trendDeltaSum = 0;
    let critical = 0, high = 0, medium = 0, low = 0;
    let totalCost = 0, optimizationTotal = 0;
    let coverageSum = 0, coverageCount = 0, standardsCount = 0;

    for (const p of projects) {
      const h = health[p._id];
      const s = stats[p._id];
      // Use advisor health if available, fall back to stats.healthScore
      const score = h?.healthScore?.total ?? s?.healthScore ?? 0;
      if (score > 0 || h?.healthScore) {
        healthSum += score;
        trendDeltaSum += h?.healthScore?.trendDelta ?? 0;
        healthCount++;
      }

      const r = risk[p._id];
      if (r?.summary) {
        critical += r.summary.critical;
        high += r.summary.high;
        medium += r.summary.medium;
        low += r.summary.low;
      }

      const c = cost[p._id];
      if (c) {
        totalCost += c.totalCost ?? 0;
        optimizationTotal += c.optimizationTotal ?? 0;
      }

      const comp = compliance[p._id];
      if (comp?.portfolio) {
        for (const s of comp.portfolio) {
          coverageSum += s.coverage ?? 0;
          coverageCount++;
        }
        standardsCount += comp.totalStandards ?? 0;
      }
    }

    const avgHealth = healthCount > 0 ? Math.round(healthSum / healthCount) : 0;
    const avgTrend = healthCount > 0 ? trendDeltaSum / healthCount : 0;
    const avgCoverage = coverageCount > 0 ? Math.round(coverageSum / coverageCount) : 0;
    const riskTotal = critical + high + medium + low;

    return {
      avgHealth, avgTrend, healthCount,
      critical, high, medium, low, riskTotal,
      totalCost, optimizationTotal,
      avgCoverage, standardsCount, coverageCount,
    };
  }, [projects, health, risk, cost, compliance]);

  const healthColor = agg.avgHealth >= 70 ? 'var(--status-success)' : agg.avgHealth >= 40 ? 'var(--status-warning)' : 'var(--status-danger)';
  const TrendIcon = agg.avgTrend > 0 ? TrendingUp : agg.avgTrend < 0 ? TrendingDown : Minus;
  const trendColor = agg.avgTrend > 0 ? 'text-emerald-400' : agg.avgTrend < 0 ? 'text-red-400' : 'text-[var(--text-tertiary)]';

  const shimmer = enriching ? 'animate-pulse' : '';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Projects */}
      <KPICard accentColor="var(--accent-default)" className={shimmer}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-default)]/10">
            <Briefcase size={20} className="text-[var(--accent-text)]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{projects.length}</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">active projects</p>
          </div>
        </div>
      </KPICard>

      {/* Health */}
      <KPICard accentColor={healthColor} className={shimmer}>
        <div className="flex items-center gap-3">
          <ProgressRing value={agg.avgHealth} size={44} strokeWidth={3} color={healthColor} />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-2xl font-bold text-white">{agg.avgHealth}%</p>
              <TrendIcon size={14} className={trendColor} />
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)]">portfolio health</p>
          </div>
        </div>
      </KPICard>

      {/* Risk */}
      <KPICard accentColor="var(--status-danger)" className={shimmer}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
            <ShieldAlert size={20} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold text-white">{agg.critical + agg.high}</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">critical + high risks</p>
          </div>
        </div>
        {agg.riskTotal > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <RiskDistributionBar critical={agg.critical} high={agg.high} medium={agg.medium} low={agg.low} total={agg.riskTotal} />
            <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">{agg.riskTotal}</span>
          </div>
        )}
      </KPICard>

      {/* Compliance */}
      <KPICard accentColor="var(--status-info)" className={shimmer}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10">
            <CheckCircle size={20} className="text-sky-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{agg.avgCoverage}%</p>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {agg.standardsCount} standard{agg.standardsCount !== 1 ? 's' : ''} tracked
            </p>
          </div>
        </div>
        {agg.coverageCount > 0 && (
          <div className="mt-2.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${agg.avgCoverage}%`,
                backgroundColor: agg.avgCoverage >= 80 ? '#22c55e' : agg.avgCoverage >= 50 ? '#eab308' : '#ef4444',
              }}
            />
          </div>
        )}
      </KPICard>
    </div>
  );
}

// ─── Sub-components ───

function KPICard({ children, accentColor, className = '' }: { children: React.ReactNode; accentColor: string; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 ${className}`}
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      {children}
    </div>
  );
}

function RiskDistributionBar({ critical, high, medium, low, total }: { critical: number; high: number; medium: number; low: number; total: number }) {
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
      {critical > 0 && <div className="bg-red-500 h-full" style={{ width: pct(critical) }} />}
      {high > 0 && <div className="bg-orange-500 h-full" style={{ width: pct(high) }} />}
      {medium > 0 && <div className="bg-yellow-500 h-full" style={{ width: pct(medium) }} />}
      {low > 0 && <div className="bg-green-500 h-full" style={{ width: pct(low) }} />}
    </div>
  );
}
