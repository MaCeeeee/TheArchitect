/**
 * UC-METH-002 (REQ .1) — the group and its compositions are written in one transaction.
 * Run: cd packages/server && npx jest src/__tests__/groupWriter.test.ts
 */
const run = jest.fn();
const close = jest.fn().mockResolvedValue(undefined);
const executeWrite = jest.fn(async (work: (tx: { run: typeof run }) => Promise<unknown>) => work({ run }));
jest.mock('../config/neo4j', () => ({
  getNeo4jDriver: () => ({ session: () => ({ executeWrite, close }) }),
}));

import { writeGroup, GroupMembersChangedError, type GroupWrite } from '../services/groups/groupWriter';

const write: GroupWrite = {
  projectId: 'p1', groupId: 'g1', name: 'Sales', type: 'grouping', layer: 'business', togafDomain: 'business',
  position: { x: 1, y: 8, z: 2 },
  members: [{ id: 'a', connectionId: 'c-a' }, { id: 'b', connectionId: 'c-b' }],
  provenance: { prov_provenance: 'user', prov_source: null, prov_confidence: null, prov_certifiedBy: null, prov_certifiedAt: null },
};
const created = (n: number) => ({ records: [{ get: () => n }] });

beforeEach(() => { run.mockReset(); executeWrite.mockClear(); close.mockClear(); });

test('creates the group, then one composition per member, scoped to the project, in one transaction', async () => {
  run.mockResolvedValueOnce({ records: [] }).mockResolvedValueOnce(created(2));
  await writeGroup(write);
  expect(executeWrite).toHaveBeenCalledTimes(1);
  const [groupQuery, groupParams] = run.mock.calls[0];
  expect(groupQuery).toContain('CREATE (g:ArchitectureElement');
  expect(groupParams).toMatchObject({ groupId: 'g1', projectId: 'p1', type: 'grouping', name: 'Sales', layer: 'business', posX: 1, posY: 8, posZ: 2 });
  const [edgeQuery, edgeParams] = run.mock.calls[1];
  expect(edgeQuery).toContain("type: 'composition'");
  expect(edgeQuery).toContain('{projectId: $projectId}) WHERE t.id IN $memberIds');
  expect(edgeQuery).not.toContain('UNWIND');
  expect(edgeParams.memberIds).toEqual(['a', 'b']);
  expect(edgeQuery).toContain('{id: $groupId, projectId: $projectId}');
  expect(edgeParams.members).toEqual(write.members);
  expect(close).toHaveBeenCalled();
});

test('a member that vanished between read and write: error, so the transaction rolls back', async () => {
  run.mockResolvedValueOnce({ records: [] }).mockResolvedValueOnce(created(1));
  await expect(writeGroup(write)).rejects.toBeInstanceOf(GroupMembersChangedError);
  expect(close).toHaveBeenCalled();
});
