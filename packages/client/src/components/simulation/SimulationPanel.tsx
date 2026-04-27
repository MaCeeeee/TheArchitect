import { useState, useMemo, useEffect } from 'react';
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
  Download,
  Loader2,
  Copy,
  Pencil,
  Trash2,
  GitCompareArrows,
  X,
  Plus,
  MessageCircle,
  FileDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSimulationStore } from '../../stores/simulationStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { reportAPI } from '../../services/api';
import EmergenceDashboard from './EmergenceDashboard';
import RunComparison from './RunComparison';
import PersonaEditor from './PersonaEditor';
import type { AgentPersona, ScenarioType, FatigueRating, CustomPersona, SimulationRunSummary } from '@thearchitect/shared/src/types/simulation.types';
import type { TransformationRoadmap } from '@thearchitect/shared/src/types/roadmap.types';

// ─── Roadmap → Scenario Builder ───

function buildRoadmapScenario(roadmap: TransformationRoadmap): string {
  const lines: string[] = [];
  lines.push(`Evaluate this Transformation Roadmap: "${roadmap.name}" (v${roadmap.version})`);
  lines.push(`Total: €${(roadmap.summary.totalCost / 1000).toFixed(0)}K | ${roadmap.summary.totalDurationMonths} months | ${roadmap.summary.totalElements} elements | Risk reduction: ${roadmap.summary.riskReduction}%`);
  lines.push('');

  for (const wave of roadmap.waves) {
    lines.push(`Wave ${wave.waveNumber}: ${wave.name} (${wave.estimatedDurationMonths}mo, €${(wave.metrics.totalCost / 1000).toFixed(0)}K, risk delta: ${wave.metrics.riskDelta >= 0 ? '+' : ''}${wave.metrics.riskDelta.toFixed(1)})`);
    if (wave.dependsOnWaves.length > 0) {
      lines.push(`  Depends on: Wave ${wave.dependsOnWaves.join(', ')}`);
    }
    for (const el of wave.elements.slice(0, 8)) {
      const cost = el.estimatedCost > 0 ? ` €${(el.estimatedCost / 1000).toFixed(0)}K` : '';
      const risk = el.riskScore > 0 ? ` risk:${el.riskScore}` : '';
      lines.push(`  - ${el.name} [${el.layer}] ${el.currentStatus}→${el.targetStatus}${cost}${risk}`);
    }
    if (wave.elements.length > 8) {
      lines.push(`  ... +${wave.elements.length - 8} more elements`);
    }
    lines.push('');
  }

  lines.push('Assess feasibility, risks, dependencies, and stakeholder impact of this roadmap.');
  lines.push('Identify bottlenecks, missing prerequisites, and suggest optimizations.');

  return lines.join('\n');
}

function getTargetElementIds(roadmap: TransformationRoadmap): string[] {
  const ids = new Set<string>();
  for (const wave of roadmap.waves) {
    for (const el of wave.elements) {
      ids.add(el.elementId);
    }
  }
  return Array.from(ids);
}

// ─── Roadmap Import Button ───

