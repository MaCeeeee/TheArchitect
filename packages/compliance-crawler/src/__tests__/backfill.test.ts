/**
 * THE-622 (REQ-EMBED-001.1) — der Crawl hinterlässt keine unembeddeten Dokumente.
 *
 * Kern-Regression: ein Dokument liegt in Mongo ohne `embedding` → der Nachlauf
 * embeddet es. Genau dieser Zustand (DORA, 2026-07-12: sechs Artikel in Mongo,
 * null Vektoren, kein Signal) ist der Anlass des Parent-Tickets THE-466.
 *
 * Stil der Suite: kein echtes Mongo (validateSync-Konvention) — Regulation.find
 * und tryEmbedAndIndex sind gemockt; geprüft wird die Logik der geteilten
 * Backfill-Funktion und die Verdrahtung der Crawl-Route.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';

import Fastify from 'fastify';
import { runEmbedBackfill } from '../embeddings/backfill';
import { Regulation } from '../db/regulation.model';
import { tryEmbedAndIndex } from '../embeddings';

jest.mock('../db/regulation.model', () => ({
  Regulation: {
    find: jest.fn(),
    estimatedDocumentCount: jest.fn(),
  },
}));

jest.mock('../embeddings', () => {
  const actual = jest.requireActual('../embeddings');
  return {
    ...actual,
    tryEmbedAndIndex: jest.fn(),
    isEmbeddingConfigured: jest.fn(() => true),
    getQdrantClient: jest.fn(() => ({})),
    countPoints: jest.fn(async () => 2),
  };
});

const findMock = Regulation.find as unknown as jest.Mock;
const embedMock = tryEmbedAndIndex as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runEmbedBackfill (THE-622)', () => {
  const cfg = { sidecarUrl: 'http://sidecar', qdrantUrl: 'http://qdrant', qdrantApiKey: undefined };

  it('embeddet ein Dokument, das in Mongo ohne Vektor liegt — die DORA-Regression', async () => {
    const doc = { _id: 'a', regulationKey: 'dora:art-5' };
    findMock.mockResolvedValueOnce([doc]);
    embedMock.mockResolvedValueOnce({ ok: true, regulationId: 'a' });

    const res = await runEmbedBackfill({ embeddingConfig: cfg });

    expect(res).toEqual({ total: 1, embedded: 1, failed: 0, errors: [] });
    expect(embedMock).toHaveBeenCalledWith(doc, cfg);
    // Ohne force werden NUR vektorlose Dokumente gesucht — vorhandene Vektoren
    // werden nicht angefasst (Idempotenz-Hälfte 1).
    expect(findMock).toHaveBeenCalledWith({
      $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
    });
  });

  it('zweiter Lauf ohne Brachliegendes ist ein No-op: total 0, kein Embed-Aufruf', async () => {
    findMock.mockResolvedValueOnce([]);
    const res = await runEmbedBackfill({ embeddingConfig: cfg });
    expect(res).toEqual({ total: 0, embedded: 0, failed: 0, errors: [] });
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('force sucht alles, nicht nur Vektorloses', async () => {
    findMock.mockResolvedValueOnce([]);
    await runEmbedBackfill({ embeddingConfig: cfg, force: true });
    expect(findMock).toHaveBeenCalledWith({});
  });

  it('Einzel-Fehler werden gezählt und benannt, nicht geworfen', async () => {
    findMock.mockResolvedValueOnce([
      { _id: 'a' },
      { _id: 'b' },
    ]);
    embedMock
      .mockResolvedValueOnce({ ok: true, regulationId: 'a' })
      .mockResolvedValueOnce({ ok: false, regulationId: 'b', error: 'sidecar 503' });

    const res = await runEmbedBackfill({ embeddingConfig: cfg });
    expect(res.embedded).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.errors).toEqual([{ regulationId: 'b', error: 'sidecar 503' }]);
  });
});

describe('POST /crawl — Reconcile-Nachlauf ist Teil der Route (THE-622)', () => {
  // Die Registry liefert keinen Parser → die Quellen-Schleife schreibt nichts.
  // Genau so isoliert der Test die Aussage: der Nachlauf läuft UNABHÄNGIG davon,
  // ob der Crawl selbst etwas Neues brachte.
  jest.mock('../sources/source-registry', () => ({
    getSourceEntry: jest.fn(() => undefined),
    SOURCE_ENTRIES: [],
  }));

  async function buildApp() {
    const { crawlRoutes } = await import('../routes/crawl');
    const app = Fastify({ logger: false });
    await app.register(crawlRoutes);
    return app;
  }

  it('die Antwort trägt reconcile — der Backfill lief als Teil des Crawls', async () => {
    findMock.mockResolvedValue([]); // Nachlauf findet nichts Brachliegendes
    const countMock = (Regulation as unknown as { estimatedDocumentCount: jest.Mock }).estimatedDocumentCount;
    countMock.mockResolvedValue(2); // == countPoints-Mock (2) → keine Drift-Warnung

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/crawl',
      payload: { sources: ['nis2'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reconcile).toEqual({ total: 0, embedded: 0, failed: 0, errors: [] });
    await app.close();
  });

  it('skipEmbedding lässt den Nachlauf aus: reconcile ist null, kein Find-Aufruf', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/crawl',
      payload: { sources: ['nis2'], skipEmbedding: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().reconcile).toBeNull();
    expect(findMock).not.toHaveBeenCalled();
    await app.close();
  });
});
