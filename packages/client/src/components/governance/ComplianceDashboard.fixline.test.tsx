// @vitest-environment jsdom
/**
 * REQ-FIX-001.1 / AC-4 (THE-499) — ComplianceDashboard renders the
 * deterministic fix instruction (from `deriveViolationFix`) plus the
 * "Field {field}: {currentValue} -> {expectedValue}" transition line for
 * each violation, alongside the existing element/message/policy content.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const checkCompliance = vi.fn();
vi.mock('../../services/api', () => ({
  governanceAPI: {
    checkCompliance: (...a: unknown[]) => checkCompliance(...a),
  },
}));

import ComplianceDashboard from './ComplianceDashboard';

const renderDashboard = () =>
  render(
    <MemoryRouter initialEntries={['/project/p1/compliance']}>
      <Routes>
        <Route path="/project/:projectId/compliance" element={<ComplianceDashboard />} />
      </Routes>
    </MemoryRouter>,
  );

const okReport = (data: unknown) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  checkCompliance.mockReset();
});

describe('ComplianceDashboard — deterministic fix line (THE-499)', () => {
  test('renders the derived fix instruction + AC-4 transition line per violation', async () => {
    checkCompliance.mockReturnValue(
      okReport({
        totalElements: 1,
        totalPolicies: 1,
        violations: [
          {
            elementName: 'X',
            policyName: 'P',
            severity: 'high',
            category: 'c',
            message: 'm',
            field: 'description',
            currentValue: '',
            expectedValue: true,
            operator: 'exists',
          },
        ],
        summary: { critical: 0, high: 1, medium: 0, low: 0, complianceScore: 50 },
        byCategory: { c: 1 },
      }),
    );

    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));

    await waitFor(() => {
      expect(checkCompliance).toHaveBeenCalledWith('p1');
    });

    // REQ-FIX-001.1: exists:true + empty currentValue -> "Add description"
    expect(await screen.findByText(/Add description/)).toBeInTheDocument();
    // AC-4: "Field {field}: {currentValue} -> {expectedValue}" transition line
    expect(screen.getByText(/Field description:/)).toBeInTheDocument();
    // existing content must survive (not replaced)
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('m')).toBeInTheDocument();
    expect(screen.getByText(/Policy: P/)).toBeInTheDocument();
  });
});
