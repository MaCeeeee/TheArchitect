import { Policy } from '../models/Policy';
import { PolicyViolation } from '../models/PolicyViolation';
import { runCypher } from '../config/neo4j';
import { evaluateRule, elementMatchesScope, getFieldValue } from './compliance.service';
import { syncViolationToNeo4j, removeViolationFromNeo4j } from './policy-graph.service';
import { getIO } from '../websocket/socketServer';

interface Neo4jElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  domain: string;
  maturity: number;
  riskLevel: string;
  status: string;
  description: string;
  metadata: Record<string, unknown>;
}

/**
 * Load a single element from Neo4j by its ID.
 */
async function loadElement(elementId: string): Promise<Neo4jElement | null> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {id: $elementId})
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.togafDomain as domain, e.maturityLevel as maturity,
            e.riskLevel as riskLevel, e.status as status,
            e.description as description, e.metadataJson as metadataJson`,
    { elementId },
  );

  if (records.length === 0) return null;

  const r = records[0];
  return {
    id: r.get('id'),
    name: r.get('name'),
    type: r.get('type'),
    layer: r.get('layer'),
    domain: r.get('domain'),
    maturity: r.get('maturity')?.toNumber?.() || 1,
    riskLevel: r.get('riskLevel') || 'low',
    status: r.get('status') || 'current',
    description: r.get('description') || '',
    metadata: (() => {
      const raw = r.get('metadataJson') || r.get('metadata');
      if (!raw) return {};
      if (typeof raw === 'string') try { return JSON.parse(raw); } catch { return {}; }
      return raw;
    })(),
  };
}

/**
 * Load all non-policy elements from Neo4j for a project.
 *
 * Excluded:
 *   - Policy nodes themselves (metadata.isPolicyNode === true)
 *   - Compliance-policy projections (Requirements created by
 *     projectPoliciesAsRequirements — they have metadata.source ===
 *     'compliance-policy' OR a sourcePolicyId field). Such Requirements
 *     ARE the policy in element form; evaluating policies against them
 *     produces nonsensical self-violations (e.g. "Reporting Period
 *     Consistency Requirement" violates the "Reporting Period
 *     Consistency" policy because its description doesn't contain
 *     keywords from itself).
 *   - ALL motivation-layer elements (Goal, Driver, Principle,
 *     Requirement, Constraint, Stakeholder, Value, Meaning, Outcome,
 *     Assessment). These describe the abstract WHY of the
 *     architecture, not what concrete elements DO. Evaluating
 *     content-checking rules against them (e.g. "description must
 *     contain X") produces 8-12 false-positive violations per Goal —
 *     the BSH-demo blocker. Architects should target Strategy/Business/
 *     Application/Technology/Implementation elements with their
 *     compliance policies.
 */
async function loadProjectElements(projectId: string): Promise<Neo4jElement[]> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE NOT (e.metadataJson CONTAINS '"isPolicyNode":true' OR e.metadataJson CONTAINS '"isPolicyNode": true')
       AND NOT (e.metadataJson CONTAINS '"source":"compliance-policy"' OR e.metadataJson CONTAINS '"source": "compliance-policy"')
       AND e.sourcePolicyId IS NULL
       AND e.layer <> 'motivation'
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.togafDomain as domain, e.maturityLevel as maturity,
            e.riskLevel as riskLevel, e.status as status,
            e.description as description, e.metadataJson as metadataJson`,
    { projectId },
  );

  return records.map((r) => ({
    id: r.get('id'),
    name: r.get('name'),
    type: r.get('type'),
    layer: r.get('layer'),
    domain: r.get('domain'),
    maturity: r.get('maturity')?.toNumber?.() || 1,
    riskLevel: r.get('riskLevel') || 'low',
    status: r.get('status') || 'current',
    description: r.get('description') || '',
    metadata: (() => {
      const raw = r.get('metadataJson');
      if (!raw) return {};
      if (typeof raw === 'string') try { return JSON.parse(raw); } catch { return {}; }
      return raw;
    })(),
  }));
}

