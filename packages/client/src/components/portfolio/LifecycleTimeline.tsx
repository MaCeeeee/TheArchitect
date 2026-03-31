import { useMemo } from 'react';
import { Calendar, ArrowRight, Circle } from 'lucide-react';
import { usePortfolioStore, LifecycleEvent } from '../../stores/portfolioStore';

const PHASE_COLORS: Record<string, string> = {
  plan: '#6366f1',
  design: '#8b5cf6',
  build: '#3b82f6',
  test: '#06b6d4',
  deploy: '#22c55e',
  operate: '#00ff41',
  phase_out: '#f59e0b',
  retire: '#ef4444',
  unknown: '#6b7280',
};

const STATUS_ICONS: Record<string, string> = {
  current: 'bg-green-500',
  target: 'bg-blue-500',
  transitional: 'bg-amber-500',
  retired: 'bg-gray-500',
};

interface Props {
  projectId: string;
}

export default function LifecycleTimeline({ projectId }: Props) {
  const timeline = usePortfolioStore((s) => s.timeline);

  // Group events by year
  const grouped = useMemo(() => {
    const groups: Record<string, LifecycleEvent[]> = {};
    for (const ev of timeline) {
      const dateStr = ev.goLiveDate || ev.endOfLifeDate || '';
      const year = dateStr ? new Date(dateStr).getFullYear().toString() : 'Unknown';
      if (!groups[year]) groups[year] = [];
      groups[year].push(ev);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [timeline]);

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar size={32} className="text-[#1a2a1a] mb-3" />
        <p className="text-sm font-medium text-[var(--text-tertiary)]">No lifecycle dates set</p>
        <p className="text-xs text-[var(--text-disabled)] mt-1 max-w-sm">
          Set go-live and end-of-life dates on your elements to see the lifecycle timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-[var(--text-tertiary)]">
        <span className="font-medium">Phases:</span>
        {Object.entries(PHASE_COLORS).filter(([k]) => k !== 'unknown').map(([phase, color]) => (
          <div key={phase} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{phase.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Timeline groups */}
      {grouped.map(([year, events]) => (
        <div key={year}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-white">{year}</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">{events.length} event{events.length !== 1 ? 's' : ''}</span>
            <div className="flex-1 h-px bg-[var(--border-subtle)]" />
          </div>

          <div className="space-y-2 pl-4 border-l-2 border-[var(--border-subtle)]">
            {events.map((ev) => {
              const phaseColor = PHASE_COLORS[ev.phase] || PHASE_COLORS.unknown;
              const goLive = ev.goLiveDate ? formatDate(ev.goLiveDate) : null;
              const eol = ev.endOfLifeDate ? formatDate(ev.endOfLifeDate) : null;

              return (
                <div
                  key={ev.elementId}
                  className="relative rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 ml-4 hover:border-[var(--border-subtle)] transition"
                >
                  {/* Connector dot */}
                  <div
                    className="absolute -left-[23px] top-4 h-3 w-3 rounded-full border-2 border-[var(--surface-base)]"
                    style={{ backgroundColor: phaseColor }}
                  />

                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{ev.elementName}</span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize"
                          style={{ backgroundColor: `${phaseColor}20`, color: phaseColor }}
                        >
                          {ev.phase.replace('_', ' ')}
                        </span>
                        <div className={`h-1.5 w-1.5 rounded-full ${STATUS_ICONS[ev.status] || 'bg-gray-500'}`} title={ev.status} />
                      </div>
                      <span className="text-[10px] text-[var(--text-tertiary)] capitalize">{ev.elementType.replace(/_/g, ' ')}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px]">
                      {goLive && (
                        <div className="flex items-center gap-1 text-green-400">
                          <Circle size={8} className="fill-current" />
                          <span>Go-Live: {goLive}</span>
                        </div>
                      )}
                      {goLive && eol && <ArrowRight size={10} className="text-[var(--text-disabled)]" />}
                      {eol && (
                        <div className="flex items-center gap-1 text-red-400">
                          <Circle size={8} className="fill-current" />
                          <span>EOL: {eol}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Duration bar */}
                  {goLive && eol && (
                    <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-base)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: phaseColor,
                          width: `${calculateProgress(ev.goLiveDate!, ev.endOfLifeDate!)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function calculateProgress(goLive: string, eol: string): number {
  const start = new Date(goLive).getTime();
  const end = new Date(eol).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}
