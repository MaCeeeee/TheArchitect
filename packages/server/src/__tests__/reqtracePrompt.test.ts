/**
 * Tests für die Extraktion Klausel → Stakeholder-Anforderung (THE-545, Task 4).
 *
 * ── DER KNIFF GEGEN „LLM PRÜFT LLM" ──
 *
 * Singularität ist nach ADR-0007 E7 die Abnahmebedingung dieser Stufe. Ein
 * zweites Modell zu fragen „ist das singulär?" hätte dasselbe Kappa-Problem
 * wie alles andere, das wir in dieser Woche gemessen haben. Stattdessen
 * liefert der Prompt die Slots als LISTEN — und das Tor ist eine ZÄHLUNG:
 * jede Liste muss genau einen Eintrag haben. Das Modell extrahiert, die
 * Entscheidung ist ein `length === 1`.
 *
 * ── WARUM NICHT DAS KARTESISCHE PRODUKT ──
 *
 * Beim Aufteilen wird NUR entlang der Handlung geschnitten. Zwei Handlungen ×
 * zwei Bedingungen ergäben als Produkt vier Anforderungen — davon zwei, die
 * so nie im Gesetz stehen. Was nach dem Handlungs-Schnitt mehrdeutig bleibt,
 * wird gezählt und ausgewiesen, nicht multipliziert.
 */
import {
  STAKEHOLDER_REQ_SYSTEM,
  buildStakeholderReqUserPrompt,
  parseStakeholderCandidates,
  isSingular,
  splitByAction,
  type StakeholderCandidate,
} from '@thearchitect/shared';

const LAW_NAMES = /\bDSGVO\b|\bGDPR\b|\bNIS-?2\b|\bDORA\b/;

const cand = (over: Partial<StakeholderCandidate> = {}): StakeholderCandidate => ({
  text: 'Der Verantwortliche meldet die Verletzung.',
  handlungen: ['melden'],
  empfaenger: ['Aufsichtsbehörde'],
  modalitaeten: ['pflicht'],
  bedingungen: ['binnen 72 Stunden'],
  kind: 'requirement',
  ...over,
});

const json = (candidates: unknown[]): string => JSON.stringify({ candidates });

describe('STAKEHOLDER_REQ_SYSTEM (THE-545)', () => {
  it('demands slots as LISTS so singularity is a count, not a judgement', () => {
    for (const slot of ['handlungen', 'empfaenger', 'modalitaeten', 'bedingungen']) {
      expect(STAKEHOLDER_REQ_SYSTEM).toMatch(new RegExp(`"${slot}"\\s*:\\s*\\[`));
    }
  });

  it('keeps "traegt keine Anforderung" as a first-class answer', () => {
    // Praeambeln und Verweisklauseln tragen keine Pflicht. Ein erzwungener
    // Treffer ist der Hauptfehlermodus — derselbe wie beim erzwungenen
    // Katalog-Treffer in der Klassifikation.
    expect(STAKEHOLDER_REQ_SYSTEM).toMatch(/keine Anforderung/i);
    expect(parseStakeholderCandidates('{"candidates":[]}')).toEqual([]);
  });

  it('forbids the HOW — that is the defect of the existing generator', () => {
    // requirementGenerator.prompt.ts verlangt woertlich "what concretely MUST
    // be done HOW". ISO 15288 §6.4.3.1 verlangt das Gegenteil.
    expect(STAKEHOLDER_REQ_SYSTEM).toMatch(/nicht.*WIE|kein.*Umsetzungsvorschlag/i);
  });

  it('names the three deontic modes and nothing else', () => {
    expect(STAKEHOLDER_REQ_SYSTEM).toContain('pflicht');
    expect(STAKEHOLDER_REQ_SYSTEM).toContain('verbot');
    expect(STAKEHOLDER_REQ_SYSTEM).toContain('erlaubnis');
  });
});

