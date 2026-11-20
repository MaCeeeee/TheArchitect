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
 */
import { CONTEXT_ELEMENT_TYPES } from '@thearchitect/shared';
import { factorToAdditive } from './abelianGroup';
import { buildComplex, CellComplex, Edge, Face, OrientedStep } from './cellComplex';
import type { Cochain } from './cochain';

export const CONTEXT_TYPES: ReadonlySet<string> = new Set(CONTEXT_ELEMENT_TYPES);
export const MEMBERSHIP_TYPES: ReadonlySet<string> = new Set(['composition', 'aggregation']);
export const DEFAULT_QUANTITY = 'default';
/**
 * Accepted range of a translation factor. Outside it a factor is unusable: products around a
 * loop would leave the range of a double (1e308 × 1e308 = Infinity) and no real unit needs it.
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

export interface ContextStructure {
  contexts: ModelElement[];
  /** context id → ids of its members */
  members: Map<string, Set<string>>;
  contextsWithMembers: number;
  overlappingPairs: Array<[string, string]>;
  tripleOverlaps: Array<[string, string, string]>;
  /** Valid translations: two different contexts with members, not a membership, factor within the accepted range. */
  translations: ModelRelationship[];
  /** Relationship ids that carry a factor but are not usable (wrong ends, a membership, or a factor outside the accepted range). */
  invalidTranslations: string[];
  overlapsWithoutTranslation: Array<[string, string]>;
  quantities: QuantityComplex[];
}

function sharesMember(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
  if (!a || !b) return false;
  for (const member of a) if (b.has(member)) return true;
  return false;
}

/** Plain code-unit order: the same on every machine, unlike localeCompare. */
function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function stepsBetween(edges: Edge[], from: string, to: string): OrientedStep[] {
  return edges
    .filter((e) => (e.source === from && e.target === to) || (e.source === to && e.target === from))
    .map((e): OrientedStep => ({ edgeId: e.id, sign: e.source === from ? 1 : -1 }));
}

export function buildContextStructure(elements: ModelElement[], relationships: ModelRelationship[]): ContextStructure {
  const contexts = elements.filter((e) => CONTEXT_TYPES.has(e.type)).sort((a, b) => a.id.localeCompare(b.id));
  const contextIds = new Set(contexts.map((c) => c.id));
  const elementIds = new Set(elements.map((e) => e.id));

  const members = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!MEMBERSHIP_TYPES.has(rel.type)) continue;
    if (!contextIds.has(rel.sourceId) || !elementIds.has(rel.targetId) || rel.sourceId === rel.targetId) continue;
    const set = members.get(rel.sourceId) ?? new Set<string>();
    set.add(rel.targetId);
    members.set(rel.sourceId, set);
  }

  const ids = contexts.map((c) => c.id);
  const overlappingPairs: Array<[string, string]> = [];
  const tripleOverlaps: Array<[string, string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (!sharesMember(members.get(ids[i]), members.get(ids[j]))) continue;
      overlappingPairs.push([ids[i], ids[j]]);
      for (let k = j + 1; k < ids.length; k++) {
        const a = members.get(ids[i])!;
        const b = members.get(ids[j])!;
        const c = members.get(ids[k]);
        if (!c) continue;
        if ([...a].some((m) => b.has(m) && c.has(m))) tripleOverlaps.push([ids[i], ids[j], ids[k]]);
      }
    }
  }

  const hasMembers = (id: string) => (members.get(id)?.size ?? 0) > 0;
  const translations: ModelRelationship[] = [];
  const invalidTranslations: string[] = [];
  // Sorted by id: the edge order picks the spanning tree and with it the reported loops,
  // so it must not depend on the order in which the database returns the relationships.
  for (const rel of [...relationships].sort(byId)) {
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
    byQuantity.set(quantity, [...(byQuantity.get(quantity) ?? []), t]);
  }

  const quantities: QuantityComplex[] = [...byQuantity.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
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
      const cochain: Cochain<number> = new Map(rels.map((r) => [r.id, factorToAdditive(r.translationFactor as number)]));
      return { quantity, complex: buildComplex(vertices, edges, faces), cochain };
    });

  return {
    contexts,
    members,
    contextsWithMembers: contexts.filter((c) => hasMembers(c.id)).length,
    overlappingPairs,
    tripleOverlaps,
    translations,
    invalidTranslations,
    overlapsWithoutTranslation,
    quantities,
  };
}
