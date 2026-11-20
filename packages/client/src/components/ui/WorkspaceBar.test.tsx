// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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
  useWorkspaceStore.setState({ workspaces: [WS], activeWorkspaceId: 'ws-1', pendingRequests: {} });
  // cast: the test elements carry only the fields WorkspaceBar reads
  useArchitectureStore.setState({ projectId: 'p1', elements: [el('e1'), el('e2')] as never });
});

const tick = () => new Promise((r) => setTimeout(r, 0));

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
    await tick();
    expect(toastError).toHaveBeenCalledTimes(1);
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
    await tick();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
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

  test('pending DELETE → X is gone, "Deleting…" shown, a second DELETE is impossible; resolve → removed, one success toast', async () => {
    let resolve!: (v: unknown) => void;
    del.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<WorkspaceBar />);
    await confirmDelete();
    expect(screen.queryByTitle('Remove this architecture from the project')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
    expect(screen.getByText('Deleting…')).toBeInTheDocument();
    await tick();
    expect(del).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ data: { success: true } }); });
    await tick();
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
  });

  test('pending DELETE → double-click does not open the rename input', async () => {
    del.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<WorkspaceBar />);
    await confirmDelete();
    await user.dblClick(screen.getByText('Alpha'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await tick();
    expect(update).not.toHaveBeenCalled();
  });

  test('error toast names the server detail', async () => {
    del.mockRejectedValue({ response: { data: { error: 'Workspace not found' } } });
    render(<WorkspaceBar />);
    await confirmDelete();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await tick();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe('Could not delete the workspace on the server (Workspace not found). Nothing was removed.');
  });

  test('no project loaded → no DELETE, one error toast, workspace stays', async () => {
    useArchitectureStore.setState({ projectId: null });
    render(<WorkspaceBar />);
    await confirmDelete();
    await tick();
    expect(del).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspaces.map((w) => w.id)).toEqual(['ws-1']);
  });
});

const rename = async (to: string) => {
  const user = userEvent.setup();
  await user.dblClick(screen.getByText('Alpha'));
  const input = screen.getByRole('textbox');
  await user.clear(input);
  await user.type(input, `${to}{Enter}`);
};

describe('WorkspaceBar — rename', () => {
  test('server confirms → new name stays, exactly one PUT with name, color and offsetX', async () => {
    update.mockResolvedValue({ data: { data: { ...WS, name: 'Beta' } } });
    render(<WorkspaceBar />);
    await rename('Beta');
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('p1', 'ws-1', { name: 'Beta', color: '#f00', offsetX: 0 });
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Beta');
    expect(toastError).not.toHaveBeenCalled();
  });

  test('server fails → old name is back, one error toast', async () => {
    update.mockRejectedValue({ response: { status: 500 } });
    render(<WorkspaceBar />);
    await rename('Beta');
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await tick();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Alpha');
  });

  test('empty or unchanged name → no PUT', async () => {
    render(<WorkspaceBar />);
    await rename('   ');
    await rename('Alpha');
    await tick();
    expect(update).not.toHaveBeenCalled();
  });

  test('Escape cancels: no PUT, old name stays — even if blur follows', async () => {
    const user = userEvent.setup();
    render(<WorkspaceBar />);
    await user.dblClick(screen.getByText('Alpha'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Beta');
    // Browsers may fire blur while the input is being removed; jsdom does not.
    // Fire both in one act so the blur reaches the still-mounted input.
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(update).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Alpha');
  });
  test('Escape guard is reset: cancel once, then rename to Beta → exactly one PUT', async () => {
    update.mockResolvedValue({ data: { data: { ...WS, name: 'Beta' } } });
    const user = userEvent.setup();
    render(<WorkspaceBar />);
    await user.dblClick(screen.getByText('Alpha'));
    const first = screen.getByRole('textbox');
    act(() => {
      fireEvent.keyDown(first, { key: 'Escape' });
      fireEvent.blur(first);
    });
    await rename('Beta');
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Beta');
  });

  test('Enter followed by blur → exactly one PUT', async () => {
    update.mockResolvedValue({ data: { data: { ...WS, name: 'Beta' } } });
    const user = userEvent.setup();
    render(<WorkspaceBar />);
    await user.dblClick(screen.getByText('Alpha'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Beta');
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.blur(input);
    });
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('pending PUT → no second rename possible; PUT fails → "Alpha" back, one error toast', async () => {
    let reject!: (e: unknown) => void;
    update.mockReturnValue(new Promise((_, r) => { reject = r; }));
    const user = userEvent.setup();
    render(<WorkspaceBar />);
    await rename('Beta');
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Beta');
    await user.dblClick(screen.getByText('Beta'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => { reject({ response: { status: 500 } }); });
    await tick();
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Alpha');
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('pending PUT → X is hidden, so no DELETE can start', async () => {
    update.mockReturnValue(new Promise(() => {}));
    render(<WorkspaceBar />);
    await rename('Beta');
    expect(screen.queryByTitle('Remove this architecture from the project')).not.toBeInTheDocument();
    await tick();
    expect(del).not.toHaveBeenCalled();
  });

  test('error toast names the server detail', async () => {
    update.mockRejectedValue({ response: { status: 403, data: { error: 'Forbidden' } } });
    render(<WorkspaceBar />);
    await rename('Beta');
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await tick();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe('Could not save the new name on the server (Forbidden).');
  });

  test('no project loaded → no PUT, one error toast', async () => {
    useArchitectureStore.setState({ projectId: null });
    render(<WorkspaceBar />);
    await rename('Beta');
    await tick();
    expect(update).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});

// X-ray and the plateau view unmount the bar (Scene.tsx); the guard must outlive the component.
describe('WorkspaceBar — remount while a request is pending', () => {
  test('pending DELETE survives a remount → still "Deleting…", no second DELETE', async () => {
    let resolveDelete!: (v: unknown) => void;
    del.mockImplementation(() => new Promise((r) => { resolveDelete = r; }));
    const first = render(<WorkspaceBar />);
    await confirmDelete();
    expect(screen.getByText('Deleting…')).toBeInTheDocument();
    first.unmount();
    render(<WorkspaceBar />);
    expect(screen.getByText('Deleting…')).toBeInTheDocument();
    expect(screen.queryByTitle('Remove this architecture from the project')).not.toBeInTheDocument();
    await act(async () => { resolveDelete({ data: { success: true } }); });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Workspace deleted'));
    expect(del).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(useWorkspaceStore.getState().pendingRequests).toEqual({});
  });

  test('pending PUT survives a remount → still "Saving…", no second rename', async () => {
    let resolveUpdate!: (v: unknown) => void;
    update.mockImplementation(() => new Promise((r) => { resolveUpdate = r; }));
    const user = userEvent.setup();
    const first = render(<WorkspaceBar />);
    await rename('Beta');
    first.unmount();
    render(<WorkspaceBar />);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    await user.dblClick(screen.getByText('Beta'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => { resolveUpdate({ data: { data: { ...WS, name: 'Beta' } } }); });
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Beta');
  });
});
