/**
 * UC-METH-001 — the ladder stays fast on large models: faces come from triangles of
 * translations, counts are bounded, and every limit that applies is named in the report.
 * Run: cd packages/server && npx jest src/__tests__/topologyLadderLimits.test.ts
 */
import { performance } from 'node:perf_hooks';
import { factorToAdditive } from '../services/topology/abelianGroup';
import { buildComplex, Edge, Face, OrientedStep } from '../services/topology/cellComplex';
import { buildContextStructure, ModelElement, ModelRelationship, QuantityComplex } from '../services/topology/contextComplex';
import { graphBetti } from '../services/topology/homology';
import { assessLadder, cohomologyOf, LadderInput, loopLabels } from '../services/topology/ladder';
import {
  MAX_CHECKED_TRIPLE_CANDIDATES,
  MAX_COMPARED_MEMBERS,
  MAX_CONTEXTS,
  MAX_COUNTED_TRIPLE_OVERLAPS,
  MAX_FACES_PER_QUANTITY,
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
  `${count} not checked — a quantity is checked up to 500 translations and 500 faces, all quantities together up to 1,000 translations: ${named}.`;

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
      { label: 'connected components (b0)', value: 1 },
      { label: 'independent loops (b1)', value: 0 },
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
    expect(report.rungs[2].facts).toEqual([{ label: 'contexts', value: 700 }]);
    expect(report.rungs[2].next).toBe(
      'The model has 700 contexts; the cover is analysed for at most 200. Reduce the grouping and location elements to 200 or fewer.',
    );
  });

  test('300 contexts sharing one member: answered within a second, not analysed', () => {
    const { report, ms } = timed(sharing(300));
    expect(ms).toBeLessThan(1000);
    expect(report.highestRung).toBe(1);
    expect(report.rungs[2].next).toContain('The model has 300 contexts');
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
    expect(fact(report, 2, 'contexts with members')).toBe(MAX_CONTEXTS);
    expect(fact(report, 2, 'overlapping context pairs')).toBe((MAX_CONTEXTS * (MAX_CONTEXTS - 1)) / 2);
  });
});

describe('assessLadder — triple overlaps are counted with bounded work', () => {
  const atLeast = (count: string) =>
    `At least ${count} triple overlaps: counting stops at 10,000 triples or after 1,000,000 candidates, so the number shown is a lower bound.`;

  test('below the limit the count is exact and nothing is said about a limit', () => {
    const { report } = timed(sharing(40)); // C(40, 3) = 9,880
    expect(fact(report, 2, 'triple overlaps')).toBe(9880);
    expect(report.rungs[2].warnings).toEqual([]);
  });

  test('at the limit the count stops and the report says "at least"', () => {
    const { report } = timed(sharing(60)); // C(60, 3) = 34,220
    expect(fact(report, 2, 'triple overlaps')).toBe(MAX_COUNTED_TRIPLE_OVERLAPS);
    expect(report.rungs[2].status).toBe('reached');
    expect(report.rungs[2].warnings).toEqual([atLeast('10,000')]);
  });

  test('a triple shared through many members is one triple, and many members cost no extra time', () => {
    const { report, ms } = timed(sharing(30, 400)); // C(30, 3) = 4,060 — the same for every member
    expect(ms).toBeLessThan(1000);
    expect(fact(report, 2, 'triple overlaps')).toBe(4060);
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
    const counted = fact(report, 2, 'triple overlaps')!;
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeLessThanOrEqual(8436);
    expect(report.rungs[2].warnings).toEqual([atLeast(counted.toLocaleString('en-US'))]);
  });
});

