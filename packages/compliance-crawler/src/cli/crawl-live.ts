/**
 * Live crawler CLI — manual integration test against real public sources.
 *
 * Usage:
 *   npm run crawl:nis2:live          # NIS2 from EUR-Lex
 *   npx ts-node-dev --transpile-only src/cli/crawl-live.ts dsgvo
 *   npx ts-node-dev --transpile-only src/cli/crawl-live.ts lksg
 *
 * Does NOT write to Mongo — only fetches + parses and prints summary.
 * Used during development to verify selectors still match real-world output.
 */
import {
  nis2EurLexSource,
  dsgvoEurLexSource,
  aiActEurLexSource,
  dataActEurLexSource,
} from '../sources/eur-lex';
import { lksgSource } from '../sources/gesetze-im-internet';
import type { SourceParser } from '../sources/types';
import type { RegulationSource } from '@thearchitect/shared';

const SOURCES: Partial<Record<RegulationSource, () => SourceParser>> = {
  nis2: () => nis2EurLexSource({ articleNumbers: [20, 21, 22, 23, 24] }),
  dsgvo: () => dsgvoEurLexSource({ articleNumbers: [5, 6, 9, 32] }),
  lksg: () => lksgSource({ paragraphNumbers: [3, 4, 5, 6, 7, 8, 9] }),
  // Full-act crawl (no filter). Note: direct EUR-Lex is WAF-blocked in the cloud,
  // so these succeed locally but production uses the Firecrawl path via /crawl.
  'ai-act-en': () => aiActEurLexSource({ language: 'en' }),
  'ai-act-de': () => aiActEurLexSource({ language: 'de' }),
  'data-act-en': () => dataActEurLexSource({ language: 'en' }),
  'data-act-de': () => dataActEurLexSource({ language: 'de' }),
};

async function main(): Promise<void> {
  const sourceKey = (process.argv[2] ?? 'nis2') as RegulationSource;
  const factory = SOURCES[sourceKey];

  if (!factory) {
    console.error(
      `Unsupported source: ${sourceKey}. Available: ${Object.keys(SOURCES).join(', ')}`
    );
    process.exit(1);
  }

  console.log(`Live-crawling source: ${sourceKey}`);
  const parser = factory();
  const start = Date.now();

  try {
    const results = await parser.crawl();
    const elapsed = Date.now() - start;
    console.log(`Done. ${results.length} paragraphs in ${elapsed}ms.\n`);
    for (const r of results) {
      console.log(`──── ${r.paragraphNumber} · ${r.title} ────`);
      console.log(`Source : ${r.sourceUrl}`);
      console.log(
        `Lang   : ${r.language} · Jurisdiction: ${r.jurisdiction} · Effective from: ${r.effectiveFrom.toISOString().slice(0, 10)}`
      );
      console.log(`Length : ${r.fullText.length} chars`);
      console.log(`Preview: ${r.fullText.substring(0, 200)}...\n`);
    }
  } catch (err) {
    console.error('Crawl failed:', err);
    process.exit(1);
  }
}

main();
