import { useMemo } from 'react';
import { Shield, AlertTriangle, TrendingDown, Activity } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

export default function RiskDashboard() {
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);

  const riskData = useMemo(() => {
    const assessed = elements.map((el) => {
      const outDegree = connections.filter((c) => c.sourceId === el.id).length;
      const inDegree = connections.filter((c) => c.targetId === el.id).length;
      const riskScores: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };
      const statusScores: Record<string, number> = { retired: 8, transitional: 6, target: 3, current: 1 };

      const inherent = riskScores[el.riskLevel] || 2;
      const maturityRisk = (5 - el.maturityLevel) * 2;
      const depExposure = Math.min(outDegree * 1.5, 10);
      const depImpact = Math.min(inDegree * 2, 10);
      const lifecycle = statusScores[el.status] || 5;

      const score = inherent * 0.3 + maturityRisk * 0.2 + depExposure * 0.2 + depImpact * 0.2 + lifecycle * 0.1;

      return { ...el, riskScore: Math.round(score * 10) / 10, outDegree, inDegree };
    });

    assessed.sort((a, b) => b.riskScore - a.riskScore);

    return {
      elements: assessed,
      critical: assessed.filter((e) => e.riskScore >= 8).length,
      high: assessed.filter((e) => e.riskScore >= 6 && e.riskScore < 8).length,
      medium: assessed.filter((e) => e.riskScore >= 4 && e.riskScore < 6).length,
      low: assessed.filter((e) => e.riskScore < 4).length,
      average: assessed.length > 0
        ? Math.round((assessed.reduce((s, e) => s + e.riskScore, 0) / assessed.length) * 10) / 10
        : 0,
    };
  }, [elements, connections]);

  const getRiskColor = (score: number) => {
    if (score >= 8) return '#ef4444';
    if (score >= 6) return '#f97316';
    if (score >= 4) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Shield size={14} className="text-[#ef4444]" />
          Risk Dashboard
        </h3>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Architecture risk assessment overview</p>
      </div>

      {/* Risk summary cards */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={12} className="text-[var(--text-secondary)]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Avg Risk Score</span>
          </div>
          <div className="text-lg font-bold" style={{ color: getRiskColor(riskData.average) }}>
            {riskData.average}
          </div>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} className="text-[#ef4444]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Critical + High</span>
          </div>
          <div className="text-lg font-bold text-[#ef4444]">{riskData.critical + riskData.high}</div>
        </div>
      </div>

      {/* Risk distribution bar */}
      <div className="px-3 pb-3">
        <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">Distribution</h4>
        <div className="flex h-4 rounded-full overflow-hidden bg-[var(--surface-base)]">
          {riskData.critical > 0 && (
            <div
              className="h-full bg-[#ef4444]"
              style={{ width: `${(riskData.critical / elements.length) * 100}%` }}
              title={`Critical: ${riskData.critical}`}
            />
          )}
          {riskData.high > 0 && (
            <div
              className="h-full bg-[#f97316]"
              style={{ width: `${(riskData.high / elements.length) * 100}%` }}
              title={`High: ${riskData.high}`}
            />
          )}
          {riskData.medium > 0 && (
            <div
              className="h-full bg-[#eab308]"
              style={{ width: `${(riskData.medium / elements.length) * 100}%` }}
              title={`Medium: ${riskData.medium}`}
            />
          )}
          {riskData.low > 0 && (
            <div
              className="h-full bg-[#22c55e]"
              style={{ width: `${(riskData.low / elements.length) * 100}%` }}
              title={`Low: ${riskData.low}`}
            />
          )}
        </div>
        <div className="flex justify-between mt-1.5">
          {[
            { label: 'Critical', count: riskData.critical, color: '#ef4444' },
            { label: 'High', count: riskData.high, color: '#f97316' },
            { label: 'Medium', count: riskData.medium, color: '#eab308' },
            { label: 'Low', count: riskData.low, color: '#22c55e' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[9px] text-[var(--text-tertiary)]">{item.label}: {item.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top risks */}
      <div className="px-3 pb-3 border-t border-[var(--border-subtle)] pt-3">
        <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2 flex items-center gap-1">
          <TrendingDown size={10} /> Highest Risk Elements
        </h4>
        <div className="space-y-1.5">
          {riskData.elements.slice(0, 10).map((el) => (
            <div key={el.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white font-medium truncate flex-1">{el.name}</span>
                <span
                  className="text-xs font-bold font-mono ml-2"
                  style={{ color: getRiskColor(el.riskScore) }}
                >
                  {el.riskScore}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] text-[var(--text-disabled)] capitalize">{el.type.replace(/_/g, ' ')}</span>
                <span className="text-[9px] text-[var(--text-disabled)]">{el.outDegree} deps</span>
                <span className="text-[9px] text-[var(--text-disabled)]">{el.inDegree} dependents</span>
              </div>
              {/* Risk bar */}
              <div className="mt-1.5 h-1 rounded-full bg-[#1a2a1a]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${el.riskScore * 10}%`,
                    backgroundColor: getRiskColor(el.riskScore),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {elements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[var(--text-tertiary)] text-center">No elements to assess</p>
        </div>
      )}
    </div>
  );
}
