/**
 * reqtrace-capability-eval — die Messung von THE-547.
 *
 *   npm run reqtrace:capability -- ../../docs/evals/reqtrace-run-4.json \
 *     ../../docs/evals/reqtrace-objects-run-4.json \
 *     ../../docs/evals/reqtrace-human-adjudication.json \
 *     --out ../../docs/evals/reqtrace-capability.md
 *
 * ── DIE FRAGE ──
 *
 * Verschwinden die **10 vom Menschen abgelehnten** Maßnahmen, wenn man statt auf
 * der Handlung auf der **Capability** (Gegenstand + Handlung) schlüsselt — und
 * bleiben die **22 angenommenen** erhalten?
 *
 * ── WARUM DAS OHNE NEUEN LAUF EXAKT GEHT ──
 *
 * Der Gegenstands-Vergleich sitzt in der Kette VOR dem Richter, als zusätzlicher
 * Filter. Ein Filter kann Paare nur wegnehmen. Jede Maßnahme dieser Auswertung
 * ist deshalb eine Maßnahme aus Lauf 4 — es gibt keinen Pfad, auf dem hier eine
 * neue entstünde. Die Paar-Urteile bleiben Byte für Byte dieselben; der einzige
 * Unterschied zwischen beiden Zahlen ist der Gegenstand.
 *
 * ── DIE SCHWELLEN STEHEN IM TICKET, NICHT HIER UNTEN ──
 *
 * ≥8 der 10 Ablehnungen müssen verschwinden, ≤3 der 22 Annahmen dürfen fallen,
 * die Gold-Quote darf nicht unter 4/5 sinken. Vorab festgelegt (THE-547), bevor
 * eine Zahl vorlag — der Fehler aus THE-545 wiederholt sich nicht.
 *
 * Linear: THE-547 · Rahmen: ADR-0007 E4
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { sameCapability } from '@thearchitect/shared';
import { SCF_GOLD, ACTION_TO_SCF, type GoldHit } from '../evals/reqtrace/runReqtraceEval';
import { lawOfId } from './reqtrace-rescore';

/** Vorab festgelegt in THE-547. Nicht anfassen, um eine Zahl zu retten. */
export const MIN_REJECTIONS_REMOVED = 8;
export const MAX_ACCEPTS_LOST = 3;
export const MIN_GOLD_HITS = 4;

export interface CapabilityEvalInput {
  run: {
    sysReqActions: Record<string, string | null>;
    grouping: {
      measures: { id: string; memberIds: string[]; laws: string[] }[];
      sharedCorePairs: { a: string; b: string; relation: string }[];
    };
  };
  /** Anforderungs-Id → Gegenstand (Freitext oder kanonisch). */
  objects: Record<string, string | null>;
  /** Maßnahmen-Id → menschliches Urteil. `null` = unsicher. */
  human: Record<string, boolean | null>;
}

export interface CapabilityEvalResult {
  /** Vom Menschen abgelehnt UND jetzt getrennt — der erwünschte Fall. */
  rejectionsRemoved: number;
  rejectionsTotal: number;
  /** Vom Menschen angenommen UND jetzt getrennt — der Preis. */
  acceptsLost: number;
  acceptsTotal: number;
  /** Übereinstimmung Mensch ↔ Capability-Schlüssel über alle beurteilten Fälle. */
  agreement: number;
  agreementBefore: number;
  /** Fälle ohne bestimmbaren Gegenstand — sie zählen als „getrennt". */
  undeterminable: number;
  goldHits: GoldHit[];
  goldHitCount: number;
  survivingMeasures: number;
  survivingPairs: number;
  pairsBefore: number;
  verdict: 'traegt' | 'traegt-nicht';
  verdictReason: string;
}

const keyOf = (
  id: string,
  input: CapabilityEvalInput,
): { gegenstand: string | null; actionId: string | null } => ({
  gegenstand: input.objects[id] ?? null,
  actionId: input.run.sysReqActions[id] ?? null,
});

/** Bleibt diese Gruppe unter dem Capability-Schlüssel zusammen? REIN. */
export function survivesCapabilityFilter(ids: string[], input: CapabilityEvalInput): boolean {
  if (ids.length < 2) return false;
  const first = keyOf(ids[0], input);
  return ids.slice(1).every((id) => sameCapability(first, keyOf(id, input)));
}

