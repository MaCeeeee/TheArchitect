import { useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { ARCHITECTURE_LAYERS } from '@thearchitect/shared/src/constants/togaf.constants';
import type { ArchitectureLayer } from '@thearchitect/shared';

export default function LayerNavigator() {
  const focusedLayer = useUIStore((s) => s.focusedLayer);
  const setFocusedLayer = useUIStore((s) => s.setFocusedLayer);
  const elements = useArchitectureStore((s) => s.elements);

  const layerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const el of elements) {
      counts.set(el.layer, (counts.get(el.layer) || 0) + 1);
    }
    return counts;
  }, [elements]);

  const currentIdx = ARCHITECTURE_LAYERS.findIndex((l) => l.id === focusedLayer);

  const goPrev = () => {
    if (currentIdx > 0) {
      setFocusedLayer(ARCHITECTURE_LAYERS[currentIdx - 1].id);
    }
  };

  const goNext = () => {
    if (currentIdx < ARCHITECTURE_LAYERS.length - 1) {
      setFocusedLayer(ARCHITECTURE_LAYERS[currentIdx + 1].id);
    }
  };

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-50">
      {/* Up button */}
      <button
        onClick={goPrev}
        disabled={currentIdx <= 0}
        className="rounded p-1 text-[#7a8a7a] hover:text-white hover:bg-[#1a2a1a] disabled:opacity-30 disabled:cursor-not-allowed transition"
        title="Previous Layer (Arrow Up)"
      >
        <ChevronUp size={16} />
      </button>

      {/* Layer stack */}
      <div className="flex flex-col gap-0.5 rounded-lg bg-[#111111]/90 border border-[#1a2a1a] p-1.5 backdrop-blur-sm">
        {ARCHITECTURE_LAYERS.map((layer) => {
          const count = layerCounts.get(layer.id) || 0;
          const isFocused = layer.id === focusedLayer;

          return (
            <button
              key={layer.id}
              onClick={() => setFocusedLayer(layer.id as ArchitectureLayer)}
              className={`group flex items-center gap-2 rounded px-2 py-1 text-[10px] font-medium transition ${
                isFocused
                  ? 'bg-[#1a2a1a] text-white'
                  : 'text-[#4a5a4a] hover:text-[#7a8a7a] hover:bg-[#0f0f0f]'
              }`}
              title={`${layer.label} (${count} elements)`}
            >
              {/* Color indicator */}
              <div
                className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 transition ${
                  isFocused ? 'ring-1 ring-white/30' : ''
                }`}
                style={{
                  backgroundColor: layer.color,
                  opacity: isFocused ? 1 : count > 0 ? 0.6 : 0.2,
                }}
              />

              {/* Label */}
              <span className="truncate max-w-[100px]">
                {layer.label}
              </span>

              {/* Count badge */}
              {count > 0 && (
                <span className={`ml-auto text-[9px] tabular-nums ${
                  isFocused ? 'text-[#00ff41]' : 'text-[#3a4a3a]'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Down button */}
      <button
        onClick={goNext}
        disabled={currentIdx >= ARCHITECTURE_LAYERS.length - 1}
        className="rounded p-1 text-[#7a8a7a] hover:text-white hover:bg-[#1a2a1a] disabled:opacity-30 disabled:cursor-not-allowed transition"
        title="Next Layer (Arrow Down)"
      >
        <ChevronDown size={16} />
      </button>
    </div>
  );
}
