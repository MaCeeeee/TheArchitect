/**
 * Security-Audit H7: ausgehende Requests an NUTZERGEWÄHLTE Adressen
 * (Connectors, Connection-Discovery, n8n-Import).
 *
 * Vorher gab es keinerlei SSRF-Schutz: jede gespeicherte `baseUrl` wurde
 * angewählt, Redirects gefolgt, der Body zurückgespiegelt — Ziel konnten die
 * Cloud-Metadaten, Redis/Mongo/Neo4j im Docker-Netz oder das Tailnet sein.
 *
 * `safeFetch` ist ein schmaler `fetch`-Ersatz:
 *  - nur http/https;
 *  - die Zieladresse wird beim VERBINDEN geprüft (eigener `lookup`), nicht
 *    vorher — sonst löst ein Angreifer-DNS erst öffentlich, dann intern auf
 *    (DNS-Rebinding);
 *  - Redirects werden nicht automatisch gefolgt, sondern einzeln neu geprüft;
 *  - Antwortgröße begrenzt.
 * Für Self-Hosting gibt `CONNECTOR_PRIVATE_HOST_ALLOWLIST` (kommagetrennte
 * Hostnamen) bewusst freigegebene interne Ziele frei.
 *
 * Vom Server konfigurierte Ziele (Sidecars, Korpus, LLM) gehen NICHT hierüber.
 */
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import zlib from 'zlib';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
  // Kein ::ffff:0:0/96 hier: BlockList vergleicht IPv4 intern als
  // IPv4-mapped — die Regel sperrte sonst JEDE IPv4. Mapped-Adressen
  // behandelt isBlockedAddress selbst.
  ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(addr, prefix, 'ipv6');
}

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`Blocked outbound request: ${reason}`);
    this.name = 'SsrfBlockedError';
  }
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) {
    if (/^(0{0,4}:){0,5}:?ffff:/i.test(address)) return true; // IPv4-mapped: nie legitim als Connector-Ziel
    return BLOCKED.check(address, 'ipv6');
  }
  return true;
}

function allowlistedHosts(): Set<string> {
  return new Set(
    (process.env.CONNECTOR_PRIVATE_HOST_ALLOWLIST ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function bareHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** Protokoll und IP-Literal prüfen — synchron, ohne DNS. */
function assertUrlShape(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`protocol ${url.protocol} is not allowed`);
  }
  const host = bareHostname(url);
  if (allowlistedHosts().has(host)) return;
  if (net.isIP(host) && isBlockedAddress(host)) throw new SsrfBlockedError(`address ${host} is not public`);
}

/**
 * Für Formulare/Konfiguration: wirft, wenn die URL kein öffentliches
 * http(s)-Ziel ist. Löst DNS auf (die eigentliche Absicherung passiert
 * trotzdem erst beim Verbinden in `safeFetch`).
 */
export async function assertPublicHttpUrl(raw: unknown): Promise<URL> {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new SsrfBlockedError('not a valid URL');
  }
  assertUrlShape(url);
  const host = bareHostname(url);
  if (allowlistedHosts().has(host) || net.isIP(host)) return url;
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new SsrfBlockedError(`host ${host} does not resolve`);
  }
  if (addresses.some((a) => isBlockedAddress(a.address))) throw new SsrfBlockedError(`host ${host} is not public`);
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  dns.lookup(host, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as dns.LookupAddress[];
    if (!allowlistedHosts().has(host) && list.some((a) => isBlockedAddress(a.address))) {
      return callback(new SsrfBlockedError(`host ${host} resolves to a non-public address`), '');
    }
    if (options.all) return callback(null, list);
    const first = list[0];
    if (!first) return callback(new SsrfBlockedError(`host ${host} does not resolve`), '');
    callback(null, first.address, first.family);
  });
}

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string> | Headers | Array<[string, string]>;
  body?: string | Buffer | URLSearchParams | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface RawResponse {
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function decode(body: Buffer, encoding: string | undefined): Buffer {
  const opts = { maxOutputLength: MAX_RESPONSE_BYTES };
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.gunzipSync(body, opts);
    case 'deflate':
      return zlib.inflateSync(body, opts);
    case 'br':
      return zlib.brotliDecompressSync(body, opts);
    default:
      return body;
  }
}

function send(url: URL, method: string, headers: Record<string, string>, body: Buffer | undefined, signal: AbortSignal): Promise<RawResponse> {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      { method, headers, signal, lookup: guardedLookup as unknown as typeof dns.lookup, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            res.destroy(new SsrfBlockedError('response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? '', headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Bei einem Redirect auf einen anderen Origin gehen nur unkritische Header
// mit — Connectors tragen Zugangsdaten auch in eigenen Headern
// (PRIVATE-TOKEN, X-N8N-API-KEY, xc-token …).
const CROSS_ORIGIN_SAFE_HEADERS = new Set(['accept', 'accept-encoding', 'accept-language', 'user-agent', 'content-type']);

/** `fetch`-Ersatz für nutzergewählte Ziele — siehe Kopfkommentar. */
export async function safeFetch(input: string | URL, init: SafeFetchInit = {}): Promise<Response> {
  let url = new URL(String(input));
  let method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init.headers as ConstructorParameters<typeof Headers>[0]).forEach((value, key) => {
    headers[key] = value;
  });
  headers['accept-encoding'] = 'gzip, deflate, br';
  let body: Buffer | undefined;
  if (init.body instanceof URLSearchParams) {
    body = Buffer.from(init.body.toString());
    headers['content-type'] ??= 'application/x-www-form-urlencoded;charset=UTF-8';
  } else if (typeof init.body === 'string') {
    body = Buffer.from(init.body);
  } else if (init.body) {
    body = init.body;
  }

  const timeout = AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertUrlShape(url);
    if (body) headers['content-length'] = String(body.length);
    else delete headers['content-length'];

    const raw = await send(url, method, headers, body, signal);
    const location = raw.headers.location;
    if ([301, 302, 303, 307, 308].includes(raw.status) && location) {
      const next = new URL(location, url);
      if (next.origin !== url.origin) {
        for (const h of Object.keys(headers)) if (!CROSS_ORIGIN_SAFE_HEADERS.has(h)) delete headers[h];
      }
      if (raw.status === 303 || ((raw.status === 301 || raw.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
        delete headers['content-type'];
      }
      url = next;
      continue;
    }

    const encoding = raw.headers['content-encoding'];
    const decoded = decode(raw.body, Array.isArray(encoding) ? encoding[0] : encoding);
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(raw.headers)) {
      if (value === undefined || key === 'content-encoding' || key === 'content-length') continue;
      for (const v of Array.isArray(value) ? value : [value]) responseHeaders.append(key, v);
    }
    const noBody = [101, 204, 205, 304].includes(raw.status);
    return new Response(noBody ? null : decoded, { status: raw.status, statusText: raw.statusText, headers: responseHeaders });
  }
  throw new SsrfBlockedError('too many redirects');
}
