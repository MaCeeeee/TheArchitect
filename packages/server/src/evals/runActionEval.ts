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
import {
  PAIR_RELATION_SYSTEM,
  buildPairRelationUserPrompt,
  parsePairRelation,
  foldRelation,
  type PairRelation,
} from '@thearchitect/shared';
import {
  loadActionGolden,
  buildPositiveControls,
  actionGoldenStats,
  DEFAULT_ACTION_GOLDEN_PATH,
  type ActionGoldenSet,
} from './actionGolden';
import {
  buildActionReport,
  pairwiseRelationKappa,
  tierForRelations,
  relationCounts,
  meetsCoherenceGate,
  COHERENCE_GATE,
  type ActionReport,
  type RelationAgreement,
  type Tier,
} from './actionMetrics';
import {
  buildCanaries,
  canaryCatchRate,
  meetsCanaryGate,
  isCanaryId,
  CANARY_CATCH_MIN,
} from './canaries';
import {
  createRaterClient,
  withEmptyResponseRetry,
  RATER_DEFAULT_MODEL,
  type RaterProvider,
} from './raterClient';

/** Ein Prüfer-Haus: System- und User-Prompt rein, Rohtext raus. */
export type HouseFn = (system: string, user: string) => Promise<string>;

/** Ein typisiertes Votum. `null` = Haus hat nicht geantwortet oder war unlesbar. */
export type RelationVote = PairRelation | null;

export interface ActionEvalResult {
  version: string;
  houses: string[];
  report: ActionReport;
  /** Konfidenzstufe je Fall des Prüfsatzes (Arm T und K) — NIE für Kanarienvögel. */
  tiers: Record<string, Tier>;
  agreements: RelationAgreement[];
  /** Typ-Verteilung je Arm — die Zahl, an der `equal` sichtbar wird (oder eben nicht). */
  relationsByArm: { T: Record<string, number>; K: Record<string, number> };
  /** Fangquote der Kanarienvögel. `null` = keine geurteilt → Lauf ungültig. */
  canaryRate: number | null;
  /** Kanarienvögel, die NICHT gefangen wurden — jeder einzelne ist zu lesen. */
  canaryMisses: { id: string; house: string; relation: PairRelation }[];
  /** Verwertbare Antworten je Haus — ein stummes Haus muss sichtbar sein. */
  usable: Record<string, number>;
  /** caseIds je Arm — damit Stufen auf dem richtigen Nenner berichtet werden. */
  armCaseIds: { T: string[]; K: string[] };
  /**
   * Stimmen je Fall und Haus. Ohne sie sagt ein gerissenes Tor zwar DASS die
   * Negativ-Kontrolle versagt hat, aber nicht WELCHES Paar — und die
   * vorgeschriebene Abhilfe („Katalog-Eintrag aufteilen") wäre nicht
   * ausführbar. Ein Befund, den man nicht lokalisieren kann, ist kein Befund.
   */
  votesByCase: Record<string, Record<string, RelationVote>>;
  stats: ReturnType<typeof actionGoldenStats>;
}

