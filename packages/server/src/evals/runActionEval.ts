/**
 * runActionEval — Drei-Arme-Kontrollversuch für den Handlungs-Katalog
 * (THE-438 Slice 1, Task 7, REQ-REQHARM-001.2b).
 *
 *   export ANTHROPIC_API_KEY=sk-…
 *   npm run actions:eval -- [--golden src/evals/golden/actions.v1.json]
 *                           [--houses anthropic:claude-haiku-4-5-20251001,openrouter:openai/gpt-5]
 *                           [--out report.md]
 *
 * Aufbau dreigeteilt wie runTypingEval:
 *   - renderActionReportMarkdown : rein (kein I/O) → testbar.
 *   - evaluateActions            : Kern, Häuser INJIZIERT → mit Stubs testbar.
 *   - main                       : Glue — echte Häuser aus raterClient.
 *
 * ── WAS DIESER EVAL BEANTWORTET UND WAS NICHT ──
 *
 * Er beantwortet: Trennt die kanonische Handlung harmonisierbare von nicht
 * harmonisierbaren Pflichtpaaren, und wie einig sind sich die Häuser?
 *
 * Er beantwortet NICHT, ob ein einzelnes Paar harmonisierbar IST. Die
 * gemessenen κ liegen zwischen 0,308 und 0,697 und damit unter dem
 * Kohärenz-Tor 0,80: die Häuser sind sich über die QUOTE einig, über das
 * EINZELNE PAAR nicht. Deshalb liefert dieser Slice Vorschläge mit
 * Konfidenzstufe — kein Auto-Merge.
 *
 * NICHT NEU BAUEN: `raterClient` löst Reasoning-Budget (Mindestens 2000 Tokens
 * auf der OpenRouter-Seite) und Leer-Antwort-Retry bereits. Ein Reasoning-
 * Modell mit zu kleinem Budget liefert `finish_reason: "length"` und LEEREN
 * Text — das sähe in der Auswertung wie „keine Meinung" aus und würde eine
 * ganze Haus-Spalte stillschweigend auf `null` setzen.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import fs from 'node:fs';
import path from 'node:path';
import { PAIR_JUDGE_SYSTEM, buildPairJudgeUserPrompt, parsePairVerdict } from '@thearchitect/shared';
import {
  loadActionGolden,
  buildPositiveControls,
  actionGoldenStats,
  DEFAULT_ACTION_GOLDEN_PATH,
  type ActionGoldenSet,
} from './actionGolden';
import {
  buildActionReport,
  pairwiseKappa,
  tierFor,
  meetsCoherenceGate,
  COHERENCE_GATE,
  type ActionReport,
  type HouseAgreement,
  type Tier,
  type Vote,
} from './actionMetrics';
import {
  createRaterClient,
  withEmptyResponseRetry,
  RATER_DEFAULT_MODEL,
  type RaterProvider,
} from './raterClient';

/** Ein Prüfer-Haus: System- und User-Prompt rein, Rohtext raus. */
export type HouseFn = (system: string, user: string) => Promise<string>;

export interface ActionEvalResult {
  version: string;
  houses: string[];
  report: ActionReport;
  /** Konfidenzstufe je Fall des Prüfsatzes (Arm T und K). */
  tiers: Record<string, Tier>;
  agreements: HouseAgreement[];
  /** Verwertbare Antworten je Haus — ein stummes Haus muss sichtbar sein. */
  usable: Record<string, number>;
  /** caseIds je Arm — damit Stufen auf dem richtigen Nenner berichtet werden. */
  armCaseIds: { T: string[]; K: string[] };
  stats: ReturnType<typeof actionGoldenStats>;
}

async function askAll(
  houses: Record<string, HouseFn>,
  user: string,
): Promise<Record<string, Vote>> {
  const out: Record<string, Vote> = {};
  for (const [name, ask] of Object.entries(houses)) {
    const verdict = parsePairVerdict(await ask(PAIR_JUDGE_SYSTEM, user));
    out[name] = verdict ? verdict.same : null;
  }
  return out;
}

