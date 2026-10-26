/**
 * Security-Audit H6: `POST /api/demo/create` (und `/create-bsh`) schrieben als
 * Nebenwirkung `role: 'enterprise_architect'` auf den Aufrufer — ohne
 * Audit-Eintrag. Eine eingeschränkte Rolle hob sich so selbst an, und ein
 * chief_architect (Plattform-Admin) verlor beim Anlegen einer Demo seine
 * Admin-Rolle. Ein Demo-Projekt darf die Rolle nie berühren.
 */
import express from 'express';
import request from 'supertest';

const mockUserUpdate = jest.fn(async () => null);

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 'u-1', _id: 'u-1', role: 'business_architect' };
    next();
  },
}));
jest.mock('../models/User', () => ({ User: { findByIdAndUpdate: mockUserUpdate } }));
jest.mock('../models/Project', () => ({
  Project: { findOne: jest.fn(async () => null), create: jest.fn(async () => ({ _id: { toString: () => 'p-demo' } })) },
}));
jest.mock('../models/Standard', () => ({ Standard: { create: jest.fn(async () => ({ _id: 's-1' })) } }));
jest.mock('../models/Policy', () => ({ Policy: { create: jest.fn(async () => ({ _id: 'pol-1' })) } }));
jest.mock('../models/SimulationRun', () => ({ SimulationRun: { create: jest.fn(async () => ({ _id: 'run-1' })) } }));
jest.mock('../config/neo4j', () => ({ runCypher: jest.fn(async () => []) }));

import demoRoutes from '../routes/demo.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/demo', demoRoutes);
  return app;
}

describe('demo seeding — keine Rollenänderung (Security-Audit H6)', () => {
  beforeEach(() => mockUserUpdate.mockClear());

  it.each(['/api/demo/create', '/api/demo/create-bsh'])('%s never rewrites the caller’s role', async (url) => {
    const res = await request(makeApp()).post(url).send({});
    expect(res.status).toBeLessThan(500);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
