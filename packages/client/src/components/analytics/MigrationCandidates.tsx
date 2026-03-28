import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Check, X, Zap, RotateCcw } from 'lucide-react';
import { useRoadmapStore } from '../../stores/roadmapStore';
import type { MigrationCandidate, ElementStatus, GapCategory, ConfidenceLevel } from '@thearchitect/shared';

const STATUS_COLOR: Record<string, string> = {
  current: '#3b82f6',
  target: '#22c55e',
  transitional: '#f59e0b',
  retired: '#ef4444',
};

const RISK_COLOR: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const GAP_LABELS: Record<GapCategory, { label: string; color: string }> = {
  new: { label: 'New', color: '#3b82f6' },
  upgrade: { label: 'Upgrade', color: '#22c55e' },
  modernize: { label: 'Modernize', color: '#f59e0b' },
  retire: { label: 'Retire', color: '#ef4444' },
  retain: { label: 'Retain', color: '#4a5a4a' },
};

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; color: string; icon: string }> = {
  measured: { label: 'Real Data', color: '#22c55e', icon: '●' },
  estimated: { label: 'Estimated', color: '#f59e0b', icon: '◐' },
  heuristic: { label: 'Heuristic', color: '#ef4444', icon: '○' },
};

const TARGET_OPTIONS: ElementStatus[] = ['current', 'target', 'transitional', 'retired'];

