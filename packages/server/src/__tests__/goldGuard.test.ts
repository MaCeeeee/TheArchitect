/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  🚦 DAS GOLD-TOR (THE-611/612)
 *
 *  Die Schwelle steht seit dem 2026-08-03 und wird NICHT angepasst, um ein
 *  rotes Tor grün zu bekommen. Ein Tor, dessen Erwartung man nachzieht, misst
 *  nichts. Wird es rot, ist das ein BEFUND: erst verstehen, dann entscheiden,
 *  ob Fixture oder Code falsch liegt.
 *
 *  Mechanisch — kein Modellaufruf, kein Netz, keine Datenbank, nichts
 *  Zufälliges. Muster: `legalProfile.test.ts` (Block 3), `canaries.test.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── DIESER TEST IST NUR DIE HÄLFTE DES WÄCHTERS ──
 *
 * Er fährt gegen eine EINGEFRORENE Fixture der Korpus-Rollen und beweist
 * damit, dass der Code die Rollen richtig verarbeitet — nicht, dass die Rollen
 * noch stimmen. Ob die Fixture die Wirklichkeit beschreibt, prüft
 * `src/scripts/the613-gold-anchor-check.ts` gegen den lebenden Korpus.
 *
 * **Grün hier heißt: der Code ist in Ordnung. Es heißt NICHT: die Zahl gilt.**
 */
import {
  evaluateGoldGuard,
  frozenRoleResolver,
  renderGoldGuard,
  GOLD_GUARD_MIN,
  FROZEN_CORPUS_ROLES,
  GOLD_CARRIERS,
  PRODUCTION_SWITCHES,
  type RoleResolver,
} from '../evals/reqtrace/goldGuard';
import { SCF_GOLD } from '../evals/reqtrace/runReqtraceEval';

describe('🚦 Gold-Tor: der Produktpfad hält das SCF-Gold', () => {
  it(`erreicht mindestens ${GOLD_GUARD_MIN} von 5`, () => {
    const r = evaluateGoldGuard(frozenRoleResolver());
    // Bei Rot soll der Bericht mit im Log stehen — eine gerissene Schwelle ohne
    // Ursache zwingt zur Nachforschung, die der Wächter ersparen soll.
    if (!r.passed) throw new Error(`Gold-Tor gerissen:\n${renderGoldGuard(r)}`);
    expect(r.hits).toBeGreaterThanOrEqual(GOLD_GUARD_MIN);
  });

  it('nennt je Gold-Eintrag ein Verdikt, keines bleibt unbeantwortet', () => {
    const r = evaluateGoldGuard(frozenRoleResolver());
    expect(r.entries.map((e) => e.id).sort()).toEqual(SCF_GOLD.map((g) => g.id).sort());
    for (const e of r.entries) {
      if (!e.hit) expect(e.why).toBeTruthy();
    }
  });

  it('holt jede Rolle aus dem Korpus — kein Gold-Treffer ruht auf einer Paraphrase', () => {
    const r = evaluateGoldGuard(frozenRoleResolver());
    for (const e of r.entries.filter((x) => x.hit)) {
      expect(e.roleSources).toEqual(['corpus', 'corpus']);
    }
  });

  it('ist deterministisch — zwei Läufe, dasselbe Ergebnis', () => {
    expect(evaluateGoldGuard(frozenRoleResolver())).toEqual(evaluateGoldGuard(frozenRoleResolver()));
  });

  it('HRS-03 fehlt ausdrücklich, nicht versehentlich', () => {
    // Der Prüfstand fand ihn nie (Lauf 4: 4/5). Ohne den leeren Eintrag läse
    // sich „nicht gefunden" wie „vergessen".
    expect(GOLD_CARRIERS['HRS-03']).toEqual([]);
    const hrs = evaluateGoldGuard(frozenRoleResolver()).entries.find((e) => e.id === 'HRS-03');
    expect(hrs?.why).toMatch(/Prüfstand/);
  });
});

/**
 * ── DIE UMKEHRPROBE ──
 *
 * Ein Tor, das nicht rot werden KANN, bestätigt nur sich selbst. Diese Tests
 * brechen je EINE Weiche und zeigen, dass die Schwelle dann reißt. Sie sind
 * der eigentliche Wert des Wächters: ohne sie wäre seine Empfindlichkeit eine
 * Behauptung.
 */
describe('🚦 Umkehrprobe: das Tor reißt, wenn eine Weiche bricht', () => {
  it('(a) ohne Werk-Familien-Normalisierung — der Zustand vor THE-600', () => {
    const r = evaluateGoldGuard(frozenRoleResolver(), {
      ...PRODUCTION_SWITCHES,
      normalizeSource: (s) => s, // `nis2-de` bleibt `nis2-de`
    });
    expect(r.passed).toBe(false);
    // Nicht bloß „irgendwie rot": die Gesetzes-Menge passt zu keinem lawSet mehr.
    expect(r.entries.filter((e) => !e.hit).map((e) => e.why).join(' ')).toMatch(/lawSet/);
  });

  /**
   * (b) ist mehr als eine Empfindlichkeits-Probe: sie ist eine EICHUNG.
   *
   * Nimmt man dem Tor die Korpus-Rollen weg, steht der Zustand vom 03.08. da —
   * Adressat aus der Paraphrase. Und dann muss dieselbe Zahl herauskommen, die
   * damals GEMESSEN wurde: 2 von 5, verloren BCD-01 („Unternehmen" ist dem
   * Lexikon zu generisch) und RSK-01 („… Verantwortlicher oder
   * Auftragsverarbeiter" ist mehrdeutig, THE-588).
   *
   * Damit hängt der Wächter nicht nur an sich selbst, sondern an einer echten
   * historischen Messung. Weicht das ab, bildet das Tor den Produktpfad nicht
   * mehr richtig nach — unabhängig davon, ob es gerade grün ist.
   */
  it('(b) ohne Korpus-Rollen — reproduziert die am 03.08. GEMESSENEN 2 von 5', () => {
    const empty: RoleResolver = new Map();
    const r = evaluateGoldGuard(empty);
    expect(r.passed).toBe(false);
    expect(r.hits).toBe(2);
    expect(r.entries.filter((e) => !e.hit).map((e) => e.id).sort()).toEqual(['BCD-01', 'HRS-03', 'RSK-01']);
    // …und die beiden Überlebenden ruhten damals auf dem Lexikon, nicht auf dem Korpus.
    for (const e of r.entries.filter((x) => x.hit)) expect(e.roleSources).toEqual(['lexicon', 'lexicon']);
  });

  it('(c) wenn die Verdrängung ÜBER-sperrt, fällt das Tor', () => {
    const r = evaluateGoldGuard(frozenRoleResolver(), {
      ...PRODUCTION_SWITCHES,
      isDisplaced: () => true,
    });
    expect(r.passed).toBe(false);
    expect(r.hits).toBe(0);
  });

  // ── UND DIE GRENZE DIESES TORS, AUSDRÜCKLICH ──
  //
  // Die GEFÄHRLICHERE Richtung — die Verdrängung sperrt zu WENIG — kann dieses
  // Tor nicht sehen: unter den Gold-Paaren ist kein einziges verdrängtes
  // (dsgvo×nis2 und dora×dsgvo tragen keine Kante). Ein blindes Gate ändert
  // die Quote also nicht.
  //
  // Diese Kontrolle sitzt woanders, und das muss hier stehen, damit niemand
  // dem Gold-Tor eine Absicherung zuschreibt, die es nicht leistet:
  //   → `measureGrouping.test.ts`  (werfender Richter, THE-600)
  //   → `displacementGateSvc.test.ts`
  it('sieht ein UNTER-sperrendes Verdrängungs-Gate NICHT — die Kontrolle sitzt anderswo', () => {
    const blind = evaluateGoldGuard(frozenRoleResolver(), {
      ...PRODUCTION_SWITCHES,
      isDisplaced: () => false,
    });
    // Unverändert grün — kein Gold-Paar ist verdrängt. Das ist keine Schwäche,
    // sondern eine Eigenschaft des Prüfsatzes, und sie gehört benannt.
    expect(blind.passed).toBe(true);
    expect(blind.hits).toBe(evaluateGoldGuard(frozenRoleResolver()).hits);
  });
});

describe('Fixture-Hygiene', () => {
  it('jede eingefrorene Rolle trägt ihren Anker', () => {
    expect(FROZEN_CORPUS_ROLES.length).toBeGreaterThan(0);
    for (const r of FROZEN_CORPUS_ROLES) {
      // VOLLE SHA-256, nicht gekuerzt: ein Stummel sieht bei jedem Anker-Lauf
      // nach Drift aus. Beim ersten Bau genau so passiert.
      expect(r.versionHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.regulationKey).toMatch(/^[a-z0-9-]+:[a-z0-9.-]+$/);
    }
  });

  it('jeder Träger zeigt auf einen eingefrorenen Schlüssel — keine stille Lücke', () => {
    const frozen = new Set(FROZEN_CORPUS_ROLES.map((r) => r.regulationKey));
    for (const carriers of Object.values(GOLD_CARRIERS)) {
      for (const c of carriers) expect(frozen).toContain(c.regulationKey);
    }
  });

  it('die eingefrorene Rolle deckt sich mit der Prüfstand-Annotation', () => {
    // Fiele das auseinander, wäre nicht mehr klar, wogegen das Tor misst.
    const byKey = new Map(FROZEN_CORPUS_ROLES.map((r) => [r.regulationKey, r.partyRole]));
    for (const carriers of Object.values(GOLD_CARRIERS)) {
      for (const c of carriers) expect(byKey.get(c.regulationKey)).toBe(c.fixtureRole);
    }
  });

  it('die Schwelle ist eine Konstante, kein Literal in einer Assertion', () => {
    expect(GOLD_GUARD_MIN).toBe(4);
    expect(GOLD_GUARD_MIN).toBeLessThanOrEqual(SCF_GOLD.length);
  });
});
