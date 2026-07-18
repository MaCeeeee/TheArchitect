/**
 * build-discovery-eval-vectors Tests — UC-LAW-002 Slice-2b (THE-465).
 * Pure orchestration only (embed/generateHyde mocked) — no real network I/O.
 *
 * Run: cd packages/server && npx jest build-discovery-eval-vectors --verbose
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  embedMissingParagraphs,
  embedMissingQueries,
  readQueriesFile,
  writeJson,
  BuildVectorsError,
  EMBEDDING_DIM,
  type QueriesFile,
} from '../scripts/build-discovery-eval-vectors';
import type { FixtureCorpus, DiscoveryGoldenSet } from '../evals/discoveryGolden';

function vec(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => (i === 0 ? seed : 0));
}

function corpus(paragraphs: Array<{ text: string; vector?: number[] }>): FixtureCorpus {
  return {
    version: 'v1',
    paragraphs: paragraphs.map((p, i) => ({
      regulationKey: `dsgvo:${i}`,
      versionHash: `fx-${i}`,
      source: 'dsgvo',
      paragraphNumber: `Art. ${i}`,
      title: 'Test',
      jurisdiction: 'EU',
      language: 'de',
      text: p.text,
      ...(p.vector ? { vector: p.vector } : {}),
    })),
  };
}

function golden(cases: Array<{ caseId: string; profileText: string }>): DiscoveryGoldenSet {
  return {
    version: 'v1',
    frozen: false,
    rubricRef: 'x',
    cases: cases.map(c => ({
      caseId: c.caseId,
      title: c.caseId,
      profileText: c.profileText,
      signalHints: [],
      goldFamilies: ['dsgvo'],
      ruleLessGold: [],
      ambiguous: false,
    })),
  };
}

describe('embedMissingParagraphs', () => {
  it('embeds paragraphs without a vector', async () => {
    const embed = jest.fn().mockResolvedValue(vec(1));
    const c = corpus([{ text: 'a'.repeat(90) }, { text: 'b'.repeat(90) }]);
    const res = await embedMissingParagraphs(c, { embed }, false);
    expect(res.embedded).toBe(2);
    expect(res.skipped).toBe(0);
    expect(embed).toHaveBeenCalledTimes(2);
    expect(res.corpus.paragraphs.every(p => p.vector?.length === EMBEDDING_DIM)).toBe(true);
  });

  it('only-missing default: skips paragraphs that already have a vector', async () => {
    const embed = jest.fn().mockResolvedValue(vec(1));
    const c = corpus([{ text: 'a'.repeat(90), vector: vec(9) }, { text: 'b'.repeat(90) }]);
    const res = await embedMissingParagraphs(c, { embed }, false);
    expect(res.embedded).toBe(1);
    expect(res.skipped).toBe(1);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(res.corpus.paragraphs[0].vector).toEqual(vec(9)); // untouched
  });

  it('force:true re-embeds even already-vectored paragraphs', async () => {
    const embed = jest.fn().mockResolvedValue(vec(1));
    const c = corpus([{ text: 'a'.repeat(90), vector: vec(9) }]);
    const res = await embedMissingParagraphs(c, { embed }, true);
    expect(res.embedded).toBe(1);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(res.corpus.paragraphs[0].vector).toEqual(vec(1));
  });

  it('dim guard: throws when embed returns the wrong dimensionality', async () => {
    const embed = jest.fn().mockResolvedValue([1, 2, 3]);
    const c = corpus([{ text: 'a'.repeat(90) }]);
    await expect(embedMissingParagraphs(c, { embed }, false)).rejects.toThrow(BuildVectorsError);
  });
});

describe('embedMissingQueries', () => {
  it('embeds baseline vectors for all cases when nothing exists yet', async () => {
    const embed = jest.fn().mockResolvedValue(vec(1));
    const generateHyde = jest.fn();
    const g = golden([{ caseId: 'c1', profileText: 'p1' }, { caseId: 'c2', profileText: 'p2' }]);
    const res = await embedMissingQueries(g, null, { embed, generateHyde }, { hyde: false, force: false });
    expect(res.embedded).toBe(2);
    expect(res.hydeGenerated).toBe(0);
    expect(res.queries.every(q => q.baselineVector?.length === EMBEDDING_DIM)).toBe(true);
    expect(generateHyde).not.toHaveBeenCalled();
  });

  it('only-missing default: skips cases that already have a baselineVector', async () => {
    const embed = jest.fn().mockResolvedValue(vec(1));
    const generateHyde = jest.fn();
    const g = golden([{ caseId: 'c1', profileText: 'p1' }]);
    const existing: QueriesFile = { version: 'v1', queries: [{ caseId: 'c1', baselineVector: vec(5) }] };
    const res = await embedMissingQueries(g, existing, { embed, generateHyde }, { hyde: false, force: false });
    expect(res.skipped).toBe(1);
    expect(res.embedded).toBe(0);
    expect(embed).not.toHaveBeenCalled();
    expect(res.queries[0].baselineVector).toEqual(vec(5));
  });

  it('--hyde generates a hyde text + vector per case when missing', async () => {
    const embed = jest.fn().mockResolvedValue(vec(2));
    const generateHyde = jest.fn().mockResolvedValue('hypothetical legal text');
    const g = golden([{ caseId: 'c1', profileText: 'p1' }]);
    const res = await embedMissingQueries(g, null, { embed, generateHyde }, { hyde: true, force: false });
    expect(res.hydeGenerated).toBe(1);
    expect(generateHyde).toHaveBeenCalledWith('p1');
    expect(res.queries[0].hydeText).toBe('hypothetical legal text');
    expect(res.queries[0].hydeVector?.length).toBe(EMBEDDING_DIM);
    // baseline + hyde both embedded → embed called twice for this case
    expect(embed).toHaveBeenCalledTimes(2);
  });

  it('--hyde only-missing: does not regenerate an existing hydeText, but backfills a missing hydeVector', async () => {
    const embed = jest.fn().mockResolvedValue(vec(3));
    const generateHyde = jest.fn();
    const g = golden([{ caseId: 'c1', profileText: 'p1' }]);
    const existing: QueriesFile = { version: 'v1', queries: [{ caseId: 'c1', baselineVector: vec(5), hydeText: 'already there' }] };
    const res = await embedMissingQueries(g, existing, { embed, generateHyde }, { hyde: true, force: false });
    expect(generateHyde).not.toHaveBeenCalled();
    expect(res.queries[0].hydeText).toBe('already there');
    expect(res.queries[0].hydeVector?.length).toBe(EMBEDDING_DIM);
  });

  it('dim guard applies to baseline embeddings too', async () => {
    const embed = jest.fn().mockResolvedValue([1, 2]);
    const generateHyde = jest.fn();
    const g = golden([{ caseId: 'c1', profileText: 'p1' }]);
    await expect(embedMissingQueries(g, null, { embed, generateHyde }, { hyde: false, force: false })).rejects.toThrow(
      BuildVectorsError,
    );
  });
});

describe('readQueriesFile / writeJson (JSON roundtrip)', () => {
  it('round-trips a queries file through disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-vectors-'));
    const file = path.join(dir, 'discovery.queries.v1.json');
    const data: QueriesFile = { version: 'v1', queries: [{ caseId: 'c1', baselineVector: vec(1) }] };
    writeJson(file, data);
    const roundtripped = readQueriesFile(file);
    expect(roundtripped).toEqual(data);
  });

  it('returns null for a missing queries file (first run)', () => {
    expect(readQueriesFile('/nonexistent/discovery.queries.v1.json')).toBeNull();
  });
});
