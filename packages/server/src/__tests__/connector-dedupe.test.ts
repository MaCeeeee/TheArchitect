/**
 * THE-739 / REQ-THE739-2 — the cleanup plan deletes only repeated syncs of one item.
 */
import { planConnectorDedupe, type DedupeNode } from '../services/connector-dedupe';

const node = (id: string, createdAt: string, extra: Partial<DedupeNode> = {}): DedupeNode => ({
  id, projectId: 'p1', name: 'TheArchitect', type: 'application_component',
  source: 'github', connectorConfigId: 'TheArchitect', externalId: null, createdAt, certifiedBy: null, ...extra,
});
const legacy = (id: string, createdAt: string) => node(id, createdAt, { source: 'upload', connectorConfigId: null });

describe('planConnectorDedupe', () => {
  it('reproduces the 27-duplicates case: keeps the oldest tagged node, drops tagged + legacy rest', () => {
    const nodes = [
      legacy('gh-6f1ac259', '2026-06-22T19:22:06Z'),
      legacy('gh-440397e3', '2026-06-24T06:23:01Z'),
      ...Array.from({ length: 25 }, (_, i) => node(`gh-t${i}`, `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`)),
    ];
    const plan = planConnectorDedupe(nodes);

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].keep.id).toBe('gh-t0');
    expect(plan.groups[0].remove).toHaveLength(26);
    expect(plan.skipped).toHaveLength(0);
  });

  it('is a no-op once every group has one member (idempotent second run)', () => {
    expect(planConnectorDedupe([node('gh-a', '2026-07-01')]).groups).toHaveLength(0);
  });

  it('keeps a certified member over an older uncertified one', () => {
    const plan = planConnectorDedupe([node('old', '2026-06-01'), node('cert', '2026-07-01', { certifiedBy: 'n1' })]);
    expect(plan.groups[0].keep.id).toBe('cert');
  });

  it('never merges across projects, connector configs or types', () => {
    const plan = planConnectorDedupe([
      node('a', '2026-06-01'),
      node('b', '2026-06-02', { projectId: 'p2' }),
      node('c', '2026-06-03', { connectorConfigId: 'other' }),
      node('d', '2026-06-04', { type: 'artifact' }),
    ]);
    expect(plan.groups).toHaveLength(0);
  });

  it('skips groups whose members came from one batch or carry different externalIds', () => {
    const sameBatch = planConnectorDedupe([node('a', '2026-06-01T00:00:00Z'), node('b', '2026-06-01T00:00:00Z')]);
    expect(sameBatch.groups).toHaveLength(0);
    expect(sameBatch.skipped).toHaveLength(1);

    const distinct = planConnectorDedupe([
      node('a', '2026-06-01', { externalId: '1' }), node('b', '2026-06-02', { externalId: '2' }),
    ]);
    expect(distinct.groups).toHaveLength(0);
    expect(distinct.skipped).toHaveLength(1);
  });

  it('does not pull in untagged nodes with a shared id prefix (elem-) or another name', () => {
    const plan = planConnectorDedupe([
      node('gh-a', '2026-06-01'),
      node('gh-b', '2026-06-02'),
      legacy('elem-x', '2026-05-01'),
      { ...legacy('gh-other', '2026-05-01'), name: 'Other' },
    ]);
    expect(plan.groups[0].remove.map((n) => n.id)).toEqual(['gh-b']);
  });
});
