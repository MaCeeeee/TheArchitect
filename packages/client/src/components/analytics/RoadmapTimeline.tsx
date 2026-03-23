import { ArrowRight } from 'lucide-react';
import type { RoadmapWave } from '@thearchitect/shared';

const RISK_BG = (delta: number) =>
  delta < -20 ? 'bg-[#0a2a0a]' : delta < 0 ? 'bg-[#1a2a1a]' : 'bg-[#2a1a1a]';

function formatCost(n: number) {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

interface RoadmapTimelineProps {
  waves: RoadmapWave[];
  selectedWave: number | null;
  onSelectWave: (waveNumber: number) => void;
}

export default function RoadmapTimeline({ waves, selectedWave, onSelectWave }: RoadmapTimelineProps) {
  if (waves.length === 0) return null;

  const maxCost = Math.max(...waves.map((w) => w.metrics.totalCost), 1);

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider px-1">
        Timeline
      </div>

      {/* Horizontal scrollable timeline */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {waves.map((wave, i) => {
          const isSelected = selectedWave === wave.waveNumber;
          const heightPct = Math.max(30, (wave.metrics.totalCost / maxCost) * 100);

          return (
            <div key={wave.waveNumber} className="flex items-center shrink-0">
              <button
                onClick={() => onSelectWave(wave.waveNumber)}
                className={`flex flex-col items-center rounded-lg p-2 transition-all min-w-[80px] ${
                  isSelected
                    ? 'bg-[#0a1a0a] border border-[#00ff41] shadow-[0_0_8px_rgba(0,255,65,0.15)]'
                    : `${RISK_BG(wave.metrics.riskDelta)} border border-[var(--border-subtle)] hover:border-[#2a3a2a]`
                }`}
              >
                {/* Cost bar */}
                <div className="w-full h-12 flex items-end justify-center mb-1">
                  <div
                    className="w-8 rounded-t transition-all"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: isSelected ? '#00ff41' : '#1a3a1a',
                    }}
                  />
                </div>

                {/* Wave label */}
                <span className={`text-[10px] font-bold ${isSelected ? 'text-[#00ff41]' : 'text-[var(--text-secondary)]'}`}>
                  W{wave.waveNumber}
                </span>
                <span className="text-[9px] text-[var(--text-tertiary)] truncate max-w-[70px]">
                  {wave.elements.length} items
                </span>
                <span className="text-[9px] text-[#f59e0b]">{formatCost(wave.metrics.totalCost)}</span>
                <span className="text-[9px] text-[#3b82f6]">{wave.estimatedDurationMonths}mo</span>
              </button>

              {/* Arrow between waves */}
              {i < waves.length - 1 && (
                <ArrowRight size={12} className="text-[#2a3a2a] mx-0.5 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Cumulative progress bar */}
      <div className="px-1">
        <div className="flex h-2 rounded-full overflow-hidden bg-[var(--surface-base)]">
          {waves.map((wave) => {
            const widthPct = (wave.metrics.totalCost / waves.reduce((s, w) => s + w.metrics.totalCost, 0)) * 100;
            return (
              <div
                key={wave.waveNumber}
                className="h-full transition-all cursor-pointer hover:opacity-80"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: selectedWave === wave.waveNumber ? '#00ff41' : '#1a3a1a',
                }}
                onClick={() => onSelectWave(wave.waveNumber)}
                title={`Wave ${wave.waveNumber}: ${formatCost(wave.metrics.totalCost)}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
