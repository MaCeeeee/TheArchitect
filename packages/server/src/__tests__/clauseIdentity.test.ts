/**
 * Tests für die änderungsstabile Klausel-Identität (THE-560, Slice 1 von
 * UC-REQTRACE-001). Gemessene Grundlage THE-550: positionale Ids zeigen nach
 * einer umnummerierenden Novelle zu 24/30 auf die FALSCHE Klausel; der
 * Content-Hash findet 30/30 wieder.
 */
import { normalizeClauseText, clauseContentId } from '@thearchitect/shared';

describe('normalizeClauseText', () => {
  it('collapses whitespace and trims — a re-crawl must not change identity', () => {
    expect(normalizeClauseText('  Die  Einrichtungen\n\nmelden   unverzüglich. '))
      .toBe('Die Einrichtungen melden unverzüglich.');
  });

  it('applies NFC — composed and decomposed umlauts are the same clause', () => {
    const composed = 'Mängel melden'; // ä als ein Codepoint
    const decomposed = 'Ma\u0308ngel melden'; // a + combining diaeresis
    expect(normalizeClauseText(composed)).toBe(normalizeClauseText(decomposed));
  });

  it('does NOT lowercase and does NOT strip punctuation — legal text identity is literal', () => {
    expect(normalizeClauseText('Die Meldung MUSS erfolgen.')).toBe('Die Meldung MUSS erfolgen.');
  });
});

describe('clauseContentId', () => {
  it('is deterministic and 16 hex chars', () => {
    const id = clauseContentId('Die Einrichtungen melden unverzüglich.');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(clauseContentId('Die Einrichtungen melden unverzüglich.')).toBe(id);
  });

  it('ignores whitespace differences but not wording differences', () => {
    const a = clauseContentId('Die  Einrichtungen melden\nunverzüglich.');
    const b = clauseContentId('Die Einrichtungen melden unverzüglich.');
    const c = clauseContentId('Die Einrichtungen melden binnen 24 Stunden.');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('sha256Hex — gegen node:crypto als Referenz belegt, nicht behauptet', () => {
  const { sha256Hex } = require('@thearchitect/shared');
  const nodeCrypto = require('node:crypto');
  const ref = (s: string): string => nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex');

  it.each([
    '',
    'abc',
    'Die Einrichtungen melden unverzüglich.',
    'Mängel — Übermittlung § 33 Abs. 1 („unverzüglich")',
    'a'.repeat(55), // Padding-Grenzfall: Länge passt knapp nicht mehr in einen Block
    'ä'.repeat(200), // Mehrbyte-UTF-8 über mehrere Blöcke
  ])('matches node:crypto for %j', (s: string) => {
    expect(sha256Hex(s)).toBe(ref(s));
  });
});
