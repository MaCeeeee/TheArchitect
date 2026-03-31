/**
 * Full-Fidelity ArchiMate 3.1/3.2 Model Exchange File Parser
 *
 * Extends the basic XML parser with:
 * - Property definition resolution (propertyDefinitionRef → human-readable keys)
 * - Organization/folder structure extraction
 * - View/viewpoint metadata
 * - Profile support
 * - Influence strength, access type modifiers
 * - Documentation with language support
 */
import { v4 as uuid } from 'uuid';
import { XMLParser } from 'fast-xml-parser';
import type { ParseResult, ParsedElement, ParsedConnection } from '../services/upload.service';
import { ELEMENT_TYPES, ARCHIMATE_STANDARD_TYPES, LEGACY_TYPE_MAP } from '@thearchitect/shared';

// ─── Type validation ───

const TYPE_SET: Set<string> = new Set(ELEMENT_TYPES.map((et) => et.type));
const TYPE_TO_DOMAIN = new Map<string, string>();
for (const et of ELEMENT_TYPES) TYPE_TO_DOMAIN.set(et.type, et.domain);

const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy', business: 'business', application: 'application',
  data: 'application', technology: 'technology', physical: 'technology',
  motivation: 'motivation', implementation: 'implementation_migration', composite: 'other',
};

function normalizeType(raw: string): string {
  let t = raw.toLowerCase().replace(/[\s-]+/g, '_').trim();
  const legacy = LEGACY_TYPE_MAP[t as keyof typeof LEGACY_TYPE_MAP];
  if (legacy) t = legacy;
  if (TYPE_SET.has(t)) return t;
  for (const prefix of ['archimate_', 'archimate3_', 'am_']) {
    if (t.startsWith(prefix)) {
      const stripped = t.slice(prefix.length);
      if (TYPE_SET.has(stripped)) return stripped;
    }
  }
  return t;
}

function inferLayer(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type);
  if (domain) return DOMAIN_TO_LAYER[domain] || 'other';
  return 'other';
}

// ─── ArchiMate Type Maps (comprehensive) ───

const ELEMENT_TYPE_MAP: Record<string, string> = {
  // Business
  'BusinessActor': 'business_actor', 'BusinessRole': 'business_role',
  'BusinessCollaboration': 'business_collaboration', 'BusinessInterface': 'business_interface',
  'BusinessProcess': 'process', 'BusinessFunction': 'business_function',
  'BusinessInteraction': 'business_interaction', 'BusinessEvent': 'business_event',
  'BusinessService': 'business_service', 'BusinessObject': 'business_object',
  'Contract': 'contract', 'Representation': 'representation', 'Product': 'product',
  // Application
  'ApplicationComponent': 'application_component', 'ApplicationCollaboration': 'application_collaboration',
  'ApplicationInterface': 'application_interface', 'ApplicationFunction': 'application_function',
  'ApplicationInteraction': 'application_interaction', 'ApplicationProcess': 'application_process',
  'ApplicationEvent': 'application_event', 'ApplicationService': 'application_service',
  'DataObject': 'data_object',
  // Technology
  'Node': 'node', 'Device': 'device', 'SystemSoftware': 'system_software',
  'TechnologyCollaboration': 'technology_collaboration', 'TechnologyInterface': 'technology_interface',
  'TechnologyFunction': 'technology_function', 'TechnologyProcess': 'technology_process',
  'TechnologyInteraction': 'technology_interaction', 'TechnologyEvent': 'technology_event',
  'TechnologyService': 'technology_service', 'Artifact': 'artifact',
  'CommunicationNetwork': 'communication_network', 'Path': 'path',
  // Physical
  'Equipment': 'equipment', 'Facility': 'facility',
  'DistributionNetwork': 'distribution_network', 'Material': 'material',
  // Strategy
  'Resource': 'resource', 'Capability': 'business_capability',
  'ValueStream': 'value_stream', 'CourseOfAction': 'course_of_action',
  // Motivation
  'Stakeholder': 'stakeholder', 'Driver': 'driver', 'Assessment': 'assessment',
  'Goal': 'goal', 'Outcome': 'outcome', 'Principle': 'principle',
  'Requirement': 'requirement', 'Constraint': 'constraint',
  'Meaning': 'meaning', 'Value': 'am_value',
  // Implementation & Migration
  'WorkPackage': 'work_package', 'Deliverable': 'deliverable',
  'ImplementationEvent': 'implementation_event', 'Plateau': 'plateau', 'Gap': 'gap',
  // Composite
  'Grouping': 'grouping', 'Location': 'location',
  // Junction (ArchiMate 3.2 — map to grouping)
  'Junction': 'grouping', 'OrJunction': 'grouping', 'AndJunction': 'grouping',
};

