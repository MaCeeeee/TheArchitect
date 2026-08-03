/**
 * THE-573 (REQ-573.2, AC 3): Eine genannte Kennung MUSS bis zum Gesetzestext
 * führen — sonst ist sie nur eine hübschere Zahl.
 *
 * ── DER GEMESSENE ANLASS ──
 *
 * Am echten Korpus lösten 44 von 47 bindenden Artikeln auf; drei nicht. Ursache
 * war keine fehlende Kennung, sondern eine ÜBERSCHATTUNG: Das Projekt trug eine
 * verkürzte Norm unter `corpus:nis2` (Stummel aus dem alten Einfüge-Weg, eine
 * einzige Section). `getNorm` bevorzugt die Projekt-Kopie und fragt den Korpus
 * nur, wenn gar keine da ist — also nie.
 *
 * Dieselbe Falle wie im Generator-Dropdown am 03.08. (1 statt 46 Artikel). Die
 * Regel dahinter: eine Projekt-Kopie, die die Antwort nicht enthält, ist kein
 * Grund, den Korpus nicht zu fragen.
 */
import { getNormSection } from '../services/norm.service';
import type { NormView } from '@thearchitect/shared';

const section = (eId: string) => ({
  eId,
  heading: `Heading ${eId}`,
  number: eId.split(':')[1],
  text: `Text ${eId}`,
  level: 1,
});

/** Die Leser sind injiziert — der Test braucht dadurch kein Tailnet. */
const normStub = (workId: string, eIds: string[]) =>
  jest.fn(
    async (w: string): Promise<NormView | null> =>
      w === workId
        ? {
            identity: { workId, expressionLanguage: 'de', aliases: [], frbrLevel: 'expression' },
            source: 'corpus',
            projectId: 'p1',
            title: workId,
            sections: eIds.map(section),
          }
        : null,
  );

const noNorm = jest.fn(async (): Promise<NormView | null> => null);

describe('getNormSection — die Projekt-Kopie darf den Korpus nicht überschatten', () => {
  it('serves the section from the project copy when it HAS it', async () => {
    const project = normStub('corpus:nis2', ['nis2:art-21', 'nis2:art-23']);
    const corpus = jest.fn(async (): Promise<null> => null);
    const s = await getNormSection('p1', 'corpus:nis2', 'nis2:art-23', {
      readProject: project,
      readCorpus: corpus,
    });
    expect(s?.text).toBe('Text nis2:art-23');
    expect(corpus).not.toHaveBeenCalled(); // kein unnötiger Tailnet-Weg
  });

  it('falls back to the corpus when the project copy is a stub without that article', async () => {
    // Genau der gemessene Fall: Projekt-Norm mit EINER eingefügten Klausel.
    const project = normStub('corpus:nis2', ['nis2:art-99']);
    const corpus = normStub('corpus:nis2', ['nis2:art-21', 'nis2:art-23']);
    const s = await getNormSection('p1', 'corpus:nis2', 'nis2:art-23', {
      readProject: project,
      readCorpus: corpus,
    });
    expect(s?.text).toBe('Text nis2:art-23');
    expect(corpus).toHaveBeenCalled();
  });

  it('falls back when the project has no copy of the law at all', async () => {
    const project = noNorm;
    const corpus = normStub('corpus:dsgvo', ['dsgvo:art-33']);
    const s = await getNormSection('p1', 'corpus:dsgvo', 'dsgvo:art-33', {
      readProject: project,
      readCorpus: corpus,
    });
    expect(s?.text).toBe('Text dsgvo:art-33');
  });

  it('returns null when NEITHER has it — a missing article is not an empty one', async () => {
    // Negativ-Kontrolle: „nicht gefunden" darf nicht als leerer Text
    // durchgehen. Ein leerer Kasten liest sich wie ein Artikel ohne Inhalt.
    const project = normStub('corpus:nis2', ['nis2:art-1']);
    const corpus = normStub('corpus:nis2', ['nis2:art-1']);
    const s = await getNormSection('p1', 'corpus:nis2', 'nis2:art-23', {
      readProject: project,
      readCorpus: corpus,
    });
    expect(s).toBeNull();
  });

  it('never reaches for the corpus on a non-corpus workId', async () => {
    const project = noNorm;
    const corpus = jest.fn(async (): Promise<null> => null);
    const s = await getNormSection('p1', 'upload:507f1f77bcf86cd799439011', 'x:1', {
      readProject: project,
      readCorpus: corpus,
    });
    expect(s).toBeNull();
    expect(corpus).not.toHaveBeenCalled();
  });
});
