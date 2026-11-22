import { useId, useState } from 'react';
import type { ChangeRingReport, RingHint } from '@thearchitect/shared';
import { LADDER_MATH_TEXT, LADDER_TEXT } from './ladderText';
import { MathToggle } from './MathToggle';

function Hint({ hint }: { hint: RingHint }) {
  return <p className="text-[9px] text-[#7c3aed] [overflow-wrap:anywhere]">{hint.text}</p>;
}

export default function ChangeRingSection({ report }: { report: ChangeRingReport | undefined }) {
  const [mathOpen, setMathOpen] = useState(false);
  const mathId = useId();
  if (!report) return null;
  return (
    <div className="space-y-1" data-testid="change-rings">
      <span className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">{LADDER_TEXT.changeFoldersHeading}</span>
      <MathToggle open={mathOpen} controls={mathId} label={LADDER_TEXT.mathOfChangeFolders} onToggle={() => setMathOpen(!mathOpen)} />
      <div id={mathId} hidden={!mathOpen}>
        {mathOpen && (
          <span className="block text-[8px] text-[var(--text-tertiary)] [overflow-wrap:anywhere]">{`${LADDER_MATH_TEXT.changeFolders} ${report.method.formula} — ${report.method.limits}`}</span>
        )}
      </div>
      {report.hints.map((hint, i) => <Hint key={`${i}-${hint.kind}-${hint.elementIds.join(',')}`} hint={hint} />)}
      {report.folders.map((f) => (
        <div key={f.folder.id} data-testid={`ring-folder-${f.folder.id}`} data-checked={String(f.checked)} className="space-y-0.5">
          <p className="text-[10px] text-white [overflow-wrap:anywhere]">{f.folder.name}</p>
          {f.findings.map((x, i) => (
            <p key={`${i}-${x.rule}-${x.first.id}-${x.second?.id ?? ''}-${x.part?.id ?? ''}`} className="text-[8px] text-yellow-400 [overflow-wrap:anywhere]">{x.text}</p>
          ))}
          {f.hints.map((hint, i) => <Hint key={`${i}-${hint.kind}-${hint.elementIds.join(',')}`} hint={hint} />)}
          {f.checked && f.findings.length === 0 && (
            <p className="text-[8px] text-[#00ff41]">{LADDER_TEXT.changeFolderClean}</p>
          )}
        </div>
      ))}
    </div>
  );
}
