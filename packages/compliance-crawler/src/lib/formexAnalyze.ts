/**
 * THE-685 (REQ-CANON-001.3a): Formex v4 lesen — reine Analyse, KEIN Netz, KEINE DB.
 *
 * Formex ist das amtliche Satzformat des Amtsblatts. Anders als das HTML trägt
 * es die Gliederung als Baum und vergebene Ids: `<ARTICLE IDENTIFIER="061">`,
 * darin `<PARAG IDENTIFIER="061.001">`. Damit ist die Frage „welche Artikel hat
 * dieses Gesetz?" nicht mehr Auslegung eines Parsers, sondern Ablesen.
 *
 * ── Zwei Fallen, die dieses Modul mechanisch ausschließt ──
 *
 * 1. ZITIERTE STRUKTUREN. Ein Änderungsartikel („Artikel 45 der Verordnung (EU)
 *    Nr. 909/2014 wird wie folgt geändert") enthält den fremden Text als
 *    `<QUOT.S>` — mit eigenen ARTICLE/PARAG darin. Wer alle ARTICLE zählt,
 *    zählt fremde Artikel mit. Deshalb: nur was NICHT unter QUOT.S liegt.
 *
 * 2. STELLE IM DOKUMENT. Artikel des Gesetzes stehen unter `<ENACTING.TERMS>`.
 *    Was in Anhängen oder im Kopf steht, ist kein Artikel des verfügenden
 *    Teils — es wird gezählt und ausgewiesen, aber nicht mitgerechnet.
 *
 * Beides ist derselbe Fehlertyp wie „vollzählig ist nicht vollständig": eine
 * Summe, die stimmt, während die Menge falsch ist.
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

/** Ein Artikel des verfügenden Teils, so wie das Amtsblatt ihn ausweist. */
export interface FormexArticle {
  /** Amtlich vergebene Id, z. B. `061` — hierarchisch fortgesetzt in PARAG (`061.001`). */
  identifier: string | null;
  /** Angezeigte Nummer aus `<TI.ART>`, z. B. `61` oder `10a`. Der Vergleichsschlüssel. */
  number: string | null;
  /** Amtliche Überschrift aus `<STI.ART>`, z. B. „Änderungen der Verordnung …". */
  title: string;
}

export interface FormexAnalysis {
  /** Wurzelelement: `ACT` = Fassung wie im Amtsblatt erlassen, `CONS.DOC` = konsolidiert. */
  rootTag: string;
  /** Formex-Schemaversion aus der Schema-Adresse, z. B. `formex-05.59-20170418`. */
  schemaVersion: string | null;
  /** Welche Ausdrucksform vorliegt — die Frage aus AC-5. */
  expressionType: 'base-act' | 'consolidated' | 'unknown';
  /** Rechtsform aus dem Begleit-Manifest (`REG` | `DIR` | `DEC`), falls übergeben. */
  legalValue: string | null;
  /** Sprachkennung aus `<LG.DOC>`. */
  language: string | null;
  /** Alle Struktur-Tags mit Anzahl — zitierte Strukturen ausgenommen (AC-2). */
  counts: Record<string, number>;
  /** Elemente innerhalb von `<QUOT.S>` — fremder Text, absichtlich nicht gezählt. */
  quotedElements: number;

  articles: FormexArticle[];
  /** Nur die Nummern, normalisiert (klein) — die Menge für den Bestandsabgleich. */
  articleNumbers: string[];
  /** Fehlende Nummern zwischen 1 und der höchsten rein numerischen. */
  articleGaps: number[];
  /** ARTICLE außerhalb von `<ENACTING.TERMS>` (Anhänge o. Ä.) — ausgewiesen, nicht mitgerechnet. */
  articlesOutsideEnactingTerms: number;
  /** ARTICLE innerhalb zitierter Strukturen — fremde Rechtsakte. */
  articlesInQuotedStructures: number;

  recitalNumbers: number[];
  recitalGaps: number[];
  annexCount: number;
}

const ARTICLE_NUMBER = /^\s*(?:Artikel|Article|Artículo|Articolo|Artikkel)\s+([0-9]+\s*[a-zA-Z]?)/i;
const RECITAL_NUMBER = /\(?\s*([0-9]+)\s*\)?/;

/** Tag-Namen der Vorfahren, äußerster zuerst. */
function ancestorTags($: cheerio.CheerioAPI, el: Element): string[] {
  return $(el)
    .parents()
    .map((_i, p) => (p as Element).tagName)
    .get();
}

/** Lückenliste: was zwischen 1 und dem Höchstwert fehlt. Leer heißt lückenlos. */
export function findGaps(numbers: number[]): number[] {
  if (numbers.length === 0) return [];
  const vorhanden = new Set(numbers);
  const max = Math.max(...numbers);
  const luecken: number[] = [];
  for (let n = 1; n <= max; n++) if (!vorhanden.has(n)) luecken.push(n);
  return luecken;
}

