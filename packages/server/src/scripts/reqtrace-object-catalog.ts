/**
 * reqtrace-object-catalog — den kanonischen Gegenstands-Werteraum ableiten
 * (THE-547), bottom-up aus dem Material.
 *
 *   npm run reqtrace:object-catalog -- ../../docs/evals/reqtrace-objects-run-4.json \
 *     --out ../../docs/evals/reqtrace-object-catalog.json
 *
 * ── ZWEI SCHRITTE, WIE BEIM HANDLUNGS-KATALOG ──
 *
 * 1. **Ableiten** — aus der Liste der Rohwerte ein Vokabular bilden (216 → 26 war
 *    die Kompressionsrate bei den Handlungen).
 * 2. **Zuordnen** — jeden Rohwert genau einem Eintrag zuweisen.
 *
 * ── DIE BLENDUNG, DIE HIER ZÄHLT ──
 *
 * Beide Schritte sehen **nur die Rohwerte**. Sie sehen nicht, welche Paare der
 * Mensch angenommen hat, nicht das SCF-Gold, nicht welche Bündelung eine Zahl
 * retten würde. Ein Katalog, der auf das gewünschte Ergebnis hin gebaut wird,
 * macht die anschließende Messung wertlos — es wäre dieselbe Nachbesserung,
 * gegen die die ganze Ticket-Reihe angelegt ist.
 *
 * Linear: THE-547
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  OBJECT_DERIVE_SYSTEM,
  buildObjectDeriveUserPrompt,
  buildObjectAssignSystem,
  buildObjectUserPrompt,
  parseObjectAssignment,
  OBJECT_UNSTATED,
} from '@thearchitect/shared';

export interface ObjectCatalogEntry {
  id: string;
  label: string;
  description: string;
}

/** Rohwerte, normalisiert und dedupliziert. REIN. */
export function distinctObjects(objects: Record<string, string | null>): string[] {
  const seen = new Map<string, string>();
  for (const v of Object.values(objects)) {
    if (!v || v === OBJECT_UNSTATED) continue;
    const k = v.trim().toLowerCase();
    if (!seen.has(k)) seen.set(k, v.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

export function parseCatalog(raw: string): { vokabular: ObjectCatalogEntry[]; anmerkung?: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: unknown;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const v = (o as { vokabular?: unknown })?.vokabular;
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: ObjectCatalogEntry[] = [];
  for (const e of v) {
    const { id, label, description } = (e ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || typeof label !== 'string' || typeof description !== 'string') return null;
    if (!id.trim()) return null;
    out.push({ id: id.trim(), label, description });
  }
  return { vokabular: out, anmerkung: (o as { anmerkung?: string })?.anmerkung };
}

/**
 * Die Kompressionsrate als Warnlampe.
 *
 * Faustregel aus dem Handlungs-Katalog: unter 5:1 ist zu fein geschnitten,
 * über 30:1 zu grob. Die Zahl wird AUSGEWIESEN, nicht erzwungen — ein Katalog
 * auf eine Zielrate hin zu biegen wäre dasselbe wie eine Schwelle zu senken.
 */
export function compressionRatio(rawCount: number, classCount: number): number {
  return classCount === 0 ? 0 : rawCount / classCount;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const objectsPath = argv[0];
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx !== -1 ? argv[outIdx + 1] : undefined;
  if (!objectsPath) {
    console.error('Usage: reqtrace-object-catalog <objects.json> [--out <catalog.json>]');
    process.exitCode = 2;
    return;
  }

  const file = JSON.parse(fs.readFileSync(path.resolve(objectsPath), 'utf8')) as {
    objects: Record<string, string | null>;
  };
  const raw = distinctObjects(file.objects);
  console.log(`[reqtrace:object-catalog] ${raw.length} verschiedene Rohwerte`);

  const { createRaterClient, resolveRaterConfig, withEmptyResponseRetry } = await import('../evals/raterClient');
  const client = withEmptyResponseRetry(createRaterClient(resolveRaterConfig(argv)));

  // ── 1. Ableiten ───────────────────────────────────────────────────────────
  const deriveAnswer = (
    await client.complete({
      system: OBJECT_DERIVE_SYSTEM,
      user: buildObjectDeriveUserPrompt(raw),
      maxTokens: 8000,
    })
  ).text;
  const derived = parseCatalog(deriveAnswer);
  if (!derived) {
    // Der Abbruch muss DIAGNOSTIZIERBAR sein. Ein blankes "unlesbar" verschweigt,
    // ob das Modell nichts lieferte oder ob das Budget mitten im JSON endete —
    // und das sind zwei ganz verschiedene Fehler.
    throw new Error(
      `[reqtrace:object-catalog] Ableitung unlesbar (${deriveAnswer.length} Zeichen) — Abbruch statt stillem Verlust.\n` +
        `--- Anfang der Antwort ---\n${deriveAnswer.slice(0, 400)}\n--- Ende der Antwort ---\n${deriveAnswer.slice(-200)}`,
    );
  }

  const ratio = compressionRatio(raw.length, derived.vokabular.length);
  console.log(
    `[reqtrace:object-catalog] ${derived.vokabular.length} Klassen · Kompression ${ratio.toFixed(1)}:1` +
      (ratio < 5 ? '  ⚠️ unter 5:1 — zu fein' : ratio > 30 ? '  ⚠️ über 30:1 — zu grob' : ''),
  );
  if (derived.anmerkung) console.log(`[reqtrace:object-catalog] Anmerkung: ${derived.anmerkung}`);

  // ── 2. Zuordnen ───────────────────────────────────────────────────────────
  const assignSystem = buildObjectAssignSystem(derived.vokabular);
  const valid = new Set(derived.vokabular.map((e) => e.id));
  const clusters: Record<string, string> = {};
  let done = 0;
  let unassigned = 0;
  const queue = [...raw];
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let v = queue.shift(); v; v = queue.shift()) {
        const { text } = await client.complete({
          system: assignSystem,
          user: buildObjectUserPrompt(v),
          maxTokens: 200,
        });
        const id = parseObjectAssignment(text)?.gegenstand ?? null;
        // Eine erfundene Id ist schlimmer als keine: sie bildete eine Klasse,
        // die im Katalog nicht steht, und niemand saehe es.
        clusters[v.trim().toLowerCase()] = id && valid.has(id) ? id : OBJECT_UNSTATED;
        if (!id || !valid.has(id)) unassigned += 1;
        process.stdout.write(`\r[reqtrace:object-catalog] zuordnen ${++done}/${raw.length}   `);
      }
    }),
  );

  console.log(`\n[reqtrace:object-catalog] ${unassigned} Rohwert(e) ohne Klasse — zählen als unbestimmbar`);

  if (outPath) {
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(
      abs,
      `${JSON.stringify({ catalog: derived.vokabular, anmerkung: derived.anmerkung, rawCount: raw.length, ratio, unassigned }, null, 2)}\n`,
    );
    // Die reine Abbildung daneben — das ist, was der Evaluator einliest.
    fs.writeFileSync(abs.replace(/\.json$/, '') + '-clusters.json', `${JSON.stringify(clusters, null, 2)}\n`);
    console.log(`[reqtrace:object-catalog] → ${abs}`);
  }
}

if (require.main === module) {
  void main();
}
