/**
 * assessAndStore (Slice 3.4 / THE-360). Real pipeline; persistence (Neo4j + Mongo) mocked.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../services/wfcomp/persist', () => ({ persistLiftedGraph: jest.fn() }));
jest.mock('../models/WfcompAssessment', () => ({ WfcompAssessment: { updateOne: jest.fn() } }));

import { assessAndStore } from '../services/wfcomp/store';
import { persistLiftedGraph } from '../services/wfcomp/persist';
import { WfcompAssessment } from '../models/WfcompAssessment';

const mockPersist = persistLiftedGraph as jest.Mock;
const mockUpdate = WfcompAssessment.updateOne as jest.Mock;
const fixture = (n: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'wfcomp', `${n}.json`), 'utf-8'));

beforeEach(() => {
  mockPersist.mockReset();
  mockUpdate.mockReset();
});

describe('assessAndStore', () => {
  it('in-scope: persists the lifted graph + upserts the assessment with the corpus ref', async () => {
    const report = await assessAndStore({ projectId: 'p1', wfcompId: 'wf1', raw: fixture('clean-compliant'), assessedBy: 'u1' });

    expect(report.gdprScope).toBe(true);
    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockPersist).toHaveBeenCalledWith('p1', 'wf1', expect.objectContaining({ elements: expect.any(Array), edges: expect.any(Array) }));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = mockUpdate.mock.calls[0];
    expect(filter).toEqual({ projectId: 'p1', wfcompId: 'wf1' });
    expect(update.$set.regulationRef.regulationKey).toBe('dsgvo:art-30');
    expect(update.$set.gapReport).toBe(report);
    expect(update.$set.assessedBy).toBe('u1');
  });

  it('not applicable: records the assessment but persists NO graph', async () => {
    const report = await assessAndStore({ projectId: 'p1', wfcompId: 'wf2', raw: fixture('no-personal-data') });
    expect(report.gdprScope).toBe(false);
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('omits assessedBy when there is no user', async () => {
    await assessAndStore({ projectId: 'p1', wfcompId: 'wf3', raw: fixture('clean-compliant') });
    const [, update] = mockUpdate.mock.calls[0];
    expect('assessedBy' in update.$set).toBe(false);
  });
});
