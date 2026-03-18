import { useMemo } from 'react';
import { Server, Cloud, AlertTriangle, Cpu } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

export default function TechnologyArchitecture() {
  const elements = useArchitectureStore((s) => s.elements);

  const techElements = useMemo(() =>
    elements.filter((el) => el.togafDomain === 'technology'),
  [elements]);

  const techComponents = techElements.filter((el) => el.type === 'technology_component');
  const infrastructure = techElements.filter((el) => el.type === 'infrastructure');
  const platformServices = techElements.filter((el) => el.type === 'platform_service');

  const highRiskCount = techElements.filter(
    (el) => el.riskLevel === 'high' || el.riskLevel === 'critical'
  ).length;

  // Technology standards by category
  const standardsBreakdown = useMemo(() => {
    const approved = techElements.filter((el) => el.status === 'current' && el.maturityLevel >= 4);
    const emerging = techElements.filter((el) => el.status === 'target');
    const contained = techElements.filter((el) => el.status === 'transitional');
    const retired = techElements.filter((el) => el.status === 'retired');
    return { approved, emerging, contained, retired };
  }, [techElements]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#1a2a1a]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#00ff41]" />
          Technology Architecture
        </h3>
        <p className="text-[10px] text-[#4a5a4a] mt-1">ADM Phase D - Infrastructure, platforms, and technology standards</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <StatCard icon={<Cpu size={14} />} label="Tech Components" value={techComponents.length} color="#00ff41" />
        <StatCard icon={<Server size={14} />} label="Infrastructure" value={infrastructure.length} color="#3b82f6" />
        <StatCard icon={<Cloud size={14} />} label="Platform Svc" value={platformServices.length} color="#06b6d4" />
        <StatCard icon={<AlertTriangle size={14} />} label="High Risk" value={highRiskCount} color="#ef4444" />
      </div>

      {/* Technology Standards Radar */}
      <div className="px-3 pb-3">
        <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-2">Technology Radar</h4>
        <div className="grid grid-cols-2 gap-1">
          <RadarQuadrant label="Approved" count={standardsBreakdown.approved.length} color="#22c55e" items={standardsBreakdown.approved} />
          <RadarQuadrant label="Emerging" count={standardsBreakdown.emerging.length} color="#06b6d4" items={standardsBreakdown.emerging} />
          <RadarQuadrant label="Contained" count={standardsBreakdown.contained.length} color="#eab308" items={standardsBreakdown.contained} />
          <RadarQuadrant label="Retired" count={standardsBreakdown.retired.length} color="#ef4444" items={standardsBreakdown.retired} />
        </div>
      </div>

      {/* Infrastructure list */}
      {infrastructure.length > 0 && (
        <div className="px-3 pb-3 border-t border-[#1a2a1a] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-2">Infrastructure</h4>
          {infrastructure.map((infra) => (
            <div key={infra.id} className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2 mb-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Server size={12} className="text-[#00ff41]" />
                  <span className="text-xs text-white font-medium">{infra.name}</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize ${
                  infra.status === 'current' ? 'bg-green-500/20 text-green-400' :
                  infra.status === 'target' ? 'bg-cyan-500/20 text-cyan-400' :
                  infra.status === 'retired' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {infra.status}
                </span>
              </div>
              <p className="text-[10px] text-[#4a5a4a] mt-0.5">{infra.description || 'No description'}</p>
            </div>
          ))}
        </div>
      )}

      {techElements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[#4a5a4a] text-center">
            No technology architecture elements yet.<br />
            Add Technology Components, Infrastructure, or Platform Services.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>{icon}<span className="text-[10px] text-[#4a5a4a]">{label}</span></div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function RadarQuadrant({ label, count, color, items }: { label: string; count: number; color: string; items: { name: string }[] }) {
  return (
    <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2" style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
        <span className="text-xs font-bold text-white">{count}</span>
      </div>
      {items.slice(0, 3).map((item, i) => (
        <div key={i} className="text-[9px] text-[#4a5a4a] truncate">{item.name}</div>
      ))}
      {items.length > 3 && <div className="text-[9px] text-[#3a4a3a]">+{items.length - 3} more</div>}
    </div>
  );
}
