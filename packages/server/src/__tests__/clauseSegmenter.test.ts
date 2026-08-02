/**
 * Tests für den mechanischen Klausel-Zerleger (THE-545, Task 2).
 *
 * ── WARUM MECHANISCH ──
 *
 * Absatz, Buchstabe und Satz stehen IM TEXT. Nach ADR-0007 E7 gehört das in
 * einen Parser, nicht in einen Prompt — dieselbe Regel, mit der INTERPRETS
 * (THE-529) den LLM-Pfad verlassen hat: was mechanisch entscheidbar ist,
 * entscheidet die Mechanik.
 *
 * ── ZWEI FALLEN, DIE AM ECHTEN KORPUSTEXT GEFUNDEN WURDEN ──
 *
 * 1. **Die Fußnote, die wie ein Absatz aussieht.** DORA Art. 19 trägt
 *    `[(37)](https://eur-lex.europa.eu/…CELEX:32022R2554…)` — eine
 *    Fußnoten-Referenz in Markdown-Syntax. Ein naives `\(\d+\)` erzeugt daraus
 *    einen Phantom-Absatz und zerreißt die Reihenfolge (1…6, 37, 7, 8).
 * 2. **Das Blendungs-Leck in der URL.** `blindLawNames` kennt Gesetzesnamen und
 *    Fundstellen — aber weder `CELEX:32022R2554` noch eine EUR-Lex-URL. Der
 *    Link muss VOR der Blendung verschwinden, sonst trägt der Prompt die
 *    Herkunft mit. Genau daran ist der Richter am 2026-08-01 gescheitert.
 */
import { segmentClauses, clauseStats, stripEditorialArtefacts } from '../evals/reqtrace/clauseSegmenter';
import { loadReqtraceLaws, type ReqtraceArticle } from '../evals/reqtrace/lawsFixture';

const laws = loadReqtraceLaws();
const article = (source: string, art: string): ReqtraceArticle =>
  laws.articles.find((a) => a.source === source && a.article === art)!;

describe('stripEditorialArtefacts (THE-545)', () => {
  it('removes footnote links WITH their URL — the blinding leak', () => {
    const out = stripEditorialArtefacts(
      'des Rates [(37)](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32022R2554#ntr37) in Bezug auf',
    );
    expect(out).not.toMatch(/CELEX|eur-lex|https?:/i);
    expect(out).not.toMatch(/\(37\)/);
    expect(out).toContain('des Rates');
    expect(out).toContain('in Bezug auf');
  });

  it('leaves ordinary parenthesised numbers alone', () => {
    // Ein echter Absatz-Marker darf nicht mitgeloescht werden.
    expect(stripEditorialArtefacts('(1) Finanzunternehmen melden')).toContain('(1)');
  });

  it('kills bare URLs too', () => {
    expect(stripEditorialArtefacts('siehe https://example.org/x?y=1 und weiter')).not.toMatch(/https?:/);
  });
});

describe('segmentClauses (THE-545)', () => {
  const art32 = article('dsgvo', 'art32');

  it('splits numbered paragraphs and gives every clause a stable id and path', () => {
    const clauses = segmentClauses(art32);
    expect(clauses.length).toBeGreaterThan(3);
    expect(clauses[0].id).toBe('dsgvo:art32:c01');
    for (const c of clauses) {
      expect(c.path).toMatch(/^Abs\.\s\d+/);
      expect(c.text.length).toBeGreaterThan(0);
    }
  });

  it('does NOT treat the footnote reference as a paragraph (DORA Art. 19)', () => {
    // Die Falle: 1…6, dann (37), dann 7, 8. Ein Phantom-Absatz verschiebt
    // jede Auswertung, die auf Absatz-Nummern zeigt.
    const clauses = segmentClauses(article('dora', 'art19'));
    const paras = [...new Set(clauses.map((c) => Number(/^Abs\.\s(\d+)/.exec(c.path)![1])))];
    expect(paras).not.toContain(37);
    expect(paras).toEqual([...paras].sort((a, b) => a - b));
    expect(paras[0]).toBe(1);
  });

  it('carries no law identity into any clause — blinding-ready', () => {
    for (const a of laws.articles) {
      for (const c of segmentClauses(a)) {
        expect(c.text).not.toMatch(/CELEX|eur-lex\.europa\.eu|https?:\/\//i);
      }
    }
  });

  it('splits litterae inside a paragraph and keeps their letter in the path', () => {
    const clauses = segmentClauses(article('nis2', 'art21'));
    const lit = clauses.filter((c) => /Buchst\.\s[a-z]/.test(c.path));
    expect(lit.length).toBeGreaterThan(5); // NIS2 Art. 21 Abs. 2 hat a) bis j)
    expect(lit.some((c) => c.path.includes('Buchst. a'))).toBe(true);
  });

  it('is deterministic — same article, same clauses, same ids', () => {
    expect(segmentClauses(art32)).toEqual(segmentClauses(art32));
  });

  it('never drops substantive text', () => {
    // Stiller Verlust ist der Fehlermodus schlechthin. Geprueft ueber die
    // langen Woerter des Originals — kurze Fuellwoerter sind kein Beleg.
    for (const a of laws.articles) {
      const joined = segmentClauses(a).map((c) => c.text).join(' ');
      const words = [...new Set(stripEditorialArtefacts(a.fullText).split(/\s+/).filter((w) => w.length > 9))];
      const missing = words.filter((w) => !joined.includes(w));
      expect(missing).toEqual([]);
    }
  });

  it('makes no LLM call — the module imports no rater', () => {
    const src = require('fs').readFileSync(require.resolve('../evals/reqtrace/clauseSegmenter'), 'utf8');
    expect(src).not.toMatch(/raterClient|anthropic|openrouter|complete\(/i);
  });

  it('reports the rate for calibration against Reg2Req', () => {
    // Reg2Req: 398 Klauseln fuer die DSGVO, ~4 je Artikel; 448 Anforderungen
    // daraus, also ~1,1 je Klausel. Weicht unsere Rate stark ab, ist die
    // Granularitaet der Befund — nicht die Harmonisierung.
    const s = clauseStats(laws.articles.map(segmentClauses));
    expect(s.articles).toBe(9);
    expect(s.clauses).toBeGreaterThan(20);
    expect(s.clausesPerArticle).toBeGreaterThan(1);
  });
});
