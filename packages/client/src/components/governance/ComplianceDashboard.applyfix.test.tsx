// @vitest-environment jsdom
/**
 * REQ-FIX-001.2 (THE-502) — der Ein-Klick-[Fix]-Button.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const checkCompliance = vi.fn();
const updateElement = vi.fn();
vi.mock('../../services/api', () => ({
  governanceAPI: { checkCompliance: (...a: unknown[]) => checkCompliance(...a) },
  architectureAPI: { updateElement: (...a: unknown[]) => updateElement(...a) },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
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
const reportWith = (violations: unknown[]) => ({
  totalElements: 1, totalPolicies: 1, violations,
  summary: { critical: 0, high: violations.length, medium: 0, low: 0, complianceScore: 50 },
  byCategory: { c: violations.length },
});
const equalsStatusViolation = {
  elementId: 'el-1', elementName: 'X', elementType: 'application_component', policyName: 'P',
  severity: 'high', category: 'c', message: 'status must be current',
  field: 'status', currentValue: 'retired', expectedValue: 'current', operator: 'equals',
};
const setRole = (role: string) =>
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', name: 'A', role }, isAuthenticated: true } as never);

beforeEach(() => {
  checkCompliance.mockReset();
  updateElement.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  setRole('chief_architect');
});

describe('ComplianceDashboard — one-click [Fix] (THE-502)', () => {
  test('zeigt [Fix] bei equals-auf-fixbarem-Feld, wendet an und re-checkt danach', async () => {
    checkCompliance
      .mockReturnValueOnce(okReport(reportWith([equalsStatusViolation])))
      .mockReturnValueOnce(okReport(reportWith([])));
    updateElement.mockResolvedValue({ data: { success: true } });

    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await screen.findByText(/Set status to current/);

    fireEvent.click(screen.getByRole('button', { name: /^Fix$/ }));

    await waitFor(() => expect(updateElement).toHaveBeenCalledWith('p1', 'el-1', { status: 'current' }));
    await waitFor(() => expect(checkCompliance).toHaveBeenCalledTimes(2));
  });

  test('versteckt [Fix] bei nicht-applicable Operator (contains)', async () => {
    checkCompliance.mockReturnValue(okReport(reportWith([
      { ...equalsStatusViolation, field: 'description', operator: 'contains', currentValue: 'a', expectedValue: 'pii' },
    ])));
    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await screen.findByText(/Include 'pii' in description/);
    expect(screen.queryByRole('button', { name: /^Fix$/ })).not.toBeInTheDocument();
  });

  test('versteckt [Fix] bei nicht-fixbarem Feld (type) trotz equals', async () => {
    checkCompliance.mockReturnValue(okReport(reportWith([
      { ...equalsStatusViolation, field: 'type', currentValue: 'node', expectedValue: 'application_component' },
    ])));
    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await screen.findByText(/Set type to application_component/);
    expect(screen.queryByRole('button', { name: /^Fix$/ })).not.toBeInTheDocument();
  });
});
