import { useState, useEffect } from 'react';
import {
  Map, Loader2, AlertTriangle, DollarSign, Clock, TrendingDown,
  Shield, Download, RefreshCw, ChevronDown, Trash2, Layers,
} from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { useUIStore } from '../../stores/uiStore';
import { roadmapAPI } from '../../services/api';
import type { RoadmapStrategy } from '@thearchitect/shared';
import { flyToElement } from '../3d/CameraControls';
import RoadmapTimeline from './RoadmapTimeline';
import WaveCard from './WaveCard';
import MigrationCandidates from './MigrationCandidates';

const STRATEGY_INFO: Record<RoadmapStrategy, { label: string; color: string; desc: string }> = {
  conservative: { label: 'Conservative', color: '#06b6d4', desc: 'Low-risk first, stabilize then transform' },
  balanced: { label: 'Balanced', color: '#00ff41', desc: 'Optimize for ROI (cost × risk)' },
  aggressive: { label: 'Aggressive', color: '#f97316', desc: 'Tackle highest risks immediately' },
};

function formatCost(n: number) {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

function PlateauViewToggle() {
  const viewMode = useUIStore((s) => s.viewMode);
  const isPlateauActive = useRoadmapStore((s) => s.isPlateauViewActive);
  const activatePlateauView = useRoadmapStore((s) => s.activatePlateauView);
  const deactivatePlateauView = useRoadmapStore((s) => s.deactivatePlateauView);
  const elements = useArchitectureStore((s) => s.elements);
  const is3D = viewMode === '3d';

  const handleToggle = () => {
    if (isPlateauActive) {
      deactivatePlateauView();
    } else {
      activatePlateauView(elements);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={!is3D}
      className={`w-full flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition ${
        isPlateauActive
          ? 'bg-[#00ff41] text-black hover:bg-[#00cc33]'
          : is3D
            ? 'bg-[#111111] border border-[#1a2a1a] text-[#7a8a7a] hover:text-white hover:border-[#00ff41]'
            : 'bg-[#111111] border border-[#1a2a1a] text-[#3a4a3a] cursor-not-allowed'
      }`}
      title={!is3D ? 'Switch to 3D view to use Plateau View' : isPlateauActive ? 'Exit Plateau View' : 'Compare architecture across transformation plateaus'}
    >
      <Layers size={14} />
      {isPlateauActive ? 'Exit Plateau View' : 'Plateau View'}
    </button>
  );
}

export default function RoadmapPanel() {
  const projectId = useArchitectureStore((s) => s.projectId);
  const {
    roadmaps, activeRoadmap, isGenerating, isLoading, error,
    selectedWave, generate, loadList, loadRoadmap, deleteRoadmap, selectWave,
    loadCandidates, selectedCandidates, candidatesLoaded,
  } = useRoadmapStore();

  // Config state
  const [strategy, setStrategy] = useState<RoadmapStrategy>('balanced');
  const [maxWaves, setMaxWaves] = useState(4);
  const [includeAI, setIncludeAI] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load list + candidates on mount
  useEffect(() => {
    if (projectId) {
      loadList(projectId);
      loadCandidates(projectId);
    }
  }, [projectId, loadList, loadCandidates]);

  const handleGenerate = () => {
    if (!projectId) return;
    generate(projectId, { strategy, maxWaves, includeAIRecommendations: includeAI });
  };

  const handleDelete = async (roadmapId: string) => {
    if (!projectId) return;
    await deleteRoadmap(projectId, roadmapId);
  };

  const handleLoadRoadmap = (roadmapId: string) => {
    if (!projectId) return;
    loadRoadmap(projectId, roadmapId);
  };

  const handleDownloadPDF = async () => {
    if (!projectId || !activeRoadmap) return;
    try {
      const { data } = await roadmapAPI.downloadPDF(projectId, activeRoadmap.id);
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roadmap-${activeRoadmap.name || 'export'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail
    }
  };

  const elements = useArchitectureStore((s) => s.elements);

  const handleElementClick = (elementId: string) => {
    const el = elements.find((e) => e.id === elementId);
    if (el?.position3D) {
      flyToElement(el.position3D, el.id);
    }
  };

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4a5a4a] text-xs p-4">
        <Map size={24} className="mb-2" />
        <p>Select a project to generate a transformation roadmap.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-2 rounded bg-[#2a1a1a] border border-[#3a1a1a] text-[11px] text-red-400">
            <AlertTriangle size={12} /> {error}
          </div>
        )}

        {/* Config Form — always visible when no active roadmap */}
        {!activeRoadmap && !isGenerating && (
          <div className="space-y-3">
            <div className="text-xs font-medium text-white">Generate Roadmap</div>

            {/* Strategy Selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[#7a8a7a] uppercase tracking-wider">Strategy</label>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(STRATEGY_INFO) as RoadmapStrategy[]).map((s) => {
                  const info = STRATEGY_INFO[s];
                  const isActive = strategy === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStrategy(s)}
                      className={`px-2 py-1.5 rounded text-[10px] font-medium transition border ${
                        isActive
                          ? 'text-white border-current'
                          : 'text-[#4a5a4a] border-[#1a2a1a] hover:text-[#7a8a7a]'
                      }`}
                      style={isActive ? { borderColor: info.color, color: info.color } : undefined}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] text-[#4a5a4a]">{STRATEGY_INFO[strategy].desc}</p>
            </div>

            {/* Migration Scope (TOGAF Gap Analysis) */}
            <MigrationCandidates />

            {/* Max Waves */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[#7a8a7a] uppercase tracking-wider">Max Waves</label>
                <span className="text-[10px] text-[#00ff41] font-mono">{maxWaves}</span>
              </div>
              <input
                type="range"
                min={2}
                max={8}
                value={maxWaves}
                onChange={(e) => setMaxWaves(Number(e.target.value))}
                className="w-full accent-[#00ff41] h-1"
              />
              <div className="flex justify-between text-[9px] text-[#4a5a4a]">
                <span>2</span><span>8</span>
              </div>
            </div>

            {/* AI Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAI}
                onChange={(e) => setIncludeAI(e.target.checked)}
                className="accent-[#00ff41]"
              />
              <span className="text-[10px] text-[#7a8a7a]">AI Recommendations</span>
            </label>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              className="w-full py-2 rounded bg-[#00ff41] text-black text-xs font-bold hover:bg-[#00cc33] transition"
            >
              {selectedCandidates.size > 0
                ? `Generate Roadmap (${selectedCandidates.size} elements)`
                : 'Generate Roadmap'
              }
            </button>
          </div>
        )}

        {/* Generating State */}
        {isGenerating && (
          <div className="flex flex-col items-center justify-center py-8 text-[#00ff41]">
            <Loader2 size={24} className="animate-spin mb-2" />
            <p className="text-xs">Generating roadmap...</p>
            <p className="text-[9px] text-[#4a5a4a] mt-1">Analyzing dependencies, risks, and costs</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !isGenerating && (
          <div className="flex items-center justify-center py-8 text-[#4a5a4a]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {/* Active Roadmap */}
        {activeRoadmap && !isGenerating && !isLoading && (
          <>
            {/* Header + Actions */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-white">{activeRoadmap.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      color: STRATEGY_INFO[activeRoadmap.config.strategy]?.color || '#7a8a7a',
                      backgroundColor: `${STRATEGY_INFO[activeRoadmap.config.strategy]?.color || '#7a8a7a'}15`,
                    }}
                  >
                    {activeRoadmap.config.strategy}
                  </span>
                  <span className="text-[9px] text-[#4a5a4a]">v{activeRoadmap.version}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDownloadPDF}
                  className="p-1 rounded hover:bg-[#1a2a1a] text-[#4a5a4a] hover:text-[#00ff41] transition"
                  title="Download PDF"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => {
                    if (projectId && activeRoadmap) {
                      generate(projectId, {
                        strategy: activeRoadmap.config.strategy,
                        maxWaves: activeRoadmap.config.maxWaves,
                        includeAIRecommendations: activeRoadmap.config.includeAIRecommendations,
                      });
                    }
                  }}
                  className="p-1 rounded hover:bg-[#1a2a1a] text-[#4a5a4a] hover:text-[#00ff41] transition"
                  title="Regenerate"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Summary Metrics */}
            {activeRoadmap.summary && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 rounded bg-[#111111] border border-[#1a2a1a]">
                  <DollarSign size={14} className="text-[#f59e0b]" />
                  <div>
                    <div className="text-[11px] font-medium text-white">
                      {formatCost(activeRoadmap.summary.costConfidence?.p50 || activeRoadmap.summary.totalCost)}
                    </div>
                    <div className="text-[9px] text-[#4a5a4a]">
                      Cost (P50)
                      {activeRoadmap.summary.costConfidence && (
                        <span className="ml-1">
                          [{formatCost(activeRoadmap.summary.costConfidence.p10)}-{formatCost(activeRoadmap.summary.costConfidence.p90)}]
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-[#111111] border border-[#1a2a1a]">
                  <Clock size={14} className="text-[#3b82f6]" />
                  <div>
                    <div className="text-[11px] font-medium text-white">{activeRoadmap.summary.totalDurationMonths} months</div>
                    <div className="text-[9px] text-[#4a5a4a]">Duration</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-[#111111] border border-[#1a2a1a]">
                  <TrendingDown size={14} className="text-[#22c55e]" />
                  <div>
                    <div className="text-[11px] font-medium text-white">-{activeRoadmap.summary.riskReduction}%</div>
                    <div className="text-[9px] text-[#4a5a4a]">Risk Reduction</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-[#111111] border border-[#1a2a1a]">
                  <Shield size={14} className="text-[#a855f7]" />
                  <div>
                    <div className="text-[11px] font-medium text-white">{activeRoadmap.summary.complianceImprovement}</div>
                    <div className="text-[9px] text-[#4a5a4a]">Violations Fixed</div>
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            {activeRoadmap.waves && activeRoadmap.waves.length > 0 && (
              <RoadmapTimeline
                waves={activeRoadmap.waves}
                selectedWave={selectedWave}
                onSelectWave={selectWave}
              />
            )}

            {/* Plateau View Toggle */}
            {activeRoadmap.status === 'completed' && activeRoadmap.waves.length > 0 && (
              <PlateauViewToggle />
            )}

            {/* Wave Cards */}
            {activeRoadmap.waves && activeRoadmap.waves.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-medium text-[#7a8a7a] uppercase tracking-wider px-1">
                  Waves ({activeRoadmap.waves.length})
                </div>
                {activeRoadmap.waves.map((wave) => (
                  <WaveCard
                    key={wave.waveNumber}
                    wave={wave}
                    isSelected={selectedWave === wave.waveNumber}
                    onSelect={() => selectWave(selectedWave === wave.waveNumber ? null : wave.waveNumber)}
                    onElementClick={handleElementClick}
                  />
                ))}
              </div>
            )}

            {/* Empty waves */}
            {activeRoadmap.waves && activeRoadmap.waves.length === 0 && (
              <div className="flex flex-col items-center py-6 text-[#4a5a4a] text-[11px]">
                <Map size={20} className="mb-2" />
                <p>No migration candidates found.</p>
                <p className="text-[9px] mt-1">Add elements with transitional or retired status to generate waves.</p>
              </div>
            )}

            {/* Back to config */}
            <button
              onClick={() => useRoadmapStore.setState({ activeRoadmap: null, selectedWave: null })}
              className="w-full py-1.5 rounded border border-[#1a2a1a] text-[10px] text-[#7a8a7a] hover:text-white hover:border-[#2a3a2a] transition"
            >
              New Roadmap
            </button>
          </>
        )}

        {/* History */}
        {roadmaps.length > 0 && !isGenerating && (
          <div className="space-y-1">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-[10px] text-[#4a5a4a] hover:text-[#7a8a7a] transition"
            >
              <ChevronDown size={10} className={`transition ${showHistory ? '' : '-rotate-90'}`} />
              History ({roadmaps.length})
            </button>
            {showHistory && (
              <div className="space-y-1">
                {roadmaps.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-[10px] cursor-pointer transition ${
                      activeRoadmap?.id === r.id
                        ? 'bg-[#0a1a0a] border border-[#00ff41] text-white'
                        : 'bg-[#111111] border border-[#1a2a1a] text-[#7a8a7a] hover:border-[#2a3a2a]'
                    }`}
                  >
                    <button
                      onClick={() => handleLoadRoadmap(r.id)}
                      className="flex-1 text-left truncate"
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-2 text-[#4a5a4a]">v{r.version}</span>
                      <span className="ml-2 text-[#4a5a4a]">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                      className="p-0.5 rounded hover:bg-[#2a1a1a] text-[#4a5a4a] hover:text-red-400 transition"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
