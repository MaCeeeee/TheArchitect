/**
 * THE-533 — Router-weite Limiter dürfen nicht auf fremde Routen durchschlagen.
 *
 * Befund (Prod, 2026-07-29): `ai.routes.ts` setzte seinen 50-pro-24h-Limiter als
 * `router.use(rateLimit(...))`. Der Router hängt auf `/api/projects`; alles, was
 * DANACH auf denselben Pfad gemountet ist (regulations, compliance, requirements,
 * norms, report, rag, register …), fiel durch diese Kette hindurch und zählte
 * gegen das KI-Chat-Kontingent. Nach 50 beliebigen Requests war der halbe
 * Compliance-Bereich 24 h lang mit 429 dicht — ohne dass je der KI-Chat benutzt
 * wurde.
 *
 * Diese Tests pinnen beide Richtungen: der Limiter greift auf dem KI-Pfad, und er
 * greift NICHT auf einem später gemounteten Nachbarpfad.
 */

// Der Limiter liest NODE_ENV beim Import (isDev → max 10000). Für den Test muss
// das Prod-Kontingent (50) gelten, also VOR dem Router-Import setzen.
const PREV_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

import express, { type Express } from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/requireVerifiedEmail.middleware', () => ({
  requireVerifiedEmail: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  PERMISSIONS: {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const aiRouter = require('../routes/ai.routes').default;

afterAll(() => {
  process.env.NODE_ENV = PREV_ENV;
});

/**
 * Bildet die Mount-Reihenfolge aus index.ts nach: der KI-Router zuerst, danach
 * ein stellvertretender „späterer" Router auf demselben Pfad (wie regulations,
 * compliance, requirements …).
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', aiRouter);

  const later = express.Router();
  later.get('/:projectId/regulations', (_req, res) => res.json({ success: true }));
  app.use('/api/projects', later);
  return app;
}

describe('THE-533 — Limiter-Reichweite von ai.routes', () => {
  it('zählt Requests auf einen später gemounteten Nachbarpfad NICHT gegen das KI-Kontingent', async () => {
    const app = buildApp();
    // Deutlich über dem Prod-Kontingent von 50: vor dem Fix wäre ab dem 51.
    // Request 429 gekommen, obwohl /regulations mit dem KI-Chat nichts zu tun hat.
    for (let i = 0; i < 60; i++) {
      const res = await request(app).get('/api/projects/p1/regulations');
      expect(res.status).toBe(200);
    }
  });

  it('greift weiterhin auf dem KI-Pfad selbst', async () => {
    const app = buildApp();
    let sawLimit = false;
    // Ohne konfigurierten Anbieter antwortet die Route mit 503 — der Limiter
    // läuft davor, also ist 429 nach Überschreiten des Kontingents sichtbar.
    for (let i = 0; i < 60; i++) {
      const res = await request(app).post('/api/projects/p1/ai/chat').send({ messages: [{ role: 'user', content: 'x' }] });
      if (res.status === 429) { sawLimit = true; break; }
    }
    expect(sawLimit).toBe(true);
  });
});
