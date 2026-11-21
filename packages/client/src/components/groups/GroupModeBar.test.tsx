// @vitest-environment jsdom
/**
 * UC-METH-002 (REQ .3) — the action field in group mode.
 * Run: cd packages/client && npx vitest run src/components/groups/GroupModeBar.test.tsx
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  groupsAPI: { create: vi.fn() },
  advisorAPI: { scan: vi.fn(), health: vi.fn(), ladder: vi.fn() },
  architectureAPI: { createElement: vi.fn(), createConnection: vi.fn() },
}));

import GroupModeBar from './GroupModeBar';
import { useGroupModeStore } from '../../stores/groupModeStore';
import { useUIStore } from '../../stores/uiStore';

const submit = vi.fn(async () => {});
beforeEach(() => {
  submit.mockClear();
  useGroupModeStore.getState().reset();
  useGroupModeStore.setState({ submit } as never);
});

describe('GroupModeBar', () => {
  test('off and no feedback → renders nothing', () => {
    const { container } = render(<GroupModeBar projectId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('select: hint, count, "one more", then the make button from 2', () => {
    useGroupModeStore.getState().start('p1');
    const { rerender } = render(<GroupModeBar projectId="p1" />);
    expect(screen.getByText('Select the elements of the group.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Make the group/ })).not.toBeInTheDocument();
    useGroupModeStore.getState().toggle('a');
    rerender(<GroupModeBar projectId="p1" />);
    expect(screen.getByText('1 element selected.')).toBeInTheDocument();
    expect(screen.getByText('Select one more element.')).toBeInTheDocument();
    useGroupModeStore.getState().toggle('b');
    useGroupModeStore.getState().toggle('c');
    rerender(<GroupModeBar projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Make the group (3)' }));
    expect(screen.getByRole('textbox', { name: 'Name of the group' })).toBeInTheDocument();
    expect(screen.getByText('Write a name for the group.')).toBeInTheDocument();
  });

  test('name: Enter submits the form once; a blank name cannot be sent', async () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a'); useGroupModeStore.getState().toggle('b');
    useGroupModeStore.getState().toNaming();
    render(<GroupModeBar projectId="p1" />);
    const box = screen.getByRole('textbox', { name: 'Name of the group' });
    expect(screen.getByRole('button', { name: 'Make the group' })).toBeDisabled();
    await userEvent.type(box, 'Sales{Enter}');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('p1');
  });

  test('Esc ends the mode without a change', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a'); useGroupModeStore.getState().toggle('b');
    render(<GroupModeBar projectId="p1" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useGroupModeStore.getState().active).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  test('while the request runs, Cancel is disabled and Esc is ignored', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a'); useGroupModeStore.getState().toggle('b');
    useGroupModeStore.getState().toNaming();
    useGroupModeStore.setState({ name: 'Sales', busy: true });
    render(<GroupModeBar projectId="p1" />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useGroupModeStore.getState().active).toBe(true);
    expect(useGroupModeStore.getState().selected).toEqual(['a', 'b']);
  });

  test('a server error is shown in the action field', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a'); useGroupModeStore.getState().toggle('b');
    useGroupModeStore.getState().toNaming();
    useGroupModeStore.setState({ error: 'The software did not make the group. Do the procedure again.' });
    render(<GroupModeBar projectId="p1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('The software did not make the group. Do the procedure again.');
  });

  test('feedback: lines, "Make a group" again, Close', () => {
    useGroupModeStore.setState({ projectId: 'p1', feedback: { lines: ['You have 1 group. Make one more group.', 'Revenue is not a member of the group.'], offerAnother: true } });
    render(<GroupModeBar projectId="p1" />);
    expect(screen.getByText('You have 1 group. Make one more group.')).toBeInTheDocument();
    expect(screen.getByText('Revenue is not a member of the group.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Make a group' }));
    expect(useGroupModeStore.getState().active).toBe(true);
  });

  test('the mode or feedback of another project is not shown', () => {
    useGroupModeStore.setState({ projectId: 'p2', feedback: { lines: ['You have 1 group. Make one more group.'], offerAnother: true } });
    const { container } = render(<GroupModeBar projectId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('feedback "completed": no further offer; Close removes it', () => {
    useGroupModeStore.setState({ projectId: 'p1', feedback: { lines: ['You completed step 2.'], offerAnother: false } });
    render(<GroupModeBar projectId="p1" />);
    expect(screen.queryByRole('button', { name: 'Make a group' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useGroupModeStore.getState().feedback).toBeNull();
  });

  test('the bar is the "Group mode" group, not a second "Make a group"', () => {
    useGroupModeStore.getState().start('p1');
    render(<GroupModeBar projectId="p1" />);
    expect(screen.getByRole('group', { name: 'Group mode' })).toBeInTheDocument();
  });

  test('Esc while the command menu is open closes only the menu: the group mode stays', () => {
    useGroupModeStore.getState().start('p1');
    useUIStore.setState({ isCommandMenuOpen: true });
    render(<GroupModeBar projectId="p1" />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    useUIStore.setState({ isCommandMenuOpen: false });
    expect(useGroupModeStore.getState().active).toBe(true);
  });

  test('Esc in an input outside the bar is for that input: the group mode stays', () => {
    useGroupModeStore.getState().start('p1');
    render(<><input aria-label="Other field" /><GroupModeBar projectId="p1" /></>);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Other field' }), { key: 'Escape' });
    expect(useGroupModeStore.getState().active).toBe(true);
  });

  test('Esc inside a dialog outside the bar is for that dialog: the group mode stays', () => {
    useGroupModeStore.getState().start('p1');
    render(<><div role="dialog" aria-label="Other dialog"><button type="button">x</button></div><GroupModeBar projectId="p1" /></>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'x' }), { key: 'Escape' });
    expect(useGroupModeStore.getState().active).toBe(true);
  });

  test('Esc in the name field of the bar ends the group mode', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a'); useGroupModeStore.getState().toggle('b');
    useGroupModeStore.getState().toNaming();
    render(<GroupModeBar projectId="p1" />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name of the group' }), { key: 'Escape' });
    expect(useGroupModeStore.getState().active).toBe(false);
  });

  test('Esc while busy: no cancel, and the event goes on to the other handlers', () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a'); useGroupModeStore.getState().toggle('b');
    useGroupModeStore.getState().toNaming();
    useGroupModeStore.setState({ name: 'Sales', busy: true });
    render(<GroupModeBar projectId="p1" />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const stopped = vi.spyOn(event, 'stopPropagation');
    document.body.dispatchEvent(event);
    expect(useGroupModeStore.getState().active).toBe(true);
    expect(stopped).not.toHaveBeenCalled();
  });

  test('Esc that ends the group mode does not stop the event', () => {
    useGroupModeStore.getState().start('p1');
    render(<GroupModeBar projectId="p1" />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const stopped = vi.spyOn(event, 'stopPropagation');
    document.body.dispatchEvent(event);
    expect(useGroupModeStore.getState().active).toBe(false);
    expect(stopped).not.toHaveBeenCalled();
  });

  test('one live region keeps its place from the count to the feedback (screen readers)', () => {
    useGroupModeStore.getState().start('p1');
    const { container } = render(<GroupModeBar projectId="p1" />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    act(() => { useGroupModeStore.getState().toggle('a'); });
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live).toHaveTextContent('1 element selected.');
    act(() => { useGroupModeStore.setState({ active: false, selected: [], feedback: { lines: ['You have 1 group. Make one more group.'], offerAnother: true } }); });
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live).toHaveTextContent('You have 1 group. Make one more group.');
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  const busyNamed = () => {
    useGroupModeStore.getState().start('p1');
    useGroupModeStore.getState().toggle('a'); useGroupModeStore.getState().toggle('b');
    useGroupModeStore.getState().toNaming();
    useGroupModeStore.setState({ name: 'Sales', busy: true });
  };

  test('after the group is made the focus goes to "Make a group" of the feedback', () => {
    busyNamed();
    render(<GroupModeBar projectId="p1" />);
    act(() => { useGroupModeStore.setState({ active: false, busy: false, selected: [], name: '', feedback: { lines: ['You have 1 group. Make one more group.'], offerAnother: true } }); });
    expect(screen.getByRole('button', { name: 'Make a group' })).toHaveFocus();
  });

  test('after the group is made and step 2 is completed the focus goes to Close', () => {
    busyNamed();
    render(<GroupModeBar projectId="p1" />);
    act(() => { useGroupModeStore.setState({ active: false, busy: false, selected: [], name: '', feedback: { lines: ['You completed step 2.'], offerAnother: false } }); });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  test('feedback that was already there when the bar mounts does not take the focus', () => {
    useGroupModeStore.setState({ projectId: 'p1', feedback: { lines: ['You completed step 2.'], offerAnother: false } });
    render(<GroupModeBar projectId="p1" />);
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
  });
});
