/**
 * UC-METH-001, rungs 2–4 — from the architecture model to the complex of contexts.
 *
 *   context      an element of type grouping or location (ArchiMate's composite elements)
 *   member       target of a composition or aggregation relationship from the context
 *   overlap      two contexts sharing a member; triple overlap: three contexts sharing one
 *   translation  a relationship that is not itself a membership, between two contexts that
 *                both have members, with a factor:
 *                1 unit in the source context = factor units in the target context
 *
 * Per quantity: vertices = contexts that take part in a translation, oriented edges = the
 * declared translations, faces = triangles of translations among three contexts that share
 * a member (there the three translations must agree on the same thing). The 1-cochain is
 * log(factor) in (ℝ, +).
 *
 * What this is not: a check that the contexts cover the whole model. Overlaps enter the
 * computation only as faces; edges come from declared translations.
 *
 * The work is bounded (limits.ts): overlaps are found through the members, faces through the
 * triangles of translations — never by going through all triples of contexts.
 */
import { CONTEXT_ELEMENT_TYPES } from '@thearchitect/shared';
import { factorToAdditive } from './abelianGroup';
import { buildComplex, CellComplex, Edge, Face, OrientedStep } from './cellComplex';
import type { Cochain } from './cochain';
import {
  MAX_CHECKED_TRIPLE_CANDIDATES,
  MAX_COMPARED_MEMBERS,
  MAX_CONTEXTS,
  MAX_COUNTED_TRIPLE_OVERLAPS,
  MAX_FACES_PER_QUANTITY,
  MAX_TRANSLATIONS_PER_QUANTITY,
  MAX_TRANSLATIONS_PER_REPORT,
} from './limits';

export const CONTEXT_TYPES: ReadonlySet<string> = new Set(CONTEXT_ELEMENT_TYPES);
export const MEMBERSHIP_TYPES: ReadonlySet<string> = new Set(['composition', 'aggregation']);
export const DEFAULT_QUANTITY = 'default';
/**
 * Accepted range of a translation factor. Outside it a factor is unusable: no real unit needs it,
 * and already the product of two such factors can leave the range of a double (1e308 × 1e308 =
 * Infinity). The bounds do not rule that out for a long loop or chain — 27 steps of 1e12 are
 * 1e324 — so the report gives null for a product or scale it cannot hold (ladder.ts).
 */
export const MIN_TRANSLATION_FACTOR = 1e-12;
export const MAX_TRANSLATION_FACTOR = 1e12;

export interface ModelElement {
  id: string;
  name: string;
  type: string;
}

export interface ModelRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  translationFactor?: number | null;
  translationQuantity?: string | null;
}

export interface QuantityComplex {
  quantity: string;
  complex: CellComplex;
  /** edge id (= relationship id) → log(factor) */
  cochain: Cochain<number>;
}

export interface SkippedQuantity {
  quantity: string;
  /** Number of translations of the quantity; the report shows it when the reason is 'translations'. */
  translations: number;
  /**
   * The limit that applies: MAX_TRANSLATIONS_PER_QUANTITY ('translations'), MAX_FACES_PER_QUANTITY
   * ('faces'), MAX_TRANSLATIONS_PER_REPORT, used up by the quantities before it ('report'), or
   * MAX_COMPARED_MEMBERS, used up while looking for the faces ('members').
   */
  reason: 'translations' | 'faces' | 'report' | 'members';
}

export interface ContextStructure {
  contexts: ModelElement[];
  /** False when there are more than MAX_CONTEXTS contexts: then nothing below is computed. */
  analysed: boolean;
  /** context id → ids of its members */
  members: Map<string, Set<string>>;
  contextsWithMembers: number;
  overlappingPairs: Array<[string, string]>;
  /** Distinct triples of contexts that share a member — at most MAX_COUNTED_TRIPLE_OVERLAPS of them. */
  tripleOverlaps: Array<[string, string, string]>;
  /** True when the count stopped at a limit: the number of tripleOverlaps is then a lower bound. */
  tripleOverlapsCapped: boolean;
  /** Valid translations: two different contexts with members, not a membership, factor within the accepted range. */
  translations: ModelRelationship[];
  /** Relationship ids that carry a factor but are not usable (wrong ends, a membership, or a factor outside the accepted range). */
  invalidTranslations: string[];
  overlapsWithoutTranslation: Array<[string, string]>;
  /** The quantities within the limits, each with its complex. */
  quantities: QuantityComplex[];
  /** The quantities above a limit: no complex is built for them, they are not classified. */
  skippedQuantities: SkippedQuantity[];
}

/** Plain code-unit order: the same on every machine, unlike localeCompare. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byId(a: { id: string }, b: { id: string }): number {
  return compareText(a.id, b.id);
}

function addTo<K, V>(lists: Map<K, V[]>, key: K, value: V): void {
  const list = lists.get(key);
  if (list) list.push(value);
  else lists.set(key, [value]);
}

/**
 * Overlaps, found through the members: every member knows the contexts it belongs to, and any
 * two (three) of them are an overlapping pair (a triple overlap). Members with the same set of
 * contexts say the same thing, so each set is looked at once.
 *
 * Pairs cost at most n²/2 marks per set of contexts, with n ≤ MAX_CONTEXTS. Triples stop at
 * MAX_COUNTED_TRIPLE_OVERLAPS distinct ones or after MAX_CHECKED_TRIPLE_CANDIDATES candidates.
 */
