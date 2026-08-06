/**
 * the602-gold-productpath-probe — hält der Produktpfad das SCF-Gold?
 *
 * ── SCHWELLE, VOR DER MESSUNG GESETZT ──
 *
 *   >= 4 von 5   (Halte-Schwelle, docs/evals/scf-gold-produktpfad.md)
 *
 * Mehr ist über den schmalen Schnitt nicht erreichbar: HRS-03 fiel bereits am
 * PRÜFSTAND (Lauf 4: 4/5). Diese Sonde misst nicht, ob die Kette besser wird
 * als der Prüfstand — sondern ob der Produktpfad hält, was er hält.
 *
 * ── WARUM NULL MODELLAUFRUFE ──
 *
 * Der schmale Schnitt am 03.08. kostete 17 Aufrufe, weil der Adressat aus der
 * PARAPHRASE zurückgelesen wurde — die Extraktion war Teil des Messgegenstands.
 * Seit THE-591 gilt `fromCorpus ?? mapVerpflichteterToPartyRole(...)`: wo der
 * Korpus typisiert auflöst, erreicht die Extraktion die Adressaten-Achse gar
 * nicht mehr. Der Adressat ist dann mechanisch entscheidbar — und mechanisch
 * Entscheidbares geht nicht ans Modell (Hausregel).
 *
 * Die `verpflichteter`-Texte unten sind die AM 03.08. BEOBACHTETEN Werte
 * (docs/evals/scf-gold-produktpfad.md). Sie stehen hier, damit der
 * Lexikon-Rückfall an derselben Beobachtung gemessen wird wie damals — eine
 * neue Extraktion würde neue Varianz einführen und die Pfade unvergleichbar
 * machen. Es ist EINE Beobachtung, keine Verteilung; das begrenzt die Aussage
 * und steht deshalb im Ergebnis.
 *
 * ── WAS GEMESSEN WIRD — UND WAS NICHT ──
 *
 * Gemessen werden AUSSCHLIESSLICH die Achsen, in denen sich Pruefstand und
 * Produktpfad unterscheiden:
 *
 *   1. Adressatenklasse — Fixture-Annotation gegen Korpus-zuerst (THE-591)
 *   2. Werk-Familie     — exakter Stamm gegen normalisierte Familie (THE-600)
 *
 * NICHT gemessen wird die kanonische HANDLUNG. Sie kommt auf beiden Pfaden aus
 * DEMSELBEN Klassifikator ueber DENSELBEN Text und ist deshalb kein
 * Unterschied. Sie hier nachzubauen hiesse, Werte zu erfinden: Lauf 4 hat die
 * zugewiesenen Handlungen nicht in den Bericht geschrieben (`sysReqActions`
 * existiert nur zur Laufzeit). Ein Gold-Eintrag, den der PRUEFSTAND traegt,
 * gilt hier also als handlungs-seitig in Ordnung — gefragt wird nur, ob die
 * beiden gemessenen Achsen ihn noch durchlassen.
 *
 * READ-ONLY. Kein Schreibzugriff, kein Richter, kein Klassifikator.
 *
 * Aufruf:
 *   packages/server$ npx ts-node --transpile-only -r dotenv/config \
 *       src/scripts/the602-gold-productpath-probe.ts
 */
import mongoose from 'mongoose';
import { normalizeCorpusSource } from '@thearchitect/shared';
import { SCF_GOLD } from '../evals/reqtrace/runReqtraceEval';
import { mapVerpflichteterToPartyRole } from '../services/addresseeLexicon';
import { resolveTypedAddressees, type FetchProvisions } from '../services/typedProvision.service';
import { areAddresseesCompatible } from '../evals/reqtrace/measureGrouping';
import { evaluateDisplacement } from '../services/displacementGate.service';
import {
  getCorpusConnection,
  isCorpusConfigured,
  getRegulationsByKeys,
} from '../services/corpusClient.service';

