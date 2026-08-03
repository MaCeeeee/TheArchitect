/** THE-588: Was macht die Aenderung mit den gemessenen Gold-Traegern? READ-ONLY, kein LLM. */
import { mapVerpflichteterToPartyRole } from '../services/addresseeLexicon';

/** Die 12 verpflichteter-Werte aus dem schmalen Schnitt (docs/evals/scf-gold-produktpfad.md). */
const MEASURED: Array<{ id: string; fixture: string; verpflichteter: string; vorher: string | null; gold?: string }> = [
  { id: 'dsgvo:art24:c01:q1s1', fixture: 'controller', verpflichteter: 'Verantwortlicher für die Datenverarbeitung', vorher: 'controller', gold: 'CRY-01' },
  { id: 'dsgvo:art24:c01:q2s1', fixture: 'controller', verpflichteter: 'Verantwortlicher', vorher: 'controller', gold: 'GOV-02' },
  { id: 'dsgvo:art24:c01:q3s1', fixture: 'controller', verpflichteter: 'Unternehmen', vorher: null },
  { id: 'dsgvo:art24:c01:q3s2', fixture: 'controller', verpflichteter: 'Unternehmen', vorher: null },
  { id: 'dsgvo:art32:c04:q1s1', fixture: 'controller', verpflichteter: 'Unternehmen', vorher: null, gold: 'BCD-01' },
  { id: 'dsgvo:art32:c04:q1s2', fixture: 'controller', verpflichteter: 'Unternehmen (Verantwortlicher)', vorher: 'controller' },
  { id: 'dsgvo:art32:c06:q1s1', fixture: 'controller', verpflichteter: 'Unternehmen als Verantwortlicher oder Auftragsverarbeiter', vorher: 'processor', gold: 'RSK-01' },
  { id: 'nis2:art21:c01:q1s1', fixture: 'essential_important_entity', verpflichteter: 'wesentliche und wichtige Einrichtungen', vorher: 'essential_important_entity', gold: 'RSK-01' },
  { id: 'nis2:art21:c01:q1s2', fixture: 'essential_important_entity', verpflichteter: 'wesentliche und wichtige Einrichtung', vorher: 'essential_important_entity', gold: 'CRY-01' },
  { id: 'nis2:art21:c01:q1s3', fixture: 'essential_important_entity', verpflichteter: 'Wesentliche und wichtige Einrichtungen', vorher: 'essential_important_entity' },
  { id: 'nis2:art21:c01:q2s1', fixture: 'essential_important_entity', verpflichteter: 'Wesentliche und wichtige Einrichtungen', vorher: 'essential_important_entity', gold: 'BCD-01' },
  { id: 'dora:art19:c11:q1s1', fixture: 'financial_entity', verpflichteter: 'Finanzunternehmen', vorher: 'financial_entity', gold: 'GOV-02' },
];

console.log(`${'ID'.padEnd(24)} ${'VORHER'.padEnd(28)} ${'NACHHER'.padEnd(28)} Gold`);
const changed: string[] = [];
for (const m of MEASURED) {
  const jetzt = mapVerpflichteterToPartyRole(m.verpflichteter);
  const diff = jetzt !== m.vorher;
  if (diff) changed.push(m.id);
  console.log(
    `${diff ? '≠' : ' '} ${m.id.padEnd(22)} ${String(m.vorher ?? '— verworfen').padEnd(28)} ${String(jetzt ?? '— verworfen').padEnd(28)} ${m.gold ?? ''}`,
  );
}

// Welche Gold-Treffer bleiben? Ein Treffer braucht ALLE seine Traeger.
const CARRIERS: Record<string, string[]> = {
  'BCD-01': ['dsgvo:art32:c04:q1s1', 'nis2:art21:c01:q2s1'],
  'CRY-01': ['dsgvo:art24:c01:q1s1', 'nis2:art21:c01:q1s2'],
  'GOV-02': ['dora:art19:c11:q1s1', 'dsgvo:art24:c01:q2s1'],
  'RSK-01': ['dsgvo:art32:c06:q1s1', 'nis2:art21:c01:q1s1'],
  'HRS-03': [],
};
const roleOf = new Map(MEASURED.map((m) => [m.id, mapVerpflichteterToPartyRole(m.verpflichteter)]));
console.log(`\nGeaenderte Zuordnungen: ${changed.length} (${changed.join(', ') || '—'})\n`);
console.log('Gold-Traeger nach der Aenderung:');
let hits = 0;
for (const [scf, ids] of Object.entries(CARRIERS)) {
  if (ids.length === 0) { console.log(`  ${scf}: nie gefunden (unveraendert)`); continue; }
  const alive = ids.every((i) => roleOf.get(i) != null);
  if (alive) hits += 1;
  console.log(`  ${scf}: ${alive ? 'traegt' : 'VERLOREN'} — ${ids.map((i) => `${i.split(':').slice(0,2).join(':')}=${roleOf.get(i) ?? 'verworfen'}`).join(' · ')}`);
}
console.log(`\nGold ueber den Produktpfad: ${hits} von 5   (vor dieser Aenderung: 3)`);
