/**
 * Guard for the ladder texts (UC-METH-001): what a text in ASD-STE100 must not contain.
 *
 * It checks what a machine can decide — every word is a checked word or a technical noun, the
 * length of a sentence, no semicolon, no contraction, none of the terms the texts replaced. It
 * does not check the part of speech or the approved meaning of a word; that is done by hand when
 * a word is added to ste100-words.constants.ts.
 *
 * Counting follows the specification: a number counts as one word, and so does text in
 * parentheses and a quoted name. Sentences end at . : ! ?
 *
 * Not exported from the package index: only the guard tests read it, by path.
 */
import { STE100_TECHNICAL_NOUNS, STE100_WORDS_IN_USE } from './ste100-words.constants';

/** An instruction tells the reader to do something; everything else is a description. */
export type Ste100Kind = 'instruction' | 'description';

export const STE100_MAX_WORDS: Record<Ste100Kind, number> = { instruction: 20, description: 25 };

/** Terms the plain texts replaced. They belong to the Math line only. */
export const STE100_BANNED_STEMS: readonly string[] = [
  'context', 'translation', 'cohomolog', 'cocycle', 'overlap', 'coefficient', 'abelian', 'gluing',
  'conflict', 'contradiction', 'loop', 'obstruction', 'defect', 'rung',
];

const WORDS = new Set(STE100_WORDS_IN_USE);
const NOUNS = new Set(STE100_TECHNICAL_NOUNS.map((noun) => noun.toLowerCase()));

/** Stands for a number, a quoted name or text in parentheses: one word, with no letters to check. */
const ONE_WORD = ' 0 ';

function tokens(fragment: string): string[] {
  return fragment
    .replace(/\d[\d,.]*(?:e-?\d+)?/g, ONE_WORD)
    .split(/[\s·→,—×÷]+/)
    .filter((token) => /[A-Za-z0-9]/.test(token));
}

function uncheckedWords(fragment: string): string[] {
  const words = tokens(fragment).map((token) => token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''));
  const unchecked: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase();
    // A single capital letter is the name of a sample group: "A to B".
    if (word === '' || /^[A-Z]$/.test(word)) continue;
    if (i + 1 < words.length && NOUNS.has(`${lower} ${words[i + 1].toLowerCase()}`)) {
      i++;
      continue;
    }
    if (!NOUNS.has(lower) && !WORDS.has(lower)) unchecked.push(lower);
  }
  return unchecked;
}

/** Every finding names what is wrong and the sentence it is in. An empty list: the text passes. */
export function ste100Findings(text: string, kind: Ste100Kind): string[] {
  const findings: string[] = [];
  for (const sentence of text.split(/(?<=[.:!?])\s+/).filter((s) => s.trim() !== '')) {
    const where = `— in: "${sentence}"`;
    const unquoted = sentence.replace(/"[^"]*"/g, ONE_WORD);
    const inParentheses = [...unquoted.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]);
    const plain = unquoted.replace(/\([^)]*\)/g, ONE_WORD);

    for (const word of [plain, ...inParentheses].flatMap(uncheckedWords)) {
      findings.push(`"${word}" is not a checked STE100 word ${where}`);
    }
    const count = tokens(plain).length;
    if (count > STE100_MAX_WORDS[kind]) findings.push(`${count} words, the limit for ${kind === 'instruction' ? 'an' : 'a'} ${kind} is ${STE100_MAX_WORDS[kind]} ${where}`);
    if (unquoted.includes(';')) findings.push(`semicolon ${where}`);
    if (/n't\b|'(?:ll|re|ve|d|m)\b|\bit's\b/i.test(unquoted)) findings.push(`contraction ${where}`);
    for (const stem of STE100_BANNED_STEMS) {
      if (unquoted.toLowerCase().includes(stem)) findings.push(`"${stem}" is a term the plain texts do not use ${where}`);
    }
  }
  return findings;
}
