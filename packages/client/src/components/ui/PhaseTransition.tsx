import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, X, ArrowRight } from 'lucide-react';
import { useJourneyStore } from '../../stores/journeyStore';
import type { JourneyPhase } from '../../stores/journeyStore';

// ──────────────────────────────────────────────────────────
// Phase-specific micro-tutorial text
// ──────────────────────────────────────────────────────────
const PHASE_TUTORIALS: Record<JourneyPhase, { intro: string; tip: string }> = {
  1: {
    intro: 'Define your project — scope, vision, and who\'s involved. This is TOGAF Phase A.',
    tip: 'Fill in the Vision tab to set your architecture foundation.',
  },
  2: {
    intro: 'Build your architecture — add elements and draw connections across layers.',
    tip: 'Use the Explorer sidebar and 3D canvas to model your current state.',
  },
  3: {
    intro: 'Upload compliance standards and map them to your architecture to find gaps.',
    tip: 'Open the Comply tab to upload standards (ISO 27001, SOC 2, DORA).',
  },
  4: {
    intro: 'Run simulations and create transformation roadmaps.',
    tip: 'Your stakeholders become simulation agents — test decisions before committing.',
  },
  5: {
    intro: 'Generate and approve governance policies to establish oversight.',
    tip: 'The system monitors your architecture for policy violations in real-time.',
  },
  6: {
    intro: 'Capture compliance snapshots and create audit checklists.',
    tip: 'Track how your architecture evolves over time to stay audit-ready.',
  },
};

const COMPLETION_MESSAGES: Record<JourneyPhase, string> = {
  1: 'Vision established, stakeholders identified.',
  2: 'Architecture modeled — elements and connections created.',
  3: 'Standards mapped, gaps identified.',
  4: 'Simulations complete, roadmap created.',
  5: 'Policies approved, governance active.',
  6: 'Audit trail established, snapshots captured.',
};

const PHASE_LABELS: Record<JourneyPhase, { adm: string; name: string }> = {
  1: { adm: 'Phase A', name: 'Architecture Vision' },
  2: { adm: 'Phases B-D', name: 'Architecture Definition' },
  3: { adm: 'Phase E', name: 'Opportunities & Solutions' },
  4: { adm: 'Phase F', name: 'Migration Planning' },
  5: { adm: 'Phase G', name: 'Implementation Governance' },
  6: { adm: 'Phase H', name: 'Change Management' },
};

// ──────────────────────────────────────────────────────────
// localStorage helpers
// ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'ta_phase_tutorials_seen';

function getSeenPhases(): Set<JourneyPhase> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markPhaseSeen(phase: JourneyPhase) {
  try {
    const seen = getSeenPhases();
    seen.add(phase);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch { /* ignore */ }
}

// ──────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────
export default function PhaseTransition() {
  const { currentPhase, phases } = useJourneyStore();
  const prevPhaseRef = useRef<JourneyPhase>(currentPhase);
  const [toast, setToast] = useState<{
    type: 'completion' | 'intro';
    phase: JourneyPhase;
  } | null>(null);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = currentPhase;

    // Skip initial mount
    if (prevPhase === currentPhase) return;

    // Phase went forward — show completion toast for old phase + intro for new
    if (currentPhase > prevPhase) {
      // Check if the previous phase was just completed
      const prevInfo = phases.find((p) => p.phase === prevPhase);
      if (prevInfo?.isDone) {
        setToast({ type: 'completion', phase: prevPhase });

        // After completion toast, show intro for new phase (if not seen)
        const seenPhases = getSeenPhases();
        if (!seenPhases.has(currentPhase)) {
          setTimeout(() => {
            setToast({ type: 'intro', phase: currentPhase });
            markPhaseSeen(currentPhase);
          }, 3500);
        } else {
          setTimeout(() => setToast(null), 3500);
        }
        return;
      }
    }

    // Just switched to a new phase — show intro if not seen
    const seenPhases = getSeenPhases();
    if (!seenPhases.has(currentPhase)) {
      setToast({ type: 'intro', phase: currentPhase });
      markPhaseSeen(currentPhase);
    }
  }, [currentPhase, phases]);

  // Auto-dismiss intro toasts
  useEffect(() => {
    if (!toast || toast.type !== 'intro') return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const label = PHASE_LABELS[toast.phase];

  if (toast.type === 'completion') {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_150ms_ease-out]">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--accent-default)]/30 bg-[var(--surface-raised)] px-4 py-3 shadow-lg">
          <CheckCircle2 size={16} className="text-[var(--accent-default)] shrink-0" />
          <div>
            <p className="text-xs font-medium text-[var(--accent-default)]">
              {label.adm} complete!
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)]">
              {COMPLETION_MESSAGES[toast.phase]}
            </p>
          </div>
          <button onClick={() => setToast(null)} className="text-[var(--text-tertiary)] hover:text-white ml-2">
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Intro toast
  const tutorial = PHASE_TUTORIALS[toast.phase];
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_150ms_ease-out]">
      <div className="max-w-sm rounded-lg border border-[var(--status-purple)]/30 bg-[var(--surface-raised)] px-4 py-3 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--status-purple)]/20 text-[var(--status-purple)] shrink-0 mt-0.5">
            <ArrowRight size={12} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--status-purple)]">
              {label.adm}: {label.name}
            </p>
            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{tutorial.intro}</p>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-1 italic">{tutorial.tip}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-[var(--text-tertiary)] hover:text-white shrink-0">
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
