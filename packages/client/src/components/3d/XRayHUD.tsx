import { useMemo } from 'react';
import { useXRayStore, type XRaySubView } from '../../stores/xrayStore';
import { useSimulationStore } from '../../stores/simulationStore';

const SUB_VIEW_LABELS: Record<XRaySubView, { label: string; color: string }> = {
  risk: { label: 'RISK TOPOLOGY', color: '#ef4444' },
  cost: { label: 'COST GRAVITY', color: '#22c55e' },
  timeline: { label: 'TRANSFORMATION TIMELINE', color: '#06b6d4' },
  simulation: { label: 'SIMULATION DELTAS', color: '#a855f7' },
};

function formatCurrency(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

/**
 * XRayHUD is rendered OUTSIDE the Canvas as a fixed DOM overlay.
 * This ensures it stays in place regardless of camera zoom/pan.
 */
export default function XRayHUD() {
  const metrics = useXRayStore((s) => s.metrics);
  const subView = useXRayStore((s) => s.subView);
  const setSubView = useXRayStore((s) => s.setSubView);
  const aiNarrative = useXRayStore((s) => s.aiNarrative);

  // Simulation data for the simulation sub-view
  const hasSimulationResult = useSimulationStore((s) => s.activeRun?.result != null);
  const fatigueReport = useSimulationStore((s) => s.fatigueReport);
  const emergenceMetrics = useSimulationStore((s) => s.emergenceMetrics);

  // Dynamically available views — simulation only when result exists
  const availableViews = useMemo<XRaySubView[]>(() => {
    const base: XRaySubView[] = ['risk', 'cost', 'timeline'];
    if (hasSimulationResult) base.push('simulation');
    return base;
  }, [hasSimulationResult]);

  const viewInfo = SUB_VIEW_LABELS[subView];

  return (
    <>
      {/* Top center: Mode indicator + Sub-view selector */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-1.5"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: `1px solid ${viewInfo.color}`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              background: viewInfo.color,
              boxShadow: `0 0 8px ${viewInfo.color}`,
            }}
          />
          <span
            className="text-[11px] font-bold tracking-widest"
            style={{ color: viewInfo.color }}
          >
            X-RAY: {viewInfo.label}
          </span>
        </div>

        {/* Sub-view toggle pills */}
        <div className="flex gap-0.5 rounded-lg bg-[#0a0a0a]/95 border border-[#1a2a1a] p-0.5">
          {availableViews.map((view) => (
            <button
              key={view}
              onClick={() => setSubView(view)}
              className="rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all"
              style={{
                background: subView === view ? SUB_VIEW_LABELS[view].color + '30' : 'transparent',
                color: subView === view ? SUB_VIEW_LABELS[view].color : '#4a5a4a',
              }}
            >
              {view === 'simulation' ? 'sim' : view}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom-left: 4-number metrics panel - context-aware per sub-view */}
      <div className="absolute bottom-4 left-4 z-20 grid grid-cols-2 gap-2 w-[280px]">
        {subView === 'simulation' && fatigueReport && emergenceMetrics ? (
          <>
            <MetricCard
              label="Fatigue Index"
              value={`${(fatigueReport.globalIndex * 100).toFixed(0)}%`}
              color={
                fatigueReport.rating === 'red' ? '#ef4444'
                  : fatigueReport.rating === 'orange' ? '#f97316'
                    : fatigueReport.rating === 'yellow' ? '#eab308'
                      : '#22c55e'
              }
            />
            <MetricCard
              label="Deadlocks"
              value={`${emergenceMetrics.deadlockCount}`}
              color={emergenceMetrics.deadlockCount > 0 ? '#ef4444' : '#22c55e'}
            />
            <MetricCard
              label="Consensus"
              value={`${(emergenceMetrics.consensusScore * 100).toFixed(0)}%`}
              color={emergenceMetrics.consensusScore >= 0.5 ? '#22c55e' : '#eab308'}
            />
            <MetricCard
              label="Projected Delay"
              value={`+${fatigueReport.totalProjectedDelayMonths} mo`}
              color={fatigueReport.totalProjectedDelayMonths > 3 ? '#ef4444' : '#3b82f6'}
            />
          </>
        ) : subView === 'cost' ? (
          <>
            <MetricCard
              label="Total Cost (TCO)"
              value={`€${formatCurrency(metrics.totalCost)}`}
              color="#3b82f6"
            />
            <MetricCard
              label="Savings Potential"
              value={`€${formatCurrency(metrics.optimizationTotal)}`}
              color="#22c55e"
            />
            <MetricCard
              label="P10 (Optimistic)"
              value={`€${formatCurrency(metrics.costP10)}`}
              color="#22c55e"
            />
            <MetricCard
              label="P90 (Pessimistic)"
              value={`€${formatCurrency(metrics.costP90)}`}
              color="#ef4444"
            />
          </>
        ) : (
          <>
            <MetricCard
              label="Risk Exposure"
              value={`€${formatCurrency(metrics.totalRiskExposure)}`}
              color="#ef4444"
            />
            <MetricCard
              label="Transformation"
              value={`${metrics.transformationProgress}%`}
              color="#22c55e"
            />
            <MetricCard
              label="Time to Target"
              value={`${metrics.timeToTarget} mo`}
              color="#3b82f6"
            />
            <MetricCard
              label="Confidence"
              value={`${metrics.decisionConfidence}%`}
              color={metrics.decisionConfidence >= 70 ? '#22c55e' : metrics.decisionConfidence >= 40 ? '#eab308' : '#ef4444'}
            />
          </>
        )}
      </div>

      {/* Bottom-right: AI Narrative / Simulation Recommendation */}
      {subView === 'simulation' && fatigueReport?.recommendation ? (
        <div
          className="absolute bottom-4 right-4 z-20 max-w-[360px] rounded-lg border border-[#a855f7] p-3"
          style={{ background: 'rgba(15, 23, 42, 0.95)' }}
        >
          <div className="text-[9px] font-bold text-[#a855f7] tracking-widest uppercase mb-1.5">
            SIMULATION INSIGHT
          </div>
          <div className="text-[11px] text-[#cbd5e1] leading-relaxed">
            {fatigueReport.recommendation}
          </div>
        </div>
      ) : aiNarrative ? (
        <div
          className="absolute bottom-4 right-4 z-20 max-w-[360px] rounded-lg border border-[#00ff41] p-3"
          style={{ background: 'rgba(15, 23, 42, 0.95)' }}
        >
          <div className="text-[9px] font-bold text-[#00ff41] tracking-widest uppercase mb-1.5">
            AI INSIGHT
          </div>
          <div className="text-[11px] text-[#cbd5e1] leading-relaxed">
            {aiNarrative}
          </div>
        </div>
      ) : null}
    </>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-lg border border-[#1a2a1a] px-3 py-2"
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="text-[9px] font-semibold text-[#4a5a4a] uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div
        className="text-lg font-extrabold font-mono"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}
