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
import { resolveSourceParser, SOURCE_ENTRIES } from '../sources/source-registry';

async function main(): Promise<void> {
  const sourceKey = process.argv[2] ?? 'nis2';
  const parser = resolveSourceParser(sourceKey, {
    firecrawlKey: process.env.FIRECRAWL_API_KEY,
    firecrawlUrl: process.env.FIRECRAWL_API_URL || undefined,
  });
  if (!parser) {
    console.error(`Unsupported source: ${sourceKey}. Available: ${SOURCE_ENTRIES.map((e) => e.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`Live-crawling source: ${sourceKey}`);
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
