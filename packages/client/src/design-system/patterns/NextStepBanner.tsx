import { ArrowRight } from 'lucide-react';

interface NextStepBannerProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
}

export default function NextStepBanner({ message, actionLabel, onAction, className = '' }: NextStepBannerProps) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 bg-[var(--accent-muted)] border border-[var(--accent-default)]/20 rounded-md ${className}`}>
      <p className="flex-1 text-[11px] text-[var(--text-secondary)]">{message}</p>
      <button
        onClick={onAction}
        className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent-default)] hover:text-[var(--accent-text)] transition shrink-0 animate-[pulseGlow_2s_ease-in-out_infinite]  rounded px-1.5 py-0.5"
      >
        {actionLabel}
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
