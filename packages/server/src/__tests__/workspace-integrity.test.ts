import { planWorkspaceIntegrity, type ElementGroup, type WorkspaceDoc } from '../services/workspace-integrity.service';

const P = 'p-live';
const at = (ms: number) => new Date(ms);
const g = (workspaceId: string, n: number, projectId = P, certified = 0): ElementGroup => ({ projectId, workspaceId, n, certified });
const ws = (_id: string, createdAt: Date, objectIdStored = false, projectId = P): WorkspaceDoc => ({ _id, projectId, createdAt, objectIdStored });
const live = new Set([P, 'p-other']);

test('a group whose id is a workspace of the project is fine', () => {
  const plan = planWorkspaceIntegrity([g('ws-1782282031806-aaaaa', 5)], [ws('ws-1782282031806-aaaaa', at(1))], live);
  expect(plan).toMatchObject({ ok: 5, normalize: [], align: [], ambiguous: [], orphans: [], deadProject: 0 });
});

test('ObjectId-stored workspaces of live projects are normalised; of dead projects never', () => {
  const plan = planWorkspaceIntegrity([], [ws('6a3b777ff1bf836dc790f8f0', at(1), true), ws('69d3aad2b906ef4f83f90000', at(1), true, 'p-dead')], live);
  expect(plan.normalize).toEqual(['6a3b777ff1bf836dc790f8f0']);
});

test('legacy: hex workspace created within 10 s of ws-<ms> → align to the hex id', () => {
  const plan = planWorkspaceIntegrity([g('ws-1782282111647-16dxo', 11)], [ws('6a3b777ff1bf836dc790f8f0', at(1782282111647 + 84), true)], live);
  expect(plan.align).toEqual([{ projectId: P, from: 'ws-1782282111647-16dxo', to: '6a3b777ff1bf836dc790f8f0', n: 11, certified: 0 }]);
  expect(plan.orphans).toEqual([]);
});

test('elements already on the hex id count as ok (blueprint / n8n-merge case)', () => {
  const plan = planWorkspaceIntegrity([g('6a3b772ff1bf836dc790f7eb', 40)], [ws('6a3b772ff1bf836dc790f7eb', at(1), true)], live);
  expect(plan).toMatchObject({ ok: 40, align: [], orphans: [] });
});

test('negative: two hex candidates in the window → ambiguous, never aligned', () => {
  const t = 1782282111647;
  const plan = planWorkspaceIntegrity([g(`ws-${t}-xxxxx`, 3)], [ws('6a00000000000000000000a1', at(t + 1000), true), ws('6a00000000000000000000a2', at(t - 2000), true)], live);
  expect(plan.align).toEqual([]);
  expect(plan.ambiguous).toEqual([{ projectId: P, workspaceId: `ws-${t}-xxxxx`, n: 3, candidates: ['6a00000000000000000000a1', '6a00000000000000000000a2'] }]);
});

test('negative: a ws-… workspace is never an alignment target', () => {
  const t = 1782282111647;
  const plan = planWorkspaceIntegrity([g(`ws-${t}-xxxxx`, 3)], [ws(`ws-${t + 500}-yyyyy`, at(t + 500))], live);
  expect(plan.align).toEqual([]);
  expect(plan.orphans).toEqual([{ projectId: P, workspaceId: `ws-${t}-xxxxx`, n: 3, certified: 0 }]);
});

test('negative: 10 s or more apart → orphan, not aligned', () => {
  const t = 1782282061855;
  const plan = planWorkspaceIntegrity([g(`ws-${t}-e269m`, 11)], [ws('6a3b777ff1bf836dc790f8f0', at(t + 10_000), true)], live);
  expect(plan.align).toEqual([]);
  expect(plan.orphans).toEqual([{ projectId: P, workspaceId: `ws-${t}-e269m`, n: 11, certified: 0 }]);
});

test('negative: a workspace in another project is never a candidate', () => {
  const t = 1782282111647;
  const plan = planWorkspaceIntegrity([g(`ws-${t}-xxxxx`, 3)], [ws('6a00000000000000000000b1', at(t), true, 'p-other')], live);
  expect(plan.align).toEqual([]);
  expect(plan.orphans).toHaveLength(1);
});

test('negative: elements of deleted projects are counted, never planned (THE-656)', () => {
  const plan = planWorkspaceIntegrity([g('ws-1775479541598-rfu4y', 89, 'p-dead')], [], live);
  expect(plan).toMatchObject({ align: [], orphans: [], ambiguous: [], deadProject: 89 });
});
