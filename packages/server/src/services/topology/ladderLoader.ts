/**
 * UC-METH-001 — reads the model facts the ladder needs (three read-only queries) and
 * hands them to the pure assessment. No LLM, no writes.
 */
import { METHOD_CATALOG } from '@thearchitect/shared';
import type { LadderReport } from '@thearchitect/shared';
import { runCypher } from '../../config/neo4j';
import { coerceNeo4jNumber } from '../compliance.service';
import { assessLadder, LadderInput } from './ladder';

/** Element fields the catalog asks about. Names come from the catalog only and are checked before they enter a query. */
const CATALOG_FIELDS = [
  ...new Set(METHOD_CATALOG.flatMap((m) => m.inputs).flatMap((input) => (input.kind === 'field' ? [input.field] : []))),
].filter((field) => /^[a-zA-Z]+$/.test(field));

export async function loadLadderInput(projectId: string): Promise<LadderInput> {
  const elementRows = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id AS id, e.name AS name, e.type AS type`,
    { projectId },
  );
  const relationshipRows = await runCypher(
    `MATCH (s:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(t:ArchitectureElement {projectId: $projectId})
     RETURN coalesce(r.id, s.id + '->' + t.id + ':' + coalesce(r.type, '')) AS id,
            s.id AS sourceId, t.id AS targetId, r.type AS type,
            r.translationFactor AS translationFactor, r.translationQuantity AS translationQuantity`,
    { projectId },
  );
  const fieldExpr = CATALOG_FIELDS.map((field) => `sum(CASE WHEN e.${field} IS NOT NULL THEN 1 ELSE 0 END) AS ${field}`).join(', ');
  const fieldRows = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId}) RETURN ${fieldExpr}`,
    { projectId },
  );

  const fieldCounts: Record<string, number> = {};
  const fieldRow = fieldRows[0];
  for (const field of CATALOG_FIELDS) fieldCounts[field] = fieldRow ? coerceNeo4jNumber(fieldRow.get(field), 0) : 0;

  return {
    elements: elementRows.map((row) => ({
      id: String(row.get('id')),
      name: String(row.get('name') ?? ''),
      type: String(row.get('type') ?? ''),
    })),
    relationships: relationshipRows.map((row) => {
      const factor = row.get('translationFactor');
      const quantity = row.get('translationQuantity');
      return {
        id: String(row.get('id')),
        sourceId: String(row.get('sourceId')),
        targetId: String(row.get('targetId')),
        type: String(row.get('type') ?? ''),
        translationFactor: factor == null ? null : coerceNeo4jNumber(factor, Number.NaN),
        translationQuantity: quantity == null ? null : String(quantity),
      };
    }),
    fieldCounts,
  };
}

export async function buildLadderReport(projectId: string): Promise<LadderReport> {
  return assessLadder(projectId, await loadLadderInput(projectId));
}
