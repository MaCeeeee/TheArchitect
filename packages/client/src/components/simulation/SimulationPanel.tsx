import { useState, useMemo } from 'react';
import {
  Play,
  Square,
  Brain,
  AlertTriangle,
  Clock,
  DollarSign,
  Users,
  ChevronDown,
  ChevronRight,
  Activity,
  Zap,
  Shield,
  BarChart3,
  History,
} from 'lucide-react';
import { useSimulationStore } from '../../stores/simulationStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import type { AgentPersona, ScenarioType, FatigueRating } from '@thearchitect/shared/src/types/simulation.types';

const SCENARIO_TYPES: { value: ScenarioType; label: string; icon: typeof Brain }[] = [
  { value: 'cloud_migration', label: 'Cloud Migration', icon: Zap },
  { value: 'mna_integration', label: 'M&A Integration', icon: Users },
  { value: 'technology_refresh', label: 'Technology Refresh', icon: Activity },
  { value: 'cost_optimization', label: 'Cost Optimization', icon: DollarSign },
  { value: 'org_restructure', label: 'Org Restructure', icon: Users },
  { value: 'custom', label: 'Custom Scenario', icon: Brain },
];

const DEFAULT_PERSONAS: AgentPersona[] = [
  {
    id: 'cto', name: 'CTO', stakeholderType: 'c_level',
    visibleLayers: ['strategy', 'business', 'information', 'application', 'technology'],
    visibleDomains: ['business', 'data', 'application', 'technology'],
    maxGraphDepth: 5, budgetConstraint: 2_000_000, riskThreshold: 'high',
    expectedCapacity: 8, priorities: ['innovation', 'risk_reduction', 'digital_transformation'],
    systemPromptSuffix: '',
  },
  {
    id: 'business_unit_lead', name: 'Business Unit Lead', stakeholderType: 'business_unit',
    visibleLayers: ['strategy', 'business'], visibleDomains: ['business'],
    maxGraphDepth: 3, budgetConstraint: 500_000, riskThreshold: 'medium',
    expectedCapacity: 5, priorities: ['cost_reduction', 'process_efficiency', 'time_to_market'],
    systemPromptSuffix: '',
  },
  {
    id: 'it_operations_manager', name: 'IT Operations Manager', stakeholderType: 'it_ops',
    visibleLayers: ['application', 'technology'], visibleDomains: ['application', 'technology'],
    maxGraphDepth: 4, budgetConstraint: 800_000, riskThreshold: 'low',
    expectedCapacity: 4, priorities: ['stability', 'security', 'maintenance_cost'],
    systemPromptSuffix: '',
  },
];

const FATIGUE_COLORS: Record<FatigueRating, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

const FATIGUE_BG: Record<FatigueRating, string> = {
  green: 'bg-green-500/10 border-green-500/30',
  yellow: 'bg-yellow-500/10 border-yellow-500/30',
  orange: 'bg-orange-500/10 border-orange-500/30',
  red: 'bg-red-500/10 border-red-500/30',
};

type ViewMode = 'config' | 'running' | 'results' | 'history';

