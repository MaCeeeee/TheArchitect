// @vitest-environment jsdom
/**
 * REQ-PROV-003.1 (THE-737) — Evidence section in the PropertyPanel.
 * Shows whether an element is an assumption or validated, plus the
 * traceability (note, since, validation ref, previous name) and origin.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EvidenceSection } from './EvidenceSection';

const assumption = {
  status: 'target',
  source: 'api',
  provenance: 'import' as const,
  metadata: {
    assumption: true,
    assumptionNote: 'Buyer role unproven (part 6 #5)',
    assumptionSince: '2026-10-30',
    validationRef: 'docs/strategy/2026-10-30-annahmen-validierung.md#A4',
  },
};

describe('EvidenceSection', () => {
  test('assumption: badge, note, since, validation ref, source', () => {
    render(<EvidenceSection element={assumption} />);
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-badge')).toHaveTextContent('Assumption');
    expect(screen.getByText('Buyer role unproven (part 6 #5)')).toBeInTheDocument();
    expect(screen.getByText('2026-10-30')).toBeInTheDocument();
    expect(screen.getByText('docs/strategy/2026-10-30-annahmen-validierung.md#A4')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-source')).toHaveTextContent('api');
    expect(screen.getByTestId('evidence-source')).toHaveTextContent('import');
  });

  test('validated: badge only, no empty traceability rows', () => {
    render(<EvidenceSection element={{ status: 'current', metadata: { assumption: false } }} />);
    expect(screen.getByTestId('evidence-badge')).toHaveTextContent('Validated');
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
    expect(screen.queryByText('Since')).not.toBeInTheDocument();
    expect(screen.queryByText('Validation')).not.toBeInTheDocument();
    expect(screen.queryByText('Previously')).not.toBeInTheDocument();
  });

  test('status target without flag reads Planned, never Validated', () => {
    render(<EvidenceSection element={{ status: 'target', metadata: {} }} />);
    expect(screen.getByTestId('evidence-badge')).toHaveTextContent('Planned');
  });

  test('status current without flag reads Not assessed', () => {
    render(<EvidenceSection element={{ status: 'current', metadata: {} }} />);
    expect(screen.getByTestId('evidence-badge')).toHaveTextContent('Not assessed');
  });

  test('previous name and change date are shown when set', () => {
    render(
      <EvidenceSection
        element={{
          status: 'target',
          metadata: { assumption: true, previousName: 'O1 · BSH pays + becomes reference', changedOn: '2026-10-30' },
        }}
      />,
    );
    expect(screen.getByText('Previously')).toBeInTheDocument();
    expect(screen.getByText(/O1 · BSH pays \+ becomes reference/)).toBeInTheDocument();
  });

  test('an http(s) validation ref renders as an external link', () => {
    render(<EvidenceSection element={{ status: 'target', metadata: { assumption: true, validationRef: 'https://example.com/a#b' } }} />);
    const link = screen.getByRole('link', { name: 'https://example.com/a#b' });
    expect(link).toHaveAttribute('href', 'https://example.com/a#b');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  test('a doc-path validation ref is plain text, not a link', () => {
    render(<EvidenceSection element={assumption} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
