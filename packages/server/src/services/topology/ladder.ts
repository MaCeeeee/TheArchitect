/**
 * UC-METH-001 — the ladder to cohomology, assessed mechanically from the model.
 *
 *   0 identity          every thing exists once
 *   1 directed graph    chain complex C₁ → C₀ with ∂ (orientation)
 *   2 cover             at least two contexts with members; shared members are overlaps
 *   3 coefficients      values in an abelian group: declared translations
 *   4 gluing testable   the translations of some quantity close at least one loop or face
 *   5 cohomology        class of the translation cochain in H¹, per testable quantity
 *
 * A rung counts only if every rung below it is reached; rungs above the first open one
 * are 'locked'. Cohomology is computed only when rungs 0–4 are reached.
 *
 * The assessment runs inside a request. Where a limit of limits.ts applies — too many contexts,
 * a quantity above a limit, a count that stops — the rung concerned says so.
 *
 * What the report shows to a user — title, provides, next, warnings, fact labels — is written in
 * ASD-STE100 (Simplified Technical English): a context is a "group", a translation a "conversion
 * factor", a loop a "closed path", a rung a "step". Every word is listed in the shared
 * ste100-words.constants.ts and topologyLadderText.test.ts fails on any other. The mathematical
 * wording of each rung is kept in its `math` field.
 */
import { LADDER_FACT_GROUPS_WITH_MEMBERS, LADDER_GROUPS_RUNG, toMethodRef } from '@thearchitect/shared';
import type {
  CanonicalScale,
  CohomologyResult,
  LadderFact,
  LadderReport,
  LadderRung,
  LadderRungIndex,
  ModelFacts,
  TranslationLoopDefect,
  TranslationStep,
} from '@thearchitect/shared';
import { additiveToFactor, reals } from './abelianGroup';
import { assessApplicability } from './applicability';
import { assessChangeRings } from './changeRing';
import { buildComplex, OrientedStep } from './cellComplex';
import {
  buildContextStructure,
  compareText,
  ContextStructure,
  MAX_TRANSLATION_FACTOR,
  MIN_TRANSLATION_FACTOR,
  ModelElement,
  ModelRelationship,
  QuantityComplex,
  SkippedQuantity,
} from './contextComplex';
import { classifyOneCochain } from './h1';
import { bettiNumbers, componentIndex, graphBetti, spanningForest } from './homology';
import {
  MAX_COMPARED_MEMBERS,
  MAX_CONTEXTS,
  MAX_FACES_PER_QUANTITY,
  MAX_REPORTED_DEFECTS_PER_QUANTITY,
  MAX_TRANSLATIONS_PER_QUANTITY,
  MAX_TRANSLATIONS_PER_REPORT,
} from './limits';

export const LOOP_CHECK_METHOD_ID = 'PA-kategorientheorie';
/**
 * Tolerance on log(factor): the product around a loop must equal 1 within about one part per
 * million. Declared factors are rounded numbers (3.28084 × 0.3048 = 1.00000003); a stricter
 * value would report rounding as contradiction. It is a declared threshold, shown in the report.
 */
export const LOOP_TOLERANCE = 1e-6;

/** "1e-12 and 1e12" — the accepted range of a translation factor, as shown in the warning. */
const FACTOR_RANGE = [MIN_TRANSLATION_FACTOR, MAX_TRANSLATION_FACTOR].map((f) => f.toExponential().replace('+', '')).join(' and ');

export interface LadderInput {
  elements: ModelElement[];
  relationships: ModelRelationship[];
  /** element field name → number of elements carrying a value */
  fieldCounts: Record<string, number>;
}

