// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useArchitectureStore } from '../../stores/architectureStore';
import PropertyPanel from './PropertyPanel';

// PropertyPanel fetches on mount for some code paths (activity refetch,
// policy-details lookup) but both are gated behind `projectId` being set.
// We deliberately leave `projectId: null` in every test below so those
// effects short-circuit and this empty api mock is sufficient to reach an
// <aside> without throwing.
vi.mock('../../services/api', () => ({}));

// PropertyPanel imports `mapLegacySeverity` from the bare `@thearchitect/shared`
// barrel (dist/index.js), which resolves through the workspace's real build
// artifact. This worktree's environment currently has a stale outer dist
// missing that export (a pre-existing, out-of-scope issue — see the 10
// baseline tsc errors in PropertyPanel.tsx, e.g. TS2305 on the same import).
// Only the PolicyPropertyView root exercises it at runtime, so we stub just
// that one named export to reach the policy path; every deep `@thearchitect/
// shared/src/...` import PropertyPanel also uses stays real/unmocked.
vi.mock('@thearchitect/shared', () => ({
  mapLegacySeverity: (s: string) => s,
}));

const baseElement = {
  id: 'e1',
  type: 'business_capability',
  name: 'Test Capability',
  description: '',
  layer: 'business',
  togafDomain: 'business',
  maturityLevel: 1,
  riskLevel: 'low',
  status: 'current',
  position3D: { x: 0, y: 0, z: 0 },
  metadata: {},
};

const policyElement = {
  ...baseElement,
  id: 'policy-e2',
  name: 'Policy Node',
  metadata: { isPolicyNode: true, policyId: 'pol-1', severity: 'high', source: 'custom', category: 'compliance', version: 1 },
};

beforeEach(() => {
  useArchitectureStore.setState({
    projectId: null,
    elements: [],
    connections: [],
    selectedElementId: null,
  } as never);
});

describe('PropertyPanel fill prop', () => {
  test('classic (no prop) keeps fixed width w-72 (empty state)', () => {
    const { container } = render(<PropertyPanel />);
    expect(container.querySelector('aside')).toHaveClass('w-72');
  });

  test('fill renders w-full instead of w-72 (empty state)', () => {
    const { container } = render(<PropertyPanel fill />);
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveClass('w-full');
    expect(aside).not.toHaveClass('w-72');
  });

  test('fill renders w-full for a selected (non-policy) element — default root', () => {
    useArchitectureStore.setState({
      elements: [baseElement],
      selectedElementId: baseElement.id,
    } as never);
    const { container } = render(<PropertyPanel fill />);
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveClass('w-full');
    expect(aside).not.toHaveClass('w-72');
  });

  // Policy-node root (PolicyPropertyView, a sub-component of PropertyPanel).
  // Reached via the real PropertyPanel + a seeded policy element with
  // metadata.isPolicyNode, rather than a direct import, since PolicyPropertyView
  // is not exported — this proves the `fill` prop is actually threaded through
  // PropertyPanel -> PolicyPropertyView, not just plumbed to an unused param.
  test('fill renders w-full for a selected policy element — PolicyPropertyView root', () => {
    useArchitectureStore.setState({
      elements: [policyElement],
      selectedElementId: policyElement.id,
    } as never);
    const { container } = render(<PropertyPanel fill />);
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveClass('w-full');
    expect(aside).not.toHaveClass('w-72');
  });

  test('classic (no prop) keeps w-72 for a selected policy element', () => {
    useArchitectureStore.setState({
      elements: [policyElement],
      selectedElementId: policyElement.id,
    } as never);
    const { container } = render(<PropertyPanel />);
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveClass('w-72');
    expect(aside).not.toHaveClass('w-full');
  });
});
