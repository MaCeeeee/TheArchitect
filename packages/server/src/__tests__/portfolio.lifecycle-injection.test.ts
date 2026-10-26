/**
 * Security-Audit C2: `updateElementLifecycle` baute `e.${key} = $${key}` aus
 * JEDEM Key des Request-Bodys. Ein Key wie
 *   name = 'x' WITH e MATCH (v) SET v.pwned = true //
 * brach aus dem SET aus und schrieb Knoten fremder Projekte. Diese Tests
 * prüfen den Cypher-Text, der tatsächlich an Neo4j geht.
 */
const runCypher = jest.fn().mockResolvedValue([]);
jest.mock('../config/neo4j', () => ({ runCypher: (...a: unknown[]) => runCypher(...a) }));

import { updateElementLifecycle, LIFECYCLE_FIELDS } from '../services/portfolio.service';

const INJECTION = "name = 'x' WITH e MATCH (v) SET v.pwned = true //";

function sentQuery(): { query: string; params: Record<string, unknown> } {
  const [query, params] = runCypher.mock.calls[0];
  return { query, params };
}

describe('updateElementLifecycle — Security-Audit C2', () => {
  beforeEach(() => runCypher.mockClear());

  it('writes the allowed lifecycle fields as parameters', async () => {
    await updateElementLifecycle('p1', 'e1', { lifecyclePhase: 'active', annualCost: 1200 });
    const { query, params } = sentQuery();
    expect(query).toContain('e.lifecyclePhase = $lifecyclePhase');
    expect(query).toContain('e.annualCost = $annualCost');
    expect(params).toMatchObject({ projectId: 'p1', elementId: 'e1', lifecyclePhase: 'active', annualCost: 1200 });
  });

  it('DROPS an injected key — kein Fremdtext in der Query', async () => {
    const body = { lifecyclePhase: 'retired', [INJECTION]: 'x' } as never;
    await updateElementLifecycle('p1', 'e1', body);
    const { query, params } = sentQuery();
    expect(query).not.toContain('pwned');
    expect(query).not.toContain('MATCH (v)');
    expect(query).toContain('e.lifecyclePhase = $lifecyclePhase');
    expect(Object.keys(params)).not.toContain(INJECTION);
  });

  it('drops unknown keys such as projectId or id — kein Umhängen in ein anderes Projekt', async () => {
    const body = { projectId: 'fremd', id: 'x', name: 'umbenannt' } as never;
    await updateElementLifecycle('p1', 'e1', body);
    const { query, params } = sentQuery();
    expect(query).not.toMatch(/e\.(projectId|id|name)\s*=/);
    expect(params.projectId).toBe('p1');
  });

  it('every SET target in the query is a known lifecycle field or updatedAt', async () => {
    const body = Object.fromEntries([...LIFECYCLE_FIELDS, 'evil', INJECTION].map((k) => [k, 'v'])) as never;
    await updateElementLifecycle('p1', 'e1', body);
    const { query } = sentQuery();
    const targets = [...query.matchAll(/e\.(\w+)\s*=/g)].map((m) => m[1]);
    const allowed = new Set<string>([...LIFECYCLE_FIELDS, 'updatedAt']);
    expect(targets.every((t) => allowed.has(t))).toBe(true);
    expect(targets).toHaveLength(LIFECYCLE_FIELDS.length + 1);
  });
});
