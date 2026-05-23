import { useParams, useNavigate } from 'react-router-dom';
import { Compass, ShieldCheck, AlertOctagon, DollarSign, ArrowRight, type LucideIcon } from 'lucide-react';
import type { ExecutiveDecision, DecisionKind } from '@thearchitect/shared';

const KIND_META: Record<DecisionKind, { icon: LucideIcon; color: string; label: string }> = {
  compliance_gap: { icon: ShieldCheck, color: '#a78bfa', label: 'Compliance' },
  spof: { icon: AlertOctagon, color: '#ef4444', label: 'Resilience' },
  cost_burden: { icon: DollarSign, color: '#3b82f6', label: 'Cost' },
};

interface Props {
  decisions: ExecutiveDecision[];
}

export default function TopDecisionsCard({ decisions }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  if (decisions.length === 0) {
    return (
      <div
        className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-4"
        data-testid="top-decisions-empty"
      >
        <div className="flex items-center gap-2 mb-2">
          <Compass size={16} className="text-[var(--text-tertiary)]" />
          <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Top Decisions
          </span>
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          No critical decisions surfaced — your architecture is stable.
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-[var(--surface-raised)] border border-[#7c3aed]/30 rounded-lg p-4"
      data-testid="top-decisions-card"
    >
      <div className="flex items-center gap-2 mb-3">
        <Compass size={16} className="text-[#7c3aed]" />
        <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          Top Decisions ({decisions.length})
        </span>
      </div>
      <ol className="space-y-3">
        {decisions.map((d, idx) => {
          const meta = KIND_META[d.kind];
          const Icon = meta.icon;
          const interactive = Boolean(d.sourceElementId && projectId);
          const go = () => {
            if (interactive) navigate(`/project/${projectId}/analyze/hotspots`);
          };
          return (
            <li
              key={`${d.kind}-${d.sourceElementId ?? idx}`}
              className={`border border-[var(--border-subtle)] rounded-md p-3 transition-colors ${
                interactive ? 'cursor-pointer hover:border-[#7c3aed]/50' : ''
              }`}
              onClick={go}
              data-testid={`decision-${d.kind}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                >
                  <Icon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-white truncate">
                      {idx + 1}. {d.title}
                    </h4>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
                      style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1.5">{d.why}</p>
                  <div className="flex items-start gap-1.5 text-xs text-[var(--text-tertiary)]">
                    <ArrowRight size={12} className="mt-0.5 flex-shrink-0" />
                    <span>
                      <span className="text-white font-medium">{d.suggestedAction}</span>
                      {' — '}
                      <span className="italic">{d.estimatedImpact}</span>
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
