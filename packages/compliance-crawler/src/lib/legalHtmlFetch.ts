/**
 * THE-681: HTML einer Rechtsquelle holen — direkt, mit Firecrawl als Rückfall.
 *
 * ── WARUM ES DAS GIBT ──
 *
 * EUR-Lex drosselt nach genügend Abrufen die IP: Es antwortet mit **HTTP 202
 * und LEEREM Body** statt mit einem Fehler. Gemessen am 14.08.: Nach den
 * Recital-Läufen lieferte auch `cra-de` — Stunden zuvor noch erfolgreich —
 * denselben leeren 202. Es ist keine URL-, sondern eine IP-Sperre, und sie
 * hält über Stunden.
 *
 * Ein leerer Body ist deshalb NIE ein inhaltlicher Befund. Wer ihn als
 * „0 Erwägungsgründe" verbucht, meldet eine stille Null — dieselbe
 * Fehlerklasse wie die gestrippten Schema-Writes vom 12.08.
 *
 * Firecrawl scrapt von FREMDER Infrastruktur und umgeht damit unsere Sperre.
 * Es wird nur angefragt, wenn der Direktweg versagt: kein Guthaben für Seiten,
 * die wir gratis bekommen (Kostendisziplin aus THE-402).
 *
 * ── PROVENIENZ ──
 *
 * Jeder Treffer trägt, über welchen Weg er kam. Ein Bestand, dessen Herkunft
 * man nicht kennt, ist bei der nächsten Abweichung nicht diagnostizierbar.
 */
import axios, { AxiosInstance } from 'axios';

const DEFAULT_FIRECRAWL_API_URL = 'https://api.firecrawl.dev';
const DEFAULT_USER_AGENT = 'TheArchitect-Compliance-Crawler/1.0';

/** Unter dieser Länge ist eine EUR-Lex-Seite keine Rechtsvorschrift, sondern eine Drossel-Antwort. */
export const MIN_LEGAL_HTML_LENGTH = 10_000;

export interface LegalHtmlFetchOptions {
  firecrawlKey?: string;
  firecrawlUrl?: string;
  /** Wartezeiten vor Direkt-Wiederholung in ms. Default [0, 20_000, 75_000]. */
  retryDelaysMs?: number[];
  /** Injizierbar für Tests. */
  directClient?: AxiosInstance;
  firecrawlClient?: AxiosInstance;
  /** Injizierbar für Tests — sonst echtes Warten. */
  sleep?: (ms: number) => Promise<void>;
}

export interface LegalHtmlFetchResult {
  html: string;
  via: 'direct' | 'firecrawl';
  /** Versuche auf dem Direktweg, bevor es klappte oder aufgegeben wurde. */
  directAttempts: number;
}

export class LegalHtmlFetchError extends Error {
  constructor(
    readonly url: string,
    readonly detail: string,
    /** true = Quelle hat gedrosselt (202/leer), false = echter Fehler. */
    readonly throttled: boolean
  ) {
    super(`${url}: ${detail}`);
    this.name = 'LegalHtmlFetchError';
  }
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Holt die HTML-Seite. Direktweg zuerst (kostenlos), Firecrawl nur als Rückfall
 * und nur mit Schlüssel. Wirft, wenn beide Wege nichts Brauchbares liefern —
 * ein leerer Body wird NIE als Inhalt zurückgegeben.
 */
export async function fetchLegalHtml(
  url: string,
  opts: LegalHtmlFetchOptions = {}
): Promise<LegalHtmlFetchResult> {
  const direct =
    opts.directClient ??
    axios.create({ timeout: 60_000, headers: { 'User-Agent': DEFAULT_USER_AGENT } });
  const sleep = opts.sleep ?? wait;
  const delays = opts.retryDelaysMs ?? [0, 20_000, 75_000];

  let lastDetail = 'kein Versuch';
  let attempts = 0;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    attempts++;
    try {
      const res = await direct.get(url, { validateStatus: () => true });
      const html = String(res.data ?? '');
      if (res.status === 200 && html.length >= MIN_LEGAL_HTML_LENGTH) {
        return { html, via: 'direct', directAttempts: attempts };
      }
      lastDetail = `HTTP ${res.status}, Body ${html.length} Zeichen`;
    } catch (err) {
      lastDetail = (err as Error).message.slice(0, 80);
    }
  }

  if (!opts.firecrawlKey) {
    throw new LegalHtmlFetchError(
      url,
      `${lastDetail} — Direktweg gedrosselt und kein FIRECRAWL_API_KEY gesetzt`,
      true
    );
  }

  // Rückfall: Firecrawl holt von fremder Infrastruktur. `rawHtml`, nicht
  // `markdown` — der Recital-Extraktor braucht die Struktur-Container
  // (div.eli-subdivision), die Markdown wegwirft.
  const apiUrl = (opts.firecrawlUrl ?? DEFAULT_FIRECRAWL_API_URL).replace(/\/$/, '');
  const fc =
    opts.firecrawlClient ??
    axios.create({
      timeout: 120_000,
      headers: { Authorization: `Bearer ${opts.firecrawlKey}` },
    });
  let body: { success?: boolean; data?: { rawHtml?: string; html?: string }; error?: string };
  try {
    const res = await fc.post(`${apiUrl}/v1/scrape`, {
      url,
      formats: ['rawHtml'],
      onlyMainContent: false,
    });
    body = res.data;
  } catch (err) {
    throw new LegalHtmlFetchError(url, `Firecrawl-Anfrage fehlgeschlagen: ${(err as Error).message.slice(0, 80)}`, false);
  }
  if (!body?.success) {
    throw new LegalHtmlFetchError(url, `Firecrawl meldet Fehler: ${body?.error ?? 'unbekannt'}`, false);
  }
  const html = body.data?.rawHtml ?? body.data?.html ?? '';
  if (html.length < MIN_LEGAL_HTML_LENGTH) {
    throw new LegalHtmlFetchError(url, `Firecrawl lieferte ${html.length} Zeichen (< ${MIN_LEGAL_HTML_LENGTH})`, false);
  }
  return { html, via: 'firecrawl', directAttempts: attempts };
}
