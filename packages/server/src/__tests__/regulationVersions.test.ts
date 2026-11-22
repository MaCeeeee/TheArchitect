/**
 * THE-807 (UC-REGVER-001): je (source, paragraphNumber) nur die höchste Fassung.
 * Der Platzhalter `live-paste` ist keine Fassung desselben Paragraphen und bleibt vollständig.
 *
 * Run: cd packages/server && npx jest src/__tests__/regulationVersions.test.ts
 */
import { latestVersionPerParagraph } from '../services/regulationResolver.service';

type R = { id: string; source: string; paragraphNumber: string; version?: number };

const r = (id: string, source: string, paragraphNumber: string, version?: number): R => ({
  id,
  source,
  paragraphNumber,
  version,
});

describe('latestVersionPerParagraph (THE-807)', () => {
  it('nimmt je Paragraph nur die höchste Version', () => {
    const input = [
      r('a1', 'ai-act-de', 'Art. 50', 1),
      r('a3', 'ai-act-de', 'Art. 50', 3),
      r('a2', 'ai-act-de', 'Art. 50', 2),
      r('d1', 'dsgvo', 'Art. 17', 1),
    ];
    expect(latestVersionPerParagraph(input).map(x => x.id)).toEqual(['a3', 'd1']);
  });

  it('trennt nach source: gleiche Nummer in zwei Gesetzen bleibt zweimal', () => {
    const input = [r('x', 'dsgvo', 'Art. 5', 1), r('y', 'nis2', 'Art. 5', 1)];
    expect(latestVersionPerParagraph(input).map(x => x.id)).toEqual(['x', 'y']);
  });

  it('behält ALLE live-paste-Dokumente, auch mit verschiedenen Versionen', () => {
    const input = [
      r('p1', 'lksg', 'live-paste', 1),
      r('p2', 'lksg', 'live-paste', 2),
      r('d1', 'dsgvo', 'Art. 17', 1),
    ];
    expect(latestVersionPerParagraph(input).map(x => x.id)).toEqual(['p1', 'p2', 'd1']);
  });

  it('fehlende version zählt als 1', () => {
    const input = [r('old', 'dsgvo', 'Art. 17'), r('new', 'dsgvo', 'Art. 17', 2)];
    expect(latestVersionPerParagraph(input).map(x => x.id)).toEqual(['new']);
  });

  it('verändert die Eingabe nicht', () => {
    const input = [r('a1', 'ai-act-de', 'Art. 50', 1), r('a2', 'ai-act-de', 'Art. 50', 2)];
    const copy = JSON.stringify(input);
    latestVersionPerParagraph(input);
    expect(JSON.stringify(input)).toBe(copy);
  });

  it('leere Eingabe → leere Ausgabe', () => {
    expect(latestVersionPerParagraph([])).toEqual([]);
  });
});
