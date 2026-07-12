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
  if (pin) {
    for (const k of keys) {
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
      if (current && current.get(k) !== r.versionHash) {
        stats.staleDropped += 1;
        continue;
      }
      out.push(toView(r));
    }
  }
  return out;
}
