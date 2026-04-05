import { useMemo } from 'react';
import { DollarSign, TrendingDown, PieChart, BarChart3, Layers } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import { BASE_COSTS_BY_TYPE, STATUS_COST_MULTIPLIERS } from '@thearchitect/shared';
import type { CostTier } from '@thearchitect/shared';

const TIER_COLORS: Record<CostTier, string> = {
  0: '#6b7280', // gray
  1: '#f59e0b', // amber
  2: '#3b82f6', // blue
  3: '#22c55e', // green
};

const TIER_LABELS: Record<CostTier, string> = {
  0: 'Relative',
  1: '±30-50%',
  2: '±15-30%',
  3: 'P10/P50/P90',
};

export default function CostOptimization() {
  const elements = useArchitectureStore((s) => s.elements);
  const graphCostProfiles = useXRayStore((s) => s.graphCostProfiles);

  // Determine dominant tier
  const dominantTier = useMemo((): CostTier => {
    if (graphCostProfiles.length === 0) return 0;
    const tierCounts = [0, 0, 0, 0];
    for (const p of graphCostProfiles) tierCounts[p.tier]++;
    // Return the highest tier that has at least one element
    for (let t = 3; t >= 0; t--) {
      if (tierCounts[t] > 0) return t as CostTier;
    }
    return 0;
  }, [graphCostProfiles]);

  const costData = useMemo(() => {
    // Build a lookup from graph cost profiles for relativeImportance
    const profileMap = new Map(graphCostProfiles.map((p) => [p.elementId, p]));

    const items = elements.filter((el) => el && el.id).map((el) => {
      const profile = profileMap.get(el.id);
      // Use annualCost when available, otherwise fall back to BASE_COSTS_BY_TYPE
      const baseCost = (el.annualCost && el.annualCost > 0) ? el.annualCost : (BASE_COSTS_BY_TYPE?.[el.type] ?? 10000);
      const statusMultiplier = STATUS_COST_MULTIPLIERS?.[el.status || 'current'] ?? 1.0;
      const estimated = profile?.totalEstimated || Math.round(baseCost * statusMultiplier);

      const maturity = el.maturityLevel ?? 3;
      const optimization = el.status === 'retired' ? estimated * 0.9
        : maturity <= 2 ? estimated * 0.3
        : el.status === 'transitional' ? estimated * 0.4 : 0;

      return {
        ...el,
        estimatedCost: estimated,
        optimizationPotential: Math.round(optimization),
        costCategory: el.togafDomain || 'technology',
        relativeImportance: profile?.relativeImportance || 0,
        costTier: profile?.tier as CostTier | undefined,
      };
    });

    const totalCost = items.reduce((s, i) => s + i.estimatedCost, 0);
    const totalOptimization = items.reduce((s, i) => s + i.optimizationPotential, 0);

    const byDomain: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      const domain = item.togafDomain || 'technology';
      const status = item.status || 'current';
      byDomain[domain] = (byDomain[domain] || 0) + item.estimatedCost;
      byStatus[status] = (byStatus[status] || 0) + item.estimatedCost;
    }

    return { items, totalCost, totalOptimization, byDomain, byStatus };
  }, [elements, graphCostProfiles]);

  const formatCost = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  const domainColors: Record<string, string> = {
    business: '#22c55e',
    data: '#3b82f6',
    application: '#f97316',
    technology: '#00ff41',
  };

  const statusColors: Record<string, string> = {
    current: '#22c55e',
    target: '#06b6d4',
    transitional: '#eab308',
    retired: '#ef4444',
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <DollarSign size={14} className="text-[#22c55e]" />
            Cost Optimization
          </h3>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium"
            style={{ backgroundColor: `${TIER_COLORS[dominantTier]}20`, color: TIER_COLORS[dominantTier], border: `1px solid ${TIER_COLORS[dominantTier]}40` }}
            title={`Data Tier ${dominantTier}: ${TIER_LABELS[dominantTier]}`}
          >
            <Layers size={9} />
            T{dominantTier}
          </span>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
          TCO estimation {dominantTier === 0 ? '(relative ranking)' : `(${TIER_LABELS[dominantTier]})`}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <PieChart size={12} className="text-[#3b82f6]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Total TCO</span>
          </div>
          <div className="text-lg font-bold text-white">${formatCost(costData.totalCost)}</div>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={12} className="text-[#22c55e]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Save Potential</span>
          </div>
          <div className="text-lg font-bold text-[#22c55e]">${formatCost(costData.totalOptimization)}</div>
        </div>
      </div>

      {/* Cost by domain */}
      <div className="px-3 pb-3">
        <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2 flex items-center gap-1">
          <BarChart3 size={10} /> By Domain
        </h4>
        <div className="space-y-1.5">
          {Object.entries(costData.byDomain)
            .sort((a, b) => b[1] - a[1])
            .map(([domain, cost]) => (
              <div key={domain} className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-secondary)] w-20 capitalize">{domain}</span>
                <div className="flex-1 h-3 rounded-full bg-[var(--surface-base)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(cost / costData.totalCost) * 100}%`,
                      backgroundColor: domainColors[domain] || '#4a5a4a',
                    }}
                  />
                </div>
                <span className="text-[10px] text-white font-mono w-12 text-right">${formatCost(cost)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Cost by status */}
      <div className="px-3 pb-3 border-t border-[var(--border-subtle)] pt-3">
        <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">By Lifecycle Status</h4>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(costData.byStatus).map(([status, cost]) => (
            <div key={status} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2" style={{ borderLeftColor: statusColors[status] || '#4a5a4a', borderLeftWidth: 2 }}>
              <span className="text-[10px] capitalize" style={{ color: statusColors[status] }}>{status}</span>
              <div className="text-xs font-bold text-white mt-0.5">${formatCost(cost)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Optimization opportunities */}
      {costData.items.filter((i) => i.optimizationPotential > 0).length > 0 && (
        <div className="px-3 pb-3 border-t border-[var(--border-subtle)] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2 flex items-center gap-1">
            <TrendingDown size={10} /> Optimization Opportunities
          </h4>
          <div className="space-y-1">
            {costData.items
              .filter((i) => i.optimizationPotential > 0)
              .sort((a, b) => b.optimizationPotential - a.optimizationPotential)
              .slice(0, 8)
              .map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-[var(--surface-raised)]">
                  <span className="text-[10px] text-white flex-1 truncate">{item.name}</span>
                  <span className="text-[9px] text-[#22c55e] font-mono">-${formatCost(item.optimizationPotential)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {elements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[var(--text-tertiary)] text-center">No elements for cost estimation</p>
        </div>
      )}
    </div>
  );
}
