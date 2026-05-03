import { useState, useCallback, useMemo } from 'react';
import { Dice5, Play, BarChart3, TrendingUp, AlertTriangle, Layers } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

interface MCOutput {
  mean: number;
  stdDev: number;
  p10: number;
  p50: number;
  p90: number;
  var95: number;
  histogram: { bucket: number; count: number }[];
  elementContributions: { elementId: string; name: string; varianceContribution: number }[];
}

interface DomainBreakdown {
  domain: string;
  p10: number;
  p50: number;
  p90: number;
  elementCount: number;
}

const DOMAIN_COLORS: Record<string, string> = {
  Strategy: '#a78bfa',
  Application: '#f97316',
  Business: '#22c55e',
  Implementation: '#3b82f6',
  Technology: '#06b6d4',
  Motivation: '#eab308',
  Data: '#ec4899',
  Physical: '#94a3b8',
};

function domainOf(layer: string): string {
  if (!layer) return 'Other';
  const l = layer.toLowerCase();
  if (l.includes('strategy')) return 'Strategy';
  if (l.includes('application')) return 'Application';
  if (l.includes('business')) return 'Business';
  if (l.includes('implementation') || l.includes('migration')) return 'Implementation';
  if (l.includes('technology')) return 'Technology';
  if (l.includes('motivation')) return 'Motivation';
  if (l.includes('data')) return 'Data';
  if (l.includes('physical')) return 'Physical';
  return 'Other';
}