/**
 * Der gemeinsame Vergleichsschlüssel für beide Seiten.
 *
 * Die amtliche Quelle sagt „Artikel 61", unser Bestand führt `art. 61`. Ohne
 * eine gemeinsame Normalform vergleicht man zwei Schreibweisen statt zweier
 * Mengen — und jede Fassung sieht dann komplett abweichend aus. Beide Seiten
 * laufen deshalb durch DIESE Funktion, nicht durch je eigene Anpassungen.
 */
export function normalizeArticleNumber(raw: string): string | null {
  const m = /^\s*(?:artikel|article|art\.?|§)?\s*([0-9]+)\s*([a-z]?)\s*$/i.exec(raw);
  return m ? `${m[1]}${m[2].toLowerCase()}` : null;
}

/** `<TI.ART>Artikel 61</TI.ART>` → `61`; „Artikel 10a" → `10a`. */
export function parseArticleNumber(titleArt: string): string | null {
  const m = ARTICLE_NUMBER.exec(titleArt);
  return m ? normalizeArticleNumber(m[1]) : null;
}

export function analyzeFormex(xml: string, docXml?: string): FormexAnalysis {
  if (xml.trim().length === 0) throw new Error('Leeres Formex-Dokument — leere Messung ist kein Bestehen.');
  const $ = cheerio.load(xml, { xmlMode: true });

  const root = $.root().children().first();
  const rootTag = (root.get(0) as Element | undefined)?.tagName ?? '';
  if (!rootTag) throw new Error('Kein Wurzelelement — die Datei ist kein Formex-Dokument.');

  const schemaVersion = /schema\/(formex-[\d.]+-[\d]+)\.xd/.exec(xml)?.[1] ?? null;
  const language = $('LG\\.DOC').first().text().trim() || null;
  const legalValue = docXml ? (cheerio.load(docXml, { xmlMode: true })('LEGAL\\.VALUE').first().text().trim() || null) : null;

  // Wurzel `ACT` = Fassung, wie sie im Amtsblatt erlassen wurde. Konsolidierte
  // Fassungen tragen `CONS.DOC`/`CONS.ACT` und einen CELEX mit führender 0.
  const expressionType: FormexAnalysis['expressionType'] =
    rootTag === 'ACT' ? 'base-act' : rootTag.startsWith('CONS') ? 'consolidated' : 'unknown';

  const counts: Record<string, number> = {};
  let quotedElements = 0;
  const articles: FormexArticle[] = [];
  const recitalNumbers: number[] = [];
  let articlesOutsideEnactingTerms = 0;
  let articlesInQuotedStructures = 0;

  $('*').each((_i, node: AnyNode) => {
    const el = node as Element;
    const tag = el.tagName;
    const anc = ancestorTags($, el);
    const zitiert = anc.includes('QUOT.S');

    if (zitiert) {
      quotedElements++;
      if (tag === 'ARTICLE') articlesInQuotedStructures++;
      return; // fremder Rechtsakt — zählt für dieses Gesetz nicht
    }

    counts[tag] = (counts[tag] ?? 0) + 1;

    if (tag === 'ARTICLE') {
      if (!anc.includes('ENACTING.TERMS')) {
        articlesOutsideEnactingTerms++;
        return;
      }
      const $el = $(el);
      articles.push({
        identifier: $el.attr('IDENTIFIER') ?? null,
        number: parseArticleNumber($el.find('TI\\.ART').first().text()),
        title: $el.find('STI\\.ART').first().text().trim(),
      });
    }

    if (tag === 'CONSID') {
      // Die Nummer steht in `<NO.P>(12)</NO.P>`; ältere Fassungen führen sie im Text.
      const roh = $(el).find('NO\\.P').first().text() || $(el).text().slice(0, 12);
      const m = RECITAL_NUMBER.exec(roh);
      if (m) recitalNumbers.push(Number(m[1]));
    }
  });

  const articleNumbers = articles.map((a) => a.number).filter((n): n is string => n !== null);
  const numerisch = articleNumbers.filter((n) => /^[0-9]+$/.test(n)).map(Number);

  return {
    rootTag,
    schemaVersion,
    expressionType,
    legalValue,
    language,
    counts,
    quotedElements,
    articles,
    articleNumbers,
    articleGaps: findGaps(numerisch),
    articlesOutsideEnactingTerms,
    articlesInQuotedStructures,
    recitalNumbers: [...recitalNumbers].sort((a, b) => a - b),
    recitalGaps: findGaps(recitalNumbers),
    annexCount: counts.ANNEX ?? 0,
  };
}
