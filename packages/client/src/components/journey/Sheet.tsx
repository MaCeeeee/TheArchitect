// The reusable Sheet container (CONTEXT.md / ADR-0005): a DOM overlay docked to
// the left or right of the persistent World, with a user-resizable width. Owns
// positioning + chrome + the single z-index; content renders inside without its
// own outer frame. Width/dock persist via uiStore (sheetPrefs).
// No dock/resize transition by design (Prinzip A: instant) — prefers-reduced-motion
// is therefore trivially satisfied.
import { useUIStore } from '../../stores/uiStore';
import { SHEET_MIN, SHEET_MAX } from './sheetPrefs';
import { PanelLeft, PanelRight } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  ariaLabel: string;
}

export default function Sheet({ children, ariaLabel }: Props) {
  const width = useUIStore((s) => s.sheetWidth);
  const dock = useUIStore((s) => s.sheetDock);
  const toggleSheetDock = useUIStore((s) => s.toggleSheetDock);
  const isRight = dock === 'right';

  return (
    <div className={`pointer-events-none absolute inset-y-0 z-30 flex ${isRight ? 'right-0' : 'left-0 flex-row-reverse'}`}>
      {/* resize separator — drag behavior added in Task 3 */}
      <div
        data-sheet-handle
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={SHEET_MIN}
        aria-valuemax={SHEET_MAX}
        tabIndex={0}
        className="pointer-events-auto w-1.5 cursor-col-resize bg-transparent hover:bg-[var(--border-default)]/60 focus-visible:bg-[#00ff41]/50"
      />

      <aside
        role="complementary"
        aria-label={ariaLabel}
        style={{ width: `${width}px` }}
        className={`pointer-events-auto relative flex h-full max-w-[40vw] min-w-[300px] flex-col bg-[var(--surface-raised)]/95 shadow-2xl backdrop-blur-md ${isRight ? 'border-l' : 'border-r'} border-[var(--border-default)]`}
      >
        <button
          type="button"
          onClick={toggleSheetDock}
          aria-label={isRight ? 'Dock left' : 'Dock right'}
          className="absolute right-2 top-2 z-10 rounded p-1 text-[var(--text-tertiary)] transition hover:text-white"
        >
          {isRight ? <PanelLeft size={14} /> : <PanelRight size={14} />}
        </button>
        <div className="flex-1 overflow-auto">{children}</div>
      </aside>
    </div>
  );
}