const RELATIONSHIP_TYPE_MAP: Record<string, string> = {
  'Composition': 'composition', 'CompositionRelationship': 'composition',
  'Aggregation': 'aggregation', 'AggregationRelationship': 'aggregation',
  'Assignment': 'assignment', 'AssignmentRelationship': 'assignment',
  'Realization': 'realization', 'RealizationRelationship': 'realization',
  'Serving': 'serving', 'ServingRelationship': 'serving',
  'UsedBy': 'serving', 'UsedByRelationship': 'serving',       // ArchiMate 2.x compat
  'Access': 'access', 'AccessRelationship': 'access',
  'Influence': 'influence', 'InfluenceRelationship': 'influence',
  'Triggering': 'triggering', 'TriggeringRelationship': 'triggering',
  'Flow': 'flow', 'FlowRelationship': 'flow',
  'Specialization': 'specialization', 'SpecializationRelationship': 'specialization',
  'Association': 'association', 'AssociationRelationship': 'association',
};

// ─── Export metadata types ───

export interface ArchiMateView {
  id: string;
  name: string;
  viewpoint?: string;
  elementRefs: string[];
  relationshipRefs: string[];
}

export interface ArchiMateOrganization {
  name: string;
  elementRefs: string[];
  children: ArchiMateOrganization[];
}

export interface ArchiMateExchangeResult extends ParseResult {
  views: ArchiMateView[];
  organizations: ArchiMateOrganization[];
  propertyDefinitions: Map<string, string>;
  modelName: string;
  modelVersion: string;
}

// ─── Parser ───

export function parseArchiMateExchange(buffer: Buffer): ArchiMateExchangeResult {
  const xmlStr = buffer.toString('utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    isArray: (name) => [
      'element', 'relationship', 'property', 'value', 'propertyDefinition',
      'view', 'node', 'connection', 'item', 'label',
    ].includes(name),
  });

  const parsed = parser.parse(xmlStr);
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];
  const warnings: string[] = [];
  const views: ArchiMateView[] = [];
  const organizations: ArchiMateOrganization[] = [];

  // Find model root
  const model = parsed.model || parsed['archimate:model'] || parsed;
  const modelName = extractText(model?.name) || model?.['@_name'] || 'Imported Model';
  const modelVersion = model?.['@_version'] || '3.1';

  // ─── 1. Property Definitions ───
  const propertyDefinitions = new Map<string, string>();
  const xmlPropDefs = toArray(model?.propertyDefinitions?.propertyDefinition || model?.propertyDefinition);
  for (const pd of xmlPropDefs) {
    if (!pd) continue;
    const defId = pd['@_identifier'] || pd['@_id'] || '';
    const defName = extractText(pd?.name) || pd['@_name'] || defId;
    if (defId) propertyDefinitions.set(defId, defName);
  }

  // ─── 2. Elements ───
  const xmlElements = toArray(model?.elements?.element || model?.element);
  const idMap = new Map<string, string>(); // archiId → our ID
  const archiIdToName = new Map<string, string>();

  for (const el of xmlElements) {
    if (!el) continue;
    const archiId = el['@_identifier'] || el['@_id'] || `elem-${uuid().slice(0, 8)}`;
    const xsiType = el['@_xsi:type'] || el['@_type'] || '';
    const typeName = xsiType.replace(/^archimate:?/i, '');

    const type = ELEMENT_TYPE_MAP[typeName] || normalizeType(typeName);
    if (!TYPE_SET.has(type)) {
      warnings.push(`Element '${extractText(el.name) || archiId}': Unknown type '${xsiType}' → '${type}'`);
    }

    const elemId = `elem-${uuid().slice(0, 8)}`;
    idMap.set(archiId, elemId);

    const name = extractText(el.name) || el['@_name'] || archiId;
    archiIdToName.set(archiId, name);

    // Extract properties with resolved definition names
    const props: Record<string, string> = {};
    const xmlProps = toArray(el.properties?.property || el.property);
    for (const p of xmlProps) {
      if (!p) continue;
      const defRef = p['@_propertyDefinitionRef'] || p['@_identifierRef'] || '';
      const key = propertyDefinitions.get(defRef) || defRef || p['@_key'] || 'unknown';
      const val = extractText(p.value) || p['@_value'] || '';
      if (val) props[key] = String(val);
    }

    // Extract documentation (multi-language support)
    const doc = extractDocumentation(el);

    elements.push({
      id: elemId,
      name,
      type,
      layer: inferLayer(type),
      description: doc,
      status: 'current',
      riskLevel: 'low',
      maturityLevel: 3,
      properties: Object.keys(props).length > 0 ? props : undefined,
    });
  }

  // ─── 3. Relationships ───
  const xmlRels = toArray(model?.relationships?.relationship || model?.relationship);

  for (const rel of xmlRels) {
    if (!rel) continue;
    const xsiType = rel['@_xsi:type'] || rel['@_type'] || '';
    const relTypeName = xsiType.replace(/^archimate:?/i, '');
    const relType = RELATIONSHIP_TYPE_MAP[relTypeName] || 'association';

    const sourceRef = rel['@_source'] || '';
    const targetRef = rel['@_target'] || '';
    const sourceId = idMap.get(sourceRef);
    const targetId = idMap.get(targetRef);

    if (!sourceId || !targetId) {
      warnings.push(`Relationship '${rel['@_identifier'] || '?'}': unresolved source/target — skipped`);
      continue;
    }

    // Capture access type and influence strength as label
    let label = extractText(rel.name) || rel['@_name'] || '';
    const accessType = rel['@_accessType'];
    const modifier = rel['@_modifier'];
    if (accessType) label = label || `access:${accessType}`;
    if (modifier) label = label || `influence:${modifier}`;

    connections.push({
      id: `conn-${uuid().slice(0, 8)}`,
      sourceId,
      targetId,
      type: relType,
      label,
    });
  }

  // ─── 4. Views ───
  const xmlViews = toArray(
    model?.views?.diagrams?.view || model?.views?.view || model?.view
  );

  for (const v of xmlViews) {
    if (!v) continue;
    const viewId = v['@_identifier'] || v['@_id'] || `view-${uuid().slice(0, 8)}`;
    const viewName = extractText(v.name) || v['@_name'] || 'Unnamed View';
    const viewpoint = v['@_viewpoint'] || v['@_xsi:type']?.replace('Diagram', '') || undefined;

    const elementRefs: string[] = [];
    const relationshipRefs: string[] = [];

    // Collect element refs from view nodes (recursive)
    collectViewRefs(v, elementRefs, relationshipRefs, idMap);

    views.push({
      id: viewId,
      name: viewName,
      viewpoint,
      elementRefs,
      relationshipRefs,
    });
  }

  // ─── 5. Organizations (folder structure) ───
  const xmlOrgs = toArray(model?.organizations?.item || model?.organization?.item);
  for (const item of xmlOrgs) {
    if (item) organizations.push(parseOrganizationItem(item, idMap));
  }

  return {
    elements,
    connections,
    warnings,
    format: 'archimate-exchange',
    views,
    organizations,
    propertyDefinitions,
    modelName,
    modelVersion,
  };
}

