/**
 * clauseSegmenter — zerlegt einen Artikel mechanisch in Klauseln
 * (THE-545, Task 2). KEIN LLM in dieser Datei.
 *
 * ── WARUM MECHANISCH ──
 *
 * Absatz, Buchstabe und Satz stehen im Text. Nach ADR-0007 E7 gehört das in
 * einen Parser — dieselbe Regel, mit der INTERPRETS (THE-529) den LLM-Pfad
 * verlassen hat: was mechanisch entscheidbar ist, entscheidet die Mechanik.
 * Das ist zugleich die Grundlage der Kalibrierung gegen Reg2Req (398 Klauseln
 * für die DSGVO, ~4 je Artikel).
 *
 * ── ZWEI FALLEN AUS DEM ECHTEN KORPUSTEXT ──
 *
 * 1. **Die Fußnote, die wie ein Absatz aussieht.** DORA Art. 19 enthält
 *    `[(37)](https://eur-lex.europa.eu/…CELEX:32022R2554…)`. Ein naives
 *    `\(\d+\)` erzeugt daraus einen Phantom-Absatz und zerreißt die
 *    Reihenfolge (1…6, 37, 7, 8). Zwei Sperren dagegen: die redaktionellen
 *    Artefakte fliegen vorher raus, und die Absatz-Nummern müssen bei 1
 *    beginnen und **monoton wachsen**.
 * 2. **Das Blendungs-Leck in der URL.** `blindLawNames` kennt Gesetzesnamen
 *    und Fundstellen, aber weder `CELEX:32022R2554` noch eine EUR-Lex-URL.
 *    Beides muss VOR der Blendung verschwinden, sonst trägt der Prompt die
 *    Herkunft mit — genau der Fehler, an dem der Richter am 2026-08-01
 *    gescheitert ist.
 *
 * Linear: THE-545 · Rahmen: ADR-0007
 */
import type { ReqtraceArticle } from './lawsFixture';

export interface Clause {
  /** `<source>:<article>:c<NN>` — stabil, fortlaufend in Textreihenfolge. */
  id: string;
  /** Menschenlesbarer Pfad: `Abs. 2 Buchst. c` — der Rückverweis der Traceability. */
  path: string;
  text: string;
}

/** Markdown-Fußnote samt Ziel-URL: `[(37)](https://…)`. */
const FOOTNOTE_LINK = /\[\(\d+\)\]\([^)]*\)/g;
/** Nackte URLs, die im Korpustext als Verweis stehen. */
const BARE_URL = /https?:\/\/\S+/g;

/**
 * Entfernt redaktionelle Artefakte, die kein Gesetzestext sind.
 *
 * Läuft VOR jeder Zerlegung und vor jeder Blendung: die Fußnoten-Referenz
 * würde sonst als Absatz gelesen, und ihre URL trüge die Gesetzes-Identität
 * (CELEX) in den Prompt.
 */
