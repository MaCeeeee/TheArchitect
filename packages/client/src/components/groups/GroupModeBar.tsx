/**
 * UC-METH-002 (REQ .3) — the action field while the group mode runs, and its feedback afterwards.
 * Shown at the bottom in the classic view (in place of the next-step banner) and in v2 (in place of
 * the station actions). Texts: GROUP_MODE_TEXT (ASD-STE100).
 */
import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { Boxes, X } from 'lucide-react';
import { useGroupModeStore, MIN_GROUP_SELECTION } from '../../stores/groupModeStore';
import { GROUP_MODE_TEXT as T } from './groupModeText';

interface Props {
  projectId: string;
  className?: string;
}

const frame = 'pointer-events-auto rounded-md border border-[#7c3aed]/40 bg-[var(--surface-base)]/90 px-3 py-2 shadow-lg backdrop-blur-md';
const primary = 'rounded px-2 py-1 text-[11px] font-medium text-[#a78bfa] border border-[#7c3aed]/40 hover:bg-[#7c3aed]/10 disabled:opacity-40 disabled:cursor-not-allowed';
const secondary = 'rounded px-2 py-1 text-[11px] text-[var(--text-tertiary)] border border-[var(--border-subtle)] hover:text-white';

export default function GroupModeBar({ projectId, className = '' }: Props) {
  const { active, phase, selected, name, busy, error, feedback, start, toNaming, setName, cancel, dismiss, submit } = useGroupModeStore();
  const own = useGroupModeStore((s) => s.projectId === projectId);

  useEffect(() => {
    if (!active || !own) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, own, cancel]);

  if (!own || (!active && !feedback)) return null;
  // The scene must not get the press (as in NextStepBanner).
  const stop = (e: ReactPointerEvent) => e.stopPropagation();

  if (!active && feedback) {
    return (
      <div className={`${frame} ${className}`} onPointerDown={stop} role="status">
        <div className="flex items-start gap-2">
          <Boxes size={14} className="mt-0.5 shrink-0 text-[#a78bfa]" />
          <div className="flex-1 space-y-0.5">
            {feedback.lines.map((line) => <p key={line} className="text-[11px] text-[var(--text-secondary)]">{line}</p>)}
          </div>
          {feedback.offerAnother && <button type="button" className={primary} onClick={() => start(projectId)}>{T.start}</button>}
          <button type="button" aria-label={T.close} className="text-[var(--text-tertiary)] hover:text-white" onClick={dismiss}><X size={12} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${frame} ${className}`} onPointerDown={stop} role="group" aria-label={T.start}>
      {phase === 'select' ? (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[11px] text-white">{T.selectHint}</p>
            {selected.length > 0 && <p className="text-[10px] text-[var(--text-secondary)]">{T.selectedCount(selected.length)}</p>}
            {selected.length === 1 && <p className="text-[10px] text-[#a78bfa]">{T.selectOneMore}</p>}
          </div>
          {selected.length >= MIN_GROUP_SELECTION && (
            <button type="button" className={primary} onClick={toNaming}>{T.makeTheGroup(selected.length)}</button>
          )}
          <button type="button" className={secondary} onClick={cancel}>{T.cancel}</button>
        </div>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); void submit(projectId); }}
        >
          <div className="flex-1 space-y-1">
            <p className="text-[11px] text-white">{T.nameHint}</p>
            <input
              autoFocus
              aria-label={T.nameField}
              placeholder={T.nameField}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(projectId); } }}
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-white outline-none focus:border-[#7c3aed]"
            />
            {error && <p role="alert" className="text-[10px] text-red-400">{error}</p>}
          </div>
          <button type="submit" className={primary} disabled={busy || name.trim() === ''}>{T.create}</button>
          <button type="button" className={secondary} onClick={cancel}>{T.cancel}</button>
        </form>
      )}
    </div>
  );
}
