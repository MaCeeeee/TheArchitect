/**
 * THE-623 / THE-624 — Vektorindex-Gesundheit und automatischer Nachzug.
 *
 * Die reinen Kernfunktionen (buildPoints/planSync/Punkt-ID) sind bereits über
 * sync-corpus-vectors.test.ts gepinnt (das Skript re-exportiert sie aus diesem
 * Service — die unverändert grünen Tests sind der Beweis des verlustfreien
 * Umzugs). Hier steht, was NEU ist: die Health-Messung mit ihrer
 * null-ist-nicht-0-Semantik, und die Drossel + Nie-Werfen-Garantie der
 * Scheduler-Hooks.
 */
import {
  corpusVectorIndexHealth,
  maybeRunVectorDriftCheck,
  runPostCrawlVectorSync,
  syncCorpusVectors,
  __resetVectorSyncForTests,
} from '../services/corpusVectorSync.service';
import { CorpusRegulation, isCorpusConfigured } from '../services/corpusClient.service';

jest.mock('../services/corpusClient.service', () => ({
  CorpusRegulation: jest.fn(),
  isCorpusConfigured: jest.fn(() => true),
  getCorpusConnection: jest.fn(),
}));

// Qdrant-Client-Konstruktor gemockt — jede Instanz teilt diese Spies.
const countMock = jest.fn();
const scrollMock = jest.fn();
const upsertMock = jest.fn();
jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn(() => ({ count: countMock, scroll: scrollMock, upsert: upsertMock })),
}));

const corpusModelMock = CorpusRegulation as unknown as jest.Mock;
const configuredMock = isCorpusConfigured as unknown as jest.Mock;

/** Korpus-Model-Stub: estimatedDocumentCount + find().select().lean(). */
function stubCorpusModel(args: { count?: number | Error; docs?: unknown[] }) {
  corpusModelMock.mockReturnValue({
    estimatedDocumentCount: jest.fn(async () => {
      if (args.count instanceof Error) throw args.count;
      return args.count ?? 0;
    }),
    find: jest.fn(() => ({
      select: jest.fn(() => ({ lean: jest.fn(async () => args.docs ?? []) })),
    })),
  });
}

const vec = () => Array.from({ length: 768 }, () => 0.1);
const corpusDoc = (key: string) => ({
  regulationKey: key,
  versionHash: 'h',
  source: 'esg-rating-de',
  paragraphNumber: 'Art. 1',
  title: 'T',
  effectiveFrom: '2026-07-02T00:00:00.000Z',
  jurisdiction: 'EU',
  language: 'de',
  embedding: vec(),
});

beforeEach(() => {
  jest.clearAllMocks();
  __resetVectorSyncForTests();
  process.env.QDRANT_URL = 'http://qdrant-test:6333';
  process.env.VECTOR_SYNC_ENABLED = 'true';
  process.env.VECTOR_SYNC_INTERVAL_MINUTES = '360';
  configuredMock.mockReturnValue(true);
});

describe('corpusVectorIndexHealth (THE-623)', () => {
  it('drift 0 ⇒ ok — beide Seiten gemessen', async () => {
    countMock.mockResolvedValue({ count: 1746 });
    stubCorpusModel({ count: 1746 });
    expect(await corpusVectorIndexHealth()).toEqual({ points: 1746, corpusCount: 1746, drift: 0, ok: true });
  });

  it('der 2026-08-06-Zustand ist nicht mehr grün: 1746 gegen 1532 ⇒ drift 214, ok false', async () => {
    countMock.mockResolvedValue({ count: 1532 });
    stubCorpusModel({ count: 1746 });
    expect(await corpusVectorIndexHealth()).toEqual({ points: 1532, corpusCount: 1746, drift: 214, ok: false });
  });

  it('Qdrant unerreichbar ⇒ points null, nicht 0 — „leer" und „weg" sind verschiedene Diagnosen', async () => {
    countMock.mockRejectedValue(new Error('ECONNREFUSED'));
    stubCorpusModel({ count: 1746 });
    expect(await corpusVectorIndexHealth()).toEqual({ points: null, corpusCount: 1746, drift: null, ok: false });
  });

  it('Korpus nicht konfiguriert ⇒ corpusCount null, kein Wurf', async () => {
    countMock.mockResolvedValue({ count: 10 });
    configuredMock.mockReturnValue(false);
    expect(await corpusVectorIndexHealth()).toEqual({ points: 10, corpusCount: null, drift: null, ok: false });
  });
});

