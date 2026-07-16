// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getElements = vi.fn();
const getConnections = vi.fn();
const getProject = vi.fn();
const listWorkspaces = vi.fn();
vi.mock('../services/api', () => ({
  architectureAPI: {
    getElements: (...a: unknown[]) => getElements(...a),
    getConnections: (...a: unknown[]) => getConnections(...a),
  },
  projectAPI: { get: (...a: unknown[]) => getProject(...a) },
  workspaceAPI: { list: (...a: unknown[]) => listWorkspaces(...a) },
}));

const socketOn = vi.fn();
const socketOff = vi.fn();
vi.mock('../services/socket', () => ({
  connectSocket: () => ({ on: socketOn }),
  joinProject: vi.fn(),
  getSocket: () => ({ off: socketOff }),
}));

// envision/compliance loads fire-and-forget network calls — stub the stores' load fns
import { useEnvisionStore } from '../stores/envisionStore';
import { useComplianceStore } from '../stores/complianceStore';
import { useArchitectureStore } from '../stores/architectureStore';
import { useProjectData } from './useProjectData';

const ok = (data: unknown) => Promise.resolve({ data: { data } });

beforeEach(() => {
  getElements.mockReset().mockReturnValue(ok([{ id: 'e1', name: 'App', type: 'application_component', layer: 'application', position3D: { x: 0, y: 8, z: 0 } }]));
  getConnections.mockReset().mockReturnValue(ok([]));
  getProject.mockReset().mockReturnValue(ok({ name: 'Acme' }));
  listWorkspaces.mockReset().mockReturnValue(ok([]));
  socketOn.mockReset();
  socketOff.mockReset();
  useEnvisionStore.setState({ load: vi.fn() } as never);
  useComplianceStore.setState({ loadViolations: vi.fn() } as never);
});

describe('useProjectData (ADR-0005 AC-2)', () => {
  test('loads project data into the stores and resolves loading', async () => {
    const { result } = renderHook(() => useProjectData('p1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(useArchitectureStore.getState().elements).toHaveLength(1);
    expect(useArchitectureStore.getState().projectId).toBe('p1');
    expect(socketOn).toHaveBeenCalledWith('violation:update', expect.any(Function));
  });

  test('surfaces load failures as error', async () => {
    getElements.mockReturnValue(Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useProjectData('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load project data');
  });

  test('cleanup removes only its own violation listener', async () => {
    const { result, unmount } = renderHook(() => useProjectData('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    expect(socketOff).toHaveBeenCalledWith('violation:update', expect.any(Function));
  });

  test('does nothing without a projectId', () => {
    const { result } = renderHook(() => useProjectData(undefined));
    expect(getElements).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
  });
});
