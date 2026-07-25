/**
 * relations-batch CLI — schreibt Cross-Norm-Kanten-VORSCHLÄGE an zitierende
 * Korpus-Dokumente (Regulation.relationSuggestions, status 'suggested').
 * THE-433 Slice 1. Suggest-only: confirmed/rejected setzt NUR ein Mensch.
 *
 * Dev (Mac, Repo-Checkout):
 *   npm run relations:batch -- --dry-run
 *   npm run relations:batch -- --limit 5
 *
 * Prod (Server B, GEBAUTER Container — `npm run build` kompiliert diese Datei
 * nach dist/cli/relations-batch.js mit):
 *   npm run relations:batch:prod -- --dry-run
 *   npm run relations:batch:prod -- --concurrency 4
 *
 * Env:
 *   MONGODB_URI        — via config.ts/.env; auf Server B mit SCHREIB-Rechten
 *                        (Server-B-Entscheid O-3, wie typing-batch).
 *   ANTHROPIC_API_KEY  — Modell-Zugang (Instruct-Klasse, RELATIONS_BATCH_MODEL).
 *
 * Flags:
 *   --dry-run          — NUR Kandidaten zählen + berichten (je Familien-Paar,
 *                        law-level-Ablehnungen, unauflösbare Ziele, Familien
 *                        ohne Korpus-Dokumente). Kein LLM-Call, kein Write.
 *   --limit N          — nur die ersten N zitierenden Dokumente (Probelauf)
 *   --source X         — nur Kandidaten, deren ZITIERENDES Dokument aus X
 *                        stammt (Ziele kommen immer aus dem ganzen Korpus)
 *   --force            — up-to-date-Dokumente neu scannen (menschliche
 *                        Entscheidungen bleiben IMMER unantastbar)
 *   --concurrency N    — parallele Worker (Default 4)
 *
 * Resume-Mechanismus: ein Messausfall (leere Antwort nach allen Retries,
 * API-Fehler) setzt für das betroffene Dokument KEINEN relationScan-Anker —
 * ein erneuter Lauf greift genau diese Dokumente wieder auf. Der Re-Run IST
 * das Resume (Muster typing-batch).
 *
 * Linear: THE-433 (Slice 1) · Vorbild: src/cli/typing-batch.ts (THE-432)
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  RELATIONS_PRELABEL_SYSTEM,
  RELATIONS_PROMPT_VERSION,
  SOURCE_TO_FAMILY,
} from '@thearchitect/shared';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { Regulation } from '../db/regulation.model';
import {
  enumerateRelationCandidates,
  type RelationCandidate,
} from '../lib/relationCandidates';
import {
  RELATIONS_BATCH_MODEL,
  newRelationsBatchCounters,
  processRelationDocGroup,
  relationWriteFilter,
  type RelationsBatchDoc,
  type RelationsBatchWrite,
  type RelationsDocGroup,
} from '../lib/relationsBatch';
import { completeWithRetry, estimateCostUsd, parseCliArgs } from '../lib/typingBatch';

function familyPairKey(c: RelationCandidate): string {
  const from = SOURCE_TO_FAMILY[c.citing.source] ?? c.citing.source;
  const to = SOURCE_TO_FAMILY[c.target.source] ?? c.target.source;
  return `${from}→${to}`;
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[relations-batch] ${parsed.error}`);
    console.error(
      '[relations-batch] Usage: relations-batch [--dry-run] [--limit N] [--source X] [--force] [--concurrency N]'
    );
    process.exit(2);
  }
  const args = parsed.args;

  if (!args.dryRun) {
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) {
      console.error('[relations-batch] ANTHROPIC_API_KEY is not set (or empty). Aborting.');
      process.exit(2);
    }
  }

  await connectMongo();

  // ALLE Korpus-Dokumente laden — die Kandidaten-Aufzählung braucht den ganzen
  // Korpus als Ziel-Raum, auch wenn --source die zitierende Seite einschränkt.
  const docs = (await Regulation.find({})
    .select(
      'regulationKey source paragraphNumber title fullText language versionHash relationScan relationSuggestions'
    )
    .sort({ regulationKey: 1, version: 1 })
    .lean()) as unknown as RelationsBatchDoc[];

  const enumeration = enumerateRelationCandidates(docs);
  const allCandidates = args.source
    ? enumeration.candidates.filter((c) => c.citing.source === args.source)
    : enumeration.candidates;

  // Kandidaten je Familien-Paar — der Kern des Dry-Run-Reports.
  const byFamilyPair: Record<string, number> = {};
  for (const c of allCandidates) {
    byFamilyPair[familyPairKey(c)] = (byFamilyPair[familyPairKey(c)] ?? 0) + 1;
  }

  const s = enumeration.stats;
  console.log(
    `[relations-batch] ${docs.length} corpus docs · ${allCandidates.length} candidates` +
      (args.source ? ` (citing source=${args.source})` : '') +
      ` · model=${RELATIONS_BATCH_MODEL} · prompt=${RELATIONS_PROMPT_VERSION}` +
      (args.dryRun ? ' · DRY-RUN (no LLM, no writes)' : '') +
      (args.force ? ' · FORCE (re-scan up-to-date docs)' : '')
  );
  console.log(
    `[relations-batch] candidates per family pair:\n` +
      (Object.entries(byFamilyPair)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, n]) => `  ${k}: ${n}`)
        .join('\n') || '  (none)')
  );
  console.log(
    `[relations-batch] law-level mentions rejected (no article pinpoint): ${s.lawLevelRejected}\n` +
      `[relations-batch] unresolved targets (article not in corpus): ${s.unresolvedTargets}\n` +
      `[relations-batch] families with patterns but ZERO corpus docs: ${
        Object.entries(s.familiesWithoutDocs)
          .map(([f, n]) => `${f}(${n} hits)`)
          .join(', ') || 'none'
      }\n` +
      `[relations-batch] sources without reference patterns: ${
        s.sourcesWithoutPatterns.join(', ') || 'none'
      }`
  );

  if (args.dryRun) {
    // Dry-Run endet HIER — vor jedem LLM-Call, vor jedem Write.
    await disconnectMongo();
    return;
  }

  // Kandidaten nach zitierendem Dokument gruppieren (der Anker lebt pro
  // Dokument; ein Scan verarbeitet alle Kandidaten des Dokuments).
  const docByKey = new Map<string, RelationsBatchDoc>();
  for (const d of docs) if (!docByKey.has(d.regulationKey)) docByKey.set(d.regulationKey, d);
  const groupsByKey = new Map<string, RelationsDocGroup>();
  for (const c of allCandidates) {
    const doc = docByKey.get(c.citing.regulationKey);
    if (!doc) continue; // kann per Konstruktion nicht passieren — Kandidaten stammen aus docs
    let g = groupsByKey.get(c.citing.regulationKey);
    if (!g) {
      g = { doc, candidates: [] };
      groupsByKey.set(c.citing.regulationKey, g);
    }
    g.candidates.push(c);
  }
  let groups = [...groupsByKey.values()];
  if (args.limit) groups = groups.slice(0, args.limit);

  const sdk = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || '').trim() });
  const counters = newRelationsBatchCounters();
  const opts = {
    force: args.force,
    dryRun: false,
    promptVersion: RELATIONS_PROMPT_VERSION,
    model: RELATIONS_BATCH_MODEL,
  };

  const deps = {
    complete: (userPrompt: string) =>
      completeWithRetry(async (maxTokens) => {
        const r = await sdk.messages.create({
          model: RELATIONS_BATCH_MODEL,
          system: RELATIONS_PRELABEL_SYSTEM,
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
    write: async (w: RelationsBatchWrite): Promise<boolean> => {
      // TOCTOU-Guard (siehe relationWriteFilter): das Update greift nur, wenn
      // der Text-Stand unverändert ist UND keine menschliche Entscheidung
      // aufgetaucht ist, die der Merge nicht kannte.
      const update: Record<string, unknown> = { relationSuggestions: w.suggestions };
      if (w.anchor) update.relationScan = w.anchor;
      const result = await Regulation.updateOne(
        relationWriteFilter(w.docId, w.versionHash, w.humanTargets),
        { $set: update },
        { runValidators: true }
      );
      return result.matchedCount > 0;
    },
    onError: (regulationKey: string, err: unknown) => {
      console.error(
        `[relations-batch] ${regulationKey}: ${err instanceof Error ? err.message : String(err)}`
      );
    },
  };

  // Worker-Pool wie typing-batch: N Worker ziehen über einen geteilten Index.
  let nextIndex = 0;
  let processed = 0;
  const workers = Array.from({ length: Math.min(args.concurrency, groups.length || 1) }, () =>
    (async () => {
      for (;;) {
        const i = nextIndex++;
        if (i >= groups.length) return;
        await processRelationDocGroup(groups[i], opts, deps, counters);
        processed++;
        if (processed % 10 === 0) {
          console.log(
            `[relations-batch] ${processed}/${groups.length} docs · candidates=${counters.candidatesProcessed} failed=${counters.failedDocs.length}`
          );
        }
      }
    })()
  );
  await Promise.all(workers);

  const typeSummary =
    Object.entries(counters.suggestionsByType)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([t, n]) => `${t}=${n}`)
      .join(' · ') || 'none';
  console.log(
    `\n[relations-batch] SUMMARY\n` +
      `  citing docs:    ${groups.length} (of ${groupsByKey.size} with candidates)\n` +
      `  candidates:     ${counters.candidatesProcessed}\n` +
      `  suggestions:    ${typeSummary}\n` +
      `  none:           ${counters.none}\n` +
      `  drops (OOV/metadata/direction): ${counters.droppedOov}\n` +
      `  skipped:        ${counters.skippedUpToDate} up-to-date docs · ${counters.skippedHumanPair} human-decided pairs · ${counters.raceLost} lost write races\n` +
      `  no response:    ${counters.failedDocs.length} docs\n` +
      `  tokens:         ${counters.inputTokens} in / ${counters.outputTokens} out (~$${estimateCostUsd(counters.inputTokens, counters.outputTokens).toFixed(2)})`
  );

  if (counters.failedDocs.length > 0) {
    console.error(
      `\n[relations-batch] FAILED MEASUREMENTS: ${counters.failedDocs.length} doc(s) had at least one ` +
        `candidate with NO usable result (empty response after all retries, API error, or write error).\n` +
        `[relations-batch] NO relationScan anchor was written for these docs — a re-run picks exactly ` +
        `these up again: the re-run IS the resume mechanism.\n` +
        `[relations-batch] Affected regulationKeys: ${counters.failedDocs.join(', ')}`
    );
    process.exitCode = 1;
  }

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error('[relations-batch] FAILED:', err instanceof Error ? err.message : err);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
