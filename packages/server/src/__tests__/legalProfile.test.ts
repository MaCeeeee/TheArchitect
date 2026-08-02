/**
 * Tests für das Anwendbarkeitsprofil des Unternehmens (THE-548).
 *
 * DER BEFUND DAHINTER: `findDisplacement` ist korrekt gebaut, am Primärtext
 * belegt — und hatte null Produktaufrufer, weil sein zweites Argument
 * (die Adressatenklasse des KUNDEN) nirgends gespeichert war. Das Modell
 * kannte das Recht ausgezeichnet und den Kunden gar nicht.
 *
 * ── DIE VIER ZUSTÄNDE ──
 *
 * `applicable` · `displaced` · `not_applicable` · `undetermined` — und der
 * Unterschied zwischen den letzten drei ist keine Feinheit:
 *
 *   - *verdrängt* heißt: das Gesetz WÜRDE greifen, aber ein spezielleres
 *     schiebt es beiseite (mit Beleg).
 *   - *nicht anwendbar* heißt: das Gesetz bindet diese Rolle gar nicht.
 *   - *unbestimmt* heißt: wir wissen es nicht, weil das Profil fehlt.
 *
 * Wer diese drei zu einem „gilt nicht" einebnet, kann einem Prüfer nicht
 * erklären, warum — und verwechselt Wissen mit Wissenslücke.
 */
import {
  assessNormApplicability,
  validateLegalProfile,
  type LegalProfile,
  type NormDescriptor,
} from '@thearchitect/shared';
import { Project } from '../models/Project';

// ── Die vier Normsätze der Meldepflicht-Familie ──────────────────────────
// Adressatenklassen von Hand mit Beleg erfasst, wie im lawsFixture von THE-545.
const NORMS: Record<string, NormDescriptor> = {
  dsgvoArt33: { source: 'dsgvo', addresseeClasses: ['controller'] },
  dsgvoArt34: { source: 'dsgvo', addresseeClasses: ['controller'] },
  nis2Art23: { source: 'nis2', addresseeClasses: ['essential_important_entity'] },
  doraArt19: { source: 'dora', addresseeClasses: ['financial_entity'] },
};

// ── Die zwei Fixture-Profile aus dem Plan ────────────────────────────────
const BANK: LegalProfile = {
  jurisdictions: ['EU'],
  sectors: ['banking'],
  addresseeClasses: ['controller', 'financial_entity'],
  size: { employees: 1200 },
  dataKinds: ['personenbezogen'],
};

const ENERGIEVERSORGER: LegalProfile = {
  jurisdictions: ['EU'],
  sectors: ['energy'],
  addresseeClasses: ['controller', 'essential_important_entity'],
  size: { employees: 800 },
  dataKinds: ['personenbezogen'],
};

describe('assessNormApplicability — die vier Zustände (THE-548 AC-3/AC-4)', () => {
  it('says applicable when a profile role matches and nothing displaces', () => {
    const r = assessNormApplicability(BANK, NORMS.dsgvoArt33);
    expect(r.state).toBe('applicable');
  });

  it('says displaced WITH the citation — the claim must survive to the user', () => {
    const r = assessNormApplicability(BANK, NORMS.nis2Art23);
    expect(r.state).toBe('displaced');
    expect(r.prevailingSource).toBe('dora');
    // Der Beleg wandert mit — nicht nur "verdrängt", sondern WODURCH.
    expect(r.citations?.join(' ')).toMatch(/Art\. 1/);
  });

  it('says not_applicable when the norm does not bind any profile role', () => {
    const r = assessNormApplicability(ENERGIEVERSORGER, NORMS.doraArt19);
    expect(r.state).toBe('not_applicable');
    // Und sagt, welche Rolle gefehlt hat — sonst ist die Aussage nicht prüfbar.
    expect(r.missingRoles).toContain('financial_entity');
  });

  it('says undetermined without a profile — unknown is NOT "does not apply"', () => {
    expect(assessNormApplicability(undefined, NORMS.dsgvoArt33).state).toBe('undetermined');
    expect(assessNormApplicability(null, NORMS.nis2Art23).state).toBe('undetermined');
  });

  it('says undetermined when the needed facet is missing, not just the whole profile', () => {
    const r = assessNormApplicability({ jurisdictions: ['EU'] }, NORMS.dsgvoArt33);
    expect(r.state).toBe('undetermined');
  });

  it('checks displacement BEFORE membership — lex specialis makes the membership question moot', () => {
    // Eine Bank, die `essential_important_entity` NICHT im Profil führt:
    // Die wahre Antwort auf "gilt NIS2?" ist trotzdem "verdrängt durch DORA" —
    // nicht "du bist keine wesentliche Einrichtung" (Banken stehen in Anhang I).
    // Die Verdrängung erspart genau die Sektor-Rechtsanalyse, die die
    // Mitgliedschaftsfrage verlangen würde.
    const r = assessNormApplicability(
      { addresseeClasses: ['controller', 'financial_entity'] },
      NORMS.nis2Art23,
    );
    expect(r.state).toBe('displaced');
  });
});

