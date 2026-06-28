/**
 * Canonical regulation identity helpers (ADR-0001).
 *
 * In the corpus model a paragraph is identified by a stable, project-independent
 * `regulationKey` (e.g. `nis2:art-23`, `lksg:6`, `dsgvo:art-32`), and a `versionHash`
 * (sha256 of fullText) that captures its content version. Tenant ComplianceMappings
 * reference `{ regulationKey, versionHash }` instead of copying the text (THE-306).
 */
import * as crypto from 'node:crypto';

/** Normalise a paragraph label into a key-safe slug: "Art. 23" → "art-23", "§ 6" → "6". */
export function normaliseParagraph(paragraphNumber: string): string {
  return paragraphNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable, project-independent identity for a regulation paragraph. */
export function buildRegulationKey(source: string, paragraphNumber: string): string {
  const para = normaliseParagraph(paragraphNumber);
  if (!source || !para) {
    throw new Error(`cannot build regulationKey from source="${source}", paragraph="${paragraphNumber}"`);
  }
  return `${source}:${para}`;
}

/** Content version fingerprint — sha256 hex of the full legal text. */
export function computeVersionHash(fullText: string): string {
  return crypto.createHash('sha256').update(fullText, 'utf8').digest('hex');
}
