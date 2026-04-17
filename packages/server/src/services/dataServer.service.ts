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

async function postJson<T>(path: string, body: unknown): Promise<T> {
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

  log.debug({ url, elapsed }, '[DataServer] request ok');
  return (await res.json()) as T;
}

export async function ingestDocument(input: IngestDocumentInput): Promise<IngestDocumentResult> {
  return postJson<IngestDocumentResult>(INGEST_PATH, input);
}

export async function queryDocuments(input: QueryInput): Promise<QueryResult> {
  return postJson<QueryResult>(QUERY_PATH, input);
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
