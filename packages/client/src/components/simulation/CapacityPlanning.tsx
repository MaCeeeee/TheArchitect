import { useMemo } from 'react';
import { Server, Gauge, TrendingUp, AlertTriangle } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

interface CapacityItem {
  name: string;
  type: string;
  currentLoad: number;
  maxCapacity: number;
  utilization: number;
  trend: 'growing' | 'stable' | 'declining';
  bottleneck: boolean;
}

export default function CapacityPlanning() {
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);

  const capacityData = useMemo(() => {
    const infraElements = elements.filter((el) =>
      ['infrastructure', 'technology_component', 'platform_service'].includes(el.type)
    );

    const items: CapacityItem[] = infraElements.map((el) => {
      const inDegree = connections.filter((c) => c.targetId === el.id).length;
      const utilization = Math.min(100, Math.round((inDegree * 20 + (5 - el.maturityLevel) * 10 + Math.random() * 20)));
      const trend = el.status === 'target' ? 'growing' : el.status === 'retired' ? 'declining' : 'stable';

      return {
        name: el.name,
        type: el.type,
        currentLoad: inDegree,
        maxCapacity: Math.max(inDegree + 2, 5),
        utilization,
        trend,
        bottleneck: utilization >= 80,
      };
    });

    items.sort((a, b) => b.utilization - a.utilization);

    const avgUtilization = items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.utilization, 0) / items.length)
      : 0;
    const bottleneckCount = items.filter((i) => i.bottleneck).length;

    return { items, avgUtilization, bottleneckCount };
  }, [elements, connections]);

  const utilizationColor = (u: number) => {
    if (u >= 90) return '#ef4444';
    if (u >= 70) return '#f97316';
    if (u >= 50) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#1a2a1a]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Server size={14} className="text-[#00ff41]" />
          Capacity Planning
        </h3>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge size={12} className="text-[#7a8a7a]" />
            <span className="text-[10px] text-[#4a5a4a]">Avg Utilization</span>
          </div>
          <div className="text-lg font-bold" style={{ color: utilizationColor(capacityData.avgUtilization) }}>
            {capacityData.avgUtilization}%
          </div>
        </div>
        <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} className="text-[#ef4444]" />
            <span className="text-[10px] text-[#4a5a4a]">Bottlenecks</span>
          </div>
          <div className="text-lg font-bold text-[#ef4444]">{capacityData.bottleneckCount}</div>
        </div>
      </div>

      {/* Resource list */}
      <div className="px-3 pb-3">
        <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-2 flex items-center gap-1">
          <TrendingUp size={10} /> Resource Utilization
        </h4>
        <div className="space-y-2">
          {capacityData.items.map((item, i) => (
            <div key={i} className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white truncate flex-1">{item.name}</span>
                <span className="text-[10px] font-bold font-mono" style={{ color: utilizationColor(item.utilization) }}>
                  {item.utilization}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1a2a1a]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${item.utilization}%`, backgroundColor: utilizationColor(item.utilization) }}
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[8px] text-[#3a4a3a] capitalize">{item.type.replace(/_/g, ' ')}</span>
                <span className="text-[8px] text-[#3a4a3a]">{item.currentLoad}/{item.maxCapacity} load</span>
                <span className={`text-[8px] ${item.trend === 'growing' ? 'text-[#ef4444]' : item.trend === 'declining' ? 'text-[#22c55e]' : 'text-[#4a5a4a]'}`}>
                  {item.trend === 'growing' ? '↑' : item.trend === 'declining' ? '↓' : '→'} {item.trend}
                </span>
                {item.bottleneck && (
                  <span className="text-[8px] bg-[#ef4444]/20 text-[#ef4444] px-1 rounded">Bottleneck</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {capacityData.items.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[#4a5a4a] text-center">No infrastructure elements</p>
        </div>
      )}
    </div>
  );
}
