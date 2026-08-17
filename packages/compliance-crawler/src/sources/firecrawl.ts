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
import { cleanRegulationText } from './clean';
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
    const wort = this.config.language === 'de' ? 'Artikel' : 'Article';

    // THE-684: Eine echte Überschrift IST die ganze Zeile. Eine Zeile, die nur
    // damit BEGINNT, ist ein Zitat im Fließtext — und genau so fängt jeder
    // Änderungsartikel an: „Artikel 45 der Verordnung (EU) Nr. 909/2014 wird
    // wie folgt geändert:". Die alte Regel las das als neue Überschrift, brach
    // den laufenden Artikel davor ab (Rumpf leer → still verworfen) und legte
    // den Inhalt unter der ZITIERTEN Nummer ab, wo er den echten Artikel
    // überschrieb. Vier verlorene und zwei überschriebene Artikel im Korpus.
    const ueberschrift = new RegExp(`^[\\s#*_]*${wort}\\s+(\\d+[a-z]?)[\\s#*_]*$`, 'i');
    const nurZeilenanfang = new RegExp(`^[\\s#*_]*${wort}\\s+(\\d+[a-z]?)\\b`, 'i');

    const starts: Array<{ idx: number; num: string }> = [];
    let zitateImFliesstext = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(ueberschrift);
      if (m) starts.push({ idx: i, num: m[1] });
      else if (nurZeilenanfang.test(lines[i])) zitateImFliesstext++;
    }

    // Wächter gegen die eigene Annahme: Sollte die Markdown-Form je Überschrift
    // und Untertitel in EINER Zeile liefern, findet die strenge Regel nichts —
    // dann bricht der Lauf laut ab, statt still ein leeres Gesetz zu schreiben.
    if (starts.length === 0 && zitateImFliesstext > 0) {
      throw new SourceParseError(
        this.source,
        `Keine eigenständige Artikel-Überschrift gefunden, aber ${zitateImFliesstext} Zeilen beginnen mit „${wort} N". ` +
          `Die Markdown-Form hat sich geändert — Parser prüfen, nicht überschreiben.`
      );
    }

    const results: ParsedRegulation[] = [];
    const verworfen: string[] = [];
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

      const fullText = cleanRegulationText(
        lines
          .slice(bodyStart, end)
          .map(l => l.trim())
          .filter(l => l.length > 0 && !/^[-*_=]{3,}$/.test(l))
          .join(' ')
      );

      // THE-684: Das stille `continue` hat die vier verlorenen Artikel gedeckt.
      // Ein verworfener Artikel wird ab jetzt benannt — eine leere Messung ist
      // kein Bestehen, und ein Verlust darf nicht als Erfolg durchgehen.
      if (fullText.length < 50) {
        verworfen.push(`${start.num} (${fullText.length} Z.)`);
        continue;
      }

      results.push({
        source: this.config.source,
        jurisdiction: this.config.jurisdiction,
        paragraphNumber: `Art. ${start.num}`,
        title: title || `${wort} ${start.num}`,
        fullText: fullText.substring(0, 19_990),
        sourceUrl: this.config.url,
        effectiveFrom: this.config.effectiveFrom,
        effectiveUntil: this.config.effectiveUntil,
        language: this.config.language,
      });
    }

    if (verworfen.length > 0) {
      console.warn(
        `[${this.source}] ${verworfen.length} Artikel wegen zu kurzem Rumpf verworfen: ${verworfen.join(', ')}`
      );
    }
    return results;
  }
}

// Per-law convenience factories (nis2FirecrawlSource, dsgvoFirecrawlSource,
// aiActFirecrawlSource, dataActFirecrawlSource) were removed in THE-418
// (.6-Kern): source-registry.ts now builds `FirecrawlSource` instances
// generically from `crawl-config.ts` (SOURCE_CRAWL_CONFIG), deriving the URL
// via `deriveEurLexUrl()` — a new law is a data row, not a new factory function.
