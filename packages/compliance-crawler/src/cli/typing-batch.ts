/**
 * typing-batch CLI — schreibt 5-Achsen-Typing-VORSCHLÄGE auf jeden
 * Korpus-Paragraphen (Regulation.typing, status 'suggested'). THE-432 Slice T.
 *
 * Dev (Mac, Repo-Checkout):
 *   npm run typing:batch -- --limit 10 --dry-run
 *   npm run typing:batch -- --source dsgvo --force
 *
 * Prod (Server B, GEBAUTER Container — dort läuft `npm start` auf dist/,
 * ts-node-dev existiert im Image nicht; `npm run build` kompiliert diese Datei
 * nach dist/cli/typing-batch.js mit):
 *   node dist/cli/typing-batch.js --source dsgvo --concurrency 4
 *
 * Env:
 *   MONGODB_URI        — via config.ts/.env; auf Server B mit SCHREIB-Rechten
 *                        (Server-B-Entscheid O-3: der Batch läuft dort, wo der
 *                        Korpus geschrieben wird — nicht auf Server A).
 *   ANTHROPIC_API_KEY  — Modell-Zugang (Instruct-Klasse, siehe TYPING_BATCH_MODEL).
 *
 * Flags:
 *   --limit N          — nur die ersten N Dokumente (Dev/Stichprobe)
 *   --source X         — nur eine Quelle (z.B. dsgvo, nis2, ai-act-en)
 *   --dry-run          — klassifizieren + zählen, aber NICHTS schreiben
 *   --force            — up-to-date-Vorschläge neu typen (menschliche
 *                        Entscheidungen bleiben IMMER unantastbar, AC-4)
 *   --concurrency N    — parallele Worker (Default 4)
 *
 * Resume-Mechanismus: eine fehlgeschlagene Messung (leere Antwort nach allen
 * Wiederholungen, API-Fehler) schreibt NIE ein Label — das Dokument bleibt
 * untypisiert und ein erneuter Lauf greift genau diese Dokumente wieder auf
 * (untypisiert ⇒ kein Skip). Der Re-Run IST das Resume.
 *
 * Linear: THE-432 (Slice T)
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  NORM_ONTOLOGY,
  PRELABEL_SYSTEM,
  TYPING_AXES,
  TYPING_PROMPT_VERSION,
  buildPrelabelUserPrompt,
  parsePrelabelLabels,
} from '@thearchitect/shared';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { Regulation } from '../db/regulation.model';
import {
  TYPING_BATCH_MODEL,
  assembleTypingSuggestion,
  completeWithRetry,
  estimateCostUsd,
  shouldSkipDoc,
} from '../lib/typingBatch';

interface CliArgs {
  limit?: number;
  source?: string;
  dryRun: boolean;
  force: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): CliArgs {
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const limitRaw = arg('--limit');
  const concurrencyRaw = arg('--concurrency');
  return {
    limit: limitRaw ? Number(limitRaw) : undefined,
    source: arg('--source'),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    concurrency: concurrencyRaw ? Math.max(1, Number(concurrencyRaw)) : 4,
  };
}

/** Schlanke Sicht auf das Korpus-Dokument — nur was Prompt + Skip-Logik brauchen. */
interface BatchDoc {
  _id: unknown;
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  language: string;
  typing?: { status?: string; promptVersion?: string; ontologyVersion?: string; modelId?: string };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[typing-batch] ANTHROPIC_API_KEY is not set (or empty). Aborting.');
    process.exit(2);
  }
  const sdk = new Anthropic({ apiKey });

  await connectMongo();

  const filter = args.source ? { source: args.source } : {};
  let query = Regulation.find(filter)
    .select('regulationKey source paragraphNumber title fullText language typing')
    // Deterministische Reihenfolge, damit --limit-Stichproben reproduzierbar sind.
    .sort({ regulationKey: 1, version: 1 });
  if (args.limit) query = query.limit(args.limit);
  const docs = (await query.lean()) as unknown as BatchDoc[];

  console.log(
    `[typing-batch] ${docs.length} corpus docs` +
      (args.source ? ` (source=${args.source})` : '') +
      ` · model=${TYPING_BATCH_MODEL} · prompt=${TYPING_PROMPT_VERSION} · ontology=${NORM_ONTOLOGY.ontologyVersion}` +
      (args.dryRun ? ' · DRY-RUN (no writes)' : '') +
      (args.force ? ' · FORCE (re-type up-to-date suggestions)' : '') +
      ` · concurrency=${args.concurrency}`
  );

  const skipOpts = {
    force: args.force,
    promptVersion: TYPING_PROMPT_VERSION,
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
    modelId: TYPING_BATCH_MODEL,
  };

  let typed = 0;
  let skippedHuman = 0;
  let skippedUpToDate = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const droppedPerAxis: Record<string, number> = {};
  /** regulationKeys der fehlgeschlagenen Messungen — es wurde NICHTS geschrieben. */
  const failed: string[] = [];
  let processed = 0;

  async function processDoc(doc: BatchDoc): Promise<void> {
    const verdict = shouldSkipDoc(doc, skipOpts);
    if (verdict.skip) {
      if (verdict.reason === 'human-decided') skippedHuman++;
      else skippedUpToDate++;
      return;
    }

    const user = buildPrelabelUserPrompt({
      source: doc.source,
      paragraphNumber: doc.paragraphNumber,
      title: doc.title,
      fullText: doc.fullText,
      language: doc.language,
    });

    let res: { text: string; inputTokens: number; outputTokens: number } | null;
    try {
      res = await completeWithRetry(async (maxTokens) => {
        const r = await sdk.messages.create({
          model: TYPING_BATCH_MODEL,
          system: PRELABEL_SYSTEM,
          messages: [{ role: 'user', content: user }],
          max_tokens: maxTokens,
        });
        const block = r.content.find((b) => b.type === 'text');
        return {
          text: block && block.type === 'text' ? block.text : '',
          inputTokens: r.usage?.input_tokens || 0,
          outputTokens: r.usage?.output_tokens || 0,
        };
      });
    } catch (err) {
      // API-Fehler = fehlgeschlagene Messung, gleiche Behandlung wie die leere
      // Antwort: NICHTS schreiben. Ein Ausfall darf nie wie ein Label aussehen.
      console.error(
        `[typing-batch] ${doc.regulationKey}: API error — ${err instanceof Error ? err.message : String(err)}`
      );
      failed.push(doc.regulationKey);
      return;
    }
    if (res === null) {
      failed.push(doc.regulationKey);
      return;
    }
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;

    const parsed = parsePrelabelLabels(res.text);
    for (const axis of parsed.dropped) {
      droppedPerAxis[axis] = (droppedPerAxis[axis] ?? 0) + 1;
    }
    const suggestion = assembleTypingSuggestion(parsed, {
      modelId: TYPING_BATCH_MODEL,
      now: new Date(),
    });

    if (!args.dryRun) {
      await Regulation.updateOne({ _id: doc._id }, { $set: { typing: suggestion } }, { runValidators: true });
    }
    typed++;
  }

  // Simpler Worker-Pool ohne externe Dependency: N Worker ziehen über einen
  // geteilten Index von der Liste. nextIndex++ ist single-threaded (Event-Loop)
  // race-frei, weil zwischen Lesen und Inkrement kein await liegt.
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(args.concurrency, docs.length || 1) }, () =>
    (async () => {
      for (;;) {
        const i = nextIndex++;
        if (i >= docs.length) return;
        await processDoc(docs[i]);
        processed++;
        if (processed % 25 === 0) {
          console.log(
            `[typing-batch] ${processed}/${docs.length} · typed=${typed} skipped=${skippedHuman + skippedUpToDate} failed=${failed.length}`
          );
        }
      }
    })()
  );
  await Promise.all(workers);

  const oovSummary =
    TYPING_AXES.filter((axis) => droppedPerAxis[axis]).map((axis) => `${axis}=${droppedPerAxis[axis]}`).join(' · ') ||
    'none';
  console.log(
    `\n[typing-batch] SUMMARY\n` +
      `  docs:        ${docs.length}\n` +
      `  typed:       ${typed}${args.dryRun ? ' (DRY-RUN — nothing was written)' : ''}\n` +
      `  skipped:     ${skippedHuman} human-decided · ${skippedUpToDate} up-to-date\n` +
      `  OOV drops:   ${oovSummary}\n` +
      `  no response: ${failed.length}\n` +
      `  tokens:      ${inputTokens} in / ${outputTokens} out (~$${estimateCostUsd(inputTokens, outputTokens).toFixed(2)})`
  );

  // Ausfälle sind KEIN Randdetail (Muster aus prelabel-typing, server): laut,
  // zum Schluss, mit Exit-Code — sonst schönt sich der Batch selbst.
  if (failed.length > 0) {
    console.error(
      `\n[typing-batch] FAILED MEASUREMENTS: ${failed.length} doc(s) produced NO response ` +
        `after all retry attempts (or errored).\n` +
        `[typing-batch] NOTHING was written for these docs — they stay untyped. A re-run of this ` +
        `batch picks exactly these up again (untyped => not skipped): the re-run IS the resume mechanism.\n` +
        `[typing-batch] Affected regulationKeys: ${failed.join(', ')}`
    );
    process.exitCode = 1;
  }

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error('[typing-batch] FAILED:', err instanceof Error ? err.message : err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