const fetchProvisions: FetchProvisions = async (keys) =>
  (await getRegulationsByKeys(keys)) as never;

/**
 * Die gold-tragenden Systemanforderungen aus Lauf 4, mit dem am 03.08.
 * beobachteten `verpflichteter` und dem Korpus-Schlüssel ihres Artikels.
 */
interface Carrier {
  id: string;
  /** Korpus-Schlüssel des Artikels — die Achse, über die THE-591 auflöst. */
  regulationKey: string;
  /** Rolle laut Prüfstand-Annotation (lawsFixture). */
  fixtureRole: string;
  /** Am 03.08. beobachteter Verpflichteter (Freitext der Transformation). */
  verpflichteter: string;
}

const CARRIERS: Record<string, Carrier[]> = {
  'BCD-01': [
    { id: 'dsgvo:art32:c04:q1s1', regulationKey: 'dsgvo:art-32', fixtureRole: 'controller', verpflichteter: 'Unternehmen' },
    { id: 'nis2:art21:c01:q2s1', regulationKey: 'nis2-de:art-21', fixtureRole: 'essential_important_entity', verpflichteter: 'wesentliche und wichtige Einrichtungen' },
  ],
  'CRY-01': [
    { id: 'dsgvo:art24:c01:q1s1', regulationKey: 'dsgvo:art-24', fixtureRole: 'controller', verpflichteter: 'Verantwortlicher für die Daten' },
    { id: 'nis2:art21:c01:q1s2', regulationKey: 'nis2-de:art-21', fixtureRole: 'essential_important_entity', verpflichteter: 'wesentliche und wichtige Einrichtungen' },
  ],
  'GOV-02': [
    { id: 'dora:art19:c11:q1s1', regulationKey: 'dora-de:art-19', fixtureRole: 'financial_entity', verpflichteter: 'Finanzunternehmen' },
    { id: 'dsgvo:art24:c01:q2s1', regulationKey: 'dsgvo:art-24', fixtureRole: 'controller', verpflichteter: 'Verantwortlicher' },
  ],
  'RSK-01': [
    { id: 'dsgvo:art32:c06:q1s1', regulationKey: 'dsgvo:art-32', fixtureRole: 'controller', verpflichteter: 'Unternehmen als Verantwortlicher oder Auftragsverarbeiter' },
    { id: 'nis2:art21:c01:q1s1', regulationKey: 'nis2-de:art-21', fixtureRole: 'essential_important_entity', verpflichteter: 'wesentliche und wichtige Einrichtungen' },
  ],
  // HRS-03 hat KEINE Träger: der Prüfstand fand ihn nie (Lauf 4: 4/5). Er
  // steht hier ausdrücklich als leerer Eintrag, damit „nicht gefunden" nicht
  // mit „vergessen" verwechselt wird.
  'HRS-03': [],
};

