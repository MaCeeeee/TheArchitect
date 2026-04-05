import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Layers, Info } from 'lucide-react';
import { useXRayStore } from '../../stores/xrayStore';
import type { CostTier } from '@thearchitect/shared';
import { COST_DIMENSION_LABELS } from '@thearchitect/shared';

type DimensionKey = keyof typeof COST_DIMENSION_LABELS;

const DIMENSION_COLORS: Record<DimensionKey, string> = {
  process: '#f59e0b',
  dataMigration: '#3b82f6',
  trainingChange: '#8b5cf6',
  applicationTransformation: '#ef4444',
  infrastructure: '#06b6d4',
  opportunityCost: '#f97316',
  riskAdjustedFinancial: '#ec4899',
};

const DIMENSION_MODELS: Record<DimensionKey, string> = {
  process: 'ABC + COPQ',
  dataMigration: '1-10-100 Rule',
  trainingChange: 'Wright + J-Curve',
  applicationTransformation: 'COCOMO II + SQALE + 7Rs',
  infrastructure: 'TCO + FinOps',
  opportunityCost: 'Metcalfe + Delay',
  riskAdjustedFinancial: 'rNPV + Bayesian',
};

const TIER_INFO: Record<CostTier, { label: string; color: string }> = {
  0: { label: 'Relative only', color: '#6b7280' },
  1: { label: '±30-50%', color: '#f59e0b' },
  2: { label: '±15-30%', color: '#3b82f6' },
  3: { label: 'P10/P50/P90', color: '#22c55e' },
};

const formatCost = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
};

export default function CostBreakdown() {
  const profiles = useXRayStore((s) => s.graphCostProfiles);
  const [expandedDim, setExpandedDim] = useState<DimensionKey | null>(null);

  // Aggregate dimensions across all elements
  const { aggregated, totalCost, elementCount, dominantTier, confidenceLow, confidenceHigh, topElements } = useMemo(() => {
    const agg: Record<string, number> = {};
    let total = 0;
    let cLow = 0;
    let cHigh = 0;
    let maxTier: CostTier = 0;
    const elCosts: { id: string; name: string; type: string; cost: number; tier: CostTier }[] = [];

    for (const p of profiles) {
      if (p.dimensions) {
        for (const [key, val] of Object.entries(p.dimensions)) {
          agg[key] = (agg[key] || 0) + (val || 0);
        }
      }
      const cost = p.totalEstimated || 0;
      total += cost;
      cLow += p.confidenceLow || 0;
      cHigh += p.confidenceHigh || 0;
      if (p.tier > maxTier) maxTier = p.tier;
      if (cost > 0) {
        elCosts.push({ id: p.elementId, name: p.elementName, type: p.elementType, cost, tier: p.tier });
      }
    }

    elCosts.sort((a, b) => b.cost - a.cost);

    return {
      aggregated: agg,
      totalCost: total,
      elementCount: profiles.length,
      dominantTier: maxTier,
      confidenceLow: cLow,
      confidenceHigh: cHigh,
      topElements: elCosts.slice(0, 8),
    };
  }, [profiles]);

  const dimEntries = Object.entries(aggregated)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]) as [DimensionKey, number][];

  const maxDim = dimEntries.length > 0 ? dimEntries[0][1] : 1;
  const tierInfo = TIER_INFO[dominantTier];

  if (profiles.length === 0 || totalCost === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <BarChart3 size={14} className="text-[#3b82f6]" />
            Cost Breakdown
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <Info size={20} className="mx-auto text-[var(--text-disabled)]" />
            <p className="text-xs text-[var(--text-tertiary)]">No cost data available</p>
            <p className="text-[10px] text-[var(--text-disabled)]">
              Add annual cost or strategy to elements to see dimension breakdown
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <BarChart3 size={14} className="text-[#3b82f6]" />
            Cost Breakdown
          </h3>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium"
            style={{ backgroundColor: `${tierInfo.color}20`, color: tierInfo.color, border: `1px solid ${tierInfo.color}40` }}
          >
            <Layers size={9} />
            T{dominantTier}
          </span>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
          {elementCount} elements &middot; {tierInfo.label}
        </p>
      </div>

      {/* Total with confidence band */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{formatCost(totalCost)} EUR</div>
          {dominantTier >= 1 && (
            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
              {formatCost(confidenceLow)} — {formatCost(confidenceHigh)} EUR
            </div>
          )}
        </div>
      </div>

      {/* 7-Dimension Bars */}
      <div className="px-3 py-2">
        <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">
          7 Cost Dimensions
        </h4>
        <div className="space-y-1">
          {dimEntries.map(([key, value]) => {
            const isExpanded = expandedDim === key;
            const color = DIMENSION_COLORS[key] || '#4a5a4a';
            const percent = totalCost > 0 ? Math.round((value / totalCost) * 100) : 0;

            return (
              <div key={key}>
                <button
                  onClick={() => setExpandedDim(isExpanded ? null : key)}
                  className="flex w-full items-center gap-2 py-1 hover:bg-[var(--surface-base)] rounded px-1 -mx-1 transition"
                >
                  {isExpanded ? <ChevronDown size={10} className="text-[var(--text-disabled)] shrink-0" /> : <ChevronRight size={10} className="text-[var(--text-disabled)] shrink-0" />}
                  <span className="text-[10px] text-[var(--text-secondary)] w-20 truncate text-left">
                    {COST_DIMENSION_LABELS?.[key] ?? key}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-[var(--surface-base)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(value / maxDim) * 100}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-[10px] text-white font-mono w-12 text-right">{formatCost(value)}</span>
                  <span className="text-[9px] text-[var(--text-disabled)] w-8 text-right">{percent}%</span>
                </button>
                {isExpanded && (
                  <div className="ml-5 pl-2 border-l border-[var(--border-subtle)] py-1 space-y-0.5">
                    <div className="text-[9px] text-[var(--text-disabled)]">
                      Model: {DIMENSION_MODELS[key]}
                    </div>
                    <div className="text-[9px] text-[var(--text-tertiary)]">
                      {formatCost(value)} EUR ({percent}% of total)
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Elements by Cost */}
      {topElements.length > 0 && (
        <div className="px-3 pb-3 border-t border-[var(--border-subtle)] pt-2">
          <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">
            Top Elements by Cost
          </h4>
          <div className="space-y-1">
            {topElements.map((el) => (
              <div key={el.id} className="flex items-center gap-2 py-0.5">
                <span
                  className="text-[8px] font-mono px-1 rounded"
                  style={{ backgroundColor: `${TIER_INFO[el.tier].color}20`, color: TIER_INFO[el.tier].color }}
                >
                  T{el.tier}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] flex-1 truncate">{el.name}</span>
                <span className="text-[10px] text-white font-mono">{formatCost(el.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
