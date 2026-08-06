/**
 * the613-gold-anchor-check — die ZWEITE Hälfte des Gold-Wächters (THE-611/613).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  OHNE DIESE SONDE TESTET DAS GOLD-TOR EINE FIKTION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `goldGuard.ts` fährt gegen eine EINGEFRORENE Fixture der Korpus-Rollen. Das
 * macht es CI-fähig — und zu einem Prüfstand mit kuratierten Werten. Genau
 * diese Konstruktion hat in einer Woche zweimal einen stillen Fehler erzeugt
 * (Adressat 03.08., Werk-Stamm 05.08.): der Prüfstand war grün, das Produkt
 * bekam andere Werte.
 *
 * Diese Sonde schließt den Kreis. Sie fragt zweierlei:
 *
 *   1. **Stimmt die Fixture noch?** Rolle UND `versionHash` je Schlüssel
 *      gegen den lebenden Korpus. Ein gewanderter Textstand heisst: die
 *      Typisierung beschreibt einen Text, den es so nicht mehr gibt.
 *   2. **Hält das Gold auch live?** Dasselbe Tor, dieselbe Auswertung — nur
 *      mit den ECHTEN Rollen statt der eingefrorenen. Fallen die beiden
 *      Quoten auseinander, ist das der Alarm.
 *
 * **Sie ist kein Beiwerk und nicht wegzuvereinfachen.** Wer sie löscht, macht
 * aus dem Tor eine Selbstbestätigung.
 *
 * Sie läuft BEWUSST ausserhalb von CI: der Korpus haengt am Tailnet. Ein nicht
 * erreichbarer Korpus ist deshalb „unbekannt", NICHT „unveraendert" — die
 * Sonde bricht dann ab, statt stumm gruen zu melden.
 *
 * READ-ONLY, NULL Modellaufrufe.
 *
 * Aufruf:
 *   packages/server$ npx ts-node --transpile-only -r dotenv/config \
 *       src/scripts/the613-gold-anchor-check.ts
 */
import mongoose from 'mongoose';
import {
  evaluateGoldGuard,
  frozenRoleResolver,
  renderGoldGuard,
  FROZEN_CORPUS_ROLES,
  GOLD_GUARD_MIN,
  type RoleResolver,
} from '../evals/reqtrace/goldGuard';
import {
  getCorpusConnection,
  isCorpusConfigured,
  getRegulationsByKeys,
} from '../services/corpusClient.service';

type AnchorState = 'unveraendert' | 'ROLLE GEWANDERT' | 'TEXTSTAND GEWANDERT' | 'NICHT AUFFINDBAR';

interface AnchorRow {
  regulationKey: string;
  state: AnchorState;
  frozenRole: string;
  liveRole: string | null;
  frozenHash: string;
  liveHash: string | null;
}

