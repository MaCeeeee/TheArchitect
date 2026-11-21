// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

// Drive the journey + architecture stores the component reads.
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import StationActions from './StationActions';
import { useAdvisorStore } from '../../stores/advisorStore';
import { useGroupModeStore } from '../../stores/groupModeStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import type { LadderReport } from '@thearchitect/shared';

const seedPhases = (nextLabel: string | null) =>
  useJourneyStore.setState({
    currentPhase: 2,
    phases: ([1, 2, 3, 4, 5, 6] as const).map((p) => ({
      phase: p, admLabel: '', name: '', description: '', isDone: false,
      progress: { current: 0, target: 1, label: '' },
      nextAction: p === 2 && nextLabel ? { label: nextLabel, route: '__connection_mode__' } : null,
    })),
  });

beforeEach(() => {
  navigate.mockReset();
  useArchitectureStore.setState({ elements: [{ id: 'a' }] as never });
  seedPhases('Add Connections');
});

const renderIt = (station = 'model') =>
  render(<MemoryRouter><StationActions station={station as never} projectId="p1" /></MemoryRouter>);

describe('StationActions (THE-492)', () => {
  test('renders the station actions and executes on click', () => {
    renderIt('model');
    const primary = screen.getByRole('button', { name: /Add Connections/i });
    fireEvent.click(primary);
    expect(navigate).toHaveBeenCalledWith('/project/p1'); // sentinel resolved to classic
  });

  test('renders nothing when the world is empty (empty-world CTA owns that state)', () => {
    useArchitectureStore.setState({ elements: [] as never });
    const { container } = renderIt('model');
    expect(container).toBeEmptyDOMElement();
  });
});

const ladderAt = (projectId: string, reached: number): LadderReport => ({
  projectId, highestRung: reached,
  rungs: [0, 1, 2, 3, 4, 5].map((i) => ({ index: i, title: '', provides: '', math: '', warnings: [], next: null,
    status: i <= reached ? 'reached' : i === reached + 1 ? 'open' : 'locked',
    facts: i === 2 ? [{ label: 'groups', value: reached >= 2 ? 2 : 0 }, { label: 'groups with members', value: reached >= 2 ? 2 : 0 }] : [] })),
}) as unknown as LadderReport;
const sixElements = () => useArchitectureStore.setState({ elements: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}` })) as never });

describe('StationActions — guided step 2 (UC-METH-002)', () => {
  beforeEach(() => { useGroupModeStore.getState().reset(); });

  test('station Model, step 2 open, 6 elements → "Make a group" is the first action and starts the mode', () => {
    sixElements();
    useAdvisorStore.setState({ ladder: ladderAt('p1', 1) });
    renderIt('model');
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Make a group');
    fireEvent.click(buttons[0]);
    expect(useGroupModeStore.getState().active).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  test('step 2 reached, 6 elements → no "Make a group"', () => {
    sixElements();
    useAdvisorStore.setState({ ladder: ladderAt('p1', 2) });
    renderIt('model');
    expect(screen.queryByRole('button', { name: 'Make a group' })).not.toBeInTheDocument();
  });

  test('another station → no "Make a group" in front', () => {
    sixElements();
    useAdvisorStore.setState({ ladder: ladderAt('p1', 1) });
    renderIt('vision');
    expect(screen.getAllByRole('button')[0]).not.toHaveTextContent('Make a group');
  });

  test('station Model in the plateau view → no "Make a group" in front', () => {
    sixElements();
    useAdvisorStore.setState({ ladder: ladderAt('p1', 1) });
    useRoadmapStore.setState({ isPlateauViewActive: true });
    renderIt('model');
    expect(screen.queryByRole('button', { name: 'Make a group' })).not.toBeInTheDocument();
    useRoadmapStore.setState({ isPlateauViewActive: false });
  });
});
