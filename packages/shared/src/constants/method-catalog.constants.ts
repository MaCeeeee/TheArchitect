import type { MethodDefinition, MethodRef } from '../types/method.types';

const APP_TYPES = ['application_component', 'application'];

/** Element types that count as a context (an area of the model): ArchiMate's composite elements. */
export const CONTEXT_ELEMENT_TYPES: readonly string[] = ['grouping', 'location'];

// rung = lowest rung whose structure the inputs need:
// element fields only → 0, relationships → 1, contexts and translations that close a loop → 5

export const METHOD_CATALOG: readonly MethodDefinition[] = [
  // ── Formelbuch Prozessarchitektur (PA) ──
  {
    id: 'PA-kanaele', book: 'process', bookNumber: 9, rung: 0,
    name: 'Communication channels',
    question: 'How fast does coordination effort grow?',
    formula: 'K = n(n − 1) / 2',
    inputs: [{ kind: 'elements', types: ['business_actor', 'business_role'], min: 2, label: 'a minimum of 2 business actors or roles' }],
    limits: 'An upper bound: counts possible connections, not the ones actually used.',
    computedBy: 'none',
  },
  {
    id: 'PA-zyklomatik', book: 'process', bookNumber: 10, rung: 1,
    name: 'Cyclomatic complexity',
    question: 'How many independent paths does a process model have?',
    formula: 'M = E − N + 2P',
    inputs: [
      { kind: 'elements', types: ['process', 'application_process'], min: 2, label: 'a minimum of 2 processes' },
      { kind: 'relationships', types: ['flow', 'triggering'], min: 1, label: 'flow or triggering relationships between processes' },
    ],
    limits: 'Comes from software engineering. Counts parallel branches like decisions although they create no variants.',
    computedBy: 'none',
  },
  {
    id: 'PA-betweenness', book: 'process', bookNumber: 11, rung: 1,
    name: 'Betweenness centrality',
    question: 'Which element does almost everything run through?',
    formula: 'C(v) = Σ σₛₜ(v) / σₛₜ',
    inputs: [
      { kind: 'elements', types: [], min: 3, label: 'a minimum of 3 elements' },
      { kind: 'relationships', min: 1, label: 'a minimum of 1 relationship' },
    ],
    limits: 'Only looks at shortest paths, not volumes. The result is only as good as the completeness of the graph.',
    computedBy: 'cost_engine',
  },
  {
    id: 'PA-pert', book: 'process', bookNumber: 14, rung: 0,
    name: 'Three-point estimate and Monte Carlo',
    question: 'How certain is a date or a budget?',
    formula: 'E = (O + 4M + P) / 6',
    inputs: [
      { kind: 'field', field: 'costEstimateOptimistic', min: 1, label: 'costEstimateOptimistic on a minimum of 1 element' },
      { kind: 'field', field: 'costEstimateMostLikely', min: 1, label: 'costEstimateMostLikely on a minimum of 1 element' },
      { kind: 'field', field: 'costEstimatePessimistic', min: 1, label: 'costEstimatePessimistic on a minimum of 1 element' },
    ],
    limits: 'Only as good as the estimators. If one cause delays several steps, that dependency must be modelled separately.',
    computedBy: 'cost_engine',
  },
  {
    id: 'PA-lernkurve', book: 'process', bookNumber: 16, rung: 0,
    name: "Wright's learning curve",
    question: 'How fast does a new process get cheaper?',
    formula: 'Cₙ = C₁ · n^(log₂ b)',
    inputs: [{ kind: 'field', field: 'userCount', min: 1, label: 'userCount on a minimum of 1 element' }],
    limits: 'Learning does not happen by itself. Staff turnover and process changes reset the curve, and at some point it flattens.',
    computedBy: 'cost_engine',
  },
  {
    id: 'PA-rty', book: 'process', bookNumber: 5, rung: 1,
    name: 'Rolled throughput yield',
    question: 'How many cases run through without rework?',
    formula: 'RTY = FPY₁ · FPY₂ · … · FPYₙ',
    inputs: [
      { kind: 'field', field: 'errorRatePercent', min: 2, label: 'errorRatePercent on a minimum of 2 elements' },
      { kind: 'relationships', types: ['flow', 'triggering'], min: 1, label: 'flow or triggering relationships' },
    ],
    limits: 'Assumes errors occur independently and says nothing about how expensive a single error is.',
    computedBy: 'none',
  },
  {
    id: 'PA-pareto', book: 'process', bookNumber: 17, rung: 0,
    name: 'Pareto principle as power law',
    question: 'How unevenly is the effect spread over the causes?',
    formula: 'S(p) = p^(1 − 1/α)',
    inputs: [{ kind: 'field', field: 'annualCost', min: 5, label: 'annualCost on a minimum of 5 elements' }],
    limits: 'Not every distribution follows a power law. The long tail can matter in sum or hold the critical single cases.',
    computedBy: 'none',
  },
  {
    id: 'PA-kategorientheorie', book: 'process', bookNumber: 20, rung: 5,
    name: 'Composition and functor (loop check)',
    question: 'Do the translations between contexts compose — does one consistent global model exist?',
    formula: 'F(g ∘ f) = F(g) ∘ F(f)',
    inputs: [
      { kind: 'elements', types: [...CONTEXT_ELEMENT_TYPES], min: 2, label: 'a minimum of 2 contexts (grouping or location elements)' },
      { kind: 'translations', min: 2, label: 'a minimum of 2 declared translations between contexts' },
    ],
    limits: 'Sound only for invertible numeric translations such as units or scales. A finding belongs to the whole loop, not to a single translation. Says nothing about translations that were never declared.',
    computedBy: 'ladder',
  },
  // ── Formelbuch Daten- und Applikationsarchitektur (DA) ──
  {
    id: 'DA-kanonisch', book: 'data_application', bookNumber: 17, rung: 1,
    name: 'Canonical data model',
    question: 'How many mappings does the integration need?',
    formula: 'M_direct = n(n − 1) · M_canonical = 2n',
    inputs: [
      // n(n − 1) > 2n only for n ≥ 4 — below that a canonical model can never pay off
      { kind: 'elements', types: APP_TYPES, min: 4, label: 'a minimum of 4 application components' },
      { kind: 'relationships', types: ['flow', 'serving', 'triggering'], min: 1, label: 'flow, serving or triggering relationships' },
    ],
    limits: 'Counts mappings, not their difficulty. One shared model for everything becomes a bottleneck itself; it works per business domain.',
    computedBy: 'none',
  },
  {
    id: 'DA-instabilitaet', book: 'data_application', bookNumber: 18, rung: 1,
    name: 'Instability and main sequence',
    question: 'Which building blocks are hard to change?',
    formula: 'I = Cₑ / (Cₐ + Cₑ) · D = |A + I − 1|',
    inputs: [
      { kind: 'elements', types: APP_TYPES, min: 2, label: 'a minimum of 2 application components' },
      { kind: 'relationships', min: 1, label: 'a minimum of 1 relationship' },
    ],
    limits: 'Developed for object-oriented packages. Says nothing about business quality.',
    computedBy: 'none',
  },
  {
    id: 'DA-propagation', book: 'data_application', bookNumber: 19, rung: 1,
    name: 'Propagation cost',
    question: 'How far does a change spread?',
    formula: 'PC = Σ Vᵢⱼ / n²',
    inputs: [{ kind: 'relationships', min: 1, label: 'a minimum of 1 relationship' }],
    limits: 'Treats every dependency as equally strong and assumes every change propagates. Stable contracts dampen this in practice.',
    computedBy: 'none',
  },
  {
    id: 'DA-metcalfe', book: 'data_application', bookNumber: 20, rung: 1,
    name: "Metcalfe's network effect",
    question: 'Why does a platform only pay off beyond a certain size?',
    formula: 'W ∝ n(n − 1) / 2',
    inputs: [{ kind: 'relationships', min: 1, label: 'a minimum of 1 relationship' }],
    limits: 'A rule of thumb, not a law. Counts possible connections; value only comes from used ones.',
    computedBy: 'cost_engine',
  },
  {
    id: 'DA-technische-schuld', book: 'data_application', bookNumber: 21, rung: 0,
    name: 'Technical debt as compound interest',
    question: 'When does a clean-up pay off?',
    formula: 'K(t) = K₀ · (1 + z)ᵗ',
    inputs: [
      { kind: 'field', field: 'technicalDebtRatio', min: 1, label: 'technicalDebtRatio on a minimum of 1 element' },
      { kind: 'field', field: 'annualCost', min: 1, label: 'annualCost on a minimum of 1 element' },
    ],
    limits: 'A picture, not a measurement. The growth rate can only be estimated from your own data. Debt in blocks nobody changes costs nothing.',
    computedBy: 'none',
  },
  {
    id: 'DA-kapitalwert', book: 'data_application', bookNumber: 22, rung: 0,
    name: 'Net present value',
    question: 'Does the investment pay off?',
    formula: 'NPV = −I₀ + Σ CFₜ / (1 + r)ᵗ',
    inputs: [
      { kind: 'field', field: 'costEstimateMostLikely', min: 1, label: 'costEstimateMostLikely on a minimum of 1 element' },
      { kind: 'field', field: 'successProbability', min: 1, label: 'successProbability on a minimum of 1 element' },
    ],
    limits: 'Only as good as the estimated returns. Benefits from agility and avoided risks do not appear in it.',
    computedBy: 'cost_engine',
  },
];

export function getMethod(id: string): MethodDefinition | undefined {
  return METHOD_CATALOG.find((m) => m.id === id);
}

export function toMethodRef(id: string): MethodRef {
  const m = getMethod(id);
  if (!m) throw new Error(`Unknown method: ${id}`);
  return { id: m.id, name: m.name, question: m.question, formula: m.formula, limits: m.limits };
}
