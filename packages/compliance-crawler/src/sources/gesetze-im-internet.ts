/**
 * gesetze-im-internet.de Source — fetches German federal law paragraphs.
 *
 * URL pattern (single paragraph):
 *   https://www.gesetze-im-internet.de/{slug}/__{n}.html
 * Examples:
 *   - LkSG § 3:  https://www.gesetze-im-internet.de/lksg/__3.html
 *   - BDSG § 22: https://www.gesetze-im-internet.de/bdsg_2018/__22.html
 *
 * Strategy: One HTTP request per paragraph (n in 1..N), polite delay between calls.
 * Parsing via cheerio: title from <h1>/<h2> matching "§ N <title>", body from
 * <div class="jurAbsatz"> elements that follow.
 *
 * Linear: THE-276 (REQ-ICM-001.2)
 */
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { ParsedRegulation, SourceParser, SourceParseError } from './types';
import type {
  RegulationSource,
  RegulationJurisdiction,
} from '@thearchitect/shared';

const DEFAULT_USER_AGENT = 'TheArchitect-Compliance-Crawler/1.0';
const DEFAULT_DELAY_MS = 200;

export interface GesetzeImInternetConfig {
  source: RegulationSource;
  jurisdiction: RegulationJurisdiction;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  /** Law slug as used in URL, e.g. 'lksg', 'bdsg_2018', 'dsgvo' */
  lawSlug: string;
  /** Paragraph numbers to fetch (e.g. [3, 4, 5, 6, 7, 8, 9] for LkSG) */
  paragraphNumbers: number[];
  /** Override base URL (for tests with fixture HTML) — gets {n} appended */
  baseUrl?: string;
  /** Map of paragraphNumber → fixture HTML, for tests without HTTP */
  fixtureMap?: Map<number, string>;
  httpClient?: AxiosInstance;
  userAgent?: string;
  /** Delay between HTTP requests (ms). Default 200ms (polite scraping) */
  requestDelayMs?: number;
}

export class GesetzeImInternetSource implements SourceParser {
  readonly source: RegulationSource;
  readonly description: string;

  private readonly config: GesetzeImInternetConfig;
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(config: GesetzeImInternetConfig) {
    this.config = config;
    this.source = config.source;
    this.description = `gesetze-im-internet.de/${config.lawSlug} (${config.source.toUpperCase()})`;
    this.baseUrl =
      config.baseUrl ?? `https://www.gesetze-im-internet.de/${config.lawSlug}`;
    this.http =
      config.httpClient ??
      axios.create({
        timeout: 30_000,
        headers: { 'User-Agent': config.userAgent ?? DEFAULT_USER_AGENT },
      });
  }

