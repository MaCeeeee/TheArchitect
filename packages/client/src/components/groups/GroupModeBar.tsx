/**
 * UC-METH-002 (REQ .3) — the action field while the group mode runs, and its feedback afterwards.
 * Shown at the bottom in the classic view (in place of the next-step banner) and in v2 (in place of
 * the station actions). Texts: GROUP_MODE_TEXT (ASD-STE100).
 *
 * One frame for all three states (select, name, feedback): the live region for screen readers keeps
 * its place, so the count and the feedback are read when they change.
 */
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Boxes, X } from 'lucide-react';
import { useGroupModeStore } from '../../stores/groupModeStore';
import { MAX_GROUP_MEMBERS, MIN_GROUP_MEMBERS } from '@thearchitect/shared';
import { useUIStore } from '../../stores/uiStore';
import { GROUP_MODE_TEXT as T } from './groupModeText';
import { useGroupModeAvailableInScene } from './sceneSelectable';

interface Props {
  projectId: string;
  className?: string;
}

const frame = 'pointer-events-auto rounded-md border border-[#7c3aed]/40 bg-[var(--surface-base)]/90 px-3 py-2 shadow-lg backdrop-blur-md';
const primary = 'rounded px-2 py-1 text-[11px] font-medium text-[#a78bfa] border border-[#7c3aed]/40 hover:bg-[#7c3aed]/10 disabled:opacity-40 disabled:cursor-not-allowed';
const secondary = 'rounded px-2 py-1 text-[11px] text-[var(--text-tertiary)] border border-[var(--border-subtle)] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed';

export default function GroupModeBar({ projectId, className = '' }: Props) {
  const { active, phase, selected, name, busy, error, feedback, start, toNaming, setName, cancel, dismiss, submit } = useGroupModeStore();
  const own = useGroupModeStore((s) => s.projectId === projectId);
  const againRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(busy);
  const barRef = useRef<HTMLDivElement>(null);
  const sceneSelectable = useGroupModeAvailableInScene();

  // The plateau, track re-form or activity view started: a select there cannot reach the mode, so it
  // ends — after the answer when the group is being made (an error answer keeps the mode open otherwise).
  useEffect(() => {
    if (active && own && !busy && !sceneSelectable) cancel();
  }, [active, own, busy, sceneSelectable, cancel]);

  useEffect(() => {
    if (!active || !own) return;
    // Bubble phase, no stopPropagation: Esc ends the group mode only when nothing else needs it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (useUIStore.getState().isCommandMenuOpen) return; // the menu closes first
      if (useGroupModeStore.getState().busy) return; // the group may already exist on the server
      const target = e.target instanceof Element ? e.target : null;
      const elsewhere = target?.closest('input,textarea,select,[contenteditable=true],[role=dialog]');
      if (elsewhere && !barRef.current?.contains(elsewhere)) return; // an edit or a dialog outside the bar
      cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, own, cancel]);

  // After the group is made (the request ends with feedback): focus the next action of the feedback.
  useEffect(() => {
    const ended = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (ended && !active && feedback) (againRef.current ?? closeRef.current)?.focus();
  }, [busy, active, feedback]);

  if (!own || (!active && !feedback)) return null;
  // The scene must not get the press (as in NextStepBanner).
  const stop = (e: ReactPointerEvent) => e.stopPropagation();
  const showFeedback = !active && feedback !== null;
  const selecting = active && phase === 'select';
  const naming = active && phase === 'name';

  return (
    <div ref={barRef} className={`${frame} ${className}`} onPointerDown={stop} role="group" aria-label={T.modeName}>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (naming) void submit(projectId); }}
      >
        {showFeedback && <Boxes size={14} className="shrink-0 self-start mt-0.5 text-[#a78bfa]" />}
        <div className="flex-1 min-w-0 space-y-1">
          {active && <p className="text-[11px] text-white">{naming ? T.nameHint : T.selectHint}</p>}
          {naming && (
            <input
              autoFocus
              aria-label={T.nameField}
              placeholder={T.nameField}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-white outline-none focus:border-[#7c3aed]"
            />
          )}
          {/* The one live region: count and "one more" while selecting, the feedback lines afterwards. */}
          <div aria-live="polite" className="space-y-0.5">
            {selecting && selected.length > 0 && <p className="text-[10px] text-[var(--text-secondary)]">{T.selectedCount(selected.length)}</p>}
            {selecting && selected.length === 1 && <p className="text-[10px] text-[#a78bfa]">{T.selectOneMore}</p>}
            {selecting && selected.length >= MAX_GROUP_MEMBERS && <p className="text-[10px] text-[#a78bfa]">{T.maximum(MAX_GROUP_MEMBERS)}</p>}
            {showFeedback && feedback.lines.map((line) => <p key={line} className="text-[11px] text-[var(--text-secondary)]">{line}</p>)}
          </div>
          {naming && error && <p role="alert" className="text-[10px] text-red-400">{error}</p>}
        </div>
        {selecting && selected.length >= MIN_GROUP_MEMBERS && (
          <button type="button" className={primary} onClick={toNaming}>{T.makeTheGroup(selected.length)}</button>
        )}
        {naming && <button type="submit" className={primary} disabled={busy || name.trim() === ''}>{T.create}</button>}
        {active && <button type="button" className={secondary} onClick={cancel} disabled={busy}>{T.cancel}</button>}
        {/* Starts the mode directly (not through the registry command): accepted for the restart in the
            feedback; it is offered only where the scene can select. */}
        {showFeedback && feedback.offerAnother && sceneSelectable && (
          <button ref={againRef} type="button" className={primary} onClick={() => start(projectId)}>{T.start}</button>
        )}
        {showFeedback && (
          <button ref={closeRef} type="button" aria-label={T.close} className="self-start text-[var(--text-tertiary)] hover:text-white" onClick={dismiss}>
            <X size={12} />
          </button>
        )}
      </form>
    </div>
  );
}
