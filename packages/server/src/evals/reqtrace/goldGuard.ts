/**
 * goldGuard — das SCF-Gold über den Produktpfad als TOR (THE-611/612).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DIESER WÄCHTER HAT ZWEI HÄLFTEN. DIESE IST NUR EINE DAVON.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hier steht die Auswertung plus eine EINGEFRORENE Fixture der Korpus-Rollen.
 * Damit läuft das Tor in CI — ohne Netz, ohne Modell, bei jedem Commit.
 *
 * Genau das macht es aber zu einem PRÜFSTAND mit kuratierten Werten. Und die
 * Konstruktion „Prüfstand hat gepflegte Werte, Produkt bekommt die echten" hat
 * in einer einzigen Woche ZWEIMAL einen stillen Fehler erzeugt:
 *
 *   03.08.  Adressatenklasse: Fixture-Annotation  vs  aus Freitext abgeleitet
 *   05.08.  Werk-Stamm:       `nis2`              vs  `nis2-de`
 *
 * Ein Tor, das grün bleibt, während der Korpus darunter wegdriftet, wäre die
 * dritte Auflage desselben Fehlers — und die schlimmste, weil es beglaubigt.
 *
 * Deshalb trägt jede eingefrorene Rolle ihren `versionHash` als ANKER, und
 * eine zweite Hälfte prüft ihn gegen den lebenden Korpus:
 *
 *   → packages/server/src/scripts/the613-gold-anchor-check.ts
 *
 * **Wer diese Datei ändert und jene nicht kennt, hat die Hälfte übersehen.**
 * Die Trennung ist kein Zufall und keine Bequemlichkeit: der Korpus hängt am
 * Tailnet und ist in CI nicht erreichbar. Sie ist auch nicht wegzuvereinfachen
 * — ohne die Anker-Prüfung testet dieses Tor eine Fiktion.
 *
 * ── WAS DAS TOR PRÜFT ──
 *
 * Ausschließlich die Achsen, in denen sich Prüfstand und Produktpfad
 * unterscheiden:
 *
 *   1. Adressatenklasse — Korpus-Provision zuerst, Lexikon als Rückfall (THE-591)
 *   2. Werk-Familie     — `nis2-de` und `nis2` sind EIN Gesetz (THE-600)
 *   3. Verdrängung      — lex specialis vor jedem Urteil (THE-563)
 *
 * NICHT geprüft wird die kanonische HANDLUNG. Sie kommt auf beiden Pfaden aus
 * demselben Klassifikator über denselben Text und ist deshalb kein
 * Unterschied. Sie hier nachzubauen hieße, Werte zu erfinden: Lauf 4 hat die
 * tatsächlich zugewiesenen Handlungen nicht festgehalten (`sysReqActions`
 * existiert nur zur Laufzeit). Ein erster Sondenentwurf tat es doch und
 * meldete CRY-01 fälschlich als verloren — 3/5 statt 4/5.
 *
 * Linear: THE-611 · Befund: docs/evals/scf-gold-produktpfad.md
 * Tore:   docs/evals/reqtrace-release-gates.md
 */
import { normalizeCorpusSource } from '@thearchitect/shared';
import { SCF_GOLD } from './runReqtraceEval';
import { areAddresseesCompatible } from './measureGrouping';
import { evaluateDisplacement } from '../../services/displacementGate.service';
import { mapVerpflichteterToPartyRole } from '../../services/addresseeLexicon';

/**
 * Die Halte-Schwelle. Vorab gesetzt am 2026-08-03, gehalten am 2026-08-05.
 *
 * Mehr ist über diesen Schnitt nicht erreichbar: HRS-03 fiel bereits am
 * PRÜFSTAND (Lauf 4: 4/5). Das Tor fragt nicht, ob die Kette besser wird als
 * der Prüfstand — sondern ob der Produktpfad hält, was der Prüfstand kann.
 */
export const GOLD_GUARD_MIN = 4;

/** Eine eingefrorene Korpus-Rolle mit ihrem Anker. */
export interface FrozenRole {
  regulationKey: string;
  partyRole: string;
  /**
   * Textstand, aus dem die Rolle stammt — der ANKER.
   *
   * Nicht Zierde: `typedProvision.service` verwirft Typisierungen, deren
   * `versionHash` vom Textstand abweicht. Der Korpus KANN also neu typisiert
   * werden, und alle vier Rollen tragen `status: 'suggested'`, nicht
   * `confirmed`. Ohne diesen Wert wäre nicht feststellbar, ob die Fixture noch
   * beschreibt, was im Korpus steht.
   */
  versionHash: string;
}