describe('Negativ-Kontrollen (THE-548 N-1/N-2)', () => {
  it('N-1: a project without profile yields undetermined for ALL four norms', () => {
    for (const norm of Object.values(NORMS)) {
      expect(assessNormApplicability(undefined, norm).state).toBe('undetermined');
    }
  });

  it('N-2: financial_entity displaces NIS2 but leaves the DSGVO UNTOUCHED', () => {
    const profile: LegalProfile = { addresseeClasses: ['controller', 'financial_entity'] };
    expect(assessNormApplicability(profile, NORMS.nis2Art23).state).toBe('displaced');
    // Ein Gate, das zu viel wegschneidet, vernichtet die echten Kandidaten.
    expect(assessNormApplicability(profile, NORMS.dsgvoArt33).state).toBe('applicable');
    expect(assessNormApplicability(profile, NORMS.dsgvoArt34).state).toBe('applicable');
  });
});

describe('AC-6: addresseeClasses ist eine LISTE', () => {
  it('the same company can be controller AND processor — different duty bundles', () => {
    const beide: LegalProfile = { addresseeClasses: ['controller', 'processor'] };
    const nurProcessor: LegalProfile = { addresseeClasses: ['processor'] };
    const art33 = NORMS.dsgvoArt33; // bindet nur controller
    expect(assessNormApplicability(beide, art33).state).toBe('applicable');
    expect(assessNormApplicability(nurProcessor, art33).state).toBe('not_applicable');
  });
});

describe('validateLegalProfile — Werteräume aus der Ontologie (AC-2)', () => {
  it('accepts a profile whose values all exist in NORM_ONTOLOGY', () => {
    expect(validateLegalProfile(BANK)).toEqual([]);
  });

  it('rejects a party role the ontology does not know — no second role space', () => {
    const errors = validateLegalProfile({ addresseeClasses: ['bank'] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/bank/);
  });

  it('rejects an unknown jurisdiction', () => {
    expect(validateLegalProfile({ jurisdictions: ['US'] }).length).toBeGreaterThan(0);
  });

  it('accepts the empty profile — every field is optional (AC-1: additive)', () => {
    expect(validateLegalProfile({})).toEqual([]);
  });
});

describe('Project model — legalProfile ist additiv (AC-1)', () => {
  it('a project WITHOUT legalProfile validates exactly as before', () => {
    const p = new Project({ name: 'Altbestand', description: 'x', ownerId: '507f1f77bcf86cd799439011' });
    expect(p.validateSync()).toBeUndefined();
    expect(p.legalProfile).toBeUndefined();
  });

  it('a project WITH a valid legalProfile validates', () => {
    const p = new Project({
      name: 'Bank',
      description: 'x',
      ownerId: '507f1f77bcf86cd799439011',
      legalProfile: BANK,
    });
    expect(p.validateSync()).toBeUndefined();
    expect(p.legalProfile?.addresseeClasses).toContain('financial_entity');
  });

  it('rejects a role outside the ontology at the schema level', () => {
    const p = new Project({
      name: 'Kaputt',
      description: 'x',
      ownerId: '507f1f77bcf86cd799439011',
      legalProfile: { addresseeClasses: ['bank'] },
    });
    expect(p.validateSync()).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 🚦 DAS GATE (Block 3) — die acht Zellen, vorab festgelegt am 2026-08-02.
//
// Diese Tabelle stammt aus dem Plan und der RVTM und wird NICHT angepasst.
// 8/8 → Block 4 (Fristobjekt). Alles andere → Stopp und Bericht.
// Mechanischer Test — kein Modellaufruf, nichts Zufälliges.
// ═════════════════════════════════════════════════════════════════════════
describe('🚦 Gate: acht Zellen — Bank × Energieversorger × vier Normsätze', () => {
  const expected: [string, LegalProfile, NormDescriptor, string][] = [
    ['Bank × DSGVO Art. 33 → applicable', BANK, NORMS.dsgvoArt33, 'applicable'],
    ['Bank × DSGVO Art. 34 → applicable', BANK, NORMS.dsgvoArt34, 'applicable'],
    ['Bank × NIS2 Art. 23 → displaced', BANK, NORMS.nis2Art23, 'displaced'],
    ['Bank × DORA Art. 19 → applicable', BANK, NORMS.doraArt19, 'applicable'],
    ['Energieversorger × DSGVO Art. 33 → applicable', ENERGIEVERSORGER, NORMS.dsgvoArt33, 'applicable'],
    ['Energieversorger × DSGVO Art. 34 → applicable', ENERGIEVERSORGER, NORMS.dsgvoArt34, 'applicable'],
    ['Energieversorger × NIS2 Art. 23 → applicable', ENERGIEVERSORGER, NORMS.nis2Art23, 'applicable'],
    ['Energieversorger × DORA Art. 19 → not_applicable', ENERGIEVERSORGER, NORMS.doraArt19, 'not_applicable'],
  ];

  it.each(expected)('%s', (_label, profile, norm, state) => {
    expect(assessNormApplicability(profile, norm).state).toBe(state);
  });

  it('the two "does not apply" cells have DIFFERENT states — that is the whole point', () => {
    const bankNis2 = assessNormApplicability(BANK, NORMS.nis2Art23);
    const evuDora = assessNormApplicability(ENERGIEVERSORGER, NORMS.doraArt19);
    expect(bankNis2.state).not.toBe(evuDora.state);
  });
});
