/**
 * Canonical regulation identity (ADR-0001) — Server-A mirror of
 * packages/compliance-crawler/src/db/regulationKey.ts.
 *
 * Replicated (not imported) to avoid coupling the app server to the crawler
 * package; the logic is byte-identical, so keys + version hashes match the
 * corpus entries. The corpus (Server B) is internal-only today; WFCOMP stores
 * the reference and reads the text from the in-code constant until the read-path
 * lands.
 *
 * TODO(THE-368): consolidate these helpers into @thearchitect/shared when the
 * Server-A → corpus read-path is built, so there is one implementation.
 */
import { createHash } from 'node:crypto';

/** "Art. 30" → "art-30", "§ 6 Abs. 1" → "6-abs-1". */
export function normaliseParagraph(paragraphNumber: string): string {
  return paragraphNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable, project-independent identity, e.g. "dsgvo:art-30". */
export function buildRegulationKey(source: string, paragraphNumber: string): string {
  const para = normaliseParagraph(paragraphNumber);
  if (!source || !para) {
    throw new Error(`cannot build regulationKey from source="${source}", paragraph="${paragraphNumber}"`);
  }
  return `${source}:${para}`;
}

/** Content version fingerprint — sha256 hex of the full legal text (THE-306). */
export function computeVersionHash(fullText: string): string {
  return createHash('sha256').update(fullText, 'utf8').digest('hex');
}
