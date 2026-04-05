import { useMemo, useState, useEffect, useCallback } from 'react';
import { Activity, BarChart3, AlertTriangle, ArrowUpDown, Layers } from 'lucide-react';
import { useXRayStore } from '../../stores/xrayStore';
import { useArchitectureStore } from '../../stores/architectureStore';

const formatK = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
};

interface MCResult {
  mean: number;
  stdDev: number;
  p10: number;
  p50: number;
  p90: number;
  var95: number;
  histogram: { bucket: number; count: number }[];
  elementContributions: { elementId: string; name: string; varianceContribution: number }[];
}

export default function ProbabilisticCost() {
  const elements = useArchitectureStore((s) => s.elements);
  const profiles = useXRayStore((s) => s.graphCostProfiles);
  const [mcResult, setMcResult] = useState<MCResult | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<'overview' | 'tornado' | 'histogram'>('overview');

  // Elements with O/M/P data (Tier 3)
  const tier3Elements = useMemo(() => {
    return elements.filter(
      (el) => el.costEstimateOptimistic && el.costEstimateMostLikely && el.costEstimatePessimistic
    );
  }, [elements]);

  const runMonteCarlo = useCallback(() => {
    if (tier3Elements.length === 0) return;
    setRunning(true);

    const worker = new Worker(
      new URL('../../workers/monteCarlo.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<MCResult>) => {
      setMcResult(e.data);
      setRunning(false);
      worker.terminate();
    };

    worker.onerror = () => {
      setRunning(false);
      worker.terminate();
    };

    worker.postMessage({
      elements: tier3Elements.map((el) => ({
        elementId: el.id,
        name: el.name,
        optimistic: el.costEstimateOptimistic!,
        mostLikely: el.costEstimateMostLikely!,
        pessimistic: el.costEstimatePessimistic!,
        successProbability: el.successProbability,
      })),
      iterations: 10000,
    });
  }, [tier3Elements]);

  // Auto-run when Tier 3 elements exist
  useEffect(() => {
    if (tier3Elements.length > 0 && !mcResult && !running) {
      runMonteCarlo();
    }
  }, [tier3Elements.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tier3Elements.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Activity size={14} className="text-[#8b5cf6]" />
            Probabilistic Analysis
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <Layers size={20} className="mx-auto text-[var(--text-disabled)]" />
            <p className="text-xs text-[var(--text-tertiary)]">No Tier 3 data</p>
            <p className="text-[10px] text-[var(--text-disabled)]">
              Add O/M/P cost estimates to elements for probabilistic analysis
            </p>
          </div>
        </div>
      </div>
    );
  }

  const maxHist = mcResult ? Math.max(...mcResult.histogram.map((h) => h.count)) : 1;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Activity size={14} className="text-[#8b5cf6]" />
            Probabilistic Analysis
          </h3>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium"
            style={{ backgroundColor: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}>
            <Layers size={9} /> T3
          </span>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
          {tier3Elements.length} elements with O/M/P &middot; PERT Monte Carlo (10K)
        </p>
      </div>

      {running && (
        <div className="p-4 text-center">
          <div className="animate-spin h-5 w-5 border-2 border-[#8b5cf6] border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-[10px] text-[var(--text-tertiary)]">Running 10,000 iterations...</p>
        </div>
      )}

      {mcResult && !running && (
        <>
          {/* P10/P50/P90 Cards */}
          <div className="grid grid-cols-3 gap-1.5 p-3">
            <div className="rounded-md border border-[#22c55e]/30 bg-[#22c55e]/5 p-2 text-center">
              <div className="text-[9px] text-[#22c55e] font-mono">P10</div>
              <div className="text-sm font-bold text-white">{formatK(mcResult.p10)}</div>
            </div>
            <div className="rounded-md border border-[#3b82f6]/30 bg-[#3b82f6]/5 p-2 text-center">
              <div className="text-[9px] text-[#3b82f6] font-mono">P50</div>
              <div className="text-sm font-bold text-white">{formatK(mcResult.p50)}</div>
            </div>
            <div className="rounded-md border border-[#ef4444]/30 bg-[#ef4444]/5 p-2 text-center">
              <div className="text-[9px] text-[#ef4444] font-mono">P90</div>
              <div className="text-sm font-bold text-white">{formatK(mcResult.p90)}</div>
            </div>
          </div>

          {/* VaR + Stats */}
          <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              <div className="text-[9px] text-[var(--text-tertiary)]">VaR (95%)</div>
              <div className="text-xs font-bold text-[#f59e0b]">{formatK(mcResult.var95)} EUR</div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              <div className="text-[9px] text-[var(--text-tertiary)]">Std Dev</div>
              <div className="text-xs font-bold text-white">{formatK(mcResult.stdDev)} EUR</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-3 pb-2">
            {(['overview', 'histogram', 'tornado'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition ${tab === t ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' : 'text-[var(--text-disabled)] hover:text-white'}`}>
                {t === 'overview' ? 'Overview' : t === 'histogram' ? 'Distribution' : 'Tornado'}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="px-3 pb-3">
            {tab === 'overview' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-[var(--text-secondary)]">Mean</span>
                  <span className="text-white font-mono">{formatK(mcResult.mean)} EUR</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-[var(--text-secondary)]">Range (P10–P90)</span>
                  <span className="text-white font-mono">{formatK(mcResult.p90 - mcResult.p10)} EUR</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-[var(--text-secondary)]">Confidence</span>
                  <span className="text-white font-mono">
                    {mcResult.stdDev > 0 ? Math.round((1 - mcResult.stdDev / mcResult.mean) * 100) : 100}%
                  </span>
                </div>
                <button onClick={runMonteCarlo}
                  className="w-full mt-2 rounded-md border border-[#8b5cf6]/30 px-3 py-1.5 text-[10px] text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition">
                  Re-run Simulation
                </button>
              </div>
            )}

            {tab === 'histogram' && (
              <div className="space-y-0.5">
                {mcResult.histogram.map((h, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[8px] text-[var(--text-disabled)] w-12 text-right font-mono">{formatK(h.bucket)}</span>
                    <div className="flex-1 h-2 rounded-full bg-[var(--surface-base)]">
                      <div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${(h.count / maxHist) * 100}%` }} />
                    </div>
                    <span className="text-[8px] text-[var(--text-disabled)] w-8 font-mono">{h.count}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'tornado' && (
              <div className="space-y-1">
                <p className="text-[9px] text-[var(--text-tertiary)] mb-1.5">
                  Elements contributing most to cost variance
                </p>
                {mcResult.elementContributions.slice(0, 8).map((ec) => (
                  <div key={ec.elementId} className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-secondary)] flex-1 truncate">{ec.name}</span>
                    <div className="w-16 h-2 rounded-full bg-[var(--surface-base)]">
                      <div className="h-full rounded-full bg-[#f59e0b]"
                        style={{ width: `${Math.min(ec.varianceContribution * 100, 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-white font-mono w-8 text-right">
                      {Math.round(ec.varianceContribution * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
