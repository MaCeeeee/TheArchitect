// @vitest-environment jsdom
/**
 * REQ-RING-001.4 (THE-824, AC-4) — the panel shows each change folder with its findings and hints.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ChangeRingSection from './ChangeRingSection';
import type { ChangeRingReport } from '@thearchitect/shared';

const method = { id: 'PA-umlauf', name: 'Change folder check (Bernstein conditions)', question: 'q', formula: 'W(A) ∩ W(B) = ∅', limits: 'Checks the model, not the running process.' };
const folder = { id: 'M', name: 'Change folder' };
const a = { id: 'S1', name: 'Review design' };
const b = { id: 'S2', name: 'Review purchasing' };

const clean: ChangeRingReport = {
  method,
  folders: [{ folder, parts: 12, steps: [a, b], start: a, parallelPairs: 3, checked: true, findings: [], hints: [] }],
  hints: [],
};
const conflict: ChangeRingReport = {
  ...clean,
  folders: [{ ...clean.folders[0], findings: [{ rule: 'write_write', first: a, second: b, part: { id: 'k', name: 'Cost estimate' }, text: 'WW text' }] }],
};
const empty: ChangeRingReport = { method, folders: [], hints: [{ kind: 'no_folder', elementIds: [], text: 'No folder text' }] };

describe('ChangeRingSection', () => {
  test('nothing without a report', () => {
    const { container } = render(<ChangeRingSection report={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('a checked folder without findings says so', () => {
    render(<ChangeRingSection report={clean} />);
    expect(screen.getByText('Change folder')).toBeInTheDocument();
    expect(screen.getByTestId('ring-folder-M')).toHaveAttribute('data-checked', 'true');
    expect(screen.getByText('The check found no problem.')).toBeInTheDocument();
  });

  test('a finding is shown with its text', () => {
    render(<ChangeRingSection report={conflict} />);
    expect(screen.getByText('WW text')).toBeInTheDocument();
    expect(screen.queryByText('The check found no problem.')).not.toBeInTheDocument();
  });

  test('a hint of the whole model is shown', () => {
    render(<ChangeRingSection report={empty} />);
    expect(screen.getByText('No folder text')).toBeInTheDocument();
  });
});
