// @vitest-environment jsdom
/**
 * REQ-METH-001.5 — ladder panel: rungs in order, next step, cohomology finding with method and limits.
 */
import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LadderPanel from './LadderPanel';
import { useAdvisorStore } from '../../stores/advisorStore';
import type { LadderReport, LadderRung } from '@thearchitect/shared';

const rung = (index: LadderRung['index'], title: string, status: LadderRung['status'], next: string | null = null): LadderRung => ({
  index, title, provides: `provides ${index}`, math: `math ${index}`, status, facts: [{ label: 'count', value: index + 1 }], warnings: [], next,
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
    { methodId: 'DA-technische-schuld', name: 'Technical debt as compound interest', rung: 0, status: 'missing_input', computedBy: 'none', checks: [], oneInputAway: 'technicalDebtRatio on a minimum of 1 element' },
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
    loopDefectCount: 1,
    faceDefects: [],
    faceDefectCount: 0,
    canonicalScale: null,
  }],
};

/** The Math button of the finding for one quantity. */
const findingMath = (quantity: string) => within(screen.getByTestId(`finding-${quantity}`)).getByRole('button', { name: 'Math of this quantity' });
/** The Math button of one step. */
const stepMath = (index: number) => within(screen.getByTestId(`rung-${index}`)).getByRole('button', { name: `Math of step ${index}` });

