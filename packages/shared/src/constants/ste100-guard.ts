/**
 * Guard for the ladder texts (UC-METH-001): what a text in ASD-STE100 must not contain.
 *
 * It checks what a machine can decide:
 *   - every word is a checked word or a technical noun, in the listed form (no suffix is removed)
 *   - the length of a sentence
 *   - no semicolon, no contraction
 *   - none of the terms the plain texts replaced, anywhere in the sentence
 *   - no letter or sign other than plain letters, numbers and the separators the texts use
 *   - one capital letter only as a sample name: "A to B", "group A"
 *   - the text is not empty
 * It does not check the part of speech or the approved meaning of a word; that is done by hand
 * when a word is added to ste100-words.constants.ts.
 *
 * Counting follows the specification: a number counts as one word, and so does text in
 * parentheses. The words in parentheses are examined. A sentence ends at . ! ? and not at a colon.
 *
 * Quotation marks hide nothing. A test that puts a name of its own into a text — of a quantity,
 * a group, a method — gives that name in `names`, as it stands in the text ('"bulk"', 'Logistik').
 * Such a name counts as one word and is not examined word for word. The terms the plain texts
 * replaced are still found in it.
 *
 * Not exported from the package index: only the guard tests read it, by path.
 */
import { STE100_TECHNICAL_NOUNS, STE100_WORDS_IN_USE } from './ste100-words.constants';

/** An instruction tells the reader to do something; everything else is a description. */
export type Ste100Kind = 'instruction' | 'description';

const MAX_WORDS: Record<Ste100Kind, number> = { instruction: 20, description: 25 };

/** Terms the plain texts replaced. They belong to the Math line only. */
const BANNED_STEMS: readonly string[] = [
  'context', 'translation', 'cohomolog', 'cocycle', 'overlap', 'coefficient', 'abelian', 'gluing',
  'conflict', 'contradiction', 'loop', 'obstruction', 'defect', 'rung',
];

const WORDS = new Set(STE100_WORDS_IN_USE);
const NOUNS = new Set(STE100_TECHNICAL_NOUNS.map((noun) => noun.toLowerCase()));

/** Stands for a number, a given name or text in parentheses: one word, with no letters to examine. */
const ONE_WORD = ' 0 ';
/** 1,000 · 0.8333333 · 1e-12 — the hyphen of an exponent is part of the number. */
const NUMBER = /\d[\d,.]*(?:e-?\d+)?/g;
/**
 * Everything a plain text is made of: letters, numbers, spaces and the separators the texts use.
 * The semicolon and the apostrophe are here because they have a finding of their own.
 */
const PLAIN = /^[A-Za-z0-9\s·—→×÷"(),.:;']*$/;
const ONE_CAPITAL = /^[A-Z]$/;

/** A given name inside a text while the text is cut into sentences: no space, no full stop. */
const mark = (index: number) => `\u0000${index}\u0000`;
const MARK = /\u0000(\d+)\u0000/g;

function markNames(text: string, names: readonly string[]): string {
  // The longest name first: a name can be a part of a different name.
  const order = names.map((name, index) => ({ name, index })).sort((a, b) => b.name.length - a.name.length);
  let marked = text;
  for (const { name, index } of order) {
    if (name === '') continue;
    const whole = new RegExp(`(?<![A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'g');
    marked = marked.replace(whole, mark(index));
  }
  return marked;
}

function tokens(fragment: string): string[] {
  return fragment
    .replace(NUMBER, ONE_WORD)
    .split(/[\s·→,—×÷]+/)
    .filter((token) => /[A-Za-z0-9]/.test(token));
}

/** What is wrong with the words of a fragment: a word that is not listed, a letter that is no name. */
function wordFindings(fragment: string): string[] {
  const words = tokens(fragment).map((token) => token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''));
  const lower = words.map((word) => word.toLowerCase());
  const isLetter = (i: number) => i >= 0 && i < words.length && ONE_CAPITAL.test(words[i]);
  const findings: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === '') continue;
    if (i + 1 < words.length && NOUNS.has(`${lower[i]} ${lower[i + 1]}`)) {
      i++;
      continue;
    }
    if (NOUNS.has(lower[i]) || WORDS.has(lower[i])) continue;
    if (ONE_CAPITAL.test(words[i])) {
      // The name of a sample group: "group A", "A to B".
      const afterGroup = lower[i - 1] === 'group';
      const beforeTo = lower[i + 1] === 'to' && isLetter(i + 2);
      const afterTo = lower[i - 1] === 'to' && isLetter(i - 2);
      if (!afterGroup && !beforeTo && !afterTo) findings.push(`"${words[i]}" is one letter and not a name as in "A to B" or "group A"`);
      continue;
    }
    findings.push(`"${lower[i]}" is not a checked STE100 word`);
  }
  return findings;
}

/**
 * Every finding names what is wrong and the sentence it is in. An empty list: the text passes.
 * `names`: the names that the test itself put into the text, see above.
 */
export function ste100Findings(text: string, kind: Ste100Kind, names: readonly string[] = []): string[] {
  if (text.trim() === '') return ['empty text'];
  const findings: string[] = [];
  for (const marked of markNames(text, names).split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== '')) {
    const sentence = marked.replace(MARK, (_mark, index) => names[Number(index)]);
    const where = `— in: "${sentence}"`;
    const withoutNames = marked.replace(MARK, ONE_WORD);
    const inParentheses = [...withoutNames.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]);
    const plain = withoutNames.replace(/\([^)]*\)/g, ONE_WORD);

    for (const finding of [plain, ...inParentheses].flatMap(wordFindings)) findings.push(`${finding} ${where}`);
    const strange = withoutNames.split(/\s+/).filter((token) => !PLAIN.test(token.replace(NUMBER, '0')));
    for (const token of new Set(strange)) findings.push(`"${token}" has a letter or sign that the plain texts do not use ${where}`);
    const count = tokens(plain).length;
    if (count > MAX_WORDS[kind]) findings.push(`${count} words, the limit for ${kind === 'instruction' ? 'an' : 'a'} ${kind} is ${MAX_WORDS[kind]} ${where}`);
    if (withoutNames.includes(';')) findings.push(`semicolon ${where}`);
    if (/n['’]t\b|['’](?:ll|re|ve|d|m)\b|\bit['’]s\b/i.test(withoutNames)) findings.push(`contraction ${where}`);
    // In the whole sentence: quotation marks, parentheses and a given name do not hide a replaced term.
    for (const stem of BANNED_STEMS) {
      if (sentence.toLowerCase().includes(stem)) findings.push(`"${stem}" is a term the plain texts do not use ${where}`);
    }
  }
  return findings;
}
