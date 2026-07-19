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

  // THE-511: whole laws — nis2/dsgvo/dora no longer carry an articleNumbers demo filter.
  it('nis2 crawls the whole law (no articleNumbers filter — THE-511)', () => {
    expect(SOURCE_CRAWL_CONFIG.nis2).toEqual({
      celex: '32022L2555',
      language: 'en',
      jurisdiction: 'EU',
      effectiveFrom: '2024-10-17',
      transport: 'eur-lex',
    });
    expect(SOURCE_CRAWL_CONFIG.nis2.articleNumbers).toBeUndefined();
  });

  it('dsgvo crawls the whole law (no articleNumbers filter — THE-511)', () => {
    expect(SOURCE_CRAWL_CONFIG.dsgvo).toEqual({
      celex: '32016R0679',
      language: 'de',
      jurisdiction: 'EU',
      effectiveFrom: '2018-05-25',
      transport: 'eur-lex',
    });
    expect(SOURCE_CRAWL_CONFIG.dsgvo.articleNumbers).toBeUndefined();
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

  it('lksg crawls all §§ 1–24 (whole law — THE-511) via gesetze-im-internet', () => {
    expect(SOURCE_CRAWL_CONFIG.lksg).toEqual({
      paragraphNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
      lawSlug: 'lksg',
      jurisdiction: 'DE',
      effectiveFrom: '2023-01-01',
      transport: 'gesetze-im-internet',
    });
  });

  // THE-511: the 5 rule-less laws (+ language completeness) onboard as pure data rows.
  it('rule-less laws are wired as full eur-lex sources (no articleNumbers — THE-511)', () => {
    for (const id of ['cra-en', 'cra-de', 'mdr-en', 'mdr-de', 'psd2-en', 'psd2-de', 'eprivacy-en', 'eprivacy-de', 'eidas-en', 'eidas-de']) {
      const cfg = SOURCE_CRAWL_CONFIG[id];
      expect(cfg).toBeDefined();
      expect(cfg.transport).toBe('eur-lex');
      expect(cfg.celex).toMatch(/^3\d{4}[LR]\d{4}$/);
      expect(['en', 'de']).toContain(cfg.language);
      expect(cfg.articleNumbers).toBeUndefined(); // whole law
    }
  });

  it('language completeness rows share celex with their sibling (THE-511)', () => {
    expect(SOURCE_CRAWL_CONFIG['dsgvo-en'].celex).toBe(SOURCE_CRAWL_CONFIG.dsgvo.celex);
    expect(SOURCE_CRAWL_CONFIG['nis2-de'].celex).toBe(SOURCE_CRAWL_CONFIG.nis2.celex);
    expect(SOURCE_CRAWL_CONFIG['dora-de'].celex).toBe(SOURCE_CRAWL_CONFIG.dora.celex);
    expect(SOURCE_CRAWL_CONFIG['dsgvo-en'].language).toBe('en');
  });

  it('covers at least the 7 currently-wired sources (superset check — THE-418 Task 4 adds dora as a data-only row without touching this test)', () => {
    const keys = Object.keys(SOURCE_CRAWL_CONFIG);
    for (const id of ['ai-act-de', 'ai-act-en', 'data-act-de', 'data-act-en', 'dsgvo', 'lksg', 'nis2']) {
      expect(keys).toContain(id);
    }
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
