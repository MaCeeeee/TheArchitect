// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const del = vi.fn();
const update = vi.fn();
vi.mock('../../services/api', () => ({
  workspaceAPI: { delete: (...a: unknown[]) => del(...a), update: (...a: unknown[]) => update(...a) },
}));
vi.mock('../3d/CameraControls', () => ({ flyToWorkspace: vi.fn(), fitAllWorkspaces: vi.fn() }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import WorkspaceBar from './WorkspaceBar';

const WS = { id: 'ws-1', name: 'Alpha', projectId: 'p1', source: 'csv' as const, color: '#f00', offsetX: 0, createdAt: '2026-11-17T00:00:00Z' };
const el = (id: string) => ({ id, name: id, type: 'goal', layer: 'motivation', togafDomain: 'motivation', workspaceId: 'ws-1', position3D: { x: 0, y: 0, z: 0 } });

beforeEach(() => {
  del.mockReset(); update.mockReset(); toastSuccess.mockReset(); toastError.mockReset();
  useWorkspaceStore.setState({ workspaces: [WS], activeWorkspaceId: 'ws-1' });
  // cast: the test elements carry only the fields WorkspaceBar reads
  useArchitectureStore.setState({ projectId: 'p1', elements: [el('e1'), el('e2')] as never });
});

const confirmDelete = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByTitle('Remove this architecture from the project'));
  await user.click(screen.getByRole('button', { name: 'Yes' }));
};

describe('WorkspaceBar — delete', () => {
  test('server fails → elements and workspace stay, one error toast, no success toast', async () => {
    del.mockRejectedValue({ response: { status: 500, data: { error: 'Failed to delete workspace' } } });
    render(<WorkspaceBar />);
    await confirmDelete();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspaces.map((w) => w.id)).toEqual(['ws-1']);
    expect(useArchitectureStore.getState().elements).toHaveLength(2);
    expect(del).toHaveBeenCalledWith('p1', 'ws-1');
  });

  test('server confirms → elements and workspace removed, one success toast', async () => {
    del.mockResolvedValue({ data: { success: true } });
    render(<WorkspaceBar />);
    await confirmDelete();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Workspace deleted'));
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(useArchitectureStore.getState().elements).toHaveLength(0);
    expect(toastError).not.toHaveBeenCalled();
  });

  test('nothing is removed locally before the server answered', async () => {
    let resolve!: (v: unknown) => void;
    del.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<WorkspaceBar />);
    await confirmDelete();
    expect(useArchitectureStore.getState().elements).toHaveLength(2);
    expect(toastSuccess).not.toHaveBeenCalled();
    resolve({ data: { success: true } });
    await waitFor(() => expect(useArchitectureStore.getState().elements).toHaveLength(0));
  });
});
