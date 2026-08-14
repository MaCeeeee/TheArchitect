/**
 * THE-683: Zweck-Kontext für das Typing-Experiment EINFRIEREN. READ-ONLY am Korpus.
 *
 * Je Sprachfassung die drei NIEDRIGSTEN Erwägungsgründe (dort steht der
 * Gesamtzweck — Entscheidung Option b, 14.08.) in eine committbare Datei.
 * Der Eval-Runner lädt die DATEI, nicht die Datenbank: Läufe bleiben
 * reproduzierbar, und „nur der Prompt wandert" bleibt wahr, weil der
 * Kontext genauso eingefroren ist wie das Golden.
 *
 * Lauf:
 *   packages/server$ node --env-file=../../.env -r ts-node/register/transpile-only \
 *     src/scripts/the683-export-purpose-context.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

async function main(): Promise<void> {
  if (!isCorpusConfigured()) throw new Error('CORPUS_MONGODB_URI fehlt.');
  const conn = await getCorpusConnection().asPromise();
  const recs = (await conn
    .collection('recitals')
    .find({}, { projection: { source: 1, recitalNumber: 1, fullText: 1 } })
    .toArray()) as unknown as Array<{ source: string; recitalNumber: number; fullText: string }>;
  if (recs.length === 0) throw new Error('0 Recitals im Korpus — leere Messung ist kein Bestehen.');

  const proQuelle = new Map<string, Array<{ number: number; text: string }>>();
  for (const r of recs) {
    proQuelle.set(r.source, [
      ...(proQuelle.get(r.source) ?? []),
      { number: r.recitalNumber, text: r.fullText },
    ]);
  }
  const perSource: Record<string, Array<{ number: number; text: string }>> = {};
  for (const [src, liste] of [...proQuelle.entries()].sort()) {
    perSource[src] = [...liste].sort((a, b) => a.number - b.number).slice(0, 3);
  }

  const out = resolve(__dirname, '../evals/golden/purpose-context.v1.json');
  writeFileSync(
    out,
    JSON.stringify(
      {
        version: 'purpose-context.v1',
        note: 'THE-683: die drei niedrigsten Erwägungsgründe je Sprachfassung — eingefrorener Experiment-Kontext (Option b). Neu erzeugen nur bei Korpus-Änderung, dann Version bumpen.',
        generatedAt: '2026-08-14',
        recitalsInCorpus: recs.length,
        perSource,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Fassungen: ${Object.keys(perSource).length} · Recitals im Korpus: ${recs.length}`);
  console.log(`→ ${out}`);
  await conn.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
