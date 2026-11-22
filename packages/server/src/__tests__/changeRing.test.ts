/**
 * UC-RING-001 — change folder check on the gold folder of THE-819 and its variants.
 * Run: cd packages/server && npx jest src/__tests__/changeRing.test.ts
 */
import { performance } from 'node:perf_hooks';
import { assessChangeRings } from '../services/topology/changeRing';
import {
  goldRing, legacyTypes, n1Sequenced, noStart, outsideIntake, secondEvent, secondFolder, twoUnknown, objectLevel, p1WriteWrite, p2WriteRead, ringOpen, RingModel, unknownLabel, unreadSolution,
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

  test('a second Business Event into a step → hint several_starts, not checked', () => {
    // sorted by name: "Decide change (ECO)" < "Raise change (ECR)" < "Review purchasing"
    for (const [target, ids] of [['S4', ['S4', 'S0']], ['S2', ['S0', 'S2']]] as const) {
      const f = only(secondEvent(target));
      expect(f.hints.map((h) => h.kind)).toEqual(['several_starts']);
      expect(f.hints[0].elementIds).toEqual(ids);
      expect(f.checked).toBe(false);
      expect(f.findings).toEqual([]);
      expect(f.parallelPairs).toBe(0);
      expect(f.start).toBeNull();
    }
  });

  test('a forward edge from an outside process into the start stays order', () => {
    const f = only(outsideIntake());
    expect(f.parallelPairs).toBe(3);
    expect(f.findings).toEqual([]);
    expect(f.start?.name).toBe('Raise change (ECR)');
    expect(f.checked).toBe(true);
  });

  test('order is computed per folder: a folder without its own Business Event gets no_start', () => {
    const r = run(secondFolder());
    expect(r.folders).toHaveLength(2);
    const m = r.folders.find((x) => x.folder.id === 'M')!;
    const m2 = r.folders.find((x) => x.folder.id === 'M2')!;
    expect(m.parallelPairs).toBe(3);
    expect(m.findings).toEqual([]);
    expect(m2.hints.map((h) => h.kind)).toEqual(['no_start']);
    expect(m2.checked).toBe(false);
  });

  test('unknown_access hints come in a deterministic order', () => {
    const m = twoUnknown();
    const rev = { elements: [...m.elements].reverse(), relationships: [...m.relationships].reverse() };
    // by step name: "Review production" < "Review purchasing"
    const ids = (x: RingModel) => only(x).hints.map((h) => h.elementIds);
    expect(ids(m)).toEqual([['S3', 'vF'], ['S2', 'vE']]);
    expect(ids(rev)).toEqual(ids(m));
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
describe('REQ-RING-001.3 (THE-823): ring and unread parts', () => {
  test('AC-1: gold → no ring_open, no unread_write', () => {
    expect(only(goldRing()).findings.filter((x) => x.rule === 'ring_open' || x.rule === 'unread_write')).toEqual([]);
  });

  test('AC-2: without the edge back → exactly 1 ring_open at the start', () => {
    expect(short(only(ringOpen()))).toEqual([['ring_open', 'Raise change (ECR)', null, null]]);
  });

  test('AC-3: nobody reads the technical solution → exactly 1 unread_write', () => {
    expect(short(only(unreadSolution()))).toEqual([['unread_write', 'Review design', null, 'Technical solution']]);
  });

  test('the strict rule "the release reads all" is not checked (6 false findings in THE-819)', () => {
    // the votes are read by the decision, not by the release: no finding
    expect(only(goldRing()).findings).toEqual([]);
  });
});

describe('REQ-RING-001.4 (THE-824): hints name the next step', () => {
  test('AC-1: empty model → only the hint no_folder', () => {
    const r = assessChangeRings([], []);
    expect(r.folders).toEqual([]);
    expect(r.hints.map((h) => h.kind)).toEqual(['no_folder']);
  });

  test('AC-2: one unknown label → exactly 1 hint naming step and part', () => {
    const f = only(unknownLabel());
    expect(f.hints).toHaveLength(1);
    expect(f.hints[0].text).toContain('"Review production"');
    expect(f.hints[0].text).toContain('"Vote production"');
  });

  test('AC-3: no Business Event → hint no_start, not checked, no pair findings from a guessed order', () => {
    const f = only(noStart());
    expect(f.hints.map((h) => h.kind)).toEqual(['no_start']);
    expect(f.checked).toBe(false);
    expect(f.findings).toEqual([]);
    expect(f.parallelPairs).toBe(0);
  });

  test('a step without any order relationship → hint no_order, not checked', () => {
    const m = goldRing();
    const loose = { ...m, elements: [...m.elements, { id: 'S9', name: 'Ask legal', type: 'process' }], relationships: [...m.relationships, { id: 'a9', sourceId: 'S9', targetId: 'antrag', type: 'access', label: 'read' }] };
    const f = only(loose);
    expect(f.hints.map((h) => [h.kind, h.elementIds])).toEqual([['no_order', ['S9']]]);
    expect(f.checked).toBe(false);
  });

  test('a folder with one step → hint too_few_steps', () => {
    const m = goldRing();
    const one = { ...m, relationships: m.relationships.filter((r) => r.type !== 'access' || r.sourceId === 'S0') };
    expect(only(one).hints.map((h) => h.kind)).toEqual(['too_few_steps']);
  });

  test('the report names its method', () => {
    expect(run(goldRing()).method.id).toBe('PA-umlauf');
  });
});

describe('limits: the check stays fast on large models', () => {
  const timed = (m: RingModel) => {
    const t0 = performance.now();
    const report = assessChangeRings(m.elements, m.relationships);
    return { report, ms: performance.now() - t0 };
  };
  const rel = (type: string, sourceId: string, targetId: string, label?: string) => ({ id: `${type}:${sourceId}->${targetId}`, sourceId, targetId, type, ...(label === undefined ? {} : { label }) });

  test('200,001 business objects, 2,000 processes, 20,000 access relationships, no composition: under 1,500 ms', () => {
    const elements = [
      ...Array.from({ length: 200001 }, (_, i) => ({ id: `o${i}`, name: `Object ${i}`, type: 'business_object' })),
      ...Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, name: `Process ${i}`, type: 'process' })),
    ];
    const relationships = Array.from({ length: 20000 }, (_, i) => rel('access', `p${i % 2000}`, `o${(i * 7) % 200001}`, i % 2 === 0 ? 'writes' : 'reads'));
    const { report, ms } = timed({ elements, relationships });
    console.log(`limit (a): ${ms.toFixed(0)} ms`);
    expect(report.folders).toEqual([]);
    expect(ms).toBeLessThan(1500);
  });

  test('one folder, 1,000 parts, 1,000 parallel review steps: under 1,500 ms and 0 findings', () => {
    const n = 1000;
    const elements = [
      { id: 'E', name: 'Event', type: 'business_event' },
      { id: 'S', name: 'Start', type: 'process' },
      { id: 'M', name: 'Folder', type: 'business_object' },
      ...Array.from({ length: n }, (_, i) => ({ id: `q${i}`, name: `Part ${i}`, type: 'business_object' })),
      ...Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Review ${i}`, type: 'process' })),
    ];
    const relationships = [
      rel('triggering', 'E', 'S'),
      rel('access', 'S', 'q0', 'write'),
      rel('flow', 'r0', 'S'),
      ...Array.from({ length: n }, (_, i) => rel('composition', 'M', `q${i}`)),
      ...Array.from({ length: n }, (_, i) => rel('triggering', 'S', `r${i}`)),
      // review i writes part i + 1 (part 0 is written by the start only); the last review writes nothing
      ...Array.from({ length: n - 1 }, (_, i) => rel('access', `r${i}`, `q${i + 1}`, 'write')),
      ...Array.from({ length: n }, (_, i) => rel('access', `r${i}`, 'q0', 'read')),
    ];
    const { report, ms } = timed({ elements, relationships });
    console.log(`limit (b): ${ms.toFixed(0)} ms`);
    expect(report.folders[0].checked).toBe(true);
    expect(report.folders[0].findings).toEqual([]);
    expect(ms).toBeLessThan(1500);
  });
});
