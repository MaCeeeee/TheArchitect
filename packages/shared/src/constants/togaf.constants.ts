import type { ADMPhase, ArchitectureLayer, TOGAFDomain, ElementType } from '../types/architecture.types';

export const ADM_PHASES: { phase: ADMPhase; name: string; description: string }[] = [
  { phase: 'preliminary', name: 'Preliminary', description: 'Framework and Principles' },
  { phase: 'A', name: 'Architecture Vision', description: 'Define scope, stakeholders, and vision' },
  { phase: 'B', name: 'Business Architecture', description: 'Develop business architecture' },
  { phase: 'C', name: 'Information Systems Architecture', description: 'Data and application architecture' },
  { phase: 'D', name: 'Technology Architecture', description: 'Technology infrastructure' },
  { phase: 'E', name: 'Opportunities & Solutions', description: 'Identify delivery vehicles' },
  { phase: 'F', name: 'Migration Planning', description: 'Create implementation and migration plan' },
  { phase: 'G', name: 'Implementation Governance', description: 'Provide architectural oversight' },
  { phase: 'H', name: 'Architecture Change Management', description: 'Manage changes to architecture' },
];

export const ARCHITECTURE_LAYERS: { id: ArchitectureLayer; label: string; color: string; yPosition: number }[] = [
  { id: 'motivation', label: 'Motivation', color: '#ec4899', yPosition: 16 },
  { id: 'strategy', label: 'Strategy', color: '#f59e0b', yPosition: 12 },
  { id: 'business', label: 'Business', color: '#22c55e', yPosition: 8 },
  { id: 'information', label: 'Information Systems', color: '#3b82f6', yPosition: 4 },
  { id: 'application', label: 'Application', color: '#f97316', yPosition: 0 },
  { id: 'technology', label: 'Technology', color: '#a855f7', yPosition: -4 },
  { id: 'physical', label: 'Physical', color: '#14b8a6', yPosition: -8 },
  { id: 'implementation_migration', label: 'Implementation & Migration', color: '#6366f1', yPosition: -12 },
];

export const LAYER_Y: Record<string, number> = Object.fromEntries(
  ARCHITECTURE_LAYERS.map(l => [l.id, l.yPosition])
);

export const TOGAF_DOMAINS: { id: TOGAFDomain; label: string; color: string }[] = [
  { id: 'business', label: 'Business Architecture', color: '#22c55e' },
  { id: 'data', label: 'Data Architecture', color: '#3b82f6' },
  { id: 'application', label: 'Application Architecture', color: '#f97316' },
  { id: 'technology', label: 'Technology Architecture', color: '#a855f7' },
  { id: 'motivation', label: 'Motivation & Strategy', color: '#ec4899' },
  { id: 'implementation', label: 'Implementation & Migration', color: '#6366f1' },
];

