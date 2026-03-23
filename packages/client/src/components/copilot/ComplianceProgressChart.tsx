import { useEffect, useState } from 'react';
import { Camera, TrendingUp, Loader2 } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';

interface ComplianceProgressChartProps {
  projectId: string;
  standardId?: string;
}

export default function ComplianceProgressChart({ projectId, standardId }: ComplianceProgressChartProps) {
  const { snapshots, isLoadingSnapshots, loadSnapshots, captureSnapshot } = useComplianceStore();
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    loadSnapshots(projectId, standardId);
  }, [projectId, standardId, loadSnapshots]);

  const handleCapture = async () => {
    setCapturing(true);
    await captureSnapshot(projectId, standardId);
    setCapturing(false);
  };

  const actual = snapshots.filter((s) => s.type === 'actual').slice().reverse();
  const projected = snapshots.filter((s) => s.type === 'projected').sort((a, b) => (a.waveNumber ?? 0) - (b.waveNumber ?? 0));

  // Chart dimensions
  const W = 480;
  const H = 200;
  const PAD = { top: 20, right: 20, bottom: 30, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Build polyline for actual scores
  const buildLine = (data: typeof actual, key: 'standardCoverageScore' | 'policyComplianceScore') => {
    if (data.length === 0) return '';
    const xStep = data.length > 1 ? plotW / (data.length - 1) : plotW / 2;
    return data
      .map((d, i) => {
        const x = PAD.left + (data.length > 1 ? i * xStep : plotW / 2);
        const y = PAD.top + plotH - (d[key] / 100) * plotH;
        return `${x},${y}`;
      })
      .join(' ');
  };

  const coverageLine = buildLine(actual, 'standardCoverageScore');
  const policyLine = buildLine(actual, 'policyComplianceScore');

  // Build projected line (dashed)
  const projectedLine = (() => {
    if (projected.length === 0 || actual.length === 0) return '';
    // Start from last actual point
    const lastActual = actual[actual.length - 1];
    const allPts = [lastActual, ...projected];
    const totalPts = actual.length + projected.length;
    const xStep = totalPts > 1 ? plotW / (totalPts - 1) : plotW / 2;
    return allPts
      .map((d, i) => {
        const x = PAD.left + (actual.length - 1 + i) * xStep;
        const y = PAD.top + plotH - (d.standardCoverageScore / 100) * plotH;
        return `${x},${y}`;
      })
      .join(' ');
  })();

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  // X-axis labels (dates for actual points)
  const xLabels = actual.map((d, i) => {
    const xStep = actual.length > 1 ? plotW / (actual.length - 1) : plotW / 2;
    const x = PAD.left + (actual.length > 1 ? i * xStep : plotW / 2);
    const date = new Date(d.createdAt);
    return { x, label: `${date.getMonth() + 1}/${date.getDate()}` };
  });

  // Latest snapshot info
  const latest = actual[actual.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#e2e8f0] flex items-center gap-2">
          <TrendingUp size={14} className="text-[#7c3aed]" />
          Compliance Progress
        </h3>
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-[#7c3aed]/20 text-[#a78bfa] hover:bg-[#7c3aed]/30 disabled:opacity-50 transition-colors"
        >
          {capturing ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
          Capture Snapshot
        </button>
      </div>

      {isLoadingSnapshots ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : actual.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-tertiary)] text-xs">
          No snapshots yet. Capture your first snapshot to start tracking progress.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {latest && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[var(--surface-overlay)] rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[#7c3aed]">{latest.standardCoverageScore}%</div>
                <div className="text-[10px] text-[var(--text-secondary)]">Coverage</div>
              </div>
              <div className="bg-[var(--surface-overlay)] rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[#22c55e]">{latest.policyComplianceScore}%</div>
                <div className="text-[10px] text-[var(--text-secondary)]">Policy</div>
              </div>
              <div className="bg-[var(--surface-overlay)] rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[#eab308]">L{latest.maturityLevel}</div>
                <div className="text-[10px] text-[var(--text-secondary)]">Maturity</div>
              </div>
              <div className="bg-[var(--surface-overlay)] rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-[#ef4444]">{latest.totalViolations}</div>
                <div className="text-[10px] text-[var(--text-secondary)]">Violations</div>
              </div>
            </div>
          )}

          {/* SVG Chart */}
          <div className="bg-[var(--surface-overlay)] rounded-lg p-3 overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
              {/* Grid lines */}
              {yLabels.map((v) => {
                const y = PAD.top + plotH - (v / 100) * plotH;
                return (
                  <g key={v}>
                    <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#334155" strokeWidth={0.5} />
                    <text x={PAD.left - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize={9}>{v}</text>
                  </g>
                );
              })}

              {/* X-axis labels */}
              {xLabels.map((l, i) => (
                <text key={i} x={l.x} y={H - 6} textAnchor="middle" fill="#64748b" fontSize={8}>{l.label}</text>
              ))}

              {/* Coverage line (purple, solid) */}
              {coverageLine && (
                <polyline
                  points={coverageLine}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Policy compliance line (green, solid) */}
              {policyLine && (
                <polyline
                  points={policyLine}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Projected line (purple, dashed) */}
              {projectedLine && (
                <polyline
                  points={projectedLine}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth={1.5}
                  strokeDasharray="6,3"
                  strokeLinejoin="round"
                  opacity={0.5}
                />
              )}

              {/* Data points for coverage */}
              {actual.map((d, i) => {
                const xStep = actual.length > 1 ? plotW / (actual.length - 1) : plotW / 2;
                const x = PAD.left + (actual.length > 1 ? i * xStep : plotW / 2);
                const y = PAD.top + plotH - (d.standardCoverageScore / 100) * plotH;
                return <circle key={`c-${i}`} cx={x} cy={y} r={3} fill="#7c3aed" />;
              })}

              {/* Data points for policy */}
              {actual.map((d, i) => {
                const xStep = actual.length > 1 ? plotW / (actual.length - 1) : plotW / 2;
                const x = PAD.left + (actual.length > 1 ? i * xStep : plotW / 2);
                const y = PAD.top + plotH - (d.policyComplianceScore / 100) * plotH;
                return <circle key={`p-${i}`} cx={x} cy={y} r={3} fill="#22c55e" />;
              })}
            </svg>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-[#7c3aed] rounded" />
                <span className="text-[10px] text-[var(--text-secondary)]">Coverage</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-[#22c55e] rounded" />
                <span className="text-[10px] text-[var(--text-secondary)]">Policy</span>
              </div>
              {projectedLine && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#7c3aed]/50 rounded" style={{ borderTop: '1px dashed #7c3aed' }} />
                  <span className="text-[10px] text-[var(--text-secondary)]">Projected</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
