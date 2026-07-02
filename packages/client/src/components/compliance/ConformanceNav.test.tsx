// @vitest-environment jsdom
/**
 * THE-388 (ADR-0003) — Conformance IA tests.
 * AC-1 (subject split), AC-2 (hub), AC-3 (no dead entries), AC-6 (EN labels),
 * AC-7 (nav structure + hub render).
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ComplianceSidebar, { SECTIONS, GROUPS, SUBJECTS } from './ComplianceSidebar';
import ConformanceHub, { GATE_CARDS } from './ConformanceHub';

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ showPolicyBoard: false, togglePolicyBoard: () => undefined }),
}));

// All section ids that existed before the IA refactor — none may disappear (AC-3).
const LEGACY_IDS = [
  'pipeline', 'portfolio', 'standards', 'matrix', 'remediate', 'policies', 'roadmap',
  'elements', 'progress', 'audit',
  'compliance-dashboard', 'approvals', 'policy-mgr', 'audit-trail',
  'assess', 'certify',
];

describe('Conformance nav structure (AC-1/AC-3)', () => {
  test('every legacy section id survives the IA refactor', () => {
    const ids = SECTIONS.map((s) => s.id);
    for (const id of LEGACY_IDS) expect(ids).toContain(id);
  });

  test('every section belongs to a defined gate, every gate to a defined subject', () => {
    const groupKeys = new Set(GROUPS.map((g) => g.key));
    const subjectKeys = new Set(SUBJECTS.map((s) => s.key));
    for (const s of SECTIONS) expect(groupKeys.has(s.group)).toBe(true);
    for (const g of GROUPS) expect(subjectKeys.has(g.subject)).toBe(true);
  });

  test('subject split per ADR-0003: cover+enforce → architecture, attest → workflow', () => {
    const byKey = Object.fromEntries(GROUPS.map((g) => [g.key, g.subject]));
    expect(byKey.cover).toBe('architecture');
    expect(byKey.enforce).toBe('architecture');
    expect(byKey.attest).toBe('workflow');
  });

  test('ATTEST gate holds the imported-artifact views (assess + certify)', () => {
    const attestIds = SECTIONS.filter((s) => s.group === 'attest').map((s) => s.id);
    expect(attestIds).toEqual(['assess', 'certify']);
  });
});

describe('ComplianceSidebar render (AC-1/AC-6)', () => {
  const renderSidebar = () =>
    render(
      <MemoryRouter initialEntries={['/project/p1/compliance/hub']}>
        <Routes>
          <Route path="/project/:projectId/compliance/:section" element={<ComplianceSidebar />} />
        </Routes>
      </MemoryRouter>,
    );

  test('shows both subject headers with explicit subject hints', () => {
    renderSidebar();
    expect(screen.getByText('Architecture Conformance')).toBeInTheDocument();
    expect(screen.getByText('Workflow Conformance')).toBeInTheDocument();
    expect(screen.getByText('Subject: your model')).toBeInTheDocument();
    expect(screen.getByText('Subject: imported workflows')).toBeInTheDocument();
  });

  test('gate verbs appear as badges, speaking names as group labels', () => {
    renderSidebar();
    for (const g of GROUPS) {
      expect(screen.getByText(g.label)).toBeInTheDocument();
      expect(screen.getByText(g.verb)).toBeInTheDocument();
    }
  });

  test('hub entry is present', () => {
    renderSidebar();
    expect(screen.getByText('Conformance Hub')).toBeInTheDocument();
  });
});

describe('ConformanceHub (AC-2/AC-5)', () => {
  const renderHub = () =>
    render(
      <MemoryRouter initialEntries={['/project/p1/compliance/hub']}>
        <Routes>
          <Route path="/project/:projectId/compliance/:section" element={<ConformanceHub />} />
        </Routes>
      </MemoryRouter>,
    );

  test('renders one card per gate with plain-language question', () => {
    renderHub();
    expect(GATE_CARDS).toHaveLength(3);
    for (const card of GATE_CARDS) {
      expect(screen.getByTestId(`gate-card-${card.verb.toLowerCase()}`)).toBeInTheDocument();
      expect(screen.getByText(card.question)).toBeInTheDocument();
    }
  });

  test('every card states subject and norm explicitly', () => {
    renderHub();
    const subjectLabels = screen.getAllByText('Subject:');
    const normLabels = screen.getAllByText('Norm:');
    expect(subjectLabels).toHaveLength(3);
    expect(normLabels).toHaveLength(3);
  });

  test('cards target existing sections (no dead routes)', () => {
    const ids = new Set(SECTIONS.map((s) => s.id));
    for (const card of GATE_CARDS) expect(ids.has(card.target)).toBe(true);
  });
});
