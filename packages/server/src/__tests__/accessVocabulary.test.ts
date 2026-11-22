/**
 * REQ-RING-001.1 (THE-821, AC-3) — the access type is read from the relationship label.
 * Labels and counts: all access relationships in Prod, measured read-only on 22.11.2026 (THE-819).
 * Run: cd packages/server && npx jest src/__tests__/accessVocabulary.test.ts
 */
import { accessKindFromLabel } from '@thearchitect/shared';

const PROD_LABELS: Array<[string, number]> = [
  ['read-write', 28], ['writes', 21], ['reads', 7], ['schreibt', 4], ['accesses', 3], ['read', 3],
  ['reads/writes', 3], ['nutzt', 2], ['liest', 2], ['uses', 1], ['inputs', 1], ['issues', 1], ['publishes', 1],
  ['subject rights', 1], ['posts normalised defect payload to the WORM register', 1], ['appends', 1],
  ['produces', 1], ['reads/revokes', 1], ['reads for daily encrypted dump', 1], ['', 1], ['erzeugt', 1], ['vergleicht', 1],
];

describe('accessKindFromLabel', () => {
  test('reads 71 of the 86 Prod labels, the 15 others stay unknown', () => {
    const readable = PROD_LABELS.filter(([label]) => accessKindFromLabel(label) !== null).reduce((sum, [, n]) => sum + n, 0);
    const all = PROD_LABELS.reduce((sum, [, n]) => sum + n, 0);
    expect(all).toBe(86);
    expect(readable).toBe(71);
  });

  test('maps the words to read, write and readwrite', () => {
    expect(['read', 'reads', 'liest', 'nutzt', 'vergleicht'].map(accessKindFromLabel)).toEqual(['read', 'read', 'read', 'read', 'read']);
    expect(['write', 'writes', 'schreibt'].map(accessKindFromLabel)).toEqual(['write', 'write', 'write']);
    expect(['read-write', 'reads/writes'].map(accessKindFromLabel)).toEqual(['readwrite', 'readwrite']);
  });

  test('reads the label the ArchiMate import writes (access:<accessType>)', () => {
    expect(accessKindFromLabel('access:Read')).toBe('read');
    expect(accessKindFromLabel('access:Write')).toBe('write');
    expect(accessKindFromLabel('access:ReadWrite')).toBe('readwrite');
    expect(accessKindFromLabel('access:Access')).toBeNull();
  });

  test('never guesses: unknown, empty, missing and prototype names stay null; case and spaces do not matter', () => {
    expect(accessKindFromLabel('accesses')).toBeNull();
    expect(accessKindFromLabel('')).toBeNull();
    expect(accessKindFromLabel(null)).toBeNull();
    expect(accessKindFromLabel(undefined)).toBeNull();
    expect(accessKindFromLabel('constructor')).toBeNull();
    expect(accessKindFromLabel('  Writes ')).toBe('write');
  });
});
