/**
 * ArchiMate 3.2 Relationship Rules Engine
 *
 * Encodes which relationship types are valid between element types based on
 * the ArchiMate 3.2 specification (Chapter 5 — Relationships).
 *
 * Rules are defined at the *aspect* level (Active Structure, Behavioral,
 * Passive Structure) and refined by layer-crossing rules. The engine also
 * provides smart defaults so the Connection Type Picker can pre-select the
 * most natural relationship for any element pair.
 */
import type { ElementType } from '../types/architecture.types';
import { CATEGORY_BY_TYPE, type ArchiMateAspect } from './archimate-categories';

// Re-use the ConnectionType from the types (string literal union)
export type StandardConnectionType =
  | 'composition'
  | 'aggregation'
  | 'assignment'
  | 'realization'
  | 'serving'
  | 'access'
  | 'influence'
  | 'triggering'
  | 'flow'
  | 'specialization'
  | 'association';

// ──────────────────────────────────────────────────────────
// Relationship descriptions (for the picker UI)
// ──────────────────────────────────────────────────────────
export const RELATIONSHIP_DESCRIPTIONS: Record<StandardConnectionType, string> = {
  composition: 'Part-of (strong ownership): the part cannot exist without the whole',
  aggregation: 'Part-of (weak): the part can exist independently',
  assignment: 'Allocation of responsibility, performance, or execution',
  realization: 'Implementation of a specification by an entity',
  serving: 'Provides functionality to another element',
  access: 'Reads, writes, or creates data / passive structure',
  influence: 'Affects the implementation or achievement of a motivation element',
  triggering: 'Temporal / causal: one element initiates another',
  flow: 'Transfer of information, goods, or money between elements',
  specialization: 'Is-a: a more specific variant of another element',
  association: 'General, unspecified relationship (always valid)',
};

// ──────────────────────────────────────────────────────────
// ArchiMate 3.2 Relationship Rules
//
// Based on the ArchiMate spec, relationships are constrained by:
// 1. Source and target element ASPECTS (Active, Behavioral, Passive)
// 2. Source and target LAYERS (same layer vs cross-layer)
// 3. Specific element-level overrides
//
// We model this as: given (sourceAspect, targetAspect) → allowed types[]
// Then layer-crossing rules further filter.
// ──────────────────────────────────────────────────────────

type AspectPairKey = `${ArchiMateAspect}→${ArchiMateAspect}`;

/** Core rules: which relationships are valid for aspect pairs (same layer) */
const SAME_LAYER_RULES: Partial<Record<AspectPairKey, StandardConnectionType[]>> = {
  // Active Structure ↔ Active Structure
  'active_structure→active_structure': ['composition', 'aggregation', 'assignment', 'serving', 'triggering', 'flow', 'specialization', 'association'],
  // Active Structure → Behavioral
  'active_structure→behavioral': ['assignment', 'serving', 'triggering', 'flow', 'association'],
  // Active Structure → Passive Structure
  'active_structure→passive_structure': ['access', 'association'],
  // Behavioral → Active Structure
  'behavioral→active_structure': ['serving', 'triggering', 'flow', 'association'],
  // Behavioral ↔ Behavioral
  'behavioral→behavioral': ['composition', 'aggregation', 'triggering', 'flow', 'serving', 'specialization', 'association'],
  // Behavioral → Passive Structure
  'behavioral→passive_structure': ['access', 'association'],
  // Passive Structure → Active Structure
  'passive_structure→active_structure': ['association'],
  // Passive Structure → Behavioral
  'passive_structure→behavioral': ['association'],
  // Passive Structure ↔ Passive Structure
  'passive_structure→passive_structure': ['composition', 'aggregation', 'specialization', 'access', 'association'],
  // Composite → any
  'composite→active_structure': ['composition', 'aggregation', 'assignment', 'realization', 'association'],
  'composite→behavioral': ['composition', 'aggregation', 'assignment', 'realization', 'association'],
  'composite→passive_structure': ['composition', 'aggregation', 'access', 'association'],
  'composite→composite': ['composition', 'aggregation', 'specialization', 'association'],
  // any → Composite
  'active_structure→composite': ['composition', 'aggregation', 'realization', 'association'],
  'behavioral→composite': ['realization', 'association'],
  'passive_structure→composite': ['association'],
};

