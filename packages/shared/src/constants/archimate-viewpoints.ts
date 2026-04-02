/**
 * ArchiMate 3.2 Viewpoint Definitions
 *
 * Each viewpoint restricts which element types and relationship types
 * are relevant, enabling focused modeling. Based on ArchiMate 3.2 Chapter 14.
 */
import type { ElementType } from '../types/architecture.types';
import type { StandardConnectionType } from './archimate-rules';

export interface ArchiMateViewpoint {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'motivation' | 'strategy' | 'implementation';
  allowedElementTypes: ElementType[];
  allowedConnectionTypes: StandardConnectionType[];
}

// Common connection types used by most viewpoints
const STRUCTURAL: StandardConnectionType[] = ['composition', 'aggregation', 'assignment', 'realization'];
const DEPENDENCY: StandardConnectionType[] = ['serving', 'access', 'influence'];
const DYNAMIC: StandardConnectionType[] = ['triggering', 'flow'];
const ALL_STANDARD: StandardConnectionType[] = [...STRUCTURAL, ...DEPENDENCY, ...DYNAMIC, 'specialization', 'association'];

export const ARCHIMATE_VIEWPOINTS: ArchiMateViewpoint[] = [
  // ── Basic Viewpoints ───────────────────────────────────
  {
    id: 'organization',
    name: 'Organization',
    description: 'Business actors, roles, and their collaborations',
    category: 'basic',
    allowedElementTypes: [
      'business_actor', 'business_role', 'business_collaboration', 'business_interface', 'location',
    ],
    allowedConnectionTypes: ['composition', 'aggregation', 'assignment', 'serving', 'association', 'specialization'],
  },
  {
    id: 'business-process-cooperation',
    name: 'Business Process Cooperation',
    description: 'Business processes, their relationships, and the services they offer',
    category: 'basic',
    allowedElementTypes: [
      'business_actor', 'business_role', 'business_collaboration',
      'process', 'business_function', 'business_interaction', 'business_event',
      'business_service', 'business_object', 'representation', 'product',
      'application_service', 'application_component',
    ],
    allowedConnectionTypes: ALL_STANDARD,
  },
  {
    id: 'application-cooperation',
    name: 'Application Cooperation',
    description: 'Application components and their connections through services and data',
    category: 'basic',
    allowedElementTypes: [
      'application_component', 'application_collaboration', 'application_interface',
      'application_function', 'application_interaction', 'application_process', 'application_event',
      'application_service', 'data_object',
    ],
    allowedConnectionTypes: ALL_STANDARD,
  },
  {
    id: 'technology',
    name: 'Technology',
    description: 'Infrastructure, networks, devices, and system software',
    category: 'basic',
    allowedElementTypes: [
      'node', 'device', 'system_software',
      'technology_collaboration', 'technology_interface',
      'communication_network', 'path',
      'technology_function', 'technology_process', 'technology_interaction', 'technology_event',
      'technology_service', 'artifact',
    ],
    allowedConnectionTypes: ALL_STANDARD,
  },
  {
    id: 'application-usage',
    name: 'Application Usage',
    description: 'How business processes are supported by applications',
    category: 'basic',
    allowedElementTypes: [
      'business_actor', 'business_role', 'process', 'business_function',
      'business_event', 'business_service',
      'application_component', 'application_service', 'application_interface',
      'data_object',
    ],
    allowedConnectionTypes: ALL_STANDARD,
  },
  {
    id: 'technology-usage',
    name: 'Technology Usage',
    description: 'How applications are deployed on technology infrastructure',
    category: 'basic',
    allowedElementTypes: [
      'application_component', 'application_service',
      'node', 'device', 'system_software', 'communication_network',
      'technology_service', 'artifact',
    ],
    allowedConnectionTypes: ALL_STANDARD,
  },
  {
    id: 'information-structure',
    name: 'Information Structure',
    description: 'Data objects, their relationships, and access by application components',
    category: 'basic',
    allowedElementTypes: [
      'business_object', 'representation',
      'data_object', 'application_component', 'application_function',
    ],
    allowedConnectionTypes: ['composition', 'aggregation', 'association', 'access', 'realization', 'specialization'],
  },
  {
    id: 'layered',
    name: 'Layered',
    description: 'Full architecture overview across all core layers',
    category: 'basic',
    allowedElementTypes: [
      // Business
      'business_actor', 'business_role', 'process', 'business_function',
      'business_service', 'business_object', 'product',
      // Application
      'application_component', 'application_service', 'application_interface', 'data_object',
      // Technology
      'node', 'device', 'system_software', 'communication_network',
      'technology_service', 'artifact',
    ],
    allowedConnectionTypes: ALL_STANDARD,
  },
  {
    id: 'physical',
    name: 'Physical',
    description: 'Physical equipment, facilities, and distribution networks',
    category: 'basic',
    allowedElementTypes: [
      'equipment', 'facility', 'distribution_network', 'material',
      'node', 'device', 'technology_service',
    ],
    allowedConnectionTypes: ALL_STANDARD,
  },

  // ── Motivation Viewpoints ──────────────────────────────
  {
    id: 'stakeholder',
    name: 'Stakeholder',
    description: 'Stakeholders, their concerns (drivers), and resulting goals',
    category: 'motivation',
    allowedElementTypes: [
      'stakeholder', 'driver', 'assessment', 'goal', 'outcome',
    ],
    allowedConnectionTypes: ['association', 'influence', 'realization', 'composition', 'aggregation'],
  },
  {
    id: 'goal-realization',
    name: 'Goal Realization',
    description: 'How goals are refined into requirements and realized by core elements',
    category: 'motivation',
    allowedElementTypes: [
      'goal', 'outcome', 'principle', 'requirement', 'constraint',
      'business_service', 'application_service', 'process',
    ],
    allowedConnectionTypes: ['realization', 'influence', 'aggregation', 'composition', 'association'],
  },
  {
    id: 'requirements-realization',
    name: 'Requirements Realization',
    description: 'How requirements are realized by architecture elements',
    category: 'motivation',
    allowedElementTypes: [
      'requirement', 'constraint', 'goal', 'principle',
      'business_service', 'process', 'business_function',
      'application_component', 'application_service',
      'node', 'technology_service',
    ],
    allowedConnectionTypes: ['realization', 'influence', 'association'],
  },

  // ── Strategy Viewpoints ────────────────────────────────
  {
    id: 'strategy',
    name: 'Strategy',
    description: 'Capabilities, value streams, and courses of action',
    category: 'strategy',
    allowedElementTypes: [
      'business_capability', 'value_stream', 'resource', 'course_of_action',
      'stakeholder', 'driver', 'goal', 'outcome',
    ],
    allowedConnectionTypes: ['composition', 'aggregation', 'realization', 'influence', 'serving', 'association', 'flow'],
  },
  {
    id: 'capability-map',
    name: 'Capability Map',
    description: 'Hierarchical capability decomposition',
    category: 'strategy',
    allowedElementTypes: [
      'business_capability', 'value_stream', 'resource',
    ],
    allowedConnectionTypes: ['composition', 'aggregation', 'association', 'serving', 'specialization'],
  },

  // ── Implementation Viewpoints ──────────────────────────
  {
    id: 'project',
    name: 'Project',
    description: 'Work packages, deliverables, and their realization of architecture changes',
    category: 'implementation',
    allowedElementTypes: [
      'work_package', 'deliverable', 'implementation_event',
      'plateau', 'gap', 'business_capability',
    ],
    allowedConnectionTypes: ['realization', 'aggregation', 'composition', 'triggering', 'association'],
  },
  {
    id: 'migration',
    name: 'Migration',
    description: 'Plateaus and gaps in transition architectures',
    category: 'implementation',
    allowedElementTypes: [
      'plateau', 'gap', 'work_package', 'deliverable',
    ],
    allowedConnectionTypes: ['composition', 'aggregation', 'realization', 'triggering', 'association'],
  },
];

// Fast lookup
export const VIEWPOINT_BY_ID: ReadonlyMap<string, ArchiMateViewpoint> =
  new Map(ARCHIMATE_VIEWPOINTS.map(v => [v.id, v]));

export const VIEWPOINT_CATEGORIES = [
  { id: 'basic', label: 'Basic' },
  { id: 'motivation', label: 'Motivation' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'implementation', label: 'Implementation' },
] as const;
