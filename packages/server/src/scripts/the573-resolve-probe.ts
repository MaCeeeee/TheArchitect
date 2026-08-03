/** THE-573 AC 3: Lässt sich JEDE genannte Kennung wirklich bis zum Gesetzestext auflösen? READ-ONLY. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { buildProjectLegalApplicability } from '../services/legalApplicability.service';
import { getNormSection } from '../services/norm.service';
import { getCorpusConnection, isCorpusConfigured, listTypingSummaries } from '../services/corpusClient.service';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  if (isCorpusConfigured()) await getCorpusConnection().asPromise();
  const projectId = process.argv[2];
  const p = await Project.findById(projectId).select('legalProfile').lean();
  const d = await buildProjectLegalApplicability(p!.legalProfile, listTypingSummaries);

  let ok = 0, fail = 0;
  for (const law of d.laws) {
    const eids = law.bindingProvisionEIds ?? [];
    if (eids.length === 0) continue;
    for (const eId of eids) {
      // Genau der Aufruf, den die Route macht: workId aus der FASSUNG.
      const sec = await getNormSection(projectId, `corpus:${law.expression}`, eId);
      const good = Boolean(sec?.text?.trim());
      good ? ok++ : fail++;
      if (!good) console.log(`  ✗ ${law.law.padEnd(16)} corpus:${law.expression} → ${eId} NICHT auflösbar`);
    }
  }
  console.log(`\nAuflösbar bis zum Gesetzestext: ${ok} · nicht auflösbar: ${fail}`);
  if (fail === 0) console.log('  ✓ Jede genannte Kennung führt zu echtem Text.');
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
