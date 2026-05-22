/**
 * Firecrawl-based Source — handles JS-rendered / WAF-protected sites.
 *
 * Calls the Firecrawl API (cloud or self-hosted), gets back rendered Markdown,
 * parses it into ParsedRegulation candidates.
 *
 * Use cases:
 *   - EUR-Lex (NIS2, DSGVO) — blocked by AWS CloudFront WAF for direct curl
 *   - Other JS-heavy regulatory sites
 *
 * Linear: THE-285 (EUR-Lex Crawler via Firecrawl)
 */
import axios, { AxiosInstance } from 'axios';
import { ParsedRegulation, SourceParser, SourceParseError } from './types';
import type {
  RegulationSource,
  RegulationJurisdiction,
  RegulationLanguage,
} from '@thearchitect/shared';

const DEFAULT_FIRECRAWL_API_URL = 'https://api.firecrawl.dev';
const DEFAULT_WAIT_FOR_MS = 5_000;

export interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

export interface FirecrawlSourceConfig {
  source: RegulationSource;
  jurisdiction: RegulationJurisdiction;
  language: RegulationLanguage;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  /** Target URL to scrape */
  url: string;
  /** Filter to specific article numbers (optional) */
  articleNumbers?: number[];
  /** Firecrawl API key — required for cloud, may be ignored by self-hosted */
  apiKey: string;
  /** Override Firecrawl base URL — default https://api.firecrawl.dev */
  apiUrl?: string;
  /** ms to wait for JS render. Default 5000 */
  waitFor?: number;
  /** Override axios instance — useful for tests */
  httpClient?: AxiosInstance;
}

export class FirecrawlSource implements SourceParser {
  readonly source: RegulationSource;
  readonly description: string;

  private readonly config: FirecrawlSourceConfig;
  private readonly http: AxiosInstance;
  private readonly apiUrl: string;

  constructor(config: FirecrawlSourceConfig) {
    this.config = config;
    this.source = config.source;
    this.apiUrl = (config.apiUrl ?? DEFAULT_FIRECRAWL_API_URL).replace(/\/$/, '');
    this.description = `Firecrawl(${config.source.toUpperCase()}) → ${config.url}`;
    this.http =
      config.httpClient ??
      axios.create({
        timeout: 90_000,
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
  }

  async crawl(): Promise<ParsedRegulation[]> {
    let response;
    try {
      response = await this.http.post<FirecrawlScrapeResponse>(`${this.apiUrl}/v1/scrape`, {
        url: this.config.url,
        formats: ['markdown'],
        waitFor: this.config.waitFor ?? DEFAULT_WAIT_FOR_MS,
        onlyMainContent: true,
      });
    } catch (err) {
      throw new SourceParseError(this.source, `Firecrawl request failed: ${(err as Error).message}`, err);
    }

    const body = response.data;
    if (!body?.success) {
      throw new SourceParseError(
        this.source,
        `Firecrawl returned error: ${body?.error ?? 'unknown'}`
      );
    }
    const markdown = body.data?.markdown;
    if (!markdown || markdown.length < 100) {
      throw new SourceParseError(
        this.source,
        `Firecrawl returned no/short markdown (${markdown?.length ?? 0} chars)`
      );
    }

    return this.parseMarkdown(markdown);
  }

  /**
   * Public for unit tests. Parses Markdown output from Firecrawl into ParsedRegulation[].
   * Handles both EN ("Article 21") and DE ("Artikel 21") article header patterns.
   * Tolerates markdown decoration (#, *, _) around the article header.
   */
  parseMarkdown(markdown: string): ParsedRegulation[] {
    const lines = markdown.split('\n');
    const articleRegex =
      this.config.language === 'de'
        ? /^[\s#*_]*Artikel\s+(\d+[a-z]?)\b/i
        : /^[\s#*_]*Article\s+(\d+[a-z]?)\b/i;

    // Find indices of all article header lines
    const starts: Array<{ idx: number; num: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(articleRegex);
      if (m) starts.push({ idx: i, num: m[1] });
    }

    const results: ParsedRegulation[] = [];
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = starts[i + 1]?.idx ?? lines.length;
      const articleNumInt = parseInt(start.num, 10);
      if (this.config.articleNumbers && !this.config.articleNumbers.includes(articleNumInt)) continue;

      // Title: first short non-empty line after header that isn't body content
      let title = '';
      let bodyStart = start.idx + 1;
      for (let j = start.idx + 1; j < end && j < start.idx + 6; j++) {
        const raw = lines[j];
        if (!raw.trim()) continue;
        const cleaned = raw
          .trim()
          .replace(/^[#*_\s]+/, '')
          .replace(/[*_\s]+$/, '')
          .trim();
        if (cleaned.length === 0) continue;
        // Heuristic: title is short, not a numbered paragraph, not a header line itself
        if (cleaned.length < 200 && !/^(\d+\.|\(\d+\)|[a-z]\))/i.test(cleaned)) {
          title = cleaned;
          bodyStart = j + 1;
          break;
        }
        break; // first non-empty line that looks like body → no title
      }

      const fullText = lines
        .slice(bodyStart, end)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !/^[-*_=]{3,}$/.test(l))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (fullText.length < 50) continue;

      results.push({
        source: this.config.source,
        jurisdiction: this.config.jurisdiction,
        paragraphNumber: `Art. ${start.num}`,
        title: title || `Article ${start.num}`,
        fullText: fullText.substring(0, 19_990),
        sourceUrl: this.config.url,
        effectiveFrom: this.config.effectiveFrom,
        effectiveUntil: this.config.effectiveUntil,
        language: this.config.language,
      });
    }

    return results;
  }
}

// ──────────────────────────────────────────────────────────────────
// Convenience factories
// ──────────────────────────────────────────────────────────────────

export interface FirecrawlFactoryOptions {
  apiKey: string;
  apiUrl?: string;
  articleNumbers?: number[];
  httpClient?: AxiosInstance;
}

/** NIS2 (EU 2022/2555) via Firecrawl → EUR-Lex EN. */
export function nis2FirecrawlSource(opts: FirecrawlFactoryOptions): FirecrawlSource {
  return new FirecrawlSource({
    source: 'nis2',
    jurisdiction: 'EU',
    language: 'en',
    effectiveFrom: new Date('2024-10-17'),
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555',
    articleNumbers: opts.articleNumbers,
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    httpClient: opts.httpClient,
  });
}

/** DSGVO/GDPR (EU 2016/679) via Firecrawl → EUR-Lex DE. */
export function dsgvoFirecrawlSource(opts: FirecrawlFactoryOptions): FirecrawlSource {
  return new FirecrawlSource({
    source: 'dsgvo',
    jurisdiction: 'EU',
    language: 'de',
    effectiveFrom: new Date('2018-05-25'),
    url: 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32016R0679',
    articleNumbers: opts.articleNumbers ?? [5, 6, 9, 32],
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    httpClient: opts.httpClient,
  });
}
