import { AlertTriangle, CheckCircle2, Layers, GitBranch, ArrowRight } from 'lucide-react';
import { useBlueprintStore } from '../../stores/blueprintStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';

const LAYER_COLORS: Record<string, string> = {};
for (const l of ARCHITECTURE_LAYERS) {
  LAYER_COLORS[l.id] = l.color;
}

export default function BlueprintPreview() {
  const result = useBlueprintStore((s) => s.result);
  const editedElements = useBlueprintStore((s) => s.editedElements);
  const editedConnections = useBlueprintStore((s) => s.editedConnections);
  const setStep = useBlueprintStore((s) => s.setStep);

  if (!result) return null;

  const { validation } = result;

  // Group elements by layer
  const byLayer: Record<string, typeof editedElements> = {};
  for (const el of editedElements) {
    if (!byLayer[el.layer]) byLayer[el.layer] = [];
    byLayer[el.layer].push(el);
  }

  // Connection type summary
  const connByType: Record<string, number> = {};
  for (const c of editedConnections) {
    connByType[c.type] = (connByType[c.type] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Architecture Preview</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          The AI has generated the following architecture. Review the result and customize if needed.
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] p-3 text-center">
          <Layers size={20} className="mx-auto text-[#7c3aed] mb-1" />
          <div className="text-lg font-bold text-white">{editedElements.length}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">Elements</div>
        </div>
        <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] p-3 text-center">
          <GitBranch size={20} className="mx-auto text-[#3b82f6] mb-1" />
          <div className="text-lg font-bold text-white">{editedConnections.length}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">Connections</div>
        </div>
        <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] p-3 text-center">
          <CheckCircle2 size={20} className="mx-auto text-[#22c55e] mb-1" />
          <div className="text-lg font-bold text-white">{Object.keys(validation.layerCoverage).length}/8</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">Layers Covered</div>
        </div>
        <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] p-3 text-center">
          <AlertTriangle size={20} className="mx-auto text-[#f59e0b] mb-1" />
          <div className="text-lg font-bold text-white">{validation.warnings.length}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">Warnings</div>
        </div>
      </div>

      {/* Layer coverage bar */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] p-4">
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Layer Coverage</h3>
        <div className="space-y-1.5">
          {ARCHITECTURE_LAYERS.map((layer) => {
            const count = validation.layerCoverage[layer.id] || 0;
            const maxCount = Math.max(...Object.values(validation.layerCoverage).map(Number), 1);
            return (
              <div key={layer.id} className="flex items-center gap-3">
                <span className="text-[10px] text-[var(--text-tertiary)] w-32 truncate">{layer.label}</span>
                <div className="flex-1 h-2 bg-[var(--surface-base)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: layer.color }}
                  />
                </div>
                <span className="text-[10px] font-medium text-[var(--text-secondary)] w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <div className="rounded-lg bg-[#f59e0b]/5 border border-[#f59e0b]/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[#f59e0b]">
            <AlertTriangle size={14} /> Warnings
          </div>
          {validation.warnings.map((w, i) => (
            <p key={i} className="text-xs text-[var(--text-secondary)] pl-5">• {w}</p>
          ))}
        </div>
      )}

      {/* Elements by layer */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Generated Elements</h3>
        {ARCHITECTURE_LAYERS.map((layer) => {
          const elements = byLayer[layer.id];
          if (!elements || elements.length === 0) return null;
          return (
            <div key={layer.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
                <span className="text-xs font-semibold text-white">{layer.label}</span>
                <span className="text-[10px] text-[var(--text-disabled)]">({elements.length})</span>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                {elements.map((el, i) => (
                  <div
                    key={el.id}
                    className={`flex items-center gap-3 px-3 py-2 text-left ${
                      i < elements.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''
                    }`}
                  >
                    <span className="text-xs font-medium text-white flex-1 truncate">{el.name}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-base)] px-1.5 py-0.5 rounded">{el.type}</span>
                    <span className={`text-[10px] ${el.status === 'target' ? 'text-[#22c55e]' : 'text-[#3b82f6]'}`}>{el.status}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connection summary */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] p-4">
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Connections by Type</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(connByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <span key={type} className="text-[10px] bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1 rounded">
              {type} <span className="text-[var(--text-tertiary)]">({count})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setStep(3)}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition"
        >
          Customize
        </button>
        <button
          onClick={() => setStep(4)}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-[#7c3aed] hover:bg-[#6d28d9] text-white transition flex items-center justify-center gap-2"
        >
          Looks Good <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
