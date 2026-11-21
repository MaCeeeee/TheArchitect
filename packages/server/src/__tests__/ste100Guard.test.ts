/**
 * UC-METH-001 — the guard for the ladder texts (shared/src/constants/ste100-guard.ts), tested itself.
 *
 * topologyLadderText.test.ts and the client's ladderText.test.ts run the guard on the real texts.
 * This file gives the guard texts that must fail: a guard that lets them pass protects nothing.
 * Run: cd packages/server && npx jest src/__tests__/ste100Guard.test.ts
 */
import { ste100Findings } from '@thearchitect/shared/src/constants/ste100-guard';

const description = (text: string, names?: string[]) => ste100Findings(text, 'description', names);
const instruction = (text: string, names?: string[]) => ste100Findings(text, 'instruction', names);
const inSentence = (sentence: string) => `— in: "${sentence}"`;

describe('what the guard accepts', () => {
  test.each([
    'Add elements to the model.',
    'A conversion factor is a number on a relationship between two groups.',
    'Example: The relationship from group A to group B has the conversion factor 10.',
    'Add conversion factors until two different paths connect the same two groups. Example: A to B, B to C, and A to C.',
    'It must be a number between 1e-12 and 1e12.',
    'Model check: step 2 of 5',
    'step 5 of the model check',
    '3 groups · 3 conversion factors · 1 closed path',
  ])('%s', (text) => {
    expect(description(text)).toEqual([]);
  });

  test('a number, text in parentheses and a name that the test gives count as one word each', () => {
    const long = `Add ${Array.from({ length: 10 }, () => 'elements and').join(' ')} elements.`; // 22 words
    expect(instruction(long)).toEqual([`22 words, the limit for an instruction is 20 ${inSentence(long)}`]);
    expect(description(long)).toEqual([]);
    expect(instruction(`Add 1,000 elements (${long}) to the model "${long}".`, [`"${long}"`])).toEqual([]);
  });

  test('a name that the test gives is not examined word for word, with or without quotation marks', () => {
    expect(description('This quantity is "bulk hours" (501 conversion factors).', ['"bulk hours"'])).toEqual([]);
    expect(description('TE → Logistik ×12 · Logistik → TE ÷12 — result 1.2, must be 1', ['TE', 'Logistik'])).toEqual([]);
    expect(description('Scale of each group: Zürich_Nord ×1 · TE ×10', ['Zürich_Nord', 'TE'])).toEqual([]);
    // only the whole name: "TE" does not make "TEST" a name
    expect(description('The result is TEST.', ['TE'])).toEqual([`"test" is not a checked STE100 word ${inSentence('The result is TEST.')}`]);
  });
});

