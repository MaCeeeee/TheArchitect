/**
 * THE-418 (.6-Kern, REVIEW-FIXES): crawl config is data, not code. Every source's
 * celex/articles/transport/language lives in SOURCE_CRAWL_CONFIG (this file's
 * subject), keyed by ontology source id. This test pins the shape and the
 * transcribed literals for the 7 currently-wired sources (byte-identity guard
 * for the source-registry rewrite in Task 3).
 */
import { SOURCE_CRAWL_CONFIG, deriveEurLexUrl } from '../sources/crawl-config';
import { isNormSource, isLanguage } from '@thearchitect/shared';

describe('crawl-config (THE-418)', () => {
  it('every key is a valid ontology norm source', () => {
    for (const id of Object.keys(SOURCE_CRAWL_CONFIG)) {
      expect(isNormSource(id)).toBe(true);
    }
  });

  it('every declared language is a valid ontology language', () => {
    for (const [id, cfg] of Object.entries(SOURCE_CRAWL_CONFIG)) {
      if (cfg.language !== undefined) {
        expect(isLanguage(cfg.language)).toBe(true);
      }
    }
  });

  it('nis2 config matches the transcribed literal (byte-identity source)', () => {
    expect(SOURCE_CRAWL_CONFIG.nis2).toEqual({
      celex: '32022L2555',
      language: 'en',
      articleNumbers: [20, 21, 22, 23, 24],
      jurisdiction: 'EU',
      effectiveFrom: '2024-10-17',
      transport: 'eur-lex',
    });
  });

  it('dsgvo config matches the transcribed literal', () => {
    expect(SOURCE_CRAWL_CONFIG.dsgvo).toEqual({
      celex: '32016R0679',
      language: 'de',
      articleNumbers: [5, 6, 9, 32],
      jurisdiction: 'EU',
      effectiveFrom: '2018-05-25',
      transport: 'eur-lex',
    });
  });

  it('ai-act-en / ai-act-de share celex, differ by language', () => {
    expect(SOURCE_CRAWL_CONFIG['ai-act-en']).toEqual({
      celex: '32024R1689',
      language: 'en',
      jurisdiction: 'EU',
      effectiveFrom: '2024-08-01',
      transport: 'eur-lex',
    });
    expect(SOURCE_CRAWL_CONFIG['ai-act-de']).toEqual({
      celex: '32024R1689',
      language: 'de',
      jurisdiction: 'EU',
      effectiveFrom: '2024-08-01',
      transport: 'eur-lex',
    });
  });

  it('data-act-en / data-act-de share celex, differ by language', () => {
    expect(SOURCE_CRAWL_CONFIG['data-act-en']).toEqual({
      celex: '32023R2854',
      language: 'en',
      jurisdiction: 'EU',
      effectiveFrom: '2024-01-11',
      transport: 'eur-lex',
    });
    expect(SOURCE_CRAWL_CONFIG['data-act-de']).toEqual({
      celex: '32023R2854',
      language: 'de',
      jurisdiction: 'EU',
      effectiveFrom: '2024-01-11',
      transport: 'eur-lex',
    });
  });

  it('lksg config uses paragraphNumbers + lawSlug + gesetze-im-internet transport', () => {
    expect(SOURCE_CRAWL_CONFIG.lksg).toEqual({
      paragraphNumbers: [3, 4, 5, 6, 7, 8, 9],
      lawSlug: 'lksg',
      jurisdiction: 'DE',
      effectiveFrom: '2023-01-01',
      transport: 'gesetze-im-internet',
    });
  });

  it('covers exactly the 7 currently-wired sources (dora not yet a row)', () => {
    expect(Object.keys(SOURCE_CRAWL_CONFIG).sort()).toEqual(
      ['ai-act-de', 'ai-act-en', 'data-act-de', 'data-act-en', 'dsgvo', 'lksg', 'nis2'].sort(),
    );
  });

  describe('deriveEurLexUrl', () => {
    it('builds the EUR-Lex HTML URL from celex + language', () => {
      expect(deriveEurLexUrl('32022L2555', 'en')).toBe(
        'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555',
      );
      expect(deriveEurLexUrl('32016R0679', 'de')).toBe(
        'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679',
      );
    });
  });
});
