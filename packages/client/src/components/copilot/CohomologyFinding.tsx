import type { CohomologyResult, MethodRef, TranslationLoopDefect, TranslationStep } from '@thearchitect/shared';

function verdictOf(result: CohomologyResult): { label: string; text: string; tone: string } {
  if (result.verdict === 'exact') {
    return {
      label: 'Consistent',
      text: 'All translations compose. One consistent scale per context exists.',
      tone: 'text-[#00ff41]',
    };
  }
  if (result.verdict === 'local_defect') {
    return {
      label: 'Local contradiction',
      text: 'Contexts that share a member disagree about their translations.',
      tone: 'text-orange-400',
    };
  }
  return {
    label: 'Global contradiction',
    // Only claim that local checks passed if there was something local to check.
    text:
      result.faces > 0
        ? 'Every triple overlap is consistent, but the translations do not close around a loop.'
        : 'The translations do not close around a loop.',
    tone: 'text-orange-400',
  };
}

/** Seven significant digits: enough to show any deviation that exceeds the tolerance. */
function formatNumber(value: number): string {
  return String(Number(value.toPrecision(7)));
}

/** "1 loop", "2 loops" */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
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
    <li className="text-[9px] text-[var(--text-secondary)] leading-relaxed">
      {`${defect.steps.map(formatStep).join(' · ')} — product ${formatNumber(defect.product)}, expected 1`}
    </li>
  );
}

interface CohomologyFindingProps {
  result: CohomologyResult;
  method: MethodRef;
  tolerance: number;
}

export default function CohomologyFinding({ result, method, tolerance }: CohomologyFindingProps) {
  const verdict = verdictOf(result);
  // A local contradiction shows the triple overlaps first, then every loop that is not one of them.
  const faceKeys = new Set(result.faceDefects.map(loopKey));
  const defects =
    result.verdict === 'local_defect'
      ? [...result.faceDefects, ...result.loopDefects.filter((d) => !faceKeys.has(loopKey(d)))]
      : result.loopDefects;
  const components = [...new Set((result.canonicalScale ?? []).map((s) => s.component))].sort((a, b) => a - b);

  return (
    <div className="rounded border border-[#334155] bg-white/[0.02] p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-medium ${verdict.tone}`}>{verdict.label}</span>
        <span className="text-[8px] text-[var(--text-disabled)] ml-auto">{`quantity: ${result.quantity}`}</span>
      </div>
      <p className="text-[9px] text-[var(--text-secondary)]">{verdict.text}</p>
      <p className="text-[8px] text-[var(--text-tertiary)]">
        {`${counted(result.contextCount, 'context')} · ${counted(result.translationCount, 'translation')} · ${counted(result.independentLoops, 'independent loop')} · ${counted(result.faces, 'triple overlap')} · dim H¹ = ${result.h1Dimension}`}
      </p>

      {defects.length > 0 && (
        <ul className="space-y-0.5 list-none">
          {defects.map((defect) => (
            <DefectLine key={loopKey(defect)} defect={defect} />
          ))}
        </ul>
      )}

      {components.map((component) => (
        <p key={component} className="text-[9px] text-[var(--text-secondary)]">
          {`Canonical scale: ${(result.canonicalScale ?? [])
            .filter((s) => s.component === component)
            .map((s) => `${s.contextName} ×${formatNumber(s.factor)}`)
            .join(' · ')}`}
        </p>
      ))}

      <div className="border-t border-[#334155] pt-1 space-y-0.5">
        <p className="text-[8px] text-[var(--text-tertiary)] uppercase tracking-wider">{`Method · ${method.id}`}</p>
        <p className="text-[9px] text-[var(--text-secondary)]">{method.name}</p>
        <p className="text-[9px] font-mono text-white">{method.formula}</p>
        <p className="text-[8px] text-[var(--text-tertiary)] leading-relaxed">{`Limits: ${method.limits}`}</p>
        <p className="text-[8px] text-[var(--text-tertiary)]">{`A product counts as 1 within a tolerance of ${tolerance}.`}</p>
      </div>
    </div>
  );
}
