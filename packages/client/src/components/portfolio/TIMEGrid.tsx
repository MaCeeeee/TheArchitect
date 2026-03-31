import { useMemo, useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import { usePortfolioStore, PortfolioElement } from '../../stores/portfolioStore';

const QUADRANTS = [
  { key: 'tolerate', label: 'Tolerate', description: 'Acceptable as-is, low priority', color: '#6b7280', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
  { key: 'invest', label: 'Invest', description: 'Strategic, grow & enhance', color: '#22c55e', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  { key: 'migrate', label: 'Migrate', description: 'Replace with better alternatives', color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { key: 'eliminate', label: 'Eliminate', description: 'Remove, decommission', color: '#ef4444', bg: 'bg-red-500/10', border: 'border-red-500/20' },
] as const;

interface Props {
  onElementClick?: (elementId: string) => void;
}

export default function TIMEGrid({ onElementClick }: Props) {
  const items = usePortfolioStore((s) => s.items);
  const [expandedQuadrant, setExpandedQuadrant] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, PortfolioElement[]> = {
      tolerate: [], invest: [], migrate: [], eliminate: [], unclassified: [],
    };
    for (const item of items) {
      const cls = item.timeClassification || 'unclassified';
      if (groups[cls]) groups[cls].push(item);
      else groups.unclassified.push(item);
    }
    return groups;
  }, [items]);

  const total = items.length || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Technology Risk Radar (TIME)</h3>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
            Classify elements by strategic action: Tolerate, Invest, Migrate, Eliminate
          </p>
        </div>
        {grouped.unclassified.length > 0 && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            {grouped.unclassified.length} unclassified
          </span>
        )}
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-2 gap-3">
        {QUADRANTS.map((q) => {
          const elems = grouped[q.key] || [];
          const pct = Math.round((elems.length / total) * 100);
          const isExpanded = expandedQuadrant === q.key;

          return (
            <div
              key={q.key}
              className={`rounded-xl border ${q.border} ${q.bg} p-4 cursor-pointer transition hover:brightness-110`}
              onClick={() => setExpandedQuadrant(isExpanded ? null : q.key)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: q.color }} />
                  <span className="text-sm font-semibold text-white">{q.label}</span>
                </div>
                <span className="text-lg font-bold text-white">{elems.length}</span>
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] mb-2">{q.description}</p>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-black/20 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ backgroundColor: q.color, width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{pct}% of portfolio</div>

              {/* Expanded element list */}
              {isExpanded && elems.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-white/5 pt-2 max-h-40 overflow-y-auto">
                  {elems.map((el) => (
                    <button
                      key={el.id}
                      onClick={(e) => { e.stopPropagation(); onElementClick?.(el.id); }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-white/5 hover:text-white transition"
                    >
                      <ChevronRight size={10} />
                      <span className="truncate">{el.name}</span>
                      <span className="ml-auto text-[9px] text-[var(--text-disabled)] capitalize">{el.type.replace(/_/g, ' ')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
