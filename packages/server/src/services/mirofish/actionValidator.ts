import { runCypher } from '../../config/neo4j';
import type { AgentPersona, ProposedAction, ValidationResult } from '@thearchitect/shared/src/types/simulation.types';
import { getVisibleElementIds } from './agentContextFilter';

const VALID_STATUSES = new Set(['current', 'target', 'transitional', 'retired']);
const VALID_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const RISK_HIERARCHY: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/**
 * Anti-Hallucination Layer: Validates every agent-proposed action against real architecture state.
 * Rejects actions that reference non-existent elements, violate RBAC boundaries, or exceed constraints.
 */
export async function validateActions(
  projectId: string,
  persona: AgentPersona,
  actions: ProposedAction[],
): Promise<ValidationResult[]> {
  if (actions.length === 0) return [];

  // Batch-fetch all referenced element IDs from Neo4j
  const referencedIds = new Set<string>();
  for (const action of actions) {
    if (action.targetElementId) referencedIds.add(action.targetElementId);
  }

  const existingElements = await getExistingElements(projectId, [...referencedIds]);
  const visibleIds = await getVisibleElementIds(projectId, persona);

  // Track cumulative budget usage across actions
  let cumulativeBudgetRequest = 0;

  const results: ValidationResult[] = [];

  for (const action of actions) {
    const result = validateSingleAction(
      action,
      persona,
      existingElements,
      visibleIds,
      cumulativeBudgetRequest,
    );

    if (result.valid && action.type === 'request_budget' && action.estimatedCostImpact) {
      cumulativeBudgetRequest += action.estimatedCostImpact;
    }

    results.push(result);
  }

  return results;
}

function validateSingleAction(
  action: ProposedAction,
  persona: AgentPersona,
  existingElements: Map<string, ElementInfo>,
  visibleIds: Set<string>,
  cumulativeBudget: number,
): ValidationResult {
  // Rule 1: Element must exist in Neo4j
  if (!existingElements.has(action.targetElementId)) {
    return {
      valid: false,
      action,
      rejectionReason: `Element "${action.targetElementId}" does not exist in the architecture. Hallucinated reference blocked.`,
    };
  }

  // Rule 2: Element must be within persona's visible layers/domains
  if (!visibleIds.has(action.targetElementId)) {
    const element = existingElements.get(action.targetElementId)!;
    return {
      valid: false,
      action,
      rejectionReason: `Element "${element.name}" (layer: ${element.layer}) is outside your visibility scope. Access denied.`,
    };
  }

  // Rule 3: Budget constraint check for investment recommendations
  if (action.type === 'request_budget' && persona.budgetConstraint) {
    const requestAmount = action.estimatedCostImpact || 0;
    if (cumulativeBudget + requestAmount > persona.budgetConstraint) {
      return {
        valid: false,
        action,
        rejectionReason: `Budget request ($${requestAmount.toLocaleString()}) would exceed your budget ceiling of $${persona.budgetConstraint.toLocaleString()}. Cumulative: $${(cumulativeBudget + requestAmount).toLocaleString()}.`,
      };
    }
  }

  if (action.type === 'recommend_invest' && persona.budgetConstraint) {
    const investAmount = action.estimatedCostImpact || 0;
    if (cumulativeBudget + investAmount > persona.budgetConstraint) {
      return {
        valid: false,
        action,
        rejectionReason: `Investment recommendation ($${investAmount.toLocaleString()}) exceeds remaining budget. Ceiling: $${persona.budgetConstraint.toLocaleString()}.`,
      };
    }
  }

  // Rule 4: Risk threshold check
  if (action.type === 'modify_risk' && persona.riskThreshold && action.changes?.riskLevel) {
    const proposedRisk = action.changes.riskLevel;
    const thresholdLevel = RISK_HIERARCHY[persona.riskThreshold] || 2;
    const proposedLevel = RISK_HIERARCHY[proposedRisk] || 0;

    if (proposedLevel > thresholdLevel) {
      return {
        valid: false,
        action,
        rejectionReason: `Proposed risk level "${proposedRisk}" exceeds your risk threshold of "${persona.riskThreshold}".`,
      };
    }
  }

  // Rule 5: Validate enum values in changes
  if (action.changes) {
    if (action.changes.status && !VALID_STATUSES.has(action.changes.status)) {
      return {
        valid: false,
        action,
        rejectionReason: `Invalid status value "${action.changes.status}". Must be one of: ${[...VALID_STATUSES].join(', ')}.`,
      };
    }
    if (action.changes.riskLevel && !VALID_RISK_LEVELS.has(action.changes.riskLevel)) {
      return {
        valid: false,
        action,
        rejectionReason: `Invalid risk level "${action.changes.riskLevel}". Must be one of: ${[...VALID_RISK_LEVELS].join(', ')}.`,
      };
    }
  }

  return { valid: true, action };
}

// ─── Helpers ───

interface ElementInfo {
  id: string;
  name: string;
  layer: string;
  togafDomain: string;
}

async function getExistingElements(
  projectId: string,
  elementIds: string[],
): Promise<Map<string, ElementInfo>> {
  if (elementIds.length === 0) return new Map();

  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.id IN $elementIds
     RETURN e.id as id, e.name as name, e.layer as layer, e.togafDomain as togafDomain`,
    { projectId, elementIds },
  );

  const map = new Map<string, ElementInfo>();
  for (const r of records) {
    const id = r.get('id') as string;
    map.set(id, {
      id,
      name: r.get('name') as string,
      layer: r.get('layer') as string,
      togafDomain: r.get('togafDomain') as string,
    });
  }
  return map;
}
