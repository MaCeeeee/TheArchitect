/**
 * reqtrace-rescore — den Gold-Abgleich eines vorhandenen Laufs nachrechnen,
 * ohne die Kette erneut zu fahren (THE-545).
 *
 *   npm run reqtrace:rescore -- docs/evals/reqtrace-run-3.json \
 *                               --out docs/evals/reqtrace-run-3-rescore.md
 *
 * ── WARUM ES DAS GEBEN MUSS ──
 *
 * Lauf 3 speicherte je Anforderung nur den TEXT, nicht die kanonische Handlung.
 * Der Gold-Abgleich braucht aber genau die — aus dem Text ist sie nicht
 * rekonstruierbar, sie kam aus einem Modellaufruf. Eine Korrektur am Gold ließ
 * sich deshalb nicht nachrechnen, ohne alles zu wiederholen. Das ist die
 * Lücke, die `sysReqActions` im Ergebnisformat ab jetzt schließt; dieses
 * Skript holt sie für die bereits gefahrenen Läufe nach.
 *
 * ── WAS ES NEU RECHNET UND WAS NICHT ──
 *
 * NEU: nur die Klassifikation der gespeicherten Anforderungstexte und daraus
 * der Gold-Abgleich plus die semantische Negativ-Kontrolle.
 *
 * UNANGETASTET: Segmentierung, Extraktion, Transformation, Paarurteile,
 * Verdrängung, Gruppierung. Alles das wird aus der Datei übernommen — es gibt
 * keinen Pfad, auf dem dieses Skript eine Maßnahme entstehen ließe, die im Lauf
 * nicht entstanden ist.
 *
 * ── DIE EINE ABWEICHUNG, DIE MAN WISSEN MUSS ──
 *
 * Die Klassifikation ist ein ZWEITER Durchgang. Wo sie von der des Laufs
 * abweicht, verschiebt sich der Abgleich. Der Bericht weist deshalb aus, wie
 * viele Texte gar keine Handlung erhielten — im Lauf selbst gab es dafür einen
 * Rückfall auf die erste extrahierte Handlung, den es hier nicht gibt (die
 * Slot-Listen sind nicht gespeichert). Diese Fälle zählen hier als `null` und
 * können den Abgleich nur nach unten ziehen, nie nach oben.
 *
 * Linear: THE-545 · Rahmen: ADR-0007
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { CLASSIFY_SYSTEM, buildClassifyUserPrompt, parseActionAssignment } from '@thearchitect/shared';
import { SCF_GOLD, ACTION_TO_SCF, GOLD_HITS_MIN, type GoldHit } from '../evals/reqtrace/runReqtraceEval';

export interface RescoreInput {
  sysReqTexts: Record<string, string>;
  sysReqActions?: Record<string, string | null>;
  grouping: {
    measures: { id: string; memberIds: string[]; laws: string[] }[];
    sharedCorePairs: { a: string; b: string; relation: string }[];
  };
}

export interface RescoreResult {
  goldHits: GoldHit[];
  goldHitCount: number;
  ambiguousGoldMatches: string[];
  negativeSemantic: boolean;
  /** Texte, denen der zweite Durchgang keine Handlung zuordnen konnte. */
  unclassified: number;
  classified: number;
  markdown: string;
}

/**
 * Die Herkunft steckt im Id-Präfix (`dsgvo:art32:c01:q1s1`). Das ist kein
 * Kunstgriff, sondern dieselbe Quelle, aus der auch die Gruppierung ihre
 * `laws` je Maßnahme zieht — im Lauf stand daneben `source` aus dem Artikel.
 */
export function lawOfId(id: string): string {
  return id.split(':')[0] ?? '';
}

/** Rein: rechnet den Abgleich aus Gruppierung + Handlungen. KEIN I/O, kein Modell. */
export function rescore(
  input: RescoreInput,
  actions: Record<string, string | null>,
): Omit<RescoreResult, 'markdown'> {
  const actionsOf = (ids: string[]): string[] =>
    ids.map((id) => actions[id]).filter((a): a is string => Boolean(a));
  const lawsOf = (ids: string[]): string[] => [...new Set(ids.map(lawOfId))];

  const goldCandidates: { id: string; ids: string[] }[] = [
    ...input.grouping.measures.filter((m) => m.memberIds.length > 1).map((m) => ({ id: m.id, ids: m.memberIds })),
    ...input.grouping.sharedCorePairs.map((e) => ({ id: `pair__${e.a}__${e.b}`, ids: [e.a, e.b] })),
  ];

  const matchesByMeasure = new Map<string, string[]>();
  const goldHits: GoldHit[] = SCF_GOLD.map((g) => {
    const hit = goldCandidates.find(
      (c) =>
        g.lawSets.some((set) => set.every((l) => lawsOf(c.ids).includes(l))) &&
        actionsOf(c.ids).some((a) => (ACTION_TO_SCF[a] ?? []).includes(g.id)),
    );
    if (hit) matchesByMeasure.set(hit.id, [...(matchesByMeasure.get(hit.id) ?? []), g.id]);
    return { id: g.id, lawSets: g.lawSets, matchedBy: hit?.id ?? null };
  });

  const negativeSemantic = input.grouping.measures.every((m) => {
    const a = new Set(m.memberIds.map((id) => actions[id]).filter(Boolean));
    return a.size <= 1;
  });

  const ids = Object.keys(input.sysReqTexts);
  return {
    goldHits,
    goldHitCount: goldHits.filter((g) => g.matchedBy).length,
    ambiguousGoldMatches: [...matchesByMeasure.entries()].filter(([, v]) => v.length > 1).map(([m]) => m),
    negativeSemantic,
    unclassified: ids.filter((id) => !actions[id]).length,
    classified: ids.filter((id) => Boolean(actions[id])).length,
  };
}

