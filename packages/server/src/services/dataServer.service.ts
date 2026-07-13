import { log } from '../config/logger';

const DATA_SERVER_URL = process.env.DATA_SERVER_URL || '';
const DATA_SERVER_SECRET = process.env.DATA_SERVER_SHARED_SECRET || '';

const INGEST_PATH = '/webhook/rag-ingest';
const QUERY_PATH = '/webhook/rag-query';
const HEALTH_PATH = '/webhook/rag-health';

export class DataServerNotConfiguredError extends Error {
  constructor() {
    super('Data-Server is not configured. Set DATA_SERVER_URL and DATA_SERVER_SHARED_SECRET.');
    this.name = 'DataServerNotConfiguredError';
  }
}

export interface IngestDocumentInput {
  projectId: string;
  source: 'regulation' | 'policy' | 'user-upload' | 'standard';
  filename: string;
  mimeType: string;
  content: string;
  metadata?: {
    jurisdiction?: string;
    regulationId?: string;
    effectiveDate?: string;
    language?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface IngestDocumentResult {
  documentId: string;
  chunkCount: number;
  tokenCount?: number;
}

export interface QueryInput {
  projectId: string;
  text: string;
  topK?: number;
  filters?: {
    source?: string;
    jurisdiction?: string;
    regulationId?: string;
    tags?: string[];
  };
}

export interface QueryChunk {
  documentId: string;
  chunkId: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface QueryResult {
  chunks: QueryChunk[];
}

function assertConfigured(): void {
  if (!DATA_SERVER_URL || !DATA_SERVER_SECRET) {
    throw new DataServerNotConfiguredError();
  }
}

interface PostJsonOptions<T> {
  /**
   * Called when the Data-Server returns a 2xx with an empty/whitespace body.
   * An empty body is NOT valid JSON, so without a default `res.json()` throws
   * (SyntaxError: Unexpected end of JSON input). Provide a default only where an
   * empty response is a legitimate outcome (e.g. "0 hits" → `{ chunks: [] }`).
   * If omitted, an empty 2xx body throws a descriptive error.
   */
  emptyBodyDefault?: () => T;
}

async function postJson<T>(path: string, body: unknown, opts?: PostJsonOptions<T>): Promise<T> {
  assertConfigured();
  const url = `${DATA_SERVER_URL}${path}`;
  const start = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': DATA_SERVER_SECRET,
    },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - start;
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.warn({ url, status: res.status, elapsed, err: errText }, '[DataServer] request failed');
    throw new Error(`Data-Server ${path} → ${res.status}: ${errText.slice(0, 200)}`);
  }

  // n8n "Respond to Webhook" returns an empty body for an empty items array,
  // so a 200 with content-length: 0 is a real (and expected) case. Read as text
  // first and decide, instead of letting res.json() throw on empty input.
  const text = await res.text();
  if (text.trim() === '') {
    if (opts?.emptyBodyDefault) {
      log.debug({ url, elapsed }, '[DataServer] empty 2xx body → default');
      return opts.emptyBodyDefault();
    }
    log.warn({ url, elapsed }, '[DataServer] unexpected empty 2xx body');
    throw new Error(`Data-Server ${path} → ${res.status} with empty body (expected JSON)`);
  }

  log.debug({ url, elapsed }, '[DataServer] request ok');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Data-Server ${path} → ${res.status} with invalid JSON body: ${text.slice(0, 200)}`);
  }
}

export async function ingestDocument(input: IngestDocumentInput): Promise<IngestDocumentResult> {
  return postJson<IngestDocumentResult>(INGEST_PATH, input);
}

export async function queryDocuments(input: QueryInput): Promise<QueryResult> {
  // An empty 2xx body means "0 hits" — surface it as an empty chunk set rather
  // than throwing, so callers can distinguish "no context" from a transport error.
  return postJson<QueryResult>(QUERY_PATH, input, { emptyBodyDefault: () => ({ chunks: [] }) });
}

export async function health(): Promise<{ ok: boolean; version?: string }> {
  if (!DATA_SERVER_URL || !DATA_SERVER_SECRET) return { ok: false };
  try {
    const res = await fetch(`${DATA_SERVER_URL}${HEALTH_PATH}`, {
      method: 'GET',
      headers: { 'X-API-Key': DATA_SERVER_SECRET },
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; version?: string };
  } catch (err) {
    log.warn({ err }, '[DataServer] health check failed');
    return { ok: false };
  }
}

export function isConfigured(): boolean {
  return Boolean(DATA_SERVER_URL && DATA_SERVER_SECRET);
}
