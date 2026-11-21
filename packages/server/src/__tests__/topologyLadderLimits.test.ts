/**
 * UC-METH-001 — the ladder stays fast on large models: faces come from triangles of
 * translations, counts are bounded, and every limit that applies is named in the report.
 * Run: cd packages/server && npx jest src/__tests__/topologyLadderLimits.test.ts
 */
import { performance } from 'node:perf_hooks';
import { factorToAdditive, reals } from '../services/topology/abelianGroup';
import { buildComplex, Edge, Face, OrientedStep } from '../services/topology/cellComplex';
import { buildContextStructure, ModelElement, ModelRelationship, QuantityComplex } from '../services/topology/contextComplex';
import { classifyOneCochain } from '../services/topology/h1';
import { graphBetti } from '../services/topology/homology';
import { assessLadder, cohomologyOf, LadderInput, loopLabels } from '../services/topology/ladder';
import {
  MAX_CHECKED_TRIPLE_CANDIDATES,
  MAX_COMPARED_MEMBERS,
  MAX_CONTEXTS,
  MAX_COUNTED_TRIPLE_OVERLAPS,
  MAX_FACES_PER_QUANTITY,
  MAX_REPORTED_DEFECTS_PER_QUANTITY,
  MAX_TRANSLATIONS_PER_QUANTITY,
  MAX_TRANSLATIONS_PER_REPORT,
} from '../services/topology/limits';

const NOW = new Date('2026-11-20T12:00:00Z');
const pad = (i: number) => String(i).padStart(4, '0');
const ctx = (i: number): ModelElement => ({ id: `c${pad(i)}`, name: `Context ${i}`, type: 'grouping' });
const obj = (id: string): ModelElement => ({ id, name: id, type: 'business_object' });
const has = (context: number, member: string): ModelRelationship =>
  ({ id: `c${pad(context)}∋${member}`, sourceId: `c${pad(context)}`, targetId: member, type: 'aggregation' });
const tr = (from: number, to: number, quantity?: string, copy = 0, factor = 1): ModelRelationship => ({
  id: `t${pad(from)}>${pad(to)}#${copy}${quantity ?? ''}`,
  sourceId: `c${pad(from)}`,
  targetId: `c${pad(to)}`,
  type: 'association',
  translationFactor: factor,
  translationQuantity: quantity,
});

type Model = { elements: ModelElement[]; relationships: ModelRelationship[] };

/** n contexts that all aggregate the same members. */
function sharing(contexts: number, members = 1): Model {
  const memberIds = Array.from({ length: members }, (_, m) => `m${pad(m)}`);
  const elements = [...Array.from({ length: contexts }, (_, i) => ctx(i)), ...memberIds.map(obj)];
  const relationships: ModelRelationship[] = [];
  for (let i = 0; i < contexts; i++) for (const m of memberIds) relationships.push(has(i, m));
  return { elements, relationships };
}

/** Every pair among contexts first … first+size−1 gets one translation: size·(size−1)/2 translations, C(size, 3) triangles. */
function mesh(size: number, first = 0, quantity?: string): ModelRelationship[] {
  const out: ModelRelationship[] = [];
  for (let a = first; a < first + size; a++) for (let b = a + 1; b < first + size; b++) out.push(tr(a, b, quantity));
  return out;
}

/** A hub joined to `spokes` contexts that also form a path: 2·spokes − 1 translations, spokes − 1 triangles. */
function fan(hub: number, spokes: number, quantity?: string): ModelRelationship[] {
  const out: ModelRelationship[] = [];
  for (let i = 1; i <= spokes; i++) out.push(tr(hub, hub + i, quantity));
  for (let i = 1; i < spokes; i++) out.push(tr(hub + i, hub + i + 1, quantity));
  return out;
}

/** mulberry32 — a small seeded generator that stays inside 32-bit integers, so a failure can be reproduced. */
function seeded(seed: number): (n: number) => number {
  let state = seed >>> 0;
  return (n) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
}

const input = (p: Partial<LadderInput>): LadderInput => ({ elements: [], relationships: [], fieldCounts: {}, ...p });

function timed(model: Model): { report: ReturnType<typeof assessLadder>; ms: number } {
  const start = performance.now();
  const report = assessLadder('p', input(model), NOW);
  return { report, ms: performance.now() - start };
}
const withTranslations = (model: Model, translations: ModelRelationship[]): Model =>
  ({ elements: model.elements, relationships: [...model.relationships, ...translations] });
