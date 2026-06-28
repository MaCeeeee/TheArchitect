/**
 * Content version fingerprint for a regulation paragraph (ADR-0001 / THE-306).
 *
 * sha256 hex of the full legal text. MUST stay identical to the crawler's
 * `computeVersionHash` (packages/compliance-crawler/src/db/regulationKey.ts) so a
 * ComplianceMapping's stored versionHash matches the corpus entry it references.
 *
 * The regulationKey logic lives in `@thearchitect/shared` (buildRegulationKey);
 * this hash uses node:crypto and therefore stays server-side.
 */
import { createHash } from 'node:crypto';

export function computeVersionHash(fullText: string): string {
  return createHash('sha256').update(fullText, 'utf8').digest('hex');
}