export function renderRescoreReport(
  r: Omit<RescoreResult, 'markdown'>,
  meta: { runPath: string; previousGoldHitCount: number },
): string {
  return [
    '# Nachrechnung des Gold-Abgleichs (THE-545)',
    '',
    `Quelle: \`${meta.runPath}\` — Gruppierung, Paarurteile und Verdrängung **unverändert übernommen**.`,
    'Neu gerechnet ist ausschließlich die Klassifikation der gespeicherten Anforderungstexte',
    'und der daraus folgende Abgleich gegen das adressaten-korrigierte Gold.',
    '',
    '## Ergebnis',
    '',
    '| SCF | akzeptierte Gesetzes-Mengen | wiedergefunden durch |',
    '| --- | --- | --- |',
    ...r.goldHits.map(
      (g) => `| ${g.id} | ${g.lawSets.map((s) => s.join(' + ')).join(' *oder* ')} | ${g.matchedBy ?? '—'} |`,
    ),
    '',
    `**${r.goldHitCount} von ${SCF_GOLD.length}** (Schwelle ${GOLD_HITS_MIN}). Vorher, mit dem adressaten-blinden Gold: ${meta.previousGoldHitCount}.`,
    '',
    r.ambiguousGoldMatches.length
      ? `⚠️ **Mehrdeutig:** ${r.ambiguousGoldMatches.join(', ')} trifft mehrere Gold-Einträge — die Quote ist dadurch eher zu hoch als zu niedrig.`
      : 'Keine Maßnahme trifft mehrere Gold-Einträge.',
    '',
    `Semantische Negativ-Kontrolle auf der neuen Klassifikation: ${r.negativeSemantic ? '✅' : '❌'}`,
    '',
    '## Grenzen dieser Nachrechnung',
    '',
    `- **Zweiter Klassifikations-Durchgang.** ${r.classified} von ${r.classified + r.unclassified} Texten erhielten eine Handlung; ` +
      `${r.unclassified} blieben ohne. Im Lauf selbst gab es dafür einen Rückfall auf die erste extrahierte Handlung, den es hier nicht gibt — ` +
      'diese Fälle können den Abgleich nur senken, nie heben.',
    '- **Kein neuer Beleg für die Kette.** Widerspricht diese Zahl dem Lauf, ist der Lauf die Referenz, nicht die Nachrechnung.',
    '- Ein negatives Ergebnis bleibt ein **gültiges Ergebnis**.',
  ].join('\n');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runPath = argv[0];
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx !== -1 ? argv[outIdx + 1] : undefined;
  if (!runPath) {
    console.error('Usage: reqtrace-rescore <run.json> [--out <report.md>]');
    process.exitCode = 2;
    return;
  }

  const abs = path.resolve(runPath);
  const run = JSON.parse(fs.readFileSync(abs, 'utf8')) as RescoreInput & { goldHitCount?: number };
  const ids = Object.keys(run.sysReqTexts ?? {});
  if (ids.length === 0) throw new Error(`${abs}: keine sysReqTexts — nichts nachzurechnen.`);

  const { createRaterClient, resolveRaterConfig, withEmptyResponseRetry } = await import('../evals/raterClient');
  const client = withEmptyResponseRetry(createRaterClient(resolveRaterConfig(argv)));

  const actions: Record<string, string | null> = {};
  let done = 0;
  const CONCURRENCY = 6;
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const text = run.sysReqTexts[id];
        const { text: answer } = await client.complete({
          system: CLASSIFY_SYSTEM,
          user: buildClassifyUserPrompt({ law: lawOfId(id), para: '', title: text, text }),
          maxTokens: 900,
        });
        actions[id] = parseActionAssignment(answer)?.actionId ?? null;
        process.stdout.write(`\r[reqtrace:rescore] ${++done}/${ids.length}   `);
      }
    }),
  );

  const result = rescore(run, actions);
  const markdown = renderRescoreReport(result, {
    runPath,
    previousGoldHitCount: run.goldHitCount ?? 0,
  });
  console.log(`\n${markdown}`);

  if (outPath) {
    const outAbs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, `${markdown}\n`);
    // Die Handlungen daneben — damit die naechste Korrektur ohne Modellaufruf auskommt.
    fs.writeFileSync(
      outAbs.replace(/\.md$/, '') + '.json',
      `${JSON.stringify({ ...result, sysReqActions: actions }, null, 2)}\n`,
    );
    console.log(`\n[reqtrace:rescore] → ${outAbs}`);
  }
}

if (require.main === module) {
  void main();
}
