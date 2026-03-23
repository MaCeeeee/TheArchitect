import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface Step {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface StepperProps {
  steps: Step[];
  currentIndex: number;
  completedIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export default function Stepper({ steps, currentIndex, completedIndex, onStepClick, className = '' }: StepperProps) {
  return (
    <div className={`flex items-center gap-0 ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx <= completedIndex;
        const isCurrent = idx === currentIndex;
        const isClickable = onStepClick && idx <= completedIndex + 1;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-initial">
            <button
              onClick={() => isClickable && onStepClick?.(idx)}
              disabled={!isClickable}
              className={`flex flex-col items-center gap-1 ${
                isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all ${
                  isCompleted && !isCurrent
                    ? 'bg-[var(--accent-muted)] border-[var(--accent-default)] text-[var(--accent-default)]'
                    : isCurrent
                    ? 'bg-[var(--status-purple)]/20 border-[var(--status-purple)] text-[var(--status-purple)] shadow-[0_0_12px_rgba(167,139,250,0.4)]'
                    : 'bg-transparent border-[var(--border-strong)] text-[var(--text-disabled)]'
                }`}
              >
                {isCompleted && !isCurrent ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  step.icon || <span className="text-xs font-medium">{idx + 1}</span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isCurrent
                    ? 'text-[var(--status-purple)]'
                    : isCompleted
                    ? 'text-[var(--accent-default)]/70'
                    : 'text-[var(--text-disabled)]'
                }`}
              >
                {step.label}
              </span>
            </button>

            {idx < steps.length - 1 && (
              <div className="flex-1 mx-1">
                <div
                  className={`h-0.5 w-full ${
                    idx < completedIndex ? 'bg-[var(--accent-default)]/40' : 'bg-[var(--border-subtle)]'
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
