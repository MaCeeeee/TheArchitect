/**
 * UC-METH-001 — every text of LadderPanel and CohomologyFinding that does not come from the report.
 *
 * LADDER_TEXT is written in ASD-STE100 (Simplified Technical English): a context is a "group",
 * a translation a "conversion factor", a loop a "closed path", a rung a "step". ladderText.test.ts
 * checks every text against the checked word list; a new text needs a checked wording.
 *
 * LADDER_MATH_TEXT is the mathematical wording. It is shown only behind the Math button and is
 * not checked.
 */

/** "1 group" / "3 groups" */
function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const TOO_LARGE_OR_SMALL = 'too large or too small to show';

export const LADDER_TEXT = {
  headline: (step: number) => `Model check: step ${step} of 5`,
  headlineNotStarted: 'Model check: not started',
  nextStep: (next: string) => `Next step: ${next}`,
  /**
   * `withInput`: the methods whose inputs are in the model and whose step is reached. The software
   * calculates only some of them, so the text does not say "can calculate".
   */
  methodSummary: (withInput: number, all: number) => `The model has the input for ${withInput} of ${all} methods.`,
  oneMoreInputHeading: 'Methods for which one more input is necessary',
  /**
   * `method` and `input` come from the report (applicability of the method). The name of a method,
   * of an element type and of a field is a technical name of the method catalogue.
   */
  oneMoreInput: (method: string, input: string) => `${method} — necessary: ${input}`,
  mathButton: 'Math',
  /** Accessible names of the Math buttons: the visible text "Math" is the same on each of them. */
  mathOfStep: (step: number) => `Math of step ${step}`,
  mathOfQuantity: 'Math of this quantity',

  quantity: (name: string) => `quantity: ${name}`,
  exactTitle: 'The conversion factors agree',
  exactText: 'All conversion factors agree. Each group has one scale.',
  localTitle: 'The conversion factors do not agree at a member',
  localText: 'These groups have the same member. But their conversion factors do not agree.',
  globalTitle: 'The conversion factors do not agree along a closed path',
  globalText: 'Each conversion factor is possible. But the result along the closed path is not 1.',
  /** Only when the quantity has members to compare at: then the check at each member passed. */
  globalTextMembersAgree: 'The conversion factors agree at each member. But the result along the closed path is not 1.',

  summary: (groups: number, conversionFactors: number, closedPaths: number) =>
    [
      counted(groups, 'group', 'groups'),
      counted(conversionFactors, 'conversion factor', 'conversion factors'),
      counted(closedPaths, 'closed path', 'closed paths'),
    ].join(' · '),
  /** After the steps of a closed path. null: the result is outside the range of a number. */
  result: (shown: string | null) => `result ${shown ?? TOO_LARGE_OR_SMALL}, must be 1`,
  scale: (entries: string) => `Scale of each group: ${entries}`,
  scaleEntry: (group: string, shown: string | null) => (shown === null ? `${group} (${TOO_LARGE_OR_SMALL})` : `${group} ×${shown}`),
  /**
   * What the report counts but does not list. At least one of the two counts is above 0. The
   * first count is of triangles of conversion factors: three groups can have more than one.
   */
  more: (setsOfThreeConversionFactors: number, closedPaths: number) =>
    `and ${[
      ...(setsOfThreeConversionFactors > 0 ? [`${counted(setsOfThreeConversionFactors, 'more set', 'more sets')} of three conversion factors`] : []),
      ...(closedPaths > 0 ? [counted(closedPaths, 'more closed path', 'more closed paths')] : []),
    ].join(' and ')}`,
  tolerance: (lower: string, upper: string) => `A result between ${lower} and ${upper} is equal to 1.`,
};

export const LADDER_MATH_TEXT = {
  summary: (contexts: number, translations: number, independentLoops: number, tripleOverlaps: number, h1Dimension: number) =>
    [
      counted(contexts, 'context', 'contexts'),
      counted(translations, 'translation', 'translations'),
      counted(independentLoops, 'independent loop', 'independent loops'),
      counted(tripleOverlaps, 'triple overlap', 'triple overlaps'),
      `dim H¹ = ${h1Dimension}`,
    ].join(' · '),
  method: (id: string) => `Method · ${id}`,
  limits: (limits: string) => `Limits: ${limits}`,
};