describe('syncCorpusVectors (THE-624)', () => {
  it('schreibt nur Fehlendes und beweist aus dem Ziel selbst nach', async () => {
    stubCorpusModel({ docs: [corpusDoc('a:1'), corpusDoc('b:2')] });
    scrollMock.mockResolvedValue({ points: [], next_page_offset: null }); // Ziel leer
    upsertMock.mockResolvedValue({});
    countMock.mockResolvedValue({ count: 2 });

    const res = await syncCorpusVectors({ apply: true });
    expect(res.planned).toBe(2);
    expect(res.written).toBe(2);
    expect(res.pointsAfter).toBe(2);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('Dry-Run plant, schreibt aber nicht', async () => {
    stubCorpusModel({ docs: [corpusDoc('a:1')] });
    scrollMock.mockResolvedValue({ points: [], next_page_offset: null });

    const res = await syncCorpusVectors({ apply: false });
    expect(res.planned).toBe(1);
    expect(res.written).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('wirft ohne QDRANT_URL — das Ziel darf nicht geraten werden', async () => {
    process.env.QDRANT_URL = '';
    await expect(syncCorpusVectors()).rejects.toThrow('QDRANT_URL');
  });
});

describe('maybeRunVectorDriftCheck — Drossel + Nie-Werfen (THE-624)', () => {
  // Die Drossel misst gegen die Prozess-Uhr, die nach dem Test-Reset bei 0
  // steht. Eine Test-Uhr UNTER dem Intervall (360 min = 21,6 Mio ms) würde
  // jeden Aufruf als Drossel-Skip enden lassen — und die Tests wären grün aus
  // dem falschen Grund (so beim ersten Wurf dieser Suite passiert). Deshalb
  // liegt T0 deutlich ÜBER dem Intervall.
  const T0 = 100_000_000;

  it('zieht bei Drift nach und schließt die Lücke in einem Takt', async () => {
    countMock.mockResolvedValue({ count: 0 });
    stubCorpusModel({ count: 1, docs: [corpusDoc('a:1')] });
    scrollMock.mockResolvedValue({ points: [], next_page_offset: null });
    upsertMock.mockResolvedValue({});

    const res = await maybeRunVectorDriftCheck(T0);
    expect(res?.written).toBe(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('läuft höchstens einmal je Intervall — der zweite Takt ist ein No-op', async () => {
    countMock.mockResolvedValue({ count: 5 });
    stubCorpusModel({ count: 5 });

    await maybeRunVectorDriftCheck(T0);
    expect(countMock).toHaveBeenCalled(); // der erste Takt hat wirklich gemessen
    countMock.mockClear();
    // 1 Minute später, Intervall ist 360 Minuten:
    const res = await maybeRunVectorDriftCheck(T0 + 60_000);
    expect(res).toBeNull();
    expect(countMock).not.toHaveBeenCalled();
  });

  it('ohne Drift kein Nachzug', async () => {
    countMock.mockResolvedValue({ count: 7 });
    stubCorpusModel({ count: 7 });
    const res = await maybeRunVectorDriftCheck(T0);
    expect(res).toBeNull();
    expect(countMock).toHaveBeenCalled(); // gemessen wurde — nachgezogen nicht
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('VECTOR_SYNC_ENABLED=false schaltet ab', async () => {
    process.env.VECTOR_SYNC_ENABLED = 'false';
    const res = await maybeRunVectorDriftCheck(T0);
    expect(res).toBeNull();
    expect(countMock).not.toHaveBeenCalled();
  });

  it('wirft NIE — ein kaputter Korpus wird geloggt, nicht eskaliert (Muster runCrawlJob)', async () => {
    countMock.mockResolvedValue({ count: 3 });
    stubCorpusModel({ count: new Error('corpus down') });
    // health liefert corpusCount null → drift null → kein Nachzug, kein Wurf
    await expect(maybeRunVectorDriftCheck(T0)).resolves.toBeNull();
    expect(countMock).toHaveBeenCalled(); // der Pfad wurde betreten, nicht weggedrosselt
  });
});

describe('runPostCrawlVectorSync — der Normalfall nach dem Scheduler-Crawl (THE-624)', () => {
  it('übernimmt frisch gecrawlte Vektoren sofort', async () => {
    stubCorpusModel({ docs: [corpusDoc('neu:1')] });
    scrollMock.mockResolvedValue({ points: [], next_page_offset: null });
    upsertMock.mockResolvedValue({});
    countMock.mockResolvedValue({ count: 1 });

    const res = await runPostCrawlVectorSync();
    expect(res?.written).toBe(1);
  });

  it('wirft nie — der periodische Check holt einen Ausfall nach', async () => {
    corpusModelMock.mockImplementation(() => {
      throw new Error('mongo weg');
    });
    await expect(runPostCrawlVectorSync()).resolves.toBeNull();
  });
});
