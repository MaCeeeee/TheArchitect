/**
 * EUR-Lex Source — fetches NIS2 (Directive (EU) 2022/2555) from the EU's official portal.
 *
 * URL format: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555
 *
 * Strategy: HTML scraping via cheerio. EUR-Lex publishes Formex-derived HTML where each
 * article header carries class `oj-ti-art` (e.g., "Article 21"), followed by an optional
 * subtitle (`oj-sti-art`) and body paragraphs (`oj-normal`).
 *
 * Linear: THE-276 (REQ-ICM-001.2)
 */
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { ParsedRegulation, SourceParser, SourceParseError } from './types';

const DEFAULT_USER_AGENT = 'TheArchitect-Compliance-Crawler/1.0';

export interface EurLexNis2Options {
  /** Limit which article numbers to keep (e.g., [20, 21, 22, 23, 24] for NIS2 demo set) */
  articleNumbers?: number[];
  /** Override URL — useful for tests with fixture HTML */
  url?: string;
  /** Override axios instance — useful for tests */
  httpClient?: AxiosInstance;
  /** Custom User-Agent (defaults to TheArchitect-Compliance-Crawler/1.0) */
  userAgent?: string;
}

const DEFAULT_URL =
  'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555';

const NIS2_EFFECTIVE_FROM = new Date('2024-10-17'); // NIS2 transposition deadline

export class EurLexNis2Source implements SourceParser {
  readonly source = 'nis2' as const;
  readonly description = 'EU Directive 2022/2555 (NIS2) via EUR-Lex';

  private readonly url: string;
  private readonly articleNumbers: number[] | undefined;
  private readonly http: AxiosInstance;

  constructor(opts: EurLexNis2Options = {}) {
    this.url = opts.url ?? DEFAULT_URL;
    this.articleNumbers = opts.articleNumbers;
    this.http =
      opts.httpClient ??
      axios.create({
        timeout: 30_000,
        headers: { 'User-Agent': opts.userAgent ?? DEFAULT_USER_AGENT },
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
   * Public for unit-testing. Accepts raw HTML string, returns parsed articles.
   */
  parseHtml(html: string): ParsedRegulation[] {
    const $ = cheerio.load(html);
    const results: ParsedRegulation[] = [];

    // Find all "Article XX" headers. EUR-Lex uses <p class="oj-ti-art">Article 21</p>
    // We also tolerate <p class="ti-art"> as a fallback.
    const titleSelector = 'p.oj-ti-art, p.ti-art';

    $(titleSelector).each((_idx, el) => {
      const titleEl = $(el);
      const titleText = titleEl.text().trim();
      const articleMatch = titleText.match(/Article\s+(\d+[a-z]?)/i);
      if (!articleMatch) return;

      const articleNum = articleMatch[1];
      const articleNumInt = parseInt(articleNum, 10);

      // Apply filter if provided
      if (this.articleNumbers && !this.articleNumbers.includes(articleNumInt)) {
        return;
      }

      // Subtitle: next sibling with oj-sti-art (article title)
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

      // Collect body paragraphs until next article title
      const bodyParts: string[] = [];
      let walker: cheerio.Cheerio<any> = subtitle ? currentEl : titleEl.next();
      while (walker.length > 0 && !walker.is(titleSelector)) {
        const txt = walker.text().trim();
        if (txt.length > 0) bodyParts.push(txt);
        walker = walker.next();
      }

      const fullText = bodyParts.join('\n\n').replace(/\s+/g, ' ').trim();

      // Skip if too short — likely a parse miss
      if (fullText.length < 50) return;

      results.push({
        source: this.source,
        jurisdiction: 'EU',
        paragraphNumber: `Art. ${articleNum}`,
        title: subtitle || titleText,
        fullText: fullText.substring(0, 19_990), // safety: stay under model maxlength 20000
        sourceUrl: this.url,
        effectiveFrom: NIS2_EFFECTIVE_FROM,
        language: 'en',
      });
    });

    return results;
  }
}
