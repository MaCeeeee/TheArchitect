import type { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  warning: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  danger:  { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  info:    { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-500' },
  purple:  { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-500' },
  neutral: { bg: 'bg-white/5', text: 'text-[var(--text-tertiary)]', dot: 'bg-[var(--text-tertiary)]' },
};

export default function Badge({ variant = 'neutral', children, dot, className = '' }: BadgeProps) {
  const style = VARIANT_CLASSES[variant];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${style.bg} ${style.text} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      {children}
    </span>
  );
}
