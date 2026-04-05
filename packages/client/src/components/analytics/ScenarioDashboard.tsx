import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GitCompare, Plus, Trash2, ArrowRight, BarChart3, Trophy,
  ChevronDown, ChevronRight, ArrowUpDown, TrendingUp, TrendingDown, Minus,
  Sparkles, Shield, Target,
} from 'lucide-react';
import { useScenarioStore } from '../../stores/scenarioStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import type { TransformationScenario, ScenarioDelta, McdaWeights } from '@thearchitect/shared';

const COST_DIMENSION_LABELS: Record<string, string> = {
  process: 'Process',
  dataMigration: 'Data Migration',
  trainingChange: 'Training & Change',
  applicationTransformation: 'Application',
  infrastructure: 'Infrastructure',
  opportunityCost: 'Opportunity Cost',
  riskAdjustedFinancial: 'Risk-Adjusted',
};

const formatK = (n: number) => {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
};

const DeltaArrow = ({ value }: { value: number }) => {
  if (value > 0) return <TrendingUp size={10} className="text-[#ef4444]" />;
  if (value < 0) return <TrendingDown size={10} className="text-[#22c55e]" />;
  return <Minus size={10} className="text-[var(--text-disabled)]" />;
};

type Tab = 'scenarios' | 'compare' | 'rank' | 'compliance';

