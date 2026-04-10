import { useState, useEffect } from 'react';
import { X, Info } from 'lucide-react';

interface SectionHeaderProps {
  sectionId: string;
  title: string;
  description: string;
  phase?: string;
}

function isDismissed(sectionId: string): boolean {
  try {
    const raw = localStorage.getItem('ta_dismissed_headers');
    const set: string[] = raw ? JSON.parse(raw) : [];
    return set.includes(sectionId);
  } catch { return false; }
}

function setDismissed(sectionId: string) {
  try {
    const raw = localStorage.getItem('ta_dismissed_headers');
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(sectionId)) {
      set.push(sectionId);
      localStorage.setItem('ta_dismissed_headers', JSON.stringify(set));
    }
  } catch { /* ignore */ }
}

export default function SectionHeader({ sectionId, title, description, phase }: SectionHeaderProps) {
  const [hidden, setHidden] = useState(() => isDismissed(sectionId));

  if (hidden) return null;

  const handleDismiss = () => {
    setDismissed(sectionId);
    setHidden(true);
  };

  return (
    <div className="mx-3 mt-2 mb-1 px-2.5 py-2 rounded-md bg-[var(--accent-default)]/5 border border-[var(--accent-default)]/10 relative group">
      <div className="flex items-start gap-2">
        <Info size={12} className="text-[var(--accent-default)] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {phase && (
            <span className="text-[8px] font-medium text-[var(--accent-default)] uppercase tracking-wider">
              {phase}
            </span>
          )}
          <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            {description}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="p-0.5 rounded hover:bg-[var(--surface-base)] opacity-0 group-hover:opacity-100 transition shrink-0"
          title="Dismiss"
        >
          <X size={10} className="text-[var(--text-tertiary)]" />
        </button>
      </div>
    </div>
  );
}
