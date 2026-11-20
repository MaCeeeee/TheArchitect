// @vitest-environment jsdom
/**
 * REQ-METH-001.5 — ladder panel: rungs in order, next step, cohomology finding with method and limits.
 */
import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LadderPanel from './LadderPanel';
import type { LadderReport, LadderRung } from '@thearchitect/shared';

const rung = (index: LadderRung['index'], title: string, status: LadderRung['status'], next: string | null = null): LadderRung => ({
  index, title, provides: `provides ${index}`, status, facts: [{ label: 'count', value: index + 1 }], warnings: [], next,
});

const method = {
  id: 'PA-kategorientheorie',
  name: 'Composition and functor (loop check)',
  question: 'Do the translations between contexts compose?',
  formula: 'F(g ∘ f) = F(g) ∘ F(f)',
  limits: 'Sound only for invertible numeric translations.',
};

const stopped: LadderReport = {
  projectId: 'p1',
  highestRung: 1,
  rungs: [
    rung(0, 'Identity', 'reached'),
    rung(1, 'Directed graph', 'reached'),
    rung(2, 'Cover', 'open', 'Model at least 2 contexts.'),
    rung(3, 'Coefficients', 'locked', 'Declare a translation.'),
    rung(4, 'Gluing testable', 'locked', 'Close a loop.'),
    rung(5, 'Cohomology', 'locked', 'Reach rungs 0 to 4 first.'),
  ],
  cohomology: [],
  tolerance: 0.000001,
  cohomologyMethod: method,
  methods: [
    { methodId: 'DA-propagation', name: 'Propagation cost', rung: 1, status: 'computable', computedBy: 'none', checks: [], oneInputAway: null },
    { methodId: 'DA-technische-schuld', name: 'Technical debt as compound interest', rung: 0, status: 'missing_input', computedBy: 'none', checks: [], oneInputAway: 'technicalDebtRatio on at least 1 element' },
    { methodId: 'PA-pert', name: 'Three-point estimate and Monte Carlo', rung: 1, status: 'missing_input', computedBy: 'cost_engine', checks: [], oneInputAway: null },
  ],
  timestamp: '2026-11-20T12:00:00.000Z',
};

const obstructed: LadderReport = {
  ...stopped,
  highestRung: 5,
  rungs: stopped.rungs.map((r) => ({ ...r, status: 'reached' as const, next: null })),
  cohomology: [{
    quantity: 'default',
    verdict: 'global_obstruction',
    contextCount: 3,
    translationCount: 3,
    independentLoops: 1,
    faces: 0,
    h1Dimension: 1,
    loopDefects: [{
      steps: [
        { relationshipId: 't3', fromContext: 'TE', toContext: 'Logistik', factor: 12, direction: 'forward' },
        { relationshipId: 't2', fromContext: 'Logistik', toContext: 'Produktion', factor: 10, direction: 'reverse' },
        { relationshipId: 't1', fromContext: 'Produktion', toContext: 'TE', factor: 1, direction: 'reverse' },
      ],
      product: 1.2,
    }],
    faceDefects: [],
    canonicalScale: null,
  }],
};