/**
 * Die Korpus-Rollen der gold-tragenden Artikel, EINGEFROREN am 2026-08-06.
 *
 * Abgelesen mit `the596-gold-corpus-keys-probe`.
 *
 * **Wird NICHT angepasst, um ein rotes Tor grün zu bekommen.** Ein Tor, dessen
 * Erwartung man nachzieht, misst nichts. Weicht der Korpus ab, ist das ein
 * BEFUND: erst verstehen, dann entscheiden, ob die Fixture oder der Code
 * falsch liegt.
 *
 * Die Hashes stehen VOLLSTÄNDIG (SHA-256, 64 Zeichen). Ein gekürzter Anker
 * sieht bei jedem Lauf nach Drift aus und macht die Prüfung wertlos — genau
 * das ist beim ersten Bau passiert und von der Anker-Sonde in ihrem ersten
 * Lauf gefunden worden.
 */
export const FROZEN_CORPUS_ROLES: readonly FrozenRole[] = [
  { regulationKey: 'dsgvo:art-24', partyRole: 'controller', versionHash: '8b0405ac5ef0686d13cdb193afea1b7cc47f3c43f3bbb61aa933427398c45cea' },
  { regulationKey: 'dsgvo:art-32', partyRole: 'controller', versionHash: '31777d4b35df1df44ce73aea4f09a70cb4f02ff44f6763c8427f327ac3e4a1d8' },
  { regulationKey: 'nis2-de:art-21', partyRole: 'essential_important_entity', versionHash: 'de2e8c1032588fd5328ef9e6ce28ee8771b35d56865cea0f6ed5a8f35db0806d' },
  { regulationKey: 'dora-de:art-19', partyRole: 'financial_entity', versionHash: '6557d0fb1dfdbf2b3d82c0509d3cd009ab6dbead0a232b76427b694bb1b36d34' },
];

/** Eine gold-tragende Systemanforderung aus Lauf 4. */
export interface GoldCarrier {
  id: string;
  /** Korpus-Schlüssel des Artikels — die Achse, über die THE-591 auflöst. */
  regulationKey: string;
  /** Rolle laut Prüfstand-Annotation (`lawsFixture`) — die Soll-Seite. */
  fixtureRole: string;
  /**
   * Am 2026-08-03 BEOBACHTETER Verpflichteter (Freitext der Transformation).
   *
   * Steht hier, damit der Lexikon-Rückfall an derselben Beobachtung gemessen
   * wird wie damals. EINE Beobachtung, keine Verteilung — das begrenzt die
   * Aussage und gehört deshalb in jeden Bericht, der diese Zahl zitiert.
   */
  verpflichteter: string;
}

/**
 * Die Träger je Gold-Eintrag (Lauf 4, `docs/evals/reqtrace-run-4.md`).
 *
 * HRS-03 steht ausdrücklich mit LEERER Liste da: Der Prüfstand fand ihn nie.
 * Ohne den Eintrag läse sich „nicht gefunden" wie „vergessen".
 */
export const GOLD_CARRIERS: Readonly<Record<string, readonly GoldCarrier[]>> = {
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
  'HRS-03': [],
  'RSK-01': [
    { id: 'dsgvo:art32:c06:q1s1', regulationKey: 'dsgvo:art-32', fixtureRole: 'controller', verpflichteter: 'Unternehmen als Verantwortlicher oder Auftragsverarbeiter' },
    { id: 'nis2:art21:c01:q1s1', regulationKey: 'nis2-de:art-21', fixtureRole: 'essential_important_entity', verpflichteter: 'wesentliche und wichtige Einrichtungen' },
  ],
};

export interface GoldEntryVerdict {
  id: string;
  hit: boolean;
  /** Bei `hit: false` der GRUND — eine gerissene Schwelle ohne Ursache ist wertlos. */
  why: string | null;
  /** Die Werk-Familien des Paars, wie das Tor sie sieht. */
  laws: string[];
  /** Woher die Rolle je Träger kam: `corpus` · `lexicon` · `—`. */
  roleSources: string[];
}

export interface GoldGuardResult {
  hits: number;
  total: number;
  passed: boolean;
  entries: GoldEntryVerdict[];
}

/** Rolle je Korpus-Schlüssel. `null` = der Korpus sagt nichts dazu. */
export type RoleResolver = ReadonlyMap<string, string | null>;

/** Die eingefrorene Fixture als Resolver — die Eingabe für den CI-Lauf. */
export function frozenRoleResolver(): RoleResolver {
  return new Map(FROZEN_CORPUS_ROLES.map((r) => [r.regulationKey, r.partyRole]));
}

/**
 * Die Weichen, über die das Tor rechnet — als Abhängigkeiten, nicht fest verdrahtet.
 *
 * ── WARUM INJIZIERBAR ──
 *
 * Ein Tor, das nicht rot werden KANN, ist Theater. Dass es rot wird, wenn eine
 * Weiche bricht, lässt sich nur zeigen, indem man eine Weiche bricht — und das
 * geht nur, wenn sie austauschbar ist. Ohne diese Naht bliebe die
 * Empfindlichkeit eine Behauptung.
 *
 * Der Normalfall ist `PRODUCTION_SWITCHES`: dieselben Funktionen, die im
 * Produkt laufen. Die Umkehrprobe ersetzt genau eine davon.
 */
