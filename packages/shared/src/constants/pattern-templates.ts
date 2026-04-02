/**
 * ArchiMate Pattern Templates — Common architecture blueprints
 * for one-click instantiation in the Pattern Catalog.
 */
import type { ElementType } from '../types/architecture.types';
import type { ArchitectureLayer } from '../types/architecture.types';

export interface PatternElement {
  key: string;           // template-local ID
  type: ElementType;
  name: string;
  layer: ArchitectureLayer;
  relX: number;          // relative position from center
  relZ: number;
}

export interface PatternConnection {
  sourceKey: string;
  targetKey: string;
  type: string;
}

export interface PatternTemplate {
  id: string;
  name: string;
  description: string;
  category: 'layered' | 'process' | 'capability' | 'integration' | 'migration' | 'motivation';
  icon: string;          // Lucide icon name
  elements: PatternElement[];
  connections: PatternConnection[];
}

export const PATTERN_TEMPLATES: PatternTemplate[] = [
  // ── 1. Application-to-Technology Stack ─────────────────
  {
    id: 'app-tech-stack',
    name: 'Application-Technology Stack',
    description: 'Maps an application component through its services to the underlying technology infrastructure.',
    category: 'layered',
    icon: 'Layers',
    elements: [
      { key: 'ac', type: 'application_component', name: 'Application', layer: 'application', relX: 0, relZ: 0 },
      { key: 'as', type: 'application_service', name: 'App Service', layer: 'application', relX: 3, relZ: 0 },
      { key: 'ts', type: 'technology_service', name: 'Tech Service', layer: 'technology', relX: 0, relZ: 0 },
      { key: 'nd', type: 'node', name: 'Server Node', layer: 'technology', relX: 3, relZ: 0 },
      { key: 'dv', type: 'device', name: 'Physical Device', layer: 'physical', relX: 0, relZ: 0 },
    ],
    connections: [
      { sourceKey: 'ac', targetKey: 'as', type: 'serving' },
      { sourceKey: 'ts', targetKey: 'ac', type: 'serving' },
      { sourceKey: 'nd', targetKey: 'ts', type: 'assignment' },
      { sourceKey: 'dv', targetKey: 'nd', type: 'assignment' },
    ],
  },

  // ── 2. Business Process Chain ──────────────────────────
  {
    id: 'biz-process-chain',
    name: 'Business Process Chain',
    description: 'Models a business actor performing a process that delivers a service, supported by an application.',
    category: 'process',
    icon: 'GitBranch',
    elements: [
      { key: 'ba', type: 'business_actor', name: 'Business Actor', layer: 'business', relX: -3, relZ: 0 },
      { key: 'br', type: 'business_role', name: 'Business Role', layer: 'business', relX: 0, relZ: 0 },
      { key: 'bp', type: 'process', name: 'Business Process', layer: 'business', relX: 3, relZ: 0 },
      { key: 'bs', type: 'business_service', name: 'Business Service', layer: 'business', relX: 6, relZ: 0 },
      { key: 'as', type: 'application_service', name: 'Supporting App', layer: 'application', relX: 3, relZ: 0 },
    ],
    connections: [
      { sourceKey: 'ba', targetKey: 'br', type: 'assignment' },
      { sourceKey: 'br', targetKey: 'bp', type: 'assignment' },
      { sourceKey: 'bp', targetKey: 'bs', type: 'realization' },
      { sourceKey: 'as', targetKey: 'bp', type: 'serving' },
    ],
  },

  // ── 3. Microservice Pattern ────────────────────────────
  {
    id: 'microservice',
    name: 'Microservice',
    description: 'An application component with its API interface, exposed service, and backing technology.',
    category: 'integration',
    icon: 'Boxes',
    elements: [
      { key: 'ai', type: 'application_interface', name: 'REST API', layer: 'application', relX: -3, relZ: 0 },
      { key: 'ac', type: 'application_component', name: 'Microservice', layer: 'application', relX: 0, relZ: 0 },
      { key: 'as', type: 'application_service', name: 'Service', layer: 'application', relX: 3, relZ: 0 },
      { key: 'do', type: 'data_object', name: 'Data Store', layer: 'application', relX: 0, relZ: 3 },
      { key: 'ss', type: 'system_software', name: 'Container Runtime', layer: 'technology', relX: 0, relZ: 0 },
    ],
    connections: [
      { sourceKey: 'ac', targetKey: 'ai', type: 'composition' },
      { sourceKey: 'ac', targetKey: 'as', type: 'serving' },
      { sourceKey: 'ac', targetKey: 'do', type: 'access' },
      { sourceKey: 'ss', targetKey: 'ac', type: 'serving' },
    ],
  },

  // ── 4. Capability Map ──────────────────────────────────
  {
    id: 'capability-map',
    name: 'Capability Map',
    description: 'Hierarchical business capabilities with parent-child composition and value stream alignment.',
    category: 'capability',
    icon: 'LayoutGrid',
    elements: [
      { key: 'vs', type: 'value_stream', name: 'Value Stream', layer: 'strategy', relX: 0, relZ: -3 },
      { key: 'c1', type: 'business_capability', name: 'Capability L1', layer: 'strategy', relX: 0, relZ: 0 },
      { key: 'c2a', type: 'business_capability', name: 'Sub-Capability A', layer: 'strategy', relX: -3, relZ: 3 },
      { key: 'c2b', type: 'business_capability', name: 'Sub-Capability B', layer: 'strategy', relX: 0, relZ: 3 },
      { key: 'c2c', type: 'business_capability', name: 'Sub-Capability C', layer: 'strategy', relX: 3, relZ: 3 },
    ],
    connections: [
      { sourceKey: 'c1', targetKey: 'c2a', type: 'composition' },
      { sourceKey: 'c1', targetKey: 'c2b', type: 'composition' },
      { sourceKey: 'c1', targetKey: 'c2c', type: 'composition' },
      { sourceKey: 'vs', targetKey: 'c1', type: 'association' },
    ],
  },

  // ── 5. Integration Pattern ─────────────────────────────
  {
    id: 'integration',
    name: 'System Integration',
    description: 'Two application components communicating through interfaces with a flow relationship.',
    category: 'integration',
    icon: 'ArrowRightLeft',
    elements: [
      { key: 'a1', type: 'application_component', name: 'System A', layer: 'application', relX: -4, relZ: 0 },
      { key: 'i1', type: 'application_interface', name: 'API A', layer: 'application', relX: -2, relZ: 0 },
      { key: 'i2', type: 'application_interface', name: 'API B', layer: 'application', relX: 2, relZ: 0 },
      { key: 'a2', type: 'application_component', name: 'System B', layer: 'application', relX: 4, relZ: 0 },
      { key: 'do', type: 'data_object', name: 'Message/Event', layer: 'application', relX: 0, relZ: 2 },
    ],
    connections: [
      { sourceKey: 'a1', targetKey: 'i1', type: 'composition' },
      { sourceKey: 'a2', targetKey: 'i2', type: 'composition' },
      { sourceKey: 'i1', targetKey: 'i2', type: 'flow' },
      { sourceKey: 'i1', targetKey: 'do', type: 'access' },
      { sourceKey: 'i2', targetKey: 'do', type: 'access' },
    ],
  },

  // ── 6. Risk-Requirement Chain (Motivation) ─────────────
  {
    id: 'motivation-chain',
    name: 'Motivation Chain',
    description: 'Models stakeholder concerns flowing from drivers through goals to requirements.',
    category: 'motivation',
    icon: 'Target',
    elements: [
      { key: 'sh', type: 'stakeholder', name: 'Stakeholder', layer: 'motivation', relX: -4, relZ: 0 },
      { key: 'dr', type: 'driver', name: 'Driver', layer: 'motivation', relX: -1.5, relZ: 0 },
      { key: 'as', type: 'assessment', name: 'Assessment', layer: 'motivation', relX: -1.5, relZ: 3 },
      { key: 'gl', type: 'goal', name: 'Goal', layer: 'motivation', relX: 1.5, relZ: 0 },
      { key: 'rq', type: 'requirement', name: 'Requirement', layer: 'motivation', relX: 4, relZ: 0 },
      { key: 'pr', type: 'principle', name: 'Principle', layer: 'motivation', relX: 1.5, relZ: 3 },
    ],
    connections: [
      { sourceKey: 'sh', targetKey: 'dr', type: 'association' },
      { sourceKey: 'dr', targetKey: 'as', type: 'association' },
      { sourceKey: 'dr', targetKey: 'gl', type: 'influence' },
      { sourceKey: 'gl', targetKey: 'rq', type: 'realization' },
      { sourceKey: 'pr', targetKey: 'rq', type: 'influence' },
    ],
  },

  // ── 7. Migration Planning ──────────────────────────────
  {
    id: 'migration-plan',
    name: 'Migration Plan',
    description: 'Transition architecture with plateaus, work packages, and gap analysis.',
    category: 'migration',
    icon: 'Route',
    elements: [
      { key: 'p1', type: 'plateau', name: 'Baseline (Current)', layer: 'implementation_migration', relX: -4, relZ: 0 },
      { key: 'gp', type: 'gap', name: 'Gap', layer: 'implementation_migration', relX: -1, relZ: 0 },
      { key: 'wp', type: 'work_package', name: 'Migration Work', layer: 'implementation_migration', relX: -1, relZ: 3 },
      { key: 'dl', type: 'deliverable', name: 'Deliverable', layer: 'implementation_migration', relX: 2, relZ: 3 },
      { key: 'p2', type: 'plateau', name: 'Target State', layer: 'implementation_migration', relX: 4, relZ: 0 },
    ],
    connections: [
      { sourceKey: 'p1', targetKey: 'gp', type: 'association' },
      { sourceKey: 'gp', targetKey: 'p2', type: 'association' },
      { sourceKey: 'wp', targetKey: 'gp', type: 'realization' },
      { sourceKey: 'wp', targetKey: 'dl', type: 'realization' },
      { sourceKey: 'dl', targetKey: 'p2', type: 'association' },
    ],
  },

  // ── 8. Data Flow Pipeline ──────────────────────────────
  {
    id: 'data-pipeline',
    name: 'Data Flow Pipeline',
    description: 'Ingestion, processing, and output of data through application functions.',
    category: 'process',
    icon: 'Database',
    elements: [
      { key: 'di', type: 'data_object', name: 'Input Data', layer: 'application', relX: -4, relZ: 0 },
      { key: 'af', type: 'application_function', name: 'ETL Process', layer: 'application', relX: -1, relZ: 0 },
      { key: 'ap', type: 'application_process', name: 'Transform', layer: 'application', relX: 2, relZ: 0 },
      { key: 'do', type: 'data_object', name: 'Output Data', layer: 'application', relX: 5, relZ: 0 },
    ],
    connections: [
      { sourceKey: 'af', targetKey: 'di', type: 'access' },
      { sourceKey: 'af', targetKey: 'ap', type: 'triggering' },
      { sourceKey: 'ap', targetKey: 'do', type: 'access' },
    ],
  },
];

export const PATTERN_CATEGORIES = [
  { id: 'layered', label: 'Layered', description: 'Cross-layer architecture stacks' },
  { id: 'process', label: 'Process', description: 'Business and data process flows' },
  { id: 'capability', label: 'Capability', description: 'Strategic capability structures' },
  { id: 'integration', label: 'Integration', description: 'System integration patterns' },
  { id: 'migration', label: 'Migration', description: 'Transition and migration planning' },
  { id: 'motivation', label: 'Motivation', description: 'Stakeholder goals and requirements' },
] as const;
