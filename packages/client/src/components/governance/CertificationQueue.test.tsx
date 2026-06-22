// @vitest-environment jsdom
/**
 * REQ-CERT-001.3 — CertificationQueue component tests (Trust-Spine UC-CERT-001).
 * Covers REQ-2 ACs: renders atom fields + Certify button (AC-2), batch
 * selection certifies the chosen IDs (AC-3), empty state shows the CTA (AC-5).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const getPending = vi.fn();
const certify = vi.fn();
vi.mock('../../services/api', () => ({
  certificationAPI: {
    getPending: (...a: unknown[]) => getPending(...a),
    certify: (...a: unknown[]) => certify(...a),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const selectElement = vi.fn();
vi.mock('../../stores/architectureStore', () => ({
  useArchitectureStore: (sel: (s: unknown) => unknown) => sel({ selectElement }),
}));

import CertificationQueue from './CertificationQueue';

const renderQueue = () =>
  render(
    <MemoryRouter initialEntries={['/project/p1']}>
      <Routes>
        <Route path="/project/:projectId" element={<CertificationQueue />} />
      </Routes>
    </MemoryRouter>,
  );

const okPending = (data: unknown) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  getPending.mockReset();
  certify.mockReset();
  selectElement.mockReset();
});

describe('CertificationQueue', () => {
  test('AC-5 — empty state shows the "All certified" CTA', async () => {
    getPending.mockReturnValue(okPending({ elements: [], connections: [], total: 0 }));
    renderQueue();
    expect(await screen.findByText('All certified ✓')).toBeInTheDocument();
  });

  test('AC-2 — renders atom name, type, provenance badge, confidence + Certify button', async () => {
    getPending.mockReturnValue(
      okPending({
        elements: [
          {
            id: 'e1',
            name: 'Order Service',
            type: 'application_component',
            layer: 'application',
            provenance: 'ai_generated',
            source: 'blueprint',
            confidence: 0.6,
          },
        ],
        connections: [],
        total: 1,
      }),
    );
    renderQueue();

    expect(await screen.findByText('Order Service')).toBeInTheDocument();
    expect(screen.getByText(/application_component/)).toBeInTheDocument();
    expect(screen.getByText('AI-generated · blueprint')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    // Single per-row Certify button (batch button reads "Certify 0")
    expect(screen.getByText('Certify')).toBeInTheDocument();
  });

  test('AC-3 — batch: selecting an atom then "Certify N" sends the chosen IDs', async () => {
    getPending.mockReturnValue(
      okPending({
        elements: [
          {
            id: 'e1',
            name: 'Order Service',
            type: 'application_component',
            layer: 'application',
            provenance: 'ai_generated',
            source: 'blueprint',
            confidence: 0.6,
          },
        ],
        connections: [],
        total: 1,
      }),
    );
    certify.mockResolvedValue({
      data: { success: true, data: { elementsCertified: 1, connectionsCertified: 0 } },
    });
    renderQueue();

    await screen.findByText('Order Service');
    const checkboxes = screen.getAllByRole('checkbox'); // [0] = select-all, [1] = row
    fireEvent.click(checkboxes[1]);

    fireEvent.click(screen.getByText('Certify 1'));

    await waitFor(() =>
      expect(certify).toHaveBeenCalledWith('p1', { elementIds: ['e1'], connectionIds: [] }),
    );
  });
});
