import { Trash2, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ProgressRing, Badge } from '../../design-system';
import type { HealthData, RiskData, ComplianceData, CostData } from '../../hooks/usePortfolioData';

const PHASE_NAMES = ['', 'Build', 'Map', 'Govern', 'Simulate', 'Audit'] as const;

interface ProjectCardProps {
  project: {
    _id: string;
    name: string;
    description?: string;
    updatedAt?: string;
  };
  stats?: {
    elementCount: number;
    connectionCount: number;
    currentPhase: number;
    healthScore: number;
  };
  healthData?: HealthData | null;
  riskData?: RiskData | null;
  complianceData?: ComplianceData | null;
  costData?: CostData | null;
  onClick: () => void;
  onDelete: () => void;
}

function formatCost(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value.toFixed(0)}`;
}

export default function ProjectCard({ project, stats, healthData, riskData, complianceData, costData, onClick, onDelete }: ProjectCardProps) {
  const phase = stats?.currentPhase ?? 1;
  const health = healthData?.healthScore?.total ?? stats?.healthScore ?? 0;
  const trend = healthData?.healthScore?.trend;
  const criticalHigh = (riskData?.summary?.critical ?? 0) + (riskData?.summary?.high ?? 0);

  const avgCoverage = complianceData?.portfolio?.length
    ? Math.round(complianceData.portfolio.reduce((s, item) => s + (item.coverage ?? 0), 0) / complianceData.portfolio.length)
    : null;

  const totalCost = costData?.totalCost ?? 0;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-[var(--text-tertiary)]';

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 cursor-pointer hover:border-[var(--accent-default)] hover:shadow-[0_0_15px_rgba(0,255,65,0.15)] transition"
    >
      {/* Health Ring + Trend */}
      <div className="relative shrink-0">
        <ProgressRing value={health} size={48} strokeWidth={3} color="var(--accent-default)" />
        {trend && (
          <TrendIcon size={10} className={`absolute -bottom-0.5 -right-0.5 ${trendColor}`} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white">{project.name}</h3>
        {project.description && (
          <p className="text-xs text-[var(--text-secondary)] truncate">{project.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] text-[var(--status-purple)] font-medium">
            Phase {phase}: {PHASE_NAMES[phase] || 'Build'}
          </span>
          {stats && (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {stats.elementCount} elements · {stats.connectionCount} connections
            </span>
          )}
        </div>

        {/* Enriched badges */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {criticalHigh > 0 && (
            <Badge variant="danger" dot>{criticalHigh} risk{criticalHigh !== 1 ? 's' : ''}</Badge>
          )}
          {avgCoverage !== null && (
            <Badge variant={avgCoverage >= 80 ? 'success' : avgCoverage >= 50 ? 'warning' : 'danger'}>
              {avgCoverage}% compliant
            </Badge>
          )}
          {totalCost > 0 && (
            <Badge variant="neutral">{formatCost(totalCost)}</Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {project.updatedAt && (
          <span className="text-xs text-[var(--text-tertiary)]">
            {new Date(project.updatedAt).toLocaleDateString()}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition"
          title="Delete project"
        >
          <Trash2 size={14} />
        </button>
        <ArrowRight size={14} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-default)] transition" />
      </div>
    </div>
  );
}
