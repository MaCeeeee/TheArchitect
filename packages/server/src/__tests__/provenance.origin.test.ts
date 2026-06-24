/**
 * REQ-PROV-002.2 — Origin-Metadaten in createTemporaryGraph.
 * Mockt die Neo4j-Transaktion und inspiziert die erzeugten CREATE-Operationen:
 * Origin-Felder werden nur bei Connector-Syncs gesetzt, file uploads bleiben
 * byte-identisch zum Alt-Pfad (kein null-Rauschen).
 */
const txMock = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypherTransaction: (...args: unknown[]) => txMock(...args),
  runCypher: jest.fn(),
}));

import { createTemporaryGraph, ParseResult } from '../services/upload.service';

type Op = { query: string; params: Record<string, unknown> };

/** Flatten all batched operations passed to runCypherTransaction. */
function capturedOps(): Op[] {
  return txMock.mock.calls.flatMap((call) => call[0] as Op[]);
}

const baseParsed: ParseResult = {
  elements: [
    {
      id: 'el-1', name: 'Service A', type: 'application_component', layer: 'application',
      description: '', status: 'active', riskLevel: 'low', maturityLevel: 3,
    },
  ],
  connections: [
    { id: 'c-1', sourceId: 'el-1', targetId: 'el-1', type: 'serving', label: '' },
  ],
  warnings: [],
  format: 'connector:github',
};

beforeEach(() => txMock.mockReset().mockResolvedValue(undefined));

describe('createTemporaryGraph origin (REQ-PROV-002.2)', () => {
  it('schreibt Origin-Felder als $origin-Param bei Connector-Sync', async () => {
    await createTemporaryGraph(baseParsed, {
      origin: { sourceRef: 'https://api.github.com', connectorConfigId: 'gh-main' },
    });

    const ops = capturedOps();
    const elOp = ops.find((o) => o.query.includes('CREATE (e:ArchitectureElement'))!;
    expect(elOp.query).toContain('SET e += $origin');
    const origin = elOp.params.origin as Record<string, unknown>;
    expect(origin.sourceRef).toBe('https://api.github.com');
    expect(origin.connectorConfigId).toBe('gh-main');
    expect(typeof origin.importedAt).toBe('string'); // defaultet auf `now`
  });

  it('setzt Origin auch auf der CONNECTS_TO-Relationship', async () => {
    await createTemporaryGraph(baseParsed, {
      origin: { sourceRef: 'https://api.github.com', connectorConfigId: 'gh-main' },
    });

    const connOp = capturedOps().find((o) => o.query.includes('CREATE (s)-[r:CONNECTS_TO'))!;
    expect(connOp.query).toContain('SET r += $origin');
    expect((connOp.params.origin as Record<string, unknown>).sourceRef).toBe('https://api.github.com');
  });

  it('respektiert ein explizit übergebenes importedAt', async () => {
    const ts = '2026-01-01T00:00:00.000Z';
    await createTemporaryGraph(baseParsed, {
      origin: { sourceRef: 'x', connectorConfigId: 'y', importedAt: ts },
    });
    const elOp = capturedOps().find((o) => o.query.includes('CREATE (e:'))!;
    expect((elOp.params.origin as Record<string, unknown>).importedAt).toBe(ts);
  });

  it('lässt undefinierte Origin-Felder weg (kein null-Rauschen)', async () => {
    await createTemporaryGraph(baseParsed, { origin: { connectorConfigId: 'only-id' } });
    const origin = capturedOps().find((o) => o.query.includes('CREATE (e:'))!.params
      .origin as Record<string, unknown>;
    expect('sourceRef' in origin).toBe(false);
    expect(origin.connectorConfigId).toBe('only-id');
  });

  describe('Backward-Compat (file upload ohne origin)', () => {
    it('liefert eine leere origin-Map → SET x += {} ist No-Op', async () => {
      await createTemporaryGraph({ ...baseParsed, format: 'csv' });
      const elOp = capturedOps().find((o) => o.query.includes('CREATE (e:'))!;
      expect(elOp.params.origin).toEqual({});
    });

    it('lässt provenance/source unangetastet (Kein-Overwrite)', async () => {
      await createTemporaryGraph({ ...baseParsed, format: 'csv' });
      const elOp = capturedOps().find((o) => o.query.includes('CREATE (e:'))!;
      expect(elOp.query).toContain("provenance: 'import'");
      expect(elOp.query).toContain('source: $source');
      expect(elOp.params.source).toBe('csv');
    });
  });
});
