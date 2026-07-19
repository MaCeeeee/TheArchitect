// @vitest-environment jsdom
/**
 * THE-423 Task 15 — OraclePanel "Evidence / Audit" section: lazy-fetches the
 * ContextTrace(feature:'oracle') behind an assessment's `contextTraceId` and
 * shows `model` + `createdAt` inline, with `audit.systemPrompt` /
 * `audit.rawResponse` behind a further "Show raw" toggle (collapsed by
 * default). Mirrors ApplicabilityCheck.contextTrace.test.tsx's mock/render
 * setup (THE-423 Task 14).
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/api')>();
  return {
    ...original,
    default: {
      ...original.default,
      get: vi.fn(),
    },
    oracleAPI: {
      ...original.oracleAPI,
      assess: vi.fn(),
      history: vi.fn().mockResolvedValue({ data: { data: [] } }),
    },
    normsAPI: {
      ...original.normsAPI,
      getContextTrace: vi.fn(),
    },
  };
});

import api, { oracleAPI, normsAPI } from '../../services/api';
import { useArchitectureStore } from '../../stores/architectureStore';
import OraclePanel from './OraclePanel';

const assessMock = vi.mocked(oracleAPI.assess);
const getContextTraceMock = vi.mocked(normsAPI.getContextTrace);

const BASE_VERDICT = {
  acceptanceRiskScore: 42,
  riskLevel: 'medium',
  overallPosition: 'contested',
  agentVerdicts: [],
  resistanceFactors: [],
  mitigationSuggestions: [],
  fatigueForecast: { projectedDelayMonths: 0, budgetAtRisk: 0, overloadedStakeholders: [] },
  timestamp: '2026-07-19T10:00:00.000Z',
  durationMs: 1200,
};

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/project/p1/oracle']}>
      <Routes>
        <Route path="/project/:projectId/oracle" element={<OraclePanel />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText(/CRM Consolidation/i), { target: { value: 'Test Proposal' } });
  fireEvent.change(screen.getByPlaceholderText(/Describe the proposed change/i), { target: { value: 'A description long enough.' } });
  fireEvent.click(screen.getByText('CRM System'));
  fireEvent.click(screen.getByText('Consult Oracle'));
  await waitFor(() => expect(assessMock).toHaveBeenCalled());
}

describe('OraclePanel — Evidence / Audit section (THE-423 Task 15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useArchitectureStore.setState({
      elements: [
        {
          id: 'el1',
          name: 'CRM System',
          layer: 'application',
        } as never,
      ],
      projectName: 'Test Project',
    });
  });
  afterEach(() => {
    cleanup();
  });

  test('does not render the Evidence / Audit affordance when contextTraceId is absent', async () => {
    assessMock.mockResolvedValue({ data: { data: { ...BASE_VERDICT }, assessmentId: 'a1' } } as never);
    renderPanel();
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByText(/Stakeholder Verdicts/i)).toBeInTheDocument());
    expect(screen.queryByText(/Evidence \/ Audit/i)).not.toBeInTheDocument();
  });

  test('expand lazy-fetches the trace and shows model/createdAt, rawResponse behind "Show raw"', async () => {
    assessMock.mockResolvedValue({
      data: { data: { ...BASE_VERDICT, contextTraceId: 'trace-oracle-1' }, assessmentId: 'a1' },
    } as never);
    getContextTraceMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          requestId: 'trace-oracle-1',
          feature: 'oracle',
          projectId: 'p1',
          consumed: [],
          model: 'claude-opus-4-6',
          createdAt: '2026-07-19T10:05:00.000Z',
          audit: {
            systemPrompt: 'You are a stakeholder persona evaluating a proposal...',
            rawResponse: '{"position":"contested","reasoning":"..."}',
          },
        },
      },
    } as never);

    renderPanel();
    await fillAndSubmit();

    const trigger = await screen.findByText(/Evidence \/ Audit/i);
    expect(getContextTraceMock).not.toHaveBeenCalled();
    fireEvent.click(trigger);

    await waitFor(() => expect(getContextTraceMock).toHaveBeenCalledWith('p1', 'trace-oracle-1'));

    await waitFor(() => expect(screen.getByText(/claude-opus-4-6/)).toBeInTheDocument());
    expect(screen.getByText(/2026/)).toBeInTheDocument();

    // Raw content is collapsed by default — not in the document yet.
    expect(screen.queryByText(/You are a stakeholder persona/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Show raw/i));
    expect(await screen.findByText(/You are a stakeholder persona/)).toBeInTheDocument();
    expect(screen.getByText(/"position":"contested"/)).toBeInTheDocument();
  });

  test('404 / missing audit: graceful "no audit trace available" note, no crash', async () => {
    assessMock.mockResolvedValue({
      data: { data: { ...BASE_VERDICT, contextTraceId: 'trace-oracle-404' }, assessmentId: 'a1' },
    } as never);
    getContextTraceMock.mockRejectedValue({ response: { status: 404 } });

    renderPanel();
    await fillAndSubmit();

    const trigger = await screen.findByText(/Evidence \/ Audit/i);
    fireEvent.click(trigger);

    await waitFor(() => expect(getContextTraceMock).toHaveBeenCalled());
    expect(await screen.findByText(/no audit trace available/i)).toBeInTheDocument();
    // panel did not crash — the verdict is still rendered
    expect(screen.getByText(/Stakeholder Verdicts/i)).toBeInTheDocument();
  });
});
