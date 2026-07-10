/**
 * Compliance Crawler service — HTTP client for the @thearchitect/compliance-crawler
 * Fastify service running on Server B (Coolify, reachable via Tailscale).
 *
 * Linear: THE-272 (UC-ICM-001), schließt AC-5 von THE-276 + AC-4 von THE-277
 */
import { log } from '../config/logger';

const CRAWLER_URL =
  process.env.COMPLIANCE_CRAWLER_URL || 'http://100.106.223.83:3100';

const CRAWLER_TIMEOUT_MS = Number(process.env.COMPLIANCE_CRAWLER_TIMEOUT_MS ?? 120_000);

export class CrawlerUnreachableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CrawlerUnreachableError';
  }
}

export interface CrawlRequest {
  /** Optional — the corpus is project-independent (ADR-0001); the crawler ignores it. */
  projectId?: string;
  /** Ontology-validated at the route/scheduler gate (THE-413). */
  sources: string[];
  skipEmbedding?: boolean;
}

export interface CrawlSourceResult {
  source: string;
  inserted: number;
  updated: number;
  embedded: number;
  embedErrors: number;
  skipped: number;
}

export interface CrawlResponse {
  results: CrawlSourceResult[];
  errors: Array<{ source: string; message: string }>;
  embeddingEnabled: boolean;
}

export interface EmbedAllRequest {
  projectId: string;
  force?: boolean;
  concurrency?: number;
}

export interface EmbedAllResponse {
  total: number;
  embedded: number;
  failed: number;
  errors: Array<{ regulationId: string; error: string }>;
  message?: string;
}

export interface CrawlerHealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  mongo: { connected: boolean; readyState: number };
  uptime: number;
  timestamp: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${CRAWLER_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRAWLER_TIMEOUT_MS);
  const start = Date.now();

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Defense-in-depth shared secret for the otherwise-unauth crawler (security review).
    if (process.env.COMPLIANCE_CRAWLER_SECRET) {
      headers['X-Crawler-Token'] = process.env.COMPLIANCE_CRAWLER_SECRET;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const elapsed = Date.now() - start;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log.warn({ url, status: res.status, elapsed, err: errText.slice(0, 200) }, '[crawler] request failed');
      throw new CrawlerUnreachableError(`crawler ${path} → ${res.status}: ${errText.slice(0, 200)}`);
    }
    log.debug({ url, elapsed }, '[crawler] request ok');
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof CrawlerUnreachableError) throw err;
    throw new CrawlerUnreachableError(`crawler unreachable at ${url}`, err);
  } finally {
    clearTimeout(timeout);
  }
}

export async function triggerCrawl(input: CrawlRequest): Promise<CrawlResponse> {
  return postJson<CrawlResponse>('/crawl', input);
}

export async function triggerEmbedAll(input: EmbedAllRequest): Promise<EmbedAllResponse> {
  return postJson<EmbedAllResponse>('/embed-all', input);
}

export async function crawlerHealth(): Promise<CrawlerHealthResponse | null> {
  try {
    const res = await fetch(`${CRAWLER_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as CrawlerHealthResponse;
  } catch (err) {
    log.warn({ err }, '[crawler] health check failed');
    return null;
  }
}

export function crawlerConfig(): { url: string; timeoutMs: number } {
  return { url: CRAWLER_URL, timeoutMs: CRAWLER_TIMEOUT_MS };
}
