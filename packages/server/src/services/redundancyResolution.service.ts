/**
 * REQ-RED-004 — Redundancy resolution helpers
 *
 * Pure service-layer that knows how to merge or delete elements as a
 * follow-up to a redundancy decision. Keeps the destructive Cypher
 * away from the route handler so each step (relationship transfer,
 * element delete, embedding cleanup) is testable in isolation and the
 * route can stay declarative.
 */

import { v4 as uuid } from 'uuid';
import { runCypher } from '../config/neo4j';
import { deleteEmbedding } from './elementSimilarity.service';
import { log } from '../config/logger';

export type RedundancyDecisionAction =
  | 'merge-into-a' // keep A, delete B, transfer B's connections to A
  | 'merge-into-b' // keep B, delete A, transfer A's connections to B
  | 'keep-both'    // no-op (user reviewed and decided they're really different)
  | 'skip';        // no-op (defer)

export interface RedundancyDecision {
  aId: string;
  bId: string;
  action: RedundancyDecisionAction;
}

export interface RedundancyResolutionResult {
  resolved: number;        // count of decisions that ran (any non-skip)
  merged: number;          // count of merge-into-* that succeeded
  kept: number;            // count of keep-both
  skipped: number;         // count of skip
  errors: Array<{ aId: string; bId: string; reason: string }>;
}

/**
 * Merge `source` into `target` inside the workspace's graph.
 *
 * Steps (in order, fail-fast):
 *   1. Verify both elements exist in this project (defensive vs cross-tenant)
 *   2. Pull source's outgoing relationships → MERGE-style re-create from target
 *   3. Pull source's incoming relationships → MERGE-style re-create to target
 *   4. DETACH DELETE source (removes the node + any leftover edges)
 *   5. Fire-and-forget removeEmbedding(source) so Qdrant stays in sync
 *
 * Idempotent: MERGE in steps 2+3 dedupes when target already has the same
 * relationship type to/from the other endpoint. Self-loops (source-X-target
 * or target-X-source) are skipped.
 */
export async function mergeElements(
  projectId: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  if (sourceId === targetId) {
    throw new Error('mergeElements: sourceId === targetId');
  }

  // Step 1: both must exist in this project
  const existence = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.id IN [$sourceId, $targetId]
     RETURN e.id AS id`,
    { projectId, sourceId, targetId },
  );
  const foundIds = new Set(existence.map((r) => r.get('id') as string));
  if (!foundIds.has(sourceId)) throw new Error(`mergeElements: source ${sourceId} not in project`);
  if (!foundIds.has(targetId)) throw new Error(`mergeElements: target ${targetId} not in project`);

  // Step 2: outgoing relationships from source → re-create from target
  //   (other.id <> targetId) drops the source-target edge itself (would become a self-loop)
  const outgoing = await runCypher(
    `MATCH (s:ArchitectureElement {id: $sourceId, projectId: $projectId})-[r:CONNECTS_TO]->(other:ArchitectureElement)
     WHERE other.id <> $targetId AND other.projectId = $projectId
     RETURN other.id AS otherId, r.type AS type, r.label AS label`,
    { sourceId, projectId, targetId },
  );
  for (const rec of outgoing) {
    const otherId = rec.get('otherId') as string;
    const type = (rec.get('type') as string) ?? 'association';
    const label = (rec.get('label') as string) ?? type;
    await runCypher(
      `MATCH (t:ArchitectureElement {id: $targetId, projectId: $projectId}),
             (other:ArchitectureElement {id: $otherId, projectId: $projectId})
       MERGE (t)-[r:CONNECTS_TO {sourceElementId: $targetId, targetElementId: $otherId, type: $type}]->(other)
       ON CREATE SET r.id = $connId, r.label = $label, r.createdAt = timestamp()
       RETURN r.id AS id`,
      { targetId, projectId, otherId, type, label, connId: uuid() },
    );
  }

  // Step 3: incoming relationships to source → re-create to target
  const incoming = await runCypher(
    `MATCH (other:ArchitectureElement)-[r:CONNECTS_TO]->(s:ArchitectureElement {id: $sourceId, projectId: $projectId})
     WHERE other.id <> $targetId AND other.projectId = $projectId
     RETURN other.id AS otherId, r.type AS type, r.label AS label`,
    { sourceId, projectId, targetId },
  );
  for (const rec of incoming) {
    const otherId = rec.get('otherId') as string;
    const type = (rec.get('type') as string) ?? 'association';
    const label = (rec.get('label') as string) ?? type;
    await runCypher(
      `MATCH (other:ArchitectureElement {id: $otherId, projectId: $projectId}),
             (t:ArchitectureElement {id: $targetId, projectId: $projectId})
       MERGE (other)-[r:CONNECTS_TO {sourceElementId: $otherId, targetElementId: $targetId, type: $type}]->(t)
       ON CREATE SET r.id = $connId, r.label = $label, r.createdAt = timestamp()
       RETURN r.id AS id`,
      { otherId, targetId, projectId, type, label, connId: uuid() },
    );
  }

  // Step 4: drop source + remaining relationships in one shot
  await runCypher(
    `MATCH (s:ArchitectureElement {id: $sourceId, projectId: $projectId})
     DETACH DELETE s`,
    { sourceId, projectId },
  );

  // Step 5: similarity index cleanup — fire-and-forget so a Qdrant outage
  // doesn't make the merge appear to have failed
  deleteEmbedding(projectId, sourceId).catch((e) =>
    log.warn(
      { err: (e as Error).message, projectId, sourceId },
      '[redundancy] deleteEmbedding hook failed after merge',
    ),
  );
}

/**
 * Apply a batch of redundancy decisions. Each decision is independent —
 * one failure doesn't block the rest. Returns counts + collected errors
 * so the caller can show a summary.
 */
export async function applyRedundancyDecisions(
  projectId: string,
  decisions: RedundancyDecision[],
): Promise<RedundancyResolutionResult> {
  const result: RedundancyResolutionResult = {
    resolved: 0,
    merged: 0,
    kept: 0,
    skipped: 0,
    errors: [],
  };

  for (const d of decisions) {
    try {
      if (d.action === 'skip') {
        result.skipped++;
        continue;
      }
      if (d.action === 'keep-both') {
        result.kept++;
        result.resolved++;
        continue;
      }

      const sourceId = d.action === 'merge-into-a' ? d.bId : d.aId;
      const targetId = d.action === 'merge-into-a' ? d.aId : d.bId;
      await mergeElements(projectId, sourceId, targetId);

      result.merged++;
      result.resolved++;
    } catch (e) {
      result.errors.push({
        aId: d.aId,
        bId: d.bId,
        reason: (e as Error).message,
      });
    }
  }

  return result;
}
