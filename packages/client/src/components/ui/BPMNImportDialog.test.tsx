// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const create = vi.fn();
const importBPMN = vi.fn();
vi.mock('../../services/api', () => ({
  workspaceAPI: { create: (...a: unknown[]) => create(...a) },
  architectureAPI: { importBPMN: (...a: unknown[]) => importBPMN(...a) },
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import BPMNImportDialog from './BPMNImportDialog';

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d1">
  <bpmn:process id="P1" name="Order">
    <bpmn:task id="T1" name="Check order"/>
    <bpmn:task id="T2" name="Ship order"/>
    <bpmn:sequenceFlow id="F1" sourceRef="T1" targetRef="T2"/>
  </bpmn:process>
</bpmn:definitions>`;

const onClose = vi.fn();
const renderDialog = () =>
  render(
    <MemoryRouter initialEntries={['/project/p1']}>
      <Routes><Route path="/project/:projectId" element={<BPMNImportDialog isOpen onClose={onClose} />} /></Routes>
    </MemoryRouter>,
  );

const upload = async (user: ReturnType<typeof userEvent.setup>) => {
  const input = document.getElementById('bpmn-file-input') as HTMLInputElement;
  await user.upload(input, new File([BPMN], 'my-process.bpmn', { type: 'application/xml' }));
  // the Import button exists but stays disabled until the preview is there
  await screen.findByText(/Found 2 elements and 1 connections/);
};

const uploadAndImport = async () => {
  const user = userEvent.setup();
  await upload(user);
  await user.click(screen.getByRole('button', { name: /^Import$/ }));
};

beforeEach(() => {
  create.mockReset(); importBPMN.mockReset(); onClose.mockReset(); toastSuccess.mockReset(); toastError.mockReset();
  useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null });
  useArchitectureStore.setState({ elements: [], connections: [] });
});

describe('BPMNImportDialog — new workspace', () => {
  test('workspace create fails → no element import, no local workspace, error shown, dialog stays open', async () => {
    create.mockRejectedValue({ response: { status: 500, data: { error: 'Failed to create workspace' } } });
    renderDialog();
    await uploadAndImport();
    expect(await screen.findByText(/Could not create workspace "my-process" on the server \(Failed to create workspace\)\. Nothing was imported\./)).toBeInTheDocument();
    expect(importBPMN).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0);
    expect(useArchitectureStore.getState().elements).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  test('workspace create succeeds → workspace + elements carry its id, server import called, dialog closes', async () => {
    create.mockResolvedValue({ data: { data: {} } });
    importBPMN.mockResolvedValue({ data: { success: true } });
    renderDialog();
    await uploadAndImport();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [projectId, body] = create.mock.calls[0];
    expect(projectId).toBe('p1');
    expect(body).toMatchObject({ name: 'my-process', source: 'bpmn' });
    const wsId = (body as { id: string }).id;
    expect(useWorkspaceStore.getState().workspaces.map((w) => w.id)).toEqual([wsId]);
    const sent = importBPMN.mock.calls[0][1] as { elements: Array<{ workspaceId: string }> };
    expect(sent.elements).toHaveLength(2);
    expect(sent.elements.every((e) => e.workspaceId === wsId)).toBe(true);
    // order: create resolved before the element import was sent
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(importBPMN.mock.invocationCallOrder[0]);
    expect(toastSuccess).toHaveBeenCalledWith('BPMN import complete');
  });
});

describe('BPMNImportDialog — merge into existing workspace', () => {
  test('no workspace create call; elements go to the chosen workspace', async () => {
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws-existing', name: 'Existing', projectId: 'p1', source: 'bpmn', color: '#fff', offsetX: 0, createdAt: '2026-11-17T00:00:00Z' }],
      activeWorkspaceId: 'ws-existing',
    });
    importBPMN.mockResolvedValue({ data: { success: true } });
    renderDialog();
    const user = userEvent.setup();
    await upload(user);
    // merge mode + choose the target (mergeTargetId starts as '' — choosing is required)
    await user.click(screen.getByRole('button', { name: 'Merge into Existing' }));
    await user.selectOptions(screen.getByRole('combobox'), 'ws-existing');
    await user.click(screen.getByRole('button', { name: /^Import$/ }));
    await waitFor(() => expect(importBPMN).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    const sent = importBPMN.mock.calls[0][1] as { elements: Array<{ workspaceId: string }> };
    expect(sent.elements.every((e) => e.workspaceId === 'ws-existing')).toBe(true);
  });
});