const statuses = (r: ReturnType<typeof assessLadder>) => r.rungs.map((rung) => rung.status);
const fact = (r: ReturnType<typeof assessLadder>, rung: number, label: string) =>
  r.rungs[rung].facts.find((f) => f.label === label)?.value;

/** What the report says about quantities it does not check; `named` lists them with their reason. */
const notChecked = (count: string, named: string) =>
  `The check does not include ${count}. The limits for each quantity are 500 conversion factors and 500 sets of three conversion factors. The limit for all quantities together is 1,000 conversion factors. ${named}.`;

test('the texts below quote the limits as they are', () => {
  expect([MAX_CONTEXTS, MAX_COUNTED_TRIPLE_OVERLAPS, MAX_CHECKED_TRIPLE_CANDIDATES]).toEqual([200, 10_000, 1_000_000]);
  expect([MAX_TRANSLATIONS_PER_QUANTITY, MAX_FACES_PER_QUANTITY, MAX_TRANSLATIONS_PER_REPORT]).toEqual([500, 500, 1000]);
});

describe('faces come from the triangles of translations — the same as testing every triple of contexts', () => {
  /**
   * The construction as it was before: every triple of contexts is tested for a common member,
   * then every triple overlap for translations on its three sides. Cubic in the number of
   * contexts — kept here only as the reference the bounded construction must agree with.
   */
  function referenceStructure(elements: ModelElement[], relationships: ModelRelationship[]) {
    const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const isMembership = (type: string) => type === 'composition' || type === 'aggregation';
    const contexts = elements.filter((e) => e.type === 'grouping' || e.type === 'location').sort((a, b) => byText(a.id, b.id));
    const contextIds = new Set(contexts.map((c) => c.id));
    const elementIds = new Set(elements.map((e) => e.id));
    const members = new Map<string, Set<string>>();
    for (const rel of relationships) {
      if (!isMembership(rel.type)) continue;
      if (!contextIds.has(rel.sourceId) || !elementIds.has(rel.targetId) || rel.sourceId === rel.targetId) continue;
      members.set(rel.sourceId, (members.get(rel.sourceId) ?? new Set<string>()).add(rel.targetId));
    }

    const ids = contexts.map((c) => c.id);
    const overlappingPairs: Array<[string, string]> = [];
    const tripleOverlaps: Array<[string, string, string]> = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = members.get(ids[i]);
        const b = members.get(ids[j]);
        if (!a || !b || ![...a].some((m) => b.has(m))) continue;
        overlappingPairs.push([ids[i], ids[j]]);
        for (let k = j + 1; k < ids.length; k++) {
          const c = members.get(ids[k]);
          if (c && [...a].some((m) => b.has(m) && c.has(m))) tripleOverlaps.push([ids[i], ids[j], ids[k]]);
        }
      }
    }

    const hasMembers = (id: string) => (members.get(id)?.size ?? 0) > 0;
    const translations = [...relationships]
      .sort((a, b) => byText(a.id, b.id))
      .filter((rel) => rel.translationFactor !== undefined && rel.translationFactor !== null)
      .filter(
        (rel) =>
          contextIds.has(rel.sourceId) && contextIds.has(rel.targetId) && hasMembers(rel.sourceId) && hasMembers(rel.targetId) &&
          !isMembership(rel.type) && rel.sourceId !== rel.targetId &&
          Number.isFinite(rel.translationFactor) && rel.translationFactor! >= 1e-12 && rel.translationFactor! <= 1e12,
      );
    const byQuantity = new Map<string, ModelRelationship[]>();
    for (const t of translations) {
      const quantity = t.translationQuantity?.trim().toLowerCase() || 'default';
      byQuantity.set(quantity, [...(byQuantity.get(quantity) ?? []), t]);
    }

    const stepsBetween = (edges: Edge[], from: string, to: string) =>
      edges
        .filter((e) => (e.source === from && e.target === to) || (e.source === to && e.target === from))
        .map((e): OrientedStep => ({ edgeId: e.id, sign: e.source === from ? 1 : -1 }));
    const quantities: QuantityComplex[] = [...byQuantity.entries()]
      .sort(([a], [b]) => byText(a, b))
      .map(([quantity, rels]) => {
        const edges: Edge[] = rels.map((r) => ({ id: r.id, source: r.sourceId, target: r.targetId }));
        const vertices = ids.filter((id) => edges.some((e) => e.source === id || e.target === id));
        const faces: Face[] = [];
        for (const [a, b, c] of tripleOverlaps) {
          for (const ab of stepsBetween(edges, a, b)) {
            for (const bc of stepsBetween(edges, b, c)) {
              for (const ca of stepsBetween(edges, c, a)) {
                faces.push({ id: `${ab.edgeId}+${bc.edgeId}+${ca.edgeId}`, boundary: [ab, bc, ca] });
              }
            }
          }
        }
        return { quantity, complex: buildComplex(vertices, edges, faces), cochain: new Map(rels.map((r) => [r.id, factorToAdditive(r.translationFactor!)])) };
      });

    return { contexts, translations, overlappingPairs, tripleOverlaps, quantities, contextsWithMembers: ids.filter(hasMembers).length };
  }

  /** 3–6 contexts, a few shared and own members, translations of two quantities with repeats in both directions. */
  function randomModel(next: (n: number) => number): Model {
    const n = 3 + next(4);
    const ids = Array.from({ length: n }, (_, i) => `k${10 + next(90)}x${i}`);
    const elements: ModelElement[] = ids.map((id, i) => ({ id, name: `Context ${i}`, type: next(4) === 0 ? 'location' : 'grouping' }));
    const relationships: ModelRelationship[] = [];
    const join = (context: string, member: string) =>
      relationships.push({ id: `h${next(1000)}-${context}-${member}`, sourceId: context, targetId: member, type: next(2) === 0 ? 'composition' : 'aggregation' });
    for (let s = 0; s < 1 + next(4); s++) {
      elements.push(obj(`shared${s}`));
      for (const id of ids) if (next(4) < 3) join(id, `shared${s}`);
    }
    ids.forEach((id, i) => {
      if (next(2) === 0) {
        elements.push(obj(`own${i}`));
        join(id, `own${i}`);
      }
    });
    const factors = [0.5, 1, 1, 1, 2, 4];
    for (let e = 0; e < n + 2 + next(2 * n + 2); e++) {
      const from = ids[next(n)];
      const to = ids[next(n)];
      if (from === to) continue;
      relationships.push({
        id: `e${next(1000)}-${e}`,
        sourceId: from,
        targetId: to,
        type: 'association',
        translationFactor: factors[next(factors.length)],
        translationQuantity: next(10) < 8 ? undefined : 'pieces',
      });
    }
    for (let i = relationships.length - 1; i > 0; i--) {
      const j = next(i + 1);
      [relationships[i], relationships[j]] = [relationships[j], relationships[i]];
    }
    return { elements, relationships };
  }

  test('property: 400 random models — overlaps, complexes and the cohomology report equal the reference', () => {
    const next = seeded(20261120);
    const seen = { faces: 0, withFaces: 0, severalPerTriple: 0, classified: 0, notATripleOverlap: 0 };
    for (let model = 0; model < 400; model++) {
      const { elements, relationships } = randomModel(next);
      const reference = referenceStructure(elements, relationships);
      const structure = buildContextStructure(elements, relationships);

      expect(structure.overlappingPairs).toEqual(reference.overlappingPairs);
      expect(structure.tripleOverlaps).toEqual(reference.tripleOverlaps);
      expect(structure.tripleOverlapsCapped).toBe(false);
      expect(structure.skippedQuantities).toEqual([]);
      expect(structure.quantities.map((q) => q.complex.faces)).toEqual(reference.quantities.map((q) => q.complex.faces));
      expect(structure.quantities).toEqual(reference.quantities);

      const testable = reference.quantities.filter((q) => graphBetti(q.complex).b1 + q.complex.faces.length > 0);
      const reached = reference.contextsWithMembers >= 2 && testable.length > 0;
      const report = assessLadder('p', input({ elements, relationships }), NOW);
      expect(report.highestRung === 5).toBe(reached);
      expect(report.cohomology).toEqual(reached ? testable.map((q) => cohomologyOf(q, loopLabels(reference))) : []);

      const faces = reference.quantities.flatMap((q) => q.complex.faces);
      const sides = (face: Face) => face.boundary.map((step) => reference.translations.find((t) => t.id === step.edgeId)!);
      const corners = new Set(faces.map((face) => [...new Set(sides(face).flatMap((t) => [t.sourceId, t.targetId]))].sort().join()));
      seen.faces += faces.length;
      if (faces.length > 0) seen.withFaces++;
      if (faces.length > corners.size) seen.severalPerTriple++;
      if (reached) seen.classified++;
      // a triangle of translations whose contexts share no member: must not become a face
      const triangles = reference.quantities.reduce((sum, q) => {
        const joined = (a: string, b: string) => q.complex.edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
        const v = q.complex.vertices;
        let count = 0;
        for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) for (let k = j + 1; k < v.length; k++) {
          if (joined(v[i], v[j]) && joined(v[j], v[k]) && joined(v[i], v[k])) count++;
        }
        return sum + count;
      }, 0);
      if (triangles > corners.size) seen.notATripleOverlap++;
    }
    // the generator must actually reach the cases the comparison is about
    expect(seen.withFaces).toBeGreaterThan(100);
    expect(seen.severalPerTriple).toBeGreaterThan(30);
    expect(seen.notATripleOverlap).toBeGreaterThan(30);
    expect(seen.classified).toBeGreaterThan(200);
    expect(seen.faces).toBeGreaterThan(400);
  });

  // The models above have at most 6 contexts, so there a position in the sorted contexts is one
  // digit. From 13 contexts on, two different sets of contexts can read the same when their
  // positions are written one after the other: 0, 1, 2 and 0, 12.
  test('13 contexts: the sets at positions 0, 1, 2 and 0, 12 are two sets, each with its own overlaps', () => {
    const model = sharing(13, 0);
    model.elements.push(obj('first'), obj('second'));
    for (const context of [0, 1, 2]) model.relationships.push(has(context, 'first'));
    for (const context of [0, 12]) model.relationships.push(has(context, 'second'));
    const structure = buildContextStructure(model.elements, model.relationships);
    expect(structure.overlappingPairs).toEqual([['c0000', 'c0001'], ['c0000', 'c0002'], ['c0000', 'c0012'], ['c0001', 'c0002']]);
    expect(structure.tripleOverlaps).toEqual([['c0000', 'c0001', 'c0002']]);
    const reference = referenceStructure(model.elements, model.relationships);
    expect(structure.overlappingPairs).toEqual(reference.overlappingPairs);
    expect(structure.tripleOverlaps).toEqual(reference.tripleOverlaps);
  });
});

