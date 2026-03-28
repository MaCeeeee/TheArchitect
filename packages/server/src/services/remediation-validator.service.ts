import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { Standard } from '../models/Standard';
import {
  ARCHIMATE_STANDARD_TYPES,
  ARCHIMATE_STANDARD_CONNECTION_TYPES,
  ELEMENT_TYPES,
} from '@thearchitect/shared';
import type {
  ProposalElement,
  ProposalConnection,
  ProposalValidationResult,
  ProposalElementValidation,
  ProposalConnectionValidation,
} from '@thearchitect/shared';

// ─── Layer-Domain Mapping for validation ───

const ELEMENT_TYPE_LOOKUP = new Map(
  ELEMENT_TYPES.map((et) => [et.type, { domain: et.domain }]),
);

// ArchiMate 3.2 connection rules (simplified: 15 most common valid/invalid combinations)
// Key: connectionType, Value: { validDirections: [sourceLayer → targetLayer patterns] }
const CONNECTION_LAYER_RULES: Record<string, { sameLevelOnly?: boolean; direction?: 'down-to-up' | 'any' }> = {
  composition: { sameLevelOnly: true },
  aggregation: { sameLevelOnly: true },
  specialization: { sameLevelOnly: true },
  serving: { direction: 'down-to-up' },
  realization: { direction: 'down-to-up' },
  assignment: { direction: 'any' },
  access: { direction: 'any' },
  influence: { direction: 'any' },
  triggering: { direction: 'any' },
  flow: { direction: 'any' },
  association: { direction: 'any' },
};

const LAYER_ORDER: Record<string, number> = {
  motivation: 7,
  strategy: 6,
  business: 5,
  information: 4,
  application: 3,
  technology: 2,
  physical: 1,
  implementation_migration: 0,
};

// ─── Main Validation Function ───

export async function validateProposal(
  projectId: string,
  proposal: { elements: ProposalElement[]; connections: ProposalConnection[] },
  standardId?: string,
): Promise<ProposalValidationResult> {
  const { elements, connections } = proposal;

  // Batch-fetch existing elements for duplicate detection and connection resolution
  const existingElements = await getExistingElements(projectId);

  // Build tempId → element lookup
  const tempIdMap = new Map<string, ProposalElement>();
  for (const el of elements) {
    tempIdMap.set(el.tempId, el);
  }

  // Get standard sections for §-reference validation
  let sectionNumbers: Set<string> | undefined;
  if (standardId) {
    sectionNumbers = await getStandardSectionNumbers(standardId);
  }

  // Validate elements
  const elementResults: ProposalElementValidation[] = elements.map((el) =>
    validateElement(el, existingElements, sectionNumbers),
  );

  // Validate connections
  const connectionResults: ProposalConnectionValidation[] = connections.map((conn) =>
    validateConnection(conn, tempIdMap, existingElements),
  );

  const hasErrors = elementResults.some((r) => !r.valid) || connectionResults.some((r) => !r.valid);

  return {
    elementResults,
    connectionResults,
    overallValid: !hasErrors,
    validatedAt: new Date().toISOString(),
  };
}

// ─── Element Validation ───

