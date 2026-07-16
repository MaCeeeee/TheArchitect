// The reusable Sheet container (CONTEXT.md / ADR-0005): a DOM overlay docked to
// the left or right of the persistent World, with a user-resizable width. Owns
// positioning + chrome + the single z-index; content renders inside without its
// own outer frame. Width/dock persist via uiStore (sheetPrefs).
// No dock/resize transition by design (Prinzip A: instant) — prefers-reduced-motion
// is therefore trivially satisfied.
import { useRef } from 'react';
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
  const setSheetWidth = useUIStore((s) => s.setSheetWidth);
  const isRight = dock === 'right';

  const KEY_STEP = 24;
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startW: width };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    e.stopPropagation();
    const deltaX = e.clientX - drag.current.startX;
    setSheetWidth(drag.current.startW + (isRight ? -deltaX : deltaX));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    e.stopPropagation();
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setSheetWidth(width + KEY_STEP); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setSheetWidth(width - KEY_STEP); }
  };

  return (
    <div className={`pointer-events-none absolute inset-y-0 z-30 flex ${isRight ? 'right-0' : 'left-0 flex-row-reverse'}`}>
      <div
        data-sheet-handle
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={SHEET_MIN}
        aria-valuemax={SHEET_MAX}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
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
          className={`absolute top-2 z-10 rounded p-1 text-[var(--text-tertiary)] transition hover:text-white ${isRight ? 'right-2' : 'left-2'}`}
        >
          {isRight ? <PanelLeft size={14} /> : <PanelRight size={14} />}
        </button>
        <div className="flex-1 overflow-auto">{children}</div>
      </aside>
    </div>
  );
}
