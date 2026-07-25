/**
 * Review-Sicht auf die Cross-Norm-Kanten-Vorschläge (THE-433, Slice 1, Task 6).
 *
 * WARUM in shared: Der Review-Pfad hat ZWEI Enden — der Crawler (Server B) hat
 * den Schreibzugriff und liefert Liste + Entscheidung, Server A liest dieselben
 * Vorschläge read-only aus dem Korpus (THE-440-RO-User) für die UI. Beide
 * müssen dieselbe Zeile zeigen: dieselben Felder, dieselben Filter, dieselbe
 * Sortierung. Zwei Implementierungen wären zwei Wahrheiten, die genau dann
 * auseinanderlaufen, wenn ein Mensch entscheidet — also im teuersten Moment.
 * Dasselbe Ein-Ort-Muster wie prompt.ts (rp-2) und lawPatterns.ts.
 *
 * Rein: kein Mongo, kein Netz — Filter- und Seitenlogik sind ohne
 * Infrastruktur prüfbar.
 *
 * Linear: THE-433 (Slice 1, Task 6)
 */

export const RELATION_STATUSES = ['suggested', 'confirmed', 'rejected'] as const;
export type RelationStatus = (typeof RELATION_STATUSES)[number];

/** Nur ein MENSCH trifft diese beiden — 'suggested' ist keine Entscheidung. */
export const RELATION_DECISIONS = ['confirmed', 'rejected'] as const;
export type RelationDecision = (typeof RELATION_DECISIONS)[number];

/** Ein Vorschlag, wie ihn der Review sieht: Ziel + Typ + Richtung + Provenance. */
export interface RelationSuggestionOut {
  targetRegulationKey: string;
  relationType: string;
  direction: 'a-to-b' | 'b-to-a';
  confidence?: number;
  evidence: { matched: string; articleHints: string[] };
  status: RelationStatus;
  promptVersion: string;
  model: string;
  suggestedAt: string;
  sourceVersionHash: string;
  targetVersionHash: string;
}

/** Eine Zeile = zitierendes Dokument + EIN Vorschlag daran. */
export interface RelationSuggestionRow {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title: string;
  suggestion: RelationSuggestionOut;
}

/** Das, was aus Mongo gelesen wird (schlanke Projektion). */
export interface RelationSuggestionsDoc {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title: string;
  relationSuggestions?: RelationSuggestionOut[];
}

export interface RelationSuggestionsFilter {
  status?: RelationStatus;
  /** Quelle des ZIELS — aus dem Ziel-Key abgeleitet, nie geraten. */
  targetSource?: string;
  limit?: number;
  offset?: number;
}

/** Quelle des Ziels aus dem regulationKey ('nis2:art-4' → 'nis2'). */
export function targetSourceOf(targetRegulationKey: string): string {
  const i = targetRegulationKey.indexOf(':');
  return i === -1 ? targetRegulationKey : targetRegulationKey.slice(0, i);
}

/**
 * Flacht Dokumente zu Vorschlags-Zeilen ab, filtert und paginiert.
 *
 * Die Sortierung (regulationKey, dann Ziel-Key) ist deterministisch und nicht
 * kosmetisch: eine Seite 2 ohne stabile Ordnung kann Einträge doppeln oder
 * verschlucken — bei einer Liste, aus der ein Mensch Kanten bestätigt, wäre
 * ein verschluckter Eintrag ein unsichtbar übergangener Vorschlag.
 */
export function selectRelationSuggestions(
  docs: RelationSuggestionsDoc[],
  filter: RelationSuggestionsFilter
): { items: RelationSuggestionRow[]; total: number } {
  const rows: RelationSuggestionRow[] = [];
  for (const d of docs) {
    for (const s of d.relationSuggestions ?? []) {
      if (filter.status && s.status !== filter.status) continue;
      if (filter.targetSource && targetSourceOf(s.targetRegulationKey) !== filter.targetSource)
        continue;
      rows.push({
        regulationKey: d.regulationKey,
        source: d.source,
        paragraphNumber: d.paragraphNumber,
        title: d.title,
        suggestion: s,
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.regulationKey.localeCompare(b.regulationKey) ||
      a.suggestion.targetRegulationKey.localeCompare(b.suggestion.targetRegulationKey)
  );
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? rows.length;
  return { items: rows.slice(offset, offset + limit), total: rows.length };
}
