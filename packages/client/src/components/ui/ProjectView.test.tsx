// @vitest-environment jsdom
/**
 * UC-METH-002 (REQ .2/.3/.4) — the classic action field: group mode › ladder step › phase hint,
 * and nothing while the connection mode runs.
 * Run: cd packages/client && npx vitest run src/components/ui/ProjectView.test.tsx
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { LadderReport } from '@thearchitect/shared';

// ── Mocks: the heavy children and the data hooks. The action field logic stays real. ──
vi.mock('../3d/Scene', () => ({ default: () => <div data-testid="scene" /> }));
vi.mock('./PropertyPanel', () => ({ default: () => null }));
vi.mock('./ConnectionTypePicker', () => ({ default: () => null }));
vi.mock('./SelectionActionBar', () => ({ default: () => null }));
vi.mock('./MissionControl', () => ({ default: () => null }));
vi.mock('./ComplianceOverlay', () => ({ default: () => null }));
vi.mock('../../hooks/useProjectData', () => ({ useProjectData: () => ({ loading: false, error: null }) }));
vi.mock('../groups/useLadderSync', () => ({ useLadderSync: () => {} }));

import ProjectView from './ProjectView';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useJourneyStore, type PhaseInfo } from '../../stores/journeyStore';
import { useAdvisorStore } from '../../stores/advisorStore';
import { useGroupModeStore } from '../../stores/groupModeStore';
import { useUIStore } from '../../stores/uiStore';
import { useRoadmapStore } from '../../stores/roadmapStore';

const ladderAt = (projectId: string, reached: number): LadderReport => ({
  projectId, highestRung: reached,
  rungs: [0, 1, 2, 3, 4, 5].map((i) => ({ index: i, title: '', provides: '', math: '', warnings: [], next: null,
    status: i <= reached ? 'reached' : i === reached + 1 ? 'open' : 'locked',
    facts: i === 2 ? [{ label: 'groups', value: 0 }, { label: 'groups with members', value: 0 }] : [] })),
}) as unknown as LadderReport;

const phase = (p: number, nextAction: PhaseInfo['nextAction'] = null): PhaseInfo => ({
  phase: p as PhaseInfo['phase'], admLabel: `P${p}`, name: `Phase ${p}`, description: 'the phase hint', isDone: false,
  progress: { current: 0, target: 1, label: '' }, nextAction,
});

beforeEach(() => {
  useArchitectureStore.setState({ projectId: 'p1', elements: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, name: `E${i}`, type: 'business_actor' })) as never, connections: [] });
  useJourneyStore.setState({ currentPhase: 2, phases: [phase(1), phase(2, { label: 'Add Connections', route: '__connection_mode__' }), phase(3), phase(4), phase(5), phase(6)] } as never);
  useAdvisorStore.setState({ ladder: null, focusRung: null });
  useUIStore.setState({ isConnectionMode: false, connectionSourceId: null, journeyStation: null });
  useRoadmapStore.setState({ isPlateauViewActive: false, plateauSnapshots: [] });
  useGroupModeStore.getState().reset();
});

const renderView = () =>
  render(
    <MemoryRouter initialEntries={['/project/p1']}>
      <Routes><Route path="/project/:projectId" element={<ProjectView />} /></Routes>
    </MemoryRouter>,
  );

describe('ProjectView — the action field (UC-METH-002)', () => {
  test('no ladder report → the phase hint', () => {
    renderView();
    expect(screen.getByRole('button', { name: /Add Connections/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Model check/ })).not.toBeInTheDocument();
  });

  test('the ladder asks for groups → the ladder step in place of the phase hint; "Make a group" starts the mode', () => {
    useAdvisorStore.setState({ ladder: ladderAt('p1', 1) });
    renderView();
    const label = screen.getByRole('button', { name: 'Model check: step 1 of 5' });
    expect(label).toHaveAccessibleDescription('Show this step in the model check.');
    expect(screen.getByText('Next step: Make a minimum of two groups.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Connections/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Make a group/ }));
    expect(useGroupModeStore.getState()).toMatchObject({ active: true, projectId: 'p1' });
    expect(screen.getByText('Select the elements of the group.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Model check: step 1 of 5' })).not.toBeInTheDocument();
  });

  test('the ladder report of another project → the phase hint', () => {
    useAdvisorStore.setState({ ladder: ladderAt('p2', 1) });
    renderView();
    expect(screen.getByRole('button', { name: /Add Connections/ })).toBeInTheDocument();
  });

  test('group mode of this project comes first, before the ladder step', () => {
    useAdvisorStore.setState({ ladder: ladderAt('p1', 1) });
    useGroupModeStore.getState().start('p1');
    renderView();
    expect(screen.getByText('Select the elements of the group.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Model check: step 1 of 5' })).not.toBeInTheDocument();
  });

  test('connection mode → no action field; it also ends a group mode that is not busy', () => {
    useAdvisorStore.setState({ ladder: ladderAt('p1', 1) });
    useGroupModeStore.getState().start('p1');
    renderView();
    act(() => { useUIStore.setState({ isConnectionMode: true }); });
    expect(useGroupModeStore.getState().active).toBe(false);
    expect(screen.queryByText('Select the elements of the group.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Model check/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Connections/ })).not.toBeInTheDocument();
  });

  test('connection mode while the request runs does not end the group mode', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.setState({ busy: true });
    renderView();
    act(() => { useUIStore.setState({ isConnectionMode: true }); });
    expect(useGroupModeStore.getState().active).toBe(true);
  });

  test('plateau view → the phase hint, no "Make a group" (the scene cannot select there)', () => {
    useAdvisorStore.setState({ ladder: ladderAt('p1', 1) });
    useRoadmapStore.setState({ isPlateauViewActive: true });
    renderView();
    expect(screen.getByRole('button', { name: /Add Connections/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Make a group/ })).not.toBeInTheDocument();
  });

  test('the plateau view starts while the group mode runs → the group mode ends', () => {
    useGroupModeStore.getState().start('p1');
    renderView();
    act(() => { useRoadmapStore.setState({ isPlateauViewActive: true }); });
    expect(useGroupModeStore.getState().active).toBe(false);
  });

  test('the plateau view starts while the group is being made → the group mode stays', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.setState({ busy: true });
    renderView();
    act(() => { useRoadmapStore.setState({ isPlateauViewActive: true }); });
    expect(useGroupModeStore.getState().active).toBe(true);
  });
});
