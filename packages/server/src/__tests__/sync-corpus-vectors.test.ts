/**
 * THE-621 — Nachzug des Prod-Vektorindex.
 *
 * Der wichtigste Prüfsatz ist die Punkt-Kennung: sie MUSS zeichengleich mit der des
 * Crawlers sein. Weicht sie ab, schreibt der Nachzug Dubletten statt zu überschreiben
 * — der Index wüchse still auseinander, und genau diese Sorte stiller Divergenz ist
 * der Anlass des Tickets. Deshalb wird hier gegen die Crawler-Implementierung selbst
 * geprüft, nicht gegen eine abgeschriebene Erwartung.
 */
import {
  regulationKeyToPointId,
  buildPoints,
  planSync,
  EMBEDDING_DIM,
  CORPUS_COLLECTION,
  type CorpusVectorSource,
} from '../scripts/sync-corpus-vectors';

/**
 * Erwartete Kennungen, EINMAL aus `compliance-crawler/src/embeddings/qdrant.ts`
 * (`regulationKeyToPointId`) berechnet und hier festgenagelt.
 *
 * Warum abgeschrieben statt importiert: ein direkter Import über die Paketgrenze
 * verletzt `rootDir` des Server-Pakets (TS6059) und färbt den Typcheck rot. Die
 * saubere Lösung ist, die Formel nach `@thearchitect/shared` zu heben, damit beide
 * Seiten aus einer Quelle lesen — das gehört zu THE-621 (Ursachenbehebung), nicht
 * in den Nachzug. Bis dahin sind diese drei Werte der Vertrag: weicht eine Seite
 * ab, schreibt der Nachzug Dubletten statt zu überschreiben.
 */
const CRAWLER_POINT_IDS: Record<string, string> = {
  'esg-rating-de:art-1': '44a56286-0389-7406-f5ac-86dabe825637',
  'dora:art-5': 'c7279bdb-0280-e670-3971-ff8682d6c2e5',
  'nis2:art-21': '05ecfabd-1f71-1743-e531-37352b114b07',
};
/** Muss `CORPUS_COLLECTION` im Crawler entsprechen. */
const CRAWLER_COLLECTION = 'regulations-corpus';

const vec = (n = EMBEDDING_DIM): number[] => Array.from({ length: n }, (_, i) => i / n);

const doc = (over: Partial<CorpusVectorSource> = {}): CorpusVectorSource => ({
  regulationKey: 'esg-rating-de:art-1',
  versionHash: 'abc123',
  source: 'esg-rating-de',
  paragraphNumber: 'Art. 1',
  title: 'Gegenstand',
  effectiveFrom: new Date('2026-07-02T00:00:00.000Z'),
  jurisdiction: 'EU',
  language: 'de',
  embedding: vec(),
  ...over,
});

