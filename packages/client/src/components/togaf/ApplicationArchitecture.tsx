import { useMemo } from 'react';
import { AppWindow, Layers, AlertTriangle, TrendingUp } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

export default function ApplicationArchitecture() {
  const elements = useArchitectureStore((s) => s.elements);

  const appElements = useMemo(() =>
    elements.filter((el) => el.togafDomain === 'application'),
  [elements]);

  const apps = appElements.filter((el) => el.type === 'application');
  const components = appElements.filter((el) => el.type === 'application_component');
  const services = appElements.filter((el) => el.type === 'application_service' || el.type === 'service');

  const highRiskCount = appElements.filter(
    (el) => el.riskLevel === 'high' || el.riskLevel === 'critical'
  ).length;

  // Application portfolio matrix quadrants
  const portfolioQuadrants = useMemo(() => {
    const invest = appElements.filter((el) => el.maturityLevel >= 4 && el.riskLevel === 'low');
    const tolerate = appElements.filter((el) => el.maturityLevel >= 3 && el.maturityLevel < 4 && el.riskLevel !== 'critical');
    const migrate = appElements.filter((el) => el.maturityLevel < 3 && el.riskLevel !== 'critical');
    const eliminate = appElements.filter((el) => el.riskLevel === 'critical' || (el.maturityLevel <= 1 && el.status === 'retired'));
    return { invest, tolerate, migrate, eliminate };
  }, [appElements]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#f97316]" />
          Application Architecture
        </h3>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">ADM Phase C - Application portfolio, components, and services</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <StatCard icon={<AppWindow size={14} />} label="Applications" value={apps.length} color="#f97316" />
        <StatCard icon={<Layers size={14} />} label="Components" value={components.length} color="#00ff41" />
        <StatCard icon={<TrendingUp size={14} />} label="Services" value={services.length} color="#06b6d4" />
        <StatCard icon={<AlertTriangle size={14} />} label="High Risk" value={highRiskCount} color="#ef4444" />
      </div>

      {/* Portfolio Matrix */}
      <div className="px-3 pb-3">
        <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">Portfolio Matrix</h4>
        <div className="grid grid-cols-2 gap-1">
          <QuadrantCell label="Invest" count={portfolioQuadrants.invest.length} color="#22c55e" items={portfolioQuadrants.invest} />
          <QuadrantCell label="Tolerate" count={portfolioQuadrants.tolerate.length} color="#eab308" items={portfolioQuadrants.tolerate} />
          <QuadrantCell label="Migrate" count={portfolioQuadrants.migrate.length} color="#f97316" items={portfolioQuadrants.migrate} />
          <QuadrantCell label="Eliminate" count={portfolioQuadrants.eliminate.length} color="#ef4444" items={portfolioQuadrants.eliminate} />
        </div>
      </div>

      {/* Application list */}
      {apps.length > 0 && (
        <div className="px-3 pb-3 border-t border-[var(--border-subtle)] pt-3">
          <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-2">Applications</h4>
          <div className="space-y-1.5">
            {apps.map((app) => (
              <div key={app.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white font-medium">{app.name}</span>
                  <LifecycleBadge maturity={app.maturityLevel} risk={app.riskLevel} />
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{app.description || 'No description'}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[9px] text-[var(--text-disabled)]">Maturity: {app.maturityLevel}/5</span>
                  <span className={`text-[9px] capitalize ${
                    app.riskLevel === 'critical' ? 'text-red-400' :
                    app.riskLevel === 'high' ? 'text-orange-400' :
                    app.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    Risk: {app.riskLevel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {appElements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[var(--text-tertiary)] text-center">
            No application architecture elements yet.<br />
            Add Applications, Components, or Services from the Explorer.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
      <div className="flex items-center gap-1.5 mb-1" style={{ color }}>{icon}<span className="text-[10px] text-[var(--text-tertiary)]">{label}</span></div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function QuadrantCell({ label, count, color, items }: { label: string; count: number; color: string; items: { name: string }[] }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2" style={{ borderLeftColor: color, borderLeftWidth: 2 }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
        <span className="text-xs font-bold text-white">{count}</span>
      </div>
      {items.slice(0, 2).map((item, i) => (
        <div key={i} className="text-[9px] text-[var(--text-tertiary)] truncate">{item.name}</div>
      ))}
      {items.length > 2 && <div className="text-[9px] text-[var(--text-disabled)]">+{items.length - 2} more</div>}
    </div>
  );
}

function LifecycleBadge({ maturity, risk }: { maturity: number; risk: string }) {
  const lifecycle = risk === 'critical' ? 'eliminate' : maturity >= 4 ? 'invest' : maturity >= 3 ? 'tolerate' : 'migrate';
  const colors: Record<string, string> = { invest: '#22c55e', tolerate: '#eab308', migrate: '#f97316', eliminate: '#ef4444' };
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize"
      style={{ backgroundColor: `${colors[lifecycle]}20`, color: colors[lifecycle] }}>
      {lifecycle}
    </span>
  );
}
