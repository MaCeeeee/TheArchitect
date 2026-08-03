/** SCF-Gold über den Produktpfad: deckt das Adressaten-Lexikon die Rollen ab, die das SCF-Gold braucht? READ-ONLY, kein LLM. */
import { mapVerpflichteterToPartyRole } from '../services/addresseeLexicon';

// Die Formulierungen, die der Transformationsschritt in der Praxis liefert —
// die ersten sieben stammen aus dem echten Bestand (THE-571-Messung), der Rest
// sind die kanonischen Selbstbezeichnungen der drei Gesetze des Gold-Laufs.
const REAL = [
  'wesentliche und wichtige Einrichtungen',
  'betroffene Einrichtung',
  'Betroffene Einrichtung (Betreiber kritischer Infrastruktur)',
  'betroffene Einrichtung (kritische Infrastruktur)',
  'Verantwortlicher (Unternehmen)',
  'Wesentliche und wichtige Einrichtungen',
  'Betreiber von kritischen Infrastrukturen oder Diensteanbieter (betreffende Einrichtung)',
];
const LAW_TYPICAL = [
  'der Verantwortliche',                    // DSGVO Art. 24/32
  'Verantwortlicher',
  'der für die Verarbeitung Verantwortliche',
  'Auftragsverarbeiter',
  'wesentliche und wichtige Einrichtungen', // NIS2 Art. 21
  'Finanzunternehmen',                      // DORA Art. 19
  'das Finanzunternehmen',
];

const NEEDED = new Set(['controller', 'essential_important_entity', 'financial_entity']);

function report(label: string, values: string[]) {
  console.log(`\n── ${label} ──`);
  let mapped = 0;
  for (const v of values) {
    const r = mapVerpflichteterToPartyRole(v);
    if (r) mapped += 1;
    console.log(`  ${r ? '✓' : '✗'} ${String(r ?? '— nicht zugeordnet').padEnd(28)} ← "${v.slice(0, 62)}"`);
  }
  console.log(`  zugeordnet: ${mapped} von ${values.length}`);
  return values.map((v) => mapVerpflichteterToPartyRole(v)).filter(Boolean) as string[];
}

const a = report('Formulierungen aus dem echten Bestand', REAL);
const b = report('Kanonische Selbstbezeichnungen der Gold-Gesetze', LAW_TYPICAL);
const covered = new Set([...a, ...b]);

console.log('\n── Die Rollen, die das Gold braucht ──');
for (const n of NEEDED) console.log(`  ${covered.has(n) ? '✓' : '✗ FEHLT'} ${n}`);
console.log(
  `\nErgebnis: ${[...NEEDED].every((n) => covered.has(n))
    ? 'Alle drei Gold-Rollen sind vom Lexikon erreichbar.'
    : 'MINDESTENS EINE Gold-Rolle ist nicht erreichbar — der Produktpfad verlöre sie.'}`,
);
