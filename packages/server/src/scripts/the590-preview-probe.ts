/**
 * the590-preview-probe — die Vorschau am echten Bestand (THE-590 Slice 1).
 *
 * Read-only. Beantwortet drei Fragen mit Zahlen statt mit Zusicherungen:
 *
 *   1. Was sagt die Vorschau — und stimmt sie mit dem ueberein, was der Lauf
 *      tatsaechlich urteilen wuerde?
 *   2. Kostet die Vorschau ein Modell? (Der Klassifikator ist ein Stub, der
 *      wirft — laeuft er, bricht die Probe ab.)
 *   3. Schreibt die Vorschau? (Zaehlstand der Klassifikationen vorher/nachher.)
 *
 * Aufruf:
 *   packages/server$ npx ts-node --transpile-only src/scripts/the590-preview-probe.ts [projectId]
 *
 * Ohne Argument sucht die Probe das Projekt mit den meisten Ketten-Anforderungen.
 */
import mongoose from 'mongoose';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import {
  previewCandidatePairs,
  buildGroupables,
  DEFAULT_MAX_JUDGED_PAIRS,
  MAX_ALLOWED_JUDGED_PAIRS,
} from '../services/harmonization.service';
import { enumerateCandidatePairs } from '../evals/reqtrace/measureGrouping';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

async function pickProject(): Promise<string | null> {
  const rows = await ChainSystemRequirement.aggregate([
    { $group: { _id: '$projectId', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);
  return rows[0] ? String(rows[0]._id) : null;
}

/** Zaehlt, wie viele Anforderungen eine GUELTIGE Klassifikation tragen. */
async function classifiedCount(projectId: string): Promise<number> {
  return ChainSystemRequirement.countDocuments({
    projectId,
    'actionClassification.ontologyVersion': NORM_ONTOLOGY.ontologyVersion,
  });
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI fehlt');
  await mongoose.connect(uri);

  // Die Korpus-Verbindung MUSS abgewartet werden: `bufferCommands = false`
  // laesst jede Abfrage vor Verbindungsende werfen, und der Client faengt das
  // als „Korpus nicht erreichbar" ab. Der Lauf misst dann still den
  // Lexikon-Rueckfall statt des echten Pfades — genau der Messfehler aus der
  // THE-571-Abnahme. Ohne Korpus laeuft die Sonde weiter, sagt es aber.
  const corpusUp = isCorpusConfigured();
  if (corpusUp) await getCorpusConnection().asPromise();

  const projectId = process.argv[2] ?? (await pickProject());
  if (!projectId) {
    console.log('Keine Ketten-Anforderungen gefunden — nichts zu messen.');
    await mongoose.disconnect();
    return;
  }

  const before = await classifiedCount(projectId);
  const preview = await previewCandidatePairs(projectId, { cap: DEFAULT_MAX_JUDGED_PAIRS });
  const after = await classifiedCount(projectId);

  console.log(`\nProjekt ${projectId}`);
  console.log(`Korpus: ${corpusUp ? 'verbunden' : 'NICHT konfiguriert — Adressaten nur aus dem Lexikon'}\n`);
  console.log('── Vorschau (kein Richter, kein Klassifikator) ─────────────────');
  console.log(`  Ketten-Anforderungen        ${preview.total}`);
  console.log(`  davon noch unklassifiziert  ${preview.needsClassification}`);
  console.log(`  Adressat unmappbar          ${preview.unmappedAddressee}`);
  console.log(`  durch Verdraengung raus     ${preview.excludedByDisplacement}`);
  console.log(`  KANDIDATEN-PAARE            ${preview.candidatePairs}`);
  console.log(`  Deckel (Dienst-Default)     ${preview.cap}`);
  console.log(`  wuerde gekappt              ${preview.wouldCap}`);
  console.log(`  Auswahl bei Kappung         ${preview.selectionOrder}`);

  console.log('\n── Kontrolle 1: schreibt die Vorschau? ─────────────────────────');
  console.log(`  Klassifikationen vorher ${before} · nachher ${after}  →  ${before === after ? 'OK, kein Schreibzugriff' : 'FEHLER: geschrieben!'}`);

  // Kontrolle 2: Stimmt die Vorschau mit dem LAUF-Pfad ueberein?
  //
  // Der Lauf bekommt hier einen Klassifikator, der WIRFT. Auf einem Bestand,
  // in dem alles gecacht ist, darf er nie gerufen werden — und die
  // Kandidatenzahl muss identisch herauskommen. Waeren Vorschau und Lauf zwei
  // Kopien desselben Filters, liefe genau hier die Differenz auf.
  console.log('\n── Kontrolle 2: Vorschau == Lauf-Pfad? ────────────────────────');
  let classifyCalls = 0;
  try {
    const { groupables, stats } = await buildGroupables(projectId, {
      ask: async () => {
        classifyCalls += 1;
        throw new Error('der Lauf haette hier klassifiziert');
      },
    });
    const { pairs } = enumerateCandidatePairs(groupables);
    const same = pairs.length === preview.candidatePairs;
    console.log(`  Lauf-Pfad ${pairs.length} Paare · Vorschau ${preview.candidatePairs}  →  ${same ? 'identisch' : 'ABWEICHUNG!'}`);
    console.log(`  Klassifikations-Aufrufe im Lauf-Pfad: ${classifyCalls} (alles gecacht: ${stats.needsClassification === 0})`);
  } catch (err) {
    console.log(`  FEHLER: ${(err as Error).message}`);
  }

  // Kontrolle 3 — und ihre GRENZE, offen ausgewiesen.
  //
  // „Die Vorschau ruft kein Modell" laesst sich an DIESEM Bestand nicht
  // zeigen: Es sind 0 Anforderungen unklassifiziert, also haette auch der
  // teure Pfad nichts zu klassifizieren. Eine Kontrolle, die besteht, WEIL es
  // nichts zu pruefen gibt, ist keine Kontrolle — sie steht deshalb hier als
  // „nicht anwendbar" statt als Haekchen.
  console.log('\n── Kontrolle 3: macht die Vorschau Modellaufrufe? ─────────────');
  console.log(
    preview.needsClassification === 0
      ? '  NICHT ANWENDBAR — auf diesem Bestand ist alles gecacht, also gaebe es\n' +
        '  auch fuer den teuren Pfad nichts zu klassifizieren. Belegt ist die\n' +
        '  Zusage durch den Dienst-Test mit werfendem Stub, nicht durch diesen Lauf.'
      : `  ${preview.needsClassification} unklassifiziert und dennoch 0 Aufrufe — die Zusage traegt am echten Bestand.`,
  );

  console.log('\n── Was der Deckel bedeutet ─────────────────────────────────────');
  const overRouteMax = Math.max(0, preview.candidatePairs - MAX_ALLOWED_JUDGED_PAIRS);
  console.log(`  Route-Maximum ${MAX_ALLOWED_JUDGED_PAIRS} → ${overRouteMax === 0
    ? 'reicht fuer diesen Bestand'
    : `${overRouteMax} Paare blieben auch am Maximum ungeurteilt`}`);
  console.log('');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