/**
 * Evaluate all active policies against a single element.
 * Called after element create/update/delete.
 */
export async function evaluateElementPolicies(
  projectId: string,
  elementId: string,
  eventType: 'create' | 'update' | 'delete',
): Promise<void> {
  // On delete: resolve all open violations for this element
  if (eventType === 'delete') {
    await PolicyViolation.updateMany(
      { projectId, elementId, status: 'open' },
      { $set: { status: 'resolved', resolvedAt: new Date(), details: 'Element deleted' } },
    );
    emitViolationUpdate(projectId);
    return;
  }

  const element = await loadElement(elementId);
  if (!element) return;

  // Skip policy nodes themselves
  if (element.metadata?.isPolicyNode) return;

  // Skip compliance-policy projections (Requirements created by
  // projectPoliciesAsRequirements). They ARE policies in element form —
  // evaluating policies against them produces self-violations.
  if (element.metadata?.source === 'compliance-policy') return;

  // Skip motivation-layer elements (Goal, Driver, Requirement,
  // Constraint, Principle, Stakeholder, Value, Meaning, Outcome,
  // Assessment). They are abstractions of intent — policies operate
  // on concrete realizers (Process, Capability, Application).
  if (element.layer === 'motivation') return;

  const policies = await Policy.find({
    projectId,
    enabled: true,
    status: { $in: ['active', undefined, null] },
  });

  const now = new Date();

  for (const policy of policies) {
    // Check effective dates
    if (policy.effectiveFrom && policy.effectiveFrom > now) continue;
    if (policy.effectiveUntil && policy.effectiveUntil < now) continue;

    // Check scope match
    if (!elementMatchesScope(element, policy)) continue;

    const policyId = policy._id.toString();

    for (const rule of policy.rules) {
      const fieldValue = getFieldValue(element as unknown as Record<string, unknown>, rule.field);
      const isCompliant = evaluateRule(fieldValue, rule.operator, rule.value);

      if (!isCompliant) {
        // Upsert violation (unique index on policyId+elementId+field)
        await PolicyViolation.findOneAndUpdate(
          { policyId: policy._id, elementId, field: rule.field },
          {
            $set: {
              projectId,
              violationType: 'violation',
              severity: policy.severity,
              message: rule.message,
              currentValue: fieldValue,
              expectedValue: rule.value,
              status: 'open',
              detectedAt: now,
              resolvedAt: null,
              resolvedBy: null,
              details: `Rule: ${rule.field} ${rule.operator} ${JSON.stringify(rule.value)}`,
            },
          },
          { upsert: true },
        );

        // Sync to Neo4j
        try {
          await syncViolationToNeo4j(policyId, elementId, policy.severity);
        } catch (err) {
          console.error('[PolicyEval] Failed to sync violation to Neo4j:', err);
        }
      } else {
        // Resolve existing violation if any
        const resolved = await PolicyViolation.findOneAndUpdate(
          { policyId: policy._id, elementId, field: rule.field, status: 'open' },
          { $set: { status: 'resolved', resolvedAt: now } },
        );

        if (resolved) {
          // Check if any violations remain for this policy+element
          const remaining = await PolicyViolation.countDocuments({
            policyId: policy._id, elementId, status: 'open',
          });
          if (remaining === 0) {
            try {
              await removeViolationFromNeo4j(policyId, elementId);
            } catch (err) {
              console.error('[PolicyEval] Failed to remove violation from Neo4j:', err);
            }
          }
        }
      }
    }
  }

  emitViolationUpdate(projectId);
}

/**
 * Evaluate a single policy against all elements in its scope.
 * Called after policy create/update/activate.
 */
