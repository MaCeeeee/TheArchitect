/**
 * Governed Retrieval (THE-422 / UC-CTXGOV-001 Read-Side).
 *
 * Single Deep Module every AI consumer uses to fetch law/corpus context.
 * Enforces eligibility (non-stale = current published version) and optional
 * version-pin (served from the Mongo corpus, never Qdrant). Telemetry mirrors
 * the THE-419 corpusMiss pattern. `eligibleOnly` here == "matches corpus-current
 * version"; draft/published lifecycle is THE-426 (Non-Goal).
 */
import {
  getRegulationsByKeys,
  getCurrentVersionHashes,
  getRegulationByKeyAndHash,
  type ICorpusRegulation,
} from './corpusClient.service';
import {
  queryDocuments,
  type QueryInput,
  type QueryResult,
  type QueryChunk,
} from './dataServer.service';
import { corpusVectorSearch } from './corpusVectorSearch.service';
import type { CorpusHit } from '@thearchitect/shared';
import { log } from '../config/logger';

export type VersionPin = Record<string, string>; // regulationKey -> versionHash

export interface GovernedReadInput {
  keys: string[];
  pin?: VersionPin;
  eligibleOnly?: boolean; // default true
}

export interface GovernedRegulationView {
  regulationKey: string;
  versionHash: string;
  source: string;
  jurisdiction: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  summary?: string;
  sourceUrl: string;
  effectiveFrom: Date;
  language: string;
}

interface GovernedStats {
  staleDropped: number; // chunks/regs dropped: versionHash PRESENT but != current-or-pinned
  pinnedServed: number; // regs served from an explicit pin
  unverifiable: number; // law chunks KEPT despite missing versionHash (legacy pre-payload points)
}
const stats: GovernedStats = { staleDropped: 0, pinnedServed: 0, unverifiable: 0 };
export function getGovernedStats(): Readonly<GovernedStats> {
  return { ...stats };
}
export function resetGovernedStats(): void {
  stats.staleDropped = 0;
  stats.pinnedServed = 0;
  stats.unverifiable = 0;
}

function toView(r: ICorpusRegulation): GovernedRegulationView {
  return {
    regulationKey: r.regulationKey,
    versionHash: r.versionHash,
    source: r.source,
    jurisdiction: r.jurisdiction,
    paragraphNumber: r.paragraphNumber,
    title: r.title,
    fullText: r.fullText,
    summary: r.summary,
    sourceUrl: r.sourceUrl,
    effectiveFrom: r.effectiveFrom,
    language: r.language,
  };
}

/**
 * Structured corpus read with pin + eligibility. Replaces direct legacy
 * `Regulation.find()` reads on the AI-Match / requirement-generation paths.
 */
export async function resolveGovernedRegulations(
  input: GovernedReadInput,
): Promise<GovernedRegulationView[]> {
  const { keys, pin } = input;
  const eligibleOnly = input.eligibleOnly ?? true;
  if (keys.length === 0) return [];

  const out: GovernedRegulationView[] = [];
  const unpinned = keys.filter(k => !(pin && pin[k]));

  // 1) Pinned keys — exact version from Mongo (AC-3).
  // Dedup keys (mirrors the unpinned path's byKey discipline): a duplicated pinned
  // key must emit ONE view and count `pinnedServed` once, not per occurrence.
  if (pin) {
    for (const k of new Set(keys)) {
      const hash = pin[k];
      if (!hash) continue;
      const doc = await getRegulationByKeyAndHash(k, hash);
      if (doc) {
        out.push(toView(doc));
        stats.pinnedServed += 1;
      } else {
        stats.staleDropped += 1;
        log.warn({ k, hash }, '[governed] pinned version not found — dropped');
      }
    }
  }

  // 2) Unpinned keys — current version, eligibility-filtered.
  if (unpinned.length > 0) {
    const regs = await getRegulationsByKeys(unpinned);
    const current = eligibleOnly ? await getCurrentVersionHashes(unpinned) : null;
    // getRegulationsByKeys can return multiple versions per key → keep current only.
    const byKey = new Map<string, ICorpusRegulation>();
    for (const r of regs) {
      const cur = byKey.get(r.regulationKey);
      if (!cur || (r.version ?? 1) > (cur.version ?? 1)) byKey.set(r.regulationKey, r);
    }
    for (const [k, r] of byKey) {
      // Belt-and-suspenders: `byKey` already picks the same max-version reg that
      // `getCurrentVersionHashes` returns, so this mismatch is currently inert
      // (never true). Kept as a live guard until draft/published lifecycle (THE-426)
      // decouples "current" from "max version", at which point this becomes load-bearing.
      if (current && current.get(k) !== r.versionHash) {
        stats.staleDropped += 1;
        continue;
      }
      out.push(toView(r));
    }
  }
  return out;
}

export interface GovernedQueryInput extends QueryInput {
  pin?: VersionPin;
  eligibleOnly?: boolean; // default true
}

/** Corpus key from a chunk's payload (snake_case fallback for legacy points). */
const keyOf = (c: QueryChunk): string | undefined =>
  (c.metadata?.regulationKey ?? c.metadata?.regulation_key) as string | undefined;
