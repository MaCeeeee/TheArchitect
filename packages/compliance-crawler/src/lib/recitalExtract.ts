/**
 * THE-681 (REQ-679.2): Erwägungsgründe aus EUR-Lex-HTML extrahieren.
 *
 * PURE Funktionen — kein I/O, kein Mongo. Der Spike (THE-680, 2d553a8) hat
 * die Methode an 24 von 26 Fassungen belegt: Gegenprobe AI Act 180/180,
 * DSGVO 173/173, DORA 106/106, Δ jeweils 0; DE/EN ohne einzige Abweichung.
 *
 * ── DIE ZWEI LEHREN AUS DEM SPIKE ──
 *
 * 1. Der Baum lügt: Der erste Artikel-Titel liegt tief in
 *    `div.eli-subdivision` und hat NULL Geschwister davor — die Präambel ist
 *    ein anderer Zweig, kein vorheriges Geschwister. Deshalb wird am TEXT
 *    geschnitten: Alles vor der Erlass-Formel ist Präambel.
 * 2. Alte Rechtsakte (eprivacy, 2002) tragen kein `div.eli-subdivision` —
 *    dafür der absatzbasierte Fallback. Er greift NUR, wenn die
 *    Erlass-Formel gefunden wurde: ohne Grenze wäre er Raten.
 */
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { buildRegulationKey } from '@thearchitect/shared';
import type { IRecital } from '../db/recital.model';

/** Erlass-Formeln DE/EN für Verordnung und Richtlinie — die Präambel-Grenze. */
export const ENACTING_FORMULA =
  /HABEN FOLGENDE (?:VERORDNUNG|RICHTLINIE) ERLASSEN|HAVE ADOPTED THIS (?:REGULATION|DIRECTIVE)/i;

export interface ExtractedRecital {
  recitalNumber: number;
  /** Text ohne die führende „(N)"-Nummer. */
  fullText: string;
}

export interface RecitalExtraction {
  recitals: ExtractedRecital[];
  /** Nummern zwischen 1 und max, die fehlen — vollzählig ist nicht vollständig. */
  gaps: number[];
  enactingFormulaFound: boolean;
  /** Welcher Selektor getragen hat — Provenance für den Bericht. */
  selector: 'eli-subdivision' | 'paragraph-fallback' | 'none';
}

const LEAD = /^\((\d{1,3})\)\s+(\S[\s\S]*)$/;

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function collect(
  texts: string[],
  bodyText: string,
  boundary: number
): Map<number, string> {
  const byNumber = new Map<number, string>();
  for (const raw of texts) {
    const text = normalise(raw);
    const m = LEAD.exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > 400 || byNumber.has(n)) continue;
    // Vor der Erlass-Formel? Artikel-Absätze heißen auch „(1)" — die Grenze
    // trennt Präambel von Normtext.
    if (boundary > 0) {
      const pos = bodyText.indexOf(text.slice(0, 40));
      if (pos > boundary) continue;
    }
    byNumber.set(n, m[2].trim());
  }
  return byNumber;
}

/** Extrahiert die Erwägungsgründe aus einer EUR-Lex-TXT/HTML-Seite. */
export function extractRecitals(html: string): RecitalExtraction {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const formula = ENACTING_FORMULA.exec(bodyText);
  const boundary = formula ? formula.index : -1;

  // Selektor 1: ELI-Container (Rechtsakte ab ~2012, alle 12 Spike-Familien).
  const eli = $('div.eli-subdivision')
    .toArray()
    .map((el) => $(el).text());
  let byNumber = collect(eli, bodyText, boundary);
  let selector: RecitalExtraction['selector'] = byNumber.size > 0 ? 'eli-subdivision' : 'none';

  // Selektor 2: Absatz-Fallback für alte Akte ohne ELI-Auszeichnung.
  // NUR mit gefundener Erlass-Formel — ohne Grenze wäre jeder „(1)"-Absatz
  // im Normtext ein falscher Treffer, und Raten ist hier verboten.
  if (byNumber.size === 0 && boundary > 0) {
    const paragraphs = $('p')
      .toArray()
      .map((el) => $(el).text());
    byNumber = collect(paragraphs, bodyText, boundary);
    if (byNumber.size > 0) selector = 'paragraph-fallback';
  }

  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  const max = numbers.length ? numbers[numbers.length - 1] : 0;
  const gaps: number[] = [];
  for (let i = 1; i <= max; i++) if (!byNumber.has(i)) gaps.push(i);

  return {
    recitals: numbers.map((n) => ({ recitalNumber: n, fullText: byNumber.get(n)! })),
    gaps,
    enactingFormulaFound: boundary >= 0,
    selector,
  };
}