/** Der Kern. REIN — kein I/O, kein Modell. */
export function evaluateCapability(input: CapabilityEvalInput): CapabilityEvalResult {
  const multi = input.run.grouping.measures.filter((m) => m.memberIds.length > 1);

  let rejectionsRemoved = 0;
  let rejectionsTotal = 0;
  let acceptsLost = 0;
  let acceptsTotal = 0;
  let agree = 0;
  let judged = 0;
  let undeterminable = 0;

  for (const m of multi) {
    const verdict = input.human[m.id];
    const survives = survivesCapabilityFilter(m.memberIds, input);
    if (m.memberIds.some((id) => !input.objects[id])) undeterminable += 1;
    if (verdict === undefined || verdict === null) continue;

    judged += 1;
    if (verdict === survives) agree += 1;
    if (verdict) {
      acceptsTotal += 1;
      if (!survives) acceptsLost += 1;
    } else {
      rejectionsTotal += 1;
      if (!survives) rejectionsRemoved += 1;
    }
  }

  // ── Gold neu ziehen, auf demselben Kandidaten-Begriff wie Lauf 4 ──────────
  const surviving = multi.filter((m) => survivesCapabilityFilter(m.memberIds, input));
  const survivingPairs = input.run.grouping.sharedCorePairs.filter((p) =>
    survivesCapabilityFilter([p.a, p.b], input),
  );

  const goldCandidates = [
    ...surviving.map((m) => ({ id: m.id, ids: m.memberIds })),
    ...survivingPairs.map((p) => ({ id: `pair__${p.a}__${p.b}`, ids: [p.a, p.b] })),
  ];
  const lawsOf = (ids: string[]): string[] => [...new Set(ids.map(lawOfId))];
  const actionsOf = (ids: string[]): string[] =>
    ids.map((id) => input.run.sysReqActions[id]).filter((a): a is string => Boolean(a));

  const goldHits: GoldHit[] = SCF_GOLD.map((g) => {
    const hit = goldCandidates.find(
      (c) =>
        g.lawSets.some((set) => set.every((l) => lawsOf(c.ids).includes(l))) &&
        actionsOf(c.ids).some((a) => (ACTION_TO_SCF[a] ?? []).includes(g.id)),
    );
    return { id: g.id, lawSets: g.lawSets, matchedBy: hit?.id ?? null };
  });
  const goldHitCount = goldHits.filter((g) => g.matchedBy).length;

  const reasons: string[] = [];
  if (rejectionsRemoved < MIN_REJECTIONS_REMOVED) {
    reasons.push(
      `Nur ${rejectionsRemoved} von ${rejectionsTotal} Ablehnungen aufgelöst (verlangt ≥ ${MIN_REJECTIONS_REMOVED}) — ` +
        'der Gegenstand ist nicht die Ursache.',
    );
  }
  if (acceptsLost > MAX_ACCEPTS_LOST) {
    reasons.push(
      `${acceptsLost} von ${acceptsTotal} Annahmen verloren (zulässig ≤ ${MAX_ACCEPTS_LOST}) — über-segmentiert.`,
    );
  }
  if (goldHitCount < MIN_GOLD_HITS) {
    reasons.push(`Gold-Quote auf ${goldHitCount}/${SCF_GOLD.length} gefallen (verlangt ≥ ${MIN_GOLD_HITS}).`);
  }

  return {
    rejectionsRemoved,
    rejectionsTotal,
    acceptsLost,
    acceptsTotal,
    agreement: judged === 0 ? 0 : agree / judged,
    // Vor dem Filter ueberlebte JEDE Massnahme — die Uebereinstimmung war
    // deshalb exakt der Anteil der Annahmen.
    agreementBefore: judged === 0 ? 0 : acceptsTotal / judged,
    undeterminable,
    goldHits,
    goldHitCount,
    survivingMeasures: surviving.length,
    survivingPairs: survivingPairs.length,
    pairsBefore: input.run.grouping.sharedCorePairs.length,
    verdict: reasons.length === 0 ? 'traegt' : 'traegt-nicht',
    verdictReason: reasons.length === 0 ? 'Alle drei Schwellen gehalten.' : reasons.join(' '),
  };
}

