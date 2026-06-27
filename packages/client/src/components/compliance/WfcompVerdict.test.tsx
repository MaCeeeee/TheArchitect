// @vitest-environment jsdom
/**
 * REQ-WFCOMP-001.6 (THE-357) — WfcompVerdict tests. Gates G10–G12 + obviousness.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { WfcompGapReport } from '@thearchitect/shared';
import WfcompVerdict from './WfcompVerdict';

// In-scope, mixed M2 state: d/e covered, b suggested, a/c/f/g open.
const mixed: WfcompGapReport = {
  gdprScope: true,
  fields: [
    { litera: 'a', criticality: 'HART', status: 'needs_attestation', mode: 'ask' },
    { litera: 'b', criticality: 'HART', status: 'needs_attestation', mode: 'confirm', suggestion: { litera: 'b', value: 'Manage newsletter subscriptions', confidence: 0.9, rationale: 'r', provenance: 'ai_generated' } },
    { litera: 'c', criticality: 'HART', status: 'needs_attestation', mode: 'ask' },
    { litera: 'd', criticality: 'HART', status: 'present' },
    { litera: 'e', criticality: 'BEDINGT', status: 'present' },
    { litera: 'f', criticality: 'WEICH', status: 'needs_attestation', mode: 'ask' },
    { litera: 'g', criticality: 'WEICH', status: 'needs_attestation', mode: 'ask' },
  ],
};

const complete: WfcompGapReport = {
  gdprScope: true,
  fields: (['a', 'b', 'c', 'd'] as const).map(l => ({ litera: l, criticality: 'HART' as const, status: 'present' as const }))
    .concat([{ litera: 'e', criticality: 'BEDINGT', status: 'present' }])
    .concat((['f', 'g'] as const).map(l => ({ litera: l, criticality: 'WEICH' as const, status: 'present' as const }))),
};

const missingRecipient: WfcompGapReport = {
  gdprScope: true,
  fields: [
    { litera: 'd', criticality: 'HART', status: 'missing' },
    { litera: 'a', criticality: 'HART', status: 'needs_attestation', mode: 'ask' },
    { litera: 'e', criticality: 'BEDINGT', status: 'present' },
  ],
};

describe('WfcompVerdict', () => {
  test('G10: three lists, grouped, NO aggregate % and no false "Complete"', () => {
    render(<WfcompVerdict report={mixed} />);
    expect(screen.getByTestId('list-green')).toBeInTheDocument();
    expect(screen.getByTestId('list-yellow')).toBeInTheDocument();
    expect(screen.getByTestId('list-red')).toBeInTheDocument();
    // never an aggregate score
    expect(screen.queryByText(/\d+\s*%/)).not.toBeInTheDocument();
    // incomplete → never claims completion
    expect(screen.queryByText(/^Complete —/)).not.toBeInTheDocument();
  });

  test('Obviousness: lead states exactly what is left, as actions', () => {
    render(<WfcompVerdict report={mixed} />);
    const lead = screen.getByTestId('verdict-lead');
    // confirm 1 (b) · provide 4 (a,c,f,g ask)
    expect(lead.textContent).toContain('confirm 1 suggestion');
    expect(lead.textContent).toContain('provide 4 details');
  });

  test('yellow item is phrased as a confirm-action with the suggestion', () => {
    render(<WfcompVerdict report={mixed} />);
    const yellow = screen.getByTestId('list-yellow');
    expect(yellow.textContent).toContain('Confirm:');
    expect(yellow.textContent).toContain('Manage newsletter subscriptions');
  });

  test('G11: all HART + BEDINGT present → "Complete"', () => {
    render(<WfcompVerdict report={complete} />);
    expect(screen.getByText(/^Complete —/)).toBeInTheDocument();
    expect(screen.queryByTestId('list-red')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-yellow')).not.toBeInTheDocument();
  });

  test('G12: honest-seam — structurally checked but pending → sign-off prompt, no compliant claim', () => {
    render(<WfcompVerdict report={mixed} />);
    expect(screen.getByText(/Structure checked/)).toBeInTheDocument();
    expect(screen.getByText(/we never sign this off for you/)).toBeInTheDocument();
    expect(screen.queryByText(/compliant/i)).not.toBeInTheDocument();
  });

  test('red gap is phrased as an imperative action ("Add the recipient")', () => {
    render(<WfcompVerdict report={missingRecipient} />);
    const lead = screen.getByTestId('verdict-lead');
    expect(lead.textContent).toContain('fix 1 gap');
    expect(screen.getByTestId('list-red').textContent).toContain('Add the recipient');
  });

  test('out-of-scope → "not applicable", no lists', () => {
    render(<WfcompVerdict report={{ gdprScope: false, fields: [] }} />);
    expect(screen.getByTestId('not-applicable')).toBeInTheDocument();
    expect(screen.queryByTestId('list-green')).not.toBeInTheDocument();
  });
});
