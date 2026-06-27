/**
 * Health route readiness tests.
 *
 * Guards the fix where /health returns 503 (not a phantom 200) while Mongo is
 * unreachable, so the Docker HEALTHCHECK / Coolify reflect real readiness.
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/health.test.ts --verbose
 */

describe('GET /health readiness', () => {
  beforeAll(() => {
    // buildApp() pulls in config which requires MONGODB_URI. We never connect here,
    // so any syntactically valid URI works — the connection stays at readyState 0.
    process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  });

  it('returns 503 + degraded when Mongo is not connected', async () => {
    // require after env is set so config parses cleanly.
    const { buildApp } = require('../index');
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.status).toBe('degraded');
      expect(body.service).toBe('@thearchitect/compliance-crawler');
      expect(body.mongo.connected).toBe(false);
      expect(body.mongo.readyState).toBe(0);
    } finally {
      await app.close();
    }
  });
});
