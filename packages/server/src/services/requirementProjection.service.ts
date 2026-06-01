/**
 * UC-REQPROJ-001 (REQ-REQGEN-001.5) — ComplianceRequirement → ArchiMate Motivation projection.
 *
 * Projects confirmed ComplianceRequirements (Mongo, system-of-record) into the
 * Neo4j architecture graph as ArchiMate Motivation elements — a VIEW, not a
 * duplicate. The spec chain becomes visible + traceable:
 *
 *   Driver (》LkSG《) --influence--> Requirement (》Risikoanalyse durchführen《)
 *                                   Constraint (》Verarbeitung untersagen《)
 *                                      ▲
 *                                      │ realization
 *                                   Process (》Supplier Due Diligence《)
 *
 * Design (locked 2026-05-30):
 *   - Projektion, kein Duplikat: metadataJson.complianceRequirementId back-ref.
 *   - Typ: positive Pflicht → `requirement`, Verbot/Restriktion → `constraint`
 *     (heuristic at projection time — keeps the LLM generation lean).
 *   - Ein Driver pro Regulation-Quelle (LkSG, NIS2, …), create-or-reuse.
 *   - influence (Driver→Req) + realization (linkedElement→Req).
 *   - Idempotent via MERGE on stable keys.
 *
 * Pattern: policy-to-requirement.service.ts.
 *
 * Linear: THE-315.
 */
import { v4 as uuid } from 'uuid';
import { runCypher } from '../config/neo4j';
import { MOTIVATION_SUB_Y } from '@thearchitect/shared';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';
import { log } from '../config/logger';
import mongoose from 'mongoose';

// ─── Obligation classification (requirement vs constraint) ──────────

const PROHIBITION_MARKERS = [
  // German
  'untersagt', 'verboten', 'darf nicht', 'dürfen nicht', 'nicht zulässig',
  'unzulässig', 'nicht gestattet', 'zu unterlassen', 'keine verarbeitung',
  // English
  'prohibited', 'must not', 'shall not', 'may not', 'not permitted', 'forbidden',
];

/**
 * Heuristic: a prohibition/restriction → ArchiMate `constraint`, otherwise
 * `requirement`. Works on the obligation's German OR English content.
 */
export function classifyObligation(title: string, description: string): 'requirement' | 'constraint' {
  const text = `${title} ${description}`.toLowerCase();
  return PROHIBITION_MARKERS.some((m) => text.includes(m)) ? 'constraint' : 'requirement';
}

// ─── Types ──────────────────────────────────────────────────────────

