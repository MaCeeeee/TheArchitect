/**
 * EUR-Lex Source — fetches EU legal acts (Directives, Regulations) from the official portal.
 *
 * Examples (CELEX numbers):
 *   - NIS2 Directive: 32022L2555
 *   - GDPR (DSGVO):   32016R0679
 *   - DORA:           32022R2554
 *
 * URL pattern: https://eur-lex.europa.eu/legal-content/{LANG}/TXT/HTML/?uri=CELEX:{CELEX}
 *
 * Strategy: HTML scraping via cheerio. EUR-Lex publishes Formex-derived HTML where each
 * article header carries class `oj-ti-art` (e.g., "Article 21" in EN or "Artikel 21" in DE),
 * followed by an optional subtitle (`oj-sti-art`) and body paragraphs (`oj-normal`).
 *
 * Linear: THE-276 (REQ-ICM-001.2)
 */
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { ParsedRegulation, SourceParser, SourceParseError } from './types';
import type {
  RegulationSource,
  RegulationJurisdiction,
  RegulationLanguage,
} from '@thearchitect/shared';

const DEFAULT_USER_AGENT = 'TheArchitect-Compliance-Crawler/1.0';

export interface EurLexSourceConfig {
  source: RegulationSource;
  jurisdiction: RegulationJurisdiction;
  language: RegulationLanguage;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  /** CELEX number, e.g., '32022L2555' for NIS2 or '32016R0679' for GDPR */
  celex: string;
  /** Filter to specific article numbers (optional) */
  articleNumbers?: number[];
  /** Override URL (for tests with fixture HTML) */
  url?: string;
  httpClient?: AxiosInstance;
  userAgent?: string;
}

export class EurLexSource implements SourceParser {
  readonly source: RegulationSource;
  readonly description: string;

  private readonly url: string;
  private readonly config: EurLexSourceConfig;
  private readonly http: AxiosInstance;

  constructor(config: EurLexSourceConfig) {
    this.config = config;
    this.source = config.source;
    this.description = `EUR-Lex CELEX:${config.celex} (${config.source.toUpperCase()} / ${config.language.toUpperCase()})`;
    const langCode = config.language.toUpperCase();
    this.url =
      config.url ??
      `https://eur-lex.europa.eu/legal-content/${langCode}/TXT/HTML/?uri=CELEX:${config.celex}`;
    this.http =
      config.httpClient ??
      axios.create({
        timeout: 30_000,
        headers: { 'User-Agent': config.userAgent ?? DEFAULT_USER_AGENT },
      });
  }

  async crawl(): Promise<ParsedRegulation[]> {
    let html: string;
    try {
      const response = await this.http.get<string>(this.url, { responseType: 'text' });
      html = response.data;
    } catch (err) {
      throw new SourceParseError(this.source, `Failed to fetch ${this.url}`, err);
    }
    return this.parseHtml(html);
  }

  /**
   * Public for unit tests. Accepts raw HTML, returns ParsedRegulation candidates.
   * Tolerates language differences (Article vs. Artikel) and missing oj- class prefixes.
   */
  parseHtml(html: string): ParsedRegulation[] {
    const $ = cheerio.load(html);
    const results: ParsedRegulation[] = [];

    // Article header selector — EUR-Lex Formex HTML
    const titleSelector = 'p.oj-ti-art, p.ti-art';

    // Language-sensitive article-number extraction: EN "Article 21", DE "Artikel 21"
    const articleRegex =
      this.config.language === 'de' ? /Artikel\s+(\d+[a-z]?)/i : /Article\s+(\d+[a-z]?)/i;

    $(titleSelector).each((_idx, el) => {
      const titleEl = $(el);
      const titleText = titleEl.text().trim();
      const articleMatch = titleText.match(articleRegex);
      if (!articleMatch) return;

      const articleNum = articleMatch[1];
      const articleNumInt = parseInt(articleNum, 10);

      if (this.config.articleNumbers && !this.config.articleNumbers.includes(articleNumInt)) {
        return;
      }

      // Subtitle on next sibling with oj-sti-art
      let subtitle = '';
      let currentEl: cheerio.Cheerio<any> = titleEl.next();
      while (currentEl.length > 0 && !currentEl.is(titleSelector)) {
        if (currentEl.hasClass('oj-sti-art') || currentEl.hasClass('sti-art')) {
          subtitle = currentEl.text().trim();
          currentEl = currentEl.next();
          break;
        }
        if (currentEl.text().trim().length > 0) break;
        currentEl = currentEl.next();
      }

      // Body: collect siblings until next article header
      const bodyParts: string[] = [];
      let walker: cheerio.Cheerio<any> = subtitle ? currentEl : titleEl.next();
      while (walker.length > 0 && !walker.is(titleSelector)) {
        const txt = walker.text().trim();
        if (txt.length > 0) bodyParts.push(txt);
        walker = walker.next();
      }

      const fullText = bodyParts.join('\n\n').replace(/\s+/g, ' ').trim();
      if (fullText.length < 50) return; // skip parse-misses

      results.push({
        source: this.config.source,
        jurisdiction: this.config.jurisdiction,
        paragraphNumber: `Art. ${articleNum}`,
        title: subtitle || titleText,
        fullText: fullText.substring(0, 19_990),
        sourceUrl: this.url,
        effectiveFrom: this.config.effectiveFrom,
        effectiveUntil: this.config.effectiveUntil,
        language: this.config.language,
      });
    });

    return results;
  }
}