describe('assessLadder — a wide model without any context', () => {
  test('one element serving 200,000 others: rung 1 is answered in linear time', () => {
    const leaves = Array.from({ length: 200_000 }, (_, i) => `leaf${i}`);
    const { report, ms } = timed({
      elements: [obj('hub'), ...leaves.map(obj)],
      relationships: leaves.map((leaf): ModelRelationship => ({ id: `hub>${leaf}`, sourceId: 'hub', targetId: leaf, type: 'serving' })),
    });
    expect(ms).toBeLessThan(1500);
    expect(report.rungs[1].facts.slice(0, 3)).toEqual([
      { label: 'relationships', value: 200_000 },
      { label: 'parts of the model', value: 1 },
      { label: 'closed paths between elements', value: 0 },
    ]);
  });
});

describe('assessLadder — more contexts than the cover is analysed for', () => {
  test('700 contexts aggregating one element: answered within a second, rung 2 open and the limit named', () => {
    const { report, ms } = timed(sharing(700));
    expect(ms).toBeLessThan(1000);
    expect(statuses(report)).toEqual(['reached', 'reached', 'open', 'locked', 'locked', 'locked']);
    expect(report.highestRung).toBe(1);
    expect(report.cohomology).toEqual([]);
    expect(report.rungs[0].facts[0]).toEqual({ label: 'elements', value: 701 });
    expect(report.rungs[1].facts[0]).toEqual({ label: 'relationships', value: 700 });
    expect(report.rungs[2].facts).toEqual([{ label: 'groups', value: 700 }]);
    expect(report.rungs[2].next).toBe(
      'The model has 700 groups. The check uses a maximum of 200 groups. Remove Grouping elements or Location elements until the model has a maximum of 200 groups.',
    );
  });

  test('300 contexts sharing one member: answered within a second, not analysed', () => {
    const { report, ms } = timed(sharing(300));
    expect(ms).toBeLessThan(1000);
    expect(report.highestRung).toBe(1);
    expect(report.rungs[2].next).toContain('The model has 300 groups');
  });

  test('above the limit translations are not looked at either', () => {
    const model = sharing(MAX_CONTEXTS + 1);
    const { report } = timed(withTranslations(model, mesh(3)));
    expect(statuses(report)).toEqual(['reached', 'reached', 'open', 'locked', 'locked', 'locked']);
    expect(report.cohomology).toEqual([]);
    expect(report.rungs[4].warnings).toEqual([]);
  });

  test('exactly at the limit the cover is analysed', () => {
    const { report, ms } = timed(sharing(MAX_CONTEXTS));
    expect(ms).toBeLessThan(1000);
    expect(report.highestRung).toBe(2);
    expect(fact(report, 2, 'groups with members')).toBe(MAX_CONTEXTS);
    expect(fact(report, 2, 'pairs of groups with the same member')).toBe((MAX_CONTEXTS * (MAX_CONTEXTS - 1)) / 2);
  });
});