  async crawl(): Promise<ParsedRegulation[]> {
    const results: ParsedRegulation[] = [];
    const delay = this.config.requestDelayMs ?? DEFAULT_DELAY_MS;

    for (const n of this.config.paragraphNumbers) {
      // Fixture path for tests — skip HTTP
      if (this.config.fixtureMap?.has(n)) {
        const html = this.config.fixtureMap.get(n)!;
        const parsed = this.parseHtml(html, n);
        if (parsed) results.push(parsed);
        continue;
      }

      const url = `${this.baseUrl}/__${n}.html`;
      try {
        const response = await this.http.get<string>(url, { responseType: 'text' });
        const parsed = this.parseHtml(response.data, n, url);
        if (parsed) results.push(parsed);
      } catch (err) {
        // Log + continue: one paragraph failure shouldn't kill the whole crawl
        const msg = err instanceof Error ? err.message : 'unknown';
        // eslint-disable-next-line no-console
        console.warn(`[${this.source}] § ${n} fetch failed: ${msg}`);
      }

      // Polite delay between requests
      if (delay > 0 && n !== this.config.paragraphNumbers[this.config.paragraphNumbers.length - 1]) {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    return results;
  }

  /**
   * Public for unit tests. Parses one paragraph HTML page.
   * Returns null if parse fails (e.g., paragraph doesn't exist or HTML is unexpected).
   */
  parseHtml(html: string, expectedNumber: number, sourceUrl?: string): ParsedRegulation | null {
    const $ = cheerio.load(html);

    // Find paragraph header: <h1> or <h2> with text like "§ 3 Sorgfaltspflichten"
    let titleEl = $('h1, h2').filter((_idx, el) => /§\s*\d+/.test($(el).text())).first();
    if (titleEl.length === 0) {
      // Some pages put it in span.jnenbez + span.jntitel sequence
      const enbez = $('.jnenbez').first().text().trim();
      const jntitel = $('.jntitel').first().text().trim();
      if (enbez && jntitel) {
        const match = enbez.match(/§\s*(\d+[a-z]?)/);
        if (!match) return null;
        const num = match[1];
        if (parseInt(num, 10) !== expectedNumber) return null;
        const bodyText = this.extractBody($);
        if (bodyText.length < 50) return null;
        return this.toRegulation({
          paragraphNumber: `§ ${num}`,
          title: jntitel,
          fullText: bodyText,
          sourceUrl: sourceUrl ?? `${this.baseUrl}/__${num}.html`,
        });
      }
      return null;
    }

    const titleText = titleEl.text().trim().replace(/\s+/g, ' ');
    const match = titleText.match(/§\s*(\d+[a-z]?)\s*(.*)/);
    if (!match) return null;

    const num = match[1];
    const title = match[2].trim() || `§ ${num}`;

    // Verify it matches expected paragraph (avoid mis-parsed pages)
    if (parseInt(num, 10) !== expectedNumber) return null;

    const bodyText = this.extractBody($);
    if (bodyText.length < 50) return null;

    return this.toRegulation({
      paragraphNumber: `§ ${num}`,
      title,
      fullText: bodyText,
      sourceUrl: sourceUrl ?? `${this.baseUrl}/__${num}.html`,
    });
  }

  private extractBody($: cheerio.CheerioAPI): string {
    // Try the canonical content container first
    let containers = $('.jurAbsatz');
    if (containers.length === 0) {
      // Fallback: any <p> inside the main content div
      containers = $('.jnhtml p, .container p, body p');
    }

    const parts: string[] = [];
    containers.each((_idx, el) => {
      const txt = $(el).text().trim().replace(/\s+/g, ' ');
      if (txt.length > 0 && !/^Nichtamtliches Inhaltsverzeichnis$/.test(txt)) {
        parts.push(txt);
      }
    });

    return parts.join('\n\n').substring(0, 19_990);
  }

  private toRegulation(args: {
    paragraphNumber: string;
    title: string;
    fullText: string;
    sourceUrl: string;
  }): ParsedRegulation {
    return {
      source: this.config.source,
      jurisdiction: this.config.jurisdiction,
      paragraphNumber: args.paragraphNumber,
      title: args.title,
      fullText: args.fullText,
      sourceUrl: args.sourceUrl,
      effectiveFrom: this.config.effectiveFrom,
      effectiveUntil: this.config.effectiveUntil,
      language: 'de',
    };
  }
}

// ──────────────────────────────────────────────────────────────────
// Convenience factories
// ──────────────────────────────────────────────────────────────────

export interface GesetzeFactoryOptions {
  paragraphNumbers?: number[];
  baseUrl?: string;
  fixtureMap?: Map<number, string>;
  httpClient?: AxiosInstance;
  requestDelayMs?: number;
}

/** LkSG (Lieferkettensorgfaltspflichtengesetz). Demo set: §§ 3–9 */
export function lksgSource(opts: GesetzeFactoryOptions = {}): GesetzeImInternetSource {
  return new GesetzeImInternetSource({
    source: 'lksg',
    jurisdiction: 'DE',
    effectiveFrom: new Date('2023-01-01'),
    lawSlug: 'lksg',
    paragraphNumbers: opts.paragraphNumbers ?? [3, 4, 5, 6, 7, 8, 9],
    baseUrl: opts.baseUrl,
    fixtureMap: opts.fixtureMap,
    httpClient: opts.httpClient,
    requestDelayMs: opts.requestDelayMs,
  });
}

// `bdsgSource` (BDSG 2018, complement to DSGVO) was dead code — never wired into
// source-registry.ts (only `lksgSource` was) — and was removed in THE-418
// (.6-Kern). If BDSG is onboarded later, it's a crawl-config.ts row with
// lawSlug 'bdsg_2018' (source id stays 'dsgvo', per the pattern this factory
// demonstrated), not a new factory.
