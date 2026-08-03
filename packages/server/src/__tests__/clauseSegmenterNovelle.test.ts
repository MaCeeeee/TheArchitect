/**
 * Der Novellen-Test (THE-560 AC 3) — das THE-550-Experiment als
 * Regressionstest. Fixture: nis2 art23 aus dem eingefrorenen
 * Reqtrace-Fixture; Novelle = umnummerierender Einschub eines neuen
 * Absatzes (2), alte (2)…(15) rücken auf.
 *
 * Gemessen (docs/evals/the550-granularitaet-entscheid.md): positionale Ids
 * verschieben sich dabei zu 24/30 — contentId findet 30/30 wieder.
 */
import { loadReqtraceLaws } from '../evals/reqtrace/lawsFixture';
import { segmentClauses } from '../evals/reqtrace/clauseSegmenter';

function renumberedNovelle(fullText: string): string {
  let t = fullText;
  for (let n = 15; n >= 2; n--) t = t.split(`(${n})`).join(`(${n + 1})`);
  return t.replace(
    '(3)',
    '(2) Die Einrichtungen benennen eine zentrale Kontaktstelle für alle Meldungen nach diesem Artikel.\n\n(3)',
  );
}

describe('segmentClauses — contentId überlebt die Novelle (THE-550 gemessen)', () => {
  const art = loadReqtraceLaws().articles.find((a) => a.source === 'nis2' && /23/.test(a.article))!;
  const before = segmentClauses(art);
  const after = segmentClauses({ ...art, fullText: renumberedNovelle(art.fullText) });

  it('every clause carries a 16-hex contentId, unique within the article', () => {
    for (const c of before) expect(c.contentId).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(before.map((c) => c.contentId)).size).toBe(before.length);
  });

  it('all unchanged clauses are re-found by contentId after the renumbering novella', () => {
    const beforeIds = new Set(before.map((c) => c.contentId));
    const refound = after.filter((c) => beforeIds.has(c.contentId)).length;
    expect(refound).toBe(before.length); // 30/30 — die gemessene Zahl aus THE-550
  });

  it('the inserted paragraph appears as NEW content, not as a shifted old id', () => {
    const beforeIds = new Set(before.map((c) => c.contentId));
    const fresh = after.filter((c) => !beforeIds.has(c.contentId));
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    expect(fresh.some((c) => /Kontaktstelle/.test(c.text))).toBe(true);
  });
});