export interface ProjectionSummary {
  driversUpserted: number;
  requirementsProjected: number;
  constraintsProjected: number;
  influenceEdges: number;
  realizationEdges: number;
  floatingGaps: number;       // projected motivation elements with NO realization (= open compliance gaps)
  elementIds: string[];
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Project the project's persisted ComplianceRequirements into the graph.
 * If `requirementIds` is given, only those are projected; otherwise all.
 */
export async function projectRequirementsToModel(args: {
  projectId: string;
  requirementIds?: string[];
}): Promise<ProjectionSummary> {
  const projectObjectId = new mongoose.Types.ObjectId(args.projectId);

  const filter: Record<string, unknown> = { projectId: projectObjectId };
  if (args.requirementIds && args.requirementIds.length > 0) {
    filter._id = { $in: args.requirementIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const requirements = await ComplianceRequirement.find(filter).lean();
  const empty: ProjectionSummary = {
    driversUpserted: 0,
    requirementsProjected: 0,
    constraintsProjected: 0,
    influenceEdges: 0,
    realizationEdges: 0,
    floatingGaps: 0,
    elementIds: [],
  };
  if (requirements.length === 0) return empty;

  // Resolve regulation source per requirement (for the Driver grouping)
  const regulationIds = [...new Set(requirements.map((r) => String(r.regulationId)))];
  const regulations = await Regulation.find({
    _id: { $in: regulationIds.map((id) => new mongoose.Types.ObjectId(id)) },
  }).lean();
  const sourceByRegId = new Map<string, string>();
  for (const reg of regulations) {
    sourceByRegId.set(String(reg._id), String(reg.source || 'custom'));
  }

  const driverY = MOTIVATION_SUB_Y['driver'] ?? 28.5;
  const requirementY = MOTIVATION_SUB_Y['requirement'] ?? 16;
  const constraintY = MOTIVATION_SUB_Y['constraint'] ?? 16;

  // ── 1) Drivers: one per distinct regulation source ────────────────
  // Drivers float on the upper motivation sub-level; influence edges run DOWN
  // to their requirements grounded on the y=16 plane.
  const distinctSources = [...new Set(
    requirements.map((r) => sourceByRegId.get(String(r.regulationId)) || 'custom'),
  )];
  const driverIdBySource = new Map<string, string>();
  const driverRows = distinctSources.map((source, i) => {
    const id = uuid();
    driverIdBySource.set(source, id);
    return {
      id,
      source,
      name: source.toUpperCase(),
      posX: -12 + i * 4,
      posY: driverY,
      posZ: 0,
    };
  });

  await runCypher(
    `UNWIND $rows AS row
     MERGE (d:ArchitectureElement {projectId: $projectId, complianceDriverSource: row.source})
     ON CREATE SET
       d.id = row.id,
       d.type = 'driver',
       d.layer = 'motivation',
       d.togafDomain = 'motivation',
       d.name = row.name,
       d.description = 'Regulatory driver projected from compliance requirements',
       d.status = 'current',
       d.riskLevel = 'medium',
       d.maturityLevel = 1,
       d.posX = row.posX, d.posY = row.posY, d.posZ = row.posZ,
       d.metadataJson = '{"source":"compliance-requirement","role":"driver"}',
       d.createdAt = timestamp(), d.updatedAt = timestamp()
     ON MATCH SET
       d.posX = row.posX, d.posY = row.posY, d.posZ = row.posZ,
       d.updatedAt = timestamp()
     RETURN d.id AS id`,
    { rows: driverRows, projectId: args.projectId },
  );

  // ── 2) Requirement / Constraint elements ──────────────────────────
  // Grounded on the y=16 plane, arranged into Z-bands by priority so the most
  // urgent obligations sit closest to the front; constraints get their own band.
  //   constraint (front) → must → should → may (back)
  const BAND_Z: Record<string, number> = { constraint: -9, must: -3, should: 3, may: 9 };
  const bandCounter: Record<string, number> = {};

  const reqRows = requirements.map((r) => {
    const kind = classifyObligation(String(r.title), String(r.description));
    const source = sourceByRegId.get(String(r.regulationId)) || 'custom';
    const priority = String(r.priority);
    // constraints share their own band regardless of priority
    const band = kind === 'constraint' ? 'constraint' : priority;
    const idxInBand = bandCounter[band] ?? 0;
    bandCounter[band] = idxInBand + 1;
    return {
      id: uuid(),
      complianceRequirementId: String(r._id),
      kind,
      source,
      driverId: driverIdBySource.get(source) ?? null,
      name: String(r.title).slice(0, 200),
      description: String(r.description).slice(0, 1000),
      priority,
      status: String(r.status),
      linkedElementIds: Array.isArray(r.linkedElementIds) ? r.linkedElementIds : [],
      posX: -13 + idxInBand * 2.8,
      posY: kind === 'constraint' ? constraintY : requirementY,
      posZ: BAND_Z[band] ?? 0,
    };
  });

  // metadataJson carries the round-trip back-reference + audit context
  const reqRowsWithMeta = reqRows.map((row) => ({
    ...row,
    metadataJson: JSON.stringify({
      source: 'compliance-requirement',
      complianceRequirementId: row.complianceRequirementId,
      regulationSource: row.source,
      priority: row.priority,
      complianceStatus: row.status,
    }),
  }));

  await runCypher(
    `UNWIND $rows AS row
     MERGE (r:ArchitectureElement {projectId: $projectId, complianceRequirementId: row.complianceRequirementId})
     ON CREATE SET
       r.id = row.id,
       r.type = row.kind,
       r.layer = 'motivation',
       r.togafDomain = 'motivation',
       r.name = row.name,
       r.description = row.description,
       r.status = 'target',
       r.riskLevel = 'medium',
       r.maturityLevel = 1,
       r.posX = row.posX, r.posY = row.posY, r.posZ = row.posZ,
       r.compliancePriority = row.priority,
       r.metadataJson = row.metadataJson,
       r.createdAt = timestamp(), r.updatedAt = timestamp()
     ON MATCH SET
       r.type = row.kind,
       r.name = row.name,
       r.description = row.description,
       r.posX = row.posX, r.posY = row.posY, r.posZ = row.posZ,
       r.compliancePriority = row.priority,
       r.metadataJson = row.metadataJson,
       r.updatedAt = timestamp()
     RETURN r.id AS id`,
    { rows: reqRowsWithMeta, projectId: args.projectId },
  );

  // ── 3) influence edges: Driver --influence--> Requirement ─────────
  const infResult = await runCypher(
    `UNWIND $rows AS row
     WITH row WHERE row.driverId IS NOT NULL
     MATCH (d:ArchitectureElement {id: row.driverId, projectId: $projectId}),
           (r:ArchitectureElement {projectId: $projectId, complianceRequirementId: row.complianceRequirementId})
     MERGE (d)-[c:CONNECTS_TO {type: 'influence', sourceElementId: d.id, targetElementId: r.id}]->(r)
     ON CREATE SET c.id = randomUUID(), c.label = '', c.source = 'compliance-requirement',
                   c.projectId = $projectId, c.createdAt = timestamp()
     RETURN count(c) AS n`,
    { rows: reqRows, projectId: args.projectId },
  );
  const influenceEdges = Number(infResult[0]?.get?.('n') ?? 0);

  // ── 4) realization edges: linkedElement --realization--> Requirement ─
  // (ArchiMate: a core element REALIZES a motivation requirement)
  const realizationRows = reqRows.flatMap((row) =>
    row.linkedElementIds.map((elementId) => ({
      complianceRequirementId: row.complianceRequirementId,
      elementId: String(elementId),
    })),
  );

  let realizationEdges = 0;
  if (realizationRows.length > 0) {
    const realResult = await runCypher(
      `UNWIND $rows AS row
       MATCH (src:ArchitectureElement {id: row.elementId, projectId: $projectId}),
             (r:ArchitectureElement {projectId: $projectId, complianceRequirementId: row.complianceRequirementId})
       MERGE (src)-[c:CONNECTS_TO {type: 'realization', sourceElementId: src.id, targetElementId: r.id}]->(r)
       ON CREATE SET c.id = randomUUID(), c.label = '', c.source = 'compliance-requirement',
                     c.projectId = $projectId, c.createdAt = timestamp()
       RETURN count(c) AS n`,
      { rows: realizationRows, projectId: args.projectId },
    );
    realizationEdges = Number(realResult[0]?.get?.('n') ?? 0);
  }

  // Floating gaps: projected requirements whose linkedElementIds are all empty
  // OR resolved to zero realization edges = unaddressed obligations in the model.
  const floatingGaps = reqRows.filter((row) => row.linkedElementIds.length === 0).length;

  const summary: ProjectionSummary = {
    driversUpserted: driverRows.length,
    requirementsProjected: reqRows.filter((r) => r.kind === 'requirement').length,
    constraintsProjected: reqRows.filter((r) => r.kind === 'constraint').length,
    influenceEdges,
    realizationEdges,
    floatingGaps,
    elementIds: reqRows.map((r) => r.id),
  };

  log.info(
    { projectId: args.projectId, ...summary },
    '[requirementProjection] projected compliance requirements into motivation layer',
  );

  return summary;
}

export const __testExports = { classifyObligation, PROHIBITION_MARKERS };
