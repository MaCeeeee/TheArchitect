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
  methodSummary: (calculable: number, all: number) => `The software can calculate ${calculable} of ${all} methods.`,
  oneMoreInputHeading: 'Methods for which one more input is necessary',
  /** `input` comes from the report (applicability of the method). */
  oneMoreInput: (method: string, input: string) => `${method} — necessary: ${input}`,
  mathButton: 'Math',

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
  /** What the report counts but does not list. At least one of the two counts is above 0. */
  more: (setsOfThreeGroups: number, closedPaths: number) =>
    `and ${[
      ...(setsOfThreeGroups > 0 ? [`${counted(setsOfThreeGroups, 'more set', 'more sets')} of three groups`] : []),
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
