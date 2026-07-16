// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useUIStore } from '../../stores/uiStore';
import Sheet from './Sheet';

beforeEach(() => {
  localStorage.clear();
  useUIStore.setState({ sheetWidth: 420, sheetDock: 'right' });
});

describe('Sheet container — shell', () => {
  test('renders children inside a panel at the store width', () => {
    render(<Sheet ariaLabel="Test sheet"><div data-testid="body">hi</div></Sheet>);
    expect(screen.getByTestId('body')).toBeInTheDocument();
    const region = screen.getByRole('complementary', { name: 'Test sheet' });
    expect(region).toHaveStyle({ width: '420px' });
  });

  test('dock toggle flips the docked side via the store', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    expect(useUIStore.getState().sheetDock).toBe('right');
    fireEvent.click(screen.getByRole('button', { name: /dock (left|right)/i }));
    expect(useUIStore.getState().sheetDock).toBe('left');
  });

  test('exposes a resize separator with correct ARIA', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('aria-valuenow', '420');
    expect(sep).toHaveAttribute('aria-valuemin', '300');
    expect(sep).toHaveAttribute('aria-valuemax', '640');
  });

  test('resize handle shows a visible grip affordance', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    expect(sep.querySelector('[data-sheet-grip]')).not.toBeNull();
  });
});

describe('Sheet container — resize', () => {
  test('pointer drag on the handle changes width and does not bubble to the canvas', () => {
    const onBubble = vi.fn();
    render(
      <div onPointerMove={onBubble} onPointerDown={onBubble}>
        <Sheet ariaLabel="Test sheet"><div /></Sheet>
      </div>,
    );
    const sep = screen.getByRole('separator');
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 900 }); // docked right: -100 delta → +100 width
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 900 });
    expect(useUIStore.getState().sheetWidth).toBe(520);
    expect(onBubble).not.toHaveBeenCalled();
  });

  test('drag clamps to MAX', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 0 });
    expect(useUIStore.getState().sheetWidth).toBe(640);
  });

  test('when docked left, dragging RIGHT widens', () => {
    useUIStore.setState({ sheetDock: 'left', sheetWidth: 420 });
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    fireEvent.pointerDown(sep, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 180 }); // +80
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 180 });
    expect(useUIStore.getState().sheetWidth).toBe(500);
  });

  test('keyboard: ArrowRight widens, ArrowLeft narrows', () => {
    render(<Sheet ariaLabel="Test sheet"><div /></Sheet>);
    const sep = screen.getByRole('separator');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(useUIStore.getState().sheetWidth).toBe(444); // +24 step
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(useUIStore.getState().sheetWidth).toBe(420);
  });
});
