/**
 * REQ-PROV-001.4 — Backfill-Script. Neo4j gemockt (runCypher captured).
 */
const runCypherMock = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => runCypherMock(...args),
  connectNeo4j: jest.fn(),
  getNeo4jDriver: () => ({ close: jest.fn() }),
}));

import { runBackfill } from '../scripts/backfill-provenance';

const intVal = (n: number) => ({ toNumber: () => n });
const rec = (obj: Record<string, unknown>) => ({ get: (k: string) => obj[k] });

/** Standard-Fixture: 5 Elemente ohne provenance; Connections: 3×ai-heal, 2×csv, 10×ohne source. */
function primeReads() {
  runCypherMock.mockImplementation((query: string) => {
    if (query.includes('MATCH (e:ArchitectureElement)') && query.includes('count(e)')) {
      return Promise.resolve([rec({ cnt: intVal(5) })]);
    }
    if (query.includes('CONNECTS_TO') && query.includes('count(r)')) {
      return Promise.resolve([
        rec({ source: 'ai-heal', cnt: intVal(3) }),
        rec({ source: 'csv', cnt: intVal(2) }),
        rec({ source: null, cnt: intVal(10) }),
      ]);
    }
    return Promise.resolve([]); // SET-Queries liefern nichts
  });
}

beforeEach(() => {
  runCypherMock.mockReset();
  primeReads();
});

describe('runBackfill (REQ-PROV-001.4)', () => {
  describe('AC-3 — Dry-Run schreibt NICHTS', () => {
    it('ruft keine SET-Query auf, meldet aber korrekte Counts', async () => {
      const report = await runBackfill({ apply: false });
      const setCalls = runCypherMock.mock.calls.filter(([q]) => /\bSET\b/.test(q as string));
      expect(setCalls).toHaveLength(0);
      expect(report.applied).toBe(false);
      expect(report.elements.nullProvenance).toBe(5);
      expect(report.elements.updated).toBe(0);
      expect(report.connections.total).toBe(15);
      expect(report.connections.updated).toBe(0);
    });
  });

  describe('AC-2 — Apply leitet provenance ab, lässt source/confidence unangetastet', () => {
    it('mappt source via deriveProvenance (ai-heal→ai_generated, csv→import, null→user)', async () => {
      const report = await runBackfill({ apply: true });
      const bySource = Object.fromEntries(report.connections.bySource.map((g) => [String(g.source), g.provenance]));
      expect(bySource['ai-heal']).toBe('ai_generated');
      expect(bySource['csv']).toBe('import');
      expect(bySource['null']).toBe('user');
      expect(report.connections.updated).toBe(15);
      expect(report.elements.updated).toBe(5);
    });

    it('SET-Queries setzen NUR provenance — niemals source oder confidence', async () => {
      await runBackfill({ apply: true });
      const setCalls = runCypherMock.mock.calls.filter(([q]) => /\bSET\b/.test(q as string));
      expect(setCalls.length).toBeGreaterThan(0);
      for (const [q] of setCalls) {
        expect(q as string).toMatch(/SET (e|r)\.provenance/);
        expect(q as string).not.toMatch(/SET .*\.source/);
        expect(q as string).not.toMatch(/\.confidence/);
      }
    });
  });

  describe('AC-1 — Idempotenz: jeder Write ist durch "provenance IS NULL" gescopet', () => {
    it('alle SET-Queries tragen den IS-NULL-Guard', async () => {
      await runBackfill({ apply: true });
      const setCalls = runCypherMock.mock.calls.filter(([q]) => /\bSET\b/.test(q as string));
      for (const [q] of setCalls) {
        expect(q as string).toMatch(/provenance IS NULL/);
      }
    });

    it('zweiter Lauf gegen "alles bereits gesetzt" (0 null) schreibt nichts', async () => {
      runCypherMock.mockReset();
      runCypherMock.mockImplementation((query: string) => {
        if (query.includes('count(e)')) return Promise.resolve([rec({ cnt: intVal(0) })]);
        if (query.includes('count(r)')) return Promise.resolve([]); // keine null-provenance Edges
        return Promise.resolve([]);
      });
      const report = await runBackfill({ apply: true });
      const setCalls = runCypherMock.mock.calls.filter(([q]) => /\bSET\b/.test(q as string));
      expect(setCalls).toHaveLength(0);
      expect(report.elements.updated).toBe(0);
      expect(report.connections.updated).toBe(0);
    });
  });
});
