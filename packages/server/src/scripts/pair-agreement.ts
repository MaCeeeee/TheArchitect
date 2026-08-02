/**
 * pair-agreement — stellt die Urteile des Richters denen des MENSCHEN gegenüber
 * (THE-382 Slice 1, Task 8).
 *
 * ── DIE ZAHL, AN DER ALLES HÄNGT ──
 *
 * Alle bisherigen Kappa-Werte des Projekts messen Übereinstimmung zwischen
 * MODELLEN. Drei Häuser können sich einig und gemeinsam falsch sein — sie teilen
 * Trainingsdaten, Formulierungsgewohnheiten und blinde Flecken. Erst dieser
 * Vergleich sagt, ob die Urteile mit einem Fachmenschen zusammengehen.
 *
 *   npm run pairs:agreement -- [--gold src/evals/golden/actions.human.v1.json]
 *                              [--houses anthropic,openrouter]
 *
 * ── DREI REGELN DER AUSWERTUNG ──
 *
 * 1. „Unsicher" (`relation: null`) wird ÜBERSPRUNGEN, nicht als Dissens
 *    gezählt. Ein Mensch, der ehrlich zögert, darf den Kappa nicht drücken.
 * 2. Verglichen wird auf den VIER TYPEN, nicht binär gefaltet. Die Faltung war
 *    der ursprüngliche Fehler.
 * 3. Vergibt der Mensch häufig `equal`, ist das ein WIDERSPRUCH zum Experiment
 *    (0 von 120 bei den Modellen) und vor jeder Veröffentlichung zu klären.
 *
 * Linear: THE-382 · Prämisse: THE-538, THE-438
 */
import path from 'node:path';
import {
  PAIR_RELATION_SYSTEM,
  buildPairRelationUserPrompt,
  parsePairRelation,
  type PairRelation,
} from '@thearchitect/shared';
import { loadActionGolden, DEFAULT_ACTION_GOLDEN_PATH } from '../evals/actionGolden';
import { loadPairGold, DEFAULT_PAIR_GOLD_PATH, relationDistribution, unsureRate } from '../evals/pairGold';
import { relationKappa, relationConfusion, relationCounts, meetsCoherenceGate } from '../evals/actionMetrics';
import { createRaterClient, withEmptyResponseRetry, RATER_DEFAULT_MODEL, type RaterProvider } from '../evals/raterClient';
import type { HouseFn } from '../evals/runActionEval';

/** Tor für den Vergleich Richter ↔ Mensch. Bewusst unter dem Kohärenz-Tor 0,80. */
export const HUMAN_AGREEMENT_GATE = 0.7;

export interface AgreementRow {
  house: string;
  /** `null` = nicht bestimmbar (konstanter Prüfer). Unwissen ist kein Bestehen. */
  kappa: number | null;
  agreement: number;
  /** Fälle, in denen BEIDE geurteilt haben. */
  n: number;
  confusion: Record<string, number>;
  relations: Record<string, number>;
}

export interface AgreementResult {
  rows: AgreementRow[];
  /** Vom Menschen ausdrücklich als unsicher markiert — aus dem Kappa heraus. */
  skippedUnsure: number;
  humanRelations: Record<string, number>;
  humanUnsureRate: number | null;
  annotator: string;
}

/**
 * Rein — kein I/O, keine Netzaufrufe. Die Auswertung muss testbar sein, ohne
 * dass ein Mensch adjudiziert hat.
 */
export function buildAgreement(
  human: { caseId: string; relation: PairRelation | null }[],
  judgeByHouse: Record<string, Record<string, PairRelation | null>>,
  annotator: string,
): AgreementResult {
  const decided = human.filter((h) => h.relation !== null);

  const rows: AgreementRow[] = Object.entries(judgeByHouse).map(([house, byCase]) => {
    const a: string[] = [];
    const b: string[] = [];
    for (const h of decided) {
      const j = byCase[h.caseId];
      // Ein stummes Haus ist keine Meinung — es faellt aus dem Vergleich heraus,
      // statt als Abweichung vom Menschen zu zaehlen.
      if (j != null) {
        a.push(h.relation as string);
        b.push(j);
      }
    }
    const agree = a.filter((v, i) => v === b[i]).length;
    return {
      house,
      kappa: relationKappa(a, b),
      agreement: a.length === 0 ? 0 : agree / a.length,
      n: a.length,
      confusion: relationConfusion(a, b),
      relations: relationCounts(b),
    };
  });

  const humanRelations = relationCounts(human.map((h) => h.relation));
  return {
    rows,
    skippedUnsure: human.length - decided.length,
    humanRelations,
    humanUnsureRate: human.length === 0 ? null : (human.length - decided.length) / human.length,
    annotator,
  };
}