/** Version hash from a chunk's payload (snake_case fallback for legacy points). */
const hashOf = (c: QueryChunk): string | undefined =>
  (c.metadata?.versionHash ?? c.metadata?.version_hash) as string | undefined;

/**
 * Vector-path governed retrieval (AC-2/AC-3). Wraps `queryDocuments`:
 * - non-law chunks (no `regulationKey`) pass through untouched;
 * - pinned law chunks are replaced with the pinned Mongo `fullText` (never Qdrant);
 * - law chunks whose `versionHash` is PRESENT and stale are dropped + counted;
 * - law chunks with NO `versionHash` (legacy pre-payload points) are KEPT + counted
 *   `unverifiable` — we never silently blank out existing generator context.
 */
export async function governedQuery(input: GovernedQueryInput): Promise<QueryResult> {
  const eligibleOnly = input.eligibleOnly ?? true;
  const raw = await queryDocuments({
    projectId: input.projectId,
    text: input.text,
    topK: input.topK,
    filters: input.filters,
  });

  const keys = [...new Set(raw.chunks.map(keyOf).filter((k): k is string => !!k))];
  if (keys.length === 0) return raw; // non-law chunks (user uploads) pass through untouched

  const current = await getCurrentVersionHashes(keys);
  const kept: QueryChunk[] = [];
  for (const c of raw.chunks) {
    const k = keyOf(c);
    if (!k) {
      kept.push(c); // non-law chunk
      continue;
    }

    const pinnedHash = input.pin?.[k];
    if (pinnedHash) {
      const doc = await getRegulationByKeyAndHash(k, pinnedHash);
      if (doc) {
        kept.push({
          ...c,
          text: doc.fullText,
          metadata: { ...c.metadata, versionHash: doc.versionHash, pinned: true },
        });
        stats.pinnedServed += 1;
      } else {
        stats.staleDropped += 1;
        log.warn({ k, pinnedHash }, '[governed] pinned version not found — chunk dropped');
      }
      continue;
    }

    // Policy (AC-5 regression safety): a chunk whose versionHash is PRESENT and
    // mismatched is stale → drop. A chunk with NO versionHash (legacy point ingested
    // before the payload field existed) cannot be proven stale → KEEP + count, so we
    // never silently blank out existing generator context. Tighten to hard-drop only
    // once the corpus is fully re-ingested with versionHash (track via this counter).
    const h = hashOf(c);
    if (eligibleOnly && h !== undefined && h !== current.get(k)) {
      stats.staleDropped += 1;
      continue;
    }
    if (h === undefined) stats.unverifiable += 1;
    kept.push(c);
  }
  return { chunks: kept };
}

export interface GovernedCorpusSearchInput {
  text: string;
  topK?: number;
  pin?: VersionPin;
  eligibleOnly?: boolean; // default true
  /**
   * NAHT (THE-432 / Weg-A 2026-07-18): künftiger Provision-Typ-Filter. Der Korpus
   * ist heute untypisiert → dieser Parameter ist DORMANT (keine Wirkung), bis die
   * ONTO-Typisierung Payload-Typen liefert und das Eval-Gate .6 (THE-465) zeigt,
   * dass Retrieval-Präzision die Bremse ist. NICHT entfernen — dokumentierte Naht.
   */
  provisionKind?: string;
}

/**
 * Governter korpusweiter Vektor-Search (THE-461). Wendet dieselbe Eligibility-/
 * Stale-Drop-/Pin-/unverifiable-Politik wie `governedQuery` an, damit LAW-002
 * keinen ungoverneten Lesepfad öffnet (THE-459-Kontrakt). `provisionKind` ist eine
 * dormante Naht (s. o.).
 *
 * DIVERGENZ zu `governedQuery`: dort wird ein gepinnter Treffer aus dem Mongo-
 * `fullText` bedient (Volltext). Hier trägt `CorpusHit` NUR Metadaten (kein
 * fullText) — der Pin verifiziert daher nur den versionHash und behält den
 * Qdrant-Treffer; ein Pin-Treffer ohne versionHash ist nicht verifizierbar →
 * `unverifiable` (nicht `pinnedServed`).
 */
export async function governedCorpusSearch(input: GovernedCorpusSearchInput): Promise<CorpusHit[]> {
  const eligibleOnly = input.eligibleOnly ?? true;
  const hits = await corpusVectorSearch(input.text, input.topK ?? 50);
  if (hits.length === 0) return [];

  const keys = [...new Set(hits.map(h => h.regulationKey))];
  const current = await getCurrentVersionHashes(keys);

  const kept: CorpusHit[] = [];
  for (const h of hits) {
    const pinned = input.pin?.[h.regulationKey];
    if (pinned) {
      if (!h.versionHash) { stats.unverifiable += 1; kept.push(h); continue; }
      if (h.versionHash !== pinned) { stats.staleDropped += 1; continue; }
      stats.pinnedServed += 1; kept.push(h); continue;
    }
    if (!h.versionHash) { stats.unverifiable += 1; kept.push(h); continue; }
    if (eligibleOnly && h.versionHash !== current.get(h.regulationKey)) { stats.staleDropped += 1; continue; }
    kept.push(h);
  }
  // provisionKind: dormant — bewusst kein Filter (THE-432).
  return kept;
}
