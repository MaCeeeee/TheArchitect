/**
 * WFCOMP assess route + Sentry scrub (Slice 1 / THE-360). Middleware mocked.
 * Proves the privacy boundary at the HTTP edge: no PII echoed, body scrubbed from Sentry.
 */
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../services/wfcomp/llm', () => ({ callLLM: jest.fn() }));

import wfcompRoutes from '../routes/wfcomp.routes';
import { scrubSentryEvent } from '../config/sentry';
import { callLLM } from '../services/wfcomp/llm';

const mockCallLLM = callLLM as jest.Mock;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/projects', wfcompRoutes);

const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'wfcomp', `${name}.json`), 'utf-8'));

const PII = [
  'hans.mueller@example.com',
  'Hans Müller',
  'erika.musterfrau@example.com',
  'Erika Musterfrau',
  'DE89370400440532013000',
];

describe('POST .../wfcomp/assess?infer=true (LLM mocked)', () => {
  beforeEach(() => mockCallLLM.mockReset());

  it('adds a guarded LLM suggestion (mode confirm) when the LLM is available', async () => {
    mockCallLLM.mockResolvedValue(
      JSON.stringify({
        suggestions: [{ litera: 'b', value: 'Manage newsletter subscriptions for subscribers', confidence: 0.9, rationale: 'r' }],
      }),
    );
    const res = await request(app).post('/api/projects/p1/wfcomp/assess?infer=true').send(fixture('inferrable-purpose'));
    expect(res.status).toBe(200);
    const b = res.body.data.fields.find((f: { litera: string }) => f.litera === 'b');
    expect(b.mode).toBe('confirm');
    expect(b.suggestion.value).toMatch(/newsletter/);
  });

  it('degrades to the deterministic verdict when the LLM fails (200, b stays ask)', async () => {
    mockCallLLM.mockRejectedValue(new Error('LLM down'));
    const res = await request(app).post('/api/projects/p1/wfcomp/assess?infer=true').send(fixture('inferrable-purpose'));
    expect(res.status).toBe(200);
    const b = res.body.data.fields.find((f: { litera: string }) => f.litera === 'b');
    expect(b.status).toBe('needs_attestation');
    expect(b.mode).toBe('ask');
  });
});

describe('POST /api/projects/:projectId/wfcomp/assess', () => {
  it('returns a deterministic GapReport for an in-scope workflow', async () => {
    const res = await request(app).post('/api/projects/p1/wfcomp/assess').send(fixture('pindata-leak'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.gdprScope).toBe(true);
    expect(Array.isArray(res.body.data.fields)).toBe(true);
  });

  it('returns gdprScope:false for a no-personal-data workflow', async () => {
    const res = await request(app).post('/api/projects/p1/wfcomp/assess').send(fixture('no-personal-data'));
    expect(res.status).toBe(200);
    expect(res.body.data.gdprScope).toBe(false);
  });

  it('NEVER echoes PII from the workflow in the response (boundary G1)', async () => {
    const res = await request(app).post('/api/projects/p1/wfcomp/assess').send(fixture('pindata-leak'));
    const dump = JSON.stringify(res.body);
    for (const pii of PII) expect(dump).not.toContain(pii);
  });
});

describe('scrubSentryEvent (Landmine #1)', () => {
  it('strips request.data so a captured body never reaches Sentry', () => {
    const event = {
      message: 'boom',
      request: { data: { email: 'hans.mueller@example.com', iban: 'DE89...' }, headers: { 'x-id': '1' } },
    };
    const out = scrubSentryEvent(event);
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.headers).toBeDefined(); // only the body is stripped
    expect(out.message).toBe('boom');
    expect(JSON.stringify(out)).not.toContain('hans.mueller@example.com');
  });

  it('leaves an event without a request body untouched', () => {
    expect(scrubSentryEvent({ request: {} })).toEqual({ request: {} });
    expect(scrubSentryEvent({})).toEqual({});
  });
});
