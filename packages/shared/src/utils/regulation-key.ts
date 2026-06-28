/**
 * Canonical regulation identity — shared between the crawler (writes the corpus)
 * and the server (references it). MUST stay byte-identical on both sides, otherwise
 * a ComplianceMapping's reference key never matches its corpus entry (ADR-0001).
 *
 * Pure string logic only (no node:crypto) so this is safe to import from the
 * browser client too. The content hash (`computeVersionHash`, uses node:crypto)
 * lives node-side, not here.
 */

/** Normalise a paragraph label into a key-safe slug: "Art. 23" -> "art-23", "§ 6" -> "6". */
export function normaliseParagraph(paragraphNumber: string): string {
  return paragraphNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable, project-independent identity for a regulation paragraph, e.g. "dsgvo:art-30". */
export function buildRegulationKey(source: string, paragraphNumber: string): string {
  const para = normaliseParagraph(paragraphNumber);
  if (!source || !para) {
    throw new Error(
      `cannot build regulationKey from source="${source}", paragraph="${paragraphNumber}"`,
    );
  }
  return `${source}:${para}`;
}
