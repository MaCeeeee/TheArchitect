/**
 * reqtrace-article-eval — der Artikel-Ebenen-Lauf (THE-550).
 *
 *   npm run reqtrace:article -- --out ../../docs/evals/reqtrace-run-article.md
 *
 * ── DIE FRAGE ──
 *
 * Verliert die ARTIKEL-Granularitaet (die heutige Klassifikationseinheit des
 * Korpus: 1428 eIds, 0 mit Absatz-Ebene) messbar Information gegenueber der
 * Klausel-Ebene aus Lauf 4? Dieselbe Kette, dieselben Parameter, dieselben
 * neun Artikel — einziger Unterschied: ein Artikel ist EINE Klausel.
 *
 * BEWUSST NICHT angepasst: maxTokens der Extraktion. Wenn ein 20k-Zeichen-
 * Artikel die Kandidatenliste am Ausgabebudget abschneidet, IST das der
 * Befund der Artikel-Ebene, nicht ein Harness-Fehler — er erscheint als
 * unreadableExtractions im Bericht, nicht als stilles Loch.
 *
 * Linear: THE-550 · Baseline: docs/evals/reqtrace-run-4.json (Klausel-Ebene)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { loadReqtraceLaws, type ReqtraceArticle } from '../evals/reqtrace/lawsFixture';
import { evaluateReqtrace, type AskFn } from '../evals/reqtrace/runReqtraceEval';
import type { Clause } from '../evals/reqtrace/clauseSegmenter';
import { stripEditorialArtefacts } from '../evals/reqtrace/clauseSegmenter';
import { clauseContentId } from '@thearchitect/shared';

/** Ein Artikel = EINE Klausel. Gleiche Blendung wie der echte Segmenter. */
export function articleAsSingleClause(a: ReqtraceArticle): Clause[] {
  const text = stripEditorialArtefacts(a.fullText);
  return [
    {
      id: `${a.source}:${a.article}:c00`,
      contentId: clauseContentId(text),
      path: `${a.source} ${a.article}`,
      text,
    },
  ];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx !== -1 ? argv[outIdx + 1] : undefined;

  const { createRaterClient, resolveRaterConfig, withEmptyResponseRetry } = await import('../evals/raterClient');
  const client = withEmptyResponseRetry(createRaterClient(resolveRaterConfig(argv)));
  const ask: AskFn = async (system, user) => (await client.complete({ system, user, maxTokens: 900 })).text;

  const laws = loadReqtraceLaws();
  const result = await evaluateReqtrace(laws.articles, {
    ask,
    segment: articleAsSingleClause,
    onProgress: (d, t) => process.stdout.write(`\r[reqtrace:article] Artikel ${d}/${t}   `),
    onPairProgress: (d, t) => process.stdout.write(`\r[reqtrace:article] Paar ${d}/${t}   `),
  });

  console.log(`\n${result.markdown}`);
  if (outPath) {
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${result.markdown}\n`);
    fs.writeFileSync(abs.replace(/\.md$/, '') + '.json', `${JSON.stringify({ ...result, markdown: undefined }, null, 2)}\n`);
    console.log(`\n[reqtrace:article] → ${abs}`);
  }
}

if (require.main === module) {
  void main();
}
