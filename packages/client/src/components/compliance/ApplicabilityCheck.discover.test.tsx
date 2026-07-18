// @vitest-environment jsdom
/**
 * UC-LAW-002 Slice-2b (THE-464) — "Discover from corpus" additive UI:
 * button gating, provenance/status/stale badges, corpus drilldown,
 * confirm/reject flows, show-rejected toggle, coverage line.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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
const discoverMock = vi.mocked(normsAPI.discover);
const discoveryFindingsMock = vi.mocked(normsAPI.discoveryFindings);
const confirmMock = vi.mocked(normsAPI.confirmFinding);
const rejectMock = vi.mocked(normsAPI.rejectFinding);

const BASE_REPORT = {
  projectId: 'p1',
  generatedAt: '2026-07-18T10:00:00.000Z',
  elementCount: 5,
  wizardElementCount: 2,
  assumedJurisdictions: ['EU'],
  signals: [],
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
      contributions: [],
      rationale: 'PII elements found.',
      workId: 'corpus:dsgvo',
      referenced: false,
      inPipeline: false,
      availableInCorpus: true,
    },
  ],
  disclaimer: 'Automated, heuristic decision support — NOT legal advice.',
};

function bothAssessment(overrides: Record<string, unknown> = {}) {
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
    },
    ...overrides,
  };
}

function corpusOnlyAssessment(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'nis2',
    label: 'nis2',
    corpusSourceIds: ['nis2-en'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    verdict: 'likely',
    score: 0,
    contributions: [],
    rationale: 'Critical infrastructure operator.',
    workId: 'corpus:nis2-en',
    referenced: false,
    inPipeline: false,
    availableInCorpus: true,
    provenance: 'corpus',
    corpus: {
      status: 'auto',
      applies: true,
      confidence: 0.7,
      reasoning: 'Energy grid operator language detected.',
      keyParagraphs: ['nis2-en:21'],
      elementIds: [],
      sources: ['nis2-en'],
      corpusVersionHash: 'H2',
    },
    ...overrides,
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

function mockApplicability(assessments: unknown[], discovery: Record<string, unknown> | undefined, coverage?: Record<string, unknown>) {
  applicabilityMock.mockResolvedValue({
    data: { success: true, data: { ...BASE_REPORT, assessments, ...(coverage ? { coverage } : {}) }, discovery },
  } as never);
}

describe('ApplicabilityCheck — Discover from corpus (UC-LAW-002 Slice-2b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComplianceStore.setState({ pipelineStates: [] });
  });

  describe('button gating (AC-1)', () => {
    test('not rendered when discovery is missing/dark', async () => {
      mockApplicability(BASE_REPORT.assessments, undefined);
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /discover from corpus/i })).not.toBeInTheDocument();
    });

    test('not rendered when discovery.enabled is false', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: false, corpusConfigured: true, providerConfigured: true });
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /discover from corpus/i })).not.toBeInTheDocument();
    });

    test('enabled + configured: button is clickable, cost hint shown', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: true, providerConfigured: true });
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
      const btn = screen.getByRole('button', { name: /discover from corpus/i });
      expect(btn).not.toBeDisabled();
      expect(screen.getByText(/provider costs apply/i)).toBeInTheDocument();
    });

    test('providerConfigured:false → disabled with explanatory title', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: true, providerConfigured: false });
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
      const btn = screen.getByRole('button', { name: /discover from corpus/i });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', expect.stringMatching(/no ai provider key configured/i));
    });

    test('corpusConfigured:false → disabled with explanatory title', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: false, providerConfigured: true });
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
      const btn = screen.getByRole('button', { name: /discover from corpus/i });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', expect.stringMatching(/corpus not connected/i));
    });
  });

  describe('discover flow', () => {
    test('click runs discover, merged report replaces the display with provenance/auto badges', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: true, providerConfigured: true });
      discoverMock.mockResolvedValue({
        data: { success: true, data: { ...BASE_REPORT, assessments: [bothAssessment(), corpusOnlyAssessment()] } },
      } as never);
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /discover from corpus/i }));

      await waitFor(() => expect(discoverMock).toHaveBeenCalledWith('p1'));
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      expect(screen.getByText('rules+corpus')).toBeInTheDocument();
      expect(screen.getByText('corpus')).toBeInTheDocument();
      expect(screen.getAllByText(/auto.*needs review/i).length).toBeGreaterThan(0);
    });

    test('discover error shows a toast and does not crash the panel', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: true, providerConfigured: true });
      discoverMock.mockRejectedValue(new Error('boom'));
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /discover from corpus/i }));

      await waitFor(() => expect(discoverMock).toHaveBeenCalled());
      // panel still shows the pre-discover report, no crash
      expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument();
    });

    test('shows a loading state while discovering', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: true, providerConfigured: true });
      let resolveDiscover: (v: unknown) => void = () => {};
      discoverMock.mockReturnValue(new Promise((resolve) => { resolveDiscover = resolve; }) as never);
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());

      const btn = screen.getByRole('button', { name: /discover from corpus/i });
      fireEvent.click(btn);
      await waitFor(() => expect(btn).toBeDisabled());

      resolveDiscover({ data: { success: true, data: BASE_REPORT } });
      await waitFor(() => expect(btn).not.toBeDisabled());
    });
  });

  describe('corpus drilldown — keyParagraph titles + element name resolution (AC-4, Fix 1)', () => {
    test('renders paragraph chips with the title (tooltip = regulationKey) when keyParagraphDetails is present', async () => {
      const a = bothAssessment({
        corpus: {
          ...bothAssessment().corpus,
          keyParagraphDetails: [{ regulationKey: 'ai-act-en:5', title: 'Classification rules for high-risk AI systems' }],
        },
      });
      mockApplicability([a], { enabled: true, corpusConfigured: true, providerConfigured: true });
      renderCheck();
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      fireEvent.click(screen.getByText('AI Act'));

      const chip = await screen.findByText('Classification rules for high-risk AI systems');
      expect(chip).toHaveAttribute('title', 'ai-act-en:5');
      expect(screen.queryByText('ai-act-en:5')).not.toBeInTheDocument(); // raw key not shown as chip text
    });

    test('legacy finding without keyParagraphDetails falls back to the raw regulationKey', async () => {
      mockApplicability([bothAssessment()], { enabled: true, corpusConfigured: true, providerConfigured: true });
      renderCheck();
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      fireEvent.click(screen.getByText('AI Act'));

      expect(await screen.findByText('ai-act-en:5')).toBeInTheDocument();
    });

    test('element chips resolve ids to names via the report signal evidence, with id fallback', async () => {
      const a = bothAssessment({
        corpus: { ...bothAssessment().corpus, elementIds: ['e1', 'e-unknown'] },
      });
      const signals = [
        {
          id: 'ai-components',
          label: 'AI components',
          description: 'x',
          detected: true,
          matchCount: 1,
          evidence: [{ kind: 'element', elementId: 'e1', name: 'CV Scoring Model', detail: 'matched "AI"' }],
        },
      ];
      applicabilityMock.mockResolvedValue({
        data: {
          success: true,
          data: { ...BASE_REPORT, signals, assessments: [a] },
          discovery: { enabled: true, corpusConfigured: true, providerConfigured: true },
        },
      } as never);
      renderCheck();
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      fireEvent.click(screen.getByText('AI Act'));

      expect(await screen.findByText('CV Scoring Model')).toBeInTheDocument(); // resolved name
      expect(screen.getByText('e-unknown')).toBeInTheDocument(); // fallback: raw id
      expect(screen.queryByText(/^e1$/)).not.toBeInTheDocument(); // raw id replaced by name
    });
  });

  describe('stale badge', () => {
    test('renders when corpus.stale is true', async () => {
      mockApplicability(
        [bothAssessment({ corpus: { ...bothAssessment().corpus, stale: true } })],
        { enabled: true, corpusConfigured: true, providerConfigured: true },
      );
      renderCheck();
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      expect(screen.getByText(/stale evidence/i)).toBeInTheDocument();
    });
  });

  describe('confirm/reject flows (AC-3, Review-Fix 2)', () => {
    test('confirm: badge becomes confirmed (optimistic), API called with family+corpusVersionHash', async () => {
      mockApplicability([bothAssessment()], { enabled: true, corpusConfigured: true, providerConfigured: true });
      confirmMock.mockResolvedValue({ data: { success: true, data: { family: 'ai-act', status: 'confirmed' } } } as never);
      renderCheck();
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      fireEvent.click(screen.getByText('AI Act'));

      const confirmBtn = await screen.findByRole('button', { name: /^confirm$/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(confirmMock).toHaveBeenCalledWith('p1', 'ai-act', 'H1'));
      await waitFor(() => expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument());
    });

    test('reject on a "both" assessment: only the corpus block disappears — the authoritative rules assessment stays visible', async () => {
      mockApplicability([bothAssessment()], { enabled: true, corpusConfigured: true, providerConfigured: true });
      rejectMock.mockResolvedValue({ data: { success: true, data: { family: 'ai-act', status: 'rejected' } } } as never);
      renderCheck();
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      fireEvent.click(screen.getByText('AI Act'));

      const rejectBtn = await screen.findByRole('button', { name: /^reject$/i });
      fireEvent.click(rejectBtn);

      await waitFor(() => expect(rejectMock).toHaveBeenCalledWith('p1', 'ai-act', 'H1'));
      // Assessment itself stays (Stage-A rules verdict authoritative) — corpus badges gone.
      await waitFor(() => expect(screen.getByText('AI Act')).toBeInTheDocument());
      expect(screen.queryByText('rules+corpus')).not.toBeInTheDocument();
      expect(screen.queryByText(/auto.*needs review/i)).not.toBeInTheDocument();
    });

    test('reject on a "corpus"-only assessment: the whole assessment disappears from the main list', async () => {
      mockApplicability([corpusOnlyAssessment()], { enabled: true, corpusConfigured: true, providerConfigured: true });
      rejectMock.mockResolvedValue({ data: { success: true, data: { family: 'nis2', status: 'rejected' } } } as never);
      renderCheck();
      await waitFor(() => expect(screen.getByText('nis2')).toBeInTheDocument());
      fireEvent.click(screen.getByText('nis2'));

      const rejectBtn = await screen.findByRole('button', { name: /^reject$/i });
      fireEvent.click(rejectBtn);

      await waitFor(() => expect(rejectMock).toHaveBeenCalledWith('p1', 'nis2', 'H2'));
      await waitFor(() => expect(screen.queryByText('nis2')).not.toBeInTheDocument());
    });
  });

  describe('add to pipeline for confirmed corpus-only findings (AC-5, Review-Fix 1 / Fix 4)', () => {
    test('confirmed corpus-only assessment with workId shows the Add-to-pipeline button and calls the adapter with the workId', async () => {
      const addMock = vi.mocked(normsAPI.addToPipeline);
      addMock.mockResolvedValue({ data: { success: true } } as never);
      mockApplicability(
        [corpusOnlyAssessment({ corpus: { ...corpusOnlyAssessment().corpus, status: 'confirmed' } })],
        { enabled: true, corpusConfigured: true, providerConfigured: true },
      );
      renderCheck();
      await waitFor(() => expect(screen.getByText('nis2')).toBeInTheDocument());

      const addBtn = screen.getByRole('button', { name: /add to pipeline/i });
      fireEvent.click(addBtn);

      await waitFor(() => expect(addMock).toHaveBeenCalledWith('p1', 'corpus:nis2-en'));
    });
  });

  describe('show rejected toggle (AC-3)', () => {
    test('lazily loads discoveryFindings and shows rejected entries when toggled', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: true, providerConfigured: true });
      discoveryFindingsMock.mockResolvedValue({
        data: {
          success: true,
          data: [
            { family: 'dora', status: 'rejected', reasoning: 'Not a financial institution.', corpusVersionHash: 'HX', sources: ['dora-en'] },
            { family: 'ai-act', status: 'auto', reasoning: 'still open', corpusVersionHash: 'H1', sources: ['ai-act-en'] },
          ],
        },
      } as never);
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
      expect(discoveryFindingsMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /show rejected/i }));

      await waitFor(() => expect(discoveryFindingsMock).toHaveBeenCalledWith('p1'));
      await waitFor(() => expect(screen.getByText('dora')).toBeInTheDocument());
      expect(screen.queryByText('ai-act')).not.toBeInTheDocument(); // only rejected shown
    });
  });

  describe('coverage line (AC-6)', () => {
    test('renders stage A/B counts + corpus state when report.coverage is present', async () => {
      mockApplicability(
        BASE_REPORT.assessments,
        { enabled: true, corpusConfigured: true, providerConfigured: true },
        { stageARuleCount: 9, stageBCorpusCount: 2, corpusVersion: 'abcdef123456' },
      );
      renderCheck();
      await waitFor(() => expect(screen.getByText('GDPR / DSGVO')).toBeInTheDocument());
      expect(screen.getByText(/stage a: 9 rules/i)).toBeInTheDocument();
      expect(screen.getByText(/stage b: 2 corpus laws/i)).toBeInTheDocument();
    });

    test('disclaimer always renders regardless of coverage', async () => {
      mockApplicability(BASE_REPORT.assessments, { enabled: true, corpusConfigured: true, providerConfigured: true });
      renderCheck();
      await waitFor(() => expect(screen.getByText(/NOT legal advice/i)).toBeInTheDocument());
    });
  });
});