describe('assessLadder — triple overlaps are counted with bounded work', () => {
  const aMinimumOf = (count: string) =>
    `The model has a minimum of ${count} sets of three groups with the same member. The software stopped at this number.`;

  test('below the limit the count is exact and nothing is said about a limit', () => {
    const { report } = timed(sharing(40)); // C(40, 3) = 9,880
    expect(fact(report, 2, 'sets of three groups with the same member')).toBe(9880);
    expect(report.rungs[2].warnings).toEqual([]);
  });

  test('at the limit the count stops and the report says "a minimum of"', () => {
    const { report } = timed(sharing(60)); // C(60, 3) = 34,220
    expect(fact(report, 2, 'sets of three groups with the same member')).toBe(MAX_COUNTED_TRIPLE_OVERLAPS);
    expect(report.rungs[2].status).toBe('reached');
    expect(report.rungs[2].warnings).toEqual([aMinimumOf('10,000')]);
  });

  test('a triple shared through many members is one triple, and many members cost no extra time', () => {
    const { report, ms } = timed(sharing(30, 400)); // C(30, 3) = 4,060 — the same for every member
    expect(ms).toBeLessThan(1000);
    expect(fact(report, 2, 'sets of three groups with the same member')).toBe(4060);
    expect(report.rungs[2].warnings).toEqual([]);
  });

  test('members with many different sets of contexts: counting stops after the candidates it may look at', () => {
    // 1,500 members, each in its own choice of 20 of 38 contexts: 1,140 candidates per member, at most C(38, 3) = 8,436 triples
    const next = seeded(7);
    const model = sharing(38, 0);
    for (let m = 0; m < 1500; m++) {
      model.elements.push(obj(`w${pad(m)}`));
      const chosen = new Set<number>();
      while (chosen.size < 20) chosen.add(next(38));
      for (const c of chosen) model.relationships.push(has(c, `w${pad(m)}`));
    }
    const { report, ms } = timed(model);
    expect(ms).toBeLessThan(1000);
    const counted = fact(report, 2, 'sets of three groups with the same member')!;
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeLessThanOrEqual(8436);
    expect(report.rungs[2].warnings).toEqual([aMinimumOf(counted.toLocaleString('en-US'))]);
  });
});