export const ELEMENT_TYPES: { type: ElementType; label: string; domain: TOGAFDomain; geometry: string }[] = [
  // Strategy
  { type: 'business_capability', label: 'Business Capability', domain: 'business', geometry: 'box' },
  { type: 'value_stream', label: 'Value Stream', domain: 'business', geometry: 'box' },
  { type: 'resource', label: 'Resource', domain: 'business', geometry: 'box' },
  { type: 'course_of_action', label: 'Course of Action', domain: 'business', geometry: 'cylinder' },
  // Business — Active Structure
  { type: 'business_actor', label: 'Business Actor', domain: 'business', geometry: 'box' },
  { type: 'business_role', label: 'Business Role', domain: 'business', geometry: 'box' },
  { type: 'business_collaboration', label: 'Business Collaboration', domain: 'business', geometry: 'box' },
  { type: 'business_interface', label: 'Business Interface', domain: 'business', geometry: 'box' },
  // Business — Behavioral
  { type: 'process', label: 'Business Process', domain: 'business', geometry: 'cylinder' },
  { type: 'business_function', label: 'Business Function', domain: 'business', geometry: 'cylinder' },
  { type: 'business_interaction', label: 'Business Interaction', domain: 'business', geometry: 'cylinder' },
  { type: 'business_event', label: 'Business Event', domain: 'business', geometry: 'cylinder' },
  { type: 'business_service', label: 'Business Service', domain: 'business', geometry: 'sphere' },
  // Business — Passive Structure
  { type: 'business_object', label: 'Business Object', domain: 'business', geometry: 'sphere' },
  { type: 'contract', label: 'Contract', domain: 'business', geometry: 'sphere' },
  { type: 'representation', label: 'Representation', domain: 'business', geometry: 'sphere' },
  { type: 'product', label: 'Product', domain: 'business', geometry: 'box' },
  // Application — Active Structure
  { type: 'application', label: 'Application', domain: 'application', geometry: 'box' },
  { type: 'application_component', label: 'Application Component', domain: 'application', geometry: 'box' },
  { type: 'application_collaboration', label: 'Application Collaboration', domain: 'application', geometry: 'box' },
  { type: 'application_interface', label: 'Application Interface', domain: 'application', geometry: 'box' },
  // Application — Behavioral
  { type: 'application_function', label: 'Application Function', domain: 'application', geometry: 'cylinder' },
  { type: 'application_interaction', label: 'Application Interaction', domain: 'application', geometry: 'cylinder' },
  { type: 'application_process', label: 'Application Process', domain: 'application', geometry: 'cylinder' },
  { type: 'application_event', label: 'Application Event', domain: 'application', geometry: 'cylinder' },
  { type: 'application_service', label: 'Application Service', domain: 'application', geometry: 'sphere' },
  { type: 'service', label: 'Service', domain: 'application', geometry: 'sphere' },
  // Application — Passive Structure
  { type: 'data_object', label: 'Data Object', domain: 'data', geometry: 'sphere' },
  // Information / Data
  { type: 'data_entity', label: 'Data Entity', domain: 'data', geometry: 'cylinder' },
  { type: 'data_model', label: 'Data Model', domain: 'data', geometry: 'box' },
  // Technology — Active Structure
  { type: 'technology_component', label: 'Technology Component', domain: 'technology', geometry: 'box' },
  { type: 'node', label: 'Node', domain: 'technology', geometry: 'box' },
  { type: 'device', label: 'Device', domain: 'technology', geometry: 'box' },
  { type: 'system_software', label: 'System Software', domain: 'technology', geometry: 'box' },
  { type: 'technology_collaboration', label: 'Technology Collaboration', domain: 'technology', geometry: 'box' },
  { type: 'technology_interface', label: 'Technology Interface', domain: 'technology', geometry: 'box' },
  { type: 'infrastructure', label: 'Infrastructure', domain: 'technology', geometry: 'cylinder' },
  { type: 'platform_service', label: 'Platform Service', domain: 'technology', geometry: 'sphere' },
  // Technology — Behavioral
  { type: 'technology_function', label: 'Technology Function', domain: 'technology', geometry: 'cylinder' },
  { type: 'technology_process', label: 'Technology Process', domain: 'technology', geometry: 'cylinder' },
  { type: 'technology_interaction', label: 'Technology Interaction', domain: 'technology', geometry: 'cylinder' },
  { type: 'technology_event', label: 'Technology Event', domain: 'technology', geometry: 'cylinder' },
  // Technology — Passive Structure
  { type: 'artifact', label: 'Artifact', domain: 'technology', geometry: 'sphere' },
  { type: 'communication_network', label: 'Communication Network', domain: 'technology', geometry: 'cylinder' },
  { type: 'path', label: 'Path', domain: 'technology', geometry: 'cylinder' },
  // Motivation
  { type: 'stakeholder', label: 'Stakeholder', domain: 'motivation', geometry: 'box' },
  { type: 'driver', label: 'Driver', domain: 'motivation', geometry: 'box' },
  { type: 'assessment', label: 'Assessment', domain: 'motivation', geometry: 'cylinder' },
  { type: 'goal', label: 'Goal', domain: 'motivation', geometry: 'octahedron' },
  { type: 'outcome', label: 'Outcome', domain: 'motivation', geometry: 'octahedron' },
  { type: 'principle', label: 'Principle', domain: 'motivation', geometry: 'octahedron' },
  { type: 'requirement', label: 'Requirement', domain: 'motivation', geometry: 'sphere' },
  { type: 'constraint', label: 'Constraint', domain: 'motivation', geometry: 'sphere' },
  { type: 'meaning', label: 'Meaning', domain: 'motivation', geometry: 'sphere' },
  { type: 'am_value', label: 'Value', domain: 'motivation', geometry: 'octahedron' },
  // Implementation & Migration
  { type: 'work_package', label: 'Work Package', domain: 'implementation', geometry: 'box' },
  { type: 'deliverable', label: 'Deliverable', domain: 'implementation', geometry: 'sphere' },
  { type: 'implementation_event', label: 'Implementation Event', domain: 'implementation', geometry: 'cylinder' },
  { type: 'plateau', label: 'Plateau', domain: 'implementation', geometry: 'box' },
  { type: 'gap', label: 'Gap', domain: 'implementation', geometry: 'cylinder' },
  // Physical
  { type: 'equipment', label: 'Equipment', domain: 'technology', geometry: 'box' },
  { type: 'facility', label: 'Facility', domain: 'technology', geometry: 'box' },
  { type: 'distribution_network', label: 'Distribution Network', domain: 'technology', geometry: 'cylinder' },
  { type: 'material', label: 'Material', domain: 'technology', geometry: 'sphere' },
  // Composite
  { type: 'grouping', label: 'Grouping', domain: 'business', geometry: 'box' },
  { type: 'location', label: 'Location', domain: 'technology', geometry: 'box' },
];

export const CONNECTION_TYPES = [
  // ArchiMate 3.2 Structural
  { type: 'composition', label: 'Composition', color: '#1e293b' },
  { type: 'aggregation', label: 'Aggregation', color: '#334155' },
  { type: 'assignment', label: 'Assignment', color: '#475569' },
  { type: 'realization', label: 'Realization', color: '#22c55e' },
  // ArchiMate 3.2 Dependency
  { type: 'serving', label: 'Serving', color: '#3b82f6' },
  { type: 'access', label: 'Access', color: '#8b5cf6' },
  { type: 'influence', label: 'Influence', color: '#f59e0b' },
  // ArchiMate 3.2 Dynamic
  { type: 'triggering', label: 'Triggering', color: '#eab308' },
  { type: 'flow', label: 'Flow', color: '#06b6d4' },
  { type: 'specialization', label: 'Specialization', color: '#a855f7' },
  // ArchiMate 3.2 Other
  { type: 'association', label: 'Association', color: '#64748b' },
  // Legacy (backward-compat)
  { type: 'depends_on', label: 'Depends On', color: '#ef4444' },
  { type: 'connects_to', label: 'Connects To', color: '#3b82f6' },
  { type: 'belongs_to', label: 'Belongs To', color: '#22c55e' },
  { type: 'implements', label: 'Implements', color: '#f97316' },
  { type: 'data_flow', label: 'Data Flow', color: '#06b6d4' },
  { type: 'triggers', label: 'Triggers', color: '#eab308' },
  { type: 'cross_architecture', label: 'Cross Architecture', color: '#d4a017' },
] as const;
