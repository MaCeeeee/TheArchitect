/**
 * recomputeAssessment (Slice 3 follow-up / THE-356+THE-360). Real pipeline + real
 * trace; persistence (Neo4j load/store + Mongo) mocked.
 *
 * Proves the Notar loop: a human attestation materializes the trace path → the
 * field flips to 'present' on the PERSISTED graph, and that is written back.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../services/wfcomp/persist', () => ({
  persistLiftedGraph: jest.fn(),
  loadLiftedGraph: jest.fn(),
}));
jest.mock('../models/WfcompAssessment', () => ({
  WfcompAssessment: { findOne: jest.fn(), updateOne: jest.fn() },
}));

import { recomputeAssessment } from '../services/wfcomp/store';
import { runAssessment } from '../services/wfcomp/assess';
import { persistLiftedGraph, loadLiftedGraph } from '../services/wfcomp/persist';
import { WfcompAssessment } from '../models/WfcompAssessment';
import type { WfcompGapReport } from '@thearchitect/shared';

const mockPersist = persistLiftedGraph as jest.Mock;
const mockLoad = loadLiftedGraph as jest.Mock;
const mockFindOne = WfcompAssessment.findOne as jest.Mock;
const mockUpdate = WfcompAssessment.updateOne as jest.Mock;

const fixture = (n: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'wfcomp', `${n}.json`), 'utf-8'));

/** lean()-able stub for findOne(filter, projection). */
const leanOf = (value: unknown) => ({ lean: () => Promise.resolve(value) });

beforeEach(() => {
  mockPersist.mockReset();
  mockLoad.mockReset();
  mockFindOne.mockReset();
  mockUpdate.mockReset();
  mockFindOne.mockReturnValue(leanOf(null));
  mockUpdate.mockResolvedValue({});
});

describe('recomputeAssessment', () => {
  it('a human attestation flips the deterministic gap (lit. d) to present + persists the update', async () => {
    // The persisted graph = the lifted graph of a workflow missing its recipient (gap: d).
    const { report: before, lifted } = await runAssessment(fixture('missing-recipient'));
    expect(before.fields.find((f) => f.litera === 'd')?.status).toBe('missing');
    mockLoad.mockResolvedValue(lifted);

    const report = await recomputeAssessment({
      projectId: 'p1',
      wfcompId: 'wf1',
      attestations: [{ litera: 'd', value: 'ACME Processing GmbH' }],
      attestedBy: 'u1',
    });

    // a person made it green — not the LLM
    expect(report.fields.find((f) => f.litera === 'd')?.status).toBe('present');

    // the UPDATED graph (with the materialized path) is persisted back, tenant-scoped
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist).toHaveBeenCalledWith('p1', 'wf1', expect.objectContaining({ elements: expect.any(Array) }));

    // the verdict snapshot + attester are written to the existing record
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = mockUpdate.mock.calls[0];
    expect(filter).toEqual({ projectId: 'p1', wfcompId: 'wf1' });
    expect(update.$set.gapReport).toBe(report);
    expect(update.$set.assessedBy).toBe('u1');
  });

  it('throws (→ 404 at the route) when there is no persisted assessment', async () => {
    mockLoad.mockResolvedValue({ elements: [], edges: [] });
    await expect(
      recomputeAssessment({ projectId: 'p1', wfcompId: 'ghost', attestations: [] }),
    ).rejects.toThrow('no persisted assessment to recompute');
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('carries the prior LLM suggestion over, so a still-open field keeps its confirm mode', async () => {
    const { lifted } = await runAssessment(fixture('missing-recipient'));
    mockLoad.mockResolvedValue(lifted);
    // a prior assessment had a confirm-suggestion for lit. b (purpose)
    const prior: Pick<WfcompGapReport, 'fields'> = {
      fields: [
        {
          litera: 'b',
          criticality: 'HART',
          status: 'needs_attestation',
          mode: 'confirm',
          suggestion: { litera: 'b', value: 'Manage newsletter subscriptions', confidence: 0.9, rationale: 'r', provenance: 'ai_generated' },
        },
      ],
    };
    mockFindOne.mockReturnValue(leanOf({ gapReport: prior }));

    // attest the deterministic gap d — b stays open but must keep its suggestion
    const report = await recomputeAssessment({
      projectId: 'p1',
      wfcompId: 'wf1',
      attestations: [{ litera: 'd', value: 'ACME Processing GmbH' }],
    });

    const b = report.fields.find((f) => f.litera === 'b');
    expect(b?.status).toBe('needs_attestation');
    expect(b?.mode).toBe('confirm');
    expect(b?.suggestion?.value).toMatch(/newsletter/);
  });
});
