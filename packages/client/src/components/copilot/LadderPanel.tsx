import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Lock, Sigma } from 'lucide-react';
import type { LadderReport, LadderRung } from '@thearchitect/shared';
import CohomologyFinding from './CohomologyFinding';

function RungIcon({ status }: { status: LadderRung['status'] }) {
  if (status === 'reached') return <CheckCircle2 size={10} className="text-[#00ff41] shrink-0 mt-0.5" />;
  if (status === 'open') return <Circle size={10} className="text-yellow-400 shrink-0 mt-0.5" />;
  return <Lock size={10} className="text-[var(--text-disabled)] shrink-0 mt-0.5" />;
}

function RungRow({ rung }: { rung: LadderRung }) {
  return (
    <li className="flex gap-1.5" data-testid={`rung-${rung.index}`} data-status={rung.status}>
      <RungIcon status={rung.status} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] text-white [overflow-wrap:anywhere]">{`${rung.index} · ${rung.title}`}</p>
        <p className="text-[8px] text-[var(--text-tertiary)] [overflow-wrap:anywhere]">{rung.provides}</p>
        {rung.status !== 'locked' && (
          <p className="text-[8px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">
            {rung.facts.map((fact) => `${fact.label}: ${fact.value}`).join(' · ')}
          </p>
        )}
        {rung.status !== 'locked' &&
          rung.warnings.map((warning) => (
            <p key={warning} className="text-[8px] text-yellow-400 [overflow-wrap:anywhere]">{warning}</p>
          ))}
        {rung.status === 'open' && rung.next && (
          <p className="text-[9px] text-[#7c3aed] [overflow-wrap:anywhere]">{`Next: ${rung.next}`}</p>
        )}
      </div>
    </li>
  );
}

interface LadderPanelProps {
  report: LadderReport | null;
}

export default function LadderPanel({ report }: LadderPanelProps) {
  const [open, setOpen] = useState(false);
  if (!report) return null;

  const computable = report.methods.filter((m) => m.status === 'computable').length;
  const oneAway = report.methods.filter((m) => m.status === 'missing_input' && m.oneInputAway);
  const headline =
    report.highestRung === null
      ? 'Ladder to cohomology: not started'
      : `Ladder to cohomology: rung ${report.highestRung} of 5`;

  return (
    <div className="mx-2 mt-2 rounded border border-[#334155] bg-white/[0.02]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left"
      >
        <Sigma size={10} className="text-[#7c3aed]" />
        <span className="text-[10px] text-white">{headline}</span>
        <span className="text-[8px] text-[var(--text-disabled)] ml-auto">{`${computable} of ${report.methods.length} methods computable`}</span>
        {open ? <ChevronDown size={10} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={10} className="text-[var(--text-tertiary)]" />}
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-2">
          <ul className="space-y-1.5 list-none">
            {report.rungs.map((rung) => (
              <RungRow key={rung.index} rung={rung} />
            ))}
          </ul>

          {report.cohomology.map((result) => (
            <CohomologyFinding key={result.quantity} result={result} method={report.cohomologyMethod} tolerance={report.tolerance} />
          ))}

          {oneAway.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">Methods with one more input</span>
              {oneAway.map((m) => (
                <p key={m.methodId} className="text-[9px] text-[var(--text-secondary)]">{`${m.name} — needs ${m.oneInputAway}`}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