describe('LadderPanel', () => {
  test('no report → renders nothing', () => {
    const { container } = render(<LadderPanel report={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('collapsed: headline with the highest rung and the method count', () => {
    render(<LadderPanel report={stopped} />);
    expect(screen.getByText('Model check: step 1 of 5')).toBeInTheDocument();
    expect(screen.getByText('The model has the input for 1 of 3 methods.')).toBeInTheDocument();
    expect(screen.queryByText('2 · Cover')).not.toBeInTheDocument();
  });

  test('expanded: six rungs in order, next step only on the open rung, locked rungs show no facts', () => {
    render(<LadderPanel report={stopped} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: /Model check/ })).toHaveAttribute('aria-expanded', 'true');
    const statuses = [0, 1, 2, 3, 4, 5].map((i) => screen.getByTestId(`rung-${i}`).getAttribute('data-status'));
    expect(statuses).toEqual(['reached', 'reached', 'open', 'locked', 'locked', 'locked']);
    expect(screen.getByText('Next step: Model at least 2 contexts.')).toBeInTheDocument();
    expect(screen.queryByText('Next step: Declare a translation.')).not.toBeInTheDocument();
    expect(screen.getByText('count: 3')).toBeInTheDocument();
    expect(screen.queryByText('count: 4')).not.toBeInTheDocument();
    expect(screen.getByText('Technical debt as compound interest — necessary: technicalDebtRatio on a minimum of 1 element')).toBeInTheDocument();
    expect(screen.queryByText(/Three-point estimate/)).not.toBeInTheDocument();
  });

  test('no rung reached → "not started"', () => {
    render(<LadderPanel report={{ ...stopped, highestRung: null }} />);
    expect(screen.getByText('Model check: not started')).toBeInTheDocument();
  });

  test('cohomology finding: verdict, the whole loop with its product, method, formula and limits', () => {
    render(<LadderPanel report={obstructed} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('The conversion factors do not agree along a closed path')).toBeInTheDocument();
    expect(screen.getByText('Each conversion factor is possible. But the result along the closed path is not 1.')).toBeInTheDocument();
    expect(screen.queryByText(/The conversion factors agree at each member/)).not.toBeInTheDocument(); // nothing local was checked
    expect(screen.getByText('3 groups · 3 conversion factors · 1 closed path')).toBeInTheDocument();
    expect(screen.getByText('TE → Logistik ×12 · Logistik → Produktion ÷10 · Produktion → TE ÷1 — result 1.2, must be 1')).toBeInTheDocument();
    expect(screen.getByText('A result between 0.999999 and 1.000001 is equal to 1.')).toBeInTheDocument();
    // the mathematical summary and the method are one click away
    expect(screen.queryByText('Method · PA-kategorientheorie')).not.toBeInTheDocument();
    fireEvent.click(findingMath('default'));
    expect(screen.getByText('3 contexts · 3 translations · 1 independent loop · 0 triple overlaps · dim H¹ = 1')).toBeInTheDocument();
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
    expect(screen.getByText('1 group · 1 conversion factor · 1 closed path')).toBeInTheDocument();
    fireEvent.click(findingMath('default'));
    expect(screen.getByText('1 context · 1 translation · 1 independent loop · 1 triple overlap · dim H¹ = 1')).toBeInTheDocument();
    unmount();
    render(<LadderPanel report={counts(2, 4, 0, 2)} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('2 groups · 4 conversion factors · 0 closed paths')).toBeInTheDocument();
    fireEvent.click(findingMath('default'));
    expect(screen.getByText('2 contexts · 4 translations · 0 independent loops · 2 triple overlaps · dim H¹ = 1')).toBeInTheDocument();
  });

  test('exact result shows the canonical scale and no defect lines', () => {
    const exact: LadderReport = {
      ...obstructed,
      cohomology: [{
        ...obstructed.cohomology[0],
        verdict: 'exact',
        loopDefects: [],
        loopDefectCount: 0,
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
    expect(screen.getByText('The conversion factors agree')).toBeInTheDocument();
    expect(screen.getByText('Scale of each group: TE ×1 · Produktion ×1 · Logistik ×10')).toBeInTheDocument();
    expect(screen.getByText('Scale of each group: X ×1 · Y ×4')).toBeInTheDocument(); // a second, separate group of contexts
    expect(screen.queryByText(/must be 1/)).not.toBeInTheDocument();
  });

  test('a small but real deviation is shown with enough digits', () => {
    const small: LadderReport = {
      ...obstructed,
      cohomology: [{ ...obstructed.cohomology[0], loopDefects: [{ ...obstructed.cohomology[0].loopDefects[0], product: 1.00003 }] }],
    };
    render(<LadderPanel report={small} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/result 1\.00003, must be 1/)).toBeInTheDocument();
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
      cohomology: [{ ...obstructed.cohomology[0], verdict: 'local_defect', faces: 1, h1Dimension: 1, faceDefects: [loop], faceDefectCount: 1, loopDefects: [loop, other], loopDefectCount: 2 }],
    };
    render(<LadderPanel report={local} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('The conversion factors do not agree at a member')).toBeInTheDocument();
    expect(screen.getAllByText(/must be 1/)).toHaveLength(2); // the shared loop once, the other loop once
    expect(screen.getByText('TE → Einkauf ×2 · Einkauf → TE ×3 — result 6, must be 1')).toBeInTheDocument();
  });

  test('global contradiction with triple overlaps says that the local checks passed', () => {
    const withFaces: LadderReport = { ...obstructed, cohomology: [{ ...obstructed.cohomology[0], faces: 2, h1Dimension: 1 }] };
    render(<LadderPanel report={withFaces} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('The conversion factors agree at each member. But the result along the closed path is not 1.')).toBeInTheDocument();
  });

  test('a product outside the range of a number is said in words, the panel does not break', () => {
    const [loop] = obstructed.cohomology[0].loopDefects;
    const beyond: LadderReport = { ...obstructed, cohomology: [{ ...obstructed.cohomology[0], loopDefects: [{ ...loop, product: null }] }] };
    render(<LadderPanel report={beyond} />);
    fireEvent.click(screen.getByRole('button'));
    expect(
      screen.getByText('TE → Logistik ×12 · Logistik → Produktion ÷10 · Produktion → TE ÷1 — result too large or too small to show, must be 1'),
    ).toBeInTheDocument();
  });

  test('a scale outside the range of a number is said in words, the panel does not break', () => {
    const beyond: LadderReport = {
      ...obstructed,
      cohomology: [{
        ...obstructed.cohomology[0],
        verdict: 'exact',
        loopDefects: [],
        loopDefectCount: 0,
        canonicalScale: [
          { contextId: 'te', contextName: 'TE', factor: 1, component: 1 },
          { contextId: 'log', contextName: 'Logistik', factor: null, component: 1 },
        ],
      }],
    };
    render(<LadderPanel report={beyond} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Scale of each group: TE ×1 · Logistik (too large or too small to show)')).toBeInTheDocument();
  });

  test('more defects than the report lists: the rest is counted after the list', () => {
    const [loop] = obstructed.cohomology[0].loopDefects;
    const listed = Array.from({ length: 20 }, (_, i) => ({ ...loop, steps: loop.steps.map((s) => ({ ...s, relationshipId: `${s.relationshipId}-${i}` })) }));
    const many: LadderReport = { ...obstructed, cohomology: [{ ...obstructed.cohomology[0], loopDefects: listed, loopDefectCount: 604 }] };
    const { unmount } = render(<LadderPanel report={many} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText(/must be 1/)).toHaveLength(20);
    expect(screen.getByText('and 584 more closed paths')).toBeInTheDocument();
    unmount();

    const local: LadderReport = {
      ...obstructed,
      cohomology: [{ ...obstructed.cohomology[0], verdict: 'local_defect', faces: 40, faceDefects: [loop], faceDefectCount: 29, loopDefects: listed, loopDefectCount: 21 }],
    };
    render(<LadderPanel report={local} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('and 28 more sets of three conversion factors and 1 more closed path')).toBeInTheDocument();
  });

  test('long names without a place to break can wrap inside the narrow panel', () => {
    // jsdom does not lay out a page, so an overflow cannot be measured here. The test pins the
    // classes that let a name without spaces break and let the flex child holding it shrink.
    const WRAP = '[overflow-wrap:anywhere]';
    const quantity = 'net_weight_per_packaging_unit_including_pallet_and_wrapping_kilo'; // 64 characters, the longest accepted
    const context = 'Customer_Relationship_Management_Platform_Europe_Central';
    const [loop] = obstructed.cohomology[0].loopDefects;
    const warning = `The check does not include 1 quantity. This quantity is "${quantity}" (501 conversion factors).`;
    const long: LadderReport = {
      ...obstructed,
      rungs: obstructed.rungs.map((r) => (r.index === 4 ? { ...r, warnings: [warning] } : r)),
      cohomology: [
        { ...obstructed.cohomology[0], quantity, loopDefects: [{ ...loop, steps: loop.steps.map((s) => ({ ...s, fromContext: context })) }] },
        {
          ...obstructed.cohomology[0],
          quantity: 'pieces',
          verdict: 'exact',
          loopDefects: [],
          loopDefectCount: 0,
          canonicalScale: [{ contextId: 'crm', contextName: context, factor: 1, component: 1 }],
        },
      ],
    };
    render(<LadderPanel report={long} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText(warning)).toHaveClass(WRAP);
    const rungTexts = [...screen.getByTestId('rung-4').querySelectorAll('p')];
    expect(rungTexts).toHaveLength(4); // title, provides, facts, warning
    for (const text of rungTexts) expect(text).toHaveClass(WRAP);

    const header = screen.getByText(`quantity: ${quantity}`);
    expect(header).toHaveClass('min-w-0', WRAP);
    expect(header.parentElement).toHaveClass('flex');
    expect(screen.getByText(new RegExp(`^${context} → .* must be 1$`))).toHaveClass(WRAP);
    expect(screen.getByText(`Scale of each group: ${context} ×1`)).toHaveClass(WRAP);
  });

  test('the next step of an open rung can wrap as well', () => {
    render(<LadderPanel report={stopped} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Next step: Model at least 2 contexts.')).toHaveClass('[overflow-wrap:anywhere]');
  });

  test('Math of a step: closed at first, one click shows the mathematical wording of that step only', () => {
    render(<LadderPanel report={stopped} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('provides 1')).toBeInTheDocument();
    expect(screen.queryByText('math 1')).not.toBeInTheDocument();

    const button = stepMath(1);
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const region = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(region).not.toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(region).toBeVisible();
    expect(region).toHaveTextContent('math 1');
    expect(screen.getByText('math 1')).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.queryByText('math 0')).not.toBeInTheDocument();
    expect(screen.queryByText('math 2')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('math 1')).not.toBeInTheDocument();
  });

  test('every step has its own Math button, a locked step as well, each with its own region', () => {
    render(<LadderPanel report={stopped} />);
    fireEvent.click(screen.getByRole('button'));
    const buttons = [0, 1, 2, 3, 4, 5].map(stepMath);
    expect(new Set(buttons.map((b) => b.getAttribute('aria-controls'))).size).toBe(6);
    fireEvent.click(buttons[4]);
    expect(screen.getByText('math 4')).toBeInTheDocument();
    expect(screen.queryByText('count: 5')).not.toBeInTheDocument(); // a locked step still shows no numbers
  });

  test('Math of a finding: closed at first; it holds the mathematical summary and the method, the tolerance stays in view', () => {
    render(<LadderPanel report={obstructed} />);
    fireEvent.click(screen.getByRole('button'));
    const button = findingMath('default');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const region = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(region).not.toBeVisible();
    for (const hidden of [/dim H¹/, 'Method · PA-kategorientheorie', 'Composition and functor (loop check)', 'F(g ∘ f) = F(g) ∘ F(f)', /^Limits:/]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
    expect(screen.getByText('A result between 0.999999 and 1.000001 is equal to 1.')).toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(region).toBeVisible();
    expect(within(region).getByText('3 contexts · 3 translations · 1 independent loop · 0 triple overlaps · dim H¹ = 1')).toBeInTheDocument();
    expect(within(region).getByText('Method · PA-kategorientheorie')).toBeInTheDocument();
    expect(within(region).getByText('Composition and functor (loop check)')).toBeInTheDocument();
    expect(within(region).getByText('F(g ∘ f) = F(g) ∘ F(f)')).toBeInTheDocument();
    expect(within(region).getByText('Limits: Sound only for invertible numeric translations.')).toBeInTheDocument();
    expect(within(region).queryByText(/is equal to 1/)).not.toBeInTheDocument();
  });

  test('the tolerance is shown as the two bounds the check uses: exp(-tolerance) and exp(tolerance)', () => {
    // The check compares the sum of the logarithms with 0. The bounds of the result are thus
    // exp(∓tolerance), not 1 ∓ tolerance: 0.999 itself is outside (log 0.999 = -0.0010005).
    render(<LadderPanel report={{ ...obstructed, tolerance: 0.001 }} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('A result between 0.9990005 and 1.001001 is equal to 1.')).toBeInTheDocument();
  });

  test('each Math button says what it belongs to, shows only "Math", and is 16 px high or more', () => {
    render(<LadderPanel report={obstructed} />);
    fireEvent.click(screen.getByRole('button'));
    const buttons = [...[0, 1, 2, 3, 4, 5].map(stepMath), findingMath('default')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Math of step 0', 'Math of step 1', 'Math of step 2', 'Math of step 3', 'Math of step 4', 'Math of step 5', 'Math of this quantity',
    ]);
    for (const button of buttons) {
      expect(button).toHaveTextContent(/^Math$/);
      // jsdom does not lay out a page: the test pins the classes that give the height.
      expect(button).toHaveClass('min-h-4', 'py-1');
    }
  });

  test('every defect listed: no line about more', () => {
    render(<LadderPanel report={obstructed} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText(/^and \d+ more/)).not.toBeInTheDocument();
  });
});

test('a marked rung opens the panel and marks its row once (UC-METH-002)', () => {
  useAdvisorStore.setState({ focusRung: 2 });
  const { unmount } = render(<LadderPanel report={stopped} />);
  expect(screen.getByTestId('rung-2')).toHaveAttribute('data-focused', 'true');
  expect(screen.getByTestId('rung-1')).not.toHaveAttribute('data-focused');
  expect(useAdvisorStore.getState().focusRung).toBeNull(); // used once
  unmount();
  render(<LadderPanel report={stopped} />);
  expect(screen.queryByTestId('rung-2')).not.toBeInTheDocument(); // collapsed again on a new mount
});
