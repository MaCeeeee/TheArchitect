import { useMemo, useState } from 'react';
import { Brain, BarChart3, Target, Shuffle } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

interface SimulationResult {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  stdDev: number;
  distribution: { bucket: number; count: number }[];
}

export default function PredictiveAnalytics() {
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Architecture health metrics
  const metrics = useMemo(() => {
    const avgMaturity = elements.length > 0
      ? elements.reduce((s, e) => s + e.maturityLevel, 0) / elements.length
      : 0;

    const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const el of elements) {
      riskCounts[el.riskLevel as keyof typeof riskCounts]++;
    }

    const statusCounts = { current: 0, target: 0, transitional: 0, retired: 0 };
    for (const el of elements) {
      statusCounts[el.status as keyof typeof statusCounts]++;
    }

    // Connectivity metrics
    const avgConnections = elements.length > 0
      ? connections.length / elements.length
      : 0;

    // Single points of failure (elements with many dependents but no redundancy)
    const spofs = elements.filter((el) => {
      const dependents = connections.filter((c) => c.targetId === el.id).length;
      return dependents >= 3;
    });

    // Architecture completeness
    const completeness = Math.min(100, Math.round(
      (elements.length > 0 ? 20 : 0) +
      (connections.length > 0 ? 20 : 0) +
      (avgMaturity >= 3 ? 20 : avgMaturity * 6.66) +
      (riskCounts.critical === 0 ? 20 : 10) +
      (statusCounts.retired / Math.max(elements.length, 1) < 0.2 ? 20 : 10)
    ));

    return {
      avgMaturity: Math.round(avgMaturity * 10) / 10,
      riskCounts,
      statusCounts,
      avgConnections: Math.round(avgConnections * 10) / 10,
      spofCount: spofs.length,
      completeness,
      elementCount: elements.length,
      connectionCount: connections.length,
    };
  }, [elements, connections]);

  // Client-side Monte Carlo simulation
  const runSimulation = () => {
    setIsRunning(true);

    const baseCost = elements.reduce((sum, el) => {
      const costs: Record<string, number> = {
        application: 50000, infrastructure: 80000, technology_component: 30000,
        platform_service: 40000, data_entity: 10000, process: 12000,
      };
      return sum + (costs[el.type] || 15000);
    }, 0);

    const riskFactors = [
      { prob: metrics.riskCounts.critical * 0.05, min: baseCost * 0.1, max: baseCost * 0.3 },
      { prob: metrics.riskCounts.high * 0.03, min: baseCost * 0.05, max: baseCost * 0.15 },
      { prob: metrics.spofCount * 0.02, min: baseCost * 0.08, max: baseCost * 0.2 },
      { prob: 0.1, min: baseCost * 0.02, max: baseCost * 0.08 }, // general uncertainty
    ];

    const iterations = 5000;
    const results: number[] = [];

    for (let i = 0; i < iterations; i++) {
      let cost = baseCost;
      for (const rf of riskFactors) {
        if (Math.random() < rf.prob) {
          cost += rf.min + Math.random() * (rf.max - rf.min);
        }
      }
      results.push(cost);
    }

    results.sort((a, b) => a - b);

    const mean = results.reduce((s, v) => s + v, 0) / results.length;
    const variance = results.reduce((s, v) => s + (v - mean) ** 2, 0) / results.length;

    const bucketCount = 15;
    const min = results[0];
    const max = results[results.length - 1];
    const bucketSize = (max - min) / bucketCount || 1;
    const distribution = Array.from({ length: bucketCount }, (_, b) => {
      const start = min + b * bucketSize;
      return {
        bucket: Math.round(start / 1000),
        count: results.filter((v) => v >= start && v < start + bucketSize).length,
      };
    });

    setSimResult({
      mean: Math.round(mean),
      p10: Math.round(results[Math.floor(iterations * 0.1)]),
      p50: Math.round(results[Math.floor(iterations * 0.5)]),
      p90: Math.round(results[Math.floor(iterations * 0.9)]),
      stdDev: Math.round(Math.sqrt(variance)),
      distribution,
    });

    setIsRunning(false);
  };

  const formatCost = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n}`;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#1a2a1a]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Brain size={14} className="text-[#00ff41]" />
          Predictive Analytics
        </h3>
        <p className="text-[10px] text-[#4a5a4a] mt-1">Architecture health and Monte Carlo simulation</p>
      </div>

      {/* Health metrics */}
      <div className="p-3 space-y-3">
        <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] flex items-center gap-1">
          <Target size={10} /> Architecture Health
        </h4>

        {/* Completeness gauge */}
        <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#7a8a7a]">Completeness</span>
            <span className="text-sm font-bold text-white">{metrics.completeness}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#1a2a1a]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${metrics.completeness}%`,
                backgroundColor: metrics.completeness >= 80 ? '#22c55e' : metrics.completeness >= 50 ? '#eab308' : '#ef4444',
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Avg Maturity" value={`${metrics.avgMaturity}/5`} color="#3b82f6" />
          <MetricCard label="SPOF Count" value={metrics.spofCount} color={metrics.spofCount > 0 ? '#ef4444' : '#22c55e'} />
          <MetricCard label="Elements" value={metrics.elementCount} color="#7a8a7a" />
          <MetricCard label="Connections" value={metrics.connectionCount} color="#7a8a7a" />
        </div>
      </div>

      {/* Monte Carlo */}
      <div className="px-3 pb-3 border-t border-[#1a2a1a] pt-3">
        <h4 className="text-[10px] font-semibold uppercase text-[#4a5a4a] mb-2 flex items-center gap-1">
          <Shuffle size={10} /> Monte Carlo Cost Simulation
        </h4>

        <button
          onClick={runSimulation}
          disabled={isRunning || elements.length === 0}
          className="w-full rounded-md bg-[#00ff41] px-3 py-1.5 text-[10px] font-medium text-black hover:bg-[#00ff41] disabled:opacity-30 transition mb-3"
        >
          {isRunning ? 'Running 5,000 iterations...' : 'Run Simulation'}
        </button>

        {simResult && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1">
              <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-1.5 text-center">
                <div className="text-[9px] text-[#4a5a4a]">P10 (Best)</div>
                <div className="text-xs font-bold text-[#22c55e]">{formatCost(simResult.p10)}</div>
              </div>
              <div className="rounded-md border border-[#00ff41]/30 bg-[#00ff41]/10 p-1.5 text-center">
                <div className="text-[9px] text-[#4a5a4a]">P50 (Median)</div>
                <div className="text-xs font-bold text-white">{formatCost(simResult.p50)}</div>
              </div>
              <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-1.5 text-center">
                <div className="text-[9px] text-[#4a5a4a]">P90 (Worst)</div>
                <div className="text-xs font-bold text-[#ef4444]">{formatCost(simResult.p90)}</div>
              </div>
            </div>

            {/* Distribution chart (ASCII-style bar chart) */}
            <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
              <div className="text-[9px] text-[#4a5a4a] mb-1">Cost Distribution (5K iterations)</div>
              <div className="flex items-end gap-px h-16">
                {simResult.distribution.map((d, i) => {
                  const maxCount = Math.max(...simResult.distribution.map((dd) => dd.count));
                  const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-[#00ff41]"
                      style={{ height: `${height}%`, opacity: 0.4 + (height / 100) * 0.6 }}
                      title={`${d.bucket}K: ${d.count} runs`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[8px] text-[#3a4a3a]">{formatCost(simResult.p10)}</span>
                <span className="text-[8px] text-[#3a4a3a]">{formatCost(simResult.p90)}</span>
              </div>
            </div>

            <div className="text-[9px] text-[#3a4a3a] text-center">
              Std Dev: {formatCost(simResult.stdDev)} | Mean: {formatCost(simResult.mean)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
      <span className="text-[10px] text-[#4a5a4a]">{label}</span>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