describe('assessLadder — a quantity above the limits is skipped and named', () => {
  test('a full mesh of 32 contexts sharing one member: within a second, the quantity is reported as skipped', () => {
    const { report, ms } = timed(withTranslations(sharing(32), mesh(32))); // 496 translations, 4,960 faces
    expect(ms).toBeLessThan(1000);
    expect(report.cohomology).toEqual([]);
    expect(statuses(report)).toEqual(['reached', 'reached', 'reached', 'reached', 'open', 'locked']);
    expect(report.rungs[3].facts.slice(0, 2)).toEqual([
      { label: 'conversion factors', value: 496 },
      { label: 'quantities', value: 1 },
    ]);
    expect(report.rungs[4].warnings).toEqual([notChecked('1 quantity', 'This quantity is "default" (more than 500 sets of three conversion factors)')]);
    expect(report.rungs[4].next).toBe(
      'Decrease the number of conversion factors in the model. Or add conversion factors of a different quantity until two different paths connect the same two groups.',
    );
  });

  test('more translations than the limit: that quantity is skipped, the others are still classified', () => {
    const bulk = Array.from({ length: MAX_TRANSLATIONS_PER_QUANTITY + 1 }, (_, copy) => tr(0, 1, 'bulk', copy));
    const pieces = [tr(1, 2, 'pieces'), tr(2, 3, 'pieces'), tr(1, 3, 'pieces')];
    const { report, ms } = timed(withTranslations(sharing(4), [...bulk, ...pieces]));
    expect(ms).toBeLessThan(1000);
    expect(report.highestRung).toBe(5);
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.faces])).toEqual([['pieces', 'exact', 1]]);
    expect(report.rungs[3].facts.slice(0, 2)).toEqual([
      { label: 'conversion factors', value: 504 },
      { label: 'quantities', value: 2 },
    ]);
    expect(report.rungs[4].facts.slice(0, 2)).toEqual([
      { label: 'closed paths and sets of three groups to examine', value: 2 },
      { label: 'quantities without a closed path', value: 0 },
    ]);
    expect(report.rungs[4].warnings[0]).toBe(notChecked('1 quantity', 'This quantity is "bulk" (501 conversion factors)'));
    expect(report.rungs[5].facts[0]).toEqual({ label: 'quantities examined', value: 1 });
  });

  test('20,000 translations between the same two contexts are skipped without quadratic work', () => {
    const bulk = Array.from({ length: 20_000 }, (_, copy) => tr(0, 1, undefined, copy));
    const { report, ms } = timed(withTranslations(sharing(3), bulk));
    expect(ms).toBeLessThan(1000);
    expect(report.cohomology).toEqual([]);
    expect(report.rungs[4].warnings[0]).toBe(notChecked('1 quantity', 'This quantity is "default" (20,000 conversion factors)'));
  });

  test('hundreds of loops with a defect stay fast next to 20,000 translations of a skipped quantity', () => {
    const bulk = Array.from({ length: 20_000 }, (_, copy) => tr(0, 1, 'bulk', copy));
    const contradicting = Array.from({ length: 400 }, (_, copy) => tr(1, 2, 'pieces', copy, copy === 0 ? 1 : 2));
    const { report, ms } = timed(withTranslations(sharing(3), [...bulk, ...contradicting]));
    expect(ms).toBeLessThan(1000);
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.loopDefectCount, c.loopDefects.length])).toEqual([['pieces', 'global_obstruction', 399, 20]]);
  });

  test('a quantity exactly at both limits is still classified', () => {
    // mesh of 14: 91 translations, 364 faces · fan of 137: 273 translations, 136 faces · 136 parallel translations, no face
    const filler = Array.from({ length: 136 }, (_, copy) => tr(158, 159, undefined, copy));
    const translations = [...mesh(14), ...fan(14, 137), ...filler];
    expect(translations).toHaveLength(MAX_TRANSLATIONS_PER_QUANTITY);
    const { report } = timed(withTranslations(sharing(160), translations));
    expect(report.highestRung).toBe(5);
    expect(report.rungs[4].warnings.filter((w) => w.includes('does not include'))).toEqual([]);
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.translationCount, c.faces])).toEqual([
      ['default', 'exact', MAX_TRANSLATIONS_PER_QUANTITY, MAX_FACES_PER_QUANTITY],
    ]);
  });

  test('three contexts with 8 translations on each side: one triple overlap, 512 faces — the limit counts triangles of translations', () => {
    const sides: Array<[number, number]> = [[0, 1], [1, 2], [0, 2]];
    const eightEach = sides.flatMap(([a, b]) => Array.from({ length: 8 }, (_, copy) => tr(a, b, undefined, copy)));
    const { report } = timed(withTranslations(sharing(3), eightEach));
    expect(fact(report, 2, 'sets of three groups with the same member')).toBe(1);
    expect(report.cohomology).toEqual([]);
    expect(report.rungs[4].warnings[0]).toBe(notChecked('1 quantity', 'This quantity is "default" (more than 500 sets of three conversion factors)'));
  });

  test('one face more than the limit and the quantity is skipped', () => {
    // mesh of 14 and a fan of 138: 364 + 137 = 501 faces
    const { report } = timed(withTranslations(sharing(160), [...mesh(14), ...fan(14, 138)]));
    expect(report.cohomology).toEqual([]);
    expect(report.rungs[4].warnings[0]).toBe(notChecked('1 quantity', 'This quantity is "default" (more than 500 sets of three conversion factors)'));
  });
});

