/**
 * UC-METH-001 — the texts of the ladder panel are written in ASD-STE100 (Simplified Technical English).
 *
 * Guard: every text of ladderText.ts uses only words of the checked list
 * (shared/src/constants/ste100-words.constants.ts), stays within the sentence length, and uses
 * none of the terms the plain texts replaced. A text that is added to LADDER_TEXT without a
 * sample here fails as well, so no text escapes the check.
 */
import { describe, test, expect } from 'vitest';
import { ste100Findings, type Ste100Kind } from '@thearchitect/shared/src/constants/ste100-guard';
import * as ladderText from './ladderText';
import { LADDER_MATH_TEXT, LADDER_TEXT } from './ladderText';

type Template = (...args: never[]) => string;

/** Arguments for every text that takes some. Names of groups, methods and quantities are single capital letters. */
const SAMPLES: Record<string, unknown[][]> = {
  headline: [[0], [2], [5]],
  nextStep: [['Add elements to the model.']],
  methodSummary: [[4, 14], [1, 14], [0, 14]],
  oneMoreInput: [['A', 'B']],
  quantity: [['A']],
  summary: [[3, 3, 1], [1, 1, 1], [2, 4, 0]],
  result: [['0.8333333'], [null]],
  scale: [['A ×1 · B ×10']],
  scaleEntry: [['A', '10'], ['A', null]],
  more: [[0, 584], [28, 1], [1, 0], [1, 2]],
  tolerance: [['0.999999', '1.000001']],
};

/** A text that tells the reader what to do is an instruction: at most 20 words in a sentence. */
const INSTRUCTIONS = new Set(['nextStep']);

function rendered(): Array<{ key: string; text: string; kind: Ste100Kind }> {
  return Object.entries(LADDER_TEXT).flatMap(([key, value]) => {
    const kind: Ste100Kind = INSTRUCTIONS.has(key) ? 'instruction' : 'description';
    if (typeof value === 'string') return [{ key, text: value, kind }];
    const samples = SAMPLES[key];
    if (!samples) throw new Error(`LADDER_TEXT.${key} takes arguments: add a sample to SAMPLES so the guard can check its text`);
    return samples.map((args) => ({ key, text: (value as Template)(...(args as never[])), kind }));
  });
}

describe('ladderText — the wording of the approved draft', () => {
  test('headline, next step, methods', () => {
    expect(LADDER_TEXT.headline(2)).toBe('Model check: step 2 of 5');
    expect(LADDER_TEXT.headlineNotStarted).toBe('Model check: not started');
    expect(LADDER_TEXT.nextStep('Add elements to the model.')).toBe('Next step: Add elements to the model.');
    expect(LADDER_TEXT.methodSummary(4, 14)).toBe('The software can calculate 4 of 14 methods.');
    expect(LADDER_TEXT.oneMoreInputHeading).toBe('Methods for which one more input is necessary');
    expect(LADDER_TEXT.oneMoreInput('Technical debt', 'technicalDebtRatio on at least 1 element')).toBe(
      'Technical debt — necessary: technicalDebtRatio on at least 1 element',
    );
    expect(LADDER_TEXT.mathButton).toBe('Math');
  });

  test('the three results', () => {
    expect([LADDER_TEXT.exactTitle, LADDER_TEXT.exactText]).toEqual([
      'The conversion factors agree',
      'All conversion factors agree. Each group has one scale.',
    ]);
    expect([LADDER_TEXT.localTitle, LADDER_TEXT.localText]).toEqual([
      'The conversion factors do not agree at a member',
      'These groups have the same member. But their conversion factors do not agree.',
    ]);
    expect([LADDER_TEXT.globalTitle, LADDER_TEXT.globalText, LADDER_TEXT.globalTextMembersAgree]).toEqual([
      'The conversion factors do not agree along a closed path',
      'Each conversion factor is possible. But the result along the closed path is not 1.',
      'The conversion factors agree at each member. But the result along the closed path is not 1.',
    ]);
  });

  test('counts in the singular and in the plural', () => {
    expect(LADDER_TEXT.summary(3, 3, 1)).toBe('3 groups · 3 conversion factors · 1 closed path');
    expect(LADDER_TEXT.summary(1, 1, 0)).toBe('1 group · 1 conversion factor · 0 closed paths');
    expect(LADDER_TEXT.more(0, 584)).toBe('and 584 more closed paths');
    expect(LADDER_TEXT.more(28, 1)).toBe('and 28 more sets of three groups and 1 more closed path');
    expect(LADDER_TEXT.more(1, 0)).toBe('and 1 more set of three groups');
  });

  test('result, scale and tolerance', () => {
    expect(LADDER_TEXT.result('0.8333333')).toBe('result 0.8333333, must be 1');
    expect(LADDER_TEXT.result(null)).toBe('result too large or too small to show, must be 1');
    expect(LADDER_TEXT.scale('Produktion ×1 · TE ×1 · Logistik ×10')).toBe('Scale of each group: Produktion ×1 · TE ×1 · Logistik ×10');
    expect(LADDER_TEXT.scaleEntry('Logistik', '10')).toBe('Logistik ×10');
    expect(LADDER_TEXT.scaleEntry('Logistik', null)).toBe('Logistik (too large or too small to show)');
    expect(LADDER_TEXT.tolerance('0.999999', '1.000001')).toBe('A result between 0.999999 and 1.000001 is equal to 1.');
    expect(LADDER_TEXT.quantity('pieces')).toBe('quantity: pieces');
  });
});

describe('ladderText — every text is Simplified Technical English', () => {
  test.each(rendered().map((r) => [`${r.key}: ${r.text}`, r] as const))('%s', (_name, { text, kind }) => {
    // a failure names the word and the sentence it is in
    expect(ste100Findings(text, kind)).toEqual([]);
  });

  test('every sample belongs to a text that takes arguments', () => {
    const templates = Object.entries(LADDER_TEXT).filter(([, value]) => typeof value === 'function').map(([key]) => key);
    expect(Object.keys(SAMPLES).sort()).toEqual(templates.sort());
  });

  test('the module holds the plain texts and the texts of the Math level, nothing else', () => {
    expect(Object.keys(ladderText).sort()).toEqual(['LADDER_MATH_TEXT', 'LADDER_TEXT']);
    // The Math level keeps the mathematical wording and is not checked. A new text belongs to
    // LADDER_TEXT unless it is shown only behind the Math button.
    expect(Object.keys(LADDER_MATH_TEXT).sort()).toEqual(['limits', 'method', 'summary']);
    expect(LADDER_MATH_TEXT.summary(3, 3, 1, 0, 1)).toBe('3 contexts · 3 translations · 1 independent loop · 0 triple overlaps · dim H¹ = 1');
    expect(LADDER_MATH_TEXT.summary(1, 1, 1, 1, 1)).toBe('1 context · 1 translation · 1 independent loop · 1 triple overlap · dim H¹ = 1');
    expect(LADDER_MATH_TEXT.method('PA-kategorientheorie')).toBe('Method · PA-kategorientheorie');
    expect(LADDER_MATH_TEXT.limits('Sound only for invertible numeric translations.')).toBe('Limits: Sound only for invertible numeric translations.');
  });

  test('the guard finds a word that was not checked', () => {
    expect(ste100Findings('Model check: rung 2 of 5', 'description')).toEqual([
      '"rung" is not a checked STE100 word — in: "rung 2 of 5"',
      '"rung" is a term the plain texts do not use — in: "rung 2 of 5"',
    ]);
  });
});
