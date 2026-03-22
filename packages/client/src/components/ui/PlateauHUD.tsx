import { useRoadmapStore } from '../../stores/roadmapStore';

function formatCurrency(n: number): string {
  if (n >= 1000000) return `€${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `€${(n / 1000).toFixed(0)}K`;
  return `€${n.toFixed(0)}`;
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-lg border border-[#1a2a1a] px-3 py-2"
      style={{
        background: 'rgba(10, 10, 10, 0.95)',
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

export default function PlateauHUD() {
  const plateauSnapshots = useRoadmapStore((s) => s.plateauSnapshots);
  const selectedPlateauIndex = useRoadmapStore((s) => s.selectedPlateauIndex);

  if (selectedPlateauIndex === null || !plateauSnapshots[selectedPlateauIndex]) return null;

  const snapshot = plateauSnapshots[selectedPlateauIndex];
  const isAsIs = snapshot.waveNumber === null;

  return (
    <div className="absolute top-3 right-4 z-20">
      {/* Mode indicator */}
      <div
        className="flex items-center gap-3 rounded-lg px-4 py-1.5 mb-2"
        style={{
          background: 'rgba(10, 10, 10, 0.95)',
          border: '1px solid #00ff41',
        }}
      >
        <div
          className="w-2 h-2 rounded-full animate-pulse"
          style={{
            background: '#00ff41',
            boxShadow: '0 0 8px #00ff41',
          }}
        />
        <span className="text-[11px] font-bold tracking-widest text-[#00ff41]">
          PLATEAU: {snapshot.label.toUpperCase()}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 w-[260px]">
        <MetricCard
          label="Cumulative Cost"
          value={formatCurrency(snapshot.cumulativeCost)}
          color="#3b82f6"
        />
        <MetricCard
          label="Risk Delta"
          value={`${snapshot.cumulativeRiskDelta >= 0 ? '+' : ''}${snapshot.cumulativeRiskDelta.toFixed(1)}`}
          color={snapshot.cumulativeRiskDelta <= 0 ? '#22c55e' : '#ef4444'}
        />
        <MetricCard
          label="Changes"
          value={isAsIs ? '—' : `${snapshot.changedElementIds.length}`}
          color="#f59e0b"
        />
        {snapshot.metrics ? (
          <MetricCard
            label="Avg Fatigue"
            value={`${(snapshot.metrics.avgFatigue * 100).toFixed(0)}%`}
            color={snapshot.metrics.avgFatigue > 0.6 ? '#ef4444' : snapshot.metrics.avgFatigue > 0.3 ? '#eab308' : '#22c55e'}
          />
        ) : (
          <MetricCard
            label="Total Elements"
            value={`${Object.keys(snapshot.elements).length}`}
            color="#6366f1"
          />
        )}
      </div>

      {/* Compliance fixes (if available) */}
      {snapshot.metrics && snapshot.metrics.complianceImpact > 0 && (
        <div
          className="mt-2 rounded-lg border border-[#22c55e] px-3 py-2"
          style={{ background: 'rgba(10, 10, 10, 0.95)' }}
        >
          <span className="text-[9px] font-semibold text-[#22c55e] uppercase tracking-wider">
            Compliance Fixes: {snapshot.metrics.complianceImpact}
          </span>
        </div>
      )}
    </div>
  );
}
