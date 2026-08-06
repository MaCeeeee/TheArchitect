/**
 * the600-family-pairs-probe — die Negativ-Kontrolle des Werk-Stamm-Fixes.
 *
 * ── WARUM EINE ZAHL NICHT REICHT ──
 *
 * Der Fix senkt die Kandidatenzahl (gemessen 25 → 13). „Weniger" ist aber
 * kein Beleg: Ein Filter, der versehentlich zu viel wegschneidet, sähe genauso
 * aus. Zu zeigen ist zweierlei — und beides paar-genau, nicht als Summe:
 *
 *   1. Es entsteht KEIN Paar, das es vorher nicht gab.
 *   2. Jedes weggefallene Paar ist ein GLEICHE-FAMILIE-Paar (`nis2` × `nis2-de`)
 *      — also eine Norm gegen sich selbst, die nie ein Kandidat sein durfte.
 *
 * Verglichen werden die Paar-IDENTITÄTEN, nicht ihre Anzahl.
 *
 * READ-ONLY, NULL Modellaufrufe (die Handlungs-Klassifikation kommt aus dem
 * Cache; ohne `ask` existiert kein Pfad zum Modell — THE-590).
 *
 * Aufruf:
 *   packages/server$ npx ts-node --transpile-only -r dotenv/config \
 *       src/scripts/the600-family-pairs-probe.ts [projectId]
 */
import mongoose from 'mongoose';
import { normalizeCorpusSource } from '@thearchitect/shared';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import { buildGroupables } from '../services/harmonization.service';
import {
  areAddresseesCompatible,
  type GroupableSysReq,
} from '../evals/reqtrace/measureGrouping';
import { evaluateDisplacement } from '../services/displacementGate.service';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

type Pair = { key: string; famA: string; famB: string; srcA: string; srcB: string };

/**
 * Die Kandidaten-Aufzählung in BEIDEN Lesarten — exakt und familien-normalisiert.
 *
 * Bewusst hier nachgebaut statt `enumerateCandidatePairs` zweimal aufzurufen:
 * Der Vergleich braucht die ALTE Lesart, die es im Code nicht mehr gibt. Die
 * Sonde ist damit ein Zeitzeuge, kein zweiter Produktionspfad — sie wandert
 * nach der Abnahme nicht in die Kette.
 */
function enumerate(reqs: GroupableSysReq[], mode: 'exact' | 'family'): Pair[] {
  const sorted = [...reqs].sort((x, y) => x.id.localeCompare(y.id));
  const out: Pair[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const famA = normalizeCorpusSource(a.source);
      const famB = normalizeCorpusSource(b.source);

      if (mode === 'exact' ? a.source === b.source : famA === famB) continue;
      if (!a.actionId || !b.actionId || a.actionId !== b.actionId) continue;
      if (!areAddresseesCompatible(a.addresseeClass, b.addresseeClass)) continue;
      // Verdrängung mit derselben Lesart: im Exakt-Modus die Stämme, im
      // Familien-Modus die Familien — sonst verglichen wir zwei Änderungen auf
      // einmal und wüssten nicht, welche die Differenz erzeugt hat.
      const parties =
        mode === 'exact'
          ? [{ source: a.source, addresseeClass: a.addresseeClass }, { source: b.source, addresseeClass: b.addresseeClass }]
          : [{ source: famA, addresseeClass: a.addresseeClass }, { source: famB, addresseeClass: b.addresseeClass }];
      if (evaluateDisplacement(parties[0], parties[1])) continue;

      out.push({ key: [a.id, b.id].sort().join(' × '), famA, famB, srcA: a.source, srcB: b.source });
    }
  }
  return out;
}

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI as string);
  if (isCorpusConfigured()) await getCorpusConnection().asPromise();

  const projectId =
    process.argv[2] ??
    String(
      (
        await ChainSystemRequirement.aggregate([
          { $group: { _id: '$projectId', n: { $sum: 1 } } },
          { $sort: { n: -1 } },
          { $limit: 1 },
        ])
      )[0]?._id,
    );

  const { groupables } = await buildGroupables(projectId, {});
  const before = enumerate(groupables, 'exact');
  const after = enumerate(groupables, 'family');

  const beforeKeys = new Set(before.map((p) => p.key));
  const afterKeys = new Set(after.map((p) => p.key));
  const removed = before.filter((p) => !afterKeys.has(p.key));
  const added = after.filter((p) => !beforeKeys.has(p.key));

  console.log(`\nProjekt ${projectId} · ${groupables.length} paarbare Anforderungen\n`);
  console.log(`Kandidaten-Paare vorher (exakter Stamm-Vergleich): ${before.length}`);
  console.log(`Kandidaten-Paare nachher (Familien-Vergleich):     ${after.length}`);
  console.log(`  entfallen: ${removed.length} · NEU HINZUGEKOMMEN: ${added.length}`);

  console.log('\n── Kontrolle 1: kein neues Paar ───────────────────────────────');
  console.log(
    added.length === 0
      ? '  OK — die Familien-Lesart macht kein Paar zum Kandidaten, das es nicht war.'
      : `  FEHLER — ${added.length} neue Paare:\n${added.map((p) => `    ${p.key}  (${p.srcA} × ${p.srcB})`).join('\n')}`,
  );

  console.log('\n── Kontrolle 2: entfallene sind AUSSCHLIESSLICH gleiche Familie ──');
  const wrongDrop = removed.filter((p) => p.famA !== p.famB);
  if (removed.length === 0) {
    console.log('  (keine entfallen)');
  } else {
    const byFamily = new Map<string, number>();
    for (const p of removed) {
      const k = `${p.srcA} × ${p.srcB}`;
      byFamily.set(k, (byFamily.get(k) ?? 0) + 1);
    }
    for (const [k, n] of [...byFamily].sort()) console.log(`  ${String(n).padStart(3)} × ${k}`);
    console.log(
      wrongDrop.length === 0
        ? '\n  OK — jedes entfallene Paar stellte eine Norm gegen sich selbst.'
        : `\n  FEHLER — ${wrongDrop.length} entfallene Paare waren gesetzesübergreifend:\n` +
          wrongDrop.map((p) => `    ${p.key}  (${p.famA} × ${p.famB})`).join('\n'),
    );
  }

  console.log(
    added.length === 0 && wrongDrop.length === 0
      ? '\n⇒ AC-6 erfüllt: nichts Neues, und nur Gleiche-Familie-Paare weg.\n'
      : '\n⇒ AC-6 VERLETZT — siehe oben.\n',
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
