// @vitest-environment jsdom
/**
 * UC-LAW-001 — ApplicabilityCheck: ranked law assessments + evidence + add-to-pipeline.
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
      applicability: vi.fn(),
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
import ApplicabilityCheck from './ApplicabilityCheck';

const applicabilityMock = vi.mocked(normsAPI.applicability);
const addMock = vi.mocked(normsAPI.addToPipeline);

const REPORT = {
  projectId: 'p1',
  generatedAt: '2026-07-11T10:00:00.000Z',
  elementCount: 12,
  wizardElementCount: 9,
  assumedJurisdictions: ['EU', 'DE'],
  signals: [
    {
      id: 'personal-data',
      label: 'Personal data processing',
      description: 'PII indicators',
      detected: true,
      matchCount: 3,
      evidence: [
        { kind: 'element', elementId: 'e1', name: 'Customer Database', detail: 'matched "Customer"', fromWizard: true },
      ],
    },
  ],
  assessments: [
    {
      ruleId: 'dsgvo',
      label: 'GDPR / DSGVO',
      corpusSourceIds: ['dsgvo'],
      jurisdiction: 'EU',
      kind: 'legislation',
      bindingness: 'binding',
      verdict: 'applicable',
      score: 0.81,
      contributions: [
        { signalId: 'personal-data', signalLabel: 'Personal data processing', weight: 0.7, rationale: 'PII elements found.' },
      ],
      rationale: 'PII elements found.',
      workId: 'corpus:dsgvo',
      referenced: false,
      inPipeline: false,
      availableInCorpus: true,
    },
    {
      ruleId: 'dora',
      label: 'DORA (Regulation (EU) 2022/2554)',
      corpusSourceIds: ['dora'],
      jurisdiction: 'EU',
      kind: 'legislation',
      bindingness: 'binding',
      verdict: 'not_indicated',
      score: 0,
      contributions: [],
      rationale: 'No indicators for this norm were found in the current architecture model.',
      referenced: false,
      inPipeline: false,
      availableInCorpus: true,
      workId: 'corpus:dora',
    },
  ],
  disclaimer: 'Automated, heuristic decision support — NOT legal advice.',
};

function renderCheck() {
  return render(
    <MemoryRouter initialEntries={['/project/p1/compliance/standards']}>
      <Routes>
        <Route path="/project/:projectId/compliance/:section" element={<ApplicabilityCheck />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ApplicabilityCheck (UC-LAW-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComplianceStore.setState({ pipelineStates: [] });
  });

  test('renders indicated assessments with verdict, disclaimer and wizard count', async () => {
    applicabilityMock.mockResolvedValue({ data: { success: true, data: REPORT } } as never);
    renderCheck();

    await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
    expect(screen.getByText('Applies')).toBeInTheDocument();
    expect(screen.getByText(/NOT legal advice/i)).toBeInTheDocument();
    expect(screen.getByText(/9 from AI wizard/i)).toBeInTheDocument();
    // not_indicated laws are collapsed by default
    expect(screen.queryByText(/DORA/)).not.toBeInTheDocument();
    expect(screen.getByText(/No indication \(1\)/i)).toBeInTheDocument();
  });

  test('expanding an assessment reveals evidence with wizard marker', async () => {
    applicabilityMock.mockResolvedValue({ data: { success: true, data: REPORT } } as never);
    renderCheck();

    await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
    fireEvent.click(screen.getByText('GDPR / DSGVO'));

    expect(screen.getByText('Customer Database')).toBeInTheDocument();
    expect(screen.getByText(/3 matches/i)).toBeInTheDocument();
  });

  test('add to pipeline calls the adapter with the workId', async () => {
    applicabilityMock.mockResolvedValue({ data: { success: true, data: REPORT } } as never);
    addMock.mockResolvedValue({ data: { success: true } } as never);
    renderCheck();

    await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add to pipeline/i }));

    await waitFor(() => expect(addMock).toHaveBeenCalledWith('p1', 'corpus:dsgvo'));
  });

  test('empty model shows a hint towards the AI wizard', async () => {
    applicabilityMock.mockResolvedValue({
      data: {
        success: true,
        data: { ...REPORT, elementCount: 0, wizardElementCount: 0, assessments: [], signals: [] },
      },
    } as never);
    renderCheck();

    await waitFor(() =>
      expect(screen.getByText(/no architecture elements yet/i)).toBeInTheDocument(),
    );
  });

  test('API failure shows the error state', async () => {
    applicabilityMock.mockRejectedValue(new Error('boom'));
    renderCheck();

    await waitFor(() =>
      expect(screen.getByText(/failed to assess applicability/i)).toBeInTheDocument(),
    );
  });
});