describe('LadderPanel', () => {
  test('no report → renders nothing', () => {
    const { container } = render(<LadderPanel report={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('collapsed: headline with the highest rung and the method count', () => {
    render(<LadderPanel report={stopped} />);
    expect(screen.getByText('Ladder to cohomology: rung 1 of 5')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 methods computable')).toBeInTheDocument();
    expect(screen.queryByText('2 · Cover')).not.toBeInTheDocument();
  });

  test('expanded: six rungs in order, next step only on the open rung, locked rungs show no facts', () => {
    render(<LadderPanel report={stopped} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    const statuses = [0, 1, 2, 3, 4, 5].map((i) => screen.getByTestId(`rung-${i}`).getAttribute('data-status'));
    expect(statuses).toEqual(['reached', 'reached', 'open', 'locked', 'locked', 'locked']);
    expect(screen.getByText('Next: Model at least 2 contexts.')).toBeInTheDocument();
    expect(screen.queryByText('Next: Declare a translation.')).not.toBeInTheDocument();
    expect(screen.getByText('count: 3')).toBeInTheDocument();
    expect(screen.queryByText('count: 4')).not.toBeInTheDocument();
    expect(screen.getByText('Technical debt as compound interest — needs technicalDebtRatio on at least 1 element')).toBeInTheDocument();
    expect(screen.queryByText(/Three-point estimate/)).not.toBeInTheDocument();
  });

  test('no rung reached → "not started"', () => {
    render(<LadderPanel report={{ ...stopped, highestRung: null }} />);
    expect(screen.getByText('Ladder to cohomology: not started')).toBeInTheDocument();
  });

  test('cohomology finding: verdict, the whole loop with its product, method, formula and limits', () => {
    render(<LadderPanel report={obstructed} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Global contradiction')).toBeInTheDocument();
    expect(screen.getByText('The translations do not close around a loop.')).toBeInTheDocument();
    expect(screen.queryByText(/Every triple overlap is consistent/)).not.toBeInTheDocument(); // nothing local was checked
    expect(screen.getByText('3 contexts · 3 translations · 1 independent loop · 0 triple overlaps · dim H¹ = 1')).toBeInTheDocument();
    expect(screen.getByText('TE → Logistik ×12 · Logistik → Produktion ÷10 · Produktion → TE ÷1 — product 1.2, expected 1')).toBeInTheDocument();
    expect(screen.getByText('A product counts as 1 within a tolerance of 0.000001.')).toBeInTheDocument();
    expect(screen.getByText('Method · PA-kategorientheorie')).toBeInTheDocument();
    expect(screen.getByText('F(g ∘ f) = F(g) ∘ F(f)')).toBeInTheDocument();
    expect(screen.getByText('Limits: Sound only for invertible numeric translations.')).toBeInTheDocument();
  });

  test('the count line uses the singular for 1 and the plural otherwise', () => {
    const counts = (contextCount: number, translationCount: number, independentLoops: number, faces: number): LadderReport => ({
      ...obstructed,
      cohomology: [{ ...obstructed.cohomology[0], contextCount, translationCount, independentLoops, faces }],
    });
    const { unmount } = render(<LadderPanel report={counts(1, 1, 1, 1)} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('1 context · 1 translation · 1 independent loop · 1 triple overlap · dim H¹ = 1')).toBeInTheDocument();
    unmount();
    render(<LadderPanel report={counts(2, 4, 0, 2)} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('2 contexts · 4 translations · 0 independent loops · 2 triple overlaps · dim H¹ = 1')).toBeInTheDocument();
  });

  test('exact result shows the canonical scale and no defect lines', () => {
    const exact: LadderReport = {
      ...obstructed,
      cohomology: [{
        ...obstructed.cohomology[0],
        verdict: 'exact',
        loopDefects: [],
        canonicalScale: [
          { contextId: 'te', contextName: 'TE', factor: 1, component: 1 },
          { contextId: 'prod', contextName: 'Produktion', factor: 1, component: 1 },
          { contextId: 'log', contextName: 'Logistik', factor: 10, component: 1 },
          { contextId: 'x', contextName: 'X', factor: 1, component: 2 },
          { contextId: 'y', contextName: 'Y', factor: 4, component: 2 },
        ],
      }],
    };
    render(<LadderPanel report={exact} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Consistent')).toBeInTheDocument();
    expect(screen.getByText('Canonical scale: TE ×1 · Produktion ×1 · Logistik ×10')).toBeInTheDocument();
    expect(screen.getByText('Canonical scale: X ×1 · Y ×4')).toBeInTheDocument(); // a second, separate group of contexts
    expect(screen.queryByText(/expected 1/)).not.toBeInTheDocument();
  });

  test('a small but real deviation is shown with enough digits', () => {
    const small: LadderReport = {
      ...obstructed,
      cohomology: [{ ...obstructed.cohomology[0], loopDefects: [{ ...obstructed.cohomology[0].loopDefects[0], product: 1.00003 }] }],
    };
    render(<LadderPanel report={small} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/product 1\.00003, expected 1/)).toBeInTheDocument();
  });

  test('local contradiction: the triple overlap first, then any further loop that is not the same one', () => {
    const [loop] = obstructed.cohomology[0].loopDefects;
    const other = {
      steps: [
        { relationshipId: 't4', fromContext: 'TE', toContext: 'Einkauf', factor: 2, direction: 'forward' as const },
        { relationshipId: 't5', fromContext: 'Einkauf', toContext: 'TE', factor: 3, direction: 'forward' as const },
      ],
      product: 6,
    };
    const local: LadderReport = {
      ...obstructed,
      cohomology: [{ ...obstructed.cohomology[0], verdict: 'local_defect', faces: 1, h1Dimension: 1, faceDefects: [loop], loopDefects: [loop, other] }],
    };
    render(<LadderPanel report={local} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Local contradiction')).toBeInTheDocument();
    expect(screen.getAllByText(/expected 1/)).toHaveLength(2); // the shared loop once, the other loop once
    expect(screen.getByText('TE → Einkauf ×2 · Einkauf → TE ×3 — product 6, expected 1')).toBeInTheDocument();
  });

  test('global contradiction with triple overlaps says that the local checks passed', () => {
    const withFaces: LadderReport = { ...obstructed, cohomology: [{ ...obstructed.cohomology[0], faces: 2, h1Dimension: 1 }] };
    render(<LadderPanel report={withFaces} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Every triple overlap is consistent, but the translations do not close around a loop.')).toBeInTheDocument();
  });
});