describe('assessLadder — a report lists a bounded number of defects per quantity and counts all of them', () => {
  /** n contexts with one member of their own each: no overlap, so no face. */
  function separate(contexts: number): Model {
    const model = sharing(contexts, 0);
    for (let i = 0; i < contexts; i++) {
      model.elements.push(obj(`own${pad(i)}`));
      model.relationships.push(has(i, `own${pad(i)}`));
    }
    return model;
  }

  /**
   * Two arms of a path leave context 0 and `extra` translations ×2 join their far ends. The
   * spanning tree starts at context 0 and takes both arms, so each of the `extra` translations
   * closes a loop through every context, with the product 2.
   */
  function longLoops(contexts: number, extra: number, quantity: string): ModelRelationship[] {
    const half = Math.floor(contexts / 2);
    const out: ModelRelationship[] = [];
    for (let i = 0; i < half; i++) out.push(tr(i, i + 1, quantity));
    out.push(tr(0, half + 1, quantity));
    for (let i = half + 1; i < contexts - 1; i++) out.push(tr(i, i + 1, quantity));
    for (let copy = 0; copy < extra; copy++) out.push(tr(half, contexts - 1, quantity, copy, 2));
    return out;
  }

  test('the limit is 20', () => {
    expect(MAX_REPORTED_DEFECTS_PER_QUANTITY).toBe(20);
  });

  test('199 contexts, two quantities of 500 translations, 302 loops through every context each: 20 listed, all counted, the answer stays small', () => {
    const model = withTranslations(separate(199), [...longLoops(199, 302, 'hours'), ...longLoops(199, 302, 'pieces')]);
    const { report } = timed(model);
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.translationCount, c.independentLoops, c.loopDefectCount, c.loopDefects.length])).toEqual([
      ['hours', 'global_obstruction', 500, 302, 302, 20],
      ['pieces', 'global_obstruction', 500, 302, 302, 20],
    ]);
    expect(report.cohomology.flatMap((c) => c.loopDefects).every((d) => d.steps.length === 199)).toBe(true);
    expect(fact(report, 5, 'quantities that do not agree along a closed path')).toBe(2);
    // 2 quantities × 20 loops × 199 steps of about 125 bytes: 1 MB, where all 604 loops were 15 MB
    expect(JSON.stringify(report).length).toBeLessThan(2_000_000);

    // the listed loops are the first 20 of all loops with a defect, in their order
    const [hours] = buildContextStructure(model.elements, model.relationships).quantities;
    const all = classifyOneCochain(hours.complex, reals(report.tolerance), hours.cochain).loopDefects;
    expect(all).toHaveLength(302);
    expect(report.cohomology[0].loopDefects.map((d) => d.steps[0].relationshipId)).toEqual(all.slice(0, 20).map((d) => d.loop[0].edgeId));
  });

  test('29 defective triple overlaps: 20 faces and 20 loops are listed, 29 of each are counted', () => {
    // a hub translating ×1 to 30 contexts that translate ×2 along a path: every triangle hub–i–i+1 has the product 2
    const translations = [
      ...Array.from({ length: 30 }, (_, i) => tr(0, i + 1)),
      ...Array.from({ length: 29 }, (_, i) => tr(i + 1, i + 2, undefined, 0, 2)),
    ];
    const { report } = timed(withTranslations(sharing(31), translations));
    const [c] = report.cohomology;
    expect([c.verdict, c.faces, c.faceDefectCount, c.faceDefects.length, c.loopDefectCount, c.loopDefects.length]).toEqual(['local_defect', 29, 29, 20, 29, 20]);
    expect(fact(report, 5, 'quantities that do not agree at a member')).toBe(1);
  });

  test('up to 20 defects the list and the count are the same', () => {
    const translations = [tr(0, 1), ...Array.from({ length: 20 }, (_, copy) => tr(0, 1, undefined, copy + 1, 2))];
    const [c] = timed(withTranslations(separate(2), translations)).report.cohomology;
    expect([c.loopDefectCount, c.loopDefects.length, c.faceDefectCount, c.faceDefects.length]).toEqual([20, 20, 0, 0]);
  });
});