/**
 * Cross-layer rules: when source and target are on different layers,
 * only certain relationships apply. ArchiMate 3.2 §5.3 says:
 * - Higher layer can USE (serving) lower layer
 * - Lower layer can REALIZE higher layer
 * - Flow and triggering are allowed between same-aspect elements across layers
 * - Association is always valid
 */
const CROSS_LAYER_ALLOWED: StandardConnectionType[] = [
  'serving', 'realization', 'flow', 'triggering', 'association', 'access',
];

/**
 * Motivation relationships: motivation elements have their own rules.
 * - Motivation ↔ Motivation: composition, aggregation, influence, association, specialization, realization
 * - Core → Motivation: realization, influence, association
 * - Motivation → Core: influence, association
 */
const MOTIVATION_TO_MOTIVATION: StandardConnectionType[] = [
  'composition', 'aggregation', 'influence', 'realization', 'specialization', 'association',
];
const CORE_TO_MOTIVATION: StandardConnectionType[] = [
  'realization', 'influence', 'association',
];
const MOTIVATION_TO_CORE: StandardConnectionType[] = [
  'influence', 'association',
];

/**
 * Implementation & Migration relationships:
 * - Implementation elements can realize/aggregate core elements
 * - Plateaus aggregate architecture states
 * - Gaps connect plateaus
 */
const IMPL_TO_CORE: StandardConnectionType[] = [
  'realization', 'aggregation', 'composition', 'association',
];
const CORE_TO_IMPL: StandardConnectionType[] = [
  'association', 'realization',
];
const IMPL_TO_IMPL: StandardConnectionType[] = [
  'composition', 'aggregation', 'triggering', 'flow', 'realization', 'specialization', 'association',
];

// ──────────────────────────────────────────────────────────
// Layer hierarchy for cross-layer direction detection
// Higher index = higher layer in the ArchiMate stack
// ──────────────────────────────────────────────────────────
const LAYER_RANK: Record<string, number> = {
  physical: 0,
  technology: 1,
  application: 2,
  information: 2, // same level as application
  business: 3,
  strategy: 4,
  motivation: 5,   // special
  implementation_migration: -1, // special
};