/**
 * Kern des Kontrollversuchs. Fährt jedes Haus über Arm P (erzeugt), T und K.
 *
 * Arm P zuerst: fällt die Positiv-Kontrolle durch, ist der Lauf ungültig — die
 * übrigen Arme werden trotzdem gemessen, damit die Fehlersuche Material hat,
 * aber `report.tRate` bleibt `null`.
 */
export async function evaluateActions(
  set: ActionGoldenSet,
  houses: Record<string, HouseFn>,
  onProgress?: (done: number, total: number) => void,
): Promise<ActionEvalResult> {
  const names = Object.keys(houses);
  const controls = buildPositiveControls(set);
  const total = controls.length + set.cases.length;
  let done = 0;

  const votesP: Record<string, Vote[]> = Object.fromEntries(names.map((n) => [n, []]));
  for (const c of controls) {
    const v = await askAll(houses, buildPairJudgeUserPrompt(c.a, c.b));
    for (const n of names) votesP[n].push(v[n]);
    onProgress?.(++done, total);
  }

  const votesByCase: Record<string, Record<string, Vote>> = {};
  const votesT: Record<string, Vote[]> = Object.fromEntries(names.map((n) => [n, []]));
  const votesK: Record<string, Vote[]> = Object.fromEntries(names.map((n) => [n, []]));
  const votesDecision: Record<string, Vote[]> = Object.fromEntries(names.map((n) => [n, []]));

  for (const c of set.cases) {
    const v = await askAll(houses, buildPairJudgeUserPrompt(c.a, c.b));
    votesByCase[c.id] = v;
    for (const n of names) {
      (c.arm === 'T' ? votesT : votesK)[n].push(v[n]);
      votesDecision[n].push(v[n]);
    }
    onProgress?.(++done, total);
  }

  // Für die Arm-Quoten zählen nur verwertbare Stimmen: ein Ausfall ist keine
  // Ablehnung und darf die Quote nicht drücken (er taucht in `usable` auf).
  const flatten = (votes: Record<string, Vote[]>): boolean[] =>
    names.flatMap((n) => votes[n].filter((v): v is boolean => v !== null));

  const report = buildActionReport({ P: flatten(votesP), T: flatten(votesT), K: flatten(votesK) });

  const tiers: Record<string, Tier> = {};
  for (const c of set.cases) tiers[c.id] = tierFor(names.map((n) => votesByCase[c.id][n]));

  const usable = Object.fromEntries(
    names.map((n) => [n, [...votesP[n], ...votesDecision[n]].filter((v) => v !== null).length]),
  );

  return {
    version: set.version,
    houses: names,
    report,
    tiers,
    agreements: pairwiseKappa(votesDecision),
    usable,
    armCaseIds: {
      T: set.cases.filter((c) => c.arm === 'T').map((c) => c.id),
      K: set.cases.filter((c) => c.arm === 'K').map((c) => c.id),
    },
    stats: actionGoldenStats(set),
  };
}

