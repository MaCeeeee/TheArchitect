/**
 * RequirementGatesBadge (THE-557) — the three-gate fulfilment tripel.
 *
 *   C  covered   machine-derived (linked elements) — display only, never clickable
 *   E  enforced  human decision, reason required
 *   A  attested  human decision, reason required (Slice 2 adds evidence binding)
 *
 * Absence of `gates` renders as 3× unknown — a legacy `done` inherits NO depth.
 * The honesty lives in the surface: covered without attestation says
 * "covered, not attested" right next to the chips.
 */
import { useState } from 'react';

type GateState = 'unknown' | 'no' | 'yes';
interface GateInfo {
  state: GateState;
  setBy?: string;
  setAt?: string;
  reason?: string;
}
export interface RequirementGatesValue {
  covered: GateInfo;
  enforced: GateInfo;
  attested: GateInfo;
}

const UNKNOWN: GateInfo = { state: 'unknown' };

const STATE_CLS: Record<GateState, string> = {
  unknown: 'bg-[#0f172a] text-slate-500 border-[#334155]',
  yes: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
  no: 'bg-red-900/30 text-red-300 border-red-700/50',
};

function gateTitle(label: string, g: GateInfo): string {
  if (g.state === 'unknown') return `${label}: not assessed yet`;
  const who = g.setBy === 'system' ? 'system' : `by ${g.setBy ?? '?'}`;
  return `${label}: ${g.state} (${who}${g.setAt ? `, ${g.setAt.slice(0, 10)}` : ''})${g.reason ? ` — ${g.reason}` : ''}`;
}

export default function RequirementGatesBadge({
  gates,
  onSet,
}: {
  gates: RequirementGatesValue | undefined;
  onSet: (gate: 'enforced' | 'attested', state: 'yes' | 'no', reason: string) => void;
}) {
  const g: RequirementGatesValue = gates ?? { covered: UNKNOWN, enforced: UNKNOWN, attested: UNKNOWN };
  const [editing, setEditing] = useState<'enforced' | 'attested' | null>(null);
  const [reason, setReason] = useState('');

  const confirm = (state: 'yes' | 'no') => {
    if (!editing || reason.trim().length === 0) return;
    onSet(editing, state, reason.trim());
    setEditing(null);
    setReason('');
  };

  const coveredNotAttested = g.covered.state === 'yes' && g.attested.state !== 'yes';

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {/* covered — Maschinen-Tor, NIE klickbar */}
      <span
        title={gateTitle('covered', g.covered)}
        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${STATE_CLS[g.covered.state]}`}
      >
        C
      </span>
      <button
        aria-label={`enforced: ${g.enforced.state} — set`}
        title={gateTitle('enforced', g.enforced)}
        onClick={() => { setEditing(editing === 'enforced' ? null : 'enforced'); setReason(''); }}
        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono cursor-pointer ${STATE_CLS[g.enforced.state]}`}
      >
        E
      </button>
      <button
        aria-label={`attested: ${g.attested.state} — set`}
        title={gateTitle('attested', g.attested)}
        onClick={() => { setEditing(editing === 'attested' ? null : 'attested'); setReason(''); }}
        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono cursor-pointer ${STATE_CLS[g.attested.state]}`}
      >
        A
      </button>

      {coveredNotAttested && (
        <span className="text-[10px] text-amber-400/90">covered, not attested</span>
      )}

      {editing && (
        <span className="inline-flex items-center gap-1">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`Why? (${editing} — required)`}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[#334155] bg-[#0f172a] text-slate-200 w-44"
          />
          <button
            aria-label="confirm yes"
            disabled={reason.trim().length === 0}
            onClick={() => confirm('yes')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-700/50 text-emerald-300 disabled:opacity-40"
          >
            yes
          </button>
          <button
            aria-label="confirm no"
            disabled={reason.trim().length === 0}
            onClick={() => confirm('no')}
            className="text-[10px] px-1.5 py-0.5 rounded border border-red-700/50 text-red-300 disabled:opacity-40"
          >
            no
          </button>
        </span>
      )}
    </span>
  );
}
