import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Lightbulb } from 'lucide-react';

interface Step {
  title: string;
  description: string;
  admLabel?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to TheArchitect',
    description:
      'TheArchitect guides you through the TOGAF ADM lifecycle — from Architecture Vision to Change Management. Each phase unlocks the next. The Phase Bar at the top tracks your progress.',
  },
  {
    admLabel: 'Phase A',
    title: 'Architecture Vision',
    description:
      'Define your project — scope, vision, and who\'s involved. Identify stakeholders and set architecture principles. This is the foundation everything else builds on.',
  },
  {
    admLabel: 'Phases B-D',
    title: 'Architecture Definition',
    description:
      'Build your architecture — add elements and draw connections across business, data, application, and technology layers. Use the 3D canvas to model your current and target state.',
  },
  {
    admLabel: 'Phase E',
    title: 'Opportunities & Solutions',
    description:
      'Upload compliance standards (ISO 27001, SOC 2, DORA) and map them to your architecture. The AI identifies gaps and suggests elements to close them.',
  },
  {
    admLabel: 'Phase F',
    title: 'Migration Planning',
    description:
      'Run Monte Carlo simulations, compare "what-if" scenarios, and create transformation roadmaps. Your stakeholders become simulation agents to test decisions.',
  },
  {
    admLabel: 'Phase G',
    title: 'Implementation Governance',
    description:
      'Generate and approve governance policies. The system monitors your architecture for violations in real-time and tracks compliance scores.',
  },
  {
    admLabel: 'Phase H',
    title: 'Change Management',
    description:
      'Capture compliance snapshots, create audit checklists, and track how your architecture evolves over time. When all checks are green, you\'re audit-ready.',
  },
  {
    title: 'Mission Control & AI Copilot',
    description:
      'Click "Mission" in the toolbar to see your health score, current phase, and next action. The AI Copilot in the sidebar is always ready to answer questions and automate tasks.',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function Walkthrough({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-[#eab308]" />
            <span className="text-xs text-[var(--text-secondary)]">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentStep.admLabel && (
            <span className="inline-block text-[9px] font-medium px-2 py-0.5 rounded-full bg-[var(--status-purple)]/15 text-[var(--status-purple)] mb-2">
              {currentStep.admLabel}
            </span>
          )}
          <h3 className="text-lg font-semibold text-white mb-3">{currentStep.title}</h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{currentStep.description}</p>
        </div>

        {/* Progress */}
        <div className="px-6 pb-2">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition ${
                  i <= step ? 'bg-[#00ff41]' : 'bg-[#1a2a1a]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-5 py-3">
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition"
          >
            Skip Tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[#1a2a1a] transition"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) onClose();
                else setStep(step + 1);
              }}
              className="flex items-center gap-1 rounded-md bg-[#00ff41] px-4 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition"
            >
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
