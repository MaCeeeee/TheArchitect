/**
 * THE-414: the source registry is data (one entry per source), not two hardcoded
 * object literals. Every entry's id must be an ontology source, and must resolve
 * to a working SourceParser. Adding a source = appending one entry here.
 */
import { SOURCE_ENTRIES, resolveSourceParser } from '../sources/source-registry';
import { isNormSource } from '@thearchitect/shared';
import { Regulation } from '../db/regulation.model';

const env = { firecrawlKey: undefined, firecrawlUrl: undefined };

describe('source registry (THE-414)', () => {
  it('covers exactly the 7 currently-wired sources', () => {
    expect(SOURCE_ENTRIES.map((e) => e.id).sort()).toEqual(
      ['ai-act-de', 'ai-act-en', 'data-act-de', 'data-act-en', 'dsgvo', 'lksg', 'nis2'].sort(),
    );
  });

  it('every entry id is an ontology source (no off-ontology wiring)', () => {
    for (const e of SOURCE_ENTRIES) expect(isNormSource(e.id)).toBe(true);
  });

  it('every entry declares provenance adapter + format', () => {
    for (const e of SOURCE_ENTRIES) {
      expect(typeof e.adapter).toBe('string');
      expect(typeof e.format).toBe('string');
    }
  });

  it('resolveSourceParser builds a SourceParser for each entry', () => {
    for (const e of SOURCE_ENTRIES) {
      const parser = resolveSourceParser(e.id, env);
      expect(parser).not.toBeNull();
      expect(typeof parser?.crawl).toBe('function');
    }
  });

  it('returns null for an unwired ontology source (dora) — caller emits "not yet implemented"', () => {
    expect(resolveSourceParser('dora', env)).toBeNull();
  });

  it('Regulation accepts a provenance sub-document (THE-414 AC-3)', () => {
    const doc = new Regulation({
      regulationKey: 'nis2:art-20', versionHash: 'x'.repeat(64), source: 'nis2', jurisdiction: 'EU',
      paragraphNumber: 'Art. 20', title: 't', fullText: 'x'.repeat(60), sourceUrl: 'https://e.org',
      effectiveFrom: new Date(), language: 'en',
      provenance: { adapter: 'eur-lex', format: 'html', fetchedAt: new Date(), sourceUri: 'https://e.org' },
    });
    const err = doc.validateSync();
    expect(err?.errors?.['provenance.adapter']).toBeUndefined();
    expect(doc.provenance?.adapter).toBe('eur-lex');
  });
});