interface RungDraft {
  index: LadderRungIndex;
  title: string;
  provides: string;
  math: string;
  reached: boolean;
  facts: LadderFact[];
  warnings: string[];
  next: string;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  // No prototype: keys such as "constructor" or "__proto__" are ordinary names and types here.
  const counts: Record<string, number> = Object.create(null);
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

/** A count as shown in a text: 10,000 — the same on every machine. */
function shown(n: number): string {
  return n.toLocaleString('en-US');
}

/** "1 name is" / "3 names are" / "1,200 names are": the noun and its verb in the form the count asks for. */
function counted(count: number, one: string, many: string): string {
  return `${shown(count)} ${count === 1 ? one : many}`;
}

/** "a", "a and b", "a, b, and c" */
function listed(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** At most this many skipped quantities are named in the warning; the rest are counted. */
const NAMED_SKIPPED_QUANTITIES = 5;

/**
 * The limit that left a quantity out. Only the first reason is about the quantity itself, and it
 * gives the number the quantity has. A face is a triangle of conversion factors — three groups
 * with eight conversion factors on each side have 512 — so that limit does not count groups.
 */
function whySkipped(q: SkippedQuantity): string {
  if (q.reason === 'translations') return `${shown(q.translations)} conversion factors`;
  if (q.reason === 'faces') return `more than ${shown(MAX_FACES_PER_QUANTITY)} sets of three conversion factors`;
  if (q.reason === 'members') return `more than ${shown(MAX_COMPARED_MEMBERS)} members to compare`;
  return `more than ${shown(MAX_TRANSLATIONS_PER_REPORT)} conversion factors in all quantities`;
}

/** Four sentences: how many quantities are left out, the two limits, and which quantities with their reason. */
function skippedWarning(skipped: SkippedQuantity[]): string {
  const named = skipped.slice(0, NAMED_SKIPPED_QUANTITIES).map((q) => `"${q.quantity}" (${whySkipped(q)})`);
  if (skipped.length > named.length) named.push(`${shown(skipped.length - named.length)} more`);
  const one = skipped.length === 1;
  return [
    `The check does not include ${counted(skipped.length, 'quantity', 'quantities')}.`,
    `The limits for each quantity are ${shown(MAX_TRANSLATIONS_PER_QUANTITY)} conversion factors and ${shown(MAX_FACES_PER_QUANTITY)} sets of three conversion factors.`,
    `The limit for all quantities together is ${shown(MAX_TRANSLATIONS_PER_REPORT)} conversion factors.`,
    `${one ? 'This quantity is' : 'These quantities are'} ${listed(named)}.`,
  ].join(' ');
}

/** What rung 4 asks for. If the check left quantities out, fewer conversion factors come first. */
function nextForClosedPath(skippedQuantities: number): string {
  if (skippedQuantities === 0) {
    return 'Add conversion factors until two different paths connect the same two groups. Example: A to B, B to C, and A to C.';
  }
  return 'Decrease the number of conversion factors in the model. Or add conversion factors of a different quantity until two different paths connect the same two groups.';
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/**
 * The number of names — trimmed, case ignored — that more than one element carries: three
 * elements named "Same" are one such name. Elements without a name share no name.
 */
function duplicateNameCount(elements: ModelElement[]): number {
  const names = countBy(elements, (e) => (e.name ?? '').trim().toLowerCase());
  return Object.entries(names).filter(([name, n]) => name !== '' && n > 1).length;
}

/** What a reported loop needs to name its steps: built once per report, not once per loop. */
export interface LoopLabels {
  relationById: Map<string, ModelRelationship>;
  nameById: Map<string, string>;
}

export function loopLabels(structure: Pick<ContextStructure, 'contexts' | 'translations'>): LoopLabels {
  return {
    relationById: new Map(structure.translations.map((t) => [t.id, t])),
    nameById: new Map(structure.contexts.map((c) => [c.id, c.name])),
  };
}

/**
 * A log value as the factor shown in the report. A long loop or chain can leave the range of a
 * double although every single factor is within its bounds (27 steps of 1e12): exp then gives
 * Infinity or 0, which is no factor — and Infinity does not survive JSON. null says so.
 */
function reportedFactor(value: number): number | null {
  const factor = additiveToFactor(value);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

function describeLoop(loop: OrientedStep[], { relationById, nameById }: LoopLabels, value: number): TranslationLoopDefect {
  const steps: TranslationStep[] = loop.map((step) => {
    const rel = relationById.get(step.edgeId)!;
    const forward = step.sign === 1;
    return {
      relationshipId: rel.id,
      fromContext: nameById.get(forward ? rel.sourceId : rel.targetId) ?? '',
      toContext: nameById.get(forward ? rel.targetId : rel.sourceId) ?? '',
      factor: rel.translationFactor as number,
      direction: forward ? 'forward' : 'reverse',
    };
  });
  return { steps, product: reportedFactor(value) };
}

export function cohomologyOf(q: QuantityComplex, labels: LoopLabels): CohomologyResult {
  const group = reals(LOOP_TOLERANCE);
  const result = classifyOneCochain(q.complex, group, q.cochain);
  const facesById = new Map(q.complex.faces.map((f) => [f.id, f]));
  const { nameById } = labels;
  // The potential is only fixed up to one constant per connected group of contexts.
  // Normalise so that the smallest scale in each group is 1 — independent of ids and of the root.
  // Groups are numbered by their smallest context name and the entries sorted by group, scale
  // and name, so the list reads the same whatever the ids are.
  let canonicalScale: CanonicalScale[] | null = null;
  if (result.verdict === 'exact') {
    const component = componentIndex(spanningForest(q.complex));
    const lowest = new Map<number, number>();
    const first = new Map<number, { name: string; id: string }>();
    for (const id of q.complex.vertices) {
      const c = component.get(id)!;
      lowest.set(c, Math.min(lowest.get(c) ?? Number.POSITIVE_INFINITY, result.potential.get(id) ?? 0));
      const name = nameById.get(id) ?? '';
      const known = first.get(c);
      if (!known || compareText(name, known.name) < 0 || (name === known.name && compareText(id, known.id) < 0)) first.set(c, { name, id });
    }
    const number = new Map(
      [...first.entries()]
        .sort(([, a], [, b]) => compareText(a.name, b.name) || compareText(a.id, b.id))
        .map(([c], i) => [c, i + 1]),
    );
    canonicalScale = q.complex.vertices
      .map((id) => {
        const c = component.get(id)!;
        const offset = (result.potential.get(id) ?? 0) - lowest.get(c)!;
        return {
          entry: { contextId: id, contextName: nameById.get(id) ?? '', factor: reportedFactor(offset), component: number.get(c)! },
          // Ordering key in steps of the tolerance: log(0.1) + log(10) is 4.4e-16, not 0, and such
          // rounding must not decide the order of two scales that are both 1.
          step: Math.round(offset / LOOP_TOLERANCE),
        };
      })
      .sort(
        (a, b) =>
          a.entry.component - b.entry.component ||
          a.step - b.step ||
          compareText(a.entry.contextName, b.entry.contextName) ||
          compareText(a.entry.contextId, b.entry.contextId),
      )
      .map((s) => s.entry);
  }
  return {
    quantity: q.quantity,
    verdict: result.verdict,
    contextCount: q.complex.vertices.length,
    translationCount: q.complex.edges.length,
    independentLoops: graphBetti(q.complex).b1,
    faces: q.complex.faces.length,
    h1Dimension: bettiNumbers(q.complex).b1,
    // Only the listed defects are described: a loop can be as long as the quantity has contexts.
    loopDefects: result.loopDefects.slice(0, MAX_REPORTED_DEFECTS_PER_QUANTITY).map((d) => describeLoop(d.loop, labels, d.value)),
    loopDefectCount: result.loopDefects.length,
    faceDefects: result.faceDefects
      .slice(0, MAX_REPORTED_DEFECTS_PER_QUANTITY)
      .map((d) => describeLoop(facesById.get(d.faceId)!.boundary, labels, d.value)),
    faceDefectCount: result.faceDefects.length,
    canonicalScale,
  };
}

export function assessLadder(projectId: string, input: LadderInput, now: Date = new Date()): LadderReport {
  const elements = uniqueById(input.elements);
  const elementIds = new Set(elements.map((e) => e.id));
  const allRelationships = uniqueById(input.relationships);
  const relationships = allRelationships.filter((r) => elementIds.has(r.sourceId) && elementIds.has(r.targetId));
  const dangling = allRelationships.length - relationships.length;
  const selfLoops = relationships.filter((r) => r.sourceId === r.targetId).length;

  const graph = buildComplex(
    elements.map((e) => e.id),
    relationships.map((r) => ({ id: r.id, source: r.sourceId, target: r.targetId })),
  );
  const betti = graphBetti(graph);
  const structure = buildContextStructure(elements, relationships);
  const duplicates = duplicateNameCount(elements);
  const toCheck = (q: QuantityComplex) => graphBetti(q.complex).b1 + q.complex.faces.length;
  // Only a quantity whose translations close a loop or meet on a triple overlap can be tested.
  // A lone translation is consistent by default; reporting it as "exact" would be vacuous.
  const testable = structure.quantities.filter((q) => toCheck(q) > 0);
  const loopsAndFaces = testable.reduce((sum, q) => sum + toCheck(q), 0);
  const skipped = structure.skippedQuantities;

  const drafts: RungDraft[] = [
    {
      index: 0,
      title: 'Elements',
      provides: 'Each element is one item in the model.',
      math: 'Identity. Every thing exists exactly once — the 0-cells are well defined.',
      reached: elements.length > 0,
      facts: [
        { label: 'elements', value: elements.length },
        { label: 'names used more than one time', value: duplicates },
      ],
      warnings:
        duplicates > 0
          ? [`${counted(duplicates, 'name is', 'names are')} on more than one element. Give each element a different name.`]
          : [],
      next: 'Add elements to the model.',
    },
    {
      index: 1,
      title: 'Relationships',
      provides: 'A relationship connects two elements and has a direction.',
      math: 'Directed graph. Oriented relationships: the chain complex C₁ → C₀ with boundary ∂. connected components (b0) = parts of the model, independent loops (b1) = closed paths between elements.',
      reached: relationships.length > 0,
      facts: [
        { label: 'relationships', value: relationships.length },
        { label: 'parts of the model', value: betti.b0 },
        { label: 'closed paths between elements', value: betti.b1 },
        { label: 'relationships that connect an element to the same element', value: selfLoops },
      ],
      warnings:
        dangling === 0
          ? []
          : [
              dangling === 1
                ? '1 relationship connects to an element that is not in the model. The check does not use this relationship.'
                : `${shown(dangling)} relationships connect to elements that are not in the model. The check does not use these relationships.`,
            ],
      next: 'Connect the elements with relationships.',
    },
    {
      index: LADDER_GROUPS_RUNG,
      title: 'Groups',
      provides: 'A group is a Grouping element or a Location element with its members. Two groups can have the same member.',
      math: 'Cover. Contexts with members: named areas of the model. Shared members are overlaps; three contexts sharing a member form a 2-cell.',
      reached: structure.analysed && structure.contextsWithMembers >= 2,
      facts: structure.analysed
        ? [
            { label: 'groups', value: structure.contexts.length },
            { label: LADDER_FACT_GROUPS_WITH_MEMBERS, value: structure.contextsWithMembers },
            { label: 'pairs of groups with the same member', value: structure.overlappingPairs.length },
            { label: 'sets of three groups with the same member', value: structure.tripleOverlaps.length },
          ]
        : [{ label: 'groups', value: structure.contexts.length }],
      warnings: structure.tripleOverlapsCapped
        ? [`The model has a minimum of ${shown(structure.tripleOverlaps.length)} sets of three groups with the same member. The software stopped at this number.`]
        : [],
      next: structure.analysed
        ? 'Make a minimum of two groups. Add a Grouping element for each group. Then connect each Grouping element to its members with a Composition relationship.'
        : `The model has ${shown(structure.contexts.length)} groups. The check uses a maximum of ${shown(MAX_CONTEXTS)} groups. Remove Grouping elements or Location elements until the model has a maximum of ${shown(MAX_CONTEXTS)} groups.`,
    },
    {
      index: 3,
      title: 'Conversion factors',
      provides:
        'A conversion factor is a number on a relationship between two groups. It shows how a quantity changes from one group to the other group. Example: The relationship from group A to group B has the conversion factor 10. Then 1 unit in group A is equal to 10 units in group B.',
      math: 'Coefficients. Values in an abelian group: translation factors between contexts, (ℝ>0, ·) ≅ (ℝ, +).',
      reached: structure.translations.length > 0,
      facts: [
        { label: 'conversion factors', value: structure.translations.length },
        { label: 'quantities', value: structure.quantities.length + skipped.length },
        { label: 'conversion factors that the check cannot use', value: structure.invalidTranslations.length },
      ],
      warnings:
        structure.invalidTranslations.length > 0
          ? [`${counted(structure.invalidTranslations.length, 'relationship has', 'relationships have')} a conversion factor that the check cannot use. A conversion factor must be between two different groups that have members. It cannot be on a Composition relationship or an Aggregation relationship. It must be a number between ${FACTOR_RANGE}.`]
          : [],
      next: 'Connect two groups with an Association relationship. Then give a conversion factor to the relationship. At this time, you can give the conversion factor only with the API.',
    },
    {
      index: 4,
      title: 'Closed paths',
      provides: 'A closed path starts and stops at the same group. The check is possible only along a closed path.',
      math: 'Gluing testable. The translations close loops or meet on triple overlaps, so the cocycle condition can be tested.',
      reached: loopsAndFaces > 0,
      facts: [
        { label: 'closed paths and sets of three groups to examine', value: loopsAndFaces },
        { label: 'quantities without a closed path', value: structure.quantities.length - testable.length },
        { label: 'pairs of groups without a conversion factor', value: structure.overlapsWithoutTranslation.length },
      ],
      warnings: [
        ...(skipped.length > 0 ? [skippedWarning(skipped)] : []),
        ...(structure.overlapsWithoutTranslation.length > 0
          ? [`${counted(structure.overlapsWithoutTranslation.length, 'pair of groups has', 'pairs of groups have')} the same member but no conversion factor.`]
          : []),
      ],
      next: nextForClosedPath(skipped.length),
    },
  ];

  const lowerReached = drafts.every((d) => d.reached);
  let cohomology: CohomologyResult[] = [];
  if (lowerReached) {
    const labels = loopLabels(structure);
    cohomology = testable.map((q) => cohomologyOf(q, labels));
  }
  drafts.push({
    index: 5,
    title: 'Result',
    provides: 'The software multiplies the conversion factors along each closed path. The result must be 1.',
    math: 'Cohomology. The class of the translations in H¹: zero means one consistent scale per context exists.',
    reached: lowerReached,
    facts: [
      { label: 'quantities examined', value: cohomology.length },
      { label: 'quantities that agree', value: cohomology.filter((c) => c.verdict === 'exact').length },
      { label: 'quantities that do not agree at a member', value: cohomology.filter((c) => c.verdict === 'local_defect').length },
      { label: 'quantities that do not agree along a closed path', value: cohomology.filter((c) => c.verdict === 'global_obstruction').length },
    ],
    warnings: [],
    next: 'Do steps 0 thru 4 first.',
  });

  let blocked = false;
  let highestRung: LadderRungIndex | null = null;
  const rungs: LadderRung[] = drafts.map((d) => {
    const status = blocked ? 'locked' : d.reached ? 'reached' : 'open';
    if (status === 'reached') highestRung = d.index;
    else blocked = true;
    return {
      index: d.index,
      title: d.title,
      provides: d.provides,
      math: d.math,
      status,
      facts: d.facts,
      warnings: d.warnings,
      next: status === 'reached' ? null : d.next,
    };
  });

  const facts: ModelFacts = {
    elementTypeCounts: countBy(elements, (e) => e.type),
    relationshipTypeCounts: countBy(relationships, (r) => r.type),
    fieldCounts: input.fieldCounts,
    translationCount: structure.translations.length,
  };

  return {
    projectId,
    highestRung,
    rungs,
    cohomology,
    tolerance: LOOP_TOLERANCE,
    cohomologyMethod: toMethodRef(LOOP_CHECK_METHOD_ID),
    methods: assessApplicability(facts, highestRung),
    changeRings: assessChangeRings(elements, relationships),
    timestamp: now.toISOString(),
  };
}
