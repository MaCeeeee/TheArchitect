import { useNavigate, useParams } from 'react-router-dom';
import {
  DollarSign, Shield, TrendingDown, GitCompare, Activity, Map,
} from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useXRayStore } from '../../stores/xrayStore';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useRoadmapStore } from '../../stores/roadmapStore';

const formatCost = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

export default function AnalyzeDashboard() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const elements = useArchitectureStore((s) => s.elements);
  const metrics = useXRayStore((s) => s.metrics);
  const graphCostProfiles = useXRayStore((s) => s.graphCostProfiles);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const activeRoadmap = useRoadmapStore((s) => s.activeRoadmap);

  // Tier badge
  let dominantTier = 0;
  if (graphCostProfiles.length > 0) {
    const tierCounts = [0, 0, 0, 0];
    for (const p of graphCostProfiles) tierCounts[p.tier]++;
    for (let t = 3; t >= 0; t--) {
      if (tierCounts[t] > 0) { dominantTier = t; break; }
    }
  }

  // Risk level counts
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const el of elements) {
    const level = el.riskLevel as keyof typeof riskCounts;
    if (level in riskCounts) riskCounts[level]++;
  }

  const topScenario = scenarios[0];
  const waveCount = activeRoadmap?.waves?.length ?? 0;

  const cards = [
    {
      label: 'Total TCO',
      icon: DollarSign,
      iconColor: '#3b82f6',
      value: formatCost(metrics.totalCost),
      sub: metrics.costP10 > 0
        ? `P10 ${formatCost(metrics.costP10)} \u2013 P90 ${formatCost(metrics.costP90)}`
        : 'Activate X-Ray for data',
      badge: dominantTier > 0 ? `T${dominantTier}` : undefined,
      target: 'cost',
    },
    {
      label: 'Risk Exposure',
      icon: Shield,
      iconColor: '#ef4444',
      value: formatCost(metrics.totalRiskExposure),
      sub: `${riskCounts.critical} critical \u00b7 ${riskCounts.high} high \u00b7 ${riskCounts.medium} med`,
      target: 'risk',
    },
    {
      label: 'Optimization',
      icon: TrendingDown,
      iconColor: '#22c55e',
      value: formatCost(metrics.optimizationTotal),
      sub: metrics.totalCost > 0
        ? `${Math.round((metrics.optimizationTotal / metrics.totalCost) * 100)}% of TCO`
        : 'No cost data yet',
      target: 'cost',
    },
    {
      label: 'Scenarios',
      icon: GitCompare,
      iconColor: '#a78bfa',
      value: `${scenarios.length}`,
      sub: topScenario ? `Top: ${topScenario.name}` : 'No scenarios yet',
      target: 'scenarios',
    },
    {
      label: 'Progress',
      icon: Activity,
      iconColor: '#06b6d4',
      value: `${metrics.transformationProgress}%`,
      sub: `${elements.filter((e) => e.status === 'target').length} of ${elements.length} at target`,
      target: 'impact',
    },
    {
      label: 'Roadmap',
      icon: Map,
      iconColor: '#f59e0b',
      value: activeRoadmap ? activeRoadmap.status || 'Active' : 'Not generated',
      sub: activeRoadmap ? `${waveCount} wave${waveCount !== 1 ? 's' : ''}` : 'Generate a roadmap first',
      target: 'roadmap',
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Analysis Dashboard</h2>
      <p className="text-sm text-[var(--text-tertiary)] mb-6">
        Overview of your architecture's cost, risk, and transformation metrics.
      </p>

      {elements.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <p className="text-sm">No architecture elements found.</p>
          <p className="text-xs mt-1">Add elements in the Architecture view to see analytics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                onClick={() => navigate(`/project/${projectId}/analyze/${card.target}`)}
                className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-4 text-left hover:border-[#7c3aed]/50 transition group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} style={{ color: card.iconColor }} />
                    <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                      {card.label}
                    </span>
                  </div>
                  {card.badge && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40">
                      {card.badge}
                    </span>
                  )}
                </div>
                <div className="text-xl font-bold text-white mb-1">{card.value}</div>
                <p className="text-[11px] text-[var(--text-tertiary)] truncate">{card.sub}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
