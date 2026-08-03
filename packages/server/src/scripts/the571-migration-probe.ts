/**
 * THE-571 Zusatzmessung: Ist der Altbestand MECHANISCH nachverankerbar?
 *
 * Die 13 Anforderungen ohne Korpus-Anker tragen eine `chain.clauseContentId`
 * (inhalts-basiert, THE-560). Wenn dieselbe contentId im aktuellen Korpus-Text
 * vorkommt, ist die Nachverankerung ein Nachschlagen — kein Urteil.
 * READ-ONLY.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { clauseContentId } from '@thearchitect/shared';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { segmentClauses } from '../evals/reqtrace/clauseSegmenter';
import type { ReqtraceArticle } from '../evals/reqtrace/lawsFixture';
import { getPipelineNorm } from '../services/norm.service';
import { getCorpusConnection, isCorpusConfigured } from '../services/corpusClient.service';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  if (isCorpusConfigured()) await getCorpusConnection().asPromise();
  const projectId = process.argv[2];

  const orphans = await ComplianceRequirement.find({
    projectId, chain: { $exists: true },
    $or: [{ normId: { $in: [null, undefined] } }, { sectionEId: { $in: [null, undefined] } }],
  }).lean();
  console.log(`Anforderungen ohne Korpus-Anker: ${orphans.length}`);

  // Kandidaten-Artikel aus dem Korpus, gegen die geprüft wird.
  const candidates = ['corpus:nis2-de', 'corpus:nis2', 'corpus:dsgvo'];
  const index = new Map<string, string>(); // contentId → "normId#sectionEId"
  for (const normId of candidates) {
    const norm = await getPipelineNorm(projectId, normId);
    if (!norm) { console.log(`  ${normId}: nicht auflösbar`); continue; }
    // FALLE: bei einem Korpus-Miss liefert die Fassade die PROJEKT-Norm aus der
    // App-DB — mit genau den eingefügten Klauseln, aus denen der Altbestand
    // stammt. Gegen die zu prüfen hieße, den Text mit sich selbst zu
    // vergleichen: 12 von 13 „Treffer", die nichts belegen. Ein Rechtsakt mit
    // einer Handvoll Artikel ist kein Gesetz.
    if (norm.sections.length < 10) {
      console.log(`  ${normId}: nur ${norm.sections.length} Artikel — App-DB-Fallback, NICHT indiziert`);
      continue;
    }
    let n = 0;
    for (const s of norm.sections) {
      if (!s.content?.trim()) continue;
      const art = { source: normId, article: s.id, fullText: s.content } as unknown as ReqtraceArticle;
      for (const c of segmentClauses(art)) { if (!index.has(c.contentId)) index.set(c.contentId, `${normId}#${s.id}`); n += 1; }
      const whole = clauseContentId(s.content);
      if (!index.has(whole)) index.set(whole, `${normId}#${s.id}`);
    }
    console.log(`  ${normId}: ${norm.sections.length} Artikel → ${n} Klauseln indiziert`);
  }
  console.log(`Index gesamt: ${index.size} Klausel-Identitäten\n`);

  let hit = 0;
  for (const r of orphans) {
    const cid = r.chain!.clauseContentId;
    const found = index.get(cid);
    if (found) hit += 1;
    const str = await StakeholderRequirement.findById(r.chain!.stakeholderRequirementIds[0]).lean();
    console.log(`  ${found ? 'TREFFER ' : 'kein    '} ${cid}  key=${(str?.regulationKey ?? '?').padEnd(16)} ${found ?? ''}`);
  }
  console.log(`\nMechanisch nachverankerbar: ${hit} von ${orphans.length}`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
