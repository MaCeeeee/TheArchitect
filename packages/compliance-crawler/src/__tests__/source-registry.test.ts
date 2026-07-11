/**
 * THE-414: the source registry is data (one entry per source), not two hardcoded
 * object literals. Every entry's id must be an ontology source, and must resolve
 * to a working SourceParser. Adding a source = appending one entry here.
 *
 * THE-418 (.6-Kern, REVIEW-FIXES): SOURCE_ENTRIES is now DERIVED from
 * SOURCE_CRAWL_CONFIG (crawl-config.ts), not hand-maintained. The count
 * assertion below is data-driven from that same config — no second
 * hand-maintained list. The byte-identity block proves the generic
 * EurLexSource/GesetzeImInternetSource built by the registry carries the same
 * celex/articles/language/effectiveFrom the old per-law factories used
 * (literals transcribed here, NOT imported from the now-deleted factories).
 */
import { SOURCE_ENTRIES, resolveSourceParser } from '../sources/source-registry';
import { SOURCE_CRAWL_CONFIG } from '../sources/crawl-config';
import { isNormSource } from '@thearchitect/shared';
import { Regulation } from '../db/regulation.model';

const env = { firecrawlKey: undefined, firecrawlUrl: undefined };

describe('source registry (THE-414 / THE-418)', () => {
  it('covers exactly the sources declared in crawl-config (data-driven, no second hand-maintained list)', () => {
    expect(SOURCE_ENTRIES.map((e) => e.id).sort()).toEqual(
      Object.keys(SOURCE_CRAWL_CONFIG).sort(),
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

  it('returns null for an id with no crawl-config row — caller emits "not yet implemented"', () => {
    // Decoupled from any specific ontology source id (e.g. 'dora') on purpose:
    // THE-418 Task 4 wires dora as a pure crawl-config.ts data row, and that
    // commit must not require touching this test file. See
    // onboarding-is-data.test.ts for the dora-specific AC-1 proof.
    expect(resolveSourceParser('not-a-wired-source', env)).toBeNull();
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

  describe('byte-identity: engines built from crawl-config data match the pre-refactor factory values', () => {
    // Literals transcribed here on purpose (not imported from the deleted
    // per-law factories) — this is the regression guard for Task 3's rewrite.
    it('nis2 → EurLexSource with celex 32022L2555, articles [20-24], en, effectiveFrom 2024-10-17', () => {
      const parser = resolveSourceParser('nis2', env) as any;
      expect(parser.constructor.name).toBe('EurLexSource');
      expect(parser.config.celex).toBe('32022L2555');
      expect(parser.config.language).toBe('en');
      expect(parser.config.articleNumbers).toEqual([20, 21, 22, 23, 24]);
      expect(parser.config.effectiveFrom).toEqual(new Date('2024-10-17'));
      expect(parser.config.jurisdiction).toBe('EU');
    });

    it('dsgvo → EurLexSource with celex 32016R0679, articles [5,6,9,32], de, effectiveFrom 2018-05-25', () => {
      const parser = resolveSourceParser('dsgvo', env) as any;
      expect(parser.constructor.name).toBe('EurLexSource');
      expect(parser.config.celex).toBe('32016R0679');
      expect(parser.config.language).toBe('de');
      expect(parser.config.articleNumbers).toEqual([5, 6, 9, 32]);
      expect(parser.config.effectiveFrom).toEqual(new Date('2018-05-25'));
    });

    it('ai-act-en/de → EurLexSource with celex 32024R1689, effectiveFrom 2024-08-01, per-language', () => {
      const en = resolveSourceParser('ai-act-en', env) as any;
      const de = resolveSourceParser('ai-act-de', env) as any;
      expect(en.config.celex).toBe('32024R1689');
      expect(en.config.language).toBe('en');
      expect(en.config.effectiveFrom).toEqual(new Date('2024-08-01'));
      expect(de.config.celex).toBe('32024R1689');
      expect(de.config.language).toBe('de');
    });

    it('data-act-en/de → EurLexSource with celex 32023R2854, effectiveFrom 2024-01-11, per-language', () => {
      const en = resolveSourceParser('data-act-en', env) as any;
      const de = resolveSourceParser('data-act-de', env) as any;
      expect(en.config.celex).toBe('32023R2854');
      expect(en.config.language).toBe('en');
      expect(en.config.effectiveFrom).toEqual(new Date('2024-01-11'));
      expect(de.config.celex).toBe('32023R2854');
      expect(de.config.language).toBe('de');
    });

    it('lksg → GesetzeImInternetSource with lawSlug lksg, paragraphNumbers [3-9], effectiveFrom 2023-01-01', () => {
      const parser = resolveSourceParser('lksg', env) as any;
      expect(parser.constructor.name).toBe('GesetzeImInternetSource');
      expect(parser.config.lawSlug).toBe('lksg');
      expect(parser.config.paragraphNumbers).toEqual([3, 4, 5, 6, 7, 8, 9]);
      expect(parser.config.effectiveFrom).toEqual(new Date('2023-01-01'));
      expect(parser.config.jurisdiction).toBe('DE');
    });

    it('firecrawlKey present → nis2 resolves to a FirecrawlSource with the EUR-Lex-derived URL', () => {
      const parser = resolveSourceParser('nis2', { firecrawlKey: 'test-key', firecrawlUrl: undefined }) as any;
      expect(parser.constructor.name).toBe('FirecrawlSource');
      expect(parser.config.url).toBe(
        'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555',
      );
      expect(parser.config.articleNumbers).toEqual([20, 21, 22, 23, 24]);
    });
  });
});
