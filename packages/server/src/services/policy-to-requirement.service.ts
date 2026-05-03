import { v4 as uuid } from 'uuid';
import { runCypher } from '../config/neo4j';
import { LAYER_Y } from '@thearchitect/shared';

/**
 * ArchiMate Requirement projection for compliance policies.
 *
 * When an ESRS / regulatory standard is processed through the Compliance
 * Pipeline, the approved policies belong in the Motivation layer of the
 * architecture as `requirement` elements (ArchiMate 3.2 §6.4). Without this
 * projection they live only in the Policy Manager silo, breaking the spec
 * chain Driver → Requirement → Capability → Process → Activity.
 *
 * This service:
 *   1) creates one `requirement` ArchitectureElement per approved policy,
 *      parked on the motivation plateau (Y=16),
 *   2) links it back to the Policy via metadataJson for round-trip
 *      traceability,
 *   3) draws an `influence` edge from the upstream regulatory Driver
 *      (e.g. "EU CSRD", "LkSG") to the new requirement, when one is
 *      identifiable from the standard name.
 */

export interface MatchedDriver {
  id: string;
  name: string;
  matchScore: number;
}

/**
 * Find an existing motivation/driver in the project whose name overlaps with
 * the standard's name. Heuristic — substring match on common acronyms (CSRD,
 * LkSG, CSDDD, ESRS, Taxonomy, EPR). Returns the highest-scoring match or null.
 */
export async function findMatchingDriver(
  projectId: string,
  standardName: string,
): Promise<MatchedDriver | null> {
  if (!standardName) return null;

  // Token list — skip articles + generic compliance words
  const tokens = standardName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !['the', 'and', 'for', 'with', 'standard', 'standards', 'directive', 'regulation', 'general', 'requirements'].includes(t));

  if (tokens.length === 0) return null;

  const drivers = await runCypher(
    `MATCH (d:ArchitectureElement {projectId: $projectId, type: 'driver'})
     RETURN d.id AS id, d.name AS name`,
    { projectId },
  );

  let best: MatchedDriver | null = null;
  for (const rec of drivers) {
    const id = rec.get('id');
    const name = String(rec.get('name') ?? '').toLowerCase();
    if (!id || !name) continue;

    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) score += t.length;
    }
    if (score > 0 && (!best || score > best.matchScore)) {
      best = { id, name: rec.get('name'), matchScore: score };
    }
  }
  return best;
}

export interface RequirementProjectionInput {
  projectId: string;
  standardId: string;
  standardName: string;
  driverId: string | null;
  policies: Array<{
    _id: { toString(): string };
    name: string;
    description: string;
    sourceSectionNumber: string;
  }>;
}

export interface RequirementProjectionSummary {
  requirementsCreated: number;
  driverConnected: boolean;
  driverId: string | null;
  driverName: string | null;
  requirementIds: string[];
}

/**
 * Create one ArchiMate `requirement` element per policy + connect from the
 * regulatory driver via `influence`. Idempotent on (projectId, sourcePolicyId)
 * via MERGE — re-running approve-policies will not duplicate.
 */
export async function projectPoliciesAsRequirements(
  input: RequirementProjectionInput,
): Promise<RequirementProjectionSummary> {
  const { projectId, standardId, standardName, driverId, policies } = input;
  if (policies.length === 0) {
    return {
      requirementsCreated: 0,
      driverConnected: false,
      driverId: null,
      driverName: null,
      requirementIds: [],
    };
  }

  const motivationY = LAYER_Y['motivation'] ?? 16;
  // Spread requirements horizontally on the motivation plateau, behind any
  // existing motivation elements so they don't overlap.
  const baseX = -10;
  const stepX = 2.5;

  const rows = policies.map((p, i) => ({
    id: uuid(),
    name: String(p.name).slice(0, 200),
    description: String(p.description).slice(0, 1000),
    sourceSection: p.sourceSectionNumber,
    sourcePolicyId: p._id.toString(),
    posX: baseX + i * stepX,
    posY: motivationY,
    posZ: 8, // pushed back in Z so it doesn't collide with stakeholder rows
  }));

  // 1) MERGE the requirement elements (keyed on projectId + sourcePolicyId so
  // re-runs don't duplicate)
  await runCypher(
    `UNWIND $rows AS row
     MERGE (r:ArchitectureElement {projectId: $projectId, sourcePolicyId: row.sourcePolicyId})
     ON CREATE SET
       r.id = row.id,
       r.type = 'requirement',
       r.layer = 'motivation',
       r.togafDomain = 'motivation',
       r.name = row.name,
       r.description = row.description,
       r.status = 'target',
       r.riskLevel = 'medium',
       r.maturityLevel = 1,
       r.posX = row.posX,
       r.posY = row.posY,
       r.posZ = row.posZ,
       r.sourceStandardId = $standardId,
       r.sourceStandardName = $standardName,
       r.sourceSection = row.sourceSection,
       r.metadataJson = '{"source":"compliance-policy"}',
       r.createdAt = timestamp(),
       r.updatedAt = timestamp()
     ON MATCH SET
       r.name = row.name,
       r.description = row.description,
       r.updatedAt = timestamp()
     RETURN r.id AS id`,
    { rows, projectId, standardId, standardName },
  );

  // 2) Link upstream Driver --influence--> Requirement (best-effort)
  let driverConnected = false;
  let driverName: string | null = null;
  if (driverId) {
    const driverInfo = await runCypher(
      `MATCH (d:ArchitectureElement {id: $driverId}) RETURN d.name AS name`,
      { driverId },
    );
    driverName = driverInfo[0]?.get?.('name') ?? null;

    await runCypher(
      `UNWIND $rows AS row
       MATCH (d:ArchitectureElement {id: $driverId, projectId: $projectId}),
             (r:ArchitectureElement {projectId: $projectId, sourcePolicyId: row.sourcePolicyId})
       MERGE (d)-[c:CONNECTS_TO {type: 'influence', sourceElementId: $driverId, targetElementId: r.id}]->(r)
       ON CREATE SET c.id = randomUUID(),
                     c.label = '',
                     c.source = 'compliance-policy',
                     c.projectId = $projectId,
                     c.createdAt = timestamp()
       RETURN count(c) AS n`,
      { rows, projectId, driverId },
    );
    driverConnected = true;
  }

  return {
    requirementsCreated: rows.length,
    driverConnected,
    driverId: driverId ?? null,
    driverName,
    requirementIds: rows.map((r) => r.id),
  };
}