export interface GoldGuardSwitches {
  normalizeSource: (source: string) => string;
  addresseesCompatible: (a: string, b: string) => boolean;
  isDisplaced: (a: { source: string; addresseeClass: string }, b: { source: string; addresseeClass: string }) => boolean;
  lexiconRole: (verpflichteter: string) => string | null;
}

/** Die echten Weichen. Was hier steht, läuft auch im Produkt. */
export const PRODUCTION_SWITCHES: GoldGuardSwitches = {
  normalizeSource: normalizeCorpusSource,
  addresseesCompatible: areAddresseesCompatible,
  isDisplaced: (a, b) => evaluateDisplacement(a, b) !== null,
  lexiconRole: mapVerpflichteterToPartyRole,
};

/**
 * Fährt das Gold über den Produktpfad.
 *
 * Die Rollen kommen als EINGABE herein, nicht aus einer eingebauten Tabelle:
 * Der CI-Test füttert die eingefrorene Fixture, die Anker-Prüfung den lebenden
 * Korpus — beide durch DIESE Funktion. Ein zweiter Auswertungspfad wäre die
 * Kopie, die irgendwann anders rechnet, und dann wüsste niemand, welche der
 * beiden Zahlen gilt.
 *
 * Gerechnet wird mit dem PRODUKTIONS-Code (`normalizeCorpusSource`,
 * `areAddresseesCompatible`, `evaluateDisplacement`, `mapVerpflichteterToPartyRole`).
 * Die Weichen hier nachzubauen hieße, den Wächter gegen sich selbst zu prüfen.
 */
export function evaluateGoldGuard(
  roles: RoleResolver,
  switches: GoldGuardSwitches = PRODUCTION_SWITCHES,
): GoldGuardResult {
  const entries: GoldEntryVerdict[] = [];

  for (const gold of SCF_GOLD) {
    const carriers = GOLD_CARRIERS[gold.id] ?? [];
    if (carriers.length === 0) {
      entries.push({
        id: gold.id,
        hit: false,
        why: 'kein Träger — schon am Prüfstand nicht gefunden (Lauf 4)',
        laws: [],
        roleSources: [],
      });
      continue;
    }

    const [a, b] = carriers;
    // Korpus zuerst, Lexikon als Rückfall — exakt die THE-591-Reihenfolge.
    const resolve = (c: GoldCarrier): { role: string | null; from: string } => {
      const fromCorpus = roles.get(c.regulationKey) ?? null;
      if (fromCorpus) return { role: fromCorpus, from: 'corpus' };
      const fromLexicon = switches.lexiconRole(c.verpflichteter);
      return { role: fromLexicon, from: fromLexicon ? 'lexicon' : '—' };
    };
    const ra = resolve(a);
    const rb = resolve(b);

    const famA = switches.normalizeSource(a.regulationKey.split(':')[0]);
    const famB = switches.normalizeSource(b.regulationKey.split(':')[0]);
    const laws = [...new Set([famA, famB])].sort();

    // Dieselben Weichen, in derselben Reihenfolge wie in der Gruppierung.
    let why: string | null = null;
    if (!ra.role) why = `${a.id}: Adressat nicht bestimmbar`;
    else if (!rb.role) why = `${b.id}: Adressat nicht bestimmbar`;
    else if (famA === famB) why = 'gleiche Werk-Familie — kein gesetzesübergreifendes Paar';
    else if (!switches.addresseesCompatible(ra.role, rb.role)) why = `Adressaten unverträglich (${ra.role} / ${rb.role})`;
    else if (switches.isDisplaced({ source: famA, addresseeClass: ra.role }, { source: famB, addresseeClass: rb.role }))
      why = 'durch Verdrängung ausgeschlossen';
    else if (!gold.lawSets.some((s) => [...s].sort().join('+') === laws.join('+')))
      why = `Gesetze ${laws.join('+')} passen zu keinem lawSet`;

    entries.push({ id: gold.id, hit: !why, why, laws, roleSources: [ra.from, rb.from] });
  }

  const hits = entries.filter((e) => e.hit).length;
  return { hits, total: SCF_GOLD.length, passed: hits >= GOLD_GUARD_MIN, entries };
}

/** Menschenlesbare Fassung — für die Anker-Sonde und für rote Testläufe. */
export function renderGoldGuard(r: GoldGuardResult): string {
  const lines = r.entries.map(
    (e) =>
      `  ${e.hit ? '✓' : '✗'} ${e.id.padEnd(8)} ` +
      (e.hit ? `${e.laws.join(' + ')} · aus ${e.roleSources.join('/')}` : e.why),
  );
  return (
    lines.join('\n') +
    `\n\n  ${r.hits} von ${r.total} (Schwelle ${GOLD_GUARD_MIN}) → ${r.passed ? 'GEHALTEN' : 'VERFEHLT'}`
  );
}
