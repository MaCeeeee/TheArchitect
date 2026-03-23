import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface PageShellProps {
  onBack: () => void;
  backLabel: string;
  sidebar?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}

export default function PageShell({ onBack, backLabel, sidebar, children, maxWidth = 'max-w-5xl' }: PageShellProps) {
  return (
    <div className="flex h-full bg-[var(--surface-base)]">
      {sidebar}
      <div className="flex-1 overflow-y-auto">
        <div className={`${maxWidth} mx-auto px-8 py-6`}>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition mb-4"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
