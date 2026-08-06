/**
 * Kann THE-591 die Gold-Quote ueberhaupt heben?
 *
 * ── DIE FRAGE VOR DER MESSUNG ──
 *
 * Der schmale Schnitt (`scf-gold-narrow-cut`) stammt von VOR THE-591: er
 * vergleicht die Fixture-Annotation gegen das Freitext-Lexikon. Seit THE-591
 * kommt der Adressat im Produkt ZUERST aus der typisierten Korpus-Provision.
 *
 * Bevor dafuer ein einziger Modellaufruf ausgegeben wird, ist die billige
 * Vorfrage zu klaeren: **Was liefert der Korpus fuer genau die Schluessel, die
 * die gold-tragenden Artikel fuehren — und deckt sich das mit der Fixture?**
 *
 * ── ZWEI FALLEN, DIE DIESE SONDE UMGEHT ──
 *
 * 1. **Keine geratenen Schluessel.** Gefragt wird mit dem `regulationKey`, den
 *    die Fixture selbst traegt. Eine Sonde, die Schreibweisen durchprobiert,
 *    findet irgendwann IRGENDEINEN Treffer — und misst dann einen anderen
 *    Datensatz als den, um den es geht.
 * 2. **Derselbe Aufruf wie im Produkt.** Gefragt wird ueber
 *    `resolveTypedAddressees` — die Funktion, die THE-591 in `buildGroupables`
 *    verdrahtet hat. Ein eigener Query waere eine zweite Implementierung und
 *    koennte etwas anderes finden als der Produktpfad.
 *
 * READ-ONLY, NULL Modellaufrufe.
 *
 * Aufruf:
 *   packages/server$ npx ts-node --transpile-only -r dotenv/config \
 *       src/scripts/the596-gold-corpus-keys-probe.ts
 */
import mongoose from 'mongoose';
import { loadReqtraceLaws } from '../evals/reqtrace/lawsFixture';
import { resolveTypedAddressees, type FetchProvisions } from '../services/typedProvision.service';
import {
  getCorpusConnection,
  isCorpusConfigured,
  getRegulationsByKeys,
} from '../services/corpusClient.service';

/** Die Artikel, aus denen die gold-tragenden Anforderungen stammen. */
const GOLD_PARAGRAPHS = new Set(['Art. 24', 'Art. 32', 'Art. 21', 'Art. 19']);

const fetchProvisions: FetchProvisions = async (keys) =>
  (await getRegulationsByKeys(keys)) as never;

async function main(): Promise<void> {
  if (!isCorpusConfigured()) {
    console.log('CORPUS_MONGODB_URI fehlt — ohne Korpus ist die Frage nicht beantwortbar.');
    return;
  }
  await getCorpusConnection().asPromise();

  const laws = loadReqtraceLaws();
  const gold = laws.articles.filter((a) => GOLD_PARAGRAPHS.has(a.paragraphNumber));

  // Der Produktpfad, wortwoertlich: derselbe Aufruf, den buildGroupables macht.
  const keys = gold.map((a) => a.regulationKey);
  const typed = await resolveTypedAddressees(keys, fetchProvisions);

  console.log('\n── Die gold-tragenden Artikel, mit IHREN Schluesseln ──────────\n');
  console.log(`${'SCHLUESSEL'.padEnd(20)} ${'FIXTURE'.padEnd(28)} ${'KORPUS (Produktpfad)'.padEnd(28)} URTEIL`);
  let resolved = 0;
  let agree = 0;
  for (const a of gold) {
    const fromCorpus = typed.get(a.regulationKey) ?? null;
    if (fromCorpus) resolved += 1;
    const ok = fromCorpus === a.addresseeClass;
    if (ok) agree += 1;
    console.log(
      `${a.regulationKey.padEnd(20)} ${a.addresseeClass.padEnd(28)} ` +
        `${String(fromCorpus ?? '— nicht aufloesbar').padEnd(28)} ${ok ? 'gleich' : fromCorpus ? 'ABWEICHUNG' : 'Rueckfall aufs Lexikon'}`,
    );
  }

  console.log(`\nAufgeloest: ${resolved} von ${gold.length} · Rolle deckt sich: ${agree}`);

  // Gegenprobe: existiert der Artikel unter einem ANDEREN Schluessel im Korpus?
  // Ohne sie liesse sich „nicht aufloesbar" nicht von „gar nicht vorhanden"
  // unterscheiden — und nur der erste Fall ist ein Schluessel-Problem.
  const unresolved = gold.filter((a) => !typed.get(a.regulationKey));
  if (unresolved.length > 0) {
    console.log('\n── Gegenprobe: liegt der Artikel unter einem anderen Schluessel? ──\n');
    for (const a of unresolved) {
      const stem = a.regulationKey.split(':')[0].replace(/-de$/, '');
      const alt = [`${stem}:${a.regulationKey.split(':')[1]}`, `${stem}-de:${a.regulationKey.split(':')[1]}`]
        .filter((k) => k !== a.regulationKey);
      const hits = await getRegulationsByKeys(alt);
      for (const k of alt) {
        const hit = hits.find((h) => h.regulationKey === k);
        const role = (hit as unknown as { typing?: { partyRole?: string } } | undefined)?.typing?.partyRole;
        console.log(`  ${a.regulationKey}  →  ${k.padEnd(18)} ${hit ? `vorhanden, Rolle: ${role ?? 'ungetypt'}` : 'nicht vorhanden'}`);
      }
    }
  }

  console.log(
    resolved === 0
      ? '\n⇒ Der Produktpfad loest KEINEN der Gold-Schluessel im Korpus auf. THE-591 kann\n' +
        '  die Gold-Quote hier nicht heben — es faellt ueberall aufs Lexikon zurueck.'
      : agree === gold.length
        ? '\n⇒ Der Korpus traegt fuer ALLE Gold-Artikel dieselbe Rolle wie die Fixture.\n' +
          '  THE-591 kann den Lexikon-Verlust also vollstaendig aufheben — die Messung\n' +
          '  ueber den Produktpfad ist damit fuer eine Verbesserung praedestiniert.'
        : '\n⇒ Gemischt. Wo der Korpus aufloest und die Rolle sich deckt, hebt THE-591 den\n' +
          '  Lexikon-Verlust auf; wo nicht, bleibt der Rueckfall — beides jetzt benannt.',
  );
  console.log('');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