async function main(): Promise<void> {
  if (!isCorpusConfigured()) {
    // Kein stilles Gruen: ohne Korpus ist die Frage UNBEANTWORTET, nicht beantwortet.
    console.error(
      '\nCORPUS_MONGODB_URI fehlt — die Anker-Pruefung kann nicht laufen.\n' +
        'Das ist NICHT „unveraendert": ob die Fixture noch stimmt, bleibt unbekannt.\n' +
        'Der Korpus haengt am Tailnet; siehe docs/evals/reqtrace-release-gates.md.\n',
    );
    process.exit(2);
  }
  await getCorpusConnection().asPromise();

  const keys = FROZEN_CORPUS_ROLES.map((r) => r.regulationKey);
  const docs = (await getRegulationsByKeys(keys)) as unknown as Array<{
    regulationKey: string;
    versionHash?: string;
    typing?: { partyRole?: string };
  }>;
  const byKey = new Map(docs.map((d) => [d.regulationKey, d]));

  const rows: AnchorRow[] = FROZEN_CORPUS_ROLES.map((f) => {
    const live = byKey.get(f.regulationKey);
    const liveRole = live?.typing?.partyRole ?? null;
    const liveHash = live?.versionHash ?? null;
    const state: AnchorState = !live
      ? 'NICHT AUFFINDBAR'
      : liveRole !== f.partyRole
        ? 'ROLLE GEWANDERT'
        : liveHash !== f.versionHash
          ? 'TEXTSTAND GEWANDERT'
          : 'unveraendert';
    return { regulationKey: f.regulationKey, state, frozenRole: f.partyRole, liveRole, frozenHash: f.versionHash, liveHash };
  });

  console.log('\n════ 1. Halten die Anker? ════\n');
  console.log(`${'SCHLUESSEL'.padEnd(18)} ${'ZUSTAND'.padEnd(20)} ${'ROLLE (frozen → live)'.padEnd(34)} TEXTSTAND`);
  for (const r of rows) {
    const role = r.liveRole === r.frozenRole ? r.frozenRole : `${r.frozenRole} → ${r.liveRole ?? '—'}`;
    const hash = r.liveHash === r.frozenHash ? r.frozenHash : `${r.frozenHash} → ${r.liveHash ?? '—'}`;
    console.log(
      `${(r.state === 'unveraendert' ? '  ' : '⚠ ') + r.regulationKey.padEnd(16)} ${r.state.padEnd(20)} ${role.padEnd(34)} ${hash}`,
    );
  }

  const drifted = rows.filter((r) => r.state !== 'unveraendert');

  // ── 2. Dasselbe Tor, live gefuettert ──────────────────────────────────
  //
  // Bewusst DIESELBE Funktion wie im Test — ein zweiter Auswertungspfad waere
  // die Kopie, die irgendwann anders rechnet, und dann wuesste niemand, welche
  // der beiden Zahlen gilt.
  const liveResolver: RoleResolver = new Map(rows.map((r) => [r.regulationKey, r.liveRole]));
  const frozenRun = evaluateGoldGuard(frozenRoleResolver());
  const liveRun = evaluateGoldGuard(liveResolver);

  console.log('\n════ 2. Haelt das Gold auch live? ════\n');
  console.log('── eingefroren ──');
  console.log(renderGoldGuard(frozenRun));
  console.log('\n── live aus dem Korpus ──');
  console.log(renderGoldGuard(liveRun));

  console.log('\n════ Verdikt ════\n');
  const sameQuote = frozenRun.hits === liveRun.hits;
  console.log(`  Anker unveraendert:   ${rows.length - drifted.length} von ${rows.length}`);
  console.log(`  Quote eingefroren:    ${frozenRun.hits} von ${frozenRun.total}`);
  console.log(`  Quote live:           ${liveRun.hits} von ${liveRun.total}   (Schwelle ${GOLD_GUARD_MIN})`);

  if (drifted.length === 0 && sameQuote && liveRun.passed) {
    console.log('\n  ⇒ OK. Die Fixture beschreibt den Korpus, und das Gold haelt auf beiden Wegen.\n');
    await mongoose.disconnect();
    return;
  }

  console.log('\n  ⚠ BEFUND — nicht automatisch nachziehen:');
  if (drifted.length > 0) {
    console.log(`     · ${drifted.length} Anker gewandert (${drifted.map((d) => d.regulationKey).join(', ')}).`);
    console.log('       Erst verstehen, WARUM — eine Fixture, die man einer Abweichung');
    console.log('       nachzieht, misst nichts mehr.');
  }
  if (!sameQuote) {
    console.log(`     · Die Quoten fallen auseinander (${frozenRun.hits} eingefroren vs ${liveRun.hits} live).`);
    console.log('       Das Gold-Tor in CI ist damit gruen fuer einen Stand, den es nicht mehr gibt.');
  }
  if (!liveRun.passed) {
    console.log(`     · Live verfehlt das Gold die Schwelle (${liveRun.hits} < ${GOLD_GUARD_MIN}).`);
  }
  console.log('');
  await mongoose.disconnect();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
