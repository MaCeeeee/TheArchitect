// @vitest-environment jsdom
/**
 * THE-423 Task 14 — "Paragraphs the judge reviewed" expander: lazy-fetches
 * the ContextTrace behind a corpus finding's `contextTraceId` and lists the
 * FED paragraphs, highlighting the ones the judge actually CITED — the core
 * "the judge saw Art. 16 but not the scope Art. 2" diagnostic, made visible
 * in-product. Mirrors ApplicabilityCheck.discover.test.tsx's mock/render setup.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
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
      discover: vi.fn(),
      discoveryFindings: vi.fn(),
      confirmFinding: vi.fn(),
      rejectFinding: vi.fn(),
      getContextTrace: vi.fn(),
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
const getContextTraceMock = vi.mocked(normsAPI.getContextTrace);

const BASE_REPORT = {
  projectId: 'p1',
  generatedAt: '2026-07-19T10:00:00.000Z',
  elementCount: 5,
  wizardElementCount: 2,
  assumedJurisdictions: ['EU'],
  signals: [],
  assessments: [] as unknown[],
  disclaimer: 'Automated, heuristic decision support — NOT legal advice.',
};

function bothAssessment(corpusOverrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'ai-act',
    label: 'AI Act',
    corpusSourceIds: ['ai-act-en'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    verdict: 'possible',
    score: 0.3,
    contributions: [],
    rationale: 'AI component detected.',
    referenced: false,
    inPipeline: false,
    availableInCorpus: true,
    provenance: 'both',
    corpus: {
      status: 'auto',
      applies: true,
      confidence: 0.87,
      reasoning: 'High-risk AI system used in recruiting.',
      keyParagraphs: ['ai-act-en:5'],
      elementIds: ['e1'],
      sources: ['ai-act-en'],
      corpusVersionHash: 'H1',
      contextTraceId: 'trace-1',
      ...corpusOverrides,
    },
  };
}

function renderCheck() {
  return render(
    <MemoryRouter initialEntries={['/project/p1/compliance/standards']}>
      <Routes>
        <Route path="/project/:projectId/compliance/:section" element={<ApplicabilityCheck />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockApplicability(assessments: unknown[]) {
  applicabilityMock.mockResolvedValue({
    data: {
      success: true,
      data: { ...BASE_REPORT, assessments },
      discovery: { enabled: true, corpusConfigured: true, providerConfigured: true },
    },
  } as never);
}

async function expandAssessmentAndEvidence(label: string) {
  await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  fireEvent.click(screen.getByText(label));
  const trigger = await screen.findByRole('button', { name: /paragraphs the judge reviewed/i });
  fireEvent.click(trigger);
  return trigger;
}

describe('ApplicabilityCheck — "Paragraphs the judge reviewed" expander (THE-423 Task 14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComplianceStore.setState({ pipelineStates: [] });
  });
  afterEach(() => {
    cleanup();
  });

  test('does not render the expander when corpus.contextTraceId is absent', async () => {
    mockApplicability([bothAssessment({ contextTraceId: undefined })]);
    renderCheck();
    await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
    fireEvent.click(screen.getByText('AI Act'));
    expect(screen.queryByRole('button', { name: /paragraphs the judge reviewed/i })).not.toBeInTheDocument();
  });

  test('expand lazy-fetches the trace and lists fed paragraphs, cited ones marked distinctly', async () => {
    mockApplicability([bothAssessment()]);
    getContextTraceMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          requestId: 'trace-1',
          feature: 'discovery',
          projectId: 'p1',
          consumed: [
            {
              regulationKey: 'ai-act-en:5',
              versionHash: 'v1',
              sectionRef: '5',
              score: 0.91,
              retrievalMethod: 'dense',
              citedByJudge: true,
            },
            {
              regulationKey: 'ai-act-en:2',
              versionHash: 'v1',
              sectionRef: '2',
              score: 0.55,
              retrievalMethod: 'dense',
              citedByJudge: false,
            },
          ],
        },
      },
    } as never);

    renderCheck();
    expect(getContextTraceMock).not.toHaveBeenCalled();
    const trigger = await expandAssessmentAndEvidence('AI Act');

    await waitFor(() => expect(getContextTraceMock).toHaveBeenCalledWith('p1', 'trace-1'));

    const panel = trigger.parentElement as HTMLElement;
    const cited = await within(panel).findByText('ai-act-en:5');
    const notCited = await within(panel).findByText('ai-act-en:2');
    expect(cited).toBeInTheDocument();
    expect(notCited).toBeInTheDocument();

    // Cited entry is visually distinguished (accent "cited" badge) from the merely-fed one.
    const citedRow = cited.closest('li') ?? cited.parentElement!;
    const notCitedRow = notCited.closest('li') ?? notCited.parentElement!;
    expect(within(citedRow).getByText(/cited/i)).toBeInTheDocument();
    expect(within(notCitedRow).queryByText(/^cited$/i)).not.toBeInTheDocument();
  });

  test('shows a subtle loading state while fetching', async () => {
    mockApplicability([bothAssessment()]);
    let resolve: (v: unknown) => void = () => {};
    getContextTraceMock.mockReturnValue(new Promise((res) => { resolve = res; }) as never);

    renderCheck();
    await expandAssessmentAndEvidence('AI Act');
    await waitFor(() => expect(getContextTraceMock).toHaveBeenCalled());

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    resolve({ data: { success: true, data: { requestId: 'trace-1', feature: 'discovery', projectId: 'p1', consumed: [] } } });
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  });

  test('404 / tracing-disabled: graceful "no evidence trace available" note, no crash', async () => {
    mockApplicability([bothAssessment()]);
    getContextTraceMock.mockRejectedValue({ response: { status: 404 } });

    renderCheck();
    await expandAssessmentAndEvidence('AI Act');

    await waitFor(() => expect(getContextTraceMock).toHaveBeenCalled());
    expect(await screen.findByText(/no evidence trace available/i)).toBeInTheDocument();
    // panel did not crash — the assessment is still rendered
    expect(screen.getByText('AI Act')).toBeInTheDocument();
  });

  test('empty consumed[] also shows the graceful note', async () => {
    mockApplicability([bothAssessment()]);
    getContextTraceMock.mockResolvedValue({
      data: { success: true, data: { requestId: 'trace-1', feature: 'discovery', projectId: 'p1', consumed: [] } },
    } as never);

    renderCheck();
    await expandAssessmentAndEvidence('AI Act');

    expect(await screen.findByText(/no evidence trace available/i)).toBeInTheDocument();
  });
});
