/**
 * governedRetrieval unit tests (THE-422 / UC-CTXGOV-001 Read-Side, Chunk 1).
 *
 * Structured corpus read: eligibility (non-stale) + version-pin (served from Mongo).
 * Uses the in-memory corpus seam (`__setCorpusForTests` + `makeFakeCorpus`).
 * Corpus keys are `source:paragraph` with a COLON (buildRegulationKey emits e.g. `gdpr:art-30`).
 */
import {
  resolveGovernedRegulations,
  getGovernedStats,
  resetGovernedStats,
} from '../services/governedRetrieval.service';
import { __setCorpusForTests, getCurrentVersionHashes } from '../services/corpusClient.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

afterEach(() => __setCorpusForTests(null));

describe('getCurrentVersionHashes — max-version-wins (was nondeterministic last-wins)', () => {
  test('returns the max version hash regardless of return order (descending)', async () => {
    __setCorpusForTests(makeFakeCorpus([
      { regulationKey: 'k1', versionHash: 'hB', version: 2 },
      { regulationKey: 'k1', versionHash: 'hA', version: 1 },
    ]));
    const map = await getCurrentVersionHashes(['k1']);
    expect(map.get('k1')).toBe('hB');
  });

  test('returns the max version hash regardless of return order (ascending)', async () => {
    __setCorpusForTests(makeFakeCorpus([
      { regulationKey: 'k1', versionHash: 'hA', version: 1 },
      { regulationKey: 'k1', versionHash: 'hB', version: 2 },
    ]));
    const map = await getCurrentVersionHashes(['k1']);
    expect(map.get('k1')).toBe('hB');
  });
});

describe('resolveGovernedRegulations — pin + eligibility (Chunk 1)', () => {
  beforeEach(() => {
    resetGovernedStats();
    __setCorpusForTests(makeFakeCorpus([
      { regulationKey: 'gdpr:art-30', versionHash: 'h1', version: 1, fullText: 'OLD' },
      { regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 2, fullText: 'NEW' },
    ]));
  });

  test('eligibleOnly (default) returns only the current version', async () => {
    const out = await resolveGovernedRegulations({ keys: ['gdpr:art-30'] });
    expect(out).toHaveLength(1);
    expect(out[0].versionHash).toBe('h2');
    expect(out[0].fullText).toBe('NEW');
  });

  test('explicit pin serves the exact pinned version from Mongo (AC-3)', async () => {
    const out = await resolveGovernedRegulations({
      keys: ['gdpr:art-30'],
      pin: { 'gdpr:art-30': 'h1' },
    });
    expect(out[0].versionHash).toBe('h1');
    expect(out[0].fullText).toBe('OLD');
    expect(getGovernedStats().pinnedServed).toBe(1);
  });

  test('pin to a vanished version drops it + counts staleDropped', async () => {
    const out = await resolveGovernedRegulations({
      keys: ['gdpr:art-30'],
      pin: { 'gdpr:art-30': 'GONE' },
    });
    expect(out).toHaveLength(0);
    expect(getGovernedStats().staleDropped).toBe(1);
  });
});
