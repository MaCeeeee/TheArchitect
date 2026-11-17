import { describe, test, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('../services/api', () => ({
  workspaceAPI: { create: (...a: unknown[]) => create(...a) },
}));

import { persistNewWorkspace, WorkspaceCreateError } from './workspacePersistence';

const ws = { id: 'ws-1-abcde', name: 'My Import', source: 'csv' as const, color: '#fff', offsetX: 40 };

// Braces matter: a function returned from beforeEach is run as cleanup by Vitest.
beforeEach(() => { create.mockReset(); });

describe('persistNewWorkspace', () => {
  test('sends id, name, source, color and offsetX to the server', async () => {
    create.mockResolvedValue({ data: { data: { _id: ws.id } } });
    await persistNewWorkspace('p1', ws);
    expect(create).toHaveBeenCalledWith('p1', ws);
  });

  test('server error → WorkspaceCreateError naming the workspace and the server message', async () => {
    create.mockRejectedValue({ response: { status: 500, data: { error: 'Failed to create workspace' } } });
    const err = await persistNewWorkspace('p1', ws).catch((e) => e);
    expect(err).toBeInstanceOf(WorkspaceCreateError);
    expect(err.message).toBe('Could not create workspace "My Import" on the server (Failed to create workspace). Nothing was imported.');
  });

  test('network error without response → uses the error message', async () => {
    create.mockRejectedValue(new Error('Network Error'));
    const err = await persistNewWorkspace('p1', ws).catch((e) => e);
    expect(err.message).toBe('Could not create workspace "My Import" on the server (Network Error). Nothing was imported.');
  });
});
