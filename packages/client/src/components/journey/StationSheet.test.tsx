// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import StationSheet from './StationSheet';

describe('StationSheet placeholder (ADR-0005: empty states are mandatory)', () => {
  test('names the station, shows ADM badge, links to classic UI', () => {
    render(
      <MemoryRouter>
        <StationSheet station="govern" projectId="p1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Govern' })).toBeInTheDocument();
    expect(screen.getByText('Phase G')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /classic/i });
    expect(link).toHaveAttribute('href', '/project/p1/compliance/policies');
  });
});
