/**
 * GET /api/regulations/corpus/relations — Server-A-Leseproxy auf die
 * Cross-Norm-Kanten-Vorschläge (THE-433, Slice 1, Task 6).
 *
 * Server A ist am Korpus RO-User (THE-440): dieser Endpunkt LIEST nur. Jede
 * Entscheidung (confirm/reject) läuft über den Crawler, der den Schreibzugriff
 * hat. Zwei Dinge werden hier festgenagelt:
 *  1. Filter werden durchgereicht und die Zeilen sehen aus wie beim Crawler
 *     (gemeinsame Quelle: @thearchitect/shared selectRelationSuggestions).
 *  2. Ist der Korpus nicht erreichbar/konfiguriert, degradiert der Endpunkt
 *     weich mit klarer Meldung — kein 500-Absturz, der wie ein App-Bug aussieht.
 *
 * Run: cd packages/server && npx jest src/__tests__/corpus-relations.route.test.ts --forceExit
 */
import express, { type Express } from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

import regulationsRoutes from '../routes/regulations.routes';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const URL = '/api/regulations/corpus/relations';

const suggestion = (over: Record<string, unknown> = {}) => ({
  targetRegulationKey: 'nis2:art-4',
  targetVersionHash: 'tgt',
  sourceVersionHash: 'src',
  relationType: 'PREVAILS_OVER',
  direction: 'a-to-b',
  evidence: { matched: 'Article 4 of Directive (EU) 2022/2555', articleHints: ['art-4'] },
  promptVersion: 'rp-2',
  model: 'claude-haiku-4-5-20251001',
  suggestedAt: '2026-07-25T10:00:00.000Z',
  status: 'suggested',
  ...over,
});

const ROWS = [
  {
    regulationKey: 'dora:art-1',
    versionHash: 'h1',
    version: 1,
    source: 'dora',
    paragraphNumber: 'Art. 1',
    title: 'Subject matter',
    relationSuggestions: [suggestion(), suggestion({ targetRegulationKey: 'dsgvo:art-32', status: 'confirmed' })],
  },
  {
    regulationKey: 'cra-en:art-3',
    versionHash: 'h2',
    version: 1,
    source: 'cra-en',
    paragraphNumber: 'Art. 3',
    title: 'Definitions',
    relationSuggestions: [suggestion({ targetRegulationKey: 'nis2:art-12', relationType: 'INTERPRETS' })],
  },
  // Ohne Vorschläge — darf nie in der Liste auftauchen.
  { regulationKey: 'lksg:p-3', versionHash: 'h3', version: 1, source: 'lksg', paragraphNumber: '§ 3', title: 'x' },
];

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', regulationsRoutes);
  return app;
}

describe('GET /api/regulations/corpus/relations (THE-433 Task 6)', () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.CORPUS_MONGODB_URI = 'mongodb://fake-corpus/db';
    __setCorpusForTests(makeFakeCorpus(ROWS as never));
  });

  afterEach(() => {
    __setCorpusForTests(null);
    delete process.env.CORPUS_MONGODB_URI;
  });

  it('liefert die Vorschlags-Zeilen inkl. Ziel, Typ, Richtung und Provenance', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.total).toBe(3);
    const row = res.body.items.find(
      (i: any) => i.regulationKey === 'dora:art-1' && i.suggestion.targetRegulationKey === 'nis2:art-4'
    );
    expect(row).toMatchObject({ source: 'dora', paragraphNumber: 'Art. 1', title: 'Subject matter' });
    expect(row.suggestion).toMatchObject({
      relationType: 'PREVAILS_OVER',
      direction: 'a-to-b',
      status: 'suggested',
      promptVersion: 'rp-2',
    });
  });

  it('reicht die Filter durch (status, targetSource, source, Pagination)', async () => {
    const byStatus = await request(app).get(`${URL}?status=confirmed`);
    expect(byStatus.body.total).toBe(1);
    expect(byStatus.body.items[0].suggestion.targetRegulationKey).toBe('dsgvo:art-32');

    const byTarget = await request(app).get(`${URL}?targetSource=nis2`);
    expect(byTarget.body.total).toBe(2);

    const bySource = await request(app).get(`${URL}?source=cra-en`);
    expect(bySource.body.total).toBe(1);
    expect(bySource.body.items[0].regulationKey).toBe('cra-en:art-3');

    const paged = await request(app).get(`${URL}?limit=1&offset=1`);
    expect(paged.body.total).toBe(3);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.limit).toBe(1);
    expect(paged.body.offset).toBe(1);
  });

  it('weist ungültige Query-Parameter mit 400 ab (nie stillschweigend ignorieren)', async () => {
    const res = await request(app).get(`${URL}?status=bogus`);
    expect(res.status).toBe(400);
  });

  it('Korpus nicht konfiguriert → 503 mit klarer Meldung, kein 500', async () => {
    delete process.env.CORPUS_MONGODB_URI;
    const res = await request(app).get(URL);
    expect(res.status).toBe(503);
    expect(res.body.available).toBe(false);
    expect(String(res.body.error)).toMatch(/corpus/i);
  });

  it('Korpus unerreichbar (Read wirft) → 503 mit klarer Meldung, kein 500', async () => {
    __setCorpusForTests({
      find: () => {
        throw new Error('corpus down');
      },
    } as never);
    const res = await request(app).get(URL);
    expect(res.status).toBe(503);
    expect(res.body.available).toBe(false);
    expect(String(res.body.error)).toBeTruthy();
  });
});