export default function ScenarioDashboard() {
  const projectId = useArchitectureStore((s) => s.projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const {
    scenarios, comparisonResult, mcdaResult, topsisResult, complianceResult,
    realOptionsResult, loading, generatingVariants,
    fetchScenarios, createScenario, deleteScenario, compare, rank, rankTopsis,
    fetchCompliance, generateAIVariants, analyzeRealOptions,
    setActiveScenario, clearComparison,
  } = useScenarioStore();

  const [tab, setTab] = useState<Tab>('scenarios');
  const [newName, setNewName] = useState('');
  const [compareA, setCompareA] = useState<string>('baseline');
  const [compareB, setCompareB] = useState<string>('');
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
  const [rankMethod, setRankMethod] = useState<'wsm' | 'topsis'>('wsm');
  const [compFramework, setCompFramework] = useState<'dora' | 'nis2' | 'kritis'>('dora');
  const [compScenarioId, setCompScenarioId] = useState<string>('baseline');
  const [weights, setWeights] = useState<McdaWeights>({
    cost: 0.25, risk: 0.25, agility: 0.20, compliance: 0.15, time: 0.15,
  });

  useEffect(() => {
    if (projectId) fetchScenarios(projectId);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = useCallback(() => {
    if (!projectId || !newName.trim()) return;
    // Create scenario from current state with empty deltas
    createScenario(projectId, newName.trim());
    setNewName('');
  }, [projectId, newName, createScenario]);

  const handleCompare = useCallback(() => {
    if (!projectId || !compareA || !compareB) return;
    compare(projectId, compareA, compareB);
  }, [projectId, compareA, compareB, compare]);

  const handleRank = useCallback(() => {
    if (!projectId || scenarios.length < 2) return;
    const ids = scenarios.map((s) => s.id || (s as any)._id);
    const w = weights as unknown as Record<string, number>;
    if (rankMethod === 'topsis') {
      rankTopsis(projectId, ids, w);
    } else {
      rank(projectId, ids, w);
    }
  }, [projectId, scenarios, weights, rank, rankTopsis, rankMethod]);

  const handleGenerateVariants = useCallback(() => {
    if (!projectId) return;
    const sourceId = expandedScenario || 'baseline';
    generateAIVariants(projectId, sourceId, 3);
  }, [projectId, expandedScenario, generateAIVariants]);

  const handleCompliance = useCallback(() => {
    if (!projectId) return;
    fetchCompliance(projectId, compScenarioId, compFramework);
  }, [projectId, compScenarioId, compFramework, fetchCompliance]);

  const handleRealOptions = useCallback((scenarioId: string) => {
    if (!projectId) return;
    analyzeRealOptions(projectId, scenarioId);
  }, [projectId, analyzeRealOptions]);

  const allOptions = useMemo(() => {
    const opts = [{ id: 'baseline', name: 'Baseline (Current)' }];
    for (const s of scenarios) {
      opts.push({ id: s.id || (s as any)._id, name: s.name });
    }
    return opts;
  }, [scenarios]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <GitCompare size={14} className="text-[#06b6d4]" />
          Scenario Dashboard
        </h3>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
          {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''} &middot; Delta comparison
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-[var(--border-subtle)] flex-wrap">
        {(['scenarios', 'compare', 'rank', 'compliance'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition ${
              tab === t ? 'bg-[#06b6d4]/20 text-[#06b6d4]' : 'text-[var(--text-disabled)] hover:text-white'
            }`}>
            {t === 'scenarios' ? 'Scenarios' : t === 'compare' ? 'Compare' : t === 'rank' ? 'MCDA' : 'Compliance'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'scenarios' && (
          <div className="p-3 space-y-3">
            {/* Create new scenario */}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Scenario name..."
                className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-xs text-white outline-none focus:border-[#06b6d4] placeholder:text-[var(--text-disabled)]"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || loading}
                className="rounded-md bg-[#06b6d4] px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-[#0891b2] disabled:opacity-30 transition flex items-center gap-1"
              >
                <Plus size={10} />
              </button>
            </div>

            {/* AI Variant Generation */}
            <button
              onClick={handleGenerateVariants}
              disabled={generatingVariants || loading}
              className="w-full rounded-md border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-1.5 text-[10px] font-medium text-[#a855f7] hover:bg-[#a855f7]/20 disabled:opacity-30 transition flex items-center justify-center gap-1"
            >
              <Sparkles size={10} />
              {generatingVariants ? 'Generating AI Variants...' : 'Generate AI Variants'}
            </button>

            {/* Scenario list */}
            {scenarios.length === 0 ? (
              <div className="text-center py-6">
                <GitCompare size={20} className="mx-auto text-[var(--text-disabled)] mb-2" />
                <p className="text-[10px] text-[var(--text-tertiary)]">No scenarios yet</p>
                <p className="text-[9px] text-[var(--text-disabled)]">
                  Create a scenario to start comparing transformation options
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {scenarios.map((sc) => {
                  const id = sc.id || (sc as any)._id;
                  const isExpanded = expandedScenario === id;
                  return (
                    <div key={id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
                      <button
                        onClick={() => setExpandedScenario(isExpanded ? null : id)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-[var(--surface-raised)] transition"
                      >
                        {isExpanded ? <ChevronDown size={10} className="text-[var(--text-disabled)]" /> :
                          <ChevronRight size={10} className="text-[var(--text-disabled)]" />}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="text-[10px] text-white truncate">{sc.name}</div>
                          <div className="text-[9px] text-[var(--text-disabled)]">
                            {sc.deltas?.length || 0} deltas
                            {sc.costProfile && ` · ${formatK(sc.costProfile.totalCost)} EUR`}
                          </div>
                        </div>
                        {sc.costProfile && sc.costProfile.deltaPercent !== 0 && (
                          <span className={`text-[9px] font-mono ${
                            sc.costProfile.deltaPercent > 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'
                          }`}>
                            {sc.costProfile.deltaPercent > 0 ? '+' : ''}{sc.costProfile.deltaPercent}%
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (projectId) deleteScenario(projectId, id);
                          }}
                          className="text-[var(--text-disabled)] hover:text-[#ef4444] transition shrink-0"
                        >
                          <Trash2 size={10} />
                        </button>
                      </button>

                      {isExpanded && (
                        <div className="px-2.5 pb-2.5 space-y-2 border-t border-[var(--border-subtle)]">
                          {sc.description && (
                            <p className="text-[9px] text-[var(--text-tertiary)] pt-1.5">{sc.description}</p>
                          )}

                          {/* Cost profile summary */}
                          {sc.costProfile && (
                            <div className="grid grid-cols-3 gap-1 pt-1">
                              <div className="rounded border border-[var(--border-subtle)] p-1.5 text-center">
                                <div className="text-[8px] text-[var(--text-disabled)] font-mono">P10</div>
                                <div className="text-[10px] font-bold text-white">{formatK(sc.costProfile.p10)}</div>
                              </div>
                              <div className="rounded border border-[var(--border-subtle)] p-1.5 text-center">
                                <div className="text-[8px] text-[var(--text-disabled)] font-mono">P50</div>
                                <div className="text-[10px] font-bold text-white">{formatK(sc.costProfile.p50)}</div>
                              </div>
                              <div className="rounded border border-[var(--border-subtle)] p-1.5 text-center">
                                <div className="text-[8px] text-[var(--text-disabled)] font-mono">P90</div>
                                <div className="text-[10px] font-bold text-white">{formatK(sc.costProfile.p90)}</div>
                              </div>
                            </div>
                          )}

                          {/* Dimension breakdown */}
                          {sc.costProfile?.dimensions && Object.keys(sc.costProfile.dimensions).length > 0 && (
                            <div className="space-y-0.5 pt-1">
                              <p className="text-[9px] text-[var(--text-disabled)] font-semibold uppercase">Dimensions</p>
                              {Object.entries(sc.costProfile.dimensions)
                                .filter(([, v]) => (v as number) > 0)
                                .sort(([, a], [, b]) => (b as number) - (a as number))
                                .slice(0, 5)
                                .map(([key, val]) => (
                                  <div key={key} className="flex items-center justify-between text-[9px]">
                                    <span className="text-[var(--text-tertiary)]">{COST_DIMENSION_LABELS?.[key] || key}</span>
                                    <span className="text-white font-mono">{formatK(val as number)}</span>
                                  </div>
                                ))}
                            </div>
                          )}

                          {/* Delta list */}
                          {sc.deltas && sc.deltas.length > 0 && (
                            <div className="space-y-0.5 pt-1">
                              <p className="text-[9px] text-[var(--text-disabled)] font-semibold uppercase">Changes</p>
                              {sc.deltas.slice(0, 5).map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-[9px]">
                                  <span className="text-[var(--text-tertiary)] truncate flex-1">
                                    {d.elementId.slice(0, 8)}… .{d.field}
                                  </span>
                                  <span className="text-[var(--text-disabled)]">{String(d.baselineValue)}</span>
                                  <ArrowRight size={8} className="text-[var(--text-disabled)]" />
                                  <span className="text-white">{String(d.scenarioValue)}</span>
                                </div>
                              ))}
                              {sc.deltas.length > 5 && (
                                <p className="text-[8px] text-[var(--text-disabled)]">+{sc.deltas.length - 5} more</p>
                              )}
                            </div>
                          )}

                          {sc.mcdaScore != null && (
                            <div className="flex items-center gap-1 pt-1">
                              <Trophy size={9} className="text-[#f59e0b]" />
                              <span className="text-[9px] text-[var(--text-tertiary)]">MCDA Score:</span>
                              <span className="text-[10px] text-white font-mono font-bold">{(sc.mcdaScore * 100).toFixed(1)}%</span>
                            </div>
                          )}

                          {/* Real Options Analysis */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRealOptions(id); }}
                            disabled={loading}
                            className="w-full mt-1 rounded border border-[#f59e0b]/30 px-2 py-1 text-[9px] text-[#f59e0b] hover:bg-[#f59e0b]/10 transition flex items-center justify-center gap-1"
                          >
                            <Target size={9} />
                            Real Options (Black-Scholes)
                          </button>

                          {realOptionsResult && realOptionsResult.scenarioId === id && (
                            <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2 mt-1 space-y-1">
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-[var(--text-tertiary)]">Option Value</span>
                                <span className="text-white font-mono">{formatK(realOptionsResult.callValue)} EUR</span>
                              </div>
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-[var(--text-tertiary)]">Defer Value</span>
                                <span className="text-white font-mono">{formatK(realOptionsResult.deferValue)} EUR</span>
                              </div>
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-[var(--text-tertiary)]">Recommendation</span>
                                <span className={`font-mono font-bold ${
                                  realOptionsResult.recommendation === 'proceed' ? 'text-[#22c55e]' :
                                  realOptionsResult.recommendation === 'defer' ? 'text-[#f59e0b]' :
                                  'text-[#ef4444]'
                                }`}>
                                  {realOptionsResult.recommendation.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'compare' && (
          <div className="p-3 space-y-3">
            {/* Scenario selectors */}
            <div className="space-y-2">
              <div>
                <label className="text-[9px] text-[var(--text-disabled)] uppercase font-semibold">Scenario A</label>
                <select
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                  className="mt-0.5 w-full bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-[#06b6d4]"
                >
                  {allOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="flex justify-center">
                <ArrowUpDown size={14} className="text-[var(--text-disabled)]" />
              </div>
              <div>
                <label className="text-[9px] text-[var(--text-disabled)] uppercase font-semibold">Scenario B</label>
                <select
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                  className="mt-0.5 w-full bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-[#06b6d4]"
                >
                  <option value="">— select —</option>
                  {allOptions.filter((o) => o.id !== compareA).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCompare}
                disabled={!compareB || loading}
                className="w-full rounded-md bg-[#06b6d4] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#0891b2] disabled:opacity-30 transition"
              >
                {loading ? 'Comparing...' : 'Compare'}
              </button>
            </div>

            {/* Comparison results */}
            {comparisonResult && (
              <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                {/* Cost delta header */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-white font-semibold">Cost Delta</span>
                    <div className="flex items-center gap-1">
                      <DeltaArrow value={comparisonResult.costDelta} />
                      <span className={`text-xs font-bold font-mono ${
                        comparisonResult.costDelta > 0 ? 'text-[#ef4444]' : comparisonResult.costDelta < 0 ? 'text-[#22c55e]' : 'text-white'
                      }`}>
                        {comparisonResult.costDelta > 0 ? '+' : ''}{formatK(comparisonResult.costDelta)} EUR
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-[var(--text-tertiary)]">{comparisonResult.scenarioA.name}</span>
                    <span className="text-white font-mono">{formatK(comparisonResult.scenarioA.totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-[var(--text-tertiary)]">{comparisonResult.scenarioB.name}</span>
                    <span className="text-white font-mono">{formatK(comparisonResult.scenarioB.totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] pt-1 border-t border-[var(--border-subtle)] mt-1">
                    <span className="text-[var(--text-tertiary)]">Change</span>
                    <span className={`font-mono ${
                      comparisonResult.costDeltaPercent > 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'
                    }`}>
                      {comparisonResult.costDeltaPercent > 0 ? '+' : ''}{comparisonResult.costDeltaPercent}%
                    </span>
                  </div>
                </div>

                {/* Element changes */}
                <div className="grid grid-cols-3 gap-1">
                  <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1.5 text-center">
                    <div className="text-xs font-bold text-[#22c55e]">{comparisonResult.elementChanges.added}</div>
                    <div className="text-[8px] text-[var(--text-disabled)]">Added</div>
                  </div>
                  <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1.5 text-center">
                    <div className="text-xs font-bold text-[#eab308]">{comparisonResult.elementChanges.modified}</div>
                    <div className="text-[8px] text-[var(--text-disabled)]">Modified</div>
                  </div>
                  <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1.5 text-center">
                    <div className="text-xs font-bold text-[#ef4444]">{comparisonResult.elementChanges.removed}</div>
                    <div className="text-[8px] text-[var(--text-disabled)]">Removed</div>
                  </div>
                </div>

                {/* Dimension waterfall */}
                {Object.keys(comparisonResult.dimensionDeltas).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-[var(--text-disabled)] font-semibold uppercase">Dimension Deltas</p>
                    {Object.entries(comparisonResult.dimensionDeltas)
                      .filter(([, v]) => v !== 0)
                      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
                      .map(([key, val]) => {
                        const maxDelta = Math.max(
                          ...Object.values(comparisonResult.dimensionDeltas).map(Math.abs),
                          1,
                        );
                        const pct = Math.abs(val) / maxDelta * 100;
                        return (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="text-[9px] text-[var(--text-tertiary)] w-16 truncate">
                              {COST_DIMENSION_LABELS?.[key] || key}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-[var(--surface-base)] relative">
                              <div
                                className={`h-full rounded-full ${val > 0 ? 'bg-[#ef4444]' : 'bg-[#22c55e]'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-[8px] font-mono w-12 text-right ${
                              val > 0 ? 'text-[#ef4444]' : 'text-[#22c55e]'
                            }`}>
                              {val > 0 ? '+' : ''}{formatK(val)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'rank' && (
          <div className="p-3 space-y-3">
            {scenarios.length < 2 ? (
              <div className="text-center py-6">
                <Trophy size={20} className="mx-auto text-[var(--text-disabled)] mb-2" />
                <p className="text-[10px] text-[var(--text-tertiary)]">Need 2+ scenarios to rank</p>
              </div>
            ) : (
              <>
                {/* Method toggle */}
                <div className="flex gap-1">
                  <button onClick={() => setRankMethod('wsm')}
                    className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition ${
                      rankMethod === 'wsm' ? 'bg-[#06b6d4]/20 text-[#06b6d4]' : 'text-[var(--text-disabled)] hover:text-white'
                    }`}>WSM</button>
                  <button onClick={() => setRankMethod('topsis')}
                    className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition ${
                      rankMethod === 'topsis' ? 'bg-[#a855f7]/20 text-[#a855f7]' : 'text-[var(--text-disabled)] hover:text-white'
                    }`}>TOPSIS</button>
                </div>

                {/* Weight sliders */}
                <div className="space-y-1.5">
                  <p className="text-[9px] text-[var(--text-disabled)] font-semibold uppercase">
                    Weights ({rankMethod.toUpperCase()})
                  </p>
                  {(Object.entries(weights) as [keyof McdaWeights, number][]).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-[9px] text-[var(--text-tertiary)] w-16 capitalize">{key}</span>
                      <input
                        type="range" min="0" max="100" step="5"
                        value={Math.round(val * 100)}
                        onChange={(e) => setWeights((w) => ({ ...w, [key]: parseInt(e.target.value) / 100 }))}
                        className="flex-1 h-1 accent-[#06b6d4]"
                      />
                      <span className="text-[9px] text-white font-mono w-8 text-right">{Math.round(val * 100)}%</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleRank}
                  disabled={loading}
                  className="w-full rounded-md bg-[#06b6d4] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#0891b2] disabled:opacity-30 transition flex items-center justify-center gap-1"
                >
                  <Trophy size={10} />
                  {loading ? 'Ranking...' : 'Rank Scenarios'}
                </button>

                {/* MCDA / TOPSIS Results */}
                {(mcdaResult || topsisResult) && (
                  <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                    <p className="text-[9px] text-[var(--text-disabled)] font-semibold uppercase">
                      Ranking ({(topsisResult || mcdaResult)!.method.toUpperCase()})
                    </p>
                    {(topsisResult || mcdaResult)!.scores.map((s) => (
                      <div key={s.scenarioId} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${
                            s.rank === 1 ? 'bg-[#f59e0b]/20 text-[#f59e0b]' :
                            s.rank === 2 ? 'bg-[#94a3b8]/20 text-[#94a3b8]' :
                            'bg-[var(--surface-raised)] text-[var(--text-disabled)]'
                          }`}>
                            {s.rank}
                          </span>
                          <span className="text-[10px] text-white font-medium flex-1 truncate">{s.scenarioName}</span>
                          <span className="text-[10px] text-[#06b6d4] font-mono font-bold">
                            {(s.weightedScore * 100).toFixed(1)}
                          </span>
                        </div>

                        {/* Criteria bars */}
                        <div className="space-y-0.5">
                          {(['cost', 'risk', 'agility', 'compliance', 'time'] as const).map((c) => (
                            <div key={c} className="flex items-center gap-1">
                              <span className="text-[8px] text-[var(--text-disabled)] w-14 capitalize">{c}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-raised)]">
                                <div
                                  className="h-full rounded-full bg-[#06b6d4]"
                                  style={{ width: `${s[c] * 100}%` }}
                                />
                              </div>
                              <span className="text-[8px] text-[var(--text-disabled)] font-mono w-6 text-right">
                                {Math.round(s[c] * 100)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tab === 'compliance' && (
          <div className="p-3 space-y-3">
            {/* Framework selector */}
            <div className="space-y-2">
              <div>
                <label className="text-[9px] text-[var(--text-disabled)] uppercase font-semibold">Framework</label>
                <div className="flex gap-1 mt-1">
                  {(['dora', 'nis2', 'kritis'] as const).map((fw) => (
                    <button key={fw} onClick={() => setCompFramework(fw)}
                      className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition uppercase ${
                        compFramework === fw ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[var(--text-disabled)] hover:text-white'
                      }`}>{fw}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[9px] text-[var(--text-disabled)] uppercase font-semibold">Scenario</label>
                <select
                  value={compScenarioId}
                  onChange={(e) => setCompScenarioId(e.target.value)}
                  className="mt-0.5 w-full bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-[#22c55e]"
                >
                  {allOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>

              <button
                onClick={handleCompliance}
                disabled={loading}
                className="w-full rounded-md bg-[#22c55e] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#16a34a] disabled:opacity-30 transition flex items-center justify-center gap-1"
              >
                <Shield size={10} />
                {loading ? 'Analyzing...' : 'Analyze Compliance'}
              </button>
            </div>

            {/* Compliance Results */}
            {complianceResult && (
              <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                {/* Score card */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-white font-semibold uppercase">{complianceResult.framework}</span>
                    <span className={`text-sm font-bold font-mono ${
                      complianceResult.score >= 0.8 ? 'text-[#22c55e]' :
                      complianceResult.score >= 0.5 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                    }`}>
                      {Math.round(complianceResult.score * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="text-[9px]">
                      <span className="text-[var(--text-disabled)]">Gaps</span>
                      <div className="text-white font-mono">{complianceResult.gapCount}</div>
                    </div>
                    <div className="text-[9px]">
                      <span className="text-[var(--text-disabled)]">Est. Penalty</span>
                      <div className="text-[#ef4444] font-mono">{formatK(complianceResult.estimatedPenalty)} EUR</div>
                    </div>
                    <div className="text-[9px] col-span-2">
                      <span className="text-[var(--text-disabled)]">Remediation Cost</span>
                      <div className="text-[#f59e0b] font-mono">{formatK(complianceResult.estimatedRemediationCost)} EUR</div>
                    </div>
                  </div>
                </div>

                {/* Area details */}
                <div className="space-y-1">
                  <p className="text-[9px] text-[var(--text-disabled)] font-semibold uppercase">Compliance Areas</p>
                  {complianceResult.details.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${
                        d.status === 'compliant' ? 'bg-[#22c55e]' :
                        d.status === 'partial' ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'
                      }`} />
                      <span className="text-[9px] text-[var(--text-secondary)] flex-1 truncate">{d.area}</span>
                      {d.penalty > 0 && (
                        <span className="text-[8px] text-[#ef4444] font-mono">{formatK(d.penalty)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
