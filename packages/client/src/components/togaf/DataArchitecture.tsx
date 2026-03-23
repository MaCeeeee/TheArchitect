import { useMemo } from 'react';
import { Database, Shield, BarChart3, AlertTriangle } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

export default function DataArchitecture() {
  const elements = useArchitectureStore((s) => s.elements);

  const dataElements = useMemo(() =>
    elements.filter((el) => el.togafDomain === 'data'),
  [elements]);

  const entities = dataElements.filter((el) => el.type === 'data_entity');
  const models = dataElements.filter((el) => el.type === 'data_model');

  const avgMaturity = dataElements.length > 0
    ? dataElements.reduce((sum, el) => sum + el.maturityLevel, 0) / dataElements.length
    : 0;

  const highRiskCount = dataElements.filter(
    (el) => el.riskLevel === 'high' || el.riskLevel === 'critical'
  ).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#3b82f6]" />
          Data Architecture
        </h3>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">ADM Phase C - Data entities, models, and governance</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <StatCard icon={<Database size={14} />} label="Data Entities" value={entities.length} color="#3b82f6" />
        <StatCard icon={<BarChart3 size={14} />} label="Data Models" value={models.length} color="#06b6d4" />
        <StatCard icon={<Shield size={14} />} label="Avg Quality" value={`${(avgMaturity * 20).toFixed(0)}%`} color="#22c55e" />
        <StatCard icon={<AlertTriangle size={14} />} label="High Risk" value={highRiskCount} color="#ef4444" />
      </div>

      {/* Data Entities List */}
      {entities.length > 0 && (
        <div className="px-3 pb-3">
          <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">Data Entities</h4>
          <div className="space-y-1.5">
            {entities.map((entity) => (
              <div key={entity.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white font-medium">{entity.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize ${
                    entity.status === 'current' ? 'bg-green-500/20 text-green-400' :
                    entity.status === 'target' ? 'bg-cyan-500/20 text-cyan-400' :
                    entity.status === 'retired' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {entity.status}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{entity.description || 'No description'}</p>
                {/* Quality bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[9px] text-[var(--text-disabled)]">Quality</span>
                  <div className="flex-1 h-1 rounded-full bg-[#1a2a1a]">
                    <div
                      className="h-full rounded-full bg-[#3b82f6]"
                      style={{ width: `${entity.maturityLevel * 20}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-[var(--text-secondary)]">{entity.maturityLevel * 20}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Models */}
      {models.length > 0 && (
        <div className="px-3 pb-3 border-t border-[var(--border-subtle)] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">Data Models</h4>
          {models.map((model) => (
            <div key={model.id} className="flex items-center gap-2 py-1">
              <Database size={12} className="text-[#3b82f6]" />
              <span className="text-[10px] text-[var(--text-secondary)] flex-1 truncate">{model.name}</span>
              <span className="text-[9px] text-[var(--text-disabled)]">{model.maturityLevel}/5</span>
            </div>
          ))}
        </div>
      )}

      {dataElements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[var(--text-tertiary)] text-center">
            No data architecture elements yet.<br />
            Add Data Entities or Data Models from the Explorer.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>
        {icon}
        <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