// ─── citedArticles (AC-4): mechanisch, nie geraten ───────────────────────────

/**
 * Verweis auf einen FREMDEN Rechtsakt hinter der Artikelgruppe —
 * „Artikel 5 der Verordnung (EU) 2016/679" zitiert nicht diesen Rechtsakt.
 *
 * Gefunden am Bestand (14.08.): dsgvo:rec-1 lieferte fälschlich art-8/art-16 —
 * das sind Artikel 8 der CHARTA und Artikel 16 AEUV. Zwei Löcher: (1) Charta/
 * AEUV/Vertrag fehlten in der Liste, (2) zwischen Nummer und Fremdakt-Marker
 * stehen oft „Absatz 1" (DE) oder „(1)" (EN) — der Blick muss darüber hinweg.
 */
const FOREIGN_ACT =
  /^\s*(?:\(\d+[a-z]?\)\s*)*(?:Absatz\s+\d+[a-z]?\s*)?(?:Unterabsatz\s+\d+\s*)?(?:(?:der|des|of(?:\s+the)?)\s+(?:Verordnung|Richtlinie|Beschluss(?:es)?|Charta|Vertrags?|Regulation|Directive|Decision|Charter|Treaty)|AEUV\b|TFEU\b|EUV\b|TEU\b)/i;

const ARTICLE_GROUP =
  /\bArti(?:kels?n?|cles?)\s+(\d{1,3}[a-z]?(?:\s*(?:,|und|and|bis|to|sowie|or|oder)\s*\d{1,3}[a-z]?)*)/gi;

/**
 * Extrahiert `art-N`-Anker aus einem Erwägungsgrund-Text. Bereiche
 * („Artikel 13 bis 15") werden expandiert, gedeckelt auf 20 Nummern —
 * ein größerer Bereich ist eher ein Parse-Fehler als ein echter Verweis.
 */
export function extractCitedArticles(text: string): string[] {
  const found = new Set<number>();
  for (const m of text.matchAll(ARTICLE_GROUP)) {
    const tail = text.slice((m.index ?? 0) + m[0].length);
    if (FOREIGN_ACT.test(tail)) continue;
    const group = m[1];
    const parts = group.split(/\s*(?:,|und|and|sowie|or|oder)\s*/i);
    for (const part of parts) {
      const range = /^(\d{1,3})[a-z]?\s*(?:bis|to)\s*(\d{1,3})[a-z]?$/i.exec(part.trim());
      if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        if (to > from && to - from <= 20) {
          for (let i = from; i <= to; i++) found.add(i);
        }
        continue;
      }
      const single = /^(\d{1,3})[a-z]?$/.exec(part.trim());
      if (single) found.add(Number(single[1]));
    }
  }
  return [...found].sort((a, b) => a - b).map((n) => `art-${n}`);
}

/** SHA-256 über den normalisierten Text — der Idempotenz-Anker (AC-6). */
export function recitalVersionHash(fullText: string): string {
  return createHash('sha256').update(normalise(fullText), 'utf8').digest('hex');
}

// ─── Der Bauer (AC-7-Anker) ──────────────────────────────────────────────────

/**
 * DIE einzige Stelle, die ein Recital-Dokument formt. Der
 * Listen-Gleichstand-Test prüft jeden Key dieses Objekts gegen die
 * Schema-Pfade — läuft eine künftige Erweiterung nur über eine der zwei
 * Listen (Interface oder Schema), wird er rot. Lehre vom 12.08.
 */
export function buildRecitalDoc(args: {
  source: string;
  language: string;
  celex: string;
  recital: ExtractedRecital;
  crawledAt: Date;
}): IRecital {
  const { source, language, celex, recital, crawledAt } = args;
  return {
    source,
    language,
    celex,
    recitalNumber: recital.recitalNumber,
    // Unveränderte shared-Funktion: 'Rec. 12' → 'rec-12' (ADR-0001 unberührt).
    regulationKey: buildRegulationKey(source, `Rec. ${recital.recitalNumber}`),
    fullText: recital.fullText,
    versionHash: recitalVersionHash(recital.fullText),
    citedArticles: extractCitedArticles(recital.fullText),
    crawledAt,
  };
}