function RoadmapImportButton({ onImport }: { onImport: (description: string, targetIds: string[]) => void }) {
  const projectId = useArchitectureStore((s) => s.projectId);
  const { activeRoadmap, roadmaps, loadList, loadRoadmap } = useRoadmapStore();
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load roadmap list when picker opens
  useEffect(() => {
    if (showPicker && projectId && roadmaps.length === 0) {
      loadList(projectId);
    }
  }, [showPicker, projectId, roadmaps.length, loadList]);

  const handleImportActive = () => {
    if (!activeRoadmap || activeRoadmap.status !== 'completed') return;
    const description = buildRoadmapScenario(activeRoadmap);
    const targetIds = getTargetElementIds(activeRoadmap);
    onImport(description, targetIds);
    setShowPicker(false);
    toast.success(`Roadmap imported: ${activeRoadmap.waves.length} waves, ${activeRoadmap.summary.totalElements} elements`);
  };

  const handleImportFromHistory = async (roadmapId: string) => {
    if (!projectId) return;
    setLoading(true);
    try {
      await loadRoadmap(projectId, roadmapId);
      // After loading, the activeRoadmap is set — use it
      const rm = useRoadmapStore.getState().activeRoadmap;
      if (!rm || rm.status !== 'completed') {
        toast.error('Roadmap not completed or could not be loaded');
        setLoading(false);
        return;
      }
      const description = buildRoadmapScenario(rm);
      const targetIds = getTargetElementIds(rm);
      onImport(description, targetIds);
      setShowPicker(false);
      toast.success(`Roadmap imported: ${rm.waves.length} waves, ${rm.summary.totalElements} elements`);
    } catch {
      toast.error('Failed to load roadmap');
    }
    setLoading(false);
  };

  // If there's an active completed roadmap, show quick-import button
  const hasActive = activeRoadmap && activeRoadmap.status === 'completed';

  return (
    <div className="space-y-1">
      {/* Quick import for active roadmap */}
      {hasActive && (
        <button
          onClick={handleImportActive}
          className="w-full flex items-center gap-2 px-3 py-2 rounded border border-[#6366f1]/40 bg-[#6366f1]/10 hover:bg-[#6366f1]/20 transition-colors text-left"
        >
          <FileDown size={14} className="text-[#6366f1] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-[#a5b4fc] truncate">Import from Roadmap</div>
            <div className="text-[10px] text-gray-400 truncate">
              {activeRoadmap.name} — {activeRoadmap.waves.length} waves, €{(activeRoadmap.summary.totalCost / 1000).toFixed(0)}K, {activeRoadmap.summary.totalDurationMonths}mo
            </div>
          </div>
        </button>
      )}

      {/* Browse all roadmaps */}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded border border-dashed border-[var(--border-subtle)] hover:border-[#6366f1]/40 text-xs text-gray-400 hover:text-[#a5b4fc] transition"
      >
        <History size={12} /> {showPicker ? 'Hide' : 'Browse'} Roadmap History
      </button>

      {/* Roadmap picker */}
      {showPicker && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden max-h-48 overflow-y-auto">
          {roadmaps.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-gray-500">No roadmaps generated yet. Generate one under Plan &gt; Roadmap.</div>
          )}
          {roadmaps.map((rm) => (
            <button
              key={rm.id}
              onClick={() => handleImportFromHistory(rm.id)}
              disabled={loading}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--surface-raised)] transition border-b border-[var(--border-subtle)] last:border-b-0 disabled:opacity-50"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">{rm.name}</div>
                <div className="text-[9px] text-gray-500">
                  v{rm.version} · {rm.waveCount} waves · €{(rm.totalCost / 1000).toFixed(0)}K · {rm.strategy}
                </div>
              </div>
              <FileDown size={12} className="text-[#6366f1] shrink-0 ml-2" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SCENARIO_TYPES: { value: ScenarioType; label: string; icon: typeof Brain }[] = [
  { value: 'cloud_migration', label: 'Cloud Migration', icon: Zap },
  { value: 'mna_integration', label: 'M&A Integration', icon: Users },
  { value: 'technology_refresh', label: 'Technology Refresh', icon: Activity },
  { value: 'cost_optimization', label: 'Cost Optimization', icon: DollarSign },
  { value: 'org_restructure', label: 'Org Restructure', icon: Users },
  { value: 'custom', label: 'Custom Scenario', icon: Brain },
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

type ViewMode = 'config' | 'running' | 'results' | 'emergence' | 'history' | 'comparison';

export default function SimulationPanel() {
  const projectId = useArchitectureStore((s) => s.projectId);
  const {
    isRunning, currentRound, currentAgent, streamingText,
    fatigueReport, fatigueTimeline, emergenceEvents, emergenceMetrics,
    liveFeed, runs, riskOverlay, costOverlay, showOverlay, activeRunId, activeRun,
    presetPersonas, customPersonas, comparisonData,
    showBubbles, discussionBubbles,
    startSimulation, cancelSimulation, loadRuns, selectRun, toggleOverlay, toggleBubbles, clearSimulation,
    loadPersonas, createCustomPersona, updateCustomPersona, deleteCustomPersona,
    selectForComparison, computeComparison, clearComparison,
  } = useSimulationStore();

  const [viewMode, setViewMode] = useState<ViewMode>('config');
  const [scenarioType, setScenarioType] = useState<ScenarioType>('cloud_migration');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [maxRounds, setMaxRounds] = useState(5);
  const [agents, setAgents] = useState<AgentPersona[]>([]);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [personasLoaded, setPersonasLoaded] = useState(false);
  const [targetElementIds, setTargetElementIds] = useState<string[]>([]);

  // Load personas on mount — set default agents from presets
  useEffect(() => {
    if (!projectId || personasLoaded) return;
    loadPersonas(projectId).then(() => setPersonasLoaded(true));
  }, [projectId, personasLoaded, loadPersonas]);

  // Load existing runs on mount — if there's a completed run, open History so
  // pre-seeded demo simulations are visible without requiring a live run.
  // The auto-switch fires exactly once; Config remains manually reachable after.
  const [runsLoadedOnce, setRunsLoadedOnce] = useState(false);
  const [autoSwitchedOnce, setAutoSwitchedOnce] = useState(false);
  useEffect(() => {
    if (!projectId || runsLoadedOnce) return;
    loadRuns(projectId).then(() => setRunsLoadedOnce(true));
  }, [projectId, runsLoadedOnce, loadRuns]);

  useEffect(() => {
    if (!runsLoadedOnce || autoSwitchedOnce || viewMode !== 'config') return;
    const hasCompleted = runs.some((r) => r.status === 'completed');
    setAutoSwitchedOnce(true);
    if (hasCompleted) setViewMode('history');
  }, [runsLoadedOnce, autoSwitchedOnce, runs, viewMode]);

  const latestCompletedRun = useMemo(() => {
    const completed = runs.filter((r) => r.status === 'completed');
    if (completed.length === 0) return null;
    return completed.reduce((latest, r) =>
      new Date(r.createdAt) > new Date(latest.createdAt) ? r : latest,
    );
  }, [runs]);

  // Set default agents once presets are loaded — prefer synced stakeholder personas.
  // Also swap preset-defaults for synced personas the moment they become available
  // (e.g. after the user clicks "Sync MiroFish Personas"), so the previously seeded
  // CTO/Business-Unit/IT-Ops fallbacks do not persist.
  const DEFAULT_PRESET_IDS = ['cto', 'business_unit_lead', 'it_operations_manager'];
  useEffect(() => {
    if (presetPersonas.length === 0) return;
    setAgents((prev) => {
      if (prev.length === 0) {
        return customPersonas.length > 0
          ? customPersonas.slice(0, 5)
          : presetPersonas.filter((p) => DEFAULT_PRESET_IDS.includes(p.id));
      }
      // If the current agents are only the seed-defaults and synced personas just
      // arrived, replace them with the user's stakeholders.
      const isAllSeedDefaults = prev.every((a) => DEFAULT_PRESET_IDS.includes(a.id));
      if (isAllSeedDefaults && customPersonas.length > 0) {
        return customPersonas.slice(0, 5);
      }
      return prev;
    });
  }, [presetPersonas, customPersonas]);

  const handleStart = async () => {
    if (!projectId || !scenarioDescription.trim()) return;
    setViewMode('running');
    await startSimulation(projectId, {
      scenarioType,
      scenarioDescription,
      maxRounds,
      targetElementIds,
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

  const handleCompare = async (runIdA: string, runIdB: string) => {
    if (!projectId) return;
    await selectForComparison(projectId, runIdA, 'A');
    await selectForComparison(projectId, runIdB, 'B');
    computeComparison();
    setViewMode('comparison');
  };

  if (!projectId) {
    return (
      <div className="p-4 text-sm text-gray-400">
        Open a project to run simulations.
      </div>
    );
  }

  const tabs: ViewMode[] = [
    'config', 'results',
    ...(activeRun ? ['emergence' as ViewMode] : []),
    'history',
    'comparison',
  ];

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border-subtle)] px-2">
        {tabs.map((mode) => (
          <button
            key={mode}
            onClick={() => mode === 'history' ? handleLoadHistory() : setViewMode(mode)}
            className={`px-3 py-2 text-xs font-medium capitalize ${
              viewMode === mode
                ? 'text-[#00ff41] border-b-2 border-[#00ff41]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {mode === 'comparison' ? 'Compare' : mode}
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
            setAgents={setAgents}
            expandedAgent={expandedAgent}
            setExpandedAgent={setExpandedAgent}
            onStart={handleStart}
            presetPersonas={presetPersonas}
            customPersonas={customPersonas}
            projectId={projectId}
            onCreatePersona={createCustomPersona}
            onUpdatePersona={updateCustomPersona}
            onDeletePersona={deleteCustomPersona}
            latestCompletedRun={latestCompletedRun}
            onViewPrecomputed={async () => {
              if (!latestCompletedRun) return;
              await selectRun(projectId, latestCompletedRun.id);
              setViewMode('results');
            }}
            onImportRoadmap={(desc, ids) => {
              setScenarioDescription(desc);
              setTargetElementIds(ids);
              setScenarioType('custom');
            }}
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
            activeRun={activeRun}
            fatigueReport={fatigueReport}
            emergenceMetrics={emergenceMetrics}
            emergenceEvents={emergenceEvents}
            riskOverlay={riskOverlay}
            costOverlay={costOverlay}
            showOverlay={showOverlay}
            onToggleOverlay={toggleOverlay}
            showBubbles={showBubbles}
            onToggleBubbles={toggleBubbles}
            bubbleCount={discussionBubbles.length}
            onNewRun={() => setViewMode('config')}
            projectId={projectId}
            runId={activeRunId}
          />
        )}

        {viewMode === 'emergence' && <EmergenceDashboard />}

        {viewMode === 'history' && (
          <HistoryView
            runs={runs}
            projectId={projectId}
            onSelect={(runId) => {
              selectRun(projectId, runId);
              setViewMode('results');
            }}
            onCompare={handleCompare}
          />
        )}

        {viewMode === 'comparison' && comparisonData && (
          <RunComparison
            data={comparisonData}
            onClear={() => { clearComparison(); setViewMode('history'); }}
          />
        )}

        {viewMode === 'comparison' && !comparisonData && (
          <ComparisonEmptyState
            completedRunCount={runs.filter((r) => r.status === 'completed').length}
            onOpenHistory={handleLoadHistory}
          />
        )}
      </div>
    </div>
  );
}

// ─── Config View ───

function ConfigView({
  scenarioType, setScenarioType, scenarioDescription, setScenarioDescription,
  maxRounds, setMaxRounds, agents, setAgents, expandedAgent, setExpandedAgent, onStart,
  presetPersonas, customPersonas, projectId, onCreatePersona, onUpdatePersona, onDeletePersona,
  onImportRoadmap, latestCompletedRun, onViewPrecomputed,
}: {
  scenarioType: ScenarioType;
  setScenarioType: (v: ScenarioType) => void;
  scenarioDescription: string;
  setScenarioDescription: (v: string) => void;
  maxRounds: number;
  setMaxRounds: (v: number) => void;
  agents: AgentPersona[];
  setAgents: (v: AgentPersona[]) => void;
  expandedAgent: string | null;
  setExpandedAgent: (v: string | null) => void;
  onStart: () => void;
  presetPersonas: AgentPersona[];
  customPersonas: AgentPersona[];
  projectId: string;
  onCreatePersona: (projectId: string, input: Record<string, unknown>) => Promise<void>;
  onUpdatePersona: (projectId: string, personaId: string, input: Record<string, unknown>) => Promise<void>;
  onDeletePersona: (projectId: string, personaId: string) => Promise<void>;
  onImportRoadmap: (description: string, targetIds: string[]) => void;
  latestCompletedRun: SimulationRunSummary | null;
  onViewPrecomputed: () => void;
}) {
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBase, setEditorBase] = useState<AgentPersona | null>(null);
  const [editorIsEditing, setEditorIsEditing] = useState(false);

  const allPersonas = [...presetPersonas, ...customPersonas];
  const availablePersonas = allPersonas.filter((p) => !agents.some((a) => a.id === p.id));

  const handleClone = (persona: AgentPersona) => {
    setEditorBase(persona);
    setEditorIsEditing(false);
    setEditorOpen(true);
  };

  const handleEdit = (persona: AgentPersona) => {
    setEditorBase(persona);
    setEditorIsEditing(true);
    setEditorOpen(true);
  };

  const handleDeleteCustom = async (persona: AgentPersona) => {
    const customId = persona.id.replace('custom_', '');
    try {
      await onDeletePersona(projectId, customId);
      setAgents(agents.filter((a) => a.id !== persona.id));
      toast.success('Persona deleted');
    } catch {
      toast.error('Failed to delete persona');
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 text-[#00ff41]">
        <Brain size={16} />
        <span className="font-semibold">MiroFish Simulation</span>
      </div>

      {latestCompletedRun && (
        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 flex items-center gap-3">
          <Activity size={16} className="text-cyan-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-cyan-200 truncate">
              Pre-computed simulation ready: {latestCompletedRun.name}
            </p>
            <p className="text-[10px] text-cyan-400/80">
              {latestCompletedRun.totalRounds} rounds · {latestCompletedRun.outcome || 'completed'}
              {latestCompletedRun.fatigueRating && ` · fatigue ${latestCompletedRun.fatigueRating}`}
            </p>
          </div>
          <button
            onClick={onViewPrecomputed}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded border border-cyan-400/50 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 transition-colors"
          >
            View Results →
          </button>
        </div>
      )}

      {/* Import from Roadmap */}
      <RoadmapImportButton onImport={onImportRoadmap} />

      {/* Scenario Type */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Scenario</label>
        <select
          value={scenarioType}
          onChange={(e) => setScenarioType(e.target.value as ScenarioType)}
          className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs"
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
          className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1.5 text-xs h-20 resize-none"
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
          className="w-full accent-[#00ff41]"
        />
      </div>

      {/* Selected Agents */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-400">
            Stakeholder Agents ({agents.length})
          </label>
          <button
            onClick={() => setShowPersonaPicker(!showPersonaPicker)}
            className="flex items-center gap-1 text-xs text-[#00ff41] hover:text-[#33ff66] transition-colors"
          >
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="space-y-1">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded">
              <div className="flex items-center justify-between px-2 py-1.5">
                <button
                  onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                  className="flex items-center gap-2 text-xs flex-1 text-left"
                >
                  <Shield size={12} className={agent.id.startsWith('custom_') ? 'text-cyan-400' : 'text-[#00ff41]'} />
                  <span>{agent.name}</span>
                  {agent.id.startsWith('custom_') && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400">custom</span>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleClone(agent)}
                    className="p-1 text-gray-500 hover:text-[#00ff41] transition-colors"
                    title="Clone & Customize"
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    onClick={() => setAgents(agents.filter((a) => a.id !== agent.id))}
                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
              {expandedAgent === agent.id && (
                <div className="px-2 pb-2 text-xs text-gray-400 space-y-1 border-t border-[var(--border-subtle)]">
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

      {/* Persona Picker (expandable) */}
      {showPersonaPicker && (
        <div className="bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded p-2 space-y-2">
          <div className="text-xs text-gray-400 font-medium">Available Personas</div>

          {/* Presets */}
          {presetPersonas.filter((p) => !agents.some((a) => a.id === p.id)).length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Presets</div>
              {presetPersonas.filter((p) => !agents.some((a) => a.id === p.id)).map((persona) => (
                <div key={persona.id} className="flex items-center justify-between px-2 py-1 text-xs hover:bg-[var(--surface-raised)] rounded">
                  <span className="text-gray-300">{persona.name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setAgents([...agents, persona]); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[#00ff41]/10 text-[#00ff41] hover:bg-[#00ff41]/20"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => handleClone(persona)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-gray-400 hover:text-[#00ff41]"
                    >
                      Clone
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Custom Personas */}
          {customPersonas.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Custom</div>
              {customPersonas.map((persona) => (
                <div key={persona.id} className="flex items-center justify-between px-2 py-1 text-xs hover:bg-[var(--surface-raised)] rounded">
                  <span className="text-gray-300">{persona.name}</span>
                  <div className="flex gap-1">
                    {!agents.some((a) => a.id === persona.id) && (
                      <button
                        onClick={() => { setAgents([...agents, persona]); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                      >
                        Add
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(persona)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-gray-400 hover:text-cyan-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCustom(persona)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-gray-400 hover:text-red-400"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {availablePersonas.length === 0 && (
            <div className="text-xs text-gray-500 text-center py-2">All personas already added</div>
          )}
        </div>
      )}

      {/* Start Button */}
      <button
        onClick={onStart}
        disabled={!scenarioDescription.trim() || agents.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-[#00ff41] hover:bg-[#00cc33] disabled:opacity-40 text-black px-3 py-2 rounded text-xs font-medium transition-colors"
      >
        <Play size={14} />
        Run Simulation
      </button>

      {/* PersonaEditor Modal */}
      {editorOpen && editorBase && (
        <PersonaEditor
          isOpen={editorOpen}
          onClose={() => setEditorOpen(false)}
          basePersona={editorBase}
          isEditing={editorIsEditing}
          onSave={async (data) => {
            if (editorIsEditing && editorBase.id.startsWith('custom_')) {
              const customId = editorBase.id.replace('custom_', '');
              await onUpdatePersona(projectId, customId, data);
            } else {
              await onCreatePersona(projectId, data);
            }
          }}
        />
      )}
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

      <div className="w-full bg-[var(--surface-raised)] rounded-full h-1.5">
        <div
          className="bg-[#00ff41] h-1.5 rounded-full transition-all"
          style={{ width: `${((currentRound + 1) / maxRounds) * 100}%` }}
        />
      </div>

      {/* Current Agent */}
      {currentAgent && (
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse" />
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
        <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded p-2 text-xs text-gray-300 max-h-32 overflow-y-auto">
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
  activeRun, fatigueReport, emergenceMetrics, emergenceEvents,
  riskOverlay, costOverlay, showOverlay, onToggleOverlay,
  showBubbles, onToggleBubbles, bubbleCount,
  onNewRun, projectId, runId,
}: {
  activeRun: any;
  fatigueReport: any;
  emergenceMetrics: any;
  emergenceEvents: any[];
  riskOverlay: Map<string, number>;
  costOverlay: Map<string, number>;
  showOverlay: boolean;
  onToggleOverlay: () => void;
  showBubbles: boolean;
  onToggleBubbles: () => void;
  bubbleCount: number;
  onNewRun: () => void;
  projectId: string | null;
  runId: string | null;
}) {
  const [exportLoading, setExportLoading] = useState(false);
  const elements = useArchitectureStore((s) => s.elements);

  const scope = useMemo(() => {
    const targetIds: string[] = activeRun?.config?.targetElementIds ?? [];
    if (targetIds.length === 0) return null;
    const targetElements = elements.filter((el) => targetIds.includes(el.id));
    const countBy = (arr: typeof elements) => {
      const d = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const el of arr) {
        const level = (el.riskLevel as keyof typeof d) ?? 'low';
        if (level in d) d[level] += 1;
        else d.low += 1;
      }
      return d;
    };
    return {
      count: targetElements.length,
      total: elements.length,
      scenario: activeRun?.config?.scenarioType?.replace(/_/g, ' ') ?? 'scenario',
      dist: countBy(targetElements),
      portfolio: countBy(elements),
    };
  }, [activeRun, elements]);

  const handleExportPDF = async () => {
    if (!projectId || !runId) return;
    setExportLoading(true);
    try {
      const { data } = await reportAPI.downloadSimulation(projectId, runId);
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TheArchitect-simulation-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Simulation report downloaded');
    } catch (err) {
      if (import.meta.env.DEV) console.error('[SimulationPanel] Failed to export PDF:', err);
      toast.error('Failed to export simulation report');
    } finally {
      setExportLoading(false);
    }
  };
  if (!fatigueReport) {
    return (
      <div className="text-xs text-gray-400 p-4 text-center">
        No simulation results yet. Run a simulation first.
      </div>
    );
  }

  return (
    <>
      {/* Simulation Scope Badge — reconciles scoped risks with portfolio-wide Dashboard */}
      {scope && (
        <div className="p-2 rounded-lg border border-[#7c3aed]/30 bg-[#7c3aed]/5 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] font-medium capitalize">
              Scope: {scope.count} of {scope.total} elements · {scope.scenario}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">Wave 1</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[var(--text-tertiary)] uppercase tracking-wider">Targets:</span>
            {scope.dist.critical > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                <span className="text-[#ef4444]">{scope.dist.critical} critical</span>
              </span>
            )}
            {scope.dist.high > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f97316]" />
                <span className="text-[#f97316]">{scope.dist.high} high</span>
              </span>
            )}
            {scope.dist.medium > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#eab308]" />
                <span className="text-[#eab308]">{scope.dist.medium} medium</span>
              </span>
            )}
            {scope.dist.low > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                <span className="text-[#22c55e]">{scope.dist.low} low</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] pt-1 border-t border-[#7c3aed]/20">
            <span className="text-[var(--text-tertiary)] uppercase tracking-wider">Portfolio:</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
              <span className="text-[var(--text-secondary)]">{scope.portfolio.critical} critical</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f97316]" />
              <span className="text-[var(--text-secondary)]">{scope.portfolio.high} high</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#eab308]" />
              <span className="text-[var(--text-secondary)]">{scope.portfolio.medium} medium</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
              <span className="text-[var(--text-secondary)]">{scope.portfolio.low} low</span>
            </span>
          </div>
        </div>
      )}

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
        <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded p-2 text-xs text-gray-300">
          <div className="text-xs text-gray-400 mb-1 font-medium">Recommendation</div>
          {fatigueReport.recommendation}
        </div>
      )}

      {/* Per-Agent Fatigue */}
      <div>
        <div className="text-xs text-gray-400 mb-1 font-medium">Stakeholder Fatigue</div>
        <div className="space-y-1.5">
          {fatigueReport.perAgent?.map((agent: any) => (
            <div key={agent.agentId} className="bg-[var(--surface-raised)] rounded p-2">
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
              <div key={el.elementId} className="bg-[var(--surface-raised)] rounded px-2 py-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-300 truncate">{el.elementName}</span>
                  <span className="text-orange-400 ml-2">
                    +{el.projectedDelayMonths.toFixed(0)}mo
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 truncate" title={el.involvedAgents.join(', ')}>
                  {el.conflictRounds} conflict rounds — {el.involvedAgents.slice(0, 3).join(', ')}{el.involvedAgents.length > 3 ? ` +${el.involvedAgents.length - 3} more` : ''}
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

      {/* Overlay Toggle + Bubbles Toggle + New Run */}
      <div className="flex gap-2">
        <button
          onClick={onToggleOverlay}
          className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
            showOverlay
              ? 'bg-[#00ff41]/20 border-[#00ff41] text-[#00ff41]'
              : 'bg-[var(--surface-raised)] border-[var(--border-subtle)] text-gray-400 hover:text-gray-200'
          }`}
        >
          <BarChart3 size={12} className="inline mr-1" />
          {showOverlay ? 'Hide' : 'Show'} Overlay
        </button>
        {bubbleCount > 0 && (
          <button
            onClick={onToggleBubbles}
            title={`${showBubbles ? 'Hide' : 'Show'} discussion bubbles in 3D (${bubbleCount})`}
            className={`text-xs px-2 py-1.5 rounded border transition-colors ${
              showBubbles
                ? 'bg-[#06b6d4]/20 border-[#06b6d4] text-[#06b6d4]'
                : 'bg-[var(--surface-raised)] border-[var(--border-subtle)] text-gray-400 hover:text-gray-200'
            }`}
          >
            <MessageCircle size={12} className="inline mr-1" />
            {bubbleCount}
          </button>
        )}
        <button
          onClick={handleExportPDF}
          disabled={exportLoading || !projectId || !runId}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
        >
          {exportLoading ? <Loader2 size={12} className="inline mr-1 animate-spin" /> : <Download size={12} className="inline mr-1" />}
          Export PDF
        </button>
        <button
          onClick={onNewRun}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Play size={12} className="inline mr-1" />
          New Run
        </button>
      </div>
    </>
  );
}

// ─── History View ───

function HistoryView({ runs, projectId, onSelect, onCompare }: {
  runs: any[];
  projectId: string;
  onSelect: (runId: string) => void;
  onCompare: (runIdA: string, runIdB: string) => void;
}) {
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const completedRuns = runs.filter((r) => r.status === 'completed');

  const toggleSelection = (runId: string) => {
    setSelectedIds((prev) =>
      prev.includes(runId) ? prev.filter((id) => id !== runId) : prev.length < 2 ? [...prev, runId] : prev,
    );
  };

  if (runs.length === 0) {
    return (
      <div className="text-xs text-gray-400 p-4 text-center">
        <History size={20} className="mx-auto mb-2 opacity-50" />
        No simulation runs yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Compare toggle */}
      {completedRuns.length >= 2 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setCompareMode(!compareMode); setSelectedIds([]); }}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
              compareMode
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <GitCompareArrows size={12} />
            {compareMode ? 'Cancel Compare' : 'Compare Runs'}
          </button>
          {compareMode && selectedIds.length === 2 && (
            <button
              onClick={() => onCompare(selectedIds[0], selectedIds[1])}
              className="text-xs px-3 py-1 rounded bg-[#00ff41] text-black font-medium hover:bg-[#00cc33] transition-colors"
            >
              Compare Selected
            </button>
          )}
        </div>
      )}

      {compareMode && (
        <div className="text-[10px] text-gray-500">
          Select 2 completed runs to compare ({selectedIds.length}/2 selected)
        </div>
      )}

      {/* Run list */}
      <div className="space-y-1.5">
        {runs.map((run) => (
          <div key={run.id} className="relative">
            {compareMode ? (
              <button
                onClick={() => run.status === 'completed' && toggleSelection(run.id)}
                disabled={run.status !== 'completed'}
                className={`w-full bg-[var(--surface-raised)] border rounded p-2 text-left transition-colors ${
                  selectedIds.includes(run.id)
                    ? 'border-cyan-500/60 bg-cyan-500/5'
                    : run.status === 'completed'
                    ? 'border-[var(--border-subtle)] hover:border-cyan-500/30'
                    : 'border-[var(--border-subtle)] opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                    selectedIds.includes(run.id)
                      ? 'border-cyan-500 bg-cyan-500/20'
                      : 'border-[var(--border-subtle)]'
                  }`}>
                    {selectedIds.includes(run.id) && (
                      <div className="w-2 h-2 rounded-sm bg-cyan-400" />
                    )}
                  </div>
                  <span className="text-gray-300 truncate flex-1">{run.name}</span>
                  {run.fatigueRating && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: FATIGUE_COLORS[run.fatigueRating as FatigueRating] }}
                    />
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 ml-6">
                  {run.scenarioType.replace('_', ' ')} — {run.totalRounds} rounds — {run.outcome || run.status}
                </div>
              </button>
            ) : (
              <button
                onClick={() => onSelect(run.id)}
                className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded p-2 text-left hover:border-[#00ff41]/50 transition-colors"
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
            )}
          </div>
        ))}
      </div>
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
      <div className="flex-1 bg-[var(--surface-base)] rounded-full h-1">
        <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-gray-500 w-7 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--surface-base)] rounded p-1.5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-xs text-gray-200 font-medium">{value}</div>
    </div>
  );
}

function ComparisonEmptyState({
  completedRunCount,
  onOpenHistory,
}: {
  completedRunCount: number;
  onOpenHistory: () => void;
}) {
  const ready = completedRunCount >= 2;
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 gap-3">
      <GitCompareArrows size={28} className="text-gray-500 opacity-60" />
      <h3 className="text-sm font-medium text-gray-200">Compare Simulation Runs</h3>
      <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
        {ready
          ? 'Open History, toggle Compare Runs, pick any two completed runs, then tap Compare Selected.'
          : `You need at least 2 completed runs to compare. You have ${completedRunCount}.`}
      </p>
      <button
        onClick={onOpenHistory}
        disabled={!ready}
        className="mt-1 text-xs px-3 py-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Open History
      </button>
    </div>
  );
}
