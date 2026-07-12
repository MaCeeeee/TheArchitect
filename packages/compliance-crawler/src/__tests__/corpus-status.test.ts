/**
 * GET /corpus/status tests — REQ-LAWOPS-001.1 / THE-468.
 *
 * Guards the Mongo↔Qdrant per-source drift detector that would have caught the DORA
 * silent-embed gap (Mongo 6, Qdrant 0) in one call instead of an SSH archaeology dig.
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/corpus-status.test.ts --verbose
 */
// config.ts parses process.env at import time — set required vars BEFORE the first
// require that transitively loads it (corpus-status → config). ES imports are hoisted,
// so we require() explicitly here to guarantee ordering.
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant.test:6333';

import type { MongoSourceFacts } from '../routes/corpus-status';
const { buildCorpusStatus }: typeof import('../routes/corpus-status') = require('../routes/corpus-status');

const facts = (over: Partial<MongoSourceFacts> & { source: string }): MongoSourceFacts => ({
  mongoCount: 0,
  mongoEmbedded: 0,
  lastCrawledAt: null,
  ...over,
});

describe('buildCorpusStatus() — drift/healthy logic (THE-468)', () => {
  it('all sources aligned → healthy, drift 0, totals summed (AC-5a)', () => {
    const status = buildCorpusStatus({
      collection: 'regulations-corpus',
      mongo: [
        facts({ source: 'dora', mongoCount: 6, mongoEmbedded: 6 }),
        facts({ source: 'nis2', mongoCount: 5, mongoEmbedded: 5 }),
      ],
      qdrant: new Map([
        ['dora', 6],
        ['nis2', 5],
      ]),
    });

    expect(status.healthy).toBe(true);
    expect(status.totals).toEqual({ mongo: 11, qdrant: 11, drift: 0 });
    expect(status.sources.every((s) => s.drift === 0)).toBe(true);
    // sorted by source
    expect(status.sources.map((s) => s.source)).toEqual(['dora', 'nis2']);
  });

  it('a source with mongo > qdrant → drift > 0, unhealthy, names the drifting source (AC-3, AC-5b)', () => {
    // The exact DORA shape: 6 in Mongo, 0 in Qdrant.
    const status = buildCorpusStatus({
      collection: 'regulations-corpus',
      mongo: [
        facts({ source: 'dora', mongoCount: 6, mongoEmbedded: 0 }),
        facts({ source: 'nis2', mongoCount: 5, mongoEmbedded: 5 }),
      ],
      qdrant: new Map([
        ['dora', 0],
        ['nis2', 5],
      ]),
    });

    expect(status.healthy).toBe(false);
    const dora = status.sources.find((s) => s.source === 'dora')!;
    expect(dora.drift).toBe(6);
    expect(dora.qdrantCount).toBe(0);
    expect(status.totals.drift).toBe(6);
  });

  it('Qdrant unreachable (null) → qdrantCount/drift null, unhealthy, totals.qdrant null (AC-6)', () => {
    const status = buildCorpusStatus({
      collection: 'regulations-corpus',
      mongo: [facts({ source: 'dora', mongoCount: 6, mongoEmbedded: 6 })],
      qdrant: null,
    });

    expect(status.qdrantReachable).toBe(false);
    expect(status.healthy).toBe(false);
    expect(status.sources[0].qdrantCount).toBeNull();
    expect(status.sources[0].drift).toBeNull();
    expect(status.totals.qdrant).toBeNull();
    expect(status.totals.drift).toBeNull();
  });

  it('orphan vectors in Qdrant but not Mongo → negative drift, unhealthy', () => {
    const status = buildCorpusStatus({
      collection: 'regulations-corpus',
      mongo: [facts({ source: 'dora', mongoCount: 6, mongoEmbedded: 6 })],
      qdrant: new Map([
        ['dora', 6],
        ['ghost', 3], // present in Qdrant, gone from Mongo
      ]),
    });

    expect(status.healthy).toBe(false);
    const ghost = status.sources.find((s) => s.source === 'ghost')!;
    expect(ghost.mongoCount).toBe(0);
    expect(ghost.qdrantCount).toBe(3);
    expect(ghost.drift).toBe(-3);
  });

  it('serialises lastCrawledAt as ISO string', () => {
    const status = buildCorpusStatus({
      collection: 'regulations-corpus',
      mongo: [facts({ source: 'dora', mongoCount: 6, mongoEmbedded: 6, lastCrawledAt: new Date('2026-07-12T08:00:00.000Z') })],
      qdrant: new Map([['dora', 6]]),
    });
    expect(status.sources[0].lastCrawledAt).toBe('2026-07-12T08:00:00.000Z');
  });
});

describe('GET /corpus/status route (THE-468 AC-1, AC-4)', () => {
  beforeAll(() => {
    process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
    process.env.QDRANT_URL = 'http://qdrant.test:6333';
  });

  it('returns 200 + per-source status, no auth token required', async () => {
    jest.resetModules();
    jest.doMock('../embeddings/qdrant', () => {
      const actual = jest.requireActual('../embeddings/qdrant');
      const counts: Record<string, number> = { dora: 6, nis2: 5 };
      return {
        ...actual,
        getQdrantClient: () => ({}),
        countPointsBySource: async (_client: unknown, source: string) => counts[source] ?? 0,
      };
    });

    const { Regulation } = require('../db/regulation.model');
    jest.spyOn(Regulation, 'aggregate').mockResolvedValue([
      { _id: 'dora', mongoCount: 6, mongoEmbedded: 6, lastCrawledAt: new Date('2026-07-12T00:00:00.000Z') },
      { _id: 'nis2', mongoCount: 5, mongoEmbedded: 5, lastCrawledAt: new Date('2026-07-01T00:00:00.000Z') },
    ] as never);

    const { buildApp } = require('../index');
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/corpus/status' }); // no X-Crawler-Token

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.collection).toBe('regulations-corpus');
      expect(body.healthy).toBe(true);
      expect(body.totals).toEqual({ mongo: 11, qdrant: 11, drift: 0 });
      const dora = body.sources.find((s: { source: string }) => s.source === 'dora');
      expect(dora).toMatchObject({ mongoCount: 6, qdrantCount: 6, drift: 0, mongoEmbedded: 6 });
    } finally {
      await app.close();
      jest.dontMock('../embeddings/qdrant');
    }
  });
});