describe('assessLadder — large contexts do not make the search for a common member unbounded', () => {
  /** 32 contexts with `own` members each and nothing shared; two quantities, each a full mesh: 9,920 triangles, no face. */
  function meshedWithoutOverlap(own: number): Model {
    const model = sharing(32, 0);
    for (let i = 0; i < 32; i++) {
      for (let m = 0; m < own; m++) {
        model.elements.push(obj(`o${i}-${m}`));
        model.relationships.push(has(i, `o${i}-${m}`));
      }
    }
    return withTranslations(model, [...mesh(32, 0, 'hours'), ...mesh(32, 0, 'pieces')]);
  }

  test('1,000 members per context: both quantities are classified', () => {
    const { report } = timed(meshedWithoutOverlap(1000)); // 9,920 triangles × 1,000 members < 20,000,000
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.faces, c.h1Dimension])).toEqual([
      ['hours', 'exact', 0, 465],
      ['pieces', 'exact', 0, 465],
    ]);
    expect(report.rungs[4].warnings).toEqual([]);
  });

  test('5,000 members per context: the search stops, the quantity it stopped in and the one after it are named', () => {
    const { report, ms } = timed(meshedWithoutOverlap(5000)); // 4,960 triangles × 5,000 members > 20,000,000
    expect(ms).toBeLessThan(5000); // about half a second; the bound is against blocking for many seconds, not against milliseconds
    expect(MAX_COMPARED_MEMBERS).toBe(20_000_000);
    expect(report.cohomology).toEqual([]);
    const members = 'more than 20,000,000 members to compare';
    expect(report.rungs[4].warnings).toEqual([notChecked('2 quantities', `These quantities are "hours" (${members}) and "pieces" (${members})`)]);
  });
});