async function askAll(
  houses: Record<string, HouseFn>,
  user: string,
): Promise<Record<string, RelationVote>> {
  const out: Record<string, RelationVote> = {};
  for (const [name, ask] of Object.entries(houses)) {
    const verdict = parsePairRelation(await ask(PAIR_RELATION_SYSTEM, user));
    out[name] = verdict ? verdict.relation : null;
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
  const canaries = buildCanaries(set);

  // Kanarienvögel GEMISCHT, nicht als Block: ein Modell, das zehn absurde Paare
  // hintereinander sieht, erkennt das Muster und lehnt den elften reflexhaft ab.
  // Der Rhythmus ist deterministisch, damit zwei Läufe vergleichbar bleiben.
  const step = canaries.length ? Math.max(1, Math.floor(set.cases.length / canaries.length)) : 0;
  const queue: ({ kind: 'case'; c: (typeof set.cases)[number] } | { kind: 'canary'; c: (typeof canaries)[number] })[] = [];
  let ci = 0;
  set.cases.forEach((c, i) => {
    queue.push({ kind: 'case', c });
    if (step && (i + 1) % step === 0 && ci < canaries.length) queue.push({ kind: 'canary', c: canaries[ci++] });
  });
  while (ci < canaries.length) queue.push({ kind: 'canary', c: canaries[ci++] });

  const total = controls.length + queue.length;
  let done = 0;

  const votesP: Record<string, RelationVote[]> = Object.fromEntries(names.map((n) => [n, []]));
  for (const c of controls) {
    const v = await askAll(houses, buildPairRelationUserPrompt(c.a, c.b));
    for (const n of names) votesP[n].push(v[n]);
    onProgress?.(++done, total);
  }

  const votesByCase: Record<string, Record<string, RelationVote>> = {};
  const votesT: Record<string, RelationVote[]> = Object.fromEntries(names.map((n) => [n, []]));
  const votesK: Record<string, RelationVote[]> = Object.fromEntries(names.map((n) => [n, []]));
  const votesDecision: Record<string, RelationVote[]> = Object.fromEntries(names.map((n) => [n, []]));
  const canaryVotes: RelationVote[] = [];
  const canaryMisses: { id: string; house: string; relation: PairRelation }[] = [];

  for (const item of queue) {
    const v = await askAll(houses, buildPairRelationUserPrompt(item.c.a, item.c.b));
    votesByCase[item.c.id] = v;

    if (item.kind === 'canary') {
      // Kanarienvögel fließen NIE in Arm-Quoten, Stufen oder Kappa ein — sie
      // sind kein Messwert über den Katalog, sondern über den Richter.
      for (const n of names) {
        canaryVotes.push(v[n]);
        if (v[n] === 'equal' || v[n] === 'subset') {
          canaryMisses.push({ id: item.c.id, house: n, relation: v[n] as PairRelation });
        }
      }
    } else {
      for (const n of names) {
        (item.c.arm === 'T' ? votesT : votesK)[n].push(v[n]);
        votesDecision[n].push(v[n]);
      }
    }
    onProgress?.(++done, total);
  }

  // Für die Arm-Quoten zählen nur verwertbare Stimmen: ein Ausfall ist keine
  // Ablehnung und darf die Quote nicht drücken (er taucht in `usable` auf).
  // `foldRelation` faltet auf Ja/Nein — `intersects` zählt dabei NICHT als
  // Treffer; die Faltung wird im Bericht ausdrücklich benannt (MV-9).
  const flatten = (votes: Record<string, RelationVote[]>): boolean[] =>
    names.flatMap((n) => votes[n].filter((v): v is PairRelation => v !== null).map(foldRelation));

  const canaryRate = canaryCatchRate(canaryVotes);
  const report = buildActionReport(
    { P: flatten(votesP), T: flatten(votesT), K: flatten(votesK) },
    canaryRate,
  );

  const tiers: Record<string, Tier> = {};
  for (const c of set.cases) tiers[c.id] = tierForRelations(names.map((n) => votesByCase[c.id][n]));

  // MV-7 als ausführbare Zusicherung statt als Kommentar: ein Kanarienvogel in
  // den Stufen wäre ein erfundener Vorschlag an den Nutzer.
  const leaked = Object.keys(tiers).filter(isCanaryId);
  if (leaked.length) throw new Error(`Kanarienvogel in den Konfidenzstufen: ${leaked.join(', ')}`);

  const usable = Object.fromEntries(
    names.map((n) => [n, [...votesP[n], ...votesDecision[n]].filter((v) => v !== null).length]),
  );

  return {
    version: set.version,
    houses: names,
    report,
    tiers,
    agreements: pairwiseRelationKappa(votesDecision),
    relationsByArm: {
      T: relationCounts(names.flatMap((n) => votesT[n])),
      K: relationCounts(names.flatMap((n) => votesK[n])),
    },
    canaryRate,
    canaryMisses,
    usable,
    armCaseIds: {
      T: set.cases.filter((c) => c.arm === 'T').map((c) => c.id),
      K: set.cases.filter((c) => c.arm === 'K').map((c) => c.id),
    },
    votesByCase,
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
  // Fehlalarme lokalisieren: Arm-K-Fälle, in denen mindestens ein Haus die
  // Paarung als gemeinsam erfüllbar einstufte (`equal`/`subset` — `intersects`
  // ist bei zwei Compliance-Pflichten kein Fehlalarm, sondern erwartbar).
  const falseAlarms = r.armCaseIds.K.map((id) => ({
    id,
    houses: r.houses.filter((h) => {
      const v = r.votesByCase[id]?.[h];
      return v === 'equal' || v === 'subset';
    }),
  })).filter((f) => f.houses.length > 0);

  const dist = (counts: Record<string, number>): string =>
    ['equal', 'subset', 'intersects', 'unrelated'].map((k) => `${k} ${counts[k] ?? 0}`).join(' · ');

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
    '## Typ-Verteilung je Arm',
    '',
    '| Arm | Verteilung |',
    '| --- | --- |',
    `| T *(gleiche kanonische Handlung)* | ${dist(r.relationsByArm.T)} |`,
    `| K *(verschiedene Handlung)* | ${dist(r.relationsByArm.K)} |`,
    '',
    (r.relationsByArm.T.equal ?? 0) === 0
      ? '`equal` kommt in Arm T NICHT vor — die Aussage lautet „gemeinsamer Kern, ausgewiesene Zusätze", ' +
        'nicht „eine Maßnahme erfüllt beide". Deckt sich mit dem Experiment (0 von 120).'
      : `\`equal\` kommt in Arm T ${r.relationsByArm.T.equal}× vor — das WIDERSPRICHT dem Experiment ` +
        '(0 von 120). Vor jeder Veröffentlichung klären, was sich geändert hat.',
    '',
    '## Kanarienvögel',
    '',
    r.canaryRate === null
      ? '**Keine geurteilt** — die zweite Vorbedingung ist nicht geprüft. Nicht geprüft heißt nicht bestanden.'
      : `Gefangen: **${(100 * r.canaryRate).toFixed(0)} %** (Tor ${100 * CANARY_CATCH_MIN} %) — ` +
        `${meetsCanaryGate(r.canaryRate) ? 'bestanden' : '**GERISSEN**'}. ` +
        'Gefangen ist `unrelated` oder `intersects`; `equal`/`subset` bei zusammengewürfelten Pflichten ist der Rubber-Stamp.',
    '',
    ...(r.canaryMisses.length
      ? [
          '| Kanarienvogel | Haus | Urteil |',
          '| --- | --- | --- |',
          ...r.canaryMisses.map((m) => `| \`${m.id}\` | ${m.house} | ${m.relation} |`),
          '',
        ]
      : []),
    '## Konfidenzstufen',
    '',
    '| Stufe | Kriterium | Arm T | Arm K *(muss 0 sein)* | Verhalten |',
    '| --- | --- | --- | --- | --- |',
    tierRow('A', 'alle einig auf `equal`/`subset`', 'vorschlagen, vorausgewählt'),
    tierRow('B', 'alle einig auf `intersects`', 'vorschlagen, Zusätze ausweisen'),
    tierRow('C', 'uneins über den Typ', 'nur auf Anforderung sichtbar'),
    '',
    'Die Arm-K-Spalte ist eine zweite Ablesung der Negativ-Kontrolle: dort muss überall 0 stehen.',
    '',
    ...(falseAlarms.length
      ? [
          '### Fehlalarme der Negativ-Kontrolle',
          '',
          'Diese Paare tragen VERSCHIEDENE kanonische Handlungen, wurden aber als `equal` oder `subset`',
          'beurteilt — also als gemeinsam erfüllbar. Jedes einzelne ist zu adjudizieren: entweder ist der',
          'Katalog-Eintrag zu grob',
          '(dann aufteilen) oder der Prüfsatz-Fall falsch einsortiert (dann korrigieren).',
          '',
          '| Fall | Haus/Häuser |',
          '| --- | --- |',
          ...falseAlarms.map((f) => `| \`${f.id}\` | ${f.houses.join(', ')} |`),
          '',
        ]
      : []),
    '## Übereinstimmung der Häuser',
    '',
    '| Paar | κ *(4 Typen)* | roh | n |',
    '| --- | --- | --- | --- |',
    ...r.agreements.map(
      (a) =>
        `| ${a.a} ↔ ${a.b} | ${a.kappa === null ? 'n/a' : a.kappa.toFixed(3)} | ` +
        `${(100 * a.agreement).toFixed(0)} % | ${a.n} |`,
    ),
    '',
    ...r.agreements.flatMap((a) => {
      // Wo der Dissens sitzt. Ohne diese Zellen laesst er sich zaehlen, aber
      // nicht adjudizieren — und im Experiment war genau hier der Befund.
      const cells = Object.entries(a.confusion)
        .filter(([k]) => k.split('|')[0] !== k.split('|')[1])
        .sort((x, y) => y[1] - x[1])
        .slice(0, 5);
      return cells.length
        ? [`Dissens ${a.a} ↔ ${a.b}: ` + cells.map(([k, v]) => `\`${k}\` ${v}×`).join(' · '), '']
        : [];
    }),
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
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, md + '\n');
    // Rohdaten daneben: ein Bericht ist zum Lesen, die Stimmen sind zum
    // Nachrechnen. Ohne sie ist ein gerissenes Tor nicht lokalisierbar.
    fs.writeFileSync(abs.replace(/\.md$/, '') + '.votes.json', JSON.stringify(result.votesByCase, null, 2) + '\n');
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
