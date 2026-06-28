/**
 * Lifted-graph persistence (Slice 3 / THE-360) — tenant-scoped Neo4j.
 *
 * The lifted GDPR-semantic graph is genuine TENANT data (per project, per
 * assessment) → it lives in Neo4j on the app side. The Art.-30 SPEC stays the
 * canonical in-code constant (ART30_FIELDS), and the law TEXT is referenced
 * from the corpus by {regulationKey, versionHash} (ADR-0001) — neither is
 * persisted here.
 *
 * Design: lifted `attrs` (role/thirdCountry/personal/kind/art32) are stored as
 * top-level Neo4j props so an exact match is possible. The reload reconstructs
 * the in-memory `LiftedGraph` and the BATTLE-TESTED pure `runTraceCheck` runs on
 * it — no second, divergent Cypher trace implementation.
 */
import { runCypher, runCypherTransaction } from '../../config/neo4j';
import type { LiftedGraph, LiftedElement, LiftedEdge } from './types';

/** Props that are structural (not semantic attrs). Excluded on reload. */
const STRUCTURAL_PROPS = new Set([
  'id',
  'projectId',
  'name',
  'type',
  'source',
  'wfcompId',
  'provenance',
  'createdAt',
  'updatedAt',
]);

/**
 * Persist the lifted graph for one assessment, tenant-scoped + idempotent.
 * A re-assessment of the same `wfcompId` replaces the prior subgraph (no
 * accumulation).
 */
export async function persistLiftedGraph(
  projectId: string,
  wfcompId: string,
  lifted: LiftedGraph,
): Promise<void> {
  const ops: Array<{ query: string; params: Record<string, unknown> }> = [];

  // Idempotent: drop any prior wfcomp subgraph for this assessment first.
  ops.push({
    query: `MATCH (e:ArchitectureElement {projectId: $projectId, source: 'wfcomp', wfcompId: $wfcompId}) DETACH DELETE e`,
    params: { projectId, wfcompId },
  });

  for (const el of lifted.elements) {
    ops.push({
      query: `CREATE (e:ArchitectureElement {
        id: $id, projectId: $projectId, name: $name, type: $type,
        source: 'wfcomp', wfcompId: $wfcompId, provenance: 'import',
        createdAt: datetime(), updatedAt: datetime()
      })
      SET e += $attrs`,
      params: { id: el.id, projectId, name: el.name, type: el.type, wfcompId, attrs: el.attrs },
    });
  }

  for (const edge of lifted.edges) {
    ops.push({
      query: `MATCH (s:ArchitectureElement {id: $from, projectId: $projectId, wfcompId: $wfcompId})
              MATCH (t:ArchitectureElement {id: $to, projectId: $projectId, wfcompId: $wfcompId})
              CREATE (s)-[:CONNECTS_TO {
                type: $rel, projectId: $projectId, wfcompId: $wfcompId,
                provenance: 'import', source: 'wfcomp'
              }]->(t)`,
      params: { from: edge.from, to: edge.to, rel: edge.rel, projectId, wfcompId },
    });
  }

  await runCypherTransaction(ops);
}

/**
 * Reload the persisted lifted graph into the in-memory `LiftedGraph` shape, so
 * the pure `runTraceCheck` / `applyAttestation` can run on it (recompute).
 */
export async function loadLiftedGraph(projectId: string, wfcompId: string): Promise<LiftedGraph> {
  const elementRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId, source: 'wfcomp', wfcompId: $wfcompId}) RETURN e`,
    { projectId, wfcompId },
  );
  const elements: LiftedElement[] = elementRecords.map((rec) => {
    const props = (rec.get('e') as { properties: Record<string, unknown> }).properties;
    const attrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!STRUCTURAL_PROPS.has(k)) attrs[k] = v;
    }
    return {
      id: props.id as string,
      type: props.type as string,
      name: props.name as string,
      attrs,
      provenance: 'import',
    };
  });

  const edgeRecords = await runCypher(
    `MATCH (s:ArchitectureElement {projectId: $projectId, source: 'wfcomp', wfcompId: $wfcompId})
           -[r:CONNECTS_TO {wfcompId: $wfcompId}]->(t:ArchitectureElement {projectId: $projectId})
     RETURN s.id AS from, t.id AS to, r.type AS rel`,
    { projectId, wfcompId },
  );
  const edges: LiftedEdge[] = edgeRecords.map((rec) => ({
    from: rec.get('from') as string,
    to: rec.get('to') as string,
    rel: rec.get('rel') as string,
  }));

  return { elements, edges };
}
