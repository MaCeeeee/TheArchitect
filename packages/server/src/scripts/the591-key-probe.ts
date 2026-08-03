/** THE-591 Pre-Flight: Treffen die regulationKeys der Kette echte Korpus-Provisions? READ-ONLY. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { resolveTypedAddressees } from '../services/typedProvision.service';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  if (isCorpusConfigured()) await getCorpusConnection().asPromise();
  const projectId = process.argv[2];

  const strs = await StakeholderRequirement.find({ projectId }).select('regulationKey').lean();
  const keys = [...new Set(strs.map((s) => s.regulationKey))];
  console.log(`Stakeholder-Anforderungen: ${strs.length} · verschiedene Schlüssel: ${keys.length}`);
  for (const k of keys) console.log(`  ${k}`);

  const typed = await resolveTypedAddressees(keys, async (ks) => {
    const { getRegulationsByKeys } = await import('../services/corpusClient.service');
    return (await getRegulationsByKeys(ks)) as never;
  });

  console.log(`\n── Auflösung gegen den Korpus ──`);
  for (const k of keys) {
    const role = typed.get(k);
    console.log(`  ${role ? '✓' : '✗'} ${k.padEnd(20)} ${role ?? '— keine typisierte Provision'}`);
  }
  const hit = keys.filter((k) => typed.has(k)).length;
  console.log(`\nSchlüssel mit Korpus-Rolle: ${hit} von ${keys.length}`);
  console.log(
    hit === 0
      ? '  ⚠ KEIN Treffer — der Join traegt nicht, das Ticket braucht eine Schluessel-Abbildung.'
      : '  ⇒ Der Join traegt. Das Lexikon wird zum Rueckfall fuer den Rest.',
  );
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
