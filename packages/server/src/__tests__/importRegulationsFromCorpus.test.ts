/**
 * import-regulations-from-corpus Tests — reine planImport-Transformation.
 *
 * Run: cd packages/server && npx jest src/__tests__/importRegulationsFromCorpus.test.ts
 */
import mongoose from 'mongoose';
import { planImport } from '../scripts/import-regulations-from-corpus';

const pid = new mongoose.Types.ObjectId();

const corpusReg = (source: string, paragraphNumber: string, fullText: string) => ({
  source,
  jurisdiction: 'EU',
  paragraphNumber,
  title: `${source} ${paragraphNumber}`,
  fullText,
  language: 'de',
  sourceUrl: 'https://eur-lex.europa.eu/x',
  effectiveFrom: new Date('2018-05-25'),
});

const LONG = 'x'.repeat(60);

describe('planImport()', () => {
  it('inserts new paragraphs and maps corpus fields onto the project doc', () => {
    const { docs, plan } = planImport([corpusReg('dsgvo', 'Art. 30', LONG)], new Set(), pid);
    expect(plan).toEqual([{ source: 'dsgvo', paragraphNumber: 'Art. 30', action: 'insert' }]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      projectId: pid,
      source: 'dsgvo',
      paragraphNumber: 'Art. 30',
      jurisdiction: 'EU',
      language: 'de',
      version: 1,
    });
    expect(docs[0].fullText.length).toBeGreaterThanOrEqual(50);
  });

  it('skips paragraphs already present in the project (idempotent by source::paragraph)', () => {
    const existing = new Set(['dsgvo::Art. 30']);
    const { docs, plan } = planImport(
      [corpusReg('dsgvo', 'Art. 30', LONG), corpusReg('dsgvo', 'Art. 32', LONG)],
      existing,
      pid
    );
    expect(docs.map(d => d.paragraphNumber)).toEqual(['Art. 32']);
    expect(plan.find(p => p.paragraphNumber === 'Art. 30')?.action).toBe('skip_exists');
  });

  it('skips corpus entries whose fullText is below the 50-char schema minimum', () => {
    const { docs, plan } = planImport([corpusReg('nis2', 'Art. 21', 'too short')], new Set(), pid);
    expect(docs).toHaveLength(0);
    expect(plan[0]).toMatchObject({ action: 'skip_short' });
  });

  it('falls back to a sourceUrl when the corpus entry has none', () => {
    const reg = { ...corpusReg('dsgvo', 'Art. 5', LONG), sourceUrl: '' };
    const { docs } = planImport([reg], new Set(), pid);
    expect(docs[0].sourceUrl).toBe('corpus-import');
  });
});
