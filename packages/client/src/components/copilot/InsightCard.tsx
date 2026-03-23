import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Eye, Zap } from 'lucide-react';
import type { AdvisorInsight, InsightSeverity } from '@thearchitect/shared';
import { executeAction } from '../../design-system/ActionRouter';
import type { ActionTarget } from '../../design-system/ActionRouter';
import { useArchitectureStore } from '../../stores/architectureStore';

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

function resolveActionTarget(insight: AdvisorInsight): ActionTarget | null {
  const title = insight.title.toLowerCase();
  if (title.includes('compliance') || title.includes('standard')) return { type: 'compliance', section: 'standards' };
  if (title.includes('policy')) return { type: 'compliance', section: 'policies' };
  if (title.includes('simulation') || title.includes('validate')) return { type: 'panel', panel: 'analyze', tab: 'monte' };
  if (title.includes('missing') || title.includes('gap') || title.includes('orphan')) return { type: 'panel', panel: 'explorer' };
  if (insight.suggestedAction?.elementId) return { type: 'element', elementId: insight.suggestedAction.elementId };
  return null;
}

export default function InsightCard({ insight, onNavigate }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);
  const selectElement = useArchitectureStore((s) => s.selectElement);
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
            <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 truncate">{insight.description}</p>
          )}
        </div>
        {expanded ? <ChevronDown size={10} className="text-[var(--text-tertiary)] mt-0.5 shrink-0" /> : <ChevronRight size={10} className="text-[var(--text-tertiary)] mt-0.5 shrink-0" />}
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          <p className="text-[9px] text-[var(--text-secondary)] leading-relaxed">{insight.description}</p>

          {/* Affected Elements */}
          {insight.affectedElements.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Affected</span>
              {insight.affectedElements.slice(0, 5).map((el) => (
                <button
                  key={el.elementId}
                  onClick={() => onNavigate?.(el.elementId)}
                  className="flex items-center gap-1 w-full text-left hover:bg-white/[0.03] rounded px-1 py-0.5 transition"
                >
                  <Eye size={8} className="text-[#00ff41] shrink-0" />
                  <span className="text-[9px] text-[var(--text-secondary)] truncate">{el.name}</span>
                  <span className="text-[8px] text-[var(--text-disabled)] ml-auto shrink-0">{el.type}</span>
                </button>
              ))}
            </div>
          )}

          {/* Effort / Impact */}
          {(insight.effort || insight.impact) && (
            <div className="flex gap-2 text-[8px]">
              {insight.effort && (
                <span className="text-[var(--text-tertiary)]">
                  Effort: <span className={insight.effort === 'low' ? 'text-[#00ff41]' : insight.effort === 'high' ? 'text-red-400' : 'text-yellow-400'}>{insight.effort}</span>
                </span>
              )}
              {insight.impact && (
                <span className="text-[var(--text-tertiary)]">
                  Impact: <span className={insight.impact === 'high' ? 'text-[#00ff41]' : insight.impact === 'low' ? 'text-[var(--text-tertiary)]' : 'text-yellow-400'}>{insight.impact}</span>
                </span>
              )}
            </div>
          )}

          {/* Action Button — routes to the right fix tool */}
          {insight.suggestedAction && (() => {
            const target = resolveActionTarget(insight);
            return (
              <button
                onClick={() => {
                  if (target) {
                    executeAction(target, navigate, projectId, {
                      onSelectElement: (id) => {
                        selectElement(id);
                        onNavigate?.(id);
                      },
                    });
                  } else if (insight.suggestedAction?.elementId) {
                    onNavigate?.(insight.suggestedAction.elementId);
                  }
                }}
                className="flex items-center gap-1 text-[9px] text-[#00ff41] hover:text-[#33ff66] transition mt-1"
              >
                <Zap size={9} />
                {insight.suggestedAction.label}
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
}
