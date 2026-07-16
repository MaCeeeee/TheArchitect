import { describe, test, expect } from 'vitest';
import { filterCommands } from './commandFilter';
import type { Command } from './commands';

const cmd = (id: string, label: string, keywords: string[] = [], group = 'G'): Command =>
  ({ id, group, label, keywords, run: () => {} });

const cmds = [
  cmd('a', 'Coverage matrix', ['compliance', 'mapping'], 'Compliance'),
  cmd('b', 'Risk analysis', ['risk'], 'Analyze'),
  cmd('c', 'Go to Model', ['station', 'editor'], 'Go to'),
];

describe('filterCommands (THE-493)', () => {
  test('empty query returns all, in order', () => {
    expect(filterCommands(cmds, '').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  test('matches label substring case-insensitively', () => {
    expect(filterCommands(cmds, 'MATRIX').map((c) => c.id)).toEqual(['a']);
  });
  test('matches keywords and group', () => {
    expect(filterCommands(cmds, 'mapping').map((c) => c.id)).toEqual(['a']);
    expect(filterCommands(cmds, 'analyze').map((c) => c.id)).toEqual(['b']);
  });
  test('multi-term: every token must match somewhere', () => {
    expect(filterCommands(cmds, 'go model').map((c) => c.id)).toEqual(['c']);
    expect(filterCommands(cmds, 'go matrix')).toEqual([]);
  });
});
