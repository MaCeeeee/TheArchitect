// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ConformanceHub from './ConformanceHub';

const renderHub = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/project/p1/compliance/hub']}>
      <Routes>
        <Route path="/project/:projectId/compliance/:section" element={<ConformanceHub {...props} />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ConformanceHub scopeVerb (THE-487)', () => {
  test('classic (no prop): renders all 3 gate cards, no in-world affordance', () => {
    renderHub();
    expect(screen.getByTestId('gate-card-cover')).toBeInTheDocument();
    expect(screen.getByTestId('gate-card-enforce')).toBeInTheDocument();
    expect(screen.getByTestId('gate-card-attest')).toBeInTheDocument();
    expect(screen.queryByText(/opens in the classic ui/i)).not.toBeInTheDocument();
  });

  test('scoped: the scoped gate is marked current, and the classic-UI affordance shows', () => {
    renderHub({ scopeVerb: 'Enforce' });
    expect(screen.getByTestId('gate-card-enforce')).toHaveAttribute('data-scoped', 'true');
    expect(screen.getByTestId('gate-card-cover')).toHaveAttribute('data-scoped', 'false');
    expect(screen.getByText(/opens in the classic ui/i)).toBeInTheDocument();
  });
});