export function stripEditorialArtefacts(text: string): string {
  return text
    .replace(FOOTNOTE_LINK, ' ')
    .replace(BARE_URL, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Absatz-Grenzen finden. Akzeptiert `(n)` nur, wenn die Nummern bei 1
 * beginnen und monoton wachsen — eine Fußnoten-Nummer mitten im Text ist
 * damit strukturell ausgeschlossen, auch wenn sie das Strippen überlebt.
 */
function paragraphSpans(text: string): { num: number; start: number; end: number }[] {
  const marks: { num: number; at: number; len: number }[] = [];
  for (const m of text.matchAll(/\((\d{1,2})\)/g)) {
    marks.push({ num: Number(m[1]), at: m.index ?? 0, len: m[0].length });
  }
  const kept: typeof marks = [];
  let expected = 1;
  for (const m of marks) {
    if (m.num === expected) {
      kept.push(m);
      expected++;
    }
  }
  if (kept.length === 0) return [{ num: 1, start: 0, end: text.length }];

  return kept.map((m, i) => ({
    num: m.num,
    start: m.at + m.len,
    end: i + 1 < kept.length ? kept[i + 1].at : text.length,
  }));
}

/**
 * Buchstaben-Aufzählung innerhalb eines Absatzes. Die Buchstaben müssen bei
 * `a` beginnen und fortlaufen — sonst ist `b)` irgendein eingeklammerter Rest
 * und keine Gliederung. Der Einleitungssatz vor `a)` bleibt eine eigene
 * Klausel: er trägt regelmäßig den Verpflichteten und die Modalität.
 */
function splitLitterae(body: string): { letter: string | null; text: string }[] {
  const marks: { letter: string; at: number; len: number }[] = [];
  let expected = 'a';
  for (const m of body.matchAll(/(?:^|[\s;.])([a-z])\)\s/g)) {
    if (m[1] !== expected) continue;
    const at = (m.index ?? 0) + m[0].indexOf(m[1]);
    marks.push({ letter: m[1], at, len: m[1].length + 2 });
    expected = String.fromCharCode(expected.charCodeAt(0) + 1);
  }
  if (marks.length < 2) return [{ letter: null, text: body.trim() }];

  const out: { letter: string | null; text: string }[] = [];
  const intro = body.slice(0, marks[0].at).trim();
  if (intro) out.push({ letter: null, text: intro });
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : body.length;
    const text = body.slice(m.at + m.len, end).trim();
    if (text) out.push({ letter: m.letter, text });
  });
  return out;
}

/**
 * Konservativer Satzsplit — nur für sehr lange Blöcke ohne Gliederung.
 *
 * Bewusst zurückhaltend: eine zu grobe Klausel wird später vom
 * Singularitätstor aufgeteilt (das zählt die Slots), ein zerhackter Satz ist
 * dagegen nicht mehr reparierbar. Abkürzungen mit Punkt (Art., Abs., Nr.,
 * Buchst., ff.) sind ausgenommen.
 */
const LONG_BLOCK = 700;
function splitSentences(text: string): string[] {
  if (text.length <= LONG_BLOCK) return [text];
  const parts = text.split(/(?<![A-ZÄÖÜ][a-zäöü]{0,7}\.)(?<=\.)\s+(?=[A-ZÄÖÜ])/);
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    // Sehr kurze Bruchstuecke wieder anhaengen: sie tragen keinen eigenen Sinn.
    if (out.length && t.length < 60) out[out.length - 1] = `${out[out.length - 1]} ${t}`;
    else out.push(t);
  }
  return out.length ? out : [text];
}

/** Zerlegt einen Artikel deterministisch in Klauseln. */
export function segmentClauses(article: ReqtraceArticle): Clause[] {
  const text = stripEditorialArtefacts(article.fullText);
  const clauses: Clause[] = [];
  let n = 0;

  for (const span of paragraphSpans(text)) {
    const body = text.slice(span.start, span.end).trim();
    if (!body) continue;

    for (const lit of splitLitterae(body)) {
      for (const sentence of splitSentences(lit.text)) {
        n += 1;
        clauses.push({
          id: `${article.source}:${article.article}:c${String(n).padStart(2, '0')}`,
          path: `Abs. ${span.num}${lit.letter ? ` Buchst. ${lit.letter}` : ''}`,
          text: sentence,
        });
      }
    }
  }
  return clauses;
}

export interface ClauseStats {
  articles: number;
  clauses: number;
  clausesPerArticle: number;
  /** Längste Klausel — ein Ausreißer zeigt eine ungegliederte Passage an. */
  longestClauseChars: number;
}

/**
 * Kennzahlen für die Kalibrierung (DoD-4). Referenz Reg2Req: 398 Klauseln für
 * die DSGVO (~4 je Artikel), daraus 448 Anforderungen (~1,1 je Klausel).
 */
export function clauseStats(perArticle: Clause[][]): ClauseStats {
  const clauses = perArticle.reduce((a, c) => a + c.length, 0);
  const longest = Math.max(0, ...perArticle.flat().map((c) => c.text.length));
  return {
    articles: perArticle.length,
    clauses,
    clausesPerArticle: perArticle.length === 0 ? 0 : clauses / perArticle.length,
    longestClauseChars: longest,
  };
}
