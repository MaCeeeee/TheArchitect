// @vitest-environment jsdom
/**
 * UC-METH-002 (REQ .2/.4) — the bottom action field: phase tone as before, ladder tone with the panel headline.
 * Run: cd packages/client && npx vitest run src/design-system/patterns/NextStepBanner.test.tsx
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import NextStepBanner from './NextStepBanner';

describe('NextStepBanner', () => {
  test('without a label: as before, one message and one action', () => {
    const onAction = vi.fn();
    render(<NextStepBanner message="Phase 2: Model" actionLabel="Add Connections" onAction={onAction} />);
    expect(screen.queryByRole('button', { name: /Model check/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add Connections/ }));
    expect(onAction).toHaveBeenCalled();
  });

  test('ladder tone: the panel headline as a button, the next step, the action', () => {
    const onLabel = vi.fn();
    const onAction = vi.fn();
    render(
      <NextStepBanner tone="ladder" label="Model check: step 1 of 5" onLabel={onLabel}
        message="Next step: Make a minimum of two groups." actionLabel="Make a group" onAction={onAction} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Model check: step 1 of 5' }));
    expect(onLabel).toHaveBeenCalled();
    expect(screen.getByText('Next step: Make a minimum of two groups.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Make a group/ }));
    expect(onAction).toHaveBeenCalled();
  });

  test('a label without a handler is plain text', () => {
    render(<NextStepBanner tone="ladder" label="Model check: step 1 of 5" message="m" actionLabel="a" onAction={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Model check: step 1 of 5' })).not.toBeInTheDocument();
    expect(screen.getByText('Model check: step 1 of 5')).toBeInTheDocument();
  });
});
