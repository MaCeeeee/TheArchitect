// @vitest-environment jsdom
// packages/client/src/components/ui/ProjectCard.journey.test.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProjectCard from './ProjectCard';

const project = { _id: 'p1', name: 'Test project' };

describe('ProjectCard journey on-ramp (THE-494)', () => {
  test('renders a Journey button when onOpenJourney is provided; click does not bubble to onClick', () => {
    const onClick = vi.fn();
    const onOpenJourney = vi.fn();
    render(<ProjectCard project={project} onClick={onClick} onDelete={vi.fn()} onOpenJourney={onOpenJourney} />);
    const btn = screen.getByRole('button', { name: /journey/i });
    fireEvent.click(btn);
    expect(onOpenJourney).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled(); // stopPropagation — card open must not also fire
  });

  test('no Journey button without the prop (existing callers byte-compatible)', () => {
    render(<ProjectCard project={project} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /journey/i })).toBeNull();
  });
});
