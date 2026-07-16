// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
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
});
