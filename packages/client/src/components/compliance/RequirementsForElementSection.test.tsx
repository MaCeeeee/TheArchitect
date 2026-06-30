// @vitest-environment jsdom
/**
 * THE-305 Fläche A — RequirementsForElementSection tests.
 * Covers AC-1 (renders linked requirements), AC-4 (inline status change),
 * AC-6 (empty state), AC-7 (display sort + snapshot of behaviour).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { RequirementDoc } from '../../services/api';
import {
  RequirementsForElementSection,
  sortRequirementsForDisplay,
} from './RequirementsForElementSection';

vi.mock('../../services/api', () => ({
  requirementsAPI: {
    byElement: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { requirementsAPI } from '../../services/api';
const byElement = vi.mocked(requirementsAPI.byElement);
const update = vi.mocked(requirementsAPI.update);

function req(partial: Partial<RequirementDoc> & Pick<RequirementDoc, '_id' | 'title' | 'priority' | 'status'>): RequirementDoc {
  return {
    projectId: 'p1',
    regulationId: 'r1',
    sourceParagraph: '§ 6',
    description: 'desc',
    linkedElementIds: ['el-1'],
    createdBy: 'llm',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sortRequirementsForDisplay (AC-7)', () => {
  test('severity first (must › should › may), then open before closed', () => {
    const out = sortRequirementsForDisplay([
      req({ _id: '1', title: 'may-open', priority: 'may', status: 'open' }),
      req({ _id: '2', title: 'must-done', priority: 'must', status: 'done' }),
      req({ _id: '3', title: 'must-open', priority: 'must', status: 'open' }),
      req({ _id: '4', title: 'should-open', priority: 'should', status: 'open' }),
    ]);
    expect(out.map((r) => r.title)).toEqual(['must-open', 'must-done', 'should-open', 'may-open']);
  });

  test('does not mutate the input array', () => {
    const input = [
      req({ _id: '1', title: 'a', priority: 'may', status: 'open' }),
      req({ _id: '2', title: 'b', priority: 'must', status: 'open' }),
    ];
    sortRequirementsForDisplay(input);
    expect(input.map((r) => r.title)).toEqual(['a', 'b']);
  });
});

describe('RequirementsForElementSection', () => {
  test('AC-1/AC-7: renders requirements in severity-then-status order', async () => {
    byElement.mockResolvedValue({
      data: { data: [
        req({ _id: '1', title: 'R-may-open', priority: 'may', status: 'open' }),
        req({ _id: '2', title: 'R-must-done', priority: 'must', status: 'done' }),
        req({ _id: '3', title: 'R-must-open', priority: 'must', status: 'open' }),
      ] },
    } as never);

    render(<RequirementsForElementSection projectId="p1" elementId="el-1" />);

    const titles = await screen.findAllByText(/^R-/);
    expect(titles.map((n) => n.textContent)).toEqual(['R-must-open', 'R-must-done', 'R-may-open']);
  });

  test('AC-6: shows empty state when no requirements link to the element', async () => {
    byElement.mockResolvedValue({ data: { data: [] } } as never);
    render(<RequirementsForElementSection projectId="p1" elementId="el-1" />);
    expect(
      await screen.findByText(/No requirements generated for this element yet/i),
    ).toBeInTheDocument();
  });

  test('AC-4: inline status change persists via requirementsAPI.update', async () => {
    byElement.mockResolvedValue({
      data: { data: [req({ _id: 'req-9', title: 'Run risk analysis', priority: 'must', status: 'open' })] },
    } as never);
    update.mockResolvedValue({ data: { data: {} } } as never);

    render(<RequirementsForElementSection projectId="p1" elementId="el-1" />);

    const select = await screen.findByLabelText('Status: Run risk analysis');
    fireEvent.change(select, { target: { value: 'in_progress' } });

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('p1', 'req-9', { status: 'in_progress' }),
    );
  });
});
