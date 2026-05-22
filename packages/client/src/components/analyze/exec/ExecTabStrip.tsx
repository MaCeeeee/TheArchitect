import { useRef, type KeyboardEvent } from 'react';
import { RefreshCw } from 'lucide-react';

export type Persona = 'ceo' | 'cio' | 'cfo';

const TABS: Array<{ id: Persona; label: string }> = [
  { id: 'ceo', label: 'CEO View' },
  { id: 'cio', label: 'CIO View' },
  { id: 'cfo', label: 'CFO View' },
];

interface Props {
  active: Persona;
  onChange: (p: Persona) => void;
  onReload: () => void;
  loading?: boolean;
}

export default function ExecTabStrip({ active, onChange, onReload, loading }: Props) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusByIndex = (idx: number) => {
    const wrapped = (idx + TABS.length) % TABS.length;
    btnRefs.current[wrapped]?.focus();
    onChange(TABS[wrapped].id);
  };

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>, currentIdx: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusByIndex(currentIdx + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusByIndex(currentIdx - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusByIndex(0);
        break;
      case 'End':
        e.preventDefault();
        focusByIndex(TABS.length - 1);
        break;
    }
  };

  return (
    <div
      className="flex items-center justify-between mb-4 border-b border-[var(--border-subtle)]"
      data-testid="exec-tab-strip"
    >
      <div role="tablist" aria-label="Executive personas" className="flex gap-1">
        {TABS.map((t, idx) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => (btnRefs.current[idx] = el)}
              role="tab"
              type="button"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => handleKey(e, idx)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-[#7c3aed] text-white'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-white'
              }`}
              data-testid={`exec-tab-${t.id}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onReload}
        disabled={loading}
        title="Refresh executive summary"
        className="text-[var(--text-tertiary)] hover:text-white p-1.5 disabled:opacity-50"
        data-testid="exec-reload"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
