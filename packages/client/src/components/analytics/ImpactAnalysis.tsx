import { useState } from 'react';
import { Zap, ArrowRight, AlertTriangle } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

interface ImpactResult {
  elementId: string;
  name: string;
  type: string;
  layer: string;
  distance: number;
  impactScore: number;
  relationshipPath: string[];
}

export default function ImpactAnalysis() {
  const elements = useArchitectureStore((s) => s.elements);
  const selectedId = useArchitectureStore((s) => s.selectedElementId);
  const connections = useArchitectureStore((s) => s.connections);
  const [analysisResult, setAnalysisResult] = useState<{
    direct: ImpactResult[];
    transitive: ImpactResult[];
  } | null>(null);

  const selectedElement = elements.find((e) => e.id === selectedId);

  const runLocalAnalysis = () => {
    if (!selectedId) return;

    // Client-side impact analysis using the store data
    const visited = new Set<string>();
    const direct: ImpactResult[] = [];
    const transitive: ImpactResult[] = [];

    // Find direct connections
    const directConns = connections.filter((c) => c.sourceId === selectedId);
    for (const conn of directConns) {
      const target = elements.find((e) => e.id === conn.targetId);
      if (!target || visited.has(target.id)) continue;
      visited.add(target.id);
      direct.push({
        elementId: target.id,
        name: target.name,
        type: target.type,
        layer: target.layer,
        distance: 1,
        impactScore: scoreElement(target),
        relationshipPath: [conn.type],
      });
    }

    // BFS for transitive
    let frontier = direct.map((d) => d.elementId);
    let depth = 2;
    while (frontier.length > 0 && depth <= 5) {
      const nextFrontier: string[] = [];
      for (const fId of frontier) {
        const conns = connections.filter((c) => c.sourceId === fId);
        for (const conn of conns) {
          const target = elements.find((e) => e.id === conn.targetId);
          if (!target || visited.has(target.id)) continue;
          visited.add(target.id);
          nextFrontier.push(target.id);
          transitive.push({
            elementId: target.id,
            name: target.name,
            type: target.type,
            layer: target.layer,
            distance: depth,
            impactScore: scoreElement(target) / depth,
            relationshipPath: [conn.type],
          });
        }
      }
      frontier = nextFrontier;
      depth++;
    }

    setAnalysisResult({ direct, transitive });
  };

  const scoreElement = (el: { riskLevel: string; maturityLevel: number }): number => {
    const riskScores: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };
    return ((riskScores[el.riskLevel] || 2) + (5 - el.maturityLevel)) / 2;
  };

  const getScoreColor = (score: number) => {
    if (score >= 7) return '#ef4444';
    if (score >= 5) return '#f97316';
    if (score >= 3) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Zap size={14} className="text-[#f97316]" />
          Impact Analysis
        </h3>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Analyze cascading effects of element changes</p>
      </div>

      {/* Selected element */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        {selectedElement ? (
          <div className="rounded-md border border-[#00ff41]/30 bg-[#00ff41]/10 p-2">
            <span className="text-xs text-white font-medium">{selectedElement.name}</span>
            <span className="text-[9px] text-[var(--text-secondary)] ml-2">{selectedElement.type}</span>
          </div>
        ) : (
          <p className="text-[10px] text-[var(--text-tertiary)]">Select an element to analyze its impact</p>
        )}

        <button
          onClick={runLocalAnalysis}
          disabled={!selectedId}
          className="mt-2 w-full rounded-md bg-[#f97316] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#ea580c] disabled:opacity-30 transition"
        >
          Run Impact Analysis
        </button>
      </div>

      {/* Results */}
      {analysisResult && (
        <div className="p-3 space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 text-center">
              <div className="text-sm font-bold text-white">{analysisResult.direct.length}</div>
              <div className="text-[9px] text-[var(--text-tertiary)]">Direct</div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 text-center">
              <div className="text-sm font-bold text-white">{analysisResult.transitive.length}</div>
              <div className="text-[9px] text-[var(--text-tertiary)]">Transitive</div>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 text-center">
              <div className="text-sm font-bold text-[#f97316]">
                {analysisResult.direct.length + analysisResult.transitive.length}
              </div>
              <div className="text-[9px] text-[var(--text-tertiary)]">Total</div>
            </div>
          </div>

          {/* Direct impact */}
          {analysisResult.direct.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1">
                <AlertTriangle size={10} /> Direct Impact
              </h4>
              {analysisResult.direct.map((item) => (
                <ImpactRow key={item.elementId} item={item} getScoreColor={getScoreColor} />
              ))}
            </div>
          )}

          {/* Transitive impact */}
          {analysisResult.transitive.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1">
                <ArrowRight size={10} /> Cascading Impact
              </h4>
              {analysisResult.transitive.slice(0, 10).map((item) => (
                <ImpactRow key={item.elementId} item={item} getScoreColor={getScoreColor} />
              ))}
              {analysisResult.transitive.length > 10 && (
                <p className="text-[9px] text-[var(--text-disabled)] mt-1">
                  +{analysisResult.transitive.length - 10} more elements affected
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!analysisResult && !selectedId && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-[var(--text-tertiary)] text-center">
            Select an element in the 3D view, then run impact analysis
          </p>
        </div>
      )}
    </div>
  );
}

function ImpactRow({ item, getScoreColor }: { item: ImpactResult; getScoreColor: (s: number) => string }) {
  return (
    <div className="flex items-center gap-2 py-1 px-1 rounded hover:bg-[var(--surface-raised)]">
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: getScoreColor(item.impactScore) }}
      />
      <span className="text-[10px] text-white flex-1 truncate">{item.name}</span>
      <span className="text-[9px] text-[var(--text-disabled)] capitalize">{item.layer}</span>
      <span
        className="text-[9px] font-mono font-bold"
        style={{ color: getScoreColor(item.impactScore) }}
      >
        {item.impactScore.toFixed(1)}
      </span>
    </div>
  );
}
