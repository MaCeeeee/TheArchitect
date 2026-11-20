/**
 * The words of the ladder texts (UC-METH-001), written in ASD-STE100 Simplified Technical English.
 *
 * These words were checked against ASD-STE100 Issue 9 with `scripts/ste100-check.py`. Add a word
 * only after checking it against the specification: it must be an approved word of the
 * dictionary, in the approved part of speech and with the approved meaning — or a technical noun
 * of this product (rules 1.5–1.11). The guard tests (topologyLadderText.test.ts,
 * ladderText.test.ts) fail on every word that is not listed here.
 *
 * Not exported from the package index: only the guard tests read it, by path.
 */

/** Approved dictionary words in the forms the texts use, lower case. */
export const STE100_WORDS_IN_USE: readonly string[] = [
  'a', 'add', 'agree', 'all', 'along', 'an', 'and', 'are', 'at', 'be', 'because', 'between', 'but',
  'calculate', 'can', 'cannot', 'changes', 'check', 'compare', 'connect', 'connected', 'connects', 'counts',
  'decrease', 'different', 'direction', 'do', 'does', 'each', 'equal', 'examine', 'examined', 'example',
  'first', 'for', 'from', 'give', 'group', 'groups', 'has', 'have', 'how', 'in', 'include', 'is', 'it',
  'item', 'its', 'large', 'limit', 'limits', 'make', 'many', 'maximum', 'minimum', 'more', 'multiplies',
  'must', 'name', 'names', 'necessary', 'next', 'no', 'not', 'number', 'of', 'on', 'one', 'only', 'or',
  'other', 'pair', 'pairs', 'parts', 'possible', 'quantities', 'quantity', 'remove', 'result', 'same', 'set',
  'sets', 'show', 'shows', 'small', 'started', 'starts', 'step', 'steps', 'stops', 'than', 'that', 'the',
  'their', 'then', 'these', 'they', 'this', 'three', 'thru', 'time', 'to', 'together', 'too', 'two', 'unit',
  'units', 'until', 'use', 'used', 'uses', 'which', 'with', 'without',
];

/**
 * Technical nouns of the product (rule 1.5): one term per thing, never a second word for it.
 * An entry of two words counts only as the pair — "closed" alone is not a checked word.
 */
export const STE100_TECHNICAL_NOUNS: readonly string[] = [
  'Aggregation', 'closed path', 'closed paths', 'Composition', 'conversion factor', 'conversion factors',
  'element', 'elements', 'Grouping', 'input', 'Location', 'math', 'member', 'members', 'method', 'methods',
  'model', 'path', 'paths', 'relationship', 'relationships', 'scale', 'software',
];