// ──────────────────────────────────────────────────────────────────
// Convenience factories per known regulation
// ──────────────────────────────────────────────────────────────────

export interface FactoryOptions {
  articleNumbers?: number[];
  url?: string;
  httpClient?: AxiosInstance;
}

/** NIS2 Directive (EU 2022/2555) — English by default. Demo set: Art. 20–24. */
export function nis2EurLexSource(opts: FactoryOptions = {}): EurLexSource {
  return new EurLexSource({
    source: 'nis2',
    jurisdiction: 'EU',
    language: 'en',
    effectiveFrom: new Date('2024-10-17'),
    celex: '32022L2555',
    articleNumbers: opts.articleNumbers,
    url: opts.url,
    httpClient: opts.httpClient,
  });
}

/** GDPR / DSGVO (EU 2016/679) — German. Demo set: Art. 5, 6, 9, 32. */
export function dsgvoEurLexSource(opts: FactoryOptions = {}): EurLexSource {
  return new EurLexSource({
    source: 'dsgvo',
    jurisdiction: 'EU',
    language: 'de',
    effectiveFrom: new Date('2018-05-25'),
    celex: '32016R0679',
    articleNumbers: opts.articleNumbers ?? [5, 6, 9, 32],
    url: opts.url,
    httpClient: opts.httpClient,
  });
}

/** Options for language-parametrised acts (AI Act, Data Act). */
export interface LangFactoryOptions extends FactoryOptions {
  language: RegulationLanguage;
}

/**
 * EU AI Act (EU 2024/1689) — direct EUR-Lex (fallback / tests). Source key encodes
 * the language so DE and EN don't collide on the `source:paragraph` regulationKey.
 * Production uses `aiActFirecrawlSource` (EUR-Lex is behind AWS WAF).
 */
export function aiActEurLexSource(opts: LangFactoryOptions): EurLexSource {
  return new EurLexSource({
    source: opts.language === 'de' ? 'ai-act-de' : 'ai-act-en',
    jurisdiction: 'EU',
    language: opts.language,
    effectiveFrom: new Date('2024-08-01'),
    celex: '32024R1689',
    articleNumbers: opts.articleNumbers,
    url: opts.url,
    httpClient: opts.httpClient,
  });
}

/**
 * EU Data Act (EU 2023/2854) — direct EUR-Lex (fallback / tests). Source key encodes
 * the language. Production uses `dataActFirecrawlSource`.
 */
export function dataActEurLexSource(opts: LangFactoryOptions): EurLexSource {
  return new EurLexSource({
    source: opts.language === 'de' ? 'data-act-de' : 'data-act-en',
    jurisdiction: 'EU',
    language: opts.language,
    effectiveFrom: new Date('2024-01-11'),
    celex: '32023R2854',
    articleNumbers: opts.articleNumbers,
    url: opts.url,
    httpClient: opts.httpClient,
  });
}

/**
 * @deprecated Use `nis2EurLexSource()` factory instead. Kept for backwards compatibility.
 */
export class EurLexNis2Source extends EurLexSource {
  constructor(opts: FactoryOptions = {}) {
    super({
      source: 'nis2',
      jurisdiction: 'EU',
      language: 'en',
      effectiveFrom: new Date('2024-10-17'),
      celex: '32022L2555',
      articleNumbers: opts.articleNumbers,
      url: opts.url,
      httpClient: opts.httpClient,
    });
  }
}
