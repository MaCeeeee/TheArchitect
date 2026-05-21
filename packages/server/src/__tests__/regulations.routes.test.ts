/**
 * Regulations Routes Tests — UC-ICM-001 (THE-272)
 *
 * Tests the Server A backend endpoints that wrap the Server B Crawler service.
 * Crawler service calls are mocked via global fetch — we don't hit Server B in CI.
 *
 * Run: cd packages/server && npx jest src/__tests__/regulations.routes.test.ts --verbose
 */

import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Regulation } from '../models/Regulation';

// Stub authentication + project-access middleware before importing the route module.
// We replace them with no-ops that inject a fake `req.user`.
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { _id: new mongoose.Types.ObjectId('507f191e810c19729de860ea') };
    next();
  },
}));

jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: jest.fn().mockResolvedValue(undefined),
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

// Import the routes AFTER the mocks are registered
import regulationsRoutes from '../routes/regulations.routes';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_PROJECT_ID = '507f1f77bcf86cd799439099';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', regulationsRoutes);
  app.use('/api/projects', regulationsRoutes);
  return app;
}

describe('Regulations Routes (UC-ICM-001 / THE-272)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Regulation.ensureIndexes();
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
    fetchSpy.mockRestore();
  });

  // ────────────────────────────────────────────────────────
  // GET /api/projects/:projectId/regulations
  // ────────────────────────────────────────────────────────
  describe('GET /:projectId/regulations', () => {
    async function seed(): Promise<void> {
      const base = {
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        title: 'T',
        fullText:
          'Long enough fullText to pass the fifty-character validation requirement.',
        sourceUrl: 'https://example.org',
        effectiveFrom: new Date('2024-01-01'),
      };
      await Regulation.create([
        { ...base, source: 'nis2', jurisdiction: 'EU', paragraphNumber: 'Art. 21', language: 'en' },
        { ...base, source: 'lksg', jurisdiction: 'DE', paragraphNumber: '§ 3', language: 'de' },
        { ...base, source: 'dsgvo', jurisdiction: 'EU', paragraphNumber: 'Art. 32', language: 'de' },
      ]);
      // One for another project — must NOT appear in results
      await Regulation.create({
        ...base,
        projectId: new mongoose.Types.ObjectId(OTHER_PROJECT_ID),
        source: 'nis2',
        jurisdiction: 'EU',
        paragraphNumber: 'Art. 99',
        language: 'en',
      });
    }

    it('lists regulations for the project (no source filter)', async () => {
      await seed();
      const res = await request(app).get(`/api/projects/${PROJECT_ID}/regulations`);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.items).toHaveLength(3);
    });

    it('filters by source', async () => {
      await seed();
      const res = await request(app).get(`/api/projects/${PROJECT_ID}/regulations?source=lksg`);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].source).toBe('lksg');
    });

    it('isolates by projectId — other project items not visible', async () => {
      await seed();
      const res = await request(app).get(`/api/projects/${PROJECT_ID}/regulations`);
      const numbers = res.body.data.items.map((r: any) => r.paragraphNumber);
      expect(numbers).not.toContain('Art. 99');
    });

    it('excludes embedding field from list response (size optimization)', async () => {
      await seed();
      const res = await request(app).get(`/api/projects/${PROJECT_ID}/regulations`);
      for (const item of res.body.data.items) {
        expect(item.embedding).toBeUndefined();
      }
    });

    it('returns 400 for invalid projectId', async () => {
      const res = await request(app).get('/api/projects/not-a-valid-id/regulations');
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/projects/:projectId/regulations/:id
  // ────────────────────────────────────────────────────────
  describe('GET /:projectId/regulations/:id', () => {
    it('returns single regulation', async () => {
      const reg = await Regulation.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        source: 'nis2',
        jurisdiction: 'EU',
        paragraphNumber: 'Art. 21',
        title: 'Risk',
        fullText:
          'Long enough fullText to pass the fifty-character validation requirement for storage.',
        sourceUrl: 'https://example.org',
        effectiveFrom: new Date('2024-01-01'),
        language: 'en',
      });

      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/regulations/${reg._id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Risk');
    });

    it('returns 404 when not in this project (tenant-isolation)', async () => {
      const reg = await Regulation.create({
        projectId: new mongoose.Types.ObjectId(OTHER_PROJECT_ID),
        source: 'nis2',
        jurisdiction: 'EU',
        paragraphNumber: 'Art. 21',
        title: 'X',
        fullText:
          'Long enough fullText to pass the fifty-character validation requirement.',
        sourceUrl: 'https://example.org',
        effectiveFrom: new Date('2024-01-01'),
        language: 'en',
      });
      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/regulations/${reg._id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /api/projects/:projectId/regulations/crawl
  // ────────────────────────────────────────────────────────
  describe('POST /:projectId/regulations/crawl', () => {
    it('proxies to Server B and returns combined result', async () => {
      const fakeCrawlResponse = {
        results: [
          { source: 'nis2', inserted: 5, updated: 0, embedded: 5, embedErrors: 0, skipped: 0 },
        ],
        errors: [],
        embeddingEnabled: true,
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(fakeCrawlResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/regulations/crawl`)
        .send({ sources: ['nis2'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results[0].inserted).toBe(5);

      // Verify crawler was called with right path and body
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain('/crawl');
      expect(JSON.parse((options as RequestInit).body as string)).toMatchObject({
        projectId: PROJECT_ID,
        sources: ['nis2'],
      });
    });

    it('rejects invalid source', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/regulations/crawl`)
        .send({ sources: ['bogus-source'] });
      expect(res.status).toBe(400);
    });

    it('rejects empty sources array', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/regulations/crawl`)
        .send({ sources: [] });
      expect(res.status).toBe(400);
    });

    it('returns 502 when crawler service is unreachable', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/regulations/crawl`)
        .send({ sources: ['nis2'] });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/crawler/);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /api/projects/:projectId/regulations/embed-all
  // ────────────────────────────────────────────────────────
  describe('POST /:projectId/regulations/embed-all', () => {
    it('proxies to Server B and returns result', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ total: 30, embedded: 28, failed: 2, errors: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/regulations/embed-all`)
        .send({ force: false });

      expect(res.status).toBe(200);
      expect(res.body.data.embedded).toBe(28);
    });
  });
});
