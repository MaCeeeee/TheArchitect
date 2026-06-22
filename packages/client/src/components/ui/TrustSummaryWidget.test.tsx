// @vitest-environment jsdom
/**
 * REQ-TRUST-001.2 — TrustSummaryWidget tests (Trust-Spine UC-TRUST-001).
 * Renders confirmed % + honesty bar + subtext (AC-2), empty state without
 * "0%" (AC-5), click navigates into the certification queue (AC-4).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

const getTrustSummary = vi.fn();
vi.mock('../../services/api', () => ({
  certificationAPI: { getTrustSummary: (...a: unknown[]) => getTrustSummary(...a) },
}));

import TrustSummaryWidget from './TrustSummaryWidget';

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

const onNavigate = vi.fn();

const renderWidget = () =>
  render(
    <MemoryRouter initialEntries={['/start']}>
      <TrustSummaryWidget projectId="p1" onNavigate={onNavigate} />
      <LocationDisplay />
    </MemoryRouter>,
  );

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  getTrustSummary.mockReset();
  onNavigate.mockReset();
});

describe('TrustSummaryWidget', () => {
  test('AC-2 — renders confirmed % and AI-assumed subtext', async () => {
    getTrustSummary.mockReturnValue(
      ok({
        total: 26,
        confirmed: 19,
        unconfirmed: 7,
        confirmedPct: 73,
        byProvenance: { user: 15, ai_generated: 7, import: 4, mcp_discovered: 0 },
      }),
    );
    renderWidget();

    expect(await screen.findByText('73%')).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    const subtext = screen.getByText(/AI-assumed/);
    expect(subtext.textContent).toBe('27% AI-assumed — 7 atoms to review');
  });

  test('AC-5 — empty project shows "No atoms yet", never 0%', async () => {
    getTrustSummary.mockReturnValue(
      ok({ total: 0, confirmed: 0, unconfirmed: 0, confirmedPct: null, byProvenance: { user: 0, ai_generated: 0, import: 0, mcp_discovered: 0 } }),
    );
    renderWidget();

    expect(await screen.findByText(/No atoms yet/)).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  test('AC-4 — click navigates into the certification queue + onNavigate', async () => {
    getTrustSummary.mockReturnValue(
      ok({ total: 4, confirmed: 3, unconfirmed: 1, confirmedPct: 75, byProvenance: { user: 3, ai_generated: 1, import: 0, mcp_discovered: 0 } }),
    );
    renderWidget();

    await screen.findByText('75%');
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/project/p1/compliance/certify'),
    );
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
