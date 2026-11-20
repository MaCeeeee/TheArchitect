// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const create = vi.fn();
const importCSV = vi.fn();
vi.mock('../../services/api', () => ({
  workspaceAPI: { create: (...a: unknown[]) => create(...a) },
  architectureAPI: { importCSV: (...a: unknown[]) => importCSV(...a) },
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import CSVImportDialog from './CSVImportDialog';

const CSV = [
  'name,type,layer,togafDomain,description,status,riskLevel,maturityLevel',
  'Goal A,goal,motivation,motivation,,,,',
  'App B,application_component,application,application,,,,',
].join('\n');

const onClose = vi.fn();
const renderDialog = () =>
  render(
    <MemoryRouter initialEntries={['/project/p1']}>
      <Routes><Route path="/project/:projectId" element={<CSVImportDialog isOpen onClose={onClose} />} /></Routes>
    </MemoryRouter>,
  );

const uploadAndImport = async () => {
  const user = userEvent.setup();
  const input = document.getElementById('csv-file-input') as HTMLInputElement;
  await user.upload(input, new File([CSV], 'my-import.csv', { type: 'text/csv' }));
  await user.click(await screen.findByRole('button', { name: /^Import \(2\)/ }));
};

beforeEach(() => {
  create.mockReset(); importCSV.mockReset(); onClose.mockReset(); toastSuccess.mockReset(); toastError.mockReset();
  useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null });
  useArchitectureStore.setState({ elements: [], connections: [] });
});

describe('CSVImportDialog — new workspace', () => {
  test('workspace create fails → no element import, no local workspace, error shown, dialog stays open', async () => {
    create.mockRejectedValue({ response: { status: 500, data: { error: 'Failed to create workspace' } } });
    renderDialog();
    await uploadAndImport();
    expect(await screen.findByText(/Could not create workspace "my-import" on the server \(Failed to create workspace\)\. Nothing was imported\./)).toBeInTheDocument();
    expect(importCSV).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(useArchitectureStore.getState().elements).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Import failed');
  });

  test('workspace create succeeds → workspace + elements carry its id, server import called, dialog closes', async () => {
    create.mockResolvedValue({ data: { data: {} } });
    importCSV.mockResolvedValue({ data: { success: true } });
    renderDialog();
    await uploadAndImport();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [projectId, body] = create.mock.calls[0];
    expect(projectId).toBe('p1');
    expect(body).toMatchObject({ name: 'my-import', source: 'csv' });
    const wsId = (body as { id: string }).id;
    expect(useWorkspaceStore.getState().workspaces.map((w) => w.id)).toEqual([wsId]);
    const sent = importCSV.mock.calls[0][1] as { elements: Array<{ workspaceId: string }> };
    expect(sent.elements).toHaveLength(2);
    expect(sent.elements.every((e) => e.workspaceId === wsId)).toBe(true);
    const local = useArchitectureStore.getState().elements;
    expect(local).toHaveLength(2);
    expect(local.every((e) => e.workspaceId === wsId)).toBe(true);
    // order: create called before the element import
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(importCSV.mock.invocationCallOrder[0]);
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/^CSV import complete/));
  });
});

describe('CSVImportDialog — merge into existing workspace', () => {
  test('no workspace create call; elements go to the chosen workspace', async () => {
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws-existing', name: 'Existing', projectId: 'p1', source: 'csv', color: '#fff', offsetX: 0, createdAt: '2026-11-17T00:00:00Z' }],
      activeWorkspaceId: 'ws-existing',
    });
    importCSV.mockResolvedValue({ data: { success: true } });
    renderDialog();
    const user = userEvent.setup();
    const input = document.getElementById('csv-file-input') as HTMLInputElement;
    await user.upload(input, new File([CSV], 'my-import.csv', { type: 'text/csv' }));
    // merge mode + choose the target (mergeTargetId starts as '' — choosing is required)
    await user.click(screen.getByRole('button', { name: 'Merge into Existing' }));
    await user.selectOptions(screen.getByRole('combobox'), 'ws-existing');
    await user.click(await screen.findByRole('button', { name: /^Import \(2\)/ }));
    await waitFor(() => expect(importCSV).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    const sent = importCSV.mock.calls[0][1] as { elements: Array<{ workspaceId: string }> };
    expect(sent.elements.every((e) => e.workspaceId === 'ws-existing')).toBe(true);
  });
});