describe('buildStakeholderReqUserPrompt (THE-545)', () => {
  it('blinds law names and citations', () => {
    const p = buildStakeholderReqUserPrompt({
      id: 'dsgvo:art32:c01',
      path: 'Abs. 1',
      text: 'Nach DSGVO Art. 32 sind Maßnahmen zu treffen.',
    });
    expect(p).not.toMatch(LAW_NAMES);
    expect(p).not.toMatch(/Art\.\s?32/);
  });

  it('NEVER renders the clause id', () => {
    // Die reale Id lautet `dsgvo:art32:c01`. CITATION_PATTERN faengt `art32`
    // nicht (kein \b zwischen Buchstabe und Ziffer) — die Id ist deshalb
    // Auswertungs-Anker und niemals Prompt-Inhalt.
    const p = buildStakeholderReqUserPrompt({ id: 'dsgvo:art32:c01', path: 'Abs. 1', text: 'Maßnahmen treffen.' });
    expect(p).not.toMatch(/dsgvo:art32|c01/);
  });

  it('keeps the substantive text so there is something to extract', () => {
    const p = buildStakeholderReqUserPrompt({ id: 'x:y:c01', path: 'Abs. 2', text: 'binnen 72 Stunden melden' });
    expect(p).toContain('binnen 72 Stunden melden');
  });
});

describe('parseStakeholderCandidates (THE-545)', () => {
  it('parses a well-formed candidate', () => {
    const c = parseStakeholderCandidates(json([cand()]));
    expect(c).toHaveLength(1);
    expect(c![0].handlungen).toEqual(['melden']);
  });

  it('treats unreadable output as null, never as empty-success', () => {
    // Leer heisst "diese Klausel traegt keine Anforderung" — ein gueltiger
    // Befund. Unlesbar heisst "der Lauf ist kaputt". Wer beides zusammenwirft,
    // verwandelt einen Ausfall in einen sauberen Negativ-Befund.
    expect(parseStakeholderCandidates('kaputt')).toBeNull();
    expect(parseStakeholderCandidates('{"nope":1}')).toBeNull();
  });

  it('rejects the WHOLE answer when one candidate is malformed', () => {
    // Nicht still den kaputten wegwerfen: "2 von 3 geliefert" ist von
    // "2 geliefert" nicht unterscheidbar, und der Verlust waere unsichtbar.
    expect(parseStakeholderCandidates(json([cand(), { text: 'x' }]))).toBeNull();
  });

  it('rejects an invented modality instead of passing it through', () => {
    expect(parseStakeholderCandidates(json([cand({ modalitaeten: ['soll-irgendwie'] })]))).toBeNull();
  });

  it('maps prohibition to constraint at parse time', () => {
    // ArchiMate-Projektion trennt bereits requirement/constraint
    // (requirementProjection.service.ts) — hier entsteht die Information.
    const c = parseStakeholderCandidates(json([cand({ modalitaeten: ['verbot'] })]));
    expect(c![0].kind).toBe('constraint');
  });

  it('keeps a permission a requirement, not a constraint', () => {
    const c = parseStakeholderCandidates(json([cand({ modalitaeten: ['erlaubnis'] })]));
    expect(c![0].kind).toBe('requirement');
  });
});

describe('isSingular (THE-545)', () => {
  it('is singular iff every slot list has exactly one entry', () => {
    expect(isSingular(cand())).toBe(true);
    expect(isSingular(cand({ handlungen: ['etablieren', 'dokumentieren'] }))).toBe(false);
    expect(isSingular(cand({ empfaenger: ['Behörde', 'Betroffene'] }))).toBe(false);
  });

  it('treats an EMPTY list as not singular', () => {
    // "Nicht genannt" hat einen eigenen Wert (SLOT_UNSTATED). Eine leere
    // Liste ist eine fehlende Angabe und darf nicht als singulaer durchgehen.
    expect(isSingular(cand({ bedingungen: [] }))).toBe(false);
  });
});

describe('splitByAction (THE-545)', () => {
  it('splits one candidate per action — the identity of a requirement', () => {
    // "Konzepte und Verfahren etablieren UND dokumentieren" sind zwei
    // Anforderungen (NIS2 Art. 21, echter Text).
    const parts = splitByAction(cand({ handlungen: ['etablieren', 'dokumentieren'] }));
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.handlungen[0])).toEqual(['etablieren', 'dokumentieren']);
    expect(parts.every(isSingular)).toBe(true);
  });

  it('does NOT build the cartesian product', () => {
    // Zwei Handlungen x zwei Bedingungen ergaeben vier Anforderungen — davon
    // zwei, die so nie im Gesetz stehen.
    const parts = splitByAction(cand({ handlungen: ['a', 'b'], bedingungen: ['x', 'y'] }));
    expect(parts).toHaveLength(2);
    expect(parts.every(isSingular)).toBe(false);
  });

  it('leaves an already singular candidate untouched', () => {
    const c = cand();
    expect(splitByAction(c)).toEqual([c]);
  });

  it('returns nothing for a candidate without any action', () => {
    expect(splitByAction(cand({ handlungen: [] }))).toEqual([]);
  });
});
