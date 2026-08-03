/**
 * THE-576: Kann das dritte Tor ueberhaupt erreicht werden? READ-ONLY.
 *
 * Der Gates-Endpunkt verweigert `attested = yes` ohne frischen Nachweis
 * (requirements.routes). Nachweise waren bis THE-576 nur per API anlegbar —
 * das Tor war ueber die Oberflaeche also unerreichbar, nicht nur umstaendlich.
 * Diese Sonde misst den Ausgangszustand.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Evidence } from '../models/Evidence';
import { isFreshEvidence } from '../services/evidence.service';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const projectId = process.argv[2];
  const reqs = await ComplianceRequirement.find({ projectId }).select('title gates').lean();
  const ev = await Evidence.find({ projectId }).lean();

  const attested = reqs.filter((r) => (r.gates as { attested?: { state: string } } | undefined)?.attested?.state === 'yes');
  const fresh = ev.filter((e) => isFreshEvidence(e));
  console.log(`Anforderungen: ${reqs.length}`);
  console.log(`  attestiert:            ${attested.length}`);
  console.log(`Evidenz-Dokumente:       ${ev.length}  (frisch ${fresh.length} · stale ${ev.length - fresh.length})`);

  const byReq = new Map<string, number>();
  for (const e of fresh) byReq.set(String(e.requirementId), (byReq.get(String(e.requirementId)) ?? 0) + 1);
  const unbacked = attested.filter((r) => (byReq.get(String(r._id)) ?? 0) === 0);
  console.log(`  attestiert OHNE frischen Nachweis: ${unbacked.length}`);
  for (const r of unbacked.slice(0, 5)) console.log(`     ⚠ ${String(r.title).slice(0, 60)}`);
  if (attested.length === 0 && ev.length === 0) {
    console.log('\n  ⇒ Ausgangszustand: kein Nachweis, kein Attest. Genau der Zustand,');
    console.log('    den die fehlende Flaeche erzwungen hat — der Gates-Endpunkt');
    console.log('    verweigert das Attest, solange kein frischer Nachweis existiert.');
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
