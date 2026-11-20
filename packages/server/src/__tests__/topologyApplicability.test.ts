/**
 * REQ-METH-001.3 — mechanical method applicability, gated by the ladder rung.
 * Run: cd packages/server && npx jest src/__tests__/topologyApplicability.test.ts
 */
import { METHOD_CATALOG } from '@thearchitect/shared';
import type { LadderRungIndex, ModelFacts } from '@thearchitect/shared';
import { assessApplicability } from '../services/topology/applicability';

const assess = (p: Partial<ModelFacts>, highestRung: LadderRungIndex | null) =>
  assessApplicability({ elementTypeCounts: {}, relationshipTypeCounts: {}, fieldCounts: {}, translationCount: 0, ...p }, highestRung);
const status = (r: ReturnType<typeof assessApplicability>, id: string) => r.find((m) => m.methodId === id)!;

describe('assessApplicability', () => {
  test('model without relationships: structural methods are not computable', () => {
    const r = assess({ elementTypeCounts: { application_component: 89 } }, 0);
    expect(status(r, 'DA-propagation').status).toBe('missing_input');
    expect(status(r, 'PA-betweenness').status).toBe('missing_input');
  });

  test('model with relationships: structural methods computable', () => {
    const r = assess({
      elementTypeCounts: { application_component: 4, process: 3, business_actor: 2 },
      relationshipTypeCounts: { flow: 5, serving: 2 },
    }, 1);
    ['PA-betweenness', 'DA-propagation', 'DA-metcalfe', 'DA-kanonisch', 'DA-instabilitaet', 'PA-kanaele', 'PA-zyklomatik']
      .forEach((id) => expect(status(r, id).status).toBe('computable'));
  });

  test('exactly one missing input → oneInputAway names it', () => {
    const r = assess({ fieldCounts: { annualCost: 3 } }, 0);
    expect(status(r, 'DA-technische-schuld').oneInputAway).toBe('technicalDebtRatio on at least 1 element');
    expect(status(r, 'PA-pert').oneInputAway).toBeNull(); // three fields missing
  });

  test('checks report required vs available counts; the rung check comes last', () => {
    const r = assess({ fieldCounts: { annualCost: 3 } }, 1);
    expect(status(r, 'PA-pareto').checks).toEqual([
      { label: 'annualCost on at least 5 elements', required: 5, available: 3, satisfied: false },
      { label: 'ladder rung 0 reached', required: 0, available: 1, satisfied: true },
    ]);
  });

  test('empty element type list means "any element"', () => {
    const r = assess({ elementTypeCounts: { goal: 2, node: 1 }, relationshipTypeCounts: { association: 1 } }, 1);
    expect(status(r, 'PA-betweenness').status).toBe('computable');
  });

  test('the loop check is never "computable" below rung 5, even with all inputs present', () => {
    const inputs = { elementTypeCounts: { grouping: 2, location: 1 }, translationCount: 3 };
    const noLoop = assess(inputs, 3);
    expect(status(noLoop, 'PA-kategorientheorie').status).toBe('missing_input');
    expect(status(noLoop, 'PA-kategorientheorie').oneInputAway).toBe('ladder rung 5 reached');
    expect(status(noLoop, 'PA-kategorientheorie').rung).toBe(5);
    expect(status(assess(inputs, 5), 'PA-kategorientheorie').status).toBe('computable');
  });

  test('an empty model (no rung reached) has no computable method', () => {
    expect(assess({}, null).every((m) => m.status === 'missing_input')).toBe(true);
  });

  test('covers every catalog method', () => {
    expect(assess({}, null)).toHaveLength(METHOD_CATALOG.length);
  });
});
