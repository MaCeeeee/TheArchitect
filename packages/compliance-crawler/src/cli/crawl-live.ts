/**
 * Live crawler CLI — manual integration test against real EUR-Lex.
 *
 * Usage: npm run crawl:nis2:live
 *
 * Does NOT write to Mongo — only fetches + parses and prints summary.
 * Used during development to verify that EUR-Lex selectors still match
 * before pushing changes that would hit the real DB.
 */
import { EurLexNis2Source } from '../sources/eur-lex';

async function main(): Promise<void> {
  const source = process.argv[2] ?? 'nis2';
  if (source !== 'nis2') {
    console.error(`Unsupported source: ${source}. Only "nis2" is implemented in D2.`);
    process.exit(1);
  }

  console.log(`Live-crawling source: ${source}`);
  const parser = new EurLexNis2Source({ articleNumbers: [20, 21, 22, 23, 24] });
  const start = Date.now();

  try {
    const results = await parser.crawl();
    const elapsed = Date.now() - start;
    console.log(`Done. ${results.length} articles in ${elapsed}ms.`);
    for (const r of results) {
      console.log(`\n──── ${r.paragraphNumber} · ${r.title} ────`);
      console.log(`Source : ${r.sourceUrl}`);
      console.log(`Lang   : ${r.language} · Effective from: ${r.effectiveFrom.toISOString().slice(0, 10)}`);
      console.log(`Length : ${r.fullText.length} chars`);
      console.log(`Preview: ${r.fullText.substring(0, 200)}...`);
    }
  } catch (err) {
    console.error('Crawl failed:', err);
    process.exit(1);
  }
}

main();
