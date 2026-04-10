import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { JourneyPhase } from '../../stores/journeyStore';

const PHASE_LABELS: Record<JourneyPhase, { adm: string; name: string }> = {
  1: { adm: 'Phase A', name: 'Architecture Vision' },
  2: { adm: 'Phases B-D', name: 'Architecture Definition' },
  3: { adm: 'Phase E', name: 'Opportunities & Solutions' },
  4: { adm: 'Phase F', name: 'Migration Planning' },
  5: { adm: 'Phase G', name: 'Implementation Governance' },
  6: { adm: 'Phase H', name: 'Change Management' },
};

interface PhaseEmptyStateProps {
  icon: ReactNode;
  title: string;
  /** Explains what the user needs to do first */
  prerequisite: string;
  /** Which TOGAF phase must be reached/completed before this section is useful */
  requiredPhase: JourneyPhase;
  /** Optional navigate callback (e.g., go to the prerequisite section) */
  onNavigate?: () => void;
  /** Label for the navigate button */
  navigateLabel?: string;
  className?: string;
}

export default function PhaseEmptyState({
  icon,
  title,
  prerequisite,
  requiredPhase,
  onNavigate,
  navigateLabel,
  className = '',
}: PhaseEmptyStateProps) {
  const phase = PHASE_LABELS[requiredPhase];

  return (
    <div className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}>
      <div className="text-[var(--border-strong)] mb-3">{icon}</div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-1.5 max-w-xs">{prerequisite}</p>
      <span className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full bg-[var(--status-purple)]/10 text-[9px] font-medium text-[var(--status-purple)]">
        {phase.adm}: {phase.name}
      </span>
      {onNavigate && (
        <button
          onClick={onNavigate}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-default)] hover:text-[var(--accent-hover)] transition"
        >
          {navigateLabel || `Go to ${phase.name}`}
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
