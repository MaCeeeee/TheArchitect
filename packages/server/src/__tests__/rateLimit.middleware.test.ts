/**
 * rateLimit — counts per key in a named window; the key is the IP unless the caller gives one
 * (UC-METH-002: the ladder limiter counts per user).
 * Run: cd packages/server && npx jest src/__tests__/rateLimit.middleware.test.ts --forceExit
 */
import express, { type Request } from 'express';
import request from 'supertest';
import { rateLimit } from '../middleware/rateLimit.middleware';

const originalEnv = process.env.NODE_ENV;
beforeAll(() => { process.env.NODE_ENV = 'production'; }); // the limit is raised outside production
afterAll(() => { process.env.NODE_ENV = originalEnv; });

let counter = 0;
const uniqueName = () => `rate-limit-test-${++counter}`;

function app(limiter: express.RequestHandler) {
  const a = express();
  // Test identity from a header, as the authenticate middleware would set req.user.
  a.use((req, _res, next) => {
    const user = req.header('x-test-user');
    if (user) (req as unknown as { user: { _id: string } }).user = { _id: user };
    next();
  });
  a.get('/x', limiter, (_req, res) => { res.json({ ok: true }); });
  return a;
}

describe('rateLimit', () => {
  test('default key is the IP: two users on one IP share the limit', async () => {
    const a = app(rateLimit({ name: uniqueName(), windowMs: 60_000, max: 2 }));
    expect((await request(a).get('/x').set('x-test-user', 'u1')).status).toBe(200);
    expect((await request(a).get('/x').set('x-test-user', 'u2')).status).toBe(200);
    expect((await request(a).get('/x').set('x-test-user', 'u1')).status).toBe(429);
  });

  test('with a key function each user has the limit for itself', async () => {
    const key = (req: Request) => String((req as unknown as { user?: { _id: string } }).user?._id ?? req.ip);
    const a = app(rateLimit({ name: uniqueName(), windowMs: 60_000, max: 2, key }));
    expect((await request(a).get('/x').set('x-test-user', 'u1')).status).toBe(200);
    expect((await request(a).get('/x').set('x-test-user', 'u1')).status).toBe(200);
    expect((await request(a).get('/x').set('x-test-user', 'u1')).status).toBe(429);
    expect((await request(a).get('/x').set('x-test-user', 'u2')).status).toBe(200);
  });
});
