import { runCypher, runCypherTransaction } from '../config/neo4j';
import type { IPolicy } from '../models/Policy';

/**
 * Sync a Policy to Neo4j as a `constraint` node in the Motivation Layer.
 * Uses MERGE to be idempotent (create or update).
 */
export async function syncPolicyToNeo4j(policy: IPolicy, projectId: string): Promise<void> {
  const policyId = policy._id.toString();

  // Count existing policy nodes to auto-position new ones side by side
  const countResult = await runCypher(
    `MATCH (p:ArchitectureElement {projectId: $projectId})
     WHERE p.metadataJson CONTAINS '"isPolicyNode":true'
     RETURN count(p) AS cnt`,
    { projectId },
  );
  const existingCount = countResult[0]?.get('cnt')?.toNumber?.() ?? countResult[0]?.get('cnt') ?? 0;

  await runCypher(
    `MERGE (p:ArchitectureElement {id: $id, projectId: $projectId})
     ON CREATE SET p.posX = $posX, p.posY = $posY, p.posZ = $posZ
     SET p.type = 'constraint',
         p.layer = 'motivation',
         p.togafDomain = 'motivation',
         p.name = $name,
         p.description = $description,
         p.status = CASE WHEN $policyStatus = 'active' THEN 'current' ELSE 'target' END,
         p.riskLevel = 'low',
         p.maturityLevel = 2,
         p.metadataJson = $metadata,
         p.updatedAt = datetime()`,
    {
      id: `policy-${policyId}`,
      projectId,
      name: policy.name,
      description: policy.description || '',
      policyStatus: policy.status || 'active',
      // Position on motivation layer (y=16), spaced 4 units apart on x-axis
      posX: existingCount * 4,
      posY: 16,
      posZ: 0,
      metadata: JSON.stringify({
        isPolicyNode: true,
        policyId,
        category: policy.category,
        severity: policy.severity,
        source: policy.source || 'custom',
        version: policy.version || 1,
      }),
    },
  );
}

/**
 * Create INFLUENCES relationships from a policy node to all elements in its scope.
 * Removes old relationships first, then creates new ones based on current scope.
 */
export async function syncPolicyInfluenceRelationships(
  policy: IPolicy,
  projectId: string,
): Promise<void> {
  const policyNodeId = `policy-${policy._id.toString()}`;
  const scope = policy.scope;

  // Build scope filter
  const conditions: string[] = ['e.projectId = $projectId', 'e.id <> $policyNodeId'];
  if (scope.layers && scope.layers.length > 0) {
    conditions.push('e.layer IN $layers');
  }
  if (scope.elementTypes && scope.elementTypes.length > 0) {
    conditions.push('e.type IN $elementTypes');
  }

  const whereClause = conditions.join(' AND ');

  await runCypherTransaction([
    // Remove old influence relationships from this policy
    {
      query: `MATCH (p:ArchitectureElement {id: $policyNodeId})-[r:INFLUENCES]->() DELETE r`,
      params: { policyNodeId },
    },
    // Create new ones based on scope
    {
      query: `MATCH (p:ArchitectureElement {id: $policyNodeId})
              MATCH (e:ArchitectureElement)
              WHERE ${whereClause}
              MERGE (p)-[:INFLUENCES]->(e)`,
      params: {
        policyNodeId,
        projectId,
        layers: scope.layers || [],
        elementTypes: scope.elementTypes || [],
      },
    },
  ]);
}

/**
 * Remove a policy node and all its relationships from Neo4j.
 */
export async function removePolicyFromNeo4j(policyId: string): Promise<void> {
  await runCypher(
    `MATCH (p:ArchitectureElement {id: $id}) DETACH DELETE p`,
    { id: `policy-${policyId}` },
  );
}

/**
 * Create a VIOLATES relationship between a policy and an element in Neo4j.
 */
export async function syncViolationToNeo4j(
  policyId: string,
  elementId: string,
  severity: string,
): Promise<void> {
  await runCypher(
    `MATCH (p:ArchitectureElement {id: $policyNodeId})
     MATCH (e:ArchitectureElement {id: $elementId})
     MERGE (e)-[r:VIOLATES]->(p)
     SET r.severity = $severity, r.detectedAt = datetime()`,
    {
      policyNodeId: `policy-${policyId}`,
      elementId,
      severity,
    },
  );
}

/**
 * Remove a VIOLATES relationship when a violation is resolved.
 */
export async function removeViolationFromNeo4j(
  policyId: string,
  elementId: string,
): Promise<void> {
  await runCypher(
    `MATCH (e:ArchitectureElement {id: $elementId})-[r:VIOLATES]->(p:ArchitectureElement {id: $policyNodeId})
     DELETE r`,
    {
      policyNodeId: `policy-${policyId}`,
      elementId,
    },
  );
}
