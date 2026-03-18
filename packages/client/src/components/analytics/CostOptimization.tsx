import { useMemo } from 'react';
import { DollarSign, TrendingDown, PieChart, BarChart3 } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

const BASE_COSTS: Record<string, number> = {
  application: 50000,
  application_component: 20000,
  application_service: 15000,
  service: 15000,
  technology_component: 30000,
  infrastructure: 80000,
  platform_service: 40000,
  data_entity: 10000,
  data_model: 8000,
  business_capability: 5000,
  process: 12000,
  value_stream: 8000,
};

export default function CostOptimization() {
  const elements = useArchitectureStore((s) => s.elements);

  const costData = useMemo(() => {
    const items = elements.map((el) => {
      const baseCost = BASE_COSTS[el.type] || 15000;
      const statusMultiplier = el.status === 'retired' ? 0.2
        : el.status === 'transitional' ? 1.5
        : el.status === 'target' ? 1.8 : 1.0;
      const estimated = Math.round(baseCost * statusMultiplier);

      const optimization = el.status === 'retired' ? estimated * 0.9
        : el.maturityLevel <= 2 ? estimated * 0.3
        : el.status === 'transitional' ? estimated * 0.4 : 0;

      return {
        ...el,
        estimatedCost: estimated,
        optimizationPotential: Math.round(optimization),
        costCategory: el.togafDomain,
      };
    });

    const totalCost = items.reduce((s, i) => s + i.estimatedCost, 0);
    const totalOptimization = items.reduce((s, i) => s + i.optimizationPotential, 0);

    const byDomain: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      byDomain[item.togafDomain] = (byDomain[item.togafDomain] || 0) + item.estimatedCost;
      byStatus[item.status] = (byStatus[item.status] || 0) + item.estimatedCost;
    }

    return { items, totalCost, totalOptimization, byDomain, byStatus };
  }, [elements]);

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
      <div className="p-3 border-b border-[#1a2a1a]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <DollarSign size={14} className="text-[#22c55e]" />
          Cost Optimization
        </h3>
        <p className="text-[10px] text-[#4a5a4a] mt-1">TCO estimation and optimization opportunities</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <PieChart size={12} className="text-[#3b82f6]" />
            <span className="text-[10px] text-[#4a5a4a]">Total TCO</span>
          </div>
          <div className="text-lg font-bold text-white">${formatCost(costData.totalCost)}</div>
        </div>
        <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={12} className="text-[#22c55e]" />
            <span className="text-[10px] text-[#4a5a4a]">Save Potential</span>
          </div>
          <div className="text-lg font-bold text-[#22c55e]">${formatCost(costData.totalOptimization)}</div>
        </div>
      </div>

      {/* Cost by domain */}
      <div className="px-3 pb-3">
        <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-2 flex items-center gap-1">
          <BarChart3 size={10} /> By Domain
        </h4>
        <div className="space-y-1.5">
          {Object.entries(costData.byDomain)
            .sort((a, b) => b[1] - a[1])
            .map(([domain, cost]) => (
              <div key={domain} className="flex items-center gap-2">
                <span className="text-[10px] text-[#7a8a7a] w-20 capitalize">{domain}</span>
                <div className="flex-1 h-3 rounded-full bg-[#0a0a0a]">
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
      <div className="px-3 pb-3 border-t border-[#1a2a1a] pt-3">
        <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-2">By Lifecycle Status</h4>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(costData.byStatus).map(([status, cost]) => (
            <div key={status} className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2" style={{ borderLeftColor: statusColors[status] || '#4a5a4a', borderLeftWidth: 2 }}>
              <span className="text-[10px] capitalize" style={{ color: statusColors[status] }}>{status}</span>
              <div className="text-xs font-bold text-white mt-0.5">${formatCost(cost)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Optimization opportunities */}
      {costData.items.filter((i) => i.optimizationPotential > 0).length > 0 && (
        <div className="px-3 pb-3 border-t border-[#1a2a1a] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-2 flex items-center gap-1">
            <TrendingDown size={10} /> Optimization Opportunities
          </h4>
          <div className="space-y-1">
            {costData.items
              .filter((i) => i.optimizationPotential > 0)
              .sort((a, b) => b.optimizationPotential - a.optimizationPotential)
              .slice(0, 8)
              .map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-[#111111]">
                  <span className="text-[10px] text-white flex-1 truncate">{item.name}</span>
                  <span className="text-[9px] text-[#22c55e] font-mono">-${formatCost(item.optimizationPotential)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {elements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[#4a5a4a] text-center">No elements for cost estimation</p>
        </div>
      )}
    </div>
  );
}
