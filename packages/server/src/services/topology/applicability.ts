import { METHOD_CATALOG } from '@thearchitect/shared';
import type { LadderRungIndex, MethodApplicability, MethodInput, MethodInputCheck, ModelFacts } from '@thearchitect/shared';

function sumOf(counts: Record<string, number>, keys?: string[]): number {
  const list = keys && keys.length > 0 ? keys : Object.keys(counts);
  return list.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

function check(input: MethodInput, facts: ModelFacts): MethodInputCheck {
  let available = 0;
  if (input.kind === 'elements') available = sumOf(facts.elementTypeCounts, input.types);
  if (input.kind === 'relationships') available = sumOf(facts.relationshipTypeCounts, input.types);
  if (input.kind === 'field') available = facts.fieldCounts[input.field] ?? 0;
  if (input.kind === 'translations') available = facts.translationCount;
  return { label: input.label, required: input.min, available, satisfied: available >= input.min };
}

/**
 * Mechanical: presence counts only, no LLM (REQ-METH-001.3). A method is computable only if
 * its inputs are present AND the model has reached the method's rung — so the applicability
 * can never say "computable" where the ladder says the rung is still open.
 */
export function assessApplicability(facts: ModelFacts, highestRung: LadderRungIndex | null): MethodApplicability[] {
  const reached = highestRung === null ? -1 : highestRung;
  return METHOD_CATALOG.map((method) => {
    const checks = method.inputs.map((input) => check(input, facts));
    checks.push({
      label: `step ${method.rung} of the model check`,
      required: method.rung,
      available: reached,
      satisfied: reached >= method.rung,
    });
    const missing = checks.filter((c) => !c.satisfied);
    return {
      methodId: method.id,
      name: method.name,
      rung: method.rung,
      status: missing.length === 0 ? 'computable' : 'missing_input',
      computedBy: method.computedBy,
      checks,
      oneInputAway: missing.length === 1 ? missing[0].label : null,
    };
  });
}