describe('sync-corpus-vectors — Verträglichkeit mit dem Crawler (THE-621)', () => {
  it('leitet dieselbe Punkt-ID ab wie der Crawler', () => {
    for (const [key, expected] of Object.entries(CRAWLER_POINT_IDS)) {
      expect(regulationKeyToPointId(key)).toBe(expected);
    }
  });

  it('erzeugt UUID-Form — Qdrant nimmt nur UUID oder vorzeichenlose Ganzzahl', () => {
    expect(regulationKeyToPointId('esg-rating-en:art-42')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('schreibt in dieselbe Collection wie der Crawler', () => {
    expect(CORPUS_COLLECTION).toBe(CRAWLER_COLLECTION);
  });

  it('die ID ist stabil über Läufe hinweg (Upsert überschreibt, dupliziert nicht)', () => {
    expect(regulationKeyToPointId('esg-rating-de:art-1')).toBe(regulationKeyToPointId('esg-rating-de:art-1'));
    expect(regulationKeyToPointId('esg-rating-de:art-1')).not.toBe(regulationKeyToPointId('esg-rating-en:art-1'));
  });
});

describe('buildPoints', () => {
  it('baut das Payload nach dem Crawler-Schema, ohne Volltext', () => {
    const { points } = buildPoints([doc()]);
    expect(points).toHaveLength(1);
    expect(points[0].payload).toEqual({
      regulationKey: 'esg-rating-de:art-1',
      versionHash: 'abc123',
      source: 'esg-rating-de',
      paragraphNumber: 'Art. 1',
      title: 'Gegenstand',
      effectiveFrom: '2026-07-02',
      jurisdiction: 'EU',
      language: 'de',
    });
    expect(points[0].payload).not.toHaveProperty('fullText');
    expect(points[0].vector).toHaveLength(EMBEDDING_DIM);
  });

  it('nimmt summary mit, wenn vorhanden — und lässt das Feld sonst weg', () => {
    expect(buildPoints([doc({ summary: 'kurz' })]).points[0].payload.summary).toBe('kurz');
    expect(buildPoints([doc()]).points[0].payload).not.toHaveProperty('summary');
  });

  it('verarbeitet effectiveFrom auch als ISO-String', () => {
    const { points } = buildPoints([doc({ effectiveFrom: '2026-07-02T00:00:00.000Z' })]);
    expect(points[0].payload.effectiveFrom).toBe('2026-07-02');
  });

  // Der Kern: ein Dokument ohne Vektor darf NICHT als Erfolg durchgehen. Genau so
  // entstand die Lücke, die das Ticket ausgelöst hat.
  it('überspringt Dokumente ohne Vektor und meldet sie', () => {
    const { points, skipped } = buildPoints([doc({ embedding: undefined }), doc({ embedding: [] })]);
    expect(points).toHaveLength(0);
    expect(skipped.map((s) => s.reason)).toEqual(['no-embedding', 'no-embedding']);
  });

  it('überspringt Vektoren falscher Dimension und nennt die Zahlen', () => {
    const { points, skipped } = buildPoints([doc({ embedding: vec(384) })]);
    expect(points).toHaveLength(0);
    expect(skipped[0].reason).toBe('wrong-dim');
    expect(skipped[0].detail).toBe(`384 != ${EMBEDDING_DIM}`);
  });

  it('trennt Brauchbares von Unbrauchbarem im selben Lauf', () => {
    const { points, skipped } = buildPoints([
      doc({ regulationKey: 'a:1' }),
      doc({ regulationKey: 'b:2', embedding: undefined }),
      doc({ regulationKey: 'c:3' }),
    ]);
    expect(points.map((p) => p.payload.regulationKey)).toEqual(['a:1', 'c:3']);
    expect(skipped.map((s) => s.regulationKey)).toEqual(['b:2']);
  });
});

describe('planSync', () => {
  const points = buildPoints([doc({ regulationKey: 'a:1' }), doc({ regulationKey: 'b:2' })]).points;

  it('schreibt nur, was im Ziel fehlt', () => {
    const present = new Set([regulationKeyToPointId('a:1')]);
    const plan = planSync(points, present, false);
    expect(plan.toUpsert.map((p) => p.payload.regulationKey)).toEqual(['b:2']);
    expect(plan.alreadyPresent).toBe(1);
  });

  it('fasst mit --force alles an', () => {
    const present = new Set([regulationKeyToPointId('a:1'), regulationKeyToPointId('b:2')]);
    const plan = planSync(points, present, true);
    expect(plan.toUpsert).toHaveLength(2);
    expect(plan.alreadyPresent).toBe(0);
  });

  it('ist ohne --force ein No-op, wenn der Index auf Stand ist', () => {
    const present = new Set(points.map((p) => p.id));
    expect(planSync(points, present, false).toUpsert).toHaveLength(0);
  });

  it('schreibt bei leerem Ziel alles', () => {
    expect(planSync(points, new Set(), false).toUpsert).toHaveLength(2);
  });
});
