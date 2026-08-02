/**
 * reqtrace-objects — den Gegenstand je Anforderung nachziehen (THE-547).
 *
 *   npm run reqtrace:objects -- ../../docs/evals/reqtrace-run-4.json \
 *                               --out ../../docs/evals/reqtrace-objects-run-4.json
 *
 * ── WARUM OFFLINE UND NICHT ALS NEUER LAUF ──
 *
 * Der Gegenstand tritt in der Kette an genau einer Stelle auf: als **Filter vor
 * dem Richter**. Ein Filter kann Paare nur WEGNEHMEN, nie welche erzeugen.
 * Deshalb lässt sich die Wirkung exakt aus den gespeicherten Paar-Urteilen von
 * Lauf 4 ausrechnen — ohne einen einzigen neuen Richter-Aufruf und ohne dass
 * dabei eine Maßnahme entstehen könnte, die es im Lauf nicht gab.
 *
 * Das ist kein Sparen, sondern die sauberere Messung: die Paar-Urteile bleiben
 * Byte für Byte dieselben, und der einzige Unterschied zwischen beiden Zahlen
 * ist der Gegenstand. Ein voller Neulauf würde Modell-Rauschen mit hineinmessen.
 *
 * Linear: THE-547
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { OBJECT_SYSTEM, buildObjectUserPrompt, parseObjectAssignment } from '@thearchitect/shared';

export interface ObjectRunResult {
  /** Anforderungs-Id → Gegenstand als FREITEXT. `null` = unlesbar. */
  objects: Record<string, string | null>;
  total: number;
  unreadable: number;
  unstated: number;
  /** Verschiedene Rohwerte — die Ausgangsgröße für den Katalog. */
  distinct: number;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runPath = argv[0];
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx !== -1 ? argv[outIdx + 1] : undefined;
  if (!runPath) {
    console.error('Usage: reqtrace-objects <run.json> [--out <objects.json>]');
    process.exitCode = 2;
    return;
  }

  const run = JSON.parse(fs.readFileSync(path.resolve(runPath), 'utf8')) as {
    sysReqTexts?: Record<string, string>;
  };
  const ids = Object.keys(run.sysReqTexts ?? {});
  if (ids.length === 0) throw new Error(`${runPath}: keine sysReqTexts.`);

  const { createRaterClient, resolveRaterConfig, withEmptyResponseRetry } = await import('../evals/raterClient');
  const client = withEmptyResponseRetry(createRaterClient(resolveRaterConfig(argv)));

  const objects: Record<string, string | null> = {};
  let done = 0;
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const { text } = await client.complete({
          system: OBJECT_SYSTEM,
          user: buildObjectUserPrompt(run.sysReqTexts![id]),
          maxTokens: 300,
        });
        objects[id] = parseObjectAssignment(text)?.gegenstand ?? null;
        process.stdout.write(`\r[reqtrace:objects] ${++done}/${ids.length}   `);
      }
    }),
  );

  const values = Object.values(objects);
  const result: ObjectRunResult = {
    objects,
    total: ids.length,
    unreadable: values.filter((v) => v === null).length,
    unstated: values.filter((v) => v === '__kein_gegenstand__').length,
    distinct: new Set(values.filter((v): v is string => Boolean(v)).map((v) => v.toLowerCase())).size,
  };

  console.log(
    `\n[reqtrace:objects] ${result.total} Anforderungen · ${result.distinct} verschiedene Rohwerte · ` +
      `${result.unreadable} unlesbar · ${result.unstated} unbestimmbar`,
  );

  if (outPath) {
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`[reqtrace:objects] → ${abs}`);
  }
}

if (require.main === module) {
  void main();
}
