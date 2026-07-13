/**
 * THE-471 — Data-Server transport: empty 2xx body handling.
 *
 * Regression for the silent-context-loss bug: a 200 with an empty body
 * (n8n "Respond to Webhook" returns an empty body for a 0-item result) made
 * `res.json()` throw (SyntaxError: Unexpected end of JSON input), which both
 * `queryDocuments` and `ingestDocument` propagated. The 4 RAG generators
 * caught it and continued *without context*, unable to tell "0 hits" from a
 * transport error.
 *
 * Contract now:
 *   - queryDocuments: empty 2xx body → { chunks: [] } (no throw)
 *   - ingestDocument: empty 2xx body → throw (empty is a real failure there)
 *   - either: non-empty invalid JSON → throw with context
 *   - either: normal JSON body → parsed unchanged
 *
 * Run: cd packages/server && npx jest src/__tests__/dataServer.service.test.ts --forceExit
 */

// Env is read at module-load time (module-level consts), so set it before require().
process.env.DATA_SERVER_URL = 'https://data.test.local';
process.env.DATA_SERVER_SHARED_SECRET = 'test-secret';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dataServer = require('../services/dataServer.service') as typeof import('../services/dataServer.service');
const { queryDocuments, ingestDocument } = dataServer;

// Minimal Response-like stub — enough for postJson (ok/status/text/json).
function makeRes(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => {
      if (body.trim() === '') throw new SyntaxError('Unexpected end of JSON input');
      return JSON.parse(body);
    },
  } as unknown as Response;
}

const mockFetch = jest.fn<Promise<Response>, [string, RequestInit]>();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('queryDocuments — empty 2xx body (THE-471)', () => {
  it('returns { chunks: [] } for an empty 200 body instead of throwing', async () => {
    mockFetch.mockResolvedValueOnce(makeRes('', 200));
    await expect(queryDocuments({ projectId: 'p1', text: 'gdpr' })).resolves.toEqual({ chunks: [] });
  });

  it('treats a whitespace-only body as empty', async () => {
    mockFetch.mockResolvedValueOnce(makeRes('   \n', 200));
    await expect(queryDocuments({ projectId: 'p1', text: 'gdpr' })).resolves.toEqual({ chunks: [] });
  });

  it('parses a normal JSON body unchanged', async () => {
    const payload = {
      chunks: [{ documentId: 'd1', chunkId: 'c1', text: 'hit', score: 0.9, metadata: {} }],
    };
    mockFetch.mockResolvedValueOnce(makeRes(JSON.stringify(payload), 200));
    await expect(queryDocuments({ projectId: 'p1', text: 'gdpr' })).resolves.toEqual(payload);
  });

  it('throws with context on a non-empty invalid JSON body', async () => {
    mockFetch.mockResolvedValueOnce(makeRes('<html>gateway timeout</html>', 200));
    await expect(queryDocuments({ projectId: 'p1', text: 'gdpr' })).rejects.toThrow(/invalid JSON/i);
  });
});

describe('ingestDocument — empty 2xx body (THE-471)', () => {
  const input = {
    projectId: 'p1',
    source: 'regulation' as const,
    filename: 'gdpr.txt',
    mimeType: 'text/plain',
    content: 'Article 5',
  };

  it('throws a descriptive error on an empty 200 body (empty is a real failure here)', async () => {
    mockFetch.mockResolvedValueOnce(makeRes('', 200));
    await expect(ingestDocument(input)).rejects.toThrow(/empty body/i);
  });

  it('parses a normal JSON body unchanged', async () => {
    const payload = { documentId: 'd1', chunkCount: 3, tokenCount: 120 };
    mockFetch.mockResolvedValueOnce(makeRes(JSON.stringify(payload), 200));
    await expect(ingestDocument(input)).resolves.toEqual(payload);
  });
});

describe('non-2xx handling is unchanged', () => {
  it('throws with status and body text on a 5xx', async () => {
    mockFetch.mockResolvedValueOnce(makeRes('upstream exploded', 502));
    await expect(queryDocuments({ projectId: 'p1', text: 'x' })).rejects.toThrow(/502/);
  });
});