/** Rein — der Bericht ist zum Lesen, die Zahlen stehen darüber. */
export function renderAgreementMarkdown(r: AgreementResult): string {
  const dist = (c: Record<string, number>): string =>
    ['equal', 'subset', 'intersects', 'unrelated'].map((k) => `${k} ${c[k] ?? 0}`).join(' · ');

  const gateRow = (row: AgreementRow): string =>
    `| ${row.house} | ${row.kappa === null ? 'n/a' : row.kappa.toFixed(3)} | ` +
    `${(100 * row.agreement).toFixed(0)} % | ${row.n} | ` +
    `${row.kappa !== null && row.kappa >= HUMAN_AGREEMENT_GATE ? '✅' : '❌'} |`;

  const worstCells = (row: AgreementRow): string => {
    const cells = Object.entries(row.confusion)
      .filter(([k]) => k.split('|')[0] !== k.split('|')[1])
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5);
    return cells.length ? cells.map(([k, v]) => `\`${k}\` ${v}×`).join(' · ') : '— keine Abweichung';
  };

  const anyPass = r.rows.some((row) => row.kappa !== null && row.kappa >= HUMAN_AGREEMENT_GATE);

  return [
    '# Paar-Richter gegen den Menschen (THE-382 Slice 1)',
    '',
    `Adjudikator: **${r.annotator}** · verglichen auf den VIER Typen, nicht binär gefaltet.`,
    '',
    '## κ Richter ↔ Mensch',
    '',
    `| Haus | κ *(4 Typen)* | roh | n | Tor ≥ ${HUMAN_AGREEMENT_GATE} |`,
    '| --- | --- | --- | --- | --- |',
    ...r.rows.map(gateRow),
    '',
    ...r.rows.flatMap((row) => [`Dissens ${row.house}: ${worstCells(row)}`, '']),
    '## Typ-Verteilung',
    '',
    '| | Verteilung |',
    '| --- | --- |',
    `| **Mensch** | ${dist(r.humanRelations)} |`,
    ...r.rows.map((row) => `| ${row.house} | ${dist(row.relations)} |`),
    '',
    (r.humanRelations.equal ?? 0) === 0
      ? '`equal` vergibt auch der Mensch nicht — unabhängige Bestätigung von Ergebnis 2 des Experiments ' +
        '(0 von 120 bei den Modellen). Die Aussage lautet „gemeinsamer Kern, ausgewiesene Zusätze".'
      : `**Der Mensch vergibt \`equal\` ${r.humanRelations.equal}×**, die Modelle taten es in 120 Fällen nie. ` +
        'Das ist eine Rubrik-Differenz Mensch/Maschine (O-5) und **vor** jeder Veröffentlichung zu klären — ' +
        'keine Zahl aus diesem Lauf zitieren, bevor sie geklärt ist.',
    '',
    `Übersprungen, weil der Mensch „unsicher" angab: **${r.skippedUnsure}**` +
      (r.humanUnsureRate !== null ? ` (${(100 * r.humanUnsureRate).toFixed(0)} %)` : '') +
      '. Sie zählen NICHT als Dissens — ein ehrliches Zögern darf den Kappa nicht drücken.',
    '',
    '## Verdikt',
    '',
    anyPass
      ? `Mindestens ein Haus erreicht das Tor ${HUMAN_AGREEMENT_GATE}: der typisierte Richter ist verwendbar. ` +
        'Die Stufen A/B/C gelten auf Typen, die Aussage lautet „gemeinsamer Kern, ausgewiesene Zusätze".'
      : `**Kein Haus erreicht das Tor ${HUMAN_AGREEMENT_GATE}.** Auch die typisierte Fassung trägt nicht — ` +
        'dann ist die Frage selbst zu klären, bevor irgendeine Quote zitiert wird.',
    '',
    '> **Grenze, die in jeden Report gehört:** wenige Paare, EIN Adjudikator, geblendete Darstellung. ' +
      'Das reicht, um einen groben Dissens zu erkennen — nicht, um einen knappen κ auf zwei Stellen zu verteidigen. ' +
      'Ohne einen zweiten Menschen kennen wir die Mensch↔Mensch-Obergrenze nicht, also auch nicht, was der ' +
      'Richter überhaupt erreichen *könnte*.',
  ].join('\n');
}

function parseHouses(spec: string | undefined): Record<string, HouseFn> {
  const parts = (spec || 'anthropic,openrouter').split(',').map((s) => s.trim()).filter(Boolean);
  const houses: Record<string, HouseFn> = {};
  for (const p of parts) {
    const [provider, model] = p.split(':') as [RaterProvider, string | undefined];
    const cfg = { provider, model: model || RATER_DEFAULT_MODEL[provider] };
    const client = withEmptyResponseRetry(createRaterClient(cfg));
    houses[`${cfg.provider}/${cfg.model}`] = async (system, user) =>
      (await client.complete({ system, user, maxTokens: 400 })).text;
  }
  return houses;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };

  const gold = loadPairGold(path.resolve(arg('--gold') || DEFAULT_PAIR_GOLD_PATH));
  const set = loadActionGolden(path.resolve(arg('--golden') || DEFAULT_ACTION_GOLDEN_PATH));
  const houses = parseHouses(arg('--houses'));

  const byId = new Map(set.cases.map((c) => [c.id, c]));
  const missing = gold.verdicts.filter((v) => !byId.has(v.caseId)).map((v) => v.caseId);
  if (missing.length) {
    // Abbruch statt Filter: ein stillschweigend verkleinerter Vergleich liefert
    // ein plausibles Kappa auf weniger Faellen, und niemand sieht es.
    console.error(`[pairs:agreement] FEHLER: unbekannte caseId(s): ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const judgeByHouse: Record<string, Record<string, PairRelation | null>> = Object.fromEntries(
    Object.keys(houses).map((h) => [h, {}]),
  );
  let done = 0;
  for (const v of gold.verdicts) {
    const c = byId.get(v.caseId)!;
    const user = buildPairRelationUserPrompt(c.a, c.b);
    for (const [name, ask] of Object.entries(houses)) {
      const parsed = parsePairRelation(await ask(PAIR_RELATION_SYSTEM, user));
      judgeByHouse[name][v.caseId] = parsed ? parsed.relation : null;
    }
    process.stdout.write(`\r[pairs:agreement] ${++done}/${gold.verdicts.length}`);
  }

  const result = buildAgreement(gold.verdicts, judgeByHouse, gold.annotator);
  console.log(`\n${renderAgreementMarkdown(result)}`);

  if (!result.rows.some((r) => meetsCoherenceGate(r.kappa) || (r.kappa !== null && r.kappa >= HUMAN_AGREEMENT_GATE))) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
