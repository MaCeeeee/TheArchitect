/**
 * REQ-RED-002 — Semantic Type Groups for cross-type redundancy detection
 *
 * When the redundancy detector runs in cross-type mode, naïvely matching
 * any two elements with high cosine-similarity produces lots of false
 * positives — a stakeholder named "Customer" will match an application
 * called "Customer Portal" at 75% just because the word "customer" carries
 * weight in the embedding.
 *
 * These groups limit cross-type matches to type-combinations that are
 * **semantically reasonable** to consider as redundant. Inside a group,
 * elements can be compared cross-type; across groups they're rejected.
 *
 * Groups are intentionally small and conservative — we add more only when
 * a real-world false-negative shows up. Source: ArchiMate 3.2 + common
 * EAM mis-modelling patterns we've seen in BSH / customer projects.
 */

export interface SemanticTypeGroup {
  /** Internal id, used in audit/log strings */
  id: string;
  /** Human-readable label for UI explanations */
  label: string;
  /** Element types that are mutually comparable */
  types: readonly string[];
  /** Short rationale why these types overlap in practice */
  reason: string;
}

export const SEMANTIC_TYPE_GROUPS: readonly SemanticTypeGroup[] = [
  {
    id: 'data',
    label: 'Data Objects',
    types: ['data_object', 'data_entity', 'data_model'],
    reason: 'TOGAF Data Architecture extension: same concept modelled at different abstraction levels.',
  },
  {
    id: 'capability-service',
    label: 'Capabilities & Services',
    types: ['business_capability', 'capability', 'business_service'],
    reason: 'A capability ("what we do") often mirrors a service ("what we offer to customers").',
  },
  {
    id: 'application',
    label: 'Application Elements',
    types: ['application_component', 'application_service', 'application_collaboration', 'application_interface'],
    reason: 'Components and services often duplicate at the application layer (service-orientation vs implementation).',
  },
  {
    id: 'actor-stakeholder',
    label: 'Actors & Stakeholders',
    types: ['business_actor', 'stakeholder'],
    reason: 'Stakeholders are often modelled twice — once as business_actor (who acts), once as stakeholder (who has interest).',
  },
  {
    id: 'process-activity',
    label: 'Processes & Activities',
    types: ['business_process', 'process'],
    reason: 'Activities (type=process) and business_processes are commonly confused — the AI generator uses both.',
  },
  {
    id: 'technology',
    label: 'Technology Elements',
    types: ['technology_component', 'technology_service', 'node', 'system_software'],
    reason: 'Tech components and services often overlap (a database is both a component and a service).',
  },
] as const;

/**
 * Lookup: returns the group id containing both types, or null when no
 * group covers both. Used by findRedundancies to filter cross-type
 * neighbours.
 */
export function findSemanticGroup(typeA: string, typeB: string): string | null {
  if (typeA === typeB) {
    // Same-type matches don't need group filtering — they're always valid
    // and shouldn't be routed through this lookup.
    return 'same-type';
  }
  for (const group of SEMANTIC_TYPE_GROUPS) {
    if (group.types.includes(typeA) && group.types.includes(typeB)) {
      return group.id;
    }
  }
  return null;
}

/**
 * Convenience: returns true if two types can be cross-compared at all.
 * Wrapper around findSemanticGroup for boolean-only callers.
 */
export function areTypesCrossComparable(typeA: string, typeB: string): boolean {
  return findSemanticGroup(typeA, typeB) !== null;
}
