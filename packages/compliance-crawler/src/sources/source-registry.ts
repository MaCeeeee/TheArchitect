import type { RegulationSource } from '@thearchitect/shared';
import type { SourceParser } from './types';
import {
  nis2EurLexSource, dsgvoEurLexSource, aiActEurLexSource, dataActEurLexSource,
} from './eur-lex';
import {
  nis2FirecrawlSource, dsgvoFirecrawlSource, aiActFirecrawlSource, dataActFirecrawlSource,
} from './firecrawl';
import { lksgSource } from './gesetze-im-internet';

/** Runtime inputs the registry needs to pick a transport (Firecrawl vs. direct). */
export interface RegistryEnv {
  firecrawlKey?: string;
  firecrawlUrl?: string;
}

/**
 * One data entry per ingestable source. `adapter`/`format` are provenance labels
 * (THE-414 AC-3). `make` wraps the exact adapter-factory call. A new source that
 * reuses an existing adapter = one more entry here — no new class, no enum edit.
 * A source needing a NEW transport (CELLAR-AKN, Fedlex-SPARQL…) is THE-439.
 */
export interface SourceEntry {
  id: RegulationSource;
  adapter: string;   // provenance: which ingest adapter produced the fact
  format: string;    // provenance: source format (today: 'html')
  make: (env: RegistryEnv) => SourceParser;
}

export const SOURCE_ENTRIES: SourceEntry[] = [
  {
    id: 'nis2', adapter: 'eur-lex', format: 'html',
    make: ({ firecrawlKey, firecrawlUrl }) =>
      firecrawlKey
        ? nis2FirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, articleNumbers: [20, 21, 22, 23, 24] })
        : nis2EurLexSource({ articleNumbers: [20, 21, 22, 23, 24] }),
  },
  {
    id: 'dsgvo', adapter: 'eur-lex', format: 'html',
    make: ({ firecrawlKey, firecrawlUrl }) =>
      firecrawlKey
        ? dsgvoFirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, articleNumbers: [5, 6, 9, 32] })
        : dsgvoEurLexSource({ articleNumbers: [5, 6, 9, 32] }),
  },
  {
    id: 'lksg', adapter: 'gesetze-im-internet', format: 'html',
    make: () => lksgSource({ paragraphNumbers: [3, 4, 5, 6, 7, 8, 9] }),
  },
  ...(['en', 'de'] as const).flatMap((lang): SourceEntry[] => [
    {
      id: `ai-act-${lang}` as RegulationSource, adapter: 'eur-lex', format: 'html',
      make: ({ firecrawlKey, firecrawlUrl }) =>
        firecrawlKey
          ? aiActFirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, language: lang })
          : aiActEurLexSource({ language: lang }),
    },
    {
      id: `data-act-${lang}` as RegulationSource, adapter: 'eur-lex', format: 'html',
      make: ({ firecrawlKey, firecrawlUrl }) =>
        firecrawlKey
          ? dataActFirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, language: lang })
          : dataActEurLexSource({ language: lang }),
    },
  ]),
];

const BY_ID = new Map(SOURCE_ENTRIES.map((e) => [e.id, e]));

export const getSourceEntry = (id: string): SourceEntry | undefined => BY_ID.get(id as RegulationSource);

/** Build a parser for a source, or null if no adapter is wired (caller → "not yet implemented"). */
export function resolveSourceParser(id: string, env: RegistryEnv): SourceParser | null {
  const entry = BY_ID.get(id as RegulationSource);
  return entry ? entry.make(env) : null;
}