function findOverlaps(
  ids: string[],
  members: Map<string, Set<string>>,
): Pick<ContextStructure, 'overlappingPairs' | 'tripleOverlaps' | 'tripleOverlapsCapped'> {
  const n = ids.length;
  // member → positions of its contexts in ids, ascending
  const contextsOf = new Map<string, number[]>();
  ids.forEach((id, position) => {
    for (const member of members.get(id) ?? []) addTo(contextsOf, member, position);
  });
  const contextSets = new Map<string, number[]>();
  for (const positions of contextsOf.values()) {
    if (positions.length >= 2) contextSets.set(positions.join(','), positions);
  }
  // Sorted, so that a count that stops at a limit stops at the same place for the same model.
  const shared = [...contextSets.entries()].sort(([a], [b]) => compareText(a, b)).map(([, positions]) => positions);

  const overlaps = new Uint8Array(n * n);
  for (const positions of shared) {
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) overlaps[positions[a] * n + positions[b]] = 1;
    }
  }
  const overlappingPairs: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) if (overlaps[i * n + j]) overlappingPairs.push([ids[i], ids[j]]);
  }

  // A triple i < j < k as one number, so that the same triple found through another member is recognised.
  const triples = new Set<number>();
  let candidates = 0;
  let tripleOverlapsCapped = false;
  counting: for (const positions of shared) {
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        for (let c = b + 1; c < positions.length; c++) {
          if (triples.size >= MAX_COUNTED_TRIPLE_OVERLAPS || candidates >= MAX_CHECKED_TRIPLE_CANDIDATES) {
            tripleOverlapsCapped = true;
            break counting;
          }
          candidates++;
          triples.add((positions[a] * n + positions[b]) * n + positions[c]);
        }
      }
    }
  }
  const tripleOverlaps = [...triples]
    .sort((x, y) => x - y)
    .map((t): [string, string, string] => [ids[Math.floor(t / (n * n))], ids[Math.floor(t / n) % n], ids[t % n]]);

  return { overlappingPairs, tripleOverlaps, tripleOverlapsCapped };
}

/** How many members may still be looked at in this report, see MAX_COMPARED_MEMBERS. */
interface MemberBudget {
  left: number;
}

/** Do the three contexts share a member? null if the budget runs out before that is known. */
function shareMember(a: Set<string>, b: Set<string>, c: Set<string>, budget: MemberBudget): boolean | null {
  const [smallest, other, third] = [a, b, c].sort((x, y) => x.size - y.size);
  for (const member of smallest) {
    if (budget.left === 0) return null;
    budget.left--;
    if (other.has(member) && third.has(member)) return true;
  }
  return false;
}

/**
 * The faces of one quantity: every triangle of its translations whose three contexts share a
 * member. Two contexts may be joined by several translations, in either direction; each choice
 * of one translation per side is a face of its own. Faces are listed by their contexts a < b < c.
 * Instead of the faces, the limit that stopped the search: more than MAX_FACES_PER_QUANTITY
 * faces, or the member budget of the report used up.
 */
function facesOf(edges: Edge[], members: Map<string, Set<string>>, budget: MemberBudget): Face[] | 'faces' | 'members' {
  // context → the contexts after it that it has a translation with → those translations
  const later = new Map<string, Map<string, Edge[]>>();
  for (const edge of edges) {
    const [low, high] = edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source];
    const neighbours = later.get(low) ?? new Map<string, Edge[]>();
    addTo(neighbours, high, edge);
    later.set(low, neighbours);
  }
  const stepsFrom = (from: string, between: Edge[]) =>
    between.map((e): OrientedStep => ({ edgeId: e.id, sign: e.source === from ? 1 : -1 }));

  const faces: Face[] = [];
  for (const a of [...later.keys()].sort(compareText)) {
    const fromA = later.get(a)!;
    const neighbours = [...fromA.keys()].sort(compareText);
    for (let i = 0; i < neighbours.length; i++) {
      const b = neighbours[i];
      for (let j = i + 1; j < neighbours.length; j++) {
        const c = neighbours[j];
        const betweenBC = later.get(b)?.get(c);
        if (!betweenBC) continue;
        const shared = shareMember(members.get(a)!, members.get(b)!, members.get(c)!, budget);
        if (shared === null) return 'members';
        if (!shared) continue;
        for (const ab of stepsFrom(a, fromA.get(b)!)) {
          for (const bc of stepsFrom(b, betweenBC)) {
            for (const ca of stepsFrom(c, fromA.get(c)!)) {
              if (faces.length === MAX_FACES_PER_QUANTITY) return 'faces';
              faces.push({ id: `${ab.edgeId}+${bc.edgeId}+${ca.edgeId}`, boundary: [ab, bc, ca] });
            }
          }
        }
      }
    }
  }
  return faces;
}

