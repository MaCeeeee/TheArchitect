// @vitest-environment jsdom
// packages/client/src/components/journey/CommandMenu.test.tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

import { useUIStore } from '../../stores/uiStore';
import { useJourneyStore } from '../../stores/journeyStore';
import CommandMenu from './CommandMenu';

beforeEach(() => {
  navigate.mockReset();
  useUIStore.setState({ isCommandMenuOpen: true });
  useJourneyStore.setState({ currentPhase: 6 }); // everything available
});

const renderMenu = () => render(<MemoryRouter><CommandMenu projectId="p1" /></MemoryRouter>);

describe('CommandMenu (THE-493)', () => {
  test('renders nothing when closed', () => {
    useUIStore.setState({ isCommandMenuOpen: false });
    const { container } = renderMenu();
    expect(container).toBeEmptyDOMElement();
  });

  test('open: search input has focus; typing filters the list', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'matrix' } });
    expect(screen.getByRole('option', { name: /Coverage matrix/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Go to Vision/i })).toBeNull();
  });

  test('Enter runs the top match and closes', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'blueprint' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/project/p1/blueprint');
    expect(useUIStore.getState().isCommandMenuOpen).toBe(false);
  });

  test('ArrowDown moves the active option', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    const first = input.getAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).not.toBe(first);
  });

  test('Tab is swallowed — focus never leaves the search input', () => {
    renderMenu();
    const input = screen.getByRole('combobox');
    const e = fireEvent.keyDown(input, { key: 'Tab' });
    // preventDefault called → fireEvent returns false
    expect(e).toBe(false);
    expect(input).toHaveFocus();
  });

  test('Escape closes without running anything', () => {
    renderMenu();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(useUIStore.getState().isCommandMenuOpen).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  test('unavailable commands are hidden (phase gate)', () => {
    useJourneyStore.setState({ currentPhase: 1 });
    renderMenu();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'standards' } });
    expect(screen.queryByRole('option', { name: /Standards & regulations/i })).toBeNull();
  });
});
