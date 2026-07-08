// @vitest-environment jsdom
/**
 * THE-390 P4b — RegulationsPanel: corpus laws listed + "Add to pipeline".
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/api')>();
  return {
    ...original,
    normsAPI: {
      list: vi.fn(),
      getMappings: vi.fn(),
      addToPipeline: vi.fn(),
    },
    compliancePipelineAPI: {
      ...original.compliancePipelineAPI,
      getPipelineStatus: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
});
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { normsAPI } from '../../services/api';
import { useComplianceStore } from '../../stores/complianceStore';
import RegulationsPanel from './RegulationsPanel';

const listMock = vi.mocked(normsAPI.list);
const addMock = vi.mocked(normsAPI.addToPipeline);

const NORMS = [
  {
    identity: { workId: 'corpus:dsgvo' },
    source: 'corpus',
    title: 'DSGVO',
    jurisdiction: 'EU',
    kind: 'legislation',
    sectionCount: 4,
  },
  {
    identity: { workId: 'upload:abc' },
    source: 'upload',
    title: 'ISO 27001',
    kind: 'technical_standard',
    sectionCount: 12,
  },
];

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/project/p1/compliance/standards']}>
      <Routes>
        <Route path="/project/:projectId/compliance/:section" element={<RegulationsPanel />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RegulationsPanel (THE-390 P4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComplianceStore.setState({ pipelineStates: [] });
  });

  test('lists ONLY corpus norms (upload standards stay in StandardsManager)', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: NORMS } } as never);
    renderPanel();

    await waitFor(() => expect(screen.getByText('DSGVO')).toBeInTheDocument());
    expect(screen.queryByText('ISO 27001')).not.toBeInTheDocument();
    expect(screen.getByText(/4 sections/)).toBeInTheDocument();
  });

  test('add to pipeline calls the adapter with the workId', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: NORMS } } as never);
    addMock.mockResolvedValue({ data: { success: true } } as never);
    renderPanel();

    await waitFor(() => expect(screen.getByText('DSGVO')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add to pipeline/i }));

    await waitFor(() =>
      expect(addMock).toHaveBeenCalledWith('p1', 'corpus:dsgvo'),
    );
  });

  test('a norm already in the pipeline shows the state instead of the button', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: NORMS } } as never);
    useComplianceStore.setState({
      pipelineStates: [{ standardId: 'corpus:dsgvo' } as never],
    });
    renderPanel();

    await waitFor(() => expect(screen.getByText('DSGVO')).toBeInTheDocument());
    expect(screen.getByText(/in pipeline/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to pipeline/i })).not.toBeInTheDocument();
  });

  test('empty state when no corpus norms are referenced', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [NORMS[1]] } } as never);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText(/no corpus regulations referenced yet/i)).toBeInTheDocument(),
    );
  });
});