export function buildContextStructure(elements: ModelElement[], relationships: ModelRelationship[]): ContextStructure {
  const contexts = elements.filter((e) => CONTEXT_TYPES.has(e.type)).sort(byId);
  if (contexts.length > MAX_CONTEXTS) {
    return {
      contexts,
      analysed: false,
      members: new Map(),
      contextsWithMembers: 0,
      overlappingPairs: [],
      tripleOverlaps: [],
      tripleOverlapsCapped: false,
      translations: [],
      invalidTranslations: [],
      overlapsWithoutTranslation: [],
      quantities: [],
      skippedQuantities: [],
    };
  }
  const contextIds = new Set(contexts.map((c) => c.id));
  const elementIds = new Set(elements.map((e) => e.id));

  // Sorted by id: the edge order picks the spanning tree and with it the reported loops, the
  // member order decides where a search that hits a limit stops. Neither may depend on the
  // order in which the database returns the relationships.
  const sorted = [...relationships].sort(byId);

  const members = new Map<string, Set<string>>();
  for (const rel of sorted) {
    if (!MEMBERSHIP_TYPES.has(rel.type)) continue;
    if (!contextIds.has(rel.sourceId) || !elementIds.has(rel.targetId) || rel.sourceId === rel.targetId) continue;
    const set = members.get(rel.sourceId) ?? new Set<string>();
    set.add(rel.targetId);
    members.set(rel.sourceId, set);
  }

  const ids = contexts.map((c) => c.id);
  const { overlappingPairs, tripleOverlaps, tripleOverlapsCapped } = findOverlaps(ids, members);

  const hasMembers = (id: string) => (members.get(id)?.size ?? 0) > 0;
  const translations: ModelRelationship[] = [];
  const invalidTranslations: string[] = [];
  for (const rel of sorted) {
    if (rel.translationFactor === undefined || rel.translationFactor === null) continue;
    const usable =
      contextIds.has(rel.sourceId) &&
      contextIds.has(rel.targetId) &&
      hasMembers(rel.sourceId) &&
      hasMembers(rel.targetId) &&
      !MEMBERSHIP_TYPES.has(rel.type) &&
      rel.sourceId !== rel.targetId &&
      Number.isFinite(rel.translationFactor) &&
      rel.translationFactor >= MIN_TRANSLATION_FACTOR &&
      rel.translationFactor <= MAX_TRANSLATION_FACTOR;
    if (usable) translations.push(rel);
    else invalidTranslations.push(rel.id);
  }

  const translated = new Set(translations.map((t) => [t.sourceId, t.targetId].sort().join('|')));
  const overlapsWithoutTranslation = overlappingPairs.filter(([a, b]) => !translated.has([a, b].sort().join('|')));

  const byQuantity = new Map<string, ModelRelationship[]>();
  for (const t of translations) {
    // Trimmed and lower case: "Pieces" and "pieces " are the same quantity.
    const quantity = t.translationQuantity?.trim().toLowerCase() || DEFAULT_QUANTITY;
    addTo(byQuantity, quantity, t);
  }

  const quantities: QuantityComplex[] = [];
  const skippedQuantities: SkippedQuantity[] = [];
  let examined = 0; // translations of the quantities looked at so far
  const memberBudget: MemberBudget = { left: MAX_COMPARED_MEMBERS };
  for (const [quantity, rels] of [...byQuantity.entries()].sort(([a], [b]) => compareText(a, b))) {
    if (rels.length > MAX_TRANSLATIONS_PER_QUANTITY) {
      skippedQuantities.push({ quantity, translations: rels.length, reason: 'translations' });
      continue;
    }
    if (examined + rels.length > MAX_TRANSLATIONS_PER_REPORT) {
      skippedQuantities.push({ quantity, translations: rels.length, reason: 'report' });
      continue;
    }
    examined += rels.length;
    const edges: Edge[] = rels.map((r) => ({ id: r.id, source: r.sourceId, target: r.targetId }));
    const faces = facesOf(edges, members, memberBudget);
    if (!Array.isArray(faces)) {
      skippedQuantities.push({ quantity, translations: rels.length, reason: faces });
      continue;
    }
    const ends = new Set(edges.flatMap((e) => [e.source, e.target]));
    const vertices = ids.filter((id) => ends.has(id));
    const cochain: Cochain<number> = new Map(rels.map((r) => [r.id, factorToAdditive(r.translationFactor as number)]));
    quantities.push({ quantity, complex: buildComplex(vertices, edges, faces), cochain });
  }

  return {
    contexts,
    analysed: true,
    members,
    contextsWithMembers: contexts.filter((c) => hasMembers(c.id)).length,
    overlappingPairs,
    tripleOverlaps,
    tripleOverlapsCapped,
    translations,
    invalidTranslations,
    overlapsWithoutTranslation,
    quantities,
    skippedQuantities,
  };
}