function isMotivation(aspect: ArchiMateAspect): boolean {
  return aspect === 'motivation';
}
function isImplementation(aspect: ArchiMateAspect): boolean {
  return aspect === 'implementation';
}
function isCoreAspect(aspect: ArchiMateAspect): boolean {
  return !isMotivation(aspect) && !isImplementation(aspect);
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

/**
 * Returns all valid ArchiMate 3.2 relationship types for a given
 * source → target element type pair.
 *
 * Always includes 'association' as fallback.
 */
export function getValidRelationships(
  sourceType: ElementType,
  targetType: ElementType,
): StandardConnectionType[] {
  const src = CATEGORY_BY_TYPE.get(sourceType);
  const tgt = CATEGORY_BY_TYPE.get(targetType);

  // Unknown types → only association
  if (!src || !tgt) return ['association'];

  const srcAspect = src.aspect;
  const tgtAspect = tgt.aspect;
  const srcLayer = src.layer;
  const tgtLayer = tgt.layer;
  const sameLayer = srcLayer === tgtLayer;

  let allowed: StandardConnectionType[];

  // ── Motivation special rules ────────────────────────
  if (isMotivation(srcAspect) && isMotivation(tgtAspect)) {
    allowed = [...MOTIVATION_TO_MOTIVATION];
  } else if (isMotivation(srcAspect) && !isMotivation(tgtAspect)) {
    allowed = isImplementation(tgtAspect) ? ['association'] : [...MOTIVATION_TO_CORE];
  } else if (!isMotivation(srcAspect) && isMotivation(tgtAspect)) {
    allowed = isImplementation(srcAspect) ? ['association'] : [...CORE_TO_MOTIVATION];
  }
  // ── Implementation special rules ────────────────────
  else if (isImplementation(srcAspect) && isImplementation(tgtAspect)) {
    allowed = [...IMPL_TO_IMPL];
  } else if (isImplementation(srcAspect) && isCoreAspect(tgtAspect)) {
    allowed = [...IMPL_TO_CORE];
  } else if (isCoreAspect(srcAspect) && isImplementation(tgtAspect)) {
    allowed = [...CORE_TO_IMPL];
  }
  // ── Core ↔ Core rules ──────────────────────────────
  else {
    const key: AspectPairKey = `${srcAspect}→${tgtAspect}`;
    const baseRules = SAME_LAYER_RULES[key] || ['association'];
    allowed = [...baseRules];

    // Cross-layer filter: restrict to cross-layer allowed set
    if (!sameLayer) {
      allowed = allowed.filter(r => CROSS_LAYER_ALLOWED.includes(r));
    }
  }

  // Ensure association is always present
  if (!allowed.includes('association')) {
    allowed.push('association');
  }

  // Specialization: same type family only (same aspect, same layer or parent type)
  if (srcAspect !== tgtAspect || !sameLayer) {
    allowed = allowed.filter(r => r !== 'specialization');
  }

  // Deduplicate
  return [...new Set(allowed)];
}

/**
 * Returns the most natural / common default relationship for a given
 * source → target pair. Used as pre-selection in the Connection Type Picker.
 */
export function getDefaultRelationship(
  sourceType: ElementType,
  targetType: ElementType,
): StandardConnectionType {
  const src = CATEGORY_BY_TYPE.get(sourceType);
  const tgt = CATEGORY_BY_TYPE.get(targetType);

  if (!src || !tgt) return 'association';

  const valid = getValidRelationships(sourceType, targetType);
  const srcAspect = src.aspect;
  const tgtAspect = tgt.aspect;
  const sameLayer = src.layer === tgt.layer;

  // Same type → specialization
  if (sourceType === targetType && valid.includes('specialization')) {
    return 'specialization';
  }

  // Motivation → Motivation: influence
  if (isMotivation(srcAspect) && isMotivation(tgtAspect)) {
    return pick(valid, ['influence', 'realization', 'association']);
  }

  // Core → Motivation: realization
  if (!isMotivation(srcAspect) && isMotivation(tgtAspect)) {
    return pick(valid, ['realization', 'influence', 'association']);
  }

  // Same layer defaults
  if (sameLayer) {
    // Active → Behavioral: assignment (actor performs process)
    if (srcAspect === 'active_structure' && tgtAspect === 'behavioral') {
      return pick(valid, ['assignment', 'serving', 'association']);
    }
    // Behavioral → Passive: access
    if (srcAspect === 'behavioral' && tgtAspect === 'passive_structure') {
      return pick(valid, ['access', 'association']);
    }
    // Behavioral → Behavioral: triggering, flow
    if (srcAspect === 'behavioral' && tgtAspect === 'behavioral') {
      return pick(valid, ['triggering', 'flow', 'serving', 'association']);
    }
    // Active → Active: serving
    if (srcAspect === 'active_structure' && tgtAspect === 'active_structure') {
      return pick(valid, ['serving', 'composition', 'aggregation', 'association']);
    }
  }

  // Cross-layer defaults
  if (!sameLayer) {
    const srcRank = LAYER_RANK[src.layer] ?? 0;
    const tgtRank = LAYER_RANK[tgt.layer] ?? 0;

    // Higher serves lower
    if (srcRank < tgtRank) {
      return pick(valid, ['serving', 'realization', 'association']);
    }
    // Lower realizes higher
    if (srcRank > tgtRank) {
      return pick(valid, ['realization', 'serving', 'association']);
    }
  }

  // Implementation defaults
  if (isImplementation(srcAspect)) {
    return pick(valid, ['realization', 'aggregation', 'association']);
  }

  return pick(valid, ['association']);
}

/**
 * Quick check: is this connection type valid for this element pair?
 */
export function isValidRelationship(
  sourceType: ElementType,
  targetType: ElementType,
  connectionType: StandardConnectionType,
): boolean {
  return getValidRelationships(sourceType, targetType).includes(connectionType);
}

/**
 * Check if ANY valid standard relationship exists between two types
 * (i.e., they can be meaningfully connected beyond just association).
 */
export function hasStrongRelationship(
  sourceType: ElementType,
  targetType: ElementType,
): boolean {
  const valid = getValidRelationships(sourceType, targetType);
  return valid.some(r => r !== 'association');
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** Pick the first from `preferred` that is in `valid`, or the first valid entry */
function pick(
  valid: StandardConnectionType[],
  preferred: StandardConnectionType[],
): StandardConnectionType {
  for (const p of preferred) {
    if (valid.includes(p)) return p;
  }
  return valid[0] || 'association';
}