export default function MonteCarloSimulation() {
  const elements = useArchitectureStore((s) => s.elements);
  const [iterations, setIterations] = useState(10000);
  const [result, setResult] = useState<MCOutput | null>(null);
  const [domainResults, setDomainResults] = useState<DomainBreakdown[]>([]);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<'overview' | 'tornado' | 'domains'>('overview');

  // Build simulation elements: prefer O/M/P, fall back to annualCost ± spread
  const simElements = useMemo(() => {
    return elements
      .filter((el) => {
        const hasCost = (el.annualCost && el.annualCost > 0) ||
          (el.costEstimateOptimistic && el.costEstimateMostLikely && el.costEstimatePessimistic);
        return hasCost;
      })
      .map((el) => {
        const hasOMP = el.costEstimateOptimistic && el.costEstimateMostLikely && el.costEstimatePessimistic;
        const base = el.annualCost || el.costEstimateMostLikely || 0;
        return {
          elementId: el.id,
          name: el.name,
          domain: domainOf(el.layer),
          optimistic: hasOMP ? el.costEstimateOptimistic! : Math.round(base * 0.75),
          mostLikely: hasOMP ? el.costEstimateMostLikely! : base,
          pessimistic: hasOMP ? el.costEstimatePessimistic! : Math.round(base * 1.4),
          successProbability: el.successProbability,
        };
      });
  }, [elements]);

  const tier3Count = useMemo(() =>
    elements.filter((el) => el.costEstimateOptimistic && el.costEstimateMostLikely && el.costEstimatePessimistic).length,
    [elements],
  );

  const runSimulation = useCallback(() => {
    if (simElements.length === 0) return;
    setRunning(true);

    // Main simulation via worker
    const worker = new Worker(
      new URL('../../workers/monteCarlo.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<MCOutput>) => {
      setResult(e.data);

      // Per-domain breakdown: run mini-simulations
      const domains = new Map<string, typeof simElements>();
      for (const el of simElements) {
        if (!domains.has(el.domain)) domains.set(el.domain, []);
        domains.get(el.domain)!.push(el);
      }

      const breakdowns: DomainBreakdown[] = [];
      for (const [domain, els] of domains) {
        // Simple PERT estimate per domain (no worker needed)
        const totals: number[] = [];
        for (let i = 0; i < 2000; i++) {
          let sum = 0;
          for (const el of els) {
            const range = el.pessimistic - el.optimistic;
            if (range <= 0) { sum += el.mostLikely; continue; }
            const mu = (el.optimistic + 4 * el.mostLikely + el.pessimistic) / 6;
            // Triangular approximation for quick domain breakdown
            const u = Math.random();
            const fc = (el.mostLikely - el.optimistic) / range;
            const sample = u < fc
              ? el.optimistic + Math.sqrt(u * range * (el.mostLikely - el.optimistic))
              : el.pessimistic - Math.sqrt((1 - u) * range * (el.pessimistic - el.mostLikely));
            let cost = isNaN(sample) ? mu : sample;
            if (el.successProbability != null && el.successProbability < 1) {
              if (Math.random() > el.successProbability) cost *= 1.5;
            }
            sum += cost;
          }
          totals.push(sum);
        }
        totals.sort((a, b) => a - b);
        breakdowns.push({
          domain,
          p10: Math.round(totals[Math.floor(2000 * 0.1)]),
          p50: Math.round(totals[Math.floor(2000 * 0.5)]),
          p90: Math.round(totals[Math.floor(2000 * 0.9)]),
          elementCount: els.length,
        });
      }
      breakdowns.sort((a, b) => b.p50 - a.p50);
      setDomainResults(breakdowns);
      setRunning(false);
      worker.terminate();
    };

    worker.postMessage({ elements: simElements, iterations });
  }, [simElements, iterations]);

  const fmt = (n: number) => {
    if (n >= 1000000) return `€${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `€${(n / 1000).toFixed(0)}K`;
    return `€${n.toFixed(0)}`;
  };

  const pctBar = (val: number, max: number) => max > 0 ? Math.round((val / max) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Dice5 size={14} className="text-[#00ff41]" />
          Monte Carlo Simulation
        </h3>
      </div>

      {/* Config */}
      <div className="p-3 space-y-2">
        {/* Data quality info */}
        <div className="text-[11px] text-[var(--text-tertiary)] bg-[var(--surface-base)] rounded px-2 py-1.5 border border-[var(--border-subtle)]">
          <span className="text-white font-medium">{simElements.length}</span> elements with cost data
          {tier3Count > 0 && (
            <> · <span className="text-[#00ff41]">{tier3Count}</span> with O/M/P (Tier 3)</>
          )}
          {simElements.length - tier3Count > 0 && (
            <> · <span className="text-yellow-400">{simElements.length - tier3Count}</span> estimated ±25/40%</>
          )}
        </div>

        <div>
          <label className="text-[11px] text-[var(--text-tertiary)] block mb-1">Iterations</label>
          <select
            value={iterations}
            onChange={(e) => setIterations(parseInt(e.target.value))}
            className="w-full bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[12px] text-white outline-none"
          >
            <option value="1000">1,000</option>
            <option value="5000">5,000</option>
            <option value="10000">10,000</option>
            <option value="25000">25,000</option>
          </select>
        </div>
        <button
          onClick={runSimulation}
          disabled={running || simElements.length === 0}
          className="w-full rounded-md bg-[#00ff41] px-3 py-1.5 text-[12px] font-medium text-black hover:bg-[#00ff41]/90 disabled:opacity-30 transition flex items-center justify-center gap-1"
        >
          <Play size={10} />
          {running ? `Running ${iterations.toLocaleString()} iterations...` : 'Run Simulation'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          {/* P10 / P50 / P90 */}
          <div className="grid grid-cols-3 gap-1">
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1.5 text-center">
              <div className="text-[11px] text-[var(--text-tertiary)]">P10 (optimistic)</div>
              <div className="text-xs font-bold text-[#22c55e]">{fmt(result.p10)}</div>
            </div>
            <div className="rounded-md border border-[#00ff41]/30 bg-[#00ff41]/10 p-1.5 text-center">
              <div className="text-[11px] text-[var(--text-tertiary)]">P50 (expected)</div>
              <div className="text-xs font-bold text-white">{fmt(result.p50)}</div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1.5 text-center">
              <div className="text-[11px] text-[var(--text-tertiary)]">P90 (risk)</div>
              <div className="text-xs font-bold text-[#ef4444]">{fmt(result.p90)}</div>
            </div>
          </div>

          {/* VaR + Confidence */}
          <div className="grid grid-cols-2 gap-1">
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1.5">
              <div className="text-[11px] text-[var(--text-tertiary)]">VaR 95%</div>
              <div className="text-[12px] font-bold text-orange-400">{fmt(result.var95)}</div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-1.5">
              <div className="text-[11px] text-[var(--text-tertiary)]">Spread (P90−P10)</div>
              <div className="text-[12px] font-bold text-white">{fmt(result.p90 - result.p10)}</div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0.5 text-[11px]">
            {(['overview', 'tornado', 'domains'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1 rounded text-center transition ${
                  tab === t ? 'bg-[#00ff41]/20 text-[#00ff41]' : 'text-[var(--text-tertiary)] hover:text-white'
                }`}
              >
                {t === 'overview' ? 'Distribution' : t === 'tornado' ? 'Risk Drivers' : 'By Domain'}
              </button>
            ))}
          </div>

          {/* Distribution tab */}
          {tab === 'overview' && (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              <div className="text-[11px] text-[var(--text-tertiary)] mb-1 flex items-center gap-1">
                <BarChart3 size={8} /> Cost Distribution ({iterations.toLocaleString()} runs)
              </div>
              <div className="flex items-end gap-px h-20">
                {result.histogram.map((d, i) => {
                  const maxCount = Math.max(...result.histogram.map((dd) => dd.count));
                  const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                  // Color: green for P10-P50 range, red for P90+
                  const val = d.bucket;
                  const color = val <= result.p10 ? '#22c55e' : val >= result.p90 ? '#ef4444' : '#00ff41';
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm transition-all"
                      style={{ height: `${height}%`, backgroundColor: color, opacity: 0.4 + (height / 100) * 0.6 }}
                      title={`${fmt(d.bucket)}: ${d.count} runs`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[8px] text-[var(--text-disabled)] mt-0.5">
                <span>{fmt(result.histogram[0]?.bucket || 0)}</span>
                <span>{fmt(result.histogram[result.histogram.length - 1]?.bucket || 0)}</span>
              </div>
              <div className="text-[11px] text-[var(--text-disabled)] text-center mt-1">
                Mean: {fmt(result.mean)} | StdDev: {fmt(result.stdDev)} | CoV: {result.mean > 0 ? ((result.stdDev / result.mean) * 100).toFixed(1) : 0}%
              </div>
            </div>
          )}

          {/* Tornado / Risk Drivers tab */}
          {tab === 'tornado' && (
            <div className="space-y-1">
              <div className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1 mb-1">
                <AlertTriangle size={8} /> Top cost uncertainty drivers
              </div>
              {result.elementContributions.slice(0, 10).map((ec) => {
                const pct = Math.round(ec.varianceContribution * 100);
                const el = simElements.find((e) => e.elementId === ec.elementId);
                return (
                  <div key={ec.elementId} className="bg-[var(--surface-base)] rounded px-2 py-1 border border-[var(--border-subtle)]">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-gray-300 truncate flex-1">{ec.name}</span>
                      <span className="text-orange-400 ml-2 font-medium">{pct}%</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="flex-1 h-1.5 bg-[var(--surface-raised)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                          style={{ width: `${Math.min(pct * 2, 100)}%` }}
                        />
                      </div>
                      {el && (
                        <span className="text-[8px] text-[var(--text-disabled)] whitespace-nowrap">
                          {fmt(el.optimistic)}–{fmt(el.pessimistic)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {result.elementContributions.length === 0 && (
                <div className="text-[11px] text-[var(--text-tertiary)] text-center py-2">
                  No variance data — add O/M/P estimates to elements
                </div>
              )}
            </div>
          )}

          {/* Domain breakdown tab */}
          {tab === 'domains' && (
            <div className="space-y-1">
              <div className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1 mb-1">
                <Layers size={8} /> Cost distribution by architecture domain
              </div>
              {domainResults.map((d) => {
                const maxP90 = Math.max(...domainResults.map((dd) => dd.p90), 1);
                const color = DOMAIN_COLORS[d.domain] || '#94a3b8';
                return (
                  <div key={d.domain} className="bg-[var(--surface-base)] rounded px-2 py-1.5 border border-[var(--border-subtle)]">
                    <div className="flex justify-between text-[12px] mb-0.5">
                      <span className="font-medium" style={{ color }}>{d.domain}</span>
                      <span className="text-[var(--text-tertiary)]">{d.elementCount} elements</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Range bar: P10 to P90 */}
                      <div className="flex-1 h-3 bg-[var(--surface-raised)] rounded relative">
                        <div
                          className="absolute h-full rounded opacity-30"
                          style={{
                            left: `${pctBar(d.p10, maxP90)}%`,
                            width: `${pctBar(d.p90 - d.p10, maxP90)}%`,
                            backgroundColor: color,
                          }}
                        />
                        <div
                          className="absolute h-full w-0.5 rounded"
                          style={{ left: `${pctBar(d.p50, maxP90)}%`, backgroundColor: color }}
                          title={`P50: ${fmt(d.p50)}`}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[8px] text-[var(--text-disabled)] mt-0.5">
                      <span>P10: {fmt(d.p10)}</span>
                      <span className="font-medium text-gray-400">P50: {fmt(d.p50)}</span>
                      <span>P90: {fmt(d.p90)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {simElements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-1">
            <TrendingUp size={20} className="mx-auto text-[var(--text-disabled)]" />
            <p className="text-xs text-[var(--text-tertiary)]">No cost data available</p>
            <p className="text-[11px] text-[var(--text-disabled)]">Add annual costs or O/M/P estimates via Cost → Enrich Cost Data</p>
          </div>
        </div>
      )}
    </div>
  );
}