describe('what the guard finds', () => {
  test('a word that is not on the list, with its sentence', () => {
    expect(instruction('Insert elements to the model.')).toEqual([
      `"insert" is not a checked STE100 word ${inSentence('Insert elements to the model.')}`,
    ]);
    expect(description('Add elements. The check is good. Add groups.')).toEqual([
      `"good" is not a checked STE100 word ${inSentence('The check is good.')}`,
    ]);
  });

  test('no suffix is removed: only the listed form of a word passes', () => {
    expect(description('The check agrees.')).toEqual([`"agrees" is not a checked STE100 word ${inSentence('The check agrees.')}`]);
    expect(description('The software is connecting the groups.')).toEqual([
      `"connecting" is not a checked STE100 word ${inSentence('The software is connecting the groups.')}`,
    ]);
    // half of a technical noun of two words is not a word
    expect(description('The path is closed.')).toEqual([`"closed" is not a checked STE100 word ${inSentence('The path is closed.')}`]);
  });

  test('a term that the plain texts replaced: with a capital letter, inside a longer word, in parentheses', () => {
    const banned = (stem: string, sentence: string) => `"${stem}" is a term the plain texts do not use ${inSentence(sentence)}`;
    expect(description('Loop 1 is large.')).toContain(banned('loop', 'Loop 1 is large.'));
    expect(description('The CONTEXTS are large.')).toContain(banned('context', 'The CONTEXTS are large.'));
    expect(description('Use the closedloop.')).toContain(banned('loop', 'Use the closedloop.'));
    expect(description('The quantity (a loop of contexts) is large.')).toEqual([
      `"loop" is not a checked STE100 word ${inSentence('The quantity (a loop of contexts) is large.')}`,
      `"contexts" is not a checked STE100 word ${inSentence('The quantity (a loop of contexts) is large.')}`,
      banned('context', 'The quantity (a loop of contexts) is large.'),
      banned('loop', 'The quantity (a loop of contexts) is large.'),
    ]);
  });

  test('a term that the plain texts replaced inside quotation marks', () => {
    const uses = 'The check uses the "loop" of the model.';
    expect(description(uses)).toEqual([
      `"loop" is not a checked STE100 word ${inSentence(uses)}`,
      `"loop" is a term the plain texts do not use ${inSentence(uses)}`,
    ]);
    const first = 'Do the "gluing test of the cocycle" first.';
    expect(instruction(first)).toEqual([
      `"gluing" is not a checked STE100 word ${inSentence(first)}`,
      `"test" is not a checked STE100 word ${inSentence(first)}`,
      `"cocycle" is not a checked STE100 word ${inSentence(first)}`,
      `"cocycle" is a term the plain texts do not use ${inSentence(first)}`,
      `"gluing" is a term the plain texts do not use ${inSentence(first)}`,
    ]);
    // A name that the test gives is not examined word for word. The replaced terms are still found in it.
    expect(description(uses, ['"loop"'])).toEqual([`"loop" is a term the plain texts do not use ${inSentence(uses)}`]);
  });

  test('quotation marks do not hide words and do not make a long sentence short', () => {
    expect(description('This quantity is "bulk".')).toEqual([`"bulk" is not a checked STE100 word ${inSentence('This quantity is "bulk".')}`]);
    const long = `Add "${Array.from({ length: 10 }, () => 'elements and').join(' ')} elements" to the model.`; // 25 words
    expect(instruction(long)).toEqual([`25 words, the limit for an instruction is 20 ${inSentence(long)}`]);
  });

  test.each([
    ['The result is in H¹.', 'H¹.'],
    ['The result is C₁ → C₀ with ∂.', 'C₁'],
    ['The result is C₁ → C₀ with ∂.', 'C₀'],
    ['The result is C₁ → C₀ with ∂.', '∂.'],
    ['The number is in (ℝ>0, ·) ≅ (ℝ, +).', '(ℝ>0,'],
    ['The number is in (ℝ>0, ·) ≅ (ℝ, +).', '≅'],
    ['The number is in (ℝ>0, ·) ≅ (ℝ, +).', '(ℝ,'],
    ['The number is in (ℝ>0, ·) ≅ (ℝ, +).', '+).'],
    ['λ is large.', 'λ'],
    ['Эта model is large.', 'Эта'],
    ['Тhe model is large.', 'Тhe'], // the first letter is Cyrillic
    ['The model has {count} groups.', '{count}'],
    ['The result is b1 = 3.', '='],
    ['The model is large!', 'large!'],
    ['The model has 5 groups – no more.', '–'],
    ['The model is “large”.', '“large”.'],
  ])('a letter or sign that the texts do not use: %s → %s', (text, token) => {
    expect(description(text)).toContain(`"${token}" has a letter or sign that the plain texts do not use ${inSentence(text)}`);
  });

  test('every sentence above with such a letter or sign fails, whatever else the guard says about it', () => {
    for (const text of ['The result is in H¹.', 'The result is C₁ → C₀ with ∂.', 'The number is in (ℝ>0, ·) ≅ (ℝ, +).', 'λ is large.', 'Эта model is large.']) {
      expect(description(text)).not.toEqual([]);
    }
    // the separators of the texts are not such signs
    expect(description('A → B ×10 · B → A ÷10 — result 1, must be 1 (1e-12): "A"', ['A', 'B'])).toEqual([]);
  });

  test('a colon does not end a sentence: the words after it count', () => {
    const chained = `Add ${Array.from({ length: 17 }, () => 'elements: add').join(' ')} elements.`;
    expect(chained.split(/\s+/)).toHaveLength(36);
    expect(instruction(chained)).toEqual([`36 words, the limit for an instruction is 20 ${inSentence(chained)}`]);
    expect(description(chained)).toEqual([`36 words, the limit for a description is 25 ${inSentence(chained)}`]);
  });

  test('a text without words', () => {
    expect(description('')).toEqual(['empty text']);
    expect(instruction('  \n ')).toEqual(['empty text']);
  });

  test('one capital letter is a name only in "A to B" and in "group A"', () => {
    const alone = (letter: string, sentence: string) => `"${letter}" is one letter and not a name as in "A to B" or "group A" ${inSentence(sentence)}`;
    expect(description('Connect X with the model.')).toEqual([alone('X', 'Connect X with the model.')]);
    expect(description('The result is in H.')).toEqual([alone('H', 'The result is in H.')]);
    expect(description('The number is in R.')).toEqual([alone('R', 'The number is in R.')]);
    expect(description('X')).toEqual([alone('X', 'X')]);
    expect(description('Connect B to the model.')).toEqual([alone('B', 'Connect B to the model.')]);
    expect(description('Connect group X to group Y. Example: X to Y, Y to Z, and X to Z.')).toEqual([]);
  });

  test('a semicolon', () => {
    const sentence = 'The check does not use the model; it is large.';
    expect(description(sentence)).toEqual([`semicolon ${inSentence(sentence)}`]);
  });

  test('a contraction, with a straight and with a curly apostrophe', () => {
    expect(description("The check doesn't use it.")).toContain(`contraction ${inSentence("The check doesn't use it.")}`);
    expect(description('The check doesn’t use it.')).toContain(`contraction ${inSentence('The check doesn’t use it.')}`);
    expect(description("It's large.")).toContain(`contraction ${inSentence("It's large.")}`);
    expect(description('They’re large.')).toContain(`contraction ${inSentence('They’re large.')}`);
  });

  test('a placeholder that was not filled in', () => {
    expect(description('The model has ${count} groups.')).not.toEqual([]);
    expect(description('The model has {5} groups.')).not.toEqual([]);
    expect(description('The model has %d groups.')).not.toEqual([]);
  });
});
