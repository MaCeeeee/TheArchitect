import { Loader2, CheckCircle2, AlertCircle, Boxes, GitBranch } from 'lucide-react';
import { useBlueprintStore } from '../../stores/blueprintStore';

export default function BlueprintProgress() {
  const isGenerating = useBlueprintStore((s) => s.isGenerating);
  const phase = useBlueprintStore((s) => s.generationPhase);
  const percent = useBlueprintStore((s) => s.generationPercent);
  const message = useBlueprintStore((s) => s.generationMessage);
  const error = useBlueprintStore((s) => s.error);
  const result = useBlueprintStore((s) => s.result);

  const phases = [
    { id: 'elements', label: 'Generate Elements', icon: Boxes },
    { id: 'connections', label: 'Create Connections', icon: GitBranch },
    { id: 'validation', label: 'Validation', icon: CheckCircle2 },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-8">
      {/* Main spinner / status */}
      <div className="relative">
        {isGenerating ? (
          <Loader2 size={64} className="animate-spin text-[#7c3aed]" />
        ) : error ? (
          <AlertCircle size={64} className="text-[#ef4444]" />
        ) : (
          <CheckCircle2 size={64} className="text-[#22c55e]" />
        )}
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-white">
          {isGenerating ? 'Generating Architecture...' : error ? 'Generation Failed' : 'Generation Complete!'}
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">{message}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div className="h-2 bg-[var(--surface-base)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${percent}%`,
              backgroundColor: error ? '#ef4444' : '#7c3aed',
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-[var(--text-disabled)]">
          <span>{percent}%</span>
          <span>{phase || ''}</span>
        </div>
      </div>

      {/* Phase indicators */}
      <div className="flex gap-6">
        {phases.map((p) => {
          const Icon = p.icon;
          const isCurrent = phase === p.id;
          const isComplete = phase && phases.findIndex((x) => x.id === phase) > phases.findIndex((x) => x.id === p.id);

          return (
            <div key={p.id} className="flex flex-col items-center gap-1.5">
              <div
                className={`p-2 rounded-full border-2 transition ${
                  isComplete
                    ? 'border-[#22c55e] bg-[#22c55e]/10'
                    : isCurrent
                    ? 'border-[#7c3aed] bg-[#7c3aed]/10 animate-pulse'
                    : 'border-[var(--border-subtle)] bg-transparent'
                }`}
              >
                <Icon
                  size={18}
                  className={isComplete ? 'text-[#22c55e]' : isCurrent ? 'text-[#7c3aed]' : 'text-[var(--text-disabled)]'}
                />
              </div>
              <span className={`text-[10px] font-medium ${isComplete ? 'text-[#22c55e]' : isCurrent ? 'text-[#7c3aed]' : 'text-[var(--text-disabled)]'}`}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Result badges */}
      {result && (
        <div className="flex gap-4">
          <div className="rounded-lg bg-[#7c3aed]/10 border border-[#7c3aed]/30 px-4 py-2 text-center">
            <div className="text-lg font-bold text-[#a78bfa]">{result.elements.length}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Elements</div>
          </div>
          <div className="rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/30 px-4 py-2 text-center">
            <div className="text-lg font-bold text-[#60a5fa]">{result.connections.length}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Connections</div>
          </div>
          <div className="rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 px-4 py-2 text-center">
            <div className="text-lg font-bold text-[#4ade80]">{Object.keys(result.validation.layerCoverage).length}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Layers</div>
          </div>
        </div>
      )}

      {/* Error retry */}
      {error && (
        <p className="text-sm text-[#ef4444] max-w-md text-center">{error}</p>
      )}
    </div>
  );
}
