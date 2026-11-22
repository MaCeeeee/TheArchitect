import { useId } from 'react';
import { ArrowRight, Sigma } from 'lucide-react';

interface NextStepBannerProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
  /** Ladder tone (UC-METH-002): the headline of the ladder panel, in front of the message. */
  label?: string;
  /** Opens the ladder panel on the same step; without it the label is plain text. */
  onLabel?: () => void;
  /** What the label button does: shown as its title and read as its description. */
  labelHint?: string;
  tone?: 'phase' | 'ladder';
}

export default function NextStepBanner({ message, actionLabel, onAction, className = '', label, onLabel, labelHint, tone = 'phase' }: NextStepBannerProps) {
  const ladder = tone === 'ladder';
  const hintId = useId();
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md ${
        ladder ? 'border border-[#7c3aed]/40' : 'bg-[var(--accent-muted)] border border-[var(--accent-default)]/20'
      } ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {ladder ? (
        <div className="flex-1 min-w-0">
          {label && (
            <div className="flex items-center gap-1">
              <Sigma size={12} className="shrink-0 text-[#7c3aed]" />
              {onLabel ? (
                <>
                  <button
                    type="button"
                    onClick={onLabel}
                    title={labelHint}
                    aria-describedby={labelHint ? hintId : undefined}
                    className="text-[11px] text-white hover:underline cursor-pointer text-left"
                  >
                    {label}
                  </button>
                  {labelHint && <span id={hintId} className="sr-only">{labelHint}</span>}
                </>
              ) : (
                <span className="text-[11px] text-white">{label}</span>
              )}
            </div>
          )}
          {/* Same colour as the "Next step" line of the ladder panel; #a78bfa is readable at 11 px. */}
          <p className="text-[11px] text-[#a78bfa]">{message}</p>
        </div>
      ) : (
        <p className="flex-1 text-[11px] text-[var(--text-secondary)]">{message}</p>
      )}
      <button
        onClick={onAction}
        className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-default)] hover:text-[var(--accent-text)] transition shrink-0 animate-[pulseGlow_2s_ease-in-out_infinite] rounded px-1.5 py-0.5 cursor-pointer"
      >
        {actionLabel}
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
