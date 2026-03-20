import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, Zap } from 'lucide-react';
import type { AdvisorInsight, InsightSeverity } from '@thearchitect/shared';

const SEVERITY_STYLES: Record<InsightSeverity, { dot: string; bg: string; border: string }> = {
  critical: { dot: 'bg-red-500', bg: 'bg-red-500/5', border: 'border-red-500/20' },
  high: { dot: 'bg-orange-500', bg: 'bg-orange-500/5', border: 'border-orange-500/20' },
  warning: { dot: 'bg-yellow-500', bg: 'bg-yellow-500/5', border: 'border-yellow-500/20' },
  info: { dot: 'bg-cyan-500', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20' },
};

interface InsightCardProps {
  insight: AdvisorInsight;
  onNavigate?: (elementId: string) => void;
}

export default function InsightCard({ insight, onNavigate }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[insight.severity];

  return (
    <div className={`rounded border ${style.border} ${style.bg} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-1.5 p-2 text-left hover:bg-white/[0.02] transition"
      >
        <div className={`w-1.5 h-1.5 rounded-full ${style.dot} mt-1 shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-white leading-tight truncate">{insight.title}</p>
          {!expanded && (
            <p className="text-[9px] text-[#4a5a4a] mt-0.5 truncate">{insight.description}</p>
          )}
        </div>
        {expanded ? <ChevronDown size={10} className="text-[#4a5a4a] mt-0.5 shrink-0" /> : <ChevronRight size={10} className="text-[#4a5a4a] mt-0.5 shrink-0" />}
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          <p className="text-[9px] text-[#7a8a7a] leading-relaxed">{insight.description}</p>

          {/* Affected Elements */}
          {insight.affectedElements.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[8px] text-[#4a5a4a] uppercase tracking-wider">Affected</span>
              {insight.affectedElements.slice(0, 5).map((el) => (
                <button
                  key={el.elementId}
                  onClick={() => onNavigate?.(el.elementId)}
                  className="flex items-center gap-1 w-full text-left hover:bg-white/[0.03] rounded px-1 py-0.5 transition"
                >
                  <Eye size={8} className="text-[#00ff41] shrink-0" />
                  <span className="text-[9px] text-[#7a8a7a] truncate">{el.name}</span>
                  <span className="text-[8px] text-[#3a4a3a] ml-auto shrink-0">{el.type}</span>
                </button>
              ))}
            </div>
          )}

          {/* Effort / Impact */}
          {(insight.effort || insight.impact) && (
            <div className="flex gap-2 text-[8px]">
              {insight.effort && (
                <span className="text-[#4a5a4a]">
                  Effort: <span className={insight.effort === 'low' ? 'text-[#00ff41]' : insight.effort === 'high' ? 'text-red-400' : 'text-yellow-400'}>{insight.effort}</span>
                </span>
              )}
              {insight.impact && (
                <span className="text-[#4a5a4a]">
                  Impact: <span className={insight.impact === 'high' ? 'text-[#00ff41]' : insight.impact === 'low' ? 'text-[#4a5a4a]' : 'text-yellow-400'}>{insight.impact}</span>
                </span>
              )}
            </div>
          )}

          {/* Action Button */}
          {insight.suggestedAction && (
            <button
              onClick={() => {
                if (insight.suggestedAction?.elementId) {
                  onNavigate?.(insight.suggestedAction.elementId);
                }
              }}
              className="flex items-center gap-1 text-[9px] text-[#00ff41] hover:text-[#33ff66] transition mt-1"
            >
              <Zap size={9} />
              {insight.suggestedAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
