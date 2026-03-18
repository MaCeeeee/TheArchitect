import { useState } from 'react';
import { Dice5, Play, BarChart3 } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

interface SimConfig {
  iterations: number;
  scenario: 'cost' | 'risk' | 'performance';
}

interface SimResult {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  stdDev: number;
  distribution: { bucket: number; count: number }[];
}

export default function MonteCarloSimulation() {
  const elements = useArchitectureStore((s) => s.elements);
  const connections = useArchitectureStore((s) => s.connections);
  const [config, setConfig] = useState<SimConfig>({ iterations: 5000, scenario: 'cost' });
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);

  const runSimulation = () => {
    if (elements.length === 0) return;
    setRunning(true);

    const results: number[] = [];
    const { iterations, scenario } = config;

    for (let i = 0; i < iterations; i++) {
      let value = 0;

      if (scenario === 'cost') {
        for (const el of elements) {
          const baseCosts: Record<string, number> = {
            application: 50000, infrastructure: 80000, technology_component: 30000,
            platform_service: 40000, data_entity: 10000, process: 12000,
          };
          const base = baseCosts[el.type] || 15000;
          const variation = base * (0.8 + Math.random() * 0.4);
          const riskFactor = el.riskLevel === 'critical' ? 1 + Math.random() * 0.3 : el.riskLevel === 'high' ? 1 + Math.random() * 0.15 : 1;
          value += variation * riskFactor;
        }
      } else if (scenario === 'risk') {
        for (const el of elements) {
          const riskScores: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };
          const base = riskScores[el.riskLevel] || 2;
          const maturityFactor = (5 - el.maturityLevel) * 0.5;
          value += base + maturityFactor + Math.random() * 3 - 1.5;
        }
        value /= Math.max(elements.length, 1);
      } else {
        const connectivity = connections.length / Math.max(elements.length, 1);
        const avgMaturity = elements.reduce((s, e) => s + e.maturityLevel, 0) / Math.max(elements.length, 1);
        value = (avgMaturity * 15 + (1 / (1 + connectivity)) * 20 + Math.random() * 20) * (0.9 + Math.random() * 0.2);
      }

      results.push(value);
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
        bucket: Math.round(start * 10) / 10,
        count: results.filter((v) => v >= start && v < start + bucketSize).length,
      };
    });

    setResult({
      mean: Math.round(mean * 100) / 100,
      p10: Math.round(results[Math.floor(iterations * 0.1)] * 100) / 100,
      p50: Math.round(results[Math.floor(iterations * 0.5)] * 100) / 100,
      p90: Math.round(results[Math.floor(iterations * 0.9)] * 100) / 100,
      stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
      distribution,
    });

    setRunning(false);
  };

  const formatValue = (n: number) => {
    if (config.scenario === 'cost') {
      if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
      return `$${n.toFixed(0)}`;
    }
    return n.toFixed(1);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#1a2a1a]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Dice5 size={14} className="text-[#00ff41]" />
          Monte Carlo Simulation
        </h3>
      </div>

      {/* Config */}
      <div className="p-3 space-y-2">
        <div>
          <label className="text-[9px] text-[#4a5a4a] block mb-1">Scenario</label>
          <select
            value={config.scenario}
            onChange={(e) => setConfig({ ...config, scenario: e.target.value as SimConfig['scenario'] })}
            className="w-full bg-[#0a0a0a] border border-[#1a2a1a] rounded px-2 py-1 text-[10px] text-white outline-none"
          >
            <option value="cost">Cost Estimation</option>
            <option value="risk">Risk Assessment</option>
            <option value="performance">Performance Score</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] text-[#4a5a4a] block mb-1">Iterations</label>
          <select
            value={config.iterations}
            onChange={(e) => setConfig({ ...config, iterations: parseInt(e.target.value) })}
            className="w-full bg-[#0a0a0a] border border-[#1a2a1a] rounded px-2 py-1 text-[10px] text-white outline-none"
          >
            <option value="1000">1,000</option>
            <option value="5000">5,000</option>
            <option value="10000">10,000</option>
            <option value="25000">25,000</option>
          </select>
        </div>
        <button
          onClick={runSimulation}
          disabled={running || elements.length === 0}
          className="w-full rounded-md bg-[#00ff41] px-3 py-1.5 text-[10px] font-medium text-black hover:bg-[#00ff41] disabled:opacity-30 transition flex items-center justify-center gap-1"
        >
          <Play size={10} />
          {running ? `Running ${config.iterations.toLocaleString()} iterations...` : 'Run Simulation'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#1a2a1a] pt-3">
          <div className="grid grid-cols-3 gap-1">
            <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-1.5 text-center">
              <div className="text-[9px] text-[#4a5a4a]">P10</div>
              <div className="text-xs font-bold text-[#22c55e]">{formatValue(result.p10)}</div>
            </div>
            <div className="rounded-md border border-[#00ff41]/30 bg-[#00ff41]/10 p-1.5 text-center">
              <div className="text-[9px] text-[#4a5a4a]">P50</div>
              <div className="text-xs font-bold text-white">{formatValue(result.p50)}</div>
            </div>
            <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-1.5 text-center">
              <div className="text-[9px] text-[#4a5a4a]">P90</div>
              <div className="text-xs font-bold text-[#ef4444]">{formatValue(result.p90)}</div>
            </div>
          </div>

          {/* Distribution */}
          <div className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] p-2">
            <div className="text-[9px] text-[#4a5a4a] mb-1 flex items-center gap-1">
              <BarChart3 size={8} /> Distribution
            </div>
            <div className="flex items-end gap-px h-14">
              {result.distribution.map((d, i) => {
                const maxCount = Math.max(...result.distribution.map((dd) => dd.count));
                const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-[#00ff41]"
                    style={{ height: `${height}%`, opacity: 0.4 + (height / 100) * 0.6 }}
                    title={`${d.bucket}: ${d.count}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="text-[9px] text-[#3a4a3a] text-center">
            Mean: {formatValue(result.mean)} | StdDev: {formatValue(result.stdDev)}
          </div>
        </div>
      )}

      {elements.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[#4a5a4a] text-center">Add elements to run simulation</p>
        </div>
      )}
    </div>
  );
}
