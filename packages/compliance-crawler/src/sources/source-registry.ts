import type { RegulationSource } from '@thearchitect/shared';
import type { SourceParser } from './types';
import { EurLexSource } from './eur-lex';
import { FirecrawlSource } from './firecrawl';
import { GesetzeImInternetSource } from './gesetze-im-internet';
import { SOURCE_CRAWL_CONFIG, deriveEurLexUrl, type CrawlConfig } from './crawl-config';

/** Runtime inputs the registry needs to pick a transport (Firecrawl vs. direct). */
export interface RegistryEnv {
  firecrawlKey?: string;
  firecrawlUrl?: string;
}

/**
 * One data entry per ingestable source. `adapter`/`format` are provenance labels
 * (THE-414 AC-3). `make` builds the parser generically from the source's
 * `CrawlConfig` row (THE-418 .6-Kern). A new source that reuses an existing
 * transport = one more row in `crawl-config.ts` — no new class, no new factory,
 * no edit here. A source needing a NEW transport (CELLAR-AKN, Fedlex-SPARQL…)
 * is THE-439.
 */
export interface SourceEntry {
  id: RegulationSource;
  adapter: string;   // provenance: which ingest adapter produced the fact
  format: string;    // provenance: source format (today: 'html')
  make: (env: RegistryEnv) => SourceParser;
}

function effectiveFromDate(cfg: CrawlConfig): Date {
  return cfg.effectiveFrom ? new Date(cfg.effectiveFrom) : new Date(0);
}

/** Builds a `SourceEntry` for one `crawl-config.ts` row, dispatching on `transport`. */
function buildEntry(id: string, cfg: CrawlConfig): SourceEntry {
  const source = id as RegulationSource;

  if (cfg.transport === 'eur-lex') {
    return {
      id: source,
      adapter: 'eur-lex',
      format: 'html',
      make: ({ firecrawlKey, firecrawlUrl }) => {
        if (!cfg.celex || !cfg.language) {
          throw new Error(
            `crawl-config: source '${id}' has transport 'eur-lex' but is missing celex/language`
          );
        }
        const effectiveFrom = effectiveFromDate(cfg);
        if (firecrawlKey) {
          return new FirecrawlSource({
            source,
            jurisdiction: cfg.jurisdiction,
            language: cfg.language,
            effectiveFrom,
            url: deriveEurLexUrl(cfg.celex, cfg.language),
            articleNumbers: cfg.articleNumbers,
            apiKey: firecrawlKey,
            apiUrl: firecrawlUrl,
          });
        }
        return new EurLexSource({
          source,
          jurisdiction: cfg.jurisdiction,
          language: cfg.language,
          effectiveFrom,
          celex: cfg.celex,
          articleNumbers: cfg.articleNumbers,
        });
      },
    };
  }

  if (cfg.transport === 'gesetze-im-internet') {
    return {
      id: source,
      adapter: 'gesetze-im-internet',
      format: 'html',
      make: () => {
        if (!cfg.lawSlug || !cfg.paragraphNumbers) {
          throw new Error(
            `crawl-config: source '${id}' has transport 'gesetze-im-internet' but is missing lawSlug/paragraphNumbers`
          );
        }
        return new GesetzeImInternetSource({
          source,
          jurisdiction: cfg.jurisdiction,
          effectiveFrom: effectiveFromDate(cfg),
          lawSlug: cfg.lawSlug,
          paragraphNumbers: cfg.paragraphNumbers.map(Number),
        });
      },
    };
  }

  // transport === 'firecrawl' (a source with no eur-lex fallback, Firecrawl-only)
  // has no generic engine yet — first caller wires it under THE-439.
  return {
    id: source,
    adapter: cfg.transport,
    format: 'html',
    make: () => {
      throw new Error(
        `crawl-config: source '${id}' declares transport '${cfg.transport}', which has no generic engine yet (THE-439)`
      );
    },
  };
}

export const SOURCE_ENTRIES: SourceEntry[] = Object.entries(SOURCE_CRAWL_CONFIG).map(([id, cfg]) =>
  buildEntry(id, cfg)
);

const BY_ID = new Map(SOURCE_ENTRIES.map((e) => [e.id, e]));

export const getSourceEntry = (id: string): SourceEntry | undefined => BY_ID.get(id as RegulationSource);

/** Build a parser for a source, or null if no adapter is wired (caller → "not yet implemented"). */
export function resolveSourceParser(id: string, env: RegistryEnv): SourceParser | null {
  const entry = BY_ID.get(id as RegulationSource);
  return entry ? entry.make(env) : null;
}