export async function evaluateAllForPolicy(
  projectId: string,
  policyId: string,
): Promise<void> {
  const policy = await Policy.findById(policyId);
  if (!policy || !policy.enabled || (policy.status && policy.status !== 'active')) return;

  const now = new Date();
  if (policy.effectiveFrom && policy.effectiveFrom > now) return;
  if (policy.effectiveUntil && policy.effectiveUntil < now) return;

  const elements = await loadProjectElements(projectId);
  const matchingElements = elements.filter((el) => elementMatchesScope(el, policy));

  for (const el of matchingElements) {
    for (const rule of policy.rules) {
      const fieldValue = getFieldValue(el as unknown as Record<string, unknown>, rule.field);
      const isCompliant = evaluateRule(fieldValue, rule.operator, rule.value);

      if (!isCompliant) {
        await PolicyViolation.findOneAndUpdate(
          { policyId: policy._id, elementId: el.id, field: rule.field },
          {
            $set: {
              projectId,
              violationType: 'violation',
              severity: policy.severity,
              message: rule.message,
              currentValue: fieldValue,
              expectedValue: rule.value,
              status: 'open',
              detectedAt: now,
              resolvedAt: null,
              resolvedBy: null,
              details: `Rule: ${rule.field} ${rule.operator} ${JSON.stringify(rule.value)}`,
            },
          },
          { upsert: true },
        );

        try {
          await syncViolationToNeo4j(policyId, el.id, policy.severity);
        } catch (err) {
          console.error('[PolicyEval] Failed to sync violation to Neo4j:', err);
        }
      }
    }
  }

  emitViolationUpdate(projectId);
}

/**
 * One-time cleanup: resolve open violations that policies should never
 * have created in the first place — namely violations targeting
 * compliance-policy Requirement projections OR any motivation-layer
 * element. Both categories are now skipped at evaluation time, but
 * pre-existing violations from earlier evaluation runs need scrubbing.
 *
 * Returns the number of violations resolved.
 */
export async function cleanupCompliancePolicySelfViolations(
  projectId: string,
): Promise<{ resolvedCount: number; affectedElementIds: string[] }> {
  // 1) Find element IDs to clean: compliance-policy projections OR
  //    any motivation-layer element.
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.metadataJson CONTAINS '"source":"compliance-policy"'
        OR e.metadataJson CONTAINS '"source": "compliance-policy"'
        OR e.sourcePolicyId IS NOT NULL
        OR e.layer = 'motivation'
     RETURN e.id AS id`,
    { projectId },
  );
  const compliancePolicyElementIds = records.map((r) => r.get('id') as string).filter(Boolean);

  if (compliancePolicyElementIds.length === 0) {
    return { resolvedCount: 0, affectedElementIds: [] };
  }

  // 2) Resolve all open violations targeting those elements
  const result = await PolicyViolation.updateMany(
    { projectId, elementId: { $in: compliancePolicyElementIds }, status: 'open' },
    {
      $set: {
        status: 'resolved',
        resolvedAt: new Date(),
        details: 'Auto-resolved: out-of-scope element (compliance-policy projection or motivation-layer element)',
      },
    },
  );

  // 3) Best-effort Neo4j cleanup — remove the VIOLATES edges
  for (const elementId of compliancePolicyElementIds) {
    try {
      await runCypher(
        `MATCH (p:ArchitectureElement)-[v:VIOLATES]->(e:ArchitectureElement {id: $elementId, projectId: $projectId})
         DELETE v`,
        { projectId, elementId },
      );
    } catch (err) {
      console.error('[PolicyEval] Failed to clean Neo4j VIOLATES edges:', err);
    }
  }

  emitViolationUpdate(projectId);
  return {
    resolvedCount: result.modifiedCount ?? 0,
    affectedElementIds: compliancePolicyElementIds,
  };
}

/**
 * Emit a violation update event via WebSocket.
 */
function emitViolationUpdate(projectId: string): void {
  try {
    const io = getIO();
    io.to(`project:${projectId}`).emit('violation:update', { projectId });
  } catch {
    // Socket not initialized (e.g., during tests) — silently ignore
  }
}
