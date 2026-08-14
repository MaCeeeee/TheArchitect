/**
 * THE-681: Rückfall auf Firecrawl, wenn EUR-Lex die IP drosselt.
 *
 * Alle Wege mit injizierten Clients geprüft — kein Netzzugriff. Die
 * LIVE-Verifikation des Firecrawl-Pfads steht aus, solange kein
 * FIRECRAWL_API_KEY vorliegt; das ist im Ticket ausgewiesen.
 */
import { fetchLegalHtml, LegalHtmlFetchError, MIN_LEGAL_HTML_LENGTH } from '../lib/legalHtmlFetch';

const GUT = '<html>' + 'x'.repeat(MIN_LEGAL_HTML_LENGTH) + '</html>';
const URL = 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32002L0058';

/** EUR-Lex-Drossel: HTTP 202 mit LEEREM Body — kein Fehler, kein Inhalt. */
const drossel = { status: 202, data: '' };

function client(antworten: Array<{ status: number; data: string }>) {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    get: jest.fn(async (url: string) => {
      calls.push(url);
      return antworten[Math.min(i++, antworten.length - 1)];
    }),
  };
}

const sofort = async () => undefined; // kein echtes Warten im Test

describe('fetchLegalHtml', () => {
  it('nimmt den Direktweg, wenn er trägt — Firecrawl wird gar nicht erst gefragt', async () => {
    const direct = client([{ status: 200, data: GUT }]);
    const fc = { post: jest.fn() };
    const r = await fetchLegalHtml(URL, {
      directClient: direct as never,
      firecrawlClient: fc as never,
      firecrawlKey: 'fc-key',
      sleep: sofort,
    });
    expect(r.via).toBe('direct');
    expect(r.directAttempts).toBe(1);
    expect(fc.post).not.toHaveBeenCalled(); // Kostendisziplin: kein Guthaben verbrannt
  });

  it('wiederholt direkt und nimmt den späteren Erfolg', async () => {
    const direct = client([drossel, { status: 200, data: GUT }]);
    const r = await fetchLegalHtml(URL, {
      directClient: direct as never,
      retryDelaysMs: [0, 10, 20],
      sleep: sofort,
    });
    expect(r.via).toBe('direct');
    expect(r.directAttempts).toBe(2);
  });

  it('202 mit leerem Body gilt NIE als Inhalt — auch nicht mit Status 200', async () => {
    const direct = client([{ status: 200, data: '' }]);
    await expect(
      fetchLegalHtml(URL, { directClient: direct as never, retryDelaysMs: [0], sleep: sofort })
    ).rejects.toThrow(LegalHtmlFetchError);
  });

  it('fällt nach erschöpften Direktversuchen auf Firecrawl zurück — mit rawHtml, nicht markdown', async () => {
    const direct = client([drossel]);
    const fc = {
      post: jest.fn(async () => ({ data: { success: true, data: { rawHtml: GUT } } })),
    };
    const r = await fetchLegalHtml(URL, {
      directClient: direct as never,
      firecrawlClient: fc as never,
      firecrawlKey: 'fc-key',
      retryDelaysMs: [0, 10],
      sleep: sofort,
    });
    expect(r.via).toBe('firecrawl');
    expect(r.directAttempts).toBe(2);
    const body = fc.post.mock.calls[0][1] as { formats: string[]; onlyMainContent: boolean };
    // rawHtml ist Pflicht: markdown würde div.eli-subdivision wegwerfen,
    // und genau daran hängt die Recital-Extraktion.
    expect(body.formats).toEqual(['rawHtml']);
    expect(body.onlyMainContent).toBe(false);
  });

  it('ohne Schlüssel bleibt es beim Befund — die Drossel wird als solche gemeldet', async () => {
    const direct = client([drossel]);
    const err = await fetchLegalHtml(URL, {
      directClient: direct as never,
      retryDelaysMs: [0],
      sleep: sofort,
    }).catch((e) => e as LegalHtmlFetchError);
    expect(err).toBeInstanceOf(LegalHtmlFetchError);
    expect((err as LegalHtmlFetchError).throttled).toBe(true);
    expect((err as LegalHtmlFetchError).message).toContain('FIRECRAWL_API_KEY');
  });

  it('kurze Firecrawl-Antwort wird verworfen statt durchgereicht', async () => {
    const direct = client([drossel]);
    const fc = { post: jest.fn(async () => ({ data: { success: true, data: { rawHtml: '<html/>' } } })) };
    await expect(
      fetchLegalHtml(URL, {
        directClient: direct as never,
        firecrawlClient: fc as never,
        firecrawlKey: 'fc-key',
        retryDelaysMs: [0],
        sleep: sofort,
      })
    ).rejects.toThrow(/Zeichen/);
  });

  it('Firecrawl-Fehler wird NICHT als Drossel verbucht — die Ursachen bleiben getrennt', async () => {
    const direct = client([drossel]);
    const fc = { post: jest.fn(async () => ({ data: { success: false, error: 'quota exceeded' } })) };
    const err = await fetchLegalHtml(URL, {
      directClient: direct as never,
      firecrawlClient: fc as never,
      firecrawlKey: 'fc-key',
      retryDelaysMs: [0],
      sleep: sofort,
    }).catch((e) => e as LegalHtmlFetchError);
    expect((err as LegalHtmlFetchError).throttled).toBe(false);
    expect((err as LegalHtmlFetchError).message).toContain('quota exceeded');
  });
});
