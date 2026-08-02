/**
 * Tests für das Maßnahmen-Arbeitsblatt (THE-545, Task 8).
 *
 * Die Einheit ist hier die MASSNAHME, nicht das Paar — das ist der ganze
 * Unterschied zum Blatt aus THE-382. Der Mensch beantwortet je Kandidat genau
 * eine Frage: *„Ist das eine Maßnahme, die man einmal baut?"* Fünf Fälle statt
 * vierzig.
 *
 * ── DIE EINE NEUE GARANTIE ──
 *
 * **Kein SCF-Name im Blatt.** Der Adjudikator darf nicht wissen, welche
 * Antwort das externe Gold erwartet — sonst misst das Tor Zustimmung statt
 * Urteil. Dieselbe Logik wie die Blendung der Gesetzesnamen, eine Ebene höher.
 */
import { renderReqtraceWorksheet, type MeasureCase } from '../scripts/reqtrace-worksheet';

const measure = (over: Partial<MeasureCase> = {}): MeasureCase => ({
  id: 'measure__dsgvo:art32:c01:s1',
  laws: ['dsgvo', 'nis2'],
  requirements: [
    { id: 'dsgvo:art32:c01:s1', text: 'Das Unternehmen muss ruhende Daten für Unbefugte unlesbar halten.' },
    { id: 'nis2:art21:c04:s1', text: 'Das Unternehmen muss Netzsysteme gegen unbefugten Zugriff schützen.' },
  ],
  ...over,
});

const html = renderReqtraceWorksheet([measure()]);

describe('renderReqtraceWorksheet (THE-545)', () => {
  it('asks exactly one question per measure', () => {
    expect(html).toMatch(/einmal baut/i);
    for (const opt of ['ja', 'nein', 'unsicher']) {
      expect(html.toLowerCase()).toContain(opt);
    }
  });

  it('starts on "unsicher" — a pre-picked answer measures agreement, not judgement', () => {
    expect(html).toMatch(/value="__unsure" selected/);
    expect(html).not.toMatch(/value="(ja|nein)"\s+selected/);
  });

  it('shows the realised requirements so there is something to judge', () => {
    expect(html).toContain('unlesbar halten');
    expect(html).toContain('Netzsysteme');
  });

  it('carries NO SCF name and no gold hint — the human must not know the answer', () => {
    const withGold = renderReqtraceWorksheet([measure({ id: 'measure__BCD-01-ish' })]);
    for (const s of ['BCD-01', 'CRY-01', 'GOV-02', 'HRS-03', 'RSK-01', 'SCF']) {
      expect(withGold).not.toContain(s);
    }
  });

  it('BLINDS law names in the requirement texts', () => {
    const h = renderReqtraceWorksheet([
      measure({
        requirements: [{ id: 'a', text: 'Nach DSGVO Art. 32 sind Maßnahmen zu treffen.' }],
      }),
    ]);
    expect(h).not.toMatch(/\bDSGVO\b|\bNIS-?2\b|\bDORA\b|Art\.\s?32/);
  });

  it('does not reveal which laws the measure spans — that is the answer, not the question', () => {
    // "Diese Massnahme bedient DSGVO und NIS2" waere bereits die Behauptung,
    // die der Mensch pruefen soll.
    expect(html).not.toMatch(/dsgvo|nis2|dora/i);
  });

  it('is self-contained — no external assets', () => {
    expect(html).not.toMatch(/<script src=|<link[^>]+href="http/);
  });

  it('exports a verdict per measure with the adjudicator named', () => {
    expect(html).toMatch(/annotator/);
    expect(html).toMatch(/measureToken/);
  });

  it('renders the same sheet twice — a wobbling anchor is no anchor', () => {
    expect(renderReqtraceWorksheet([measure()])).toBe(html);
  });

  it('says plainly when there is nothing to adjudicate', () => {
    // Null Massnahmen ist ein moegliches Ergebnis des Laufs und darf nicht als
    // leeres Blatt daherkommen.
    expect(renderReqtraceWorksheet([])).toMatch(/keine geteilte Maßnahme/i);
  });
});
