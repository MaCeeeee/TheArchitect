/**
 * Tests der Norm-Bündelung für den Generator (THE-570).
 *
 * Fixture = die ECHTEN, uneinheitlichen Korpus-Quellen: `nis2`/`nis2-de`,
 * `ai-act-en`/`ai-act-de`, `lksg` allein. Genau daran scheitert jede
 * Suffix-Heuristik — die Sprache kommt deshalb aus `expressionLanguage`.
 */
import { describe, test, expect } from 'vitest';
import { groupCorpusNorms, resolveVersion, type PickerNorm } from './normPicker';

const n = (workId: string, language: string | undefined, sectionCount = 10): PickerNorm => ({
  identity: { workId, expressionLanguage: language },
  source: 'corpus',
  title: workId,
  sectionCount,
});

describe('groupCorpusNorms — ein Eintrag je Rechtsakt', () => {
  test('bundles language versions of the same act, however the source is named', () => {
    const groups = groupCorpusNorms([
      n('corpus:nis2', 'en', 46),
      n('corpus:nis2-de', 'de', 46),
      n('corpus:ai-act-en', 'en', 112),
      n('corpus:ai-act-de', 'de', 113),
      n('corpus:lksg', 'de', 24),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['ai-act', 'lksg', 'nis2']);
    expect(groups.find((g) => g.key === 'nis2')!.versions.map((v) => v.language)).toEqual(['de', 'en']);
    expect(groups.find((g) => g.key === 'lksg')!.versions).toHaveLength(1);
  });

  test('keeps differing section counts per version visible — the AI-Act gap must not be averaged away', () => {
    const groups = groupCorpusNorms([n('corpus:ai-act-en', 'en', 112), n('corpus:ai-act-de', 'de', 113)]);
    const ai = groups[0];
    expect(ai.versions.find((v) => v.language === 'en')!.sectionCount).toBe(112);
    expect(ai.versions.find((v) => v.language === 'de')!.sectionCount).toBe(113);
  });

  test('a version without a reported language is kept as "unknown", never guessed from the suffix', () => {
    const groups = groupCorpusNorms([n('corpus:cra-de', undefined, 71)]);
    expect(groups[0].versions[0].language).toBe('unknown');
  });

  test('upload norms are not part of the corpus picker', () => {
    const upload: PickerNorm = {
      identity: { workId: 'upload:507f1f77bcf86cd799439011' },
      source: 'upload',
      title: 'Internes Regelwerk',
      sectionCount: 15,
    };
    expect(groupCorpusNorms([upload, n('corpus:nis2', 'en')])).toHaveLength(1);
  });
});

describe('Dubletten — dieselbe workId aus zwei Quellen', () => {
  // In der Praxis liefert die Norm-Liste dieselbe workId zweimal: als
  // Projekt-Norm (die bei einem Korpus-Miss aus der App-DB kommt und dann nur
  // die eine eingefuegte Klausel traegt) UND als Korpus-Gesetz mit allen
  // Artikeln. Am 03.08. zeigte das Dropdown deshalb 1 statt 46 Artikeln.
  test('keeps the more complete version when the same workId appears twice', () => {
    const groups = groupCorpusNorms([
      n('corpus:nis2', 'de', 1), // App-DB-Fallback: nur die eingefuegte Klausel
      n('corpus:nis2', 'en', 46), // echtes Korpus-Gesetz
      n('corpus:nis2-de', 'de', 46),
    ]);
    const nis2 = groups.find((g) => g.key === 'nis2')!;
    expect(nis2.versions).toHaveLength(2);
    expect(nis2.versions.find((v) => v.workId === 'corpus:nis2')!.sectionCount).toBe(46);
  });
});

describe('zwei Fassungen DERSELBEN Sprache — die vollstaendigere gewinnt', () => {
  // Realfall 03.08.: das Projekt referenziert `corpus:nis2`, dessen Sections
  // bei einem Korpus-Miss aus der App-DB kommen (1 eingefuegte Klausel).
  // Daneben liegt `corpus:nis2-de` mit allen 46 Artikeln — beide deutsch.
  test('resolveVersion picks the fuller version when two share a language', () => {
    const group = groupCorpusNorms([n('corpus:nis2', 'de', 1), n('corpus:nis2-de', 'de', 46)])[0];
    expect(resolveVersion(group, 'de')!.workId).toBe('corpus:nis2-de');
  });
});

describe('resolveVersion — die Sprachwahl ist ehrlich', () => {
  const nis2 = groupCorpusNorms([n('corpus:nis2', 'en'), n('corpus:nis2-de', 'de')])[0];
  const lksg = groupCorpusNorms([n('corpus:lksg', 'de')])[0];

  test('picks the requested language exactly when it exists', () => {
    expect(resolveVersion(nis2, 'de')).toEqual({ workId: 'corpus:nis2-de', language: 'de', exact: true });
  });

  test('falls back to the only version — and says that it is not what was asked for', () => {
    const r = resolveVersion(lksg, 'en')!;
    expect(r.workId).toBe('corpus:lksg');
    expect(r.language).toBe('de');
    expect(r.exact).toBe(false);
  });
});
