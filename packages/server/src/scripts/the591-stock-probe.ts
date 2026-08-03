/** THE-591: Was aendert der Anschluss am ECHTEN Bestand? READ-ONLY, kein Richter. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { buildGroupables } from '../services/harmonization.service';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  if (isCorpusConfigured()) await getCorpusConnection().asPromise();

  // Fast alle Klassifikationen sind gecacht. Die eine Anforderung, die das
  // Lexikon bisher VERWARF, passiert den Adressaten-Schritt jetzt zum ersten
  // Mal — und braucht deshalb genau einen Aufruf. Das ist der Fix bei der
  // Arbeit, nicht ein Fehler der Sonde.
  const { makeHarmonizationAsk } = await import('../services/harmonizationAsk');
  let calls = 0;
  const ask = makeHarmonizationAsk();
  const { groupables, stats } = await buildGroupables(process.argv[2], {
    ask: async (sys, user) => { calls += 1; return ask(sys, user); },
  });
  console.log(`Klassifikations-Aufrufe in diesem Lauf: ${calls}\n`);

  console.log('Statistik nach dem Anschluss:');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(22)} ${v}`);
  console.log('\nVorher (Abnahme THE-571): total 15 · unmappedAddressee 1 · unclassified 0');

  const bySource = new Map<string, number>();
  for (const g of groupables) bySource.set(g.addresseeSource ?? '—', (bySource.get(g.addresseeSource ?? '—') ?? 0) + 1);
  console.log('\nHerkunft je Anforderung:');
  for (const [s, n] of bySource) console.log(`  ${s.padEnd(10)} ${n}`);
  console.log('\nRollen im Detail:');
  for (const g of groupables.slice(0, 6)) {
    console.log(`  ${(g.addresseeSource ?? '—').padEnd(9)} ${g.addresseeClass.padEnd(28)} „${g.verpflichteter.slice(0, 38)}"`);
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
