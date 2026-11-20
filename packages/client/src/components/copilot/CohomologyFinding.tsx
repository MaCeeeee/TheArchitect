import { useId, useState } from 'react';
import type { CanonicalScale, CohomologyResult, MethodRef, TranslationLoopDefect, TranslationStep } from '@thearchitect/shared';
import { LADDER_MATH_TEXT, LADDER_TEXT } from './ladderText';
import { MathToggle } from './MathToggle';

function verdictOf(result: CohomologyResult): { label: string; text: string; tone: string } {
  if (result.verdict === 'exact') {
    return { label: LADDER_TEXT.exactTitle, text: LADDER_TEXT.exactText, tone: 'text-[#00ff41]' };
  }
  if (result.verdict === 'local_defect') {
    return { label: LADDER_TEXT.localTitle, text: LADDER_TEXT.localText, tone: 'text-orange-400' };
  }
  return {
    label: LADDER_TEXT.globalTitle,
    // Only claim that the check at each member passed if there was a member to check at.
    text: result.faces > 0 ? LADDER_TEXT.globalTextMembersAgree : LADDER_TEXT.globalText,
    tone: 'text-orange-400',
  };
}

/** Seven significant digits: enough to show any deviation that exceeds the tolerance. null: outside the range of a number. */
function formatNumber(value: number | null): string | null {
  return value === null ? null : String(Number(value.toPrecision(7)));
}

/** A bound of the tolerance around 1: 0.999999 or 1.000001, without the noise of floating point. */
function formatBound(value: number): string {
  return String(Number(value.toPrecision(12)));
}

function formatScale(scale: CanonicalScale): string {
  return LADDER_TEXT.scaleEntry(scale.contextName, formatNumber(scale.factor));
}

function formatStep(step: TranslationStep): string {
  const operator = step.direction === 'forward' ? '×' : '÷';
  return `${step.fromContext} → ${step.toContext} ${operator}${formatNumber(step.factor)}`;
}

function loopKey(defect: TranslationLoopDefect): string {
  return defect.steps.map((s) => s.relationshipId).sort().join('+');
}

function DefectLine({ defect }: { defect: TranslationLoopDefect }) {
  return (
    <li className="text-[9px] text-[var(--text-secondary)] leading-relaxed [overflow-wrap:anywhere]">
      {`${defect.steps.map(formatStep).join(' · ')} — ${LADDER_TEXT.result(formatNumber(defect.product))}`}
    </li>
  );
}

interface CohomologyFindingProps {
  result: CohomologyResult;
  method: MethodRef;
  tolerance: number;
}

export default function CohomologyFinding({ result, method, tolerance }: CohomologyFindingProps) {
  const [mathOpen, setMathOpen] = useState(false);
  const mathId = useId();
  const verdict = verdictOf(result);
  // A local contradiction shows the triple overlaps first, then every loop that is not one of them.
  const faceKeys = new Set(result.faceDefects.map(loopKey));
  const defects =
    result.verdict === 'local_defect'
      ? [...result.faceDefects, ...result.loopDefects.filter((d) => !faceKeys.has(loopKey(d)))]
      : result.loopDefects;
  // The report lists only the first defects of each kind and counts all of them. The counts are
  // those of the report: a loop that runs along a triple overlap is counted as both.
  const moreFaces = result.faceDefectCount - result.faceDefects.length;
  const moreLoops = result.loopDefectCount - result.loopDefects.length;
  const components = [...new Set((result.canonicalScale ?? []).map((s) => s.component))].sort((a, b) => a - b);

  return (
    <div className="rounded border border-[#334155] bg-white/[0.02] p-2 space-y-1.5" data-testid={`finding-${result.quantity}`}>
      {/* The title is a whole sentence: it may wrap, and the quantity moves below it when the row is full. */}
      <div className="flex flex-wrap items-center gap-x-1.5">
        <span className={`text-[10px] font-medium min-w-0 [overflow-wrap:anywhere] ${verdict.tone}`}>{verdict.label}</span>
        <span className="text-[8px] text-[var(--text-disabled)] ml-auto min-w-0 [overflow-wrap:anywhere]">{LADDER_TEXT.quantity(result.quantity)}</span>
      </div>
      <p className="text-[9px] text-[var(--text-secondary)]">{verdict.text}</p>
      <p className="text-[8px] text-[var(--text-tertiary)]">
        {LADDER_TEXT.summary(result.contextCount, result.translationCount, result.independentLoops)}
      </p>

      {defects.length > 0 && (
        <ul className="space-y-0.5 list-none">
          {defects.map((defect) => (
            <DefectLine key={loopKey(defect)} defect={defect} />
          ))}
          {(moreFaces > 0 || moreLoops > 0) && (
            <li className="text-[9px] text-[var(--text-tertiary)]">{LADDER_TEXT.more(Math.max(moreFaces, 0), Math.max(moreLoops, 0))}</li>
          )}
        </ul>
      )}

      {components.map((component) => (
        <p key={component} className="text-[9px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">
          {LADDER_TEXT.scale(
            (result.canonicalScale ?? [])
              .filter((s) => s.component === component)
              .map(formatScale)
              .join(' · '),
          )}
        </p>
      ))}

      <p className="text-[8px] text-[var(--text-tertiary)]">{LADDER_TEXT.tolerance(formatBound(1 - tolerance), formatBound(1 + tolerance))}</p>

      <MathToggle open={mathOpen} controls={mathId} onToggle={() => setMathOpen(!mathOpen)} />
      <div id={mathId} hidden={!mathOpen}>
        {mathOpen && (
          <div className="border-t border-[#334155] pt-1 space-y-0.5">
            <p className="text-[8px] text-[var(--text-tertiary)] [overflow-wrap:anywhere]">
              {LADDER_MATH_TEXT.summary(result.contextCount, result.translationCount, result.independentLoops, result.faces, result.h1Dimension)}
            </p>
            <p className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">{LADDER_MATH_TEXT.method(method.id)}</p>
            <p className="text-[9px] text-[var(--text-secondary)]">{method.name}</p>
            <p className="text-[9px] font-mono text-white">{method.formula}</p>
            <p className="text-[8px] text-[var(--text-tertiary)] leading-relaxed">{LADDER_MATH_TEXT.limits(method.limits)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