async function main(): Promise<void> {
  if (!isCorpusConfigured()) throw new Error('CORPUS_MONGODB_URI fehlt — ohne Korpus misst die Sonde den falschen Pfad');
  await getCorpusConnection().asPromise();

  const allKeys = [...new Set(Object.values(CARRIERS).flat().map((c) => c.regulationKey))];
  const typed = await resolveTypedAddressees(allKeys, fetchProvisions);

  console.log('\n════ Adressaten-Achse: Prüfstand gegen Produktpfad ════\n');
  console.log(`${'TRÄGER'.padEnd(24)} ${'PRÜFSTAND'.padEnd(28)} ${'PRODUKTPFAD'.padEnd(28)} HERKUNFT`);

  const roleOf = new Map<string, { role: string | null; from: string }>();
  for (const c of Object.values(CARRIERS).flat()) {
    const fromCorpus = typed.get(c.regulationKey) ?? null;
    const role = fromCorpus ?? mapVerpflichteterToPartyRole(c.verpflichteter);
    const from = fromCorpus ? 'corpus' : role ? 'lexicon' : '—';
    roleOf.set(c.id, { role, from });
    const ok = role === c.fixtureRole;
    console.log(
      `${(ok ? '✓ ' : '✗ ') + c.id.padEnd(22)} ${c.fixtureRole.padEnd(28)} ${String(role ?? '— fällt raus').padEnd(28)} ${from}`,
    );
  }

  console.log('\n════ Gold-Bilanz über den Produktpfad ════\n');
  let hits = 0;
  const verdicts: string[] = [];
  for (const gold of SCF_GOLD) {
    const carriers = CARRIERS[gold.id] ?? [];
    if (carriers.length === 0) {
      verdicts.push(`✗ ${gold.id.padEnd(8)} nicht gefunden — schon am Prüfstand nicht (Lauf 4)`);
      continue;
    }
    const [a, b] = carriers;
    const ra = roleOf.get(a.id)!;
    const rb = roleOf.get(b.id)!;
    const famA = normalizeCorpusSource(a.regulationKey.split(':')[0]);
    const famB = normalizeCorpusSource(b.regulationKey.split(':')[0]);

    // Dieselben Filter, in derselben Reihenfolge wie in der Gruppierung.
    let why: string | null = null;
    if (!ra.role) why = `${a.id}: Adressat nicht bestimmbar`;
    else if (!rb.role) why = `${b.id}: Adressat nicht bestimmbar`;
    else if (famA === famB) why = 'gleiche Werk-Familie — kein gesetzesübergreifendes Paar';
    else if (!areAddresseesCompatible(ra.role, rb.role)) why = `Adressaten unverträglich (${ra.role} / ${rb.role})`;
    else if (evaluateDisplacement({ source: famA, addresseeClass: ra.role }, { source: famB, addresseeClass: rb.role }))
      why = 'durch Verdrängung ausgeschlossen';

    // Die Gesetzes-Menge muss zu einem lawSet des Gold-Eintrags passen.
    const laws = [...new Set([famA, famB])].sort();
    const lawSetOk = gold.lawSets.some((s) => [...s].sort().join('+') === laws.join('+'));
    if (!why && !lawSetOk) why = `Gesetze ${laws.join('+')} passen zu keinem lawSet`;

    // Die Handlungs-Achse wird bewusst NICHT geprueft — siehe Kopf: sie ist auf
    // beiden Pfaden dieselbe, und Lauf 4 hat ihre Werte nicht festgehalten.

    if (why) {
      verdicts.push(`✗ ${gold.id.padEnd(8)} ${why}`);
    } else {
      hits += 1;
      verdicts.push(`✓ ${gold.id.padEnd(8)} ${laws.join(' + ')} · ${ra.role}/${rb.role} · aus ${ra.from}/${rb.from}`);
    }
  }
  for (const v of verdicts) console.log('  ' + v);

  const THRESHOLD = 4;
  console.log(`\nGold über den Produktpfad: ${hits} von ${SCF_GOLD.length}   (Schwelle ${THRESHOLD})`);
  console.log(`Modellaufrufe in diesem Lauf: 0`);
  console.log(
    hits >= THRESHOLD
      ? '\n⇒ SCHWELLE GEHALTEN. Der Produktpfad trägt das Gold.'
      : `\n⇒ SCHWELLE VERFEHLT (${hits} < ${THRESHOLD}).`,
  );
  console.log(
    '\nGrenzen:\n' +
      '  · Gemessen sind ZWEI Achsen: Adressat (THE-591) und Werk-Familie (THE-600).\n' +
      '    Die kanonische Handlung ist auf beiden Pfaden dieselbe und wird vom\n' +
      '    Prüfstand GEERBT, nicht nachgeprüft — Lauf 4 hat ihre Werte nicht\n' +
      '    festgehalten, und sie zu erfinden wäre keine Messung.\n' +
      '  · EINE Beobachtung der Transformation (03.08.), keine Verteilung.\n' +
      '  · Extraktions- und Richter-Varianz unverändert gegenüber Lauf 4.\n',
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
