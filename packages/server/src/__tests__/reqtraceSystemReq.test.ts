/**
 * Tests für die Transformation Stakeholder- → Systemanforderung
 * (THE-545, Task 5).
 *
 * ── DIE ZWEI MECHANISCHEN TORE DIESER STUFE ──
 *
 * 1. **Implementierungsfreiheit** (15288 §6.4.3.1: *„should not imply any
 *    specific implementation"*). Geprüft über ein LEXIKON, nicht über ein
 *    Modellurteil: „AES-256" ist eine Implementierung, „nach Stand der Technik
 *    unlesbar halten" ist eine Fähigkeit. Das Lexikon ist eine Datenzeile —
 *    jede Erweiterung ist ein Eintrag, kein Prompt-Umbau.
 *
 * 2. **Der Zusammenfall-Test** (ADR-0007 E5). Zwei Stakeholder-Anforderungen
 *    führen auf EINE Systemanforderung nur, wenn Schutzgut, Verpflichteter,
 *    Auslöser und Nachweis identisch sind — dann lässt sie sich wortgleich
 *    formulieren. Das ist ein Feldvergleich, kein Ermessen.
 *
 * Erwartete Häufigkeit des Zusammenfalls: nahe null. Im Experiment vom
 * 2026-08-01 kam `equal` in 120 Fällen NULL Mal vor.
 */
import {
  SYSTEM_REQ_SYSTEM,
  buildSystemReqUserPrompt,
  parseSystemReq,
  violatesImplementationFreedom,
  collapseKey,
  IMPLEMENTATION_LEXICON,
  type StakeholderCandidate,
} from '@thearchitect/shared';

const LAW_NAMES = /\bDSGVO\b|\bNIS-?2\b|\bDORA\b/;

const shr = (over: Partial<StakeholderCandidate> = {}): StakeholderCandidate => ({
  text: 'Der Verantwortliche schützt personenbezogene Daten nach dem Stand der Technik.',
  handlungen: ['schützen'],
  empfaenger: ['—'],
  modalitaeten: ['pflicht'],
  bedingungen: ['bei jeder Verarbeitung'],
  kind: 'requirement',
  ...over,
});

const sysJson = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    text: 'Das Unternehmen muss ruhende personenbezogene Daten für Unbefugte unlesbar halten.',
    schutzgut: 'personenbezogene Daten',
    verpflichteter: 'controller',
    ausloeser: 'jede Verarbeitung',
    nachweis: 'Rechenschaftspflicht',
    ...over,
  });

describe('SYSTEM_REQ_SYSTEM (THE-545)', () => {
  it('demands the four key fields that make the collapse test mechanical', () => {
    for (const f of ['schutzgut', 'verpflichteter', 'ausloeser', 'nachweis']) {
      expect(SYSTEM_REQ_SYSTEM).toContain(f);
    }
  });

  it('demands an implementation-free capability statement', () => {
    expect(SYSTEM_REQ_SYSTEM).toMatch(/implementierungsfrei|kein.*Produkt|keine Technologie/i);
  });

  it('blinds the stakeholder requirement it is given', () => {
    const p = buildSystemReqUserPrompt(shr({ text: 'Nach DSGVO Art. 32 sind Maßnahmen zu treffen.' }));
    expect(p).not.toMatch(LAW_NAMES);
    expect(p).not.toMatch(/Art\.\s?32/);
  });
});

describe('violatesImplementationFreedom (THE-545)', () => {
  it('rejects concrete algorithms and products', () => {
    expect(violatesImplementationFreedom('Daten mit AES-256 verschlüsseln')).toBe(true);
    expect(violatesImplementationFreedom('TLS 1.3 erzwingen')).toBe(true);
    expect(violatesImplementationFreedom('ein SIEM einsetzen')).toBe(true);
  });

  it('accepts a capability stated without a solution', () => {
    expect(
      violatesImplementationFreedom('ruhende personenbezogene Daten nach Stand der Technik unlesbar halten'),
    ).toBe(false);
    expect(violatesImplementationFreedom('Vorfälle binnen 24 Stunden an die zuständige Behörde melden')).toBe(false);
  });

  it('is a data row, not a prompt — the lexicon is inspectable and extendable', () => {
    expect(Array.isArray(IMPLEMENTATION_LEXICON)).toBe(true);
    expect(IMPLEMENTATION_LEXICON.length).toBeGreaterThan(5);
  });

  it('does not fire on ordinary legal wording', () => {
    // Ein zu scharfes Lexikon wuerde jede Systemanforderung verwerfen und den
    // Lauf als "Kette traegt nicht" aussehen lassen — ein falsches Negativ.
    for (const s of [
      'Risiken für die Rechte und Freiheiten natürlicher Personen bewerten',
      'ein Verzeichnis der Verarbeitungstätigkeiten führen',
      'die Wirksamkeit der Maßnahmen regelmäßig überprüfen',
    ]) {
      expect(violatesImplementationFreedom(s)).toBe(false);
    }
  });
});

