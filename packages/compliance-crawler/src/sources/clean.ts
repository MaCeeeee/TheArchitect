/**
 * Regulation fullText cleanup — THE-365 (REQ-CRAWL-QUALITY-001).
 *
 * EUR-Lex renders nested enumerations ((a)/(b)/(i)…) as HTML tables. Firecrawl
 * converts those to Markdown tables, whose separator rows (`| --- |`) and empty
 * cells survive the parser's line-flattening as inline noise:
 *
 *   "... shall be prohibited: | | | | --- | --- | | (a) | the placing ..."
 *   →  "... shall be prohibited: (a) the placing ..."
 *
 * Legal text effectively never contains a literal "|" or a run of 3+ ASCII
 * hyphens, so stripping this scaffolding is safe. The em-dash "—" (U+2014) is a
 * different character and is left untouched. A spaced "---" that is NOT adjacent
 * to a table pipe or line end is also left alone (protects prose dashes).
 *
 * Runs on the already single-line, whitespace-collapsed text BEFORE the length
 * cap, so truncation acts on clean text (recovering some length lost to noise).
 */
export function cleanRegulationText(text: string): string {
  return text
    // 1) drop Markdown table separator cells ("| --- |", "|---|", "| :--- |"),
    //    only when adjacent to a table pipe or the end of the string.
    .replace(/\|\s*:?-{3,}:?\s*(?=\||$)/g, ' ')
    // 2) collapse any remaining run of pipe borders / empty cells into one space.
    .replace(/(?:\s*\|\s*)+/g, ' ')
    // 3) normalise whitespace.
    .replace(/\s+/g, ' ')
    .trim();
}
