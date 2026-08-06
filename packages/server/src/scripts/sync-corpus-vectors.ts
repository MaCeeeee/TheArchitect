/**
 * sync-corpus-vectors — CLI-Wrapper über corpusVectorSync.service (THE-621/624).
 *
 * Die Kernlogik lebt seit THE-624 im Service (ein Codepfad, zwei Aufrufer:
 * dieser CLI und der Scheduler auf Server A). Hier bleibt nur: Argumente
 * parsen, Dry-Run-Vorgabe, menschenlesbare Ausgabe, Prozess-Ende.
 *
 * HINTERGRUND (THE-621, gemessen 2026-08-06): Es gibt ZWEI Qdrant-Instanzen.
 * Der Crawler embeddet in die auf Server B; die App durchsucht ihre EIGENE,
 * lokale. Der Prod-Index war ein eingefrorener Schnappschuss: 1532 Punkte
 * gegen 1746 im Korpus — alles seit 2026-07-26 semantisch unsichtbar, während
 * `corpus/health` grün meldete. Seit THE-623/624 misst der Health-Endpoint den
 * Index mit, und der Scheduler zieht selbst nach; dieses CLI ist der manuelle
 * Weg für Erst-Seeding und Ad-hoc-Reparatur.
 *
 *   export CORPUS_MONGODB_URI=…  QDRANT_URL=…  [QDRANT_API_KEY=…]
 *   node dist/scripts/sync-corpus-vectors.js                    # Dry-Run: was fehlt?
 *   node dist/scripts/sync-corpus-vectors.js --apply            # nachziehen
 *   node dist/scripts/sync-corpus-vectors.js --source esg-rating-de --apply
 *   node dist/scripts/sync-corpus-vectors.js --apply --force    # auch Vorhandene neu schreiben
 *
 * Idempotent: die Punkt-ID ist deterministisch aus dem `regulationKey`
 * abgeleitet (identische Formel wie im Crawler), ein zweiter Lauf überschreibt
 * denselben Punkt.
 */
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';
import { syncCorpusVectors, CORPUS_COLLECTION } from '../services/corpusVectorSync.service';

// Re-Exports: die reinen Kern-Funktionen sind in den Service gewandert (THE-624).
// Bestehende Importe (sync-corpus-vectors.test.ts) laufen unverändert gegen die
// Re-Exporte — der Beweis, dass der Umzug das Verhalten nicht verändert hat
// (Muster lawPatterns: Server re-exportiert, Tests bleiben stehen).
export {
  regulationKeyToPointId,
  buildPoints,
  planSync,
  EMBEDDING_DIM,
  CORPUS_COLLECTION,
  type CorpusVectorSource,
  type QdrantPoint,
  type SkipReason,
  type BuildResult,
  type SyncPlan,
} from '../services/corpusVectorSync.service';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');
  const sourceIdx = args.indexOf('--source');
  const sourceFilter = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;

  console.log(`Modus     : ${apply ? 'APPLY (schreibt)' : 'DRY-RUN (schreibt nicht)'}${force ? ' +FORCE' : ''}`);
  console.log(`Ziel-Index: ${process.env.QDRANT_URL || '(QDRANT_URL fehlt)'} / ${CORPUS_COLLECTION}`);
  if (sourceFilter) console.log(`Filter    : source = ${sourceFilter}`);

  const res = await syncCorpusVectors({ apply, force, sourceFilter });

  console.log(`\nKorpus    : ${res.corpusDocs} Dokumente`);
  if (res.skipped.length > 0) {
    console.log(`\n⚠ ${res.skipped.length} Dokumente OHNE brauchbaren Vektor — die bleiben unsichtbar:`);
    for (const s of res.skipped.slice(0, 20)) {
      console.log(`   ${s.regulationKey}: ${s.reason}${s.detail ? ` (${s.detail})` : ''}`);
    }
    if (res.skipped.length > 20) console.log(`   … und ${res.skipped.length - 20} weitere`);
    console.log('   → auf Server B nachholen: POST /embed-all {"force":false}');
  }
  console.log(`\nNachzuziehen: ${res.planned}   (bereits vorhanden: ${res.alreadyPresent})`);

  if (!apply) {
    console.log('\nDRY-RUN — nichts geschrieben. Mit --apply ausführen.');
    return;
  }
  if (res.planned === 0) {
    console.log('\nNichts zu tun — der Index ist auf dem Stand des Korpus.');
    return;
  }
  console.log(`   geschrieben: ${res.written}/${res.planned}`);
  console.log(`\nZiel-Index jetzt: ${res.pointsAfter ?? '?'} Punkte`);
}

if (require.main === module) {
  main()
    .then(async () => {
      // Die lazy Korpus-Connection offen zu lassen hielte den Prozess am Leben.
      if (isCorpusConfigured()) await getCorpusConnection().close().catch(() => undefined);
    })
    .catch((err) => {
      console.error('FEHLGESCHLAGEN:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