describe('parseSystemReq (THE-545)', () => {
  it('requires traceability back to at least one stakeholder requirement', () => {
    // 15288 §6.4.3.2 f): "traceability of system requirements to stakeholder
    // requirements is developed". Ohne Rueckverweis ist die Anforderung
    // erfunden, nicht abgeleitet.
    expect(parseSystemReq(sysJson(), [])).toBeNull();
    expect(parseSystemReq(sysJson(), ['dsgvo:art32:c01'])?.derivedFrom).toEqual(['dsgvo:art32:c01']);
  });

  it('treats a missing key field as unreadable', () => {
    expect(parseSystemReq(JSON.stringify({ text: 'x' }), ['a'])).toBeNull();
    expect(parseSystemReq(sysJson({ schutzgut: '' }), ['a'])).toBeNull();
  });

  it('returns null on garbage rather than throwing', () => {
    expect(parseSystemReq('¯\\_(ツ)_/¯', ['a'])).toBeNull();
  });

  it('flags an implementation-laden statement instead of silently accepting it', () => {
    const r = parseSystemReq(sysJson({ text: 'Das Unternehmen muss AES-256 einsetzen.' }), ['a']);
    expect(r).not.toBeNull();
    expect(r!.implementationFree).toBe(false);
  });
});

describe('collapseKey (THE-545, ADR-0007 E5)', () => {
  const base = { schutzgut: 'personenbezogene Daten', verpflichteter: 'controller', ausloeser: 'Verarbeitung', nachweis: 'Rechenschaft' };

  it('collapses only when ALL FOUR key fields match', () => {
    expect(collapseKey(base)).toBe(collapseKey({ ...base }));
    expect(collapseKey(base)).not.toBe(collapseKey({ ...base, schutzgut: 'IKT-Assets' }));
    expect(collapseKey(base)).not.toBe(collapseKey({ ...base, verpflichteter: 'financial_entity' }));
    expect(collapseKey(base)).not.toBe(collapseKey({ ...base, ausloeser: 'schwerwiegender Vorfall' }));
    expect(collapseKey(base)).not.toBe(collapseKey({ ...base, nachweis: 'Aufsichtsmeldung' }));
  });

  it('ignores case and surrounding whitespace but nothing else', () => {
    expect(collapseKey({ ...base, schutzgut: '  Personenbezogene Daten ' })).toBe(collapseKey(base));
  });

  it('separates the fields so a shifted value cannot fake a match', () => {
    // Ohne Trenner waere ("ab", "c") gleich ("a", "bc").
    expect(collapseKey({ schutzgut: 'ab', verpflichteter: 'c', ausloeser: 'x', nachweis: 'y' })).not.toBe(
      collapseKey({ schutzgut: 'a', verpflichteter: 'bc', ausloeser: 'x', nachweis: 'y' }),
    );
  });

  it('keeps the deadline difference apart — the case that killed the old design', () => {
    // NIS2 zaehlt ab Kenntnis, DORA ab der vorangegangenen Meldung. Eine
    // Anforderung "binnen 24 h bzw. 4 h" waere weder singulaer noch
    // verifizierbar — hier bleiben es zwei.
    const nis2 = { schutzgut: 'Netz- und Informationssysteme', verpflichteter: 'essential_important_entity', ausloeser: 'erheblicher Sicherheitsvorfall', nachweis: 'CSIRT-Meldung' };
    const dora = { schutzgut: 'IKT-Assets', verpflichteter: 'financial_entity', ausloeser: 'schwerwiegender IKT-Vorfall', nachweis: 'Aufsichtsmeldung' };
    expect(collapseKey(nis2)).not.toBe(collapseKey(dora));
  });
});
