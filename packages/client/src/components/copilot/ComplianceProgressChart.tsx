import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, TrendingUp, Loader2, ArrowRight,
  Grid3X3, FileCheck, ClipboardCheck, AlertTriangle, Target, Zap,
} from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';

interface ComplianceProgressChartProps {
  projectId: string;
  standardId?: string;
}

export default function ComplianceProgressChart({ projectId, standardId }: ComplianceProgressChartProps) {
  const navigate = useNavigate();
  const {
    snapshots, isLoadingSnapshots, loadSnapshots, captureSnapshot,
    portfolioOverview, pipelineStates, auditChecklists,
    loadPortfolio, loadPipelineStatus, loadAuditChecklists,
  } = useComplianceStore();
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    loadSnapshots(projectId, standardId);
    loadPortfolio(projectId);
    loadPipelineStatus(projectId);
    loadAuditChecklists(projectId);
  }, [projectId, standardId, loadSnapshots, loadPortfolio, loadPipelineStatus, loadAuditChecklists]);

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

  // Compute next-step actions based on current data
  const nextSteps = useMemo(() => {
    if (!latest) return [];
    const steps: Array<{
      icon: typeof Grid3X3;
      color: string;
      title: string;
      description: string;
      link: string;
      priority: 'high' | 'medium' | 'low';
    }> = [];

    // Aggregate unmapped/gap sections from portfolio
    const portfolio = portfolioOverview?.portfolio ?? [];
    const totalUnmapped = portfolio.reduce((sum, p) => sum + p.mappingStats.unmapped, 0);
    const totalGap = portfolio.reduce((sum, p) => sum + p.mappingStats.gap, 0);

    // Coverage low → map more sections
    if (latest.standardCoverageScore < 80) {
      const needed = totalUnmapped + totalGap;
      steps.push({
        icon: Grid3X3,
        color: '#7c3aed',
        title: `Coverage at ${latest.standardCoverageScore}%`,
        description: needed > 0
          ? `${needed} section${needed !== 1 ? 's' : ''} unmapped or gap — map them as compliant/partial to increase coverage`
          : 'Review mappings and upgrade gap sections to partial or compliant',
        link: `/project/${projectId}/compliance/matrix`,
        priority: latest.standardCoverageScore < 50 ? 'high' : 'medium',
      });
    }

    // High violations → fix policies
    if (latest.totalViolations > 0) {
      steps.push({
        icon: AlertTriangle,
        color: '#ef4444',
        title: `${latest.totalViolations} violation${latest.totalViolations !== 1 ? 's' : ''} detected`,
        description: 'Review and resolve policy violations to improve policy compliance score',
        link: `/project/${projectId}/compliance/policy-mgr`,
        priority: latest.totalViolations > 50 ? 'high' : 'medium',
      });
    }

    // Maturity < L4 → show what's needed
    if (latest.maturityLevel < 4) {
      const nextLevel = latest.maturityLevel + 1;
      const thresholds: Record<number, number> = { 2: 20, 3: 40, 4: 60, 5: 80 };
      const neededCoverage = thresholds[nextLevel] ?? 80;
      steps.push({
        icon: Target,
        color: '#eab308',
        title: `Maturity L${latest.maturityLevel} → L${nextLevel}`,
        description: `Reach ${neededCoverage}% coverage to advance maturity level`,
        link: `/project/${projectId}/compliance/matrix`,
        priority: 'medium',
      });
    }

    // No policies yet → generate
    if (latest.policyComplianceScore === 0 || (pipelineStates.length > 0 && pipelineStates.every(s => s.policyStats.approved === 0))) {
      steps.push({
        icon: FileCheck,
        color: '#22c55e',
        title: 'No approved policies',
        description: 'Generate and approve policies to advance the pipeline',
        link: `/project/${projectId}/compliance/policies`,
        priority: 'high',
      });
    }

    // No audit checklist → create one (if tracking stage reached)
    const maxStage = pipelineStates.reduce((max, s) => {
      const RANK: Record<string, number> = { uploaded: 0, mapped: 1, policies_generated: 2, roadmap_ready: 3, tracking: 4, audit_ready: 5 };
      return Math.max(max, RANK[s.stage] ?? 0);
    }, 0);
    if (maxStage >= 4 && auditChecklists.length === 0) {
      steps.push({
        icon: ClipboardCheck,
        color: '#3b82f6',
        title: 'Ready for audit',
        description: 'Create an audit checklist to advance to Audit Ready stage',
        link: `/project/${projectId}/compliance/audit`,
        priority: 'high',
      });
    }

    // All good!
    if (steps.length === 0 && latest.standardCoverageScore >= 80 && latest.totalViolations === 0) {
      steps.push({
        icon: Zap,
        color: '#22c55e',
        title: 'Excellent compliance posture',
        description: 'Coverage is high and no violations detected. Keep capturing snapshots to track trends.',
        link: '',
        priority: 'low',
      });
    }

    // Sort by priority
    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
    return steps.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [latest, portfolioOverview, pipelineStates, auditChecklists, projectId]);

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
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-[var(--surface-overlay)] rounded-lg p-3 text-center">
                <div className="text-sm font-bold text-[#7c3aed]">{latest.standardCoverageScore}%</div>
                <div className="text-xs text-[var(--text-secondary)]">Coverage</div>
              </div>
              <div className="bg-[var(--surface-overlay)] rounded-lg p-3 text-center">
                <div className="text-sm font-bold text-[#22c55e]">{latest.policyComplianceScore}%</div>
                <div className="text-xs text-[var(--text-secondary)]">Policy</div>
              </div>
              <div className="bg-[var(--surface-overlay)] rounded-lg p-3 text-center">
                <div className="text-sm font-bold text-[#eab308]">L{latest.maturityLevel}</div>
                <div className="text-xs text-[var(--text-secondary)]">Maturity</div>
              </div>
              <div className="bg-[var(--surface-overlay)] rounded-lg p-3 text-center">
                <div className="text-sm font-bold text-[#ef4444]">{latest.totalViolations}</div>
                <div className="text-xs text-[var(--text-secondary)]">Violations</div>
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
                <span className="text-xs text-[var(--text-secondary)]">Coverage</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-[#22c55e] rounded" />
                <span className="text-xs text-[var(--text-secondary)]">Policy</span>
              </div>
              {projectedLine && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#7c3aed]/50 rounded" style={{ borderTop: '1px dashed #7c3aed' }} />
                  <span className="text-xs text-[var(--text-secondary)]">Projected</span>
                </div>
              )}
            </div>
          </div>

          {/* Next Steps — Actionable CTAs */}
          {nextSteps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Recommended Next Steps
              </h4>
              {nextSteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-[var(--surface-overlay)] rounded-lg p-3 border border-[var(--border-subtle)] group hover:border-[color:var(--step-color)] transition-colors"
                    style={{ '--step-color': step.color } as React.CSSProperties}
                  >
                    <div
                      className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg"
                      style={{ backgroundColor: `${step.color}20` }}
                    >
                      <Icon size={16} style={{ color: step.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#e2e8f0]">{step.title}</span>
                        {step.priority === 'high' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                            Priority
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{step.description}</p>
                    </div>
                    {step.link && (
                      <button
                        onClick={() => navigate(step.link)}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors"
                        style={{ backgroundColor: `${step.color}15`, color: step.color }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${step.color}30`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${step.color}15`; }}
                      >
                        Go
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
