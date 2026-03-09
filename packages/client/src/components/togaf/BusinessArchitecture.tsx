import { useMemo } from 'react';
import { TrendingUp, AlertTriangle, Zap, BarChart3 } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

const MATURITY_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

export default function BusinessArchitecture() {
  const elements = useArchitectureStore((s) => s.elements);

  const businessElements = useMemo(() =>
    elements.filter((el) => el.togafDomain === 'business'),
  [elements]);

  const capabilities = businessElements.filter((el) => el.type === 'business_capability');
  const processes = businessElements.filter((el) => el.type === 'process');
  const valueStreams = businessElements.filter((el) => el.type === 'value_stream');
  const services = businessElements.filter((el) => el.type === 'business_service');

  const avgMaturity = businessElements.length > 0
    ? businessElements.reduce((sum, el) => sum + el.maturityLevel, 0) / businessElements.length
    : 0;

  const highRiskCount = businessElements.filter(
    (el) => el.riskLevel === 'high' || el.riskLevel === 'critical'
  ).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#334155]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#22c55e]" />
          Business Architecture
        </h3>
        <p className="text-[10px] text-[#64748b] mt-1">ADM Phase B - Business capabilities, processes, and value streams</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <StatCard icon={<BarChart3 size={14} />} label="Capabilities" value={capabilities.length} color="#22c55e" />
        <StatCard icon={<Zap size={14} />} label="Processes" value={processes.length} color="#3b82f6" />
        <StatCard icon={<TrendingUp size={14} />} label="Avg Maturity" value={avgMaturity.toFixed(1)} color="#06b6d4" />
        <StatCard icon={<AlertTriangle size={14} />} label="High Risk" value={highRiskCount} color="#ef4444" />
      </div>

      {/* Capability Maturity Heatmap */}
      {capabilities.length > 0 && (
        <div className="px-3 pb-3">
          <h4 className="text-[10px] font-semibold uppercase text-[#64748b] mb-2">Capability Maturity</h4>
          <div className="space-y-1">
            {capabilities.map((cap) => (
              <div key={cap.id} className="flex items-center gap-2">
                <span className="text-[10px] text-[#94a3b8] truncate flex-1 min-w-0">{cap.name}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className="h-2.5 w-3 rounded-sm"
                      style={{
                        backgroundColor: level <= cap.maturityLevel
                          ? MATURITY_COLORS[cap.maturityLevel - 1]
                          : '#1e293b',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Value Streams */}
      {valueStreams.length > 0 && (
        <div className="px-3 pb-3 border-t border-[#334155] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[#64748b] mb-2">Value Streams</h4>
          {valueStreams.map((vs) => (
            <div key={vs.id} className="rounded-md border border-[#334155] bg-[#0f172a] p-2 mb-2">
              <div className="text-xs text-white font-medium">{vs.name}</div>
              <div className="text-[10px] text-[#64748b] mt-0.5">{vs.description || 'No description'}</div>
              <div className="flex items-center gap-1 mt-1">
                <RiskBadge level={vs.riskLevel} />
                <span className="text-[10px] text-[#475569]">Maturity: {vs.maturityLevel}/5</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Business Services */}
      {services.length > 0 && (
        <div className="px-3 pb-3 border-t border-[#334155] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[#64748b] mb-2">Business Services</h4>
          {services.map((svc) => (
            <div key={svc.id} className="flex items-center gap-2 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
              <span className="text-[10px] text-[#94a3b8] flex-1 truncate">{svc.name}</span>
              <RiskBadge level={svc.riskLevel} />
            </div>
          ))}
        </div>
      )}

      {businessElements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[#64748b] text-center">
            No business architecture elements yet.<br />
            Add Business Capabilities, Processes, or Value Streams from the Explorer.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-md border border-[#334155] bg-[#0f172a] p-2">
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
        {icon}
        <span className="text-[10px] text-[#64748b]">{label}</span>
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' };
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize"
      style={{ backgroundColor: `${colors[level]}20`, color: colors[level] }}>
      {level}
    </span>
  );
}
