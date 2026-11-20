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
 * a quantity too large to classify, a count that stops — the rung concerned says so.
 */
import { toMethodRef } from '@thearchitect/shared';
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
  MAX_CHECKED_TRIPLE_CANDIDATES,
  MAX_COMPARED_MEMBERS,
  MAX_CONTEXTS,
  MAX_COUNTED_TRIPLE_OVERLAPS,
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

/** At most this many skipped quantities are named in the warning; the rest are counted. */
const NAMED_SKIPPED_QUANTITIES = 5;

function whySkipped(q: SkippedQuantity): string {
  if (q.reason === 'translations') return `${shown(q.translations)} translations`;
  if (q.reason === 'faces') return `more than ${shown(MAX_FACES_PER_QUANTITY)} faces`;
  if (q.reason === 'members') return `more than ${shown(MAX_COMPARED_MEMBERS)} members to compare`;
  return `beyond ${shown(MAX_TRANSLATIONS_PER_REPORT)} translations in total`;
}

function skippedWarning(skipped: SkippedQuantity[]): string {
  const named = skipped.slice(0, NAMED_SKIPPED_QUANTITIES).map((q) => `"${q.quantity}" (${whySkipped(q)})`);
  if (skipped.length > named.length) named.push(`and ${shown(skipped.length - named.length)} more`);
  const count = skipped.length === 1 ? '1 quantity is' : `${shown(skipped.length)} quantities are`;
  return `${count} not checked — a quantity is checked up to ${shown(MAX_TRANSLATIONS_PER_QUANTITY)} translations and ${shown(MAX_FACES_PER_QUANTITY)} faces, all quantities together up to ${shown(MAX_TRANSLATIONS_PER_REPORT)} translations: ${named.join(', ')}.`;
}

/** What rung 4 asks for. If quantities were skipped for their size, that is said first. */
function nextForGluing(skippedQuantities: number): string {
  const how = ': two different paths between the same contexts (for example A→B, B→C and A→C).';
  if (skippedQuantities === 0) return `Declare translations that close a loop${how}`;
  const tooLarge =
    skippedQuantities === 1
      ? 'The quantity named in the warning is too large to check. Bring it within the limits'
      : 'The quantities named in the warning are too large to check. Bring one within the limits';
  return `${tooLarge}, or declare translations of another quantity that close a loop${how}`;
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
      title: 'Identity',
      provides: 'Every thing exists exactly once — the 0-cells are well defined.',
      reached: elements.length > 0,
      facts: [
        { label: 'elements', value: elements.length },
        { label: 'duplicate names', value: duplicates },
      ],
      warnings:
        duplicates > 0
          ? [`${duplicates} element name(s) occur more than once — duplicates create artificial holes and false contradictions.`]
          : [],
      next: 'Add elements to the model.',
    },
    {
      index: 1,
      title: 'Directed graph',
      provides: 'Oriented relationships: the chain complex C₁ → C₀ with boundary ∂.',
      reached: relationships.length > 0,
      facts: [
        { label: 'relationships', value: relationships.length },
        { label: 'connected components (b0)', value: betti.b0 },
        { label: 'independent loops (b1)', value: betti.b1 },
        { label: 'self-loops', value: selfLoops },
      ],
      warnings: dangling > 0 ? [`${dangling} relationship(s) point to elements that do not exist and were ignored.`] : [],
      next: 'Connect elements with directed relationships.',
    },
    {
      index: 2,
      title: 'Cover',
      provides: 'Contexts with members: named areas of the model. Shared members are overlaps; three contexts sharing a member form a 2-cell.',
      reached: structure.analysed && structure.contextsWithMembers >= 2,
      facts: structure.analysed
        ? [
            { label: 'contexts', value: structure.contexts.length },
            { label: 'contexts with members', value: structure.contextsWithMembers },
            { label: 'overlapping context pairs', value: structure.overlappingPairs.length },
            { label: 'triple overlaps', value: structure.tripleOverlaps.length },
          ]
        : [{ label: 'contexts', value: structure.contexts.length }],
      warnings: structure.tripleOverlapsCapped
        ? [`At least ${shown(structure.tripleOverlaps.length)} triple overlaps: counting stops at ${shown(MAX_COUNTED_TRIPLE_OVERLAPS)} triples or after ${shown(MAX_CHECKED_TRIPLE_CANDIDATES)} candidates, so the number shown is a lower bound.`]
        : [],
      next: structure.analysed
        ? 'Model at least 2 contexts: grouping or location elements with composition or aggregation relationships to their members.'
        : `The model has ${shown(structure.contexts.length)} contexts; the cover is analysed for at most ${shown(MAX_CONTEXTS)}. Reduce the grouping and location elements to ${shown(MAX_CONTEXTS)} or fewer.`,
    },
    {
      index: 3,
      title: 'Coefficients',
      provides: 'Values in an abelian group: translation factors between contexts, (ℝ>0, ·) ≅ (ℝ, +).',
      reached: structure.translations.length > 0,
      facts: [
        { label: 'declared translations', value: structure.translations.length },
        { label: 'quantities', value: structure.quantities.length + skipped.length },
        { label: 'unusable translations', value: structure.invalidTranslations.length },
      ],
      warnings:
        structure.invalidTranslations.length > 0
          ? [`${structure.invalidTranslations.length} relationship(s) carry a factor but are not usable: both ends must be contexts with members and not the same context, the relationship must not be a composition or aggregation, and the factor must be a finite number between ${FACTOR_RANGE}.`]
          : [],
      next: 'Declare a translation between two contexts: a relationship between them (for example an association) with a factor (1 unit in the source = factor units in the target).',
    },
    {
      index: 4,
      title: 'Gluing testable',
      provides: 'The translations close loops or meet on triple overlaps, so the cocycle condition can be tested.',
      reached: loopsAndFaces > 0,
      facts: [
        { label: 'loops and faces to check', value: loopsAndFaces },
        { label: 'quantities without a loop', value: structure.quantities.length - testable.length },
        { label: 'overlaps without translation', value: structure.overlapsWithoutTranslation.length },
      ],
      warnings: [
        ...(skipped.length > 0 ? [skippedWarning(skipped)] : []),
        ...(structure.overlapsWithoutTranslation.length > 0
          ? [`${structure.overlapsWithoutTranslation.length} overlapping context pair(s) have no declared translation.`]
          : []),
      ],
      next: nextForGluing(skipped.length),
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
    title: 'Cohomology',
    provides: 'The class of the translations in H¹: zero means one consistent scale per context exists.',
    reached: lowerReached,
    facts: [
      { label: 'quantities checked', value: cohomology.length },
      { label: 'consistent (exact)', value: cohomology.filter((c) => c.verdict === 'exact').length },
      { label: 'with local defects', value: cohomology.filter((c) => c.verdict === 'local_defect').length },
      { label: 'with global obstruction', value: cohomology.filter((c) => c.verdict === 'global_obstruction').length },
    ],
    warnings: [],
    next: 'Reach rungs 0 to 4 first.',
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
    timestamp: now.toISOString(),
  };
}
