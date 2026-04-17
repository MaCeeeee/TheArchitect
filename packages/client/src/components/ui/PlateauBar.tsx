import { useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Home, Layers, Eye, EyeOff } from 'lucide-react';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { flyToWorkspace, fitAllWorkspaces } from '../3d/ViewModeCamera';

const WORKSPACE_GAP = 40;

function formatCost(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
}

export default function PlateauBar() {
  const plateauSnapshots = useRoadmapStore((s) => s.plateauSnapshots);
  const selectedPlateauIndex = useRoadmapStore((s) => s.selectedPlateauIndex);
  const selectPlateau = useRoadmapStore((s) => s.selectPlateau);
  const plateauViewMode = useRoadmapStore((s) => s.plateauViewMode);
  const setPlateauViewMode = useRoadmapStore((s) => s.setPlateauViewMode);

  if (plateauSnapshots.length === 0) return null;

  const handleSelect = useCallback((index: number) => {
    selectPlateau(index);
    flyToWorkspace(index * WORKSPACE_GAP);
  }, [selectPlateau]);

  const handlePrev = useCallback(() => {
    const prev = selectedPlateauIndex !== null && selectedPlateauIndex > 0
      ? selectedPlateauIndex - 1
      : plateauSnapshots.length - 1;
    handleSelect(prev);
  }, [selectedPlateauIndex, plateauSnapshots.length, handleSelect]);

  const handleNext = useCallback(() => {
    const next = selectedPlateauIndex !== null && selectedPlateauIndex < plateauSnapshots.length - 1
      ? selectedPlateauIndex + 1
      : 0;
    handleSelect(next);
  }, [selectedPlateauIndex, plateauSnapshots.length, handleSelect]);

  const handleFitAll = useCallback(() => {
    fitAllWorkspaces(plateauSnapshots.map((_, i) => ({ offsetX: i * WORKSPACE_GAP })));
  }, [plateauSnapshots]);

  // Keyboard navigation: ←/→ for prev/next, Home for fit all
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
      else if (e.key === 'Home') { e.preventDefault(); handleFitAll(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePrev, handleNext, handleFitAll]);

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]/90 backdrop-blur-sm px-2 py-1.5 shadow-xl">
      {/* Fit all */}
      <button
        onClick={handleFitAll}
        className="flex items-center justify-center rounded p-1.5 text-[var(--text-tertiary)] hover:text-[#00ff41] hover:bg-[#1a2a1a] transition"
        title="Fit all plateaus (Home)"
      >
        <Home size={14} />
      </button>

      {/* Previous */}
      <button
        onClick={handlePrev}
        className="flex items-center justify-center rounded p-1.5 text-[var(--text-tertiary)] hover:text-white hover:bg-[#1a2a1a] transition"
        title="Previous plateau (←)"
      >
        <ChevronLeft size={14} />
      </button>

      {/* Plateau tabs */}
      <div className="flex items-center gap-0.5">
        {plateauSnapshots.map((snapshot, i) => {
          const isActive = selectedPlateauIndex === i;
          const isAsIs = snapshot.waveNumber === null;
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className={`relative flex flex-col items-center rounded-md px-2.5 py-1 text-xs cursor-pointer transition ${
                isActive
                  ? 'bg-[#1a2a1a] border border-[#00ff41]/50'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-[#1a2a1a]/50 border border-transparent'
              }`}
              style={isActive ? { boxShadow: '0 0 8px rgba(0,255,65,0.15)' } : undefined}
            >
              <span className={`text-[10px] font-semibold tracking-wider ${
                isActive ? 'text-[#00ff41]' : ''
              }`}>
                {isAsIs ? 'As-Is' : `W${snapshot.waveNumber}`}
              </span>
              {!isAsIs && (
                <span className="text-[8px] text-[var(--text-tertiary)] mt-0.5">
                  {snapshot.changedElementIds.length > 0 && (
                    <span className={isActive ? 'text-[#00ff41]/70' : ''}>
                      {snapshot.changedElementIds.length}
                    </span>
                  )}
                  {snapshot.cumulativeCost > 0 && (
                    <span className="ml-1">€{formatCost(snapshot.cumulativeCost)}</span>
                  )}
                </span>
              )}

              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#00ff41]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Next */}
      <button
        onClick={handleNext}
        className="flex items-center justify-center rounded p-1.5 text-[var(--text-tertiary)] hover:text-white hover:bg-[#1a2a1a] transition"
        title="Next plateau (→)"
      >
        <ChevronRight size={14} />
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-[#1a2a1a] mx-1" />

      {/* Full/Changed toggle */}
      <button
        onClick={() => setPlateauViewMode(plateauViewMode === 'full' ? 'changed-only' : 'full')}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
          plateauViewMode === 'changed-only'
            ? 'text-[#00ff41] bg-[#00ff41]/10'
            : 'text-[var(--text-tertiary)] hover:text-white'
        }`}
        title={plateauViewMode === 'full' ? 'Show changed elements only' : 'Show all elements'}
      >
        {plateauViewMode === 'changed-only' ? <EyeOff size={12} /> : <Eye size={12} />}
        {plateauViewMode === 'changed-only' ? 'Changed' : 'Full'}
      </button>
    </div>
  );
}