export function renderCapabilityReport(r: CapabilityEvalResult, catalogNote: string): string {
  const pct = (x: number): string => `${(x * 100).toFixed(1).replace('.', ',')} %`;
  return [
    '# THE-547 — Ist der Gegenstand die fehlende Achse der Harmonisierung?',
    '',
    `**Verdikt: ${r.verdict === 'traegt' ? '✅ trägt' : '❌ trägt nicht'}** — ${r.verdictReason}`,
    '',
    'Grundlage ist Lauf 4 aus THE-545. Segmentierung, Extraktion, Transformation, Paarurteile',
    'und Verdrängung sind **unverändert übernommen**; neu ist allein der Gegenstands-Filter.',
    'Er sitzt vor dem Richter und kann Paare nur wegnehmen — es gibt keinen Pfad, auf dem hier',
    'eine Maßnahme entstünde, die es in Lauf 4 nicht gab.',
    '',
    `Gegenstands-Werteraum: ${catalogNote}`,
    '',
    '## Die drei vorab gesetzten Schwellen',
    '',
    '| Kontrolle | Schwelle | Ergebnis | |',
    '| --- | --- | --- | --- |',
    `| Ablehnungen aufgelöst | ≥ ${MIN_REJECTIONS_REMOVED} | **${r.rejectionsRemoved} von ${r.rejectionsTotal}** | ${r.rejectionsRemoved >= MIN_REJECTIONS_REMOVED ? '✅' : '❌'} |`,
    `| Annahmen verloren | ≤ ${MAX_ACCEPTS_LOST} | **${r.acceptsLost} von ${r.acceptsTotal}** | ${r.acceptsLost <= MAX_ACCEPTS_LOST ? '✅' : '❌'} |`,
    `| Gold-Quote gehalten | ≥ ${MIN_GOLD_HITS}/5 | **${r.goldHitCount}/5** | ${r.goldHitCount >= MIN_GOLD_HITS ? '✅' : '❌'} |`,
    '',
    `**Übereinstimmung mit dem menschlichen Urteil: ${pct(r.agreement)}** (vorher ${pct(r.agreementBefore)}).`,
    '',
    '## Wirkung auf die Kandidaten',
    '',
    '| Größe | vorher | nachher |',
    '| --- | --- | --- |',
    `| geteilte Maßnahmen | ${r.acceptsTotal + r.rejectionsTotal} | ${r.survivingMeasures} |`,
    `| paarweise Kandidaten | ${r.pairsBefore} | ${r.survivingPairs} |`,
    '',
    r.undeterminable
      ? `⚠️ ${r.undeterminable} Maßnahme(n) enthalten eine Anforderung ohne bestimmbaren Gegenstand. ` +
        'Sie zählen als **getrennt** — die konservative Richtung: sie kann eine echte Harmonisierung ' +
        'verpassen, aber nie eine erfinden.'
      : 'Jede beurteilte Anforderung hat einen bestimmbaren Gegenstand.',
    '',
    '## Gold gegen das SCF',
    '',
    '| SCF | akzeptierte Gesetzes-Mengen | wiedergefunden durch |',
    '| --- | --- | --- |',
    ...r.goldHits.map(
      (g) => `| ${g.id} | ${g.lawSets.map((s) => s.join(' + ')).join(' *oder* ')} | ${g.matchedBy ?? '—'} |`,
    ),
    '',
    '## Grenzen',
    '',
    '- **Dieselben 32 Fälle wie THE-545.** Der Mensch hat sie beurteilt, bevor der Gegenstand im Spiel war — insofern ist das Urteil unbeeinflusst. Aber es sind **keine neuen Fälle**: gemessen wird, ob die Achse die bekannten Ablehnungen erklärt, nicht ob sie auf unbekannten trägt.',
    '- **Der Gegenstand kommt aus einem Modell.** Ohne Doppelkodierung ist seine eigene Zuverlässigkeit unbekannt.',
    '- Ein negatives Ergebnis ist ein **gültiges Ergebnis**.',
  ].join('\n');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [runPath, objectsPath, humanPath] = argv;
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx !== -1 ? argv[outIdx + 1] : undefined;
  const clustersIdx = argv.indexOf('--clusters');
  const clustersPath = clustersIdx !== -1 ? argv[clustersIdx + 1] : undefined;

  if (!runPath || !objectsPath || !humanPath) {
    console.error('Usage: reqtrace-capability-eval <run.json> <objects.json> <human.json> [--clusters <c.json>] [--out <r.md>]');
    process.exitCode = 2;
    return;
  }

  const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')) as T;
  const run = read<CapabilityEvalInput['run']>(runPath);
  const objectsFile = read<{ objects: Record<string, string | null> }>(objectsPath);
  const humanFile = read<{ measures: Record<string, { oneMeasure: boolean | null }> }>(humanPath);

  let objects = objectsFile.objects;
  let catalogNote = `**Rohwerte** (${new Set(Object.values(objects).filter(Boolean)).size} verschiedene), ungeclustert`;
  if (clustersPath) {
    const clusters = read<Record<string, string>>(clustersPath);
    const norm = (s: string): string => s.trim().toLowerCase();
    objects = Object.fromEntries(
      Object.entries(objects).map(([id, v]) => [id, v ? (clusters[norm(v)] ?? v) : v]),
    );
    catalogNote = `**kanonischer Katalog** aus \`${path.basename(clustersPath)}\` (${new Set(Object.values(clusters)).size} Klassen)`;
  }

  const human = Object.fromEntries(
    Object.entries(humanFile.measures).map(([id, v]) => [id, v.oneMeasure]),
  );

  const result = evaluateCapability({ run, objects, human });
  const markdown = renderCapabilityReport(result, catalogNote);
  console.log(markdown);

  if (outPath) {
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${markdown}\n`);
    fs.writeFileSync(abs.replace(/\.md$/, '') + '.json', `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\n[reqtrace:capability] → ${abs}`);
  }
}

if (require.main === module) {
  void main();
}
