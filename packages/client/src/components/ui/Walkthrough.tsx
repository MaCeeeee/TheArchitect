import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Lightbulb } from 'lucide-react';

interface Step {
  title: string;
  description: string;
  phase: number; // 0 = general, 1-5 = phase-specific
}

const STEPS: Step[] = [
  // General intro
  {
    title: 'Welcome to TheArchitect',
    description: 'TheArchitect guides you through 5 phases: Build → Map → Govern → Simulate → Audit. Each phase unlocks the next. The Phase Bar in the sidebar shows your current progress.',
    phase: 0,
  },
  // Phase 1: Build
  {
    title: 'Phase 1: Build Your Architecture',
    description: 'Start by adding elements to your 3D canvas. Use the Explorer sidebar to browse layers, or click "Add Element" at the bottom. Import from CSV or BPMN to jumpstart. Aim for 5+ elements and 3+ connections.',
    phase: 1,
  },
  {
    title: 'Navigate in 3D',
    description: 'Click to select, Shift+Click for multi-select, drag to move. Right-click for context menu. Use F to fit the view, Ctrl+Z to undo. Switch between 3D, Top-Down, and Layer views in the toolbar.',
    phase: 1,
  },
  // Phase 2: Map
  {
    title: 'Phase 2: Map Standards',
    description: 'Open the Comply panel to upload compliance standards (ISO 27001, SOC 2, etc.). The AI will analyze sections and map them to your architecture elements in the Compliance Matrix.',
    phase: 2,
  },
  // Phase 3: Govern
  {
    title: 'Phase 3: Govern with Policies',
    description: 'Generate policy drafts from your mapped standards. Review, edit, and approve policies. The AI suggests compliance elements to close gaps in your architecture.',
    phase: 3,
  },
  // Phase 4: Simulate
  {
    title: 'Phase 4: Simulate & Validate',
    description: 'Use the Analyze panel to run Monte Carlo simulations, scenario comparisons, and capacity planning. Generate a roadmap to track transformation milestones.',
    phase: 4,
  },
  // Phase 5: Audit
  {
    title: 'Phase 5: Audit Readiness',
    description: 'Capture compliance snapshots, create audit checklists, and track progress over time. When all checks are green, your architecture is audit-ready.',
    phase: 5,
  },
  // Wrap-up
  {
    title: 'Mission Control',
    description: 'Click the "Mission" button in the toolbar anytime to see your overall health score, current phase, and next recommended action. The AI Copilot in the sidebar is always ready to help.',
    phase: 0,
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
          {currentStep.phase > 0 && (
            <span className="inline-block text-[9px] font-medium px-2 py-0.5 rounded-full bg-[var(--status-purple)]/15 text-[var(--status-purple)] mb-2">
              Phase {currentStep.phase}
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
