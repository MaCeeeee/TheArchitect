/**
 * the577-carryover-probe — was kostet „neu ableiten"? (THE-577, Weg A)
 *
 * Die Entscheidung lautet: Altbestand verwerfen, Artikel aus dem Korpus neu
 * durch die Kette schicken. Der Preis sind die menschlichen Tore und die
 * Element-Verlinkungen am Altbestand. Die DoD verlangt, diesen Preis zu
 * MESSEN — vor dem Verwerfen, nicht danach.
 *
 * ── DIE FRAGE ──
 *
 * Eine Verlinkung hängt heute an einer Anforderung, die auf einer Paraphrase
 * ruht. Nach dem Neu-Ableiten gibt es diese Anforderung nicht mehr. Kann die
 * Verlinkung über die KANONISCHE HANDLUNG an ihre Nachfolgerin wandern?
 *
 * Das ist eine Gleichheit auf zwei Achsen: gleiche `actionId` UND gleiche
 * Adressatenklasse. Die Handlung allein genügt nicht — dieselbe Handlung mit
 * anderem Adressaten ist eine andere Pflicht (Muster aus der Harmonisierung).
 *
 * READ-ONLY. Verwirft nichts, schreibt nichts.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { mapVerpflichteterToPartyRole } from '../services/addresseeLexicon';

interface Row {
  reqId: string;
  title: string;
  elements: string[];
  anchored: boolean;
  actionId: string | null;
  addressee: string | null;
  gatesSet: string[];
}

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const projectId = process.argv[2];
  if (!projectId) throw new Error('projectId fehlt');

  const reqs = await ComplianceRequirement.find({ projectId, chain: { $exists: true } }).lean();
  const rows: Row[] = [];
  for (const r of reqs) {
    const sys = await ChainSystemRequirement.findById(r.chain!.systemRequirementId).lean();
    const gates = r.gates as unknown as Record<string, { state: string }> | undefined;
    rows.push({
      reqId: String(r._id),
      title: r.title,
      elements: r.linkedElementIds ?? [],
      anchored: Boolean(r.normId && r.sectionEId),
      actionId: sys?.actionClassification?.actionId ?? null,
      addressee: sys ? mapVerpflichteterToPartyRole(sys.verpflichteter) : null,
      gatesSet: gates
        ? (['enforced', 'attested'] as const).filter((k) => gates[k]?.state === 'yes')
        : [],
    });
  }

  const legacy = rows.filter((r) => !r.anchored);
  const anchored = rows.filter((r) => r.anchored);
  console.log(`Ketten-Anforderungen: ${rows.length}  (Altbestand ${legacy.length} · verankert ${anchored.length})\n`);

  // ── WAS GEHT VERLOREN ──
  const withElements = legacy.filter((r) => r.elements.length > 0);
  const lostLinks = withElements.reduce((n, r) => n + r.elements.length, 0);
  const withGates = legacy.filter((r) => r.gatesSet.length > 0);
  console.log('── Der Preis des Verwerfens ──');
  console.log(`  Altbestands-Anforderungen mit Element-Verlinkung: ${withElements.length}  (${lostLinks} Verlinkungen)`);
  console.log(`  Altbestands-Anforderungen mit gesetztem Tor (enforced/attested): ${withGates.length}`);

  // ── WAS DAVON IST RETTBAR ──
  // Ein Träger ist eine VERANKERTE Anforderung mit derselben Handlung UND
  // derselben Adressatenklasse. Nur dann ist die Verlinkung dieselbe Aussage.
  console.log('\n── Rettbar über die kanonische Handlung ──');
  const carriers = new Map<string, string[]>();
  for (const a of anchored) {
    if (!a.actionId || !a.addressee) continue;
    const key = `${a.actionId}|${a.addressee}`;
    carriers.set(key, [...(carriers.get(key) ?? []), a.title]);
  }
  console.log(`  Träger-Paare (Handlung × Adressat) im verankerten Bestand: ${carriers.size}`);
  for (const [k, titles] of carriers) console.log(`     ${k} → ${titles.length} Anforderung(en)`);

  let carryable = 0;
  let orphaned = 0;
  console.log('');
  for (const r of withElements) {
    const key = r.actionId && r.addressee ? `${r.actionId}|${r.addressee}` : null;
    const hit = key ? carriers.get(key) : undefined;
    if (hit) carryable += r.elements.length;
    else orphaned += r.elements.length;
    console.log(
      `  ${hit ? 'RETTBAR ' : 'WAISE   '} „${r.title.slice(0, 46)}"  elemente=${r.elements.length}  ${r.actionId ?? '—'}|${r.addressee ?? '—'}`,
    );
  }
  console.log(`\n  Verlinkungen rettbar: ${carryable} von ${lostLinks}   ·   ohne Träger: ${orphaned}`);
  if (orphaned > 0) {
    console.log('  ⚠ Ohne Träger heißt NICHT „verloren" — es heißt: der Korpus-Artikel, der die');
    console.log('    Pflicht trägt, wurde noch nicht durch die Kette geschickt. Der Träger');
    console.log('    entsteht erst beim Neu-Ableiten.');
  }

  // ── DIE ZAHL, DIE SICH ÄNDERN WIRD ──
  console.log('\n── Negativ-Kontrolle: die Anzahl ändert sich, und zwar sichtbar ──');
  const byKey = new Map<string, number>();
  for (const r of legacy) {
    const s = await StakeholderRequirement.findById(
      (await ChainSystemRequirement.findById(
        reqs.find((x) => String(x._id) === r.reqId)!.chain!.systemRequirementId,
      ).lean())?.stakeholderRequirementIds[0],
    ).lean();
    const k = s?.regulationKey ?? '?';
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  for (const [k, n] of byKey) console.log(`  Altbestand ${k}: ${n} Anforderung(en) — werden verworfen`);
  console.log('  Der Bau muss vorher/nachher zählen und die Differenz ausweisen.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