export default function SimulationPanel() {
  const projectId = useArchitectureStore((s) => s.projectId);
  const {
    isRunning, currentRound, currentAgent, streamingText,
    fatigueReport, fatigueTimeline, emergenceEvents, emergenceMetrics,
    liveFeed, runs, riskOverlay, costOverlay, showOverlay,
    startSimulation, cancelSimulation, loadRuns, selectRun, toggleOverlay, clearSimulation,
  } = useSimulationStore();

  const [viewMode, setViewMode] = useState<ViewMode>('config');
  const [scenarioType, setScenarioType] = useState<ScenarioType>('cloud_migration');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [maxRounds, setMaxRounds] = useState(5);
  const [agents, setAgents] = useState<AgentPersona[]>(DEFAULT_PERSONAS);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const handleStart = async () => {
    if (!projectId || !scenarioDescription.trim()) return;
    setViewMode('running');
    await startSimulation(projectId, {
      scenarioType,
      scenarioDescription,
      maxRounds,
      targetElementIds: [],
      agents,
    });
    setViewMode('results');
  };

  const handleCancel = async () => {
    if (!projectId) return;
    await cancelSimulation(projectId);
    setViewMode('config');
  };

  const handleLoadHistory = async () => {
    if (!projectId) return;
    await loadRuns(projectId);
    setViewMode('history');
  };

  if (!projectId) {
    return (
      <div className="p-4 text-sm text-gray-400">
        Open a project to run simulations.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Tab bar */}
      <div className="flex border-b border-[#334155] px-2">
        {(['config', 'results', 'history'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => mode === 'history' ? handleLoadHistory() : setViewMode(mode)}
            className={`px-3 py-2 text-xs font-medium capitalize ${
              viewMode === mode
                ? 'text-[#7c3aed] border-b-2 border-[#7c3aed]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {viewMode === 'config' && (
          <ConfigView
            scenarioType={scenarioType}
            setScenarioType={setScenarioType}
            scenarioDescription={scenarioDescription}
            setScenarioDescription={setScenarioDescription}
            maxRounds={maxRounds}
            setMaxRounds={setMaxRounds}
            agents={agents}
            expandedAgent={expandedAgent}
            setExpandedAgent={setExpandedAgent}
            onStart={handleStart}
          />
        )}

        {viewMode === 'running' && (
          <RunningView
            currentRound={currentRound}
            maxRounds={maxRounds}
            currentAgent={currentAgent}
            streamingText={streamingText}
            fatigueTimeline={fatigueTimeline}
            liveFeed={liveFeed}
            onCancel={handleCancel}
          />
        )}

        {viewMode === 'results' && (
          <ResultsView
            fatigueReport={fatigueReport}
            emergenceMetrics={emergenceMetrics}
            emergenceEvents={emergenceEvents}
            riskOverlay={riskOverlay}
            costOverlay={costOverlay}
            showOverlay={showOverlay}
            onToggleOverlay={toggleOverlay}
            onNewRun={() => setViewMode('config')}
          />
        )}

        {viewMode === 'history' && (
          <HistoryView
            runs={runs}
            projectId={projectId}
            onSelect={(runId) => {
              selectRun(projectId, runId);
              setViewMode('results');
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Config View ───

function ConfigView({
  scenarioType, setScenarioType, scenarioDescription, setScenarioDescription,
  maxRounds, setMaxRounds, agents, expandedAgent, setExpandedAgent, onStart,
}: {
  scenarioType: ScenarioType;
  setScenarioType: (v: ScenarioType) => void;
  scenarioDescription: string;
  setScenarioDescription: (v: string) => void;
  maxRounds: number;
  setMaxRounds: (v: number) => void;
  agents: AgentPersona[];
  expandedAgent: string | null;
  setExpandedAgent: (v: string | null) => void;
  onStart: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 text-[#7c3aed]">
        <Brain size={16} />
        <span className="font-semibold">MiroFish Simulation</span>
      </div>

      {/* Scenario Type */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Scenario</label>
        <select
          value={scenarioType}
          onChange={(e) => setScenarioType(e.target.value as ScenarioType)}
          className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1.5 text-xs"
        >
          {SCENARIO_TYPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Scenario Description */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Describe the scenario</label>
        <textarea
          value={scenarioDescription}
          onChange={(e) => setScenarioDescription(e.target.value)}
          placeholder="e.g., We are migrating our legacy ERP to a cloud-native platform while simultaneously integrating an acquired company's data systems..."
          className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1.5 text-xs h-20 resize-none"
        />
      </div>

      {/* Max Rounds */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Simulation Rounds: {maxRounds}
        </label>
        <input
          type="range" min={2} max={10} value={maxRounds}
          onChange={(e) => setMaxRounds(parseInt(e.target.value))}
          className="w-full accent-[#7c3aed]"
        />
      </div>

      {/* Agent Personas */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Stakeholder Agents ({agents.length})
        </label>
        <div className="space-y-1">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-[#1e293b] border border-[#334155] rounded">
              <button
                onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Shield size={12} className="text-[#7c3aed]" />
                  <span>{agent.name}</span>
                </div>
                {expandedAgent === agent.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {expandedAgent === agent.id && (
                <div className="px-2 pb-2 text-xs text-gray-400 space-y-1 border-t border-[#334155]">
                  <div className="pt-1">Layers: {agent.visibleLayers.join(', ')}</div>
                  <div>Budget: ${agent.budgetConstraint?.toLocaleString() || 'unlimited'}</div>
                  <div>Risk Threshold: {agent.riskThreshold || 'none'}</div>
                  <div>Capacity: {agent.expectedCapacity} parallel changes</div>
                  <div>Priorities: {agent.priorities.join(', ')}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={onStart}
        disabled={!scenarioDescription.trim()}
        className="w-full flex items-center justify-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 text-white px-3 py-2 rounded text-xs font-medium transition-colors"
      >
        <Play size={14} />
        Run Simulation
      </button>
    </>
  );
}

// ─── Running View ───

function RunningView({
  currentRound, maxRounds, currentAgent, streamingText,
  fatigueTimeline, liveFeed, onCancel,
}: {
  currentRound: number;
  maxRounds: number;
  currentAgent: string | null;
  streamingText: string;
  fatigueTimeline: Array<{ round: number; globalIndex: number; rating: FatigueRating }>;
  liveFeed: any[];
  onCancel: () => void;
}) {
  const latestFatigue = fatigueTimeline[fatigueTimeline.length - 1];

  return (
    <>
      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          Round {currentRound + 1} / {maxRounds}
        </span>
        <button onClick={onCancel} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
          <Square size={12} /> Cancel
        </button>
      </div>

      <div className="w-full bg-[#1e293b] rounded-full h-1.5">
        <div
          className="bg-[#7c3aed] h-1.5 rounded-full transition-all"
          style={{ width: `${((currentRound + 1) / maxRounds) * 100}%` }}
        />
      </div>

      {/* Current Agent */}
      {currentAgent && (
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full bg-[#7c3aed] animate-pulse" />
          <span className="text-gray-300">{currentAgent} is thinking...</span>
        </div>
      )}

      {/* Live Fatigue Gauge */}
      {latestFatigue && (
        <div className={`p-2 rounded border ${FATIGUE_BG[latestFatigue.rating]}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Fatigue Index</span>
            <span className="text-lg font-bold" style={{ color: FATIGUE_COLORS[latestFatigue.rating] }}>
              {(latestFatigue.globalIndex * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Streaming reasoning */}
      {streamingText && (
        <div className="bg-[#1e293b] border border-[#334155] rounded p-2 text-xs text-gray-300 max-h-32 overflow-y-auto">
          {streamingText}
        </div>
      )}

      {/* Live feed */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {liveFeed.slice(-10).map((entry, i) => (
          <div key={i} className="text-xs text-gray-400">
            {entry.type === 'emergence' ? (
              <span className="text-yellow-400">
                <AlertTriangle size={10} className="inline mr-1" />
                {entry.content}
              </span>
            ) : entry.type === 'fatigue' ? (
              <span className="text-orange-400">{entry.content}</span>
            ) : (
              entry.content
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Results View (with Fatigue Scorecard) ───

function ResultsView({
  fatigueReport, emergenceMetrics, emergenceEvents,
  riskOverlay, costOverlay, showOverlay, onToggleOverlay, onNewRun,
}: {
  fatigueReport: any;
  emergenceMetrics: any;
  emergenceEvents: any[];
  riskOverlay: Map<string, number>;
  costOverlay: Map<string, number>;
  showOverlay: boolean;
  onToggleOverlay: () => void;
  onNewRun: () => void;
}) {
  if (!fatigueReport) {
    return (
      <div className="text-xs text-gray-400 p-4 text-center">
        No simulation results yet. Run a simulation first.
      </div>
    );
  }

  return (
    <>
      {/* Fatigue Scorecard — C-Level Core View */}
      <div className={`p-3 rounded-lg border ${FATIGUE_BG[fatigueReport.rating as FatigueRating]}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-300">Fatigue Index</span>
          <span
            className="text-2xl font-bold"
            style={{ color: FATIGUE_COLORS[fatigueReport.rating as FatigueRating] }}
          >
            {(fatigueReport.globalIndex * 100).toFixed(0)}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-gray-400" />
            <div>
              <div className="text-gray-400">Projected Delay</div>
              <div className="text-gray-200 font-medium">
                +{fatigueReport.totalProjectedDelayMonths} months
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-gray-400" />
            <div>
              <div className="text-gray-400">Budget at Risk</div>
              <div className="text-gray-200 font-medium">
                ${(fatigueReport.budgetAtRisk / 1000).toFixed(0)}K
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      {fatigueReport.recommendation && (
        <div className="bg-[#1e293b] border border-[#334155] rounded p-2 text-xs text-gray-300">
          <div className="text-xs text-gray-400 mb-1 font-medium">Recommendation</div>
          {fatigueReport.recommendation}
        </div>
      )}

      {/* Per-Agent Fatigue */}
      <div>
        <div className="text-xs text-gray-400 mb-1 font-medium">Stakeholder Fatigue</div>
        <div className="space-y-1.5">
          {fatigueReport.perAgent?.map((agent: any) => (
            <div key={agent.agentId} className="bg-[#1e293b] rounded p-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-300">{agent.agentName}</span>
                <span style={{ color: FATIGUE_COLORS[agent.fatigueIndex >= 0.8 ? 'red' : agent.fatigueIndex >= 0.6 ? 'orange' : agent.fatigueIndex >= 0.3 ? 'yellow' : 'green'] }}>
                  {(agent.fatigueIndex * 100).toFixed(0)}%
                </span>
              </div>
              {/* 3-Factor Bars */}
              <div className="space-y-0.5">
                <FactorBar label="Concurrency" value={agent.concurrencyLoad} />
                <FactorBar label="Negotiation" value={agent.negotiationDrag} />
                <FactorBar label="Constraint" value={agent.constraintPressure} />
              </div>
              {agent.projectedDelayMonths > 0 && (
                <div className="text-[10px] text-gray-500 mt-1">
                  +{agent.projectedDelayMonths.toFixed(1)} months delay
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per-Element Bottlenecks */}
      {fatigueReport.perElement?.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-1 font-medium">Bottleneck Elements</div>
          <div className="space-y-1">
            {fatigueReport.perElement.slice(0, 5).map((el: any) => (
              <div key={el.elementId} className="bg-[#1e293b] rounded px-2 py-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300 truncate">{el.elementName}</span>
                  <span className="text-orange-400 ml-2">
                    +{el.projectedDelayMonths.toFixed(0)}mo
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  {el.conflictRounds} conflict rounds — {el.involvedAgents.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergence Metrics */}
      {emergenceMetrics && (
        <div>
          <div className="text-xs text-gray-400 mb-1 font-medium">Emergence Metrics</div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <MetricCard label="Consensus" value={`${(emergenceMetrics.consensusScore * 100).toFixed(0)}%`} />
            <MetricCard label="Deadlocks" value={emergenceMetrics.deadlockCount} />
            <MetricCard label="Avg Rounds" value={emergenceMetrics.avgRoundsToConsensus.toFixed(1)} />
            <MetricCard label="Hallucinations Blocked" value={emergenceMetrics.blockedHallucinations} />
          </div>
        </div>
      )}

      {/* Overlay Toggle + New Run */}
      <div className="flex gap-2">
        <button
          onClick={onToggleOverlay}
          className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
            showOverlay
              ? 'bg-[#7c3aed]/20 border-[#7c3aed] text-[#7c3aed]'
              : 'bg-[#1e293b] border-[#334155] text-gray-400 hover:text-gray-200'
          }`}
        >
          <BarChart3 size={12} className="inline mr-1" />
          {showOverlay ? 'Hide' : 'Show'} Overlay
        </button>
        <button
          onClick={onNewRun}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-[#1e293b] border border-[#334155] text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Play size={12} className="inline mr-1" />
          New Run
        </button>
      </div>
    </>
  );
}

// ─── History View ───

function HistoryView({ runs, projectId, onSelect }: {
  runs: any[];
  projectId: string;
  onSelect: (runId: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="text-xs text-gray-400 p-4 text-center">
        <History size={20} className="mx-auto mb-2 opacity-50" />
        No simulation runs yet.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {runs.map((run) => (
        <button
          key={run.id}
          onClick={() => onSelect(run.id)}
          className="w-full bg-[#1e293b] border border-[#334155] rounded p-2 text-left hover:border-[#7c3aed]/50 transition-colors"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-300 truncate">{run.name}</span>
            {run.fatigueRating && (
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: FATIGUE_COLORS[run.fatigueRating as FatigueRating] }}
              />
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {run.scenarioType.replace('_', ' ')} — {run.totalRounds} rounds — {run.outcome || run.status}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Small Components ───

function FactorBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = value >= 0.8 ? '#ef4444' : value >= 0.6 ? '#f97316' : value >= 0.3 ? '#eab308' : '#22c55e';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-500 w-16 truncate">{label}</span>
      <div className="flex-1 bg-[#0f172a] rounded-full h-1">
        <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-gray-500 w-7 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#0f172a] rounded p-1.5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-xs text-gray-200 font-medium">{value}</div>
    </div>
  );
}
