/**
 * Security-Audit H7 — `safeFetch` im Einzelnen: Adressprüfung beim Verbinden
 * (DNS-Namen, nicht nur IP-Literale), jeder Redirect neu geprüft, Allowlist
 * für bewusst freigegebene interne Hosts, sonst verhält es sich wie fetch.
 */
import http from 'http';
import zlib from 'zlib';
import { isBlockedAddress, safeFetch, SsrfBlockedError } from '../utils/safeFetch';

let server: http.Server;
let port = 0;
const seen: Array<{ url: string; auth?: string; contentType?: string; body: string }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ url: req.url ?? '', auth: req.headers.authorization, contentType: req.headers['content-type'], body });
      if (req.url === '/json') {
        res.setHeader('content-type', 'application/json');
        res.setHeader('x-probe', 'yes');
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.url === '/gzip') {
        res.setHeader('content-encoding', 'gzip');
        return res.end(zlib.gzipSync(JSON.stringify({ zipped: true })));
      }
      if (req.url === '/to-metadata') {
        res.statusCode = 302;
        res.setHeader('location', 'http://169.254.169.254/latest/meta-data');
        return res.end();
      }
      if (req.url === '/to-ip') {
        res.statusCode = 307;
        res.setHeader('location', `http://127.0.0.1:${port}/json`);
        return res.end();
      }
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  seen.length = 0;
  delete process.env.CONNECTOR_PRIVATE_HOST_ALLOWLIST;
});

describe('isBlockedAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.4', '192.168.1.1', '169.254.169.254', '100.106.223.83', '0.0.0.0',
    '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fd00::1', 'fe80::1'])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '140.82.112.3', '2606:4700::1111'])('allows public %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('safeFetch (Security-Audit H7)', () => {
  it('blocks a hostname that RESOLVES to loopback — Prüfung beim Verbinden, nicht nur IP-Literale', async () => {
    await expect(safeFetch(`http://localhost:${port}/json`)).rejects.toThrow(SsrfBlockedError);
    expect(seen).toHaveLength(0);
  });

  it('blocks non-http protocols', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(SsrfBlockedError);
  });

  it('re-checks every redirect target', async () => {
    process.env.CONNECTOR_PRIVATE_HOST_ALLOWLIST = 'localhost';
    await expect(safeFetch(`http://localhost:${port}/to-metadata`)).rejects.toThrow(SsrfBlockedError);
    expect(seen.map((s) => s.url)).toEqual(['/to-metadata']);
  });

  it('a redirect from an allowlisted host to a non-allowlisted internal IP is blocked', async () => {
    process.env.CONNECTOR_PRIVATE_HOST_ALLOWLIST = 'localhost';
    await expect(safeFetch(`http://localhost:${port}/to-ip`)).rejects.toThrow(SsrfBlockedError);
    expect(seen.map((s) => s.url)).toEqual(['/to-ip']);
  });

  it('drops credentials when a redirect changes origin', async () => {
    process.env.CONNECTOR_PRIVATE_HOST_ALLOWLIST = 'localhost,127.0.0.1';
    const res = await safeFetch(`http://localhost:${port}/to-ip`, { headers: { Authorization: 'Bearer s3cret' } });
    expect(res.status).toBe(200);
    expect(seen[0].auth).toBe('Bearer s3cret');
    expect(seen[1].auth).toBeUndefined();
  });

  it('behaves like fetch for an allowlisted host: status, headers, json, gzip, form bodies', async () => {
    process.env.CONNECTOR_PRIVATE_HOST_ALLOWLIST = 'localhost';
    const res = await safeFetch(`http://localhost:${port}/json`);
    expect(res.ok).toBe(true);
    expect(res.headers.get('x-probe')).toBe('yes');
    expect(await res.json()).toEqual({ ok: true });

    const zipped = await safeFetch(`http://localhost:${port}/gzip`);
    expect(await zipped.json()).toEqual({ zipped: true });

    const missing = await safeFetch(`http://localhost:${port}/nope`);
    expect(missing.status).toBe(404);
    expect(missing.ok).toBe(false);

    await safeFetch(`http://localhost:${port}/json`, { method: 'POST', body: new URLSearchParams({ grant_type: 'x' }) });
    const post = seen.at(-1)!;
    expect(post.body).toBe('grant_type=x');
    expect(post.contentType).toContain('application/x-www-form-urlencoded');
  });
});