// ─── Helpers ───

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node !== null) {
    // Handle {#text: '...', @_xml:lang: 'en'} or similar
    const obj = node as Record<string, unknown>;
    if ('#text' in obj) return String(obj['#text']);
    // Multi-language: pick first available
    const values = toArray(obj as any);
    if (values.length > 0 && typeof values[0] === 'object') {
      return extractText(values[0]);
    }
  }
  return String(node);
}

function extractDocumentation(el: Record<string, unknown>): string {
  const doc = el.documentation || el.description;
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  return extractText(doc);
}

function collectViewRefs(
  node: any,
  elementRefs: string[],
  relationshipRefs: string[],
  idMap: Map<string, string>,
): void {
  if (!node) return;

  // View nodes reference elements
  const nodes = toArray(node.node);
  for (const n of nodes) {
    const elemRef = n?.['@_elementRef'] || n?.['@_archimateElement'];
    if (elemRef) {
      const resolved = idMap.get(elemRef);
      if (resolved) elementRefs.push(resolved);
    }
    // Recurse into nested nodes
    collectViewRefs(n, elementRefs, relationshipRefs, idMap);
  }

  // View connections reference relationships
  const conns = toArray(node.connection);
  for (const c of conns) {
    const relRef = c?.['@_relationshipRef'] || c?.['@_archimateRelationship'];
    if (relRef) relationshipRefs.push(relRef);
  }
}

function parseOrganizationItem(
  item: any,
  idMap: Map<string, string>,
): ArchiMateOrganization {
  const name = extractText(item?.label?.[0]) || extractText(item?.name) || item?.['@_name'] || 'Folder';
  const elementRefs: string[] = [];
  const children: ArchiMateOrganization[] = [];

  // Direct element references
  const refs = toArray(item?.['@_identifierRef'] || item?.item);
  for (const ref of refs) {
    if (typeof ref === 'string') {
      const resolved = idMap.get(ref);
      if (resolved) elementRefs.push(resolved);
    } else if (ref && typeof ref === 'object') {
      // Nested item — recurse
      children.push(parseOrganizationItem(ref, idMap));
    }
  }

  return { name, elementRefs, children };
}
