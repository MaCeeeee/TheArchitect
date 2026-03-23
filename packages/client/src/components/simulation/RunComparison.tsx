import { X, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react';
import type { RunComparisonData } from './comparisonUtils';
import { diffColor, diffBg, formatDelta } from './comparisonUtils';
import type { FatigueRating, EmergenceEvent } from '@thearchitect/shared/src/types/simulation.types';

const FATIGUE_COLORS: Record<FatigueRating, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

const EMERGENCE_COLORS: Record<string, string> = {
  consensus: 'bg-green-500',
  deadlock: 'bg-red-500',
  coalition: 'bg-blue-500',
  fatigue: 'bg-orange-500',
  escalation: 'bg-yellow-500',
  compromise: 'bg-purple-500',
};

interface Props {
  data: RunComparisonData;
  onClear: () => void;
}

export default function RunComparison({ data, onClear }: Props) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 font-medium">
            A: {data.runA.name}
          </span>
          <span className="text-gray-500">vs</span>
          <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 font-medium">
            B: {data.runB.name}
          </span>
        </div>
        <button onClick={onClear} className="p-1 text-gray-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Outcome */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[var(--surface-raised)] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500">Run A Outcome</div>
          <div className="text-xs text-gray-200 font-medium capitalize">{data.outcomeA}</div>
        </div>
        <div className="bg-[var(--surface-raised)] rounded p-2 text-center">
          <div className="text-[10px] text-gray-500">Run B Outcome</div>
          <div className="text-xs text-gray-200 font-medium capitalize">{data.outcomeB}</div>
        </div>
      </div>

      {/* Fatigue Scorecard Comparison */}
      <div>
        <div className="text-xs text-gray-400 mb-2 font-medium">Fatigue Comparison</div>
        <div className="grid grid-cols-3 gap-2">
          {/* Run A */}
          <div className="bg-[var(--surface-raised)] rounded p-2 border border-cyan-500/20">
            <div className="text-[10px] text-cyan-400 mb-1">Run A</div>
            <div className="text-xl font-bold" style={{ color: FATIGUE_COLORS[data.fatigue.ratingA] }}>
              {(data.fatigue.globalA * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              +{data.fatigue.delayA.toFixed(0)} mo delay
            </div>
            <div className="text-[10px] text-gray-500">
              ${(data.fatigue.budgetAtRiskA / 1000).toFixed(0)}K at risk
            </div>
          </div>

          {/* Delta */}
          <div className="bg-[var(--surface-base)] rounded p-2 flex flex-col items-center justify-center">
            <div className="text-[10px] text-gray-500 mb-1">Delta</div>
            <DeltaArrow delta={data.fatigue.delta} />
            <div className={`text-sm font-bold ${diffColor(data.fatigue.delta)}`}>
              {formatDelta(data.fatigue.delta * 100, '%')}
            </div>
            <div className={`text-[10px] mt-1 ${diffColor(data.fatigue.delayDelta)}`}>
              {formatDelta(data.fatigue.delayDelta, ' mo')}
            </div>
            <div className={`text-[10px] ${diffColor(data.fatigue.budgetDelta)}`}>
              {formatDelta(data.fatigue.budgetDelta / 1000, 'K $')}
            </div>
          </div>

          {/* Run B */}
          <div className="bg-[var(--surface-raised)] rounded p-2 border border-purple-500/20">
            <div className="text-[10px] text-purple-400 mb-1">Run B</div>
            <div className="text-xl font-bold" style={{ color: FATIGUE_COLORS[data.fatigue.ratingB] }}>
              {(data.fatigue.globalB * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              +{data.fatigue.delayB.toFixed(0)} mo delay
            </div>
            <div className="text-[10px] text-gray-500">
              ${(data.fatigue.budgetAtRiskB / 1000).toFixed(0)}K at risk
            </div>
          </div>
        </div>
      </div>

      {/* Per-Agent Fatigue Table */}
      {data.fatigue.perAgent.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2 font-medium">Per-Agent Fatigue</div>
          <div className="bg-[var(--surface-raised)] rounded overflow-hidden">
            <div className="grid grid-cols-4 gap-1 px-2 py-1 text-[10px] text-gray-500 border-b border-[var(--border-subtle)]">
              <span>Agent</span>
              <span className="text-center">Run A</span>
              <span className="text-center">Run B</span>
              <span className="text-center">Delta</span>
            </div>
            {data.fatigue.perAgent.map((agent) => (
              <div
                key={agent.agentId}
                className={`grid grid-cols-4 gap-1 px-2 py-1.5 text-xs ${diffBg(agent.delta)}`}
              >
                <span className="text-gray-300 truncate">{agent.name}</span>
                <span className="text-center text-gray-400">{(agent.indexA * 100).toFixed(0)}%</span>
                <span className="text-center text-gray-400">{(agent.indexB * 100).toFixed(0)}%</span>
                <span className={`text-center font-medium ${diffColor(agent.delta)}`}>
                  {formatDelta(agent.delta * 100, '%')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottleneck Comparison */}
      {(data.bottlenecks.shared.length > 0 || data.bottlenecks.onlyA.length > 0 || data.bottlenecks.onlyB.length > 0) && (
        <div>
          <div className="text-xs text-gray-400 mb-2 font-medium">Bottleneck Elements</div>
          <div className="space-y-1">
            {/* Shared bottlenecks */}
            {data.bottlenecks.shared.map((el) => (
              <div key={el.elementId} className={`bg-[var(--surface-raised)] rounded px-2 py-1.5 text-xs ${diffBg(el.delayDeltaMonths)}`}>
                <div className="flex justify-between">
                  <span className="text-gray-300 truncate">{el.name}</span>
                  <span className={`ml-2 font-medium ${diffColor(el.delayDeltaMonths)}`}>
                    {formatDelta(el.delayDeltaMonths, ' mo')}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  Conflict rounds: {formatDelta(el.conflictDelta)}
                </div>
              </div>
            ))}
            {/* Only in A (resolved) */}
            {data.bottlenecks.onlyA.map((el) => (
              <div key={el.elementId} className="bg-green-500/5 rounded px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 truncate">{el.elementName}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">RESOLVED</span>
                </div>
              </div>
            ))}
            {/* Only in B (new) */}
            {data.bottlenecks.onlyB.map((el) => (
              <div key={el.elementId} className="bg-red-500/5 rounded px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 truncate">{el.elementName}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">NEW</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergence Metrics Comparison */}
      <div>
        <div className="text-xs text-gray-400 mb-2 font-medium">Emergence Metrics</div>
        <div className="grid grid-cols-2 gap-1.5">
          <CompareMetric
            label="Consensus"
            valueA={`${(data.emergence.metricsA.consensusScore * 100).toFixed(0)}%`}
            valueB={`${(data.emergence.metricsB.consensusScore * 100).toFixed(0)}%`}
            delta={data.emergence.metricsB.consensusScore - data.emergence.metricsA.consensusScore}
            invert
          />
          <CompareMetric
            label="Deadlocks"
            valueA={String(data.emergence.metricsA.deadlockCount)}
            valueB={String(data.emergence.metricsB.deadlockCount)}
            delta={data.emergence.metricsB.deadlockCount - data.emergence.metricsA.deadlockCount}
          />
          <CompareMetric
            label="Avg Rounds"
            valueA={data.emergence.metricsA.avgRoundsToConsensus.toFixed(1)}
            valueB={data.emergence.metricsB.avgRoundsToConsensus.toFixed(1)}
            delta={data.emergence.metricsB.avgRoundsToConsensus - data.emergence.metricsA.avgRoundsToConsensus}
          />
          <CompareMetric
            label="Blocked"
            valueA={String(data.emergence.metricsA.blockedHallucinations)}
            valueB={String(data.emergence.metricsB.blockedHallucinations)}
            delta={data.emergence.metricsB.blockedHallucinations - data.emergence.metricsA.blockedHallucinations}
            invert
          />
        </div>
      </div>

      {/* Emergence Timeline Comparison */}
      {(data.emergence.eventsA.length > 0 || data.emergence.eventsB.length > 0) && (
        <div>
          <div className="text-xs text-gray-400 mb-2 font-medium">Emergence Timeline</div>
          <div className="grid grid-cols-2 gap-2">
            <TimelineColumn label="Run A" events={data.emergence.eventsA} color="cyan" />
            <TimelineColumn label="Run B" events={data.emergence.eventsB} color="purple" />
          </div>
        </div>
      )}

      {/* Risk/Cost Delta Comparison */}
      {data.riskCost.elements.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2 font-medium">Risk & Cost Deltas</div>
          <div className="bg-[var(--surface-raised)] rounded overflow-hidden text-xs">
            <div className="grid grid-cols-5 gap-1 px-2 py-1 text-[10px] text-gray-500 border-b border-[var(--border-subtle)]">
              <span className="col-span-1">Element</span>
              <span className="text-center">Risk A</span>
              <span className="text-center">Risk B</span>
              <span className="text-center">Cost A</span>
              <span className="text-center">Cost B</span>
            </div>
            {data.riskCost.elements.slice(0, 10).map((el) => (
              <div key={el.elementId} className="grid grid-cols-5 gap-1 px-2 py-1">
                <span className="text-gray-300 truncate col-span-1" title={el.name}>{el.name}</span>
                <span className="text-center text-gray-400">{el.riskA.toFixed(1)}</span>
                <span className={`text-center ${diffColor(el.riskDelta)}`}>{el.riskB.toFixed(1)}</span>
                <span className="text-center text-gray-400">{el.costA.toFixed(0)}</span>
                <span className={`text-center ${diffColor(el.costDelta)}`}>{el.costB.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function DeltaArrow({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.01) return <Minus size={16} className="text-[var(--text-secondary)]" />;
  return delta < 0 ? (
    <TrendingDown size={16} className="text-green-400" />
  ) : (
    <TrendingUp size={16} className="text-red-400" />
  );
}

function CompareMetric({
  label, valueA, valueB, delta, invert = false,
}: {
  label: string; valueA: string; valueB: string; delta: number; invert?: boolean;
}) {
  return (
    <div className="bg-[var(--surface-base)] rounded p-1.5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="flex items-center justify-between text-xs mt-0.5">
        <span className="text-cyan-400">{valueA}</span>
        <span className={`text-[10px] font-medium ${diffColor(delta, invert)}`}>
          {formatDelta(delta, '')}
        </span>
        <span className="text-purple-400">{valueB}</span>
      </div>
    </div>
  );
}

function TimelineColumn({ label, events, color }: {
  label: string; events: EmergenceEvent[]; color: 'cyan' | 'purple';
}) {
  const borderColor = color === 'cyan' ? 'border-cyan-500/20' : 'border-purple-500/20';

  return (
    <div className={`bg-[var(--surface-raised)] rounded p-2 border ${borderColor}`}>
      <div className={`text-[10px] mb-1.5 ${color === 'cyan' ? 'text-cyan-400' : 'text-purple-400'}`}>
        {label} ({events.length} events)
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-[10px] text-gray-600">No events</div>
        ) : (
          events.map((e, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${EMERGENCE_COLORS[e.type] || 'bg-gray-500'}`} />
              <span className="text-gray-500">R{e.round + 1}</span>
              <span className="text-gray-400 truncate">{e.type}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
