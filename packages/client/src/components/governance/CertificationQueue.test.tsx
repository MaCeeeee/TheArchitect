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

  // ── UC-PROV-002 / REQ-PROV-002.3 — origin badge, origin line, source filter ──

  const githubElement = {
    id: 'g1',
    name: 'Payment Repo',
    type: 'application_component',
    layer: 'application',
    provenance: 'import',
    source: 'github',
    confidence: 0.7,
    sourceRef: 'https://api.github.com/acme',
    importedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2h ago
    connectorConfigId: 'gh-main',
  };

  test('REQ-3 — connector import shows the real source badge, not "Import"', async () => {
    getPending.mockReturnValue(
      okPending({ elements: [githubElement], connections: [], total: 1 }),
    );
    renderQueue();

    expect(await screen.findByText('Payment Repo')).toBeInTheDocument();
    // De-anonymized: badge reads "GitHub", and the generic "Import" badge is gone.
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.queryByText('Import')).not.toBeInTheDocument();
  });

  test('REQ-3 — origin line renders sourceRef + relative importedAt', async () => {
    getPending.mockReturnValue(
      okPending({ elements: [githubElement], connections: [], total: 1 }),
    );
    renderQueue();

    await screen.findByText('Payment Repo');
    expect(screen.getByText('https://api.github.com/acme')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  test('REQ-3 — source filter chips narrow the queue to the chosen origin', async () => {
    const csvElement = {
      id: 'c1',
      name: 'Legacy Sheet',
      type: 'application_component',
      layer: 'application',
      provenance: 'import',
      source: 'csv',
      confidence: 0.9,
      sourceRef: null,
      importedAt: null,
      connectorConfigId: null,
    };
    getPending.mockReturnValue(
      okPending({ elements: [githubElement, csvElement], connections: [], total: 2 }),
    );
    renderQueue();

    await screen.findByText('Payment Repo');
    expect(screen.getByText('Legacy Sheet')).toBeInTheDocument();

    // Chip "CSV (1)" filters to just the CSV atom.
    fireEvent.click(screen.getByText('CSV (1)'));
    expect(screen.queryByText('Payment Repo')).not.toBeInTheDocument();
    expect(screen.getByText('Legacy Sheet')).toBeInTheDocument();
  });

  test('REQ-3 — backward-compat: alt-import without source falls back to provenance badge', async () => {
    getPending.mockReturnValue(
      okPending({
        elements: [
          {
            id: 'old1',
            name: 'Legacy Atom',
            type: 'node',
            layer: 'technology',
            provenance: 'import',
            source: null,
            confidence: null,
            sourceRef: null,
            importedAt: null,
            connectorConfigId: null,
          },
        ],
        connections: [],
        total: 1,
      }),
    );
    renderQueue();

    await screen.findByText('Legacy Atom');
    expect(screen.getByText('Import')).toBeInTheDocument(); // graceful fallback
  });
});
