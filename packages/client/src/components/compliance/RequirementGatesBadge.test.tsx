// @vitest-environment jsdom
/**
 * THE-557 — Gates-Badge: drei Tore, ehrlich gerendert.
 * Kernprüfung: ein Bestands-Dokument OHNE gates zeigt 3× unknown —
 * das done-Häkchen erbt keine Tiefe.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RequirementGatesBadge from './RequirementGatesBadge';

describe('RequirementGatesBadge', () => {
  test('renders 3× unknown when gates are absent — Bestand erbt keine Tiefe', () => {
    render(<RequirementGatesBadge gates={undefined} onSet={vi.fn()} />);
    expect(screen.getAllByTitle(/not assessed/i)).toHaveLength(3);
  });

  test('shows covered=yes with its derivation reason', () => {
    render(
      <RequirementGatesBadge
        gates={{
          covered: { state: 'yes', setBy: 'system', reason: 'derived: 2 linked element(s) address this requirement' },
          enforced: { state: 'unknown' },
          attested: { state: 'unknown' },
        }}
        onSet={vi.fn()}
      />,
    );
    expect(screen.getByTitle(/derived: 2 linked/)).toBeInTheDocument();
    // Ehrlichkeit: gedeckt ist NICHT nachgewiesen
    expect(screen.getByText(/covered, not attested/i)).toBeInTheDocument();
  });

  test('asks for a reason before setting a human gate', () => {
    const onSet = vi.fn();
    render(<RequirementGatesBadge gates={undefined} onSet={onSet} />);
    fireEvent.click(screen.getByRole('button', { name: /enforced/i }));
    expect(onSet).not.toHaveBeenCalled(); // erst der Dialog
    fireEvent.change(screen.getByPlaceholderText(/why/i), { target: { value: 'Q3 review, all cases' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm yes/i }));
    expect(onSet).toHaveBeenCalledWith('enforced', 'yes', 'Q3 review, all cases');
  });

  test('covered has NO set-button — the machine gate is not clickable', () => {
    render(<RequirementGatesBadge gates={undefined} onSet={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^covered/i })).toBeNull();
  });
});
