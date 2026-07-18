/**
 * UC-LAW-002 REQ-LAW-002.2 (THE-461) — Raw corpus vector search.
 * Embeddet Query-Text (Sidecar, all-mpnet-base-v2, 768) und sucht die geteilte
 * Qdrant-Collection `regulations-corpus`. KEINE Governance hier — das wrappt
 * `governedCorpusSearch`. Nutzt denselben Sidecar/Qdrant-Aufbau wie
 * elementSimilarity.service.ts (process.env-Namen dort verifiziert: EMBEDDING_SIDECAR_URL,
 * QDRANT_URL, QDRANT_API_KEY).
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import type { CorpusHit } from '@thearchitect/shared';
import { log } from '../config/logger';

const CORPUS_COLLECTION = 'regulations-corpus'; // = crawler CORPUS_COLLECTION
const EMBEDDING_DIM = 768;

// Env-Namen aus elementSimilarity.service.ts gespiegelt (verifiziert 2026-07-18).
// Sidecar-/Qdrant-URL werden im Config-Guard LIVE aus process.env gelesen (nicht als
// modul-globale Konstante eingefroren), damit die Prüfung unabhängig von der Modul-
// Ladereihenfolge ist (z. B. wenn Env erst nach dem Import gesetzt wird).
const sidecarUrl = (): string => process.env.EMBEDDING_SIDECAR_URL || '';
const qdrantUrl = (): string => process.env.QDRANT_URL || '';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;

interface QdrantSearchHit { score: number; payload: Record<string, unknown> | null | undefined }
interface Deps {
  embed: (text: string) => Promise<number[]>;
  search: (vector: number[], topK: number) => Promise<QdrantSearchHit[]>;
}

async function defaultEmbed(text: string): Promise<number[]> {
  const res = await fetch(`${sidecarUrl()}/embed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`sidecar ${res.status}`);
  const data = (await res.json()) as { vector: number[]; dim: number };
  if (data.dim !== EMBEDDING_DIM) throw new Error(`dim ${data.dim} != ${EMBEDDING_DIM}`);
  return data.vector;
}

let _client: QdrantClient | null = null;
async function defaultSearch(vector: number[], topK: number): Promise<QdrantSearchHit[]> {
  if (!_client) _client = new QdrantClient({ url: qdrantUrl(), apiKey: QDRANT_API_KEY });
  const res = await _client.search(CORPUS_COLLECTION, { vector, limit: topK, with_payload: true });
  return res.map(r => ({ score: r.score, payload: r.payload as Record<string, unknown> }));
}

const defaultDeps: Deps = { embed: defaultEmbed, search: defaultSearch };
let deps: Deps = defaultDeps;
export function __setCorpusSearchDeps(d: Deps): void { deps = d; }
export function __resetCorpusSearchDeps(): void { deps = defaultDeps; }

/** True wenn Sidecar + Qdrant konfiguriert sind (graceful degradation sonst). */
export function isCorpusVectorSearchConfigured(): boolean {
  return !!(qdrantUrl() && sidecarUrl());
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

export async function corpusVectorSearch(text: string, topK: number): Promise<CorpusHit[]> {
  if (!isCorpusVectorSearchConfigured()) {
    log.warn({ qdrant: !!qdrantUrl(), sidecar: !!sidecarUrl() }, '[law-discovery] corpus vector search not configured');
    return [];
  }
  const vector = await deps.embed(text);
  const raw = await deps.search(vector, topK);
  return raw
    .filter(r => r.payload && r.payload.regulationKey)
    .map(r => {
      const p = r.payload as Record<string, unknown>;
      return {
        regulationKey: str(p.regulationKey),
        versionHash: str(p.versionHash),
        source: str(p.source),
        paragraphNumber: str(p.paragraphNumber),
        title: str(p.title),
        jurisdiction: str(p.jurisdiction, 'EU'),
        language: str(p.language),
        score: typeof r.score === 'number' ? r.score : 0,
        // provisionKind bewusst NICHT gesetzt — Naht dormant (THE-432).
      } satisfies CorpusHit;
    });
}
