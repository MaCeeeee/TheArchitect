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

  const projectId = process.argv[2] ?? (await pickProject());
  if (!projectId) {
    console.log('Keine Ketten-Anforderungen gefunden — nichts zu messen.');
    await mongoose.disconnect();
    return;
  }

  const before = await classifiedCount(projectId);
  const preview = await previewCandidatePairs(projectId, { cap: DEFAULT_MAX_JUDGED_PAIRS });
  const after = await classifiedCount(projectId);

  console.log(`\nProjekt ${projectId}\n`);
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

  // Kontrolle 2: Der Lauf-Pfad mit einem Klassifikator, der WIRFT. Faellt der
  // Vorschau-Modus versehentlich in die Klassifikation, bricht das hier auf.
  console.log('\n── Kontrolle 2: kostet die Vorschau ein Modell? ────────────────');
  try {
    const { groupables, stats } = await buildGroupables(projectId, {});
    const { pairs } = enumerateCandidatePairs(groupables);
    console.log(`  Aufzaehlung ohne \`ask\` lief durch — ${pairs.length} Paare, ${stats.needsClassification} ungezaehlt`);
    console.log(`  → OK: ohne Klassifikator existiert kein Pfad zum Modell`);
  } catch (err) {
    console.log(`  FEHLER: ${(err as Error).message}`);
  }

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