describe('assessLadder — many quantities do not add up without bound', () => {
  test('quantities are checked in name order until their translations add up to the limit of the report', () => {
    // 12 quantities, each a mesh of 14 contexts: 91 translations and 364 faces — 10 of them fit into 1,000
    const names = Array.from({ length: 12 }, (_, i) => `q${pad(i)}`);
    const { report, ms } = timed(withTranslations(sharing(14), names.flatMap((q) => mesh(14, 0, q))));
    expect(ms).toBeLessThan(1000);
    expect(report.highestRung).toBe(5);
    expect(report.cohomology.map((c) => c.quantity)).toEqual(names.slice(0, 10));
    expect(report.rungs[3].facts[1]).toEqual({ label: 'quantities', value: 12 });
    expect(report.rungs[4].warnings).toEqual([
      notChecked('2 quantities', 'These quantities are "q0010" (more than 1,000 conversion factors in all quantities) and "q0011" (more than 1,000 conversion factors in all quantities)'),
    ]);
  });

  test('exactly 1,000 translations are still classified; the quantity that would take the sum above them is not', () => {
    const full = (q: string) => Array.from({ length: MAX_TRANSLATIONS_PER_QUANTITY }, (_, copy) => tr(0, 1, q, copy)); // 500 translations, 499 loops
    const beyond = [tr(0, 1, 'c'), tr(1, 2, 'c'), tr(0, 2, 'c')];
    const { report } = timed(withTranslations(sharing(3), [...full('a'), ...full('b'), ...beyond]));
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.translationCount])).toEqual([
      ['a', 'exact', 500],
      ['b', 'exact', 500],
    ]);
    expect(report.cohomology.reduce((sum, c) => sum + c.translationCount, 0)).toBe(MAX_TRANSLATIONS_PER_REPORT);
    expect(report.rungs[4].warnings).toEqual([notChecked('1 quantity', 'This quantity is "c" (more than 1,000 conversion factors in all quantities)')]);
  });

  test('a small quantity after a large one still fits; only the first five skipped quantities are named', () => {
    const large = (q: string) => Array.from({ length: 400 }, (_, copy) => tr(0, 1, q, copy)); // 400 translations, 399 loops
    const small = [tr(0, 1, 'z'), tr(1, 2, 'z'), tr(0, 2, 'z')];
    const quantities = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const { report } = timed(withTranslations(sharing(3), [...quantities.flatMap(large), ...small]));
    expect(report.cohomology.map((c) => c.quantity)).toEqual(['a', 'b', 'z']);
    const total = 'more than 1,000 conversion factors in all quantities';
    expect(report.rungs[4].warnings[0]).toBe(
      notChecked('7 quantities', `These quantities are "c" (${total}), "d" (${total}), "e" (${total}), "f" (${total}), "g" (${total}), and 2 more`),
    );
  });

  test('the largest report inside the limits — two quantities, each a mesh of 32 contexts with 500 faces — stays under five seconds', () => {
    // 500 of the 4,960 triangles are made faces by a member that exactly their three contexts share
    const next = seeded(3);
    const model = sharing(32, 0);
    for (let i = 0; i < 32; i++) {
      model.elements.push(obj(`own${pad(i)}`));
      model.relationships.push(has(i, `own${pad(i)}`));
    }
    const chosen = new Set<string>();
    while (chosen.size < MAX_FACES_PER_QUANTITY) {
      const [a, b, c] = [next(32), next(32), next(32)].sort((x, y) => x - y);
      if (a !== b && b !== c) chosen.add(`${a}-${b}-${c}`);
    }
    for (const triple of chosen) {
      model.elements.push(obj(`f${triple}`));
      for (const corner of triple.split('-')) model.relationships.push(has(Number(corner), `f${triple}`));
    }
    const { report, ms } = timed(withTranslations(model, [...mesh(32, 0, 'hours'), ...mesh(32, 0, 'pieces')]));
    expect(ms).toBeLessThan(5000); // about half a second; the bound is against blocking for many seconds, not against milliseconds
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.translationCount, c.faces])).toEqual([
      ['hours', 'exact', 496, 500],
      ['pieces', 'exact', 496, 500],
    ]);
    expect(report.rungs[4].warnings).toEqual([]);
  });
});
