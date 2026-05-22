import { DollarSign, Layers, BarChart3, TrendingDown } from 'lucide-react';
import type { CfoView as CfoViewData } from '@thearchitect/shared';
import HeadlineCard from './HeadlineCard';
import KpiCard from './KpiCard';
import { formatCost } from './formatCost';

interface Props {
  data: CfoViewData;
}

const TIER_LABELS = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3'] as const;
const TIER_COLORS = ['#64748b', '#3b82f6', '#a78bfa', '#ef4444'] as const;

export default function CfoView({ data }: Props) {
  const maxTierCount = Math.max(1, ...data.investmentHeatmap.tierCounts);
  return (
    <div className="space-y-4">
      <HeadlineCard headline={data.headline} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KpiCard
          icon={DollarSign}
          iconColor="#3b82f6"
          label="Total TCO"
          value={formatCost(data.totalTco.value)}
          sub={`P10 ${formatCost(data.totalTco.p10)} – P90 ${formatCost(data.totalTco.p90)}`}
          target="cost"
          testId="cfo-tco"
        />
        <KpiCard
          icon={Layers}
          iconColor="#ef4444"
          label="Cost Hotspots"
          value={data.costHotspots.topElement ?? '—'}
          sub={
            data.costHotspots.topElement
              ? `${formatCost(data.costHotspots.topElementCost)} · Tier ${data.costHotspots.dominantTier}`
              : 'No cost data'
          }
          badge={`T${data.costHotspots.dominantTier}`}
          target="cost"
          testId="cfo-hotspots"
        />
        <KpiCard
          icon={BarChart3}
          iconColor="#a78bfa"
          label="Probabilistic Cost"
          value={formatCost(data.probabilisticCost.p50)}
          sub={`P10 ${formatCost(data.probabilisticCost.p10)} – P90 ${formatCost(data.probabilisticCost.p90)}`}
          target="cost"
          testId="cfo-probabilistic"
        />
        <KpiCard
          icon={TrendingDown}
          iconColor="#22c55e"
          label="Optimization Potential"
          value={formatCost(data.optimizationPotential.value)}
          sub={`${data.optimizationPotential.percentOfTco}% of TCO`}
          target="cost"
          testId="cfo-optimization"
        />
      </div>

      <div
        className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-4"
        data-testid="cfo-heatmap"
      >
        <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
          Investment Heatmap (elements per tier)
        </div>
        <div className="space-y-2">
          {data.investmentHeatmap.tierCounts.map((count, tier) => (
            <div key={tier} className="flex items-center gap-3">
              <span className="text-[11px] text-[var(--text-tertiary)] w-12">
                {TIER_LABELS[tier]}
              </span>
              <div className="flex-1 h-3 bg-slate-700/40 rounded overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${(count / maxTierCount) * 100}%`,
                    backgroundColor: TIER_COLORS[tier],
                  }}
                />
              </div>
              <span className="text-xs font-mono text-white w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
