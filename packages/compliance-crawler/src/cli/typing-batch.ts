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
 *   npm run typing:batch:prod -- --source dsgvo --concurrency 4
 *   # identisch zu: node dist/cli/typing-batch.js --source dsgvo --concurrency 4
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
 * Wiederholungen, API-Fehler) oder ein fehlgeschlagener Write schreibt NIE ein
 * Label — das Dokument bleibt untypisiert und ein erneuter Lauf greift genau
 * diese Dokumente wieder auf (untypisiert ⇒ kein Skip). Der Re-Run IST das
 * Resume.
 *
 * Linear: THE-432 (Slice T)
 */
import Anthropic from '@anthropic-ai/sdk';
import { NORM_ONTOLOGY, PRELABEL_SYSTEM, TYPING_AXES, TYPING_PROMPT_VERSION } from '@thearchitect/shared';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { Regulation } from '../db/regulation.model';
import {
  TYPING_BATCH_MODEL,
  completeWithRetry,
  estimateCostUsd,
  newBatchCounters,
  parseCliArgs,
  processTypingDoc,
  type TypingBatchDoc,
  type TypingSuggestion,
} from '../lib/typingBatch';

async function main(): Promise<void> {
  // Review-Fix 6: NaN-Guards — `--limit abc` wäre sonst still ein voller
  // bezahlter Lauf geworden, `--concurrency abc` ein stilles No-op (0 Worker).
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[typing-batch] ${parsed.error}`);
    console.error(
      '[typing-batch] Usage: typing-batch [--limit N] [--source X] [--dry-run] [--force] [--concurrency N]'
    );
    process.exit(2);
  }
  const args = parsed.args;

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[typing-batch] ANTHROPIC_API_KEY is not set (or empty). Aborting.');
    process.exit(2);
  }
  const sdk = new Anthropic({ apiKey });

  await connectMongo();

  const filter = args.source ? { source: args.source } : {};
  let query = Regulation.find(filter)
    .select('regulationKey versionHash source paragraphNumber title fullText language typing')
    // Deterministische Reihenfolge, damit --limit-Stichproben reproduzierbar sind.
    .sort({ regulationKey: 1, version: 1 });
  if (args.limit) query = query.limit(args.limit);
  const docs = (await query.lean()) as unknown as TypingBatchDoc[];

  console.log(
    `[typing-batch] ${docs.length} corpus docs` +
      (args.source ? ` (source=${args.source})` : '') +
      ` · model=${TYPING_BATCH_MODEL} · prompt=${TYPING_PROMPT_VERSION} · ontology=${NORM_ONTOLOGY.ontologyVersion}` +
      (args.dryRun ? ' · DRY-RUN (no writes)' : '') +
      (args.force ? ' · FORCE (re-type up-to-date suggestions)' : '') +
      ` · concurrency=${args.concurrency}`
  );

  const opts = {
    force: args.force,
    promptVersion: TYPING_PROMPT_VERSION,
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
    modelId: TYPING_BATCH_MODEL,
    dryRun: args.dryRun,
  };
  const counters = newBatchCounters();

  const deps = {
    complete: (userPrompt: string) =>
      completeWithRetry(async (maxTokens) => {
        const r = await sdk.messages.create({
          model: TYPING_BATCH_MODEL,
          system: PRELABEL_SYSTEM,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: maxTokens,
        });
        const block = r.content.find((b) => b.type === 'text');
        return {
          text: block && block.type === 'text' ? block.text : '',
          inputTokens: r.usage?.input_tokens || 0,
          outputTokens: r.usage?.output_tokens || 0,
        };
      }),
    write: async (docId: unknown, suggestion: TypingSuggestion): Promise<boolean> => {
      // Review-Fix 4 (TOCTOU): AC-4 wurde auf einem Snapshot-Read geprüft —
      // eine menschliche Entscheidung, die ZWISCHEN Read und Write landet,
      // darf der Batch nicht überschreiben. Der Guard sitzt deshalb im
      // Write-Filter selbst: menschliche Entscheidung schlägt Batch, auch im
      // Rennen. Mongo-Semantik ($nin, docs.mongodb.com): "$nin selects the
      // documents where the field value is not in the specified array OR the
      // field does not exist" — Dokumente ganz ohne typing matchen also mit.
      const result = await Regulation.updateOne(
        { _id: docId, 'typing.status': { $nin: ['confirmed', 'rejected'] } },
        { $set: { typing: suggestion } },
        { runValidators: true }
      );
      return result.matchedCount > 0;
    },
    onError: (regulationKey: string, err: unknown) => {
      console.error(
        `[typing-batch] ${regulationKey}: ${err instanceof Error ? err.message : String(err)}`
      );
    },
  };

  // Simpler Worker-Pool ohne externe Dependency: N Worker ziehen über einen
  // geteilten Index von der Liste. nextIndex++ ist single-threaded (Event-Loop)
  // race-frei, weil zwischen Lesen und Inkrement kein await liegt. Die
  // Pro-Dokument-Fehlerbehandlung sitzt IN processTypingDoc (Review-Fix 2) —
  // ein Worker kann dadurch nicht mehr an einem einzelnen Dokument sterben
  // und Promise.all den Lauf ohne Summary abreißen lassen.
  let nextIndex = 0;
  let processed = 0;
  const workers = Array.from({ length: Math.min(args.concurrency, docs.length || 1) }, () =>
    (async () => {
      for (;;) {
        const i = nextIndex++;
        if (i >= docs.length) return;
        await processTypingDoc(docs[i], opts, deps, counters);
        processed++;
        if (processed % 25 === 0) {
          const skipped =
            counters.skippedHuman + counters.skippedHumanStale + counters.skippedUpToDate;
          console.log(
            `[typing-batch] ${processed}/${docs.length} · typed=${counters.typed} skipped=${skipped} failed=${counters.failed.length}`
          );
        }
      }
    })()
  );
  await Promise.all(workers);

  const oovSummary =
    TYPING_AXES.filter((axis) => counters.droppedPerAxis[axis])
      .map((axis) => `${axis}=${counters.droppedPerAxis[axis]}`)
      .join(' · ') || 'none';
  console.log(
    `\n[typing-batch] SUMMARY\n` +
      `  docs:        ${docs.length}\n` +
      `  typed:       ${counters.typed}${args.dryRun ? ' (DRY-RUN — nothing was written)' : ''}\n` +
      `  skipped:     ${counters.skippedHuman} human-decided · ${counters.skippedUpToDate} up-to-date\n` +
      // Review-Fix 1: Novellen-Signal — der Batch fasst diese nie an, aber ein
      // Mensch muss sie neu ansehen (das Label beschreibt einen alten Text).
      `  human decisions on outdated text: ${counters.skippedHumanStale} — braucht menschliche Re-Review\n` +
      `  OOV drops:   ${oovSummary}\n` +
      `  no response: ${counters.failed.length}\n` +
      `  tokens:      ${counters.inputTokens} in / ${counters.outputTokens} out (~$${estimateCostUsd(counters.inputTokens, counters.outputTokens).toFixed(2)})`
  );

  // Ausfälle sind KEIN Randdetail (Muster aus prelabel-typing, server): laut,
  // zum Schluss, mit Exit-Code — sonst schönt sich der Batch selbst.
  if (counters.failed.length > 0) {
    console.error(
      `\n[typing-batch] FAILED MEASUREMENTS: ${counters.failed.length} doc(s) produced NO usable ` +
        `result (empty response after all retry attempts, API error, or write error).\n` +
        `[typing-batch] NOTHING was written for these docs — they stay untyped. A re-run of this ` +
        `batch picks exactly these up again (untyped => not skipped): the re-run IS the resume mechanism.\n` +
        `[typing-batch] Affected regulationKeys: ${counters.failed.join(', ')}`
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