describe('assessLadder — a quantity above the limits is skipped and named', () => {
  test('a full mesh of 32 contexts sharing one member: within a second, the quantity is reported as skipped', () => {
    const { report, ms } = timed(withTranslations(sharing(32), mesh(32))); // 496 translations, 4,960 faces
    expect(ms).toBeLessThan(1000);
    expect(report.cohomology).toEqual([]);
    expect(statuses(report)).toEqual(['reached', 'reached', 'reached', 'reached', 'open', 'locked']);
    expect(report.rungs[3].facts.slice(0, 2)).toEqual([
      { label: 'declared translations', value: 496 },
      { label: 'quantities', value: 1 },
    ]);
    expect(report.rungs[4].warnings).toEqual([notChecked('1 quantity is', '"default" (more than 500 faces)')]);
    expect(report.rungs[4].next).toBe(
      'The quantity named in the warning is too large to check. Bring it within the limits, or declare translations of another quantity that close a loop: two different paths between the same contexts (for example A→B, B→C and A→C).',
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
      { label: 'declared translations', value: 504 },
      { label: 'quantities', value: 2 },
    ]);
    expect(report.rungs[4].facts.slice(0, 2)).toEqual([
      { label: 'loops and faces to check', value: 2 },
      { label: 'quantities without a loop', value: 0 },
    ]);
    expect(report.rungs[4].warnings[0]).toBe(notChecked('1 quantity is', '"bulk" (501 translations)'));
    expect(report.rungs[5].facts[0]).toEqual({ label: 'quantities checked', value: 1 });
  });

  test('20,000 translations between the same two contexts are skipped without quadratic work', () => {
    const bulk = Array.from({ length: 20_000 }, (_, copy) => tr(0, 1, undefined, copy));
    const { report, ms } = timed(withTranslations(sharing(3), bulk));
    expect(ms).toBeLessThan(1000);
    expect(report.cohomology).toEqual([]);
    expect(report.rungs[4].warnings[0]).toBe(notChecked('1 quantity is', '"default" (20,000 translations)'));
  });

  test('hundreds of reported loops stay fast next to 20,000 translations of a skipped quantity', () => {
    const bulk = Array.from({ length: 20_000 }, (_, copy) => tr(0, 1, 'bulk', copy));
    const contradicting = Array.from({ length: 400 }, (_, copy) => tr(1, 2, 'pieces', copy, copy === 0 ? 1 : 2));
    const { report, ms } = timed(withTranslations(sharing(3), [...bulk, ...contradicting]));
    expect(ms).toBeLessThan(1000);
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.loopDefects.length])).toEqual([['pieces', 'global_obstruction', 399]]);
  });

  test('a quantity exactly at both limits is still classified', () => {
    // mesh of 14: 91 translations, 364 faces · fan of 137: 273 translations, 136 faces · 136 parallel translations, no face
    const filler = Array.from({ length: 136 }, (_, copy) => tr(158, 159, undefined, copy));
    const translations = [...mesh(14), ...fan(14, 137), ...filler];
    expect(translations).toHaveLength(MAX_TRANSLATIONS_PER_QUANTITY);
    const { report } = timed(withTranslations(sharing(160), translations));
    expect(report.highestRung).toBe(5);
    expect(report.rungs[4].warnings.filter((w) => w.includes('not checked'))).toEqual([]);
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.translationCount, c.faces])).toEqual([
      ['default', 'exact', MAX_TRANSLATIONS_PER_QUANTITY, MAX_FACES_PER_QUANTITY],
    ]);
  });

  test('one face more than the limit and the quantity is skipped', () => {
    // mesh of 14 and a fan of 138: 364 + 137 = 501 faces
    const { report } = timed(withTranslations(sharing(160), [...mesh(14), ...fan(14, 138)]));
    expect(report.cohomology).toEqual([]);
    expect(report.rungs[4].warnings[0]).toBe(notChecked('1 quantity is', '"default" (more than 500 faces)'));
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
    expect(ms).toBeLessThan(1500);
    expect(MAX_COMPARED_MEMBERS).toBe(20_000_000);
    expect(report.cohomology).toEqual([]);
    const members = 'more than 20,000,000 members to compare';
    expect(report.rungs[4].warnings).toEqual([notChecked('2 quantities are', `"hours" (${members}), "pieces" (${members})`)]);
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
      notChecked('2 quantities are', '"q0010" (beyond 1,000 translations in total), "q0011" (beyond 1,000 translations in total)'),
    ]);
  });

  test('a small quantity after a large one still fits; only the first five skipped quantities are named', () => {
    const large = (q: string) => Array.from({ length: 400 }, (_, copy) => tr(0, 1, q, copy)); // 400 translations, 399 loops
    const small = [tr(0, 1, 'z'), tr(1, 2, 'z'), tr(0, 2, 'z')];
    const quantities = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const { report } = timed(withTranslations(sharing(3), [...quantities.flatMap(large), ...small]));
    expect(report.cohomology.map((c) => c.quantity)).toEqual(['a', 'b', 'z']);
    const total = 'beyond 1,000 translations in total';
    expect(report.rungs[4].warnings[0]).toBe(
      notChecked('7 quantities are', `"c" (${total}), "d" (${total}), "e" (${total}), "f" (${total}), "g" (${total}), and 2 more`),
    );
  });

  test('the largest report inside the limits — two quantities, each a mesh of 32 contexts with 500 faces — stays under two seconds', () => {
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
    expect(ms).toBeLessThan(2000);
    expect(report.cohomology.map((c) => [c.quantity, c.verdict, c.translationCount, c.faces])).toEqual([
      ['hours', 'exact', 496, 500],
      ['pieces', 'exact', 496, 500],
    ]);
    expect(report.rungs[4].warnings).toEqual([]);
  });
});
