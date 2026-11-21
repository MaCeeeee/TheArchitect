/**
 * UC-METH-002 — every text of the group mode is ASD-STE100. A text added without a sample fails.
 * Run: cd packages/client && npx vitest run src/components/groups/groupModeText.test.ts
 */
import { describe, test, expect } from 'vitest';
import { ste100Findings, type Ste100Kind } from '@thearchitect/shared/src/constants/ste100-guard';
import { GROUP_MODE_TEXT } from './groupModeText';

type Template = (...args: never[]) => string;
const NAMES = ['Logistik'];
const SAMPLES: Record<string, unknown[][]> = {
  selectedCount: [[1], [3]],
  makeTheGroup: [[2], [12]],
  youHave: [[1], [3]],
  notAMember: [['Logistik']],
};
/** Texts that tell the reader what to do: at most 20 words in a sentence. */
const INSTRUCTIONS = new Set(['nextStepShort', 'selectHint', 'selectOneMore', 'nameHint', 'doAgain', 'youHave']);

function rendered(): Array<{ key: string; text: string; kind: Ste100Kind }> {
  return Object.entries(GROUP_MODE_TEXT).flatMap(([key, value]) => {
    const kind: Ste100Kind = INSTRUCTIONS.has(key) ? 'instruction' : 'description';
    if (typeof value === 'string') return [{ key, text: value, kind }];
    const samples = SAMPLES[key];
    if (!samples) throw new Error(`GROUP_MODE_TEXT.${key} takes arguments: add a sample`);
    return samples.map((args) => ({ key, text: (value as Template)(...(args as never[])), kind }));
  });
}

describe('groupModeText — wording', () => {
  test('the texts of the guided step', () => {
    expect(GROUP_MODE_TEXT.start).toBe('Make a group');
    expect(GROUP_MODE_TEXT.nextStepShort).toBe('Make a minimum of two groups.');
    expect(GROUP_MODE_TEXT.selectHint).toBe('Select the elements of the group.');
    expect(GROUP_MODE_TEXT.selectedCount(1)).toBe('1 element selected.');
    expect(GROUP_MODE_TEXT.selectedCount(3)).toBe('3 elements selected.');
    expect(GROUP_MODE_TEXT.makeTheGroup(3)).toBe('Make the group (3)');
    expect(GROUP_MODE_TEXT.nameHint).toBe('Write a name for the group.');
    expect(GROUP_MODE_TEXT.youHave(1)).toBe('You have 1 group. Make one more group.');
    expect(GROUP_MODE_TEXT.completed).toBe('You completed step 2.');
    expect(GROUP_MODE_TEXT.notAMember('Logistik')).toBe('Logistik is not a member of the group.');
  });

  test('"click" is not used as a verb anywhere', () => {
    for (const { text } of rendered()) expect(text.toLowerCase()).not.toMatch(/\bclick/);
  });
});

describe('groupModeText — every text is Simplified Technical English', () => {
  test.each(rendered().map((r) => [`${r.key}: ${r.text}`, r] as const))('%s', (_name, { text, kind }) => {
    expect(ste100Findings(text, kind, NAMES)).toEqual([]);
  });
});
