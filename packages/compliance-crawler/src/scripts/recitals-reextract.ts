/**
 * THE-682-Vorarbeit: citedArticles am BESTAND neu ableiten — ohne Fetch.
 *
 * Anlass (14.08.): Der Fremdakt-Filter kannte Charta/AEUV/Vertrag nicht und
 * übersah das „Absatz 1"-Zwischenstück — dsgvo:rec-1 zeigte fälschlich
 * art-8/art-16 (das sind Charta- und AEUV-Artikel). Der Text in der DB ist
 * korrekt; nur das abgeleitete Feld muss neu gerechnet werden. Kein
 * HTTP-Zugriff nötig — und damit auch keine EUR-Lex-Drossel.
 */
import { connectMongo, disconnectMongo } from '../db/mongo';
import { Recital } from '../db/recital.model';
import { extractCitedArticles } from '../lib/recitalExtract';

async function main(): Promise<void> {
  await connectMongo();
  const alle = await Recital.find({}, { regulationKey: 1, fullText: 1, citedArticles: 1 }).lean();
  if (alle.length === 0) throw new Error('0 Recitals im Bestand — leere Messung ist kein Bestehen.');

  let geaendert = 0;
  let entfernteKanten = 0;
  let neueKanten = 0;
  const beispiele: string[] = [];
  for (const r of alle) {
    const alt = (r.citedArticles ?? []).join(',');
    const neuListe = extractCitedArticles(r.fullText);
    const neu = neuListe.join(',');
    if (alt === neu) continue;
    const altSet = new Set(alt ? alt.split(',') : []);
    const neuSet = new Set(neuListe);
    for (const a of altSet) if (!neuSet.has(a)) entfernteKanten++;
    for (const n of neuSet) if (!altSet.has(n)) neueKanten++;
    if (beispiele.length < 6) beispiele.push(`${r.regulationKey}: [${alt}] → [${neu}]`);
    await Recital.updateOne({ regulationKey: r.regulationKey }, { $set: { citedArticles: neuListe } });
    geaendert++;
  }

  console.log(`Recitals gesamt   : ${alle.length}`);
  console.log(`korrigiert        : ${geaendert}`);
  console.log(`Kanten entfernt   : ${entfernteKanten} (Fremdakt-Treffer)`);
  console.log(`Kanten neu        : ${neueKanten}`);
  for (const b of beispiele) console.log(`  ${b}`);
  const mitZitat = await Recital.countDocuments({ 'citedArticles.0': { $exists: true } });
  console.log(`mit Artikel-Zitat : ${mitZitat} von ${alle.length}`);
  await disconnectMongo();
}
main().catch(async (e) => {
  console.error(e);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