function validateElement(
  element: ProposalElement,
  existingElements: Map<string, ExistingElement>,
  sectionNumbers?: Set<string>,
): ProposalElementValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule 1: Whitelist validation
  if (!ARCHIMATE_STANDARD_TYPES.has(element.type as any)) {
    errors.push(`Invalid element type "${element.type}". Must be a standard ArchiMate 3.2 type.`);
  }

  // Rule 2: Name must be non-empty
  if (!element.name || element.name.trim().length === 0) {
    errors.push('Element name must not be empty.');
  }

  // Rule 3: Layer-domain consistency
  const typeInfo = ELEMENT_TYPE_LOOKUP.get(element.type as any);
  if (typeInfo && typeInfo.domain !== element.togafDomain) {
    warnings.push(`Type "${element.type}" is typically in domain "${typeInfo.domain}", but proposal uses "${element.togafDomain}".`);
  }

  // Rule 4: Duplicate detection
  for (const [, existing] of existingElements) {
    if (
      existing.name.toLowerCase() === element.name.toLowerCase() &&
      existing.type === element.type
    ) {
      warnings.push(`Element "${element.name}" of type "${element.type}" already exists in the architecture.`);
      break;
    }
  }

  // Rule 5: Confidence threshold
  if (element.confidence < 0.3) {
    errors.push(`Confidence ${element.confidence} is below minimum threshold (0.3).`);
  } else if (element.confidence < 0.5) {
    warnings.push(`Low confidence (${element.confidence}). Review carefully before applying.`);
  }

  // Rule 6: §-Reference validation
  if (element.sectionReference && sectionNumbers) {
    const refNumber = element.sectionReference.replace(/^§/, '').trim();
    if (!sectionNumbers.has(refNumber)) {
      warnings.push(`Section reference "${element.sectionReference}" not found in the standard.`);
    }
  }

  // Rule 7: Valid layer
  if (!(element.layer in LAYER_ORDER)) {
    errors.push(`Invalid layer "${element.layer}".`);
  }

  return {
    tempId: element.tempId,
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ─── Connection Validation ───

function validateConnection(
  connection: ProposalConnection,
  tempIdMap: Map<string, ProposalElement>,
  existingElements: Map<string, ExistingElement>,
): ProposalConnectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule 1: Connection type whitelist
  if (!ARCHIMATE_STANDARD_CONNECTION_TYPES.has(connection.type)) {
    errors.push(`Invalid connection type "${connection.type}". Must be a standard ArchiMate 3.2 connection type.`);
  }

  // Rule 2: TempId consistency — resolve source and target
  const source = resolveEndpoint(connection.sourceTempId, tempIdMap, existingElements);
  const target = resolveEndpoint(connection.targetTempId, tempIdMap, existingElements);

  if (!source) {
    errors.push(`Source "${connection.sourceTempId}" not found in proposal elements or existing architecture.`);
  }
  if (!target) {
    errors.push(`Target "${connection.targetTempId}" not found in proposal elements or existing architecture.`);
  }

  // Rule 3: Connection layer rules (only if both endpoints resolved)
  if (source && target) {
    const rule = CONNECTION_LAYER_RULES[connection.type];
    if (rule) {
      const sourceOrder = LAYER_ORDER[source.layer] ?? -1;
      const targetOrder = LAYER_ORDER[target.layer] ?? -1;

      if (rule.sameLevelOnly && sourceOrder !== targetOrder) {
        warnings.push(`"${connection.type}" connections typically stay within the same layer. Source is in "${source.layer}", target in "${target.layer}".`);
      }

      if (rule.direction === 'down-to-up' && sourceOrder > targetOrder) {
        warnings.push(`"${connection.type}" typically flows from lower to upper layers. Source "${source.layer}" is above target "${target.layer}".`);
      }
    }

    // Self-connection check
    if (connection.sourceTempId === connection.targetTempId) {
      warnings.push('Self-referencing connection detected.');
    }
  }

  // Rule 4: Confidence threshold
  if (connection.confidence < 0.3) {
    errors.push(`Confidence ${connection.confidence} is below minimum threshold (0.3).`);
  }

  return {
    tempId: connection.tempId,
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ─── Helpers ───

interface ExistingElement {
  id: string;
  name: string;
  type: string;
  layer: string;
}

function resolveEndpoint(
  tempId: string,
  tempIdMap: Map<string, ProposalElement>,
  existingElements: Map<string, ExistingElement>,
): { layer: string } | null {
  // Check if it's a proposal element
  const proposed = tempIdMap.get(tempId);
  if (proposed) return { layer: proposed.layer };

  // Check if it references an existing element (format: "existing:ElementName")
  if (tempId.startsWith('existing:')) {
    const name = tempId.slice('existing:'.length).trim();
    for (const [, el] of existingElements) {
      if (el.name === name) return { layer: el.layer };
    }
    return null;
  }

  // Try direct ID lookup in existing elements
  const existing = existingElements.get(tempId);
  if (existing) return { layer: existing.layer };

  return null;
}

async function getExistingElements(projectId: string): Promise<Map<string, ExistingElement>> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer
     LIMIT 500`,
    { projectId },
  );

  const map = new Map<string, ExistingElement>();
  for (const r of records) {
    const props = serializeNeo4jProperties(r.toObject());
    const el: ExistingElement = {
      id: String(props.id || ''),
      name: String(props.name || ''),
      type: String(props.type || ''),
      layer: String(props.layer || ''),
    };
    map.set(el.id, el);
  }
  return map;
}

async function getStandardSectionNumbers(standardId: string): Promise<Set<string>> {
  const standard = await Standard.findById(standardId).select('sections.number');
  if (!standard) return new Set();
  return new Set(standard.sections.map((s) => s.number));
}
