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
  { id: 'strategy', label: 'Strategy', color: '#f59e0b', yPosition: 8 },
  { id: 'business', label: 'Business', color: '#22c55e', yPosition: 4 },
  { id: 'information', label: 'Information Systems', color: '#3b82f6', yPosition: 0 },
  { id: 'application', label: 'Application', color: '#f97316', yPosition: -4 },
  { id: 'technology', label: 'Technology', color: '#a855f7', yPosition: -8 },
];

export const TOGAF_DOMAINS: { id: TOGAFDomain; label: string; color: string }[] = [
  { id: 'business', label: 'Business Architecture', color: '#22c55e' },
  { id: 'data', label: 'Data Architecture', color: '#3b82f6' },
  { id: 'application', label: 'Application Architecture', color: '#f97316' },
  { id: 'technology', label: 'Technology Architecture', color: '#a855f7' },
];

export const ELEMENT_TYPES: { type: ElementType; label: string; domain: TOGAFDomain; geometry: string }[] = [
  { type: 'business_capability', label: 'Business Capability', domain: 'business', geometry: 'box' },
  { type: 'process', label: 'Business Process', domain: 'business', geometry: 'cylinder' },
  { type: 'value_stream', label: 'Value Stream', domain: 'business', geometry: 'box' },
  { type: 'business_service', label: 'Business Service', domain: 'business', geometry: 'sphere' },
  { type: 'application', label: 'Application', domain: 'application', geometry: 'box' },
  { type: 'application_component', label: 'Application Component', domain: 'application', geometry: 'box' },
  { type: 'application_service', label: 'Application Service', domain: 'application', geometry: 'sphere' },
  { type: 'data_entity', label: 'Data Entity', domain: 'data', geometry: 'cylinder' },
  { type: 'data_model', label: 'Data Model', domain: 'data', geometry: 'box' },
  { type: 'technology_component', label: 'Technology Component', domain: 'technology', geometry: 'box' },
  { type: 'infrastructure', label: 'Infrastructure', domain: 'technology', geometry: 'cylinder' },
  { type: 'platform_service', label: 'Platform Service', domain: 'technology', geometry: 'sphere' },
  { type: 'service', label: 'Service', domain: 'application', geometry: 'sphere' },
];

export const CONNECTION_TYPES = [
  { type: 'depends_on', label: 'Depends On', color: '#ef4444' },
  { type: 'connects_to', label: 'Connects To', color: '#3b82f6' },
  { type: 'belongs_to', label: 'Belongs To', color: '#22c55e' },
  { type: 'implements', label: 'Implements', color: '#f97316' },
  { type: 'data_flow', label: 'Data Flow', color: '#06b6d4' },
  { type: 'triggers', label: 'Triggers', color: '#eab308' },
] as const;
