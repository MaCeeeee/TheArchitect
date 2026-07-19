/**
 * THE-418 (.6-Kern, REVIEW-FIXES): crawl config as data.
 *
 * A new law onboards as ONE row here — celex/articles/language/transport — not
 * a new TypeScript factory. `source-registry.ts` (Task 3) iterates this map and
 * builds the generic `EurLexSource` / `FirecrawlSource` / `GesetzeImInternetSource`
 * engines from it. Ontology `normSources` rows (id/label/jurisdiction — vocabulary)
 * stay unchanged; this is transport/citation config, not vocabulary.
 *
 * Every key MUST be a valid ontology norm source (`isNormSource`, pinned by test).
 * Every `language` MUST be a valid ontology language (`isLanguage`, pinned by test).
 */

/** One source's crawl parameters. Keyed by ontology norm-source id in SOURCE_CRAWL_CONFIG. */
export interface CrawlConfig {
  /** CELEX number for EUR-Lex sources, e.g. '32022L2555' (NIS2) or '32016R0679' (GDPR). */
  celex?: string;
  /** Ontology language id ('en' | 'de' | …), validated by isLanguage(). */
  language?: string;
  /** Filter to specific article numbers (EUR-Lex / Firecrawl transport). */
  articleNumbers?: number[];
  /** Filter to specific paragraph numbers (gesetze-im-internet transport). */
  paragraphNumbers?: (number | string)[];
  /**
   * Law slug as used in the gesetze-im-internet.de URL — NOT always the source id
   * (e.g. bdsg_2018 for a 'dsgvo' source). Required for transport 'gesetze-im-internet'.
   */
  lawSlug?: string;
  /** ISO date string the norm took effect, e.g. '2024-10-17'. */
  effectiveFrom?: string;
  /** Ontology jurisdiction id, e.g. 'EU' | 'DE'. */
  jurisdiction: string;
  /** Which ingest engine builds the parser for this source. */
  transport: 'eur-lex' | 'firecrawl' | 'gesetze-im-internet';
}

/**
 * The 7 currently-wired sources, transcribed verbatim from the former per-law
 * factories in eur-lex.ts / firecrawl.ts / gesetze-im-internet.ts (byte-identity
 * basis for the Task 3 registry rewrite — celex/articles/language/effectiveFrom
 * must crawl identically to before).
 */
export const SOURCE_CRAWL_CONFIG: Record<string, CrawlConfig> = {
  // THE-511: ganze Gesetze — articleNumbers (Demo-Filter, war der Blindfleck) entfernt.
  nis2: {
    celex: '32022L2555',
    language: 'en',
    jurisdiction: 'EU',
    effectiveFrom: '2024-10-17',
    transport: 'eur-lex',
  },
  dsgvo: {
    celex: '32016R0679',
    language: 'de',
    jurisdiction: 'EU',
    effectiveFrom: '2018-05-25',
    transport: 'eur-lex',
  },
  'ai-act-en': {
    celex: '32024R1689',
    language: 'en',
    jurisdiction: 'EU',
    effectiveFrom: '2024-08-01',
    transport: 'eur-lex',
  },
  'ai-act-de': {
    celex: '32024R1689',
    language: 'de',
    jurisdiction: 'EU',
    effectiveFrom: '2024-08-01',
    transport: 'eur-lex',
  },
  'data-act-en': {
    celex: '32023R2854',
    language: 'en',
    jurisdiction: 'EU',
    effectiveFrom: '2024-01-11',
    transport: 'eur-lex',
  },
  'data-act-de': {
    celex: '32023R2854',
    language: 'de',
    jurisdiction: 'EU',
    effectiveFrom: '2024-01-11',
    transport: 'eur-lex',
  },
  lksg: {
    // THE-511: ganzes LkSG (§§ 1–24). gesetze-im-internet crawlt 1 Request/§, direkt (keine WAF).
    paragraphNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    lawSlug: 'lksg',
    jurisdiction: 'DE',
    effectiveFrom: '2023-01-01',
    transport: 'gesetze-im-internet',
  },
  // THE-511: ganze DORA (articleNumbers entfernt).
  dora: {
    celex: '32022R2554',
    language: 'en',
    jurisdiction: 'EU',
    effectiveFrom: '2025-01-17',
    transport: 'eur-lex',
  },

  // ─── THE-511: Sprach-Vollständigkeit (cross-linguales Retrieval) ───
  'dsgvo-en': { celex: '32016R0679', language: 'en', jurisdiction: 'EU', effectiveFrom: '2018-05-25', transport: 'eur-lex' },
  'nis2-de': { celex: '32022L2555', language: 'de', jurisdiction: 'EU', effectiveFrom: '2024-10-17', transport: 'eur-lex' },
  'dora-de': { celex: '32022R2554', language: 'de', jurisdiction: 'EU', effectiveFrom: '2025-01-17', transport: 'eur-lex' },

  // ─── THE-511: regel-lose Gesetze (UC-LAW-002 Discovery-Wert), ganze Gesetze, DE+EN ───
  'cra-en': { celex: '32024R2847', language: 'en', jurisdiction: 'EU', effectiveFrom: '2024-12-10', transport: 'eur-lex' },
  'cra-de': { celex: '32024R2847', language: 'de', jurisdiction: 'EU', effectiveFrom: '2024-12-10', transport: 'eur-lex' },
  'mdr-en': { celex: '32017R0745', language: 'en', jurisdiction: 'EU', effectiveFrom: '2021-05-26', transport: 'eur-lex' },
  'mdr-de': { celex: '32017R0745', language: 'de', jurisdiction: 'EU', effectiveFrom: '2021-05-26', transport: 'eur-lex' },
  'psd2-en': { celex: '32015L2366', language: 'en', jurisdiction: 'EU', effectiveFrom: '2018-01-13', transport: 'eur-lex' },
  'psd2-de': { celex: '32015L2366', language: 'de', jurisdiction: 'EU', effectiveFrom: '2018-01-13', transport: 'eur-lex' },
  'eprivacy-en': { celex: '32002L0058', language: 'en', jurisdiction: 'EU', effectiveFrom: '2002-07-31', transport: 'eur-lex' },
  'eprivacy-de': { celex: '32002L0058', language: 'de', jurisdiction: 'EU', effectiveFrom: '2002-07-31', transport: 'eur-lex' },
  'eidas-en': { celex: '32014R0910', language: 'en', jurisdiction: 'EU', effectiveFrom: '2016-07-01', transport: 'eur-lex' },
  'eidas-de': { celex: '32014R0910', language: 'de', jurisdiction: 'EU', effectiveFrom: '2016-07-01', transport: 'eur-lex' },
};

/**
 * EUR-Lex HTML URL formula (generic, not per-law) — extracted from the
 * `EurLexSource` constructor's internal derivation (eur-lex.ts:58-60). Also
 * used by the registry to build the mandatory `FirecrawlSourceConfig.url`
 * before constructing a `FirecrawlSource` for an eur-lex-transport row.
 */
export function deriveEurLexUrl(celex: string, language: string): string {
  return `https://eur-lex.europa.eu/legal-content/${language.toUpperCase()}/TXT/HTML/?uri=CELEX:${celex}`;
}
