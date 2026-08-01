/**
 * pair-ingest — nimmt den Export des Arbeitsblatts entgegen, prüft ihn gegen
 * den Prüfsatz und legt ihn als `actions.human.v1.json` ab
 * (THE-382 Slice 1, Task 5).
 *
 * ── WARUM DAS EIN EIGENER SCHRITT IST ──
 *
 * Zwischen Browser-Export und Vergleichslauf liegt die einzige Stelle, an der
 * ein stiller Verlust auffallen kann. Eine `caseId`, die es im Prüfsatz nicht
 * gibt, wäre im Vergleich schlicht nicht dabei — das Kappa käme trotzdem
 * heraus, nur auf weniger Fällen und ohne dass es jemand merkt. Deshalb bricht
 * dieses Skript ab, statt zu filtern.
 *
 * ── DIE ZWEI ZAHLEN, DIE ES AUSWEIST ──
 *
 * 1. Anteil „unsicher". Über 30 % ist ein Warnsignal — dann war die Blendung
 *    zu scharf oder die Rubrik unklar, NICHT der Mensch zu unentschlossen.
 * 2. Verteilung der vier Typen. Erscheint `equal` auch beim Menschen nicht,
 *    ist das die unabhängige Bestätigung von Ergebnis 2 des Experiments
 *    (0 von 120 bei den Modellen). Erscheint es häufig, liegt eine
 *    Rubrik-Differenz Mensch/Maschine vor, die vor jeder Veröffentlichung zu
 *    klären ist (O-5).
 *
 *   npm run pairs:ingest -- ~/Downloads/actions-human-ea1.json
 *
 * Linear: THE-382
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadActionGolden, DEFAULT_ACTION_GOLDEN_PATH } from '../evals/actionGolden';
import {
  PairGoldSchema,
  DEFAULT_PAIR_GOLD_PATH,
  findDuplicateCaseIds,
  unsureRate,
  relationDistribution,
  type PairGold,
} from '../evals/pairGold';

/** Schwelle, ab der die Unsicherheits-Quote als Instrumenten-Problem gilt. */
export const UNSURE_WARN = 0.3;

export interface IngestCheck {
  ok: boolean;
  problems: string[];
  notes: string[];
}

/**
 * Prüft ein Gold gegen die bekannten `caseId`s. REIN — damit die Regeln
 * testbar sind und nicht erst beim Einlesen einer echten Datei auffallen.
 */
export function checkPairGold(gold: PairGold, knownCaseIds: Set<string>): IngestCheck {
  const problems: string[] = [];
  const notes: string[] = [];

  const unknown = gold.verdicts.map((v) => v.caseId).filter((id) => !knownCaseIds.has(id));
  if (unknown.length) {
    problems.push(
      `${unknown.length} unbekannte caseId(s): ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ' …' : ''} — ` +
        'stammt der Export aus einem anderen Prüfsatz? Abbruch statt stillem Verlust.'
    );
  }

  const dup = findDuplicateCaseIds(gold.verdicts);
  if (dup.length) problems.push(`doppelte caseIds: ${dup.join(', ')}`);

  if (!gold.blinded) {
    problems.push('blinded=false — der Mensch sah die Gesetzesnamen, der Richter nicht. Nicht vergleichbar.');
  }

  const unsure = unsureRate(gold);
  if (unsure !== null && unsure > UNSURE_WARN) {
    notes.push(
      `WARNUNG: ${(100 * unsure).toFixed(0)} % unsicher (> ${100 * UNSURE_WARN} %). ` +
        'Das ist ein Befund über das INSTRUMENT — zu scharfe Blendung oder unklare Rubrik —, ' +
        'nicht über den Adjudikator. Vor dem Vergleich klären.'
    );
  }

  const dist = relationDistribution(gold);
  if (dist.equal === 0) {
    notes.push(
      'equal: 0 — unabhängige Bestätigung von Ergebnis 2 des Experiments (0 von 120 bei den Modellen). ' +
        'Die Aussage lautet „gemeinsamer Kern, ausgewiesene Zusätze", nicht „eine Maßnahme erfüllt beide".'
    );
  } else {
    notes.push(
      `equal: ${dist.equal} — der Mensch vergibt den Typ, die Modelle taten es in 120 Fällen nie (O-5). ` +
        'Das ist eine Rubrik-Differenz Mensch/Maschine und VOR jeder Veröffentlichung zu klären.'
    );
  }

  return { ok: problems.length === 0, problems, notes };
}

function main(): void {
  const [inPath, outArg] = process.argv.slice(2);
  if (!inPath) {
    console.error('Usage: pair-ingest <export.json> [out.json] [golden.json]');
    process.exitCode = 2;
    return;
  }

  const gold = PairGoldSchema.parse(JSON.parse(fs.readFileSync(path.resolve(inPath), 'utf8')));
  const set = loadActionGolden(process.argv[4] ? path.resolve(process.argv[4]) : DEFAULT_ACTION_GOLDEN_PATH);
  const check = checkPairGold(gold, new Set(set.cases.map((c) => c.id)));

  const dist = relationDistribution(gold);
  const unsure = unsureRate(gold);

  console.log(`[pair-ingest] ${gold.verdicts.length} Urteile von "${gold.annotator}" gegen ${gold.sourceSet}`);
  console.log(
    `[pair-ingest] Typen: ${Object.entries(dist)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')} · unsicher ${unsure === null ? '—' : `${(100 * unsure).toFixed(0)} %`}`
  );
  for (const n of check.notes) console.log(`[pair-ingest] ${n}`);

  if (!check.ok) {
    for (const p of check.problems) console.error(`[pair-ingest] FEHLER: ${p}`);
    process.exitCode = 1;
    return;
  }

  const outPath = outArg ? path.resolve(outArg) : DEFAULT_PAIR_GOLD_PATH;
  fs.writeFileSync(outPath, `${JSON.stringify(gold, null, 2)}\n`);
  console.log(`[pair-ingest] → ${outPath}\n[pair-ingest] Nächster Schritt: npm run pairs:agreement`);
}

if (require.main === module) {
  main();
}
