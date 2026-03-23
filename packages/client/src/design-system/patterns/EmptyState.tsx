import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <div className="text-[var(--border-strong)] mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      {description && (
        <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