export default function MigrationCandidates() {
  const {
    candidates, selectedCandidates, isCandidatesLoading,
    toggleCandidate, setCandidateTarget, selectAllCandidates,
    clearCandidates, selectByRisk, resetToAutoDetect,
    dataConfidence,
  } = useRoadmapStore();

  const [expanded, setExpanded] = useState(false);
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());

  // Group by togafDomain
  const grouped = useMemo(() => {
    const map = new Map<string, MigrationCandidate[]>();
    for (const c of candidates) {
      const domain = (c.togafDomain || 'other').toUpperCase();
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain)!.push(c);
    }
    // Sort domains, sort candidates by connectionCount desc within each
    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, items]) => [domain, items.sort((a, b) => b.connectionCount - a.connectionCount)] as const);
    return sorted;
  }, [candidates]);

  // Summary stats
  const summary = useMemo(() => {
    let newCount = 0, upgrade = 0, modernize = 0, retire = 0;
    for (const c of candidates) {
      if (!selectedCandidates.has(c.elementId)) continue;
      if (c.gapCategory === 'new') newCount++;
      else if (c.gapCategory === 'upgrade') upgrade++;
      else if (c.gapCategory === 'modernize') modernize++;
      else if (c.gapCategory === 'retire') retire++;
    }
    return { total: selectedCandidates.size, new: newCount, upgrade, modernize, retire };
  }, [candidates, selectedCandidates]);

  const toggleDomain = (domain: string) => {
    setCollapsedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  if (isCandidatesLoading) {
    return (
      <div className="text-xs text-[var(--text-tertiary)] py-2 text-center">
        Loading candidates...
      </div>
    );
  }

  if (candidates.length === 0) return null;

  const autoCount = candidates.filter((c) => c.autoSelected).length;

  return (
    <div className="space-y-2">
      {/* Collapsible Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left group"
      >
        <div className="flex items-center gap-1.5">
          {expanded ? <ChevronDown size={14} className="text-[#00ff41]" /> : <ChevronRight size={14} className="text-[var(--text-tertiary)]" />}
          <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">Migration Scope</span>
        </div>
        <span className="text-xs font-mono" style={{ color: selectedCandidates.size > 0 ? '#00ff41' : '#4a5a4a' }}>
          {selectedCandidates.size}/{candidates.length}
        </span>
      </button>

      {!expanded && (
        <p className="text-xs text-[var(--text-tertiary)] pl-5">
          {autoCount} auto-detected — click to customize
        </p>
      )}

      {expanded && (
        <div className="border border-[var(--border-subtle)] rounded bg-[#0a0f0a]">
          {/* Quick Actions */}
          <div className="flex items-center gap-1.5 p-2 border-b border-[var(--border-subtle)]">
            <button
              onClick={selectAllCandidates}
              className="px-2 py-1 text-xs rounded bg-[#1a2a1a] text-[var(--text-secondary)] hover:text-[#00ff41] transition"
            >
              All
            </button>
            <button
              onClick={clearCandidates}
              className="px-2 py-1 text-xs rounded bg-[#1a2a1a] text-[var(--text-secondary)] hover:text-[#ef4444] transition"
            >
              None
            </button>
            <button
              onClick={() => selectByRisk('high')}
              className="px-2 py-1 text-xs rounded bg-[#1a2a1a] text-[var(--text-secondary)] hover:text-[#f97316] transition flex items-center gap-1"
            >
              <Zap size={10} /> Risk
            </button>
            <button
              onClick={resetToAutoDetect}
              className="px-2 py-1 text-xs rounded bg-[#1a2a1a] text-[var(--text-secondary)] hover:text-[#3b82f6] transition flex items-center gap-1"
            >
              <RotateCcw size={10} /> Auto
            </button>
          </div>

          {/* Candidate List */}
          <div className="max-h-[320px] overflow-y-auto">
            {grouped.map(([domain, items]) => {
              const isCollapsed = collapsedDomains.has(domain);
              const selectedInDomain = items.filter((c) => selectedCandidates.has(c.elementId)).length;
              return (
                <div key={domain}>
                  {/* Domain Header */}
                  <button
                    onClick={() => toggleDomain(domain)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#111611] border-b border-[var(--border-subtle)] hover:bg-[#1a2a1a] transition"
                  >
                    <div className="flex items-center gap-1.5">
                      {isCollapsed
                        ? <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
                        : <ChevronDown size={12} className="text-[#00ff41]" />
                      }
                      <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">{domain}</span>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)]">{selectedInDomain}/{items.length}</span>
                  </button>

                  {/* Elements */}
                  {!isCollapsed && items.map((c) => {
                    const isSelected = selectedCandidates.has(c.elementId);
                    const targetStatus = selectedCandidates.get(c.elementId) || c.suggestedTarget;
                    const gap = GAP_LABELS[c.gapCategory];

                    return (
                      <div
                        key={c.elementId}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[#0f170f] text-xs transition ${
                          isSelected ? 'bg-[#0a1a0a]' : 'bg-transparent opacity-50'
                        } hover:bg-[#111a11]`}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleCandidate(c.elementId, c.suggestedTarget)}
                          className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-[#00ff41] bg-[#00ff41]/20' : 'border-[#333] bg-transparent'
                          }`}
                        >
                          {isSelected && <Check size={10} className="text-[#00ff41]" />}
                        </button>

                        {/* Name (truncated) */}
                        <span className="min-w-0 truncate flex-1 text-[#ccc]" title={c.name}>
                          {c.name}
                        </span>

                        {/* Status transition */}
                        <span className="flex items-center gap-0.5 flex-shrink-0 text-xs">
                          <span style={{ color: STATUS_COLOR[c.currentStatus] }}>{c.currentStatus.slice(0, 4)}</span>
                          <span className="text-[#333]">→</span>
                          {isSelected ? (
                            <select
                              value={targetStatus}
                              onChange={(e) => setCandidateTarget(c.elementId, e.target.value as ElementStatus)}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-[#0a0f0a] border border-[var(--border-subtle)] rounded text-xs px-1 py-0"
                              style={{ color: STATUS_COLOR[targetStatus] }}
                            >
                              {TARGET_OPTIONS.map((opt) => (
                                <option key={opt} value={opt} style={{ color: STATUS_COLOR[opt] }}>{opt.slice(0, 4)}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ color: STATUS_COLOR[c.suggestedTarget] }}>{c.suggestedTarget.slice(0, 4)}</span>
                          )}
                        </span>

                        {/* Confidence indicator */}
                        <span
                          className="flex-shrink-0 text-xs font-mono"
                          style={{ color: CONFIDENCE_CONFIG[c.confidenceLevel]?.color || '#4a5a4a' }}
                          title={`${Math.round(c.confidenceScore * 100)}% confidence\n${(c.confidenceFactors || []).join(', ')}`}
                        >
                          {CONFIDENCE_CONFIG[c.confidenceLevel]?.icon || '○'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Summary Footer */}
          <div className="px-2.5 py-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] space-y-2">
            <div>
              <span className="text-[#00ff41] font-mono">{summary.total}</span> selected
              {summary.new > 0 && <span className="ml-1">· <span style={{ color: GAP_LABELS.new.color }}>{summary.new}× New</span></span>}
              {summary.upgrade > 0 && <span className="ml-1">· <span style={{ color: GAP_LABELS.upgrade.color }}>{summary.upgrade}× Upgrade</span></span>}
              {summary.modernize > 0 && <span className="ml-1">· <span style={{ color: GAP_LABELS.modernize.color }}>{summary.modernize}× Modernize</span></span>}
              {summary.retire > 0 && <span className="ml-1">· <span style={{ color: GAP_LABELS.retire.color }}>{summary.retire}× Retire</span></span>}
            </div>

            {/* Confidence Bar */}
            {dataConfidence && (
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs uppercase tracking-wider">Data Confidence</span>
                  <span className="font-mono" style={{
                    color: dataConfidence.overall >= 0.6 ? '#22c55e' : dataConfidence.overall >= 0.3 ? '#f59e0b' : '#ef4444',
                  }}>
                    {Math.round(dataConfidence.overall * 100)}%
                  </span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-[#1a1a1a]">
                  {dataConfidence.measuredCount > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(dataConfidence.measuredCount / candidates.length) * 100}%`,
                        backgroundColor: '#22c55e',
                      }}
                      title={`${dataConfidence.measuredCount} measured (real data)`}
                    />
                  )}
                  {dataConfidence.estimatedCount > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(dataConfidence.estimatedCount / candidates.length) * 100}%`,
                        backgroundColor: '#f59e0b',
                      }}
                      title={`${dataConfidence.estimatedCount} estimated (partial data)`}
                    />
                  )}
                  {dataConfidence.heuristicCount > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(dataConfidence.heuristicCount / candidates.length) * 100}%`,
                        backgroundColor: '#ef4444',
                      }}
                      title={`${dataConfidence.heuristicCount} heuristic (no data)`}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />Real</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />Est.</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />Heur.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
