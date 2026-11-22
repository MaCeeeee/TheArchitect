/**
 * UC-RING-001 — change folder check on the gold folder of THE-819 and its variants.
 * Run: cd packages/server && npx jest src/__tests__/changeRing.test.ts
 */
import { assessChangeRings } from '../services/topology/changeRing';
import {
  goldRing, legacyTypes, n1Sequenced, noStart, objectLevel, p1WriteWrite, p2WriteRead, ringOpen, RingModel, unknownLabel, unreadSolution,
} from './fixtures/changeRingGold';

const run = (m: RingModel) => assessChangeRings(m.elements, m.relationships);
const only = (m: RingModel) => {
  const r = run(m);
  expect(r.folders).toHaveLength(1);
  return r.folders[0];
};
const short = (f: ReturnType<typeof only>) =>
  f.findings.map((x) => [x.rule, x.first.name, x.second?.name ?? null, x.part?.name ?? null]);

describe('REQ-RING-001.1 (THE-821): folder, parts, steps, order and start come from the model', () => {
  test('AC-1: gold → 1 folder, 12 parts, 7 steps, start = ECR, 3 pairs without order', () => {
    const f = only(goldRing());
    expect(f.folder.name).toBe('Change folder');
    expect(f.parts).toBe(12);
    expect(f.steps).toHaveLength(7);
    expect(f.start?.name).toBe('Raise change (ECR)');
    expect(f.checked).toBe(true);
    expect(f.parallelPairs).toBe(3);
  });

  test('AC-2: the edge back into the start does not make every step reach every step', () => {
    // with the back edge counted as order there would be 0 pairs and the P1 conflict would be lost
    const f = only(p1WriteWrite());
    expect(f.parallelPairs).toBe(3);
    expect(short(f)).toEqual([['write_write', 'Review design', 'Review purchasing', 'Cost estimate']]);
  });

  test('AC-4: business_process counts as a step', () => {
    const f = only(legacyTypes());
    expect(f.steps).toHaveLength(7);
    expect(f.checked).toBe(true);
    expect(f.findings).toEqual([]);
  });

  test('elements and relationships that are not in the model are ignored', () => {
    const m = goldRing();
    const r = assessChangeRings(m.elements, [...m.relationships, { id: 'x', sourceId: 'S1', targetId: 'ghost', type: 'access', label: 'write' }]);
    expect(r.folders[0].findings).toEqual([]);
  });
});

describe('REQ-RING-001.2 (THE-822): Bernstein conditions per pair and part — and only these', () => {
  test('AC-1: gold → 0 findings', () => {
    expect(only(goldRing()).findings).toEqual([]);
  });

  test('AC-2: P1 → exactly the write/write finding', () => {
    expect(short(only(p1WriteWrite()))).toEqual([['write_write', 'Review design', 'Review purchasing', 'Cost estimate']]);
  });

  test('AC-3: P2 → exactly the write/read finding, writer first', () => {
    expect(short(only(p2WriteRead()))).toEqual([['write_read', 'Review design', 'Review production', 'Technical solution']]);
  });

  test('AC-4: N1 (sequenced) → 0 findings', () => {
    const f = only(n1Sequenced());
    expect(f.parallelPairs).toBe(2);
    expect(f.findings).toEqual([]);
  });

  test('AC-5: object level → 0 findings, 1 hint that the object has no parts', () => {
    const r = run(objectLevel());
    expect(r.folders).toEqual([]);
    expect(r.hints.map((h) => [h.kind, h.elementIds])).toEqual([['object_without_parts', ['M']]]);
    const rP1 = run(objectLevel(p1WriteWrite()));
    expect(rP1.folders).toEqual([]);
    expect(rP1.hints.map((h) => h.kind)).toEqual(['object_without_parts']);
  });

  test('AC-6: an unknown access type gives a hint, not a finding', () => {
    const f = only(unknownLabel());
    expect(f.findings).toEqual([]);
    expect(f.hints.map((h) => [h.kind, h.elementIds])).toEqual([['unknown_access', ['S3', 'vF']]]);
    expect(f.checked).toBe(true);
  });

  test('a readwrite access on both sides gives one finding per pair and part, not three', () => {
    const m = goldRing();
    const both = { ...m, relationships: [...m.relationships, { id: 'a1', sourceId: 'S1', targetId: 'bestell', type: 'access', label: 'read-write' }, { id: 'a2', sourceId: 'S3', targetId: 'bestell', type: 'access', label: 'reads/writes' }] };
    const f = only(both);
    const onOrder = f.findings.filter((x) => x.part?.name === 'Order status' && x.rule !== 'unread_write');
    // pairs in name order: design/production, design/purchasing, production/purchasing
    expect(onOrder.map((x) => [x.rule, x.first.name, x.second?.name])).toEqual([
      ['write_write', 'Review design', 'Review production'],
      ['write_read', 'Review design', 'Review purchasing'],
      ['write_read', 'Review production', 'Review purchasing'],
    ]);
    // nobody after design or production reads the order status: two unread_write as well
    expect(f.findings.filter((x) => x.rule === 'unread_write').map((x) => x.first.name)).toEqual(['Review design', 'Review production']);
  });
});
