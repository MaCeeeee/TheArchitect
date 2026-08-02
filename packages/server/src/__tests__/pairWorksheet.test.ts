/**
 * Tests für das blinde Adjudikations-Arbeitsblatt (THE-382 Slice 1, Task 4).
 *
 * Diese Datei prüft nicht Optik, sondern MESSVALIDITÄT. Jeder Test unten steht
 * für einen Weg, auf dem das menschliche Gold wertlos werden könnte, ohne dass
 * es jemandem auffällt: ein sichtbarer Gesetzesname, ein vorbelegtes
 * Maschinenurteil, eine andere Rubrik als die des Richters.
 */
import { renderPairWorksheet, interleaveByArm } from '../scripts/pair-worksheet';
import type { ActionGoldenCase } from '../evals/actionGolden';

const cases: ActionGoldenCase[] = [
  {
    id: 'dsgvo-art-33__nis2-art-23',
    arm: 'T',
    a: {
      law: 'DSGVO',
      para: 'Art. 33',
      title: 'Meldung an die Aufsichtsbehörde nach DSGVO',
      text: 'Der Verantwortliche meldet die Verletzung gemäß DSGVO Art. 33 binnen 72 Stunden.',
    },
    b: {
      law: 'NIS2',
      para: 'Art. 23',
      title: 'Berichtspflichten',
      text: 'Die Einrichtung meldet erhebliche Sicherheitsvorfälle nach NIS2 an das CSIRT.',
    },
    actionId: 'vorfall-melden-behoerde',
  },
  {
    id: 'dora-art-9__dsgvo-art-32',
    arm: 'K',
    a: { law: 'DORA', para: 'Art. 9', title: 'Schutz und Prävention', text: 'Finanzunternehmen setzen Werkzeuge ein.' },
    b: { law: 'DSGVO', para: 'Art. 32', title: 'Sicherheit der Verarbeitung', text: 'Technische und organisatorische Maßnahmen.' },
    actionId: 'technisch-organisatorische-massnahmen',
    actionIdB: 'zugriffskontrolle',
  },
];

const html = renderPairWorksheet(cases);

describe('renderPairWorksheet (THE-382)', () => {
  it('offers all four relations plus an explicit unsure', () => {
    for (const r of ['equal', 'subset', 'intersects', 'unrelated', 'unsicher']) {
      expect(html.toLowerCase()).toContain(r);
    }
  });

  it('starts on "unsure" — a pre-picked relation would measure agreement, not judgement', () => {
    expect(html).toMatch(/value="__unsure" selected/);
    expect(html).not.toMatch(/value="(equal|subset|intersects|unrelated)"\s+selected/);
  });

  it('asks which side is the wider one when the human picks subset', () => {
    // Der Mensch bekommt dieselbe Rubrik wie der Richter — einschliesslich der
    // Richtung, sonst ist sein Gold nicht gegen die Maschinenurteile stellbar.
    expect(html).toMatch(/weitere/i);
    expect(html).toMatch(/nv\.wider\s*=/);
  });

  it('disables the direction unless subset is chosen — structurally, not by instruction', () => {
    expect(html).toMatch(/disabled = \(rel !== 'subset'\)/);
  });

  it('explains each relation in the sheet itself', () => {
    // Der Mensch bekommt DIESELBE Rubrik wie der Richter — sonst beantworten
    // sie verschiedene Fragen und der Kappa misst die Differenz der Rubriken.
    expect(html).toMatch(/gemeinsamen Kern/);
    expect(html).toMatch(/Unterschiede beschränken sich auf Parameter/);
  });

  it('BLINDS law names — the human sees what the judge sees', () => {
    expect(html).not.toMatch(/\bDSGVO\b|\bNIS-?2\b|\bDORA\b/);
  });

  it('blinds citations too, wherever they hide in title or text', () => {
    expect(html).not.toMatch(/Art\.\s*33|Art\.\s*23|Art\.\s*32/);
  });

  it('shows NO machine verdict and no arm label — no anchoring', () => {
    expect(html).not.toMatch(/vorschlag|suggested|Arm [TK]/i);
  });

  it('does not leak the canonical action — it would give away the arm', () => {
    // Steht bei beiden Seiten dieselbe Handlung, ist Arm T erkennbar; stehen
    // zwei verschiedene, Arm K. Beides waere ein Maschinenurteil im Blatt.
    expect(html).not.toContain('vorfall-melden-behoerde');
    expect(html).not.toContain('zugriffskontrolle');
  });

  it('keeps the substantive text so there is something to judge', () => {
    expect(html).toContain('binnen 72 Stunden');
    expect(html).toContain('an das CSIRT');
  });

  it('is self-contained — no external assets', () => {
    expect(html).not.toMatch(/<script src=|<link[^>]+href="http/);
  });

  it('exports a gold that the schema accepts — blinded, sourced, typed', () => {
    expect(html).toMatch(/blinded:true/);
    expect(html).toMatch(/sourceSet:'actions\.v1'/);
    expect(html).toMatch(/relation: \(v==='__unsure' \? null : v\)/);
  });

  it('renders the same sheet twice — a wobbling anchor is no anchor', () => {
    expect(renderPairWorksheet(cases)).toBe(html);
  });
});

describe('interleaveByArm (THE-382)', () => {
  const mk = (id: string, arm: 'T' | 'K'): ActionGoldenCase => ({
    id,
    arm,
    a: { law: 'X', para: '1', title: 't', text: 't' },
    b: { law: 'Y', para: '2', title: 't', text: 't' },
    actionId: 'x',
  });

  it('never leaves a block of one arm — a block is recognisable and anchors', () => {
    const mixed = interleaveByArm([
      ...Array.from({ length: 8 }, (_, i) => mk(`t${i}`, 'T')),
      ...Array.from({ length: 4 }, (_, i) => mk(`k${i}`, 'K')),
    ]);
    // 8 T zu 4 K: kein Lauf gleicher Arme laenger als 2.
    let run = 1;
    let longest = 1;
    for (let i = 1; i < mixed.length; i++) {
      run = mixed[i].arm === mixed[i - 1].arm ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(2);
  });

  it('keeps every case exactly once', () => {
    const input = [mk('a', 'T'), mk('b', 'K'), mk('c', 'T')];
    expect(interleaveByArm(input).map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('passes a single-arm list through unchanged', () => {
    const only = [mk('a', 'T'), mk('b', 'T')];
    expect(interleaveByArm(only)).toEqual(only);
  });
});
