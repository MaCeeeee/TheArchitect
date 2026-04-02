/**
 * ArchiMate 3.2 Element Categories & Sub-Grouping
 *
 * Maps every ElementType to its ArchiMate aspect (Active Structure, Behavioral,
 * Passive Structure, Composite, Motivation, Strategy, Implementation) and layer.
 * Used by the Smart Element Palette for grouped display and by the Relationship
 * Rules engine for validation.
 */
import type { ElementType, ArchitectureLayer } from '../types/architecture.types';

// ──────────────────────────────────────────────────────────
// ArchiMate Aspect (concept category within a layer)
// ──────────────────────────────────────────────────────────
export type ArchiMateAspect =
  | 'active_structure'
  | 'behavioral'
  | 'passive_structure'
  | 'composite'
  | 'motivation'
  | 'strategy'
  | 'implementation'
  | 'other';

export interface ElementCategoryInfo {
  type: ElementType;
  layer: ArchitectureLayer;
  aspect: ArchiMateAspect;
  standard: boolean;        // true = ArchiMate 3.2 compliant
  description: string;      // one-liner for palette tooltip
  keywords: string[];       // extra search terms
}

// ──────────────────────────────────────────────────────────
// Full Category Registry
// ──────────────────────────────────────────────────────────
export const ELEMENT_CATEGORIES: ElementCategoryInfo[] = [
  // ── Strategy Layer (ArchiMate 3.2 Ch.7) ────────────────
  { type: 'business_capability', layer: 'strategy', aspect: 'strategy', standard: true,
    description: 'A particular ability that a business may possess or exchange',
    keywords: ['capability', 'ability', 'capacity'] },
  { type: 'value_stream', layer: 'strategy', aspect: 'strategy', standard: true,
    description: 'A sequence of activities that creates an overall result for a customer or stakeholder',
    keywords: ['value', 'stream', 'chain', 'customer'] },
  { type: 'resource', layer: 'strategy', aspect: 'strategy', standard: true,
    description: 'An asset owned or controlled by an individual or organization',
    keywords: ['resource', 'asset', 'capital'] },
  { type: 'course_of_action', layer: 'strategy', aspect: 'strategy', standard: true,
    description: 'An approach or plan for configuring capabilities and resources to achieve a goal',
    keywords: ['action', 'plan', 'initiative', 'program'] },

  // ── Business Layer — Active Structure (Ch.8.2) ─────────
  { type: 'business_actor', layer: 'business', aspect: 'active_structure', standard: true,
    description: 'A business entity that is capable of performing behavior',
    keywords: ['actor', 'person', 'organization', 'department', 'team'] },
  { type: 'business_role', layer: 'business', aspect: 'active_structure', standard: true,
    description: 'The responsibility for performing specific behavior to which an actor can be assigned',
    keywords: ['role', 'responsibility', 'function'] },
  { type: 'business_collaboration', layer: 'business', aspect: 'active_structure', standard: true,
    description: 'An aggregate of two or more business internal active structure elements that work together',
    keywords: ['collaboration', 'partnership', 'joint'] },
  { type: 'business_interface', layer: 'business', aspect: 'active_structure', standard: true,
    description: 'A point of access where a business service is made available',
    keywords: ['interface', 'channel', 'touchpoint', 'portal'] },

  // ── Business Layer — Behavioral (Ch.8.3) ───────────────
  { type: 'process', layer: 'business', aspect: 'behavioral', standard: true,
    description: 'A sequence of business behaviors that achieves a specific result',
    keywords: ['process', 'workflow', 'procedure', 'bpmn'] },
  { type: 'business_function', layer: 'business', aspect: 'behavioral', standard: true,
    description: 'A collection of business behavior based on chosen criteria',
    keywords: ['function', 'activity', 'operation'] },
  { type: 'business_interaction', layer: 'business', aspect: 'behavioral', standard: true,
    description: 'A unit of collective business behavior performed by two or more business roles',
    keywords: ['interaction', 'exchange', 'meeting'] },
  { type: 'business_event', layer: 'business', aspect: 'behavioral', standard: true,
    description: 'A business behavior element that denotes an organizational state change',
    keywords: ['event', 'trigger', 'signal', 'notification'] },
  { type: 'business_service', layer: 'business', aspect: 'behavioral', standard: true,
    description: 'An explicitly defined exposed business behavior',
    keywords: ['service', 'offering', 'sla'] },

  // ── Business Layer — Passive Structure (Ch.8.4) ────────
  { type: 'business_object', layer: 'business', aspect: 'passive_structure', standard: true,
    description: 'A concept used within a particular business domain',
    keywords: ['object', 'entity', 'document', 'information'] },
  { type: 'contract', layer: 'business', aspect: 'passive_structure', standard: true,
    description: 'A formal or informal specification of an agreement between a provider and a consumer',
    keywords: ['contract', 'agreement', 'sla', 'license'] },
  { type: 'representation', layer: 'business', aspect: 'passive_structure', standard: true,
    description: 'A perceptible form of the information carried by a business object',
    keywords: ['representation', 'document', 'form', 'report'] },

  // ── Business Layer — Composite (Ch.8.5) ────────────────
  { type: 'product', layer: 'business', aspect: 'composite', standard: true,
    description: 'A coherent collection of services and/or passive structure elements accompanied by a contract',
    keywords: ['product', 'offering', 'bundle', 'package'] },

  // ── Application Layer — Active Structure (Ch.9.2) ──────
  { type: 'application_component', layer: 'application', aspect: 'active_structure', standard: true,
    description: 'An encapsulation of application functionality aligned to implementation structure',
    keywords: ['component', 'module', 'system', 'app', 'microservice'] },
  { type: 'application_collaboration', layer: 'application', aspect: 'active_structure', standard: true,
    description: 'An aggregate of two or more application components that work together',
    keywords: ['collaboration', 'integration', 'cluster'] },
  { type: 'application_interface', layer: 'application', aspect: 'active_structure', standard: true,
    description: 'A point of access where application services are made available',
    keywords: ['interface', 'api', 'endpoint', 'rest', 'graphql', 'ui'] },
  { type: 'application', layer: 'application', aspect: 'active_structure', standard: false,
    description: 'Legacy: Use Application Component instead',
    keywords: ['application', 'legacy'] },

  // ── Application Layer — Behavioral (Ch.9.3) ────────────
  { type: 'application_function', layer: 'application', aspect: 'behavioral', standard: true,
    description: 'Automated behavior that can be performed by an application component',
    keywords: ['function', 'logic', 'calculation', 'algorithm'] },
  { type: 'application_interaction', layer: 'application', aspect: 'behavioral', standard: true,
    description: 'A unit of collective application behavior performed by two or more application components',
    keywords: ['interaction', 'call', 'request', 'message'] },
  { type: 'application_process', layer: 'application', aspect: 'behavioral', standard: true,
    description: 'A sequence of application behaviors that achieves a specific result',
    keywords: ['process', 'pipeline', 'batch', 'etl'] },
  { type: 'application_event', layer: 'application', aspect: 'behavioral', standard: true,
    description: 'An application behavior element that denotes a state change',
    keywords: ['event', 'webhook', 'notification', 'message'] },
  { type: 'application_service', layer: 'application', aspect: 'behavioral', standard: true,
    description: 'An explicitly defined exposed application behavior',
    keywords: ['service', 'api', 'endpoint'] },
  { type: 'service', layer: 'application', aspect: 'behavioral', standard: false,
    description: 'Legacy: Use Application Service instead',
    keywords: ['service', 'legacy'] },

  // ── Application Layer — Passive Structure (Ch.9.4) ─────
  { type: 'data_object', layer: 'application', aspect: 'passive_structure', standard: true,
    description: 'Data structured for automated processing',
    keywords: ['data', 'table', 'record', 'schema', 'json'] },

  // ── Data / Information (TOGAF Extensions) ──────────────
  { type: 'data_entity', layer: 'information', aspect: 'passive_structure', standard: false,
    description: 'TOGAF extension: A logical data concept in the data architecture',
    keywords: ['entity', 'erd', 'table', 'domain model'] },
  { type: 'data_model', layer: 'information', aspect: 'passive_structure', standard: false,
    description: 'TOGAF extension: A structural representation of data concepts and relationships',
    keywords: ['model', 'schema', 'erd', 'diagram'] },

  // ── Technology Layer — Active Structure (Ch.10.2) ──────
  { type: 'node', layer: 'technology', aspect: 'active_structure', standard: true,
    description: 'A computational or physical resource that hosts artifacts or software',
    keywords: ['node', 'server', 'vm', 'container', 'pod', 'host'] },
  { type: 'device', layer: 'technology', aspect: 'active_structure', standard: true,
    description: 'A physical IT resource upon which system software and artifacts may be stored or deployed',
    keywords: ['device', 'hardware', 'machine', 'physical', 'appliance'] },
  { type: 'system_software', layer: 'technology', aspect: 'active_structure', standard: true,
    description: 'Software that provides or contributes to an environment for running other software',
    keywords: ['os', 'runtime', 'middleware', 'database', 'docker', 'kubernetes'] },
  { type: 'technology_collaboration', layer: 'technology', aspect: 'active_structure', standard: true,
    description: 'An aggregate of two or more technology internal active structure elements that work together',
    keywords: ['cluster', 'federation', 'mesh'] },
  { type: 'technology_interface', layer: 'technology', aspect: 'active_structure', standard: true,
    description: 'A point of access where technology services are made available',
    keywords: ['interface', 'port', 'protocol', 'socket', 'api gateway'] },
  { type: 'communication_network', layer: 'technology', aspect: 'active_structure', standard: true,
    description: 'A set of structures that connects nodes for transmission, routing, and reception of data',
    keywords: ['network', 'lan', 'wan', 'vpc', 'subnet', 'vpn'] },
  { type: 'path', layer: 'technology', aspect: 'active_structure', standard: true,
    description: 'A link between two or more nodes through which data can be transmitted',
    keywords: ['path', 'link', 'connection', 'route'] },
  { type: 'technology_component', layer: 'technology', aspect: 'active_structure', standard: false,
    description: 'Legacy: Use Node instead',
    keywords: ['component', 'legacy'] },
  { type: 'infrastructure', layer: 'technology', aspect: 'active_structure', standard: false,
    description: 'Legacy: Use Node or Device instead',
    keywords: ['infrastructure', 'legacy'] },

  // ── Technology Layer — Behavioral (Ch.10.3-10.4) ───────
  { type: 'technology_function', layer: 'technology', aspect: 'behavioral', standard: true,
    description: 'A collection of technology behavior that can be performed by a node',
    keywords: ['function', 'routine', 'operation'] },
  { type: 'technology_process', layer: 'technology', aspect: 'behavioral', standard: true,
    description: 'A sequence of technology behaviors that achieves a specific result',
    keywords: ['process', 'job', 'daemon', 'cron'] },
  { type: 'technology_interaction', layer: 'technology', aspect: 'behavioral', standard: true,
    description: 'A unit of collective technology behavior performed by two or more nodes',
    keywords: ['interaction', 'handshake', 'sync', 'replication'] },
  { type: 'technology_event', layer: 'technology', aspect: 'behavioral', standard: true,
    description: 'A technology behavior element that denotes a state change',
    keywords: ['event', 'alert', 'log', 'signal'] },
  { type: 'technology_service', layer: 'technology', aspect: 'behavioral', standard: true,
    description: 'An explicitly defined exposed technology behavior',
    keywords: ['service', 'saas', 'paas', 'iaas', 'cloud'] },
  { type: 'platform_service', layer: 'technology', aspect: 'behavioral', standard: false,
    description: 'Legacy: Use Technology Service instead',
    keywords: ['platform', 'legacy'] },

  // ── Technology Layer — Passive Structure (Ch.10.5) ─────
  { type: 'artifact', layer: 'technology', aspect: 'passive_structure', standard: true,
    description: 'A piece of data that is used or produced in a software development process',
    keywords: ['artifact', 'file', 'binary', 'package', 'image', 'jar'] },

  // ── Physical Layer (Ch.10.6) ───────────────────────────
  { type: 'equipment', layer: 'physical', aspect: 'active_structure', standard: true,
    description: 'One or more physical machines, tools, or instruments that can create, use, store, or move material',
    keywords: ['equipment', 'machine', 'sensor', 'iot'] },
  { type: 'facility', layer: 'physical', aspect: 'active_structure', standard: true,
    description: 'A physical structure or environment that houses equipment or materials',
    keywords: ['facility', 'building', 'datacenter', 'office', 'warehouse'] },
  { type: 'distribution_network', layer: 'physical', aspect: 'active_structure', standard: true,
    description: 'A physical network used to transport materials or energy',
    keywords: ['distribution', 'logistics', 'supply chain', 'pipeline'] },
  { type: 'material', layer: 'physical', aspect: 'passive_structure', standard: true,
    description: 'Tangible physical matter or energy',
    keywords: ['material', 'inventory', 'stock', 'goods'] },

  // ── Motivation Layer (Ch.6) ────────────────────────────
  { type: 'stakeholder', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'The role of an individual, team, or organization that represents their interests',
    keywords: ['stakeholder', 'sponsor', 'owner', 'user'] },
  { type: 'driver', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'An external or internal condition that motivates an organization to define its goals',
    keywords: ['driver', 'trend', 'regulation', 'pressure'] },
  { type: 'assessment', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'The result of an analysis of the state of affairs with respect to a driver',
    keywords: ['assessment', 'swot', 'analysis', 'evaluation'] },
  { type: 'goal', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'A high-level statement of intent or direction',
    keywords: ['goal', 'objective', 'target', 'okr'] },
  { type: 'outcome', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'An end result that has been achieved',
    keywords: ['outcome', 'result', 'benefit', 'kpi'] },
  { type: 'principle', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'A qualitative statement of intent that should be met by the architecture',
    keywords: ['principle', 'guideline', 'rule', 'policy'] },
  { type: 'requirement', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'A statement of need that must be met by the architecture',
    keywords: ['requirement', 'need', 'spec', 'user story'] },
  { type: 'constraint', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'An external factor that prevents or restricts the realization of goals',
    keywords: ['constraint', 'limitation', 'restriction', 'compliance'] },
  { type: 'meaning', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'The knowledge or expertise present in or the interpretation given to a concept',
    keywords: ['meaning', 'semantics', 'definition'] },
  { type: 'am_value', layer: 'motivation', aspect: 'motivation', standard: true,
    description: 'The relative worth, utility, or importance of a concept',
    keywords: ['value', 'worth', 'benefit', 'roi'] },

  // ── Implementation & Migration (Ch.12) ─────────────────
  { type: 'work_package', layer: 'implementation_migration', aspect: 'implementation', standard: true,
    description: 'A series of actions identified and designed to achieve specific results within time and cost constraints',
    keywords: ['work package', 'project', 'sprint', 'epic'] },
  { type: 'deliverable', layer: 'implementation_migration', aspect: 'implementation', standard: true,
    description: 'A precisely-defined outcome of a work package',
    keywords: ['deliverable', 'artifact', 'release', 'milestone'] },
  { type: 'implementation_event', layer: 'implementation_migration', aspect: 'implementation', standard: true,
    description: 'A state change related to implementation or migration',
    keywords: ['event', 'milestone', 'gate', 'checkpoint'] },
  { type: 'plateau', layer: 'implementation_migration', aspect: 'implementation', standard: true,
    description: 'A relatively stable state of the architecture that exists during a limited period of time',
    keywords: ['plateau', 'phase', 'baseline', 'transition'] },
  { type: 'gap', layer: 'implementation_migration', aspect: 'implementation', standard: true,
    description: 'A statement of difference between two plateaus',
    keywords: ['gap', 'delta', 'difference', 'missing'] },

  // ── Composite (Ch.4) ──────────────────────────────────
  { type: 'grouping', layer: 'business', aspect: 'composite', standard: true,
    description: 'Aggregates or composes elements and/or relationships into a named group',
    keywords: ['group', 'folder', 'container', 'boundary'] },
  { type: 'location', layer: 'technology', aspect: 'composite', standard: true,
    description: 'A place or position where structure elements exist or behavior is performed',
    keywords: ['location', 'region', 'site', 'zone', 'cloud region'] },

  // ── AI Extension (TheArchitect) ────────────────────────
  { type: 'ai_agent', layer: 'application', aspect: 'active_structure', standard: false,
    description: 'TheArchitect extension: An autonomous or semi-autonomous AI agent',
    keywords: ['ai', 'agent', 'bot', 'llm', 'copilot', 'assistant'] },
];

// ──────────────────────────────────────────────────────────
// Fast lookup maps
// ──────────────────────────────────────────────────────────
export const CATEGORY_BY_TYPE: ReadonlyMap<ElementType, ElementCategoryInfo> =
  new Map(ELEMENT_CATEGORIES.map(c => [c.type, c]));

/** Human-readable labels for aspects (used in palette sub-group headers) */
export const ASPECT_LABELS: Record<ArchiMateAspect, string> = {
  active_structure: 'Active Structure',
  behavioral: 'Behavioral',
  passive_structure: 'Passive Structure',
  composite: 'Composite',
  motivation: 'Motivation',
  strategy: 'Strategy',
  implementation: 'Implementation & Migration',
  other: 'Other',
};

/** Display order for aspects within a layer section */
export const ASPECT_ORDER: ArchiMateAspect[] = [
  'active_structure',
  'behavioral',
  'passive_structure',
  'composite',
  'motivation',
  'strategy',
  'implementation',
  'other',
];