/** Rein — keinerlei I/O, damit der Bericht testbar bleibt. */
export function renderActionReportMarkdown(r: ActionEvalResult): string {
  const gateOk = r.agreements.every((a) => meetsCoherenceGate(a.kappa));

  // Stufen JE ARM, nicht über alle Fälle: Arm K erreicht konstruktionsbedingt
  // nie A oder B, seine 60 Fälle im Nenner würden die Arm-T-Quote halbieren
  // (11/120 = 9 % statt 11/60 = 18 %). Zugleich ist die K-Zeile eine zweite
  // Ablesung der Negativ-Kontrolle: dort MUSS überall 0 stehen.
  const tierIn = (arm: 'T' | 'K', t: Tier): number =>
    r.armCaseIds[arm].filter((id) => r.tiers[id] === t).length;
  const pctIn = (arm: 'T' | 'K', n: number): string => {
    const d = r.armCaseIds[arm].length;
    return d ? `${Math.round((100 * n) / d)} %` : '—';
  };
  const tierRow = (t: Tier, kriterium: string, verhalten: string): string =>
    `| ${t} | ${kriterium} | ${tierIn('T', t)} / ${r.armCaseIds.T.length} (${pctIn('T', tierIn('T', t))}) ` +
    `| ${tierIn('K', t)} / ${r.armCaseIds.K.length} | ${verhalten} |`;

  return [
    `# Handlungs-Katalog — Kontrollversuch (${r.version})`,
    '',
    `Häuser: ${r.houses.join(' · ')} · Prüfsatz: ${r.stats.total} Fälle ` +
      `(T ${r.stats.byArm.T} · K ${r.stats.byArm.K}) über ${r.stats.laws.join(', ')}`,
    '',
    r.report.markdown,
    '',
    'Die Arm-Quoten sind über die Häuser GEPOOLT (alle verwertbaren Stimmen aller Häuser). Das ist ' +
      'weder die Quote eines einzelnen Hauses noch die Mehrheitsquote aus der Stufen-Tabelle — drei ' +
      'verschiedene Zahlen, die nicht gegeneinander zitiert werden dürfen.',
    '',
    '## Konfidenzstufen',
    '',
    '| Stufe | Kriterium | Arm T | Arm K *(muss 0 sein)* | Verhalten |',
    '| --- | --- | --- | --- | --- |',
    tierRow('A', 'alle Häuser einig', 'vorschlagen, vorausgewählt'),
    tierRow('B', 'Mehrheit ≥2/3', 'vorschlagen, nicht vorausgewählt'),
    tierRow('C', 'sonst', 'nur auf Anforderung sichtbar'),
    '',
    'Die Arm-K-Spalte ist eine zweite Ablesung der Negativ-Kontrolle: dort muss überall 0 stehen.',
    '',
    '## Übereinstimmung der Häuser',
    '',
    '| Paar | κ | roh | n |',
    '| --- | --- | --- | --- |',
    ...r.agreements.map(
      (a) =>
        `| ${a.a} ↔ ${a.b} | ${a.kappa === null ? 'n/a' : a.kappa.toFixed(3)} | ` +
        `${(100 * a.agreement).toFixed(0)} % | ${a.n} |`,
    ),
    '',
    gateOk
      ? `Alle κ ≥ ${COHERENCE_GATE} — das Kohärenz-Tor ist erfüllt.`
      : `Mindestens ein κ liegt unter dem Kohärenz-Tor ${COHERENCE_GATE}: die Häuser sind sich über die ` +
        'QUOTE einig, über das EINZELNE PAAR nicht. Das System darf **vorschlagen, nicht behaupten** — ' +
        'kein Auto-Merge.',
    '',
    '## Verwertbare Antworten je Haus',
    '',
    ...r.houses.map((h) => `- ${h}: ${r.usable[h]}`),
    '',
    'Ein stummes Haus ist KEINE Gegenstimme — es fällt aus der Quote heraus und muss hier sichtbar bleiben.',
  ].join('\n');
}

function parseHouses(spec: string | undefined): Record<string, HouseFn> {
  // "anthropic:modell,openrouter:modell" — ohne Angabe zwei Häuser mit Defaults.
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

  const set = loadActionGolden(path.resolve(arg('--golden') || DEFAULT_ACTION_GOLDEN_PATH));
  const houses = parseHouses(arg('--houses'));

  const result = await evaluateActions(set, houses, (d, t) => process.stdout.write(`\r[actions:eval] ${d}/${t}`));
  const md = renderActionReportMarkdown(result);

  const outPath = arg('--out');
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), md + '\n');
  }
  console.log(`\n${md}`);

  // Ein ungültiger Lauf darf nicht als Erfolg durchgehen — er ist kein
  // Negativ-Befund, sondern gar kein Befund.
  if (!result.report.valid) {
    console.error(`\n[actions:eval] LAUF UNGÜLTIG: ${result.report.reason}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
