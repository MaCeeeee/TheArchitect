import {
  getValidRelationships,
  getDefaultRelationship,
  CATEGORY_BY_TYPE,
  type StandardConnectionType,
  type ElementType,
} from '@thearchitect/shared';

export interface SuggestionInput {
  id: string;
  type: string;
  name: string;
}
export interface ExistingConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
}
export interface Suggestion {
  sourceId: string;
  targetId: string;
  targetName: string;
  relationshipType: StandardConnectionType;
  confidence: number;
  reasoning: string;
}
export interface HealReport {
  elementsAnalyzed: number;
  suggestionsTotal: number;
  perElement: Map<string, Suggestion[]>;
}
export interface HealOptions {
  elements: SuggestionInput[];
  connections: ExistingConnection[];
  minConfidence?: number;
  topNPerElement?: number;
  /**
   * If true, weakly-connected elements (1 connection) are also analyzed.
   * If false (default), only fully isolated (0 connections) are analyzed.
   */
  includeWeak?: boolean;
}

const DEFAULT_TOP_N = 4;

/**
 * Pure batch-suggestion engine. Reads in-memory element + connection lists,
 * produces ranked Suggestion[] per isolated element. Does not touch any DB —
 * the caller is responsible for IO.
 */
export async function suggestConnectionsForIsolatedElements(
  opts: HealOptions,
): Promise<HealReport> {
  const minConfidence = opts.minConfidence ?? 0;
  const topN = opts.topNPerElement ?? DEFAULT_TOP_N;
  const includeWeak = opts.includeWeak ?? false;

  const connectionCount = new Map<string, number>();
  const connectedPairs = new Set<string>();
  for (const c of opts.connections) {
    connectionCount.set(c.sourceId, (connectionCount.get(c.sourceId) ?? 0) + 1);
    connectionCount.set(c.targetId, (connectionCount.get(c.targetId) ?? 0) + 1);
    connectedPairs.add(pairKey(c.sourceId, c.targetId));
  }

  const perElement = new Map<string, Suggestion[]>();
  let total = 0;

  for (const el of opts.elements) {
    const cnt = connectionCount.get(el.id) ?? 0;
    const isolated = cnt === 0;
    const weak = cnt === 1;
    if (!isolated && !(includeWeak && weak)) continue;

    const candidates: Suggestion[] = [];
    for (const other of opts.elements) {
      if (other.id === el.id) continue;
      if (connectedPairs.has(pairKey(el.id, other.id))) continue;

      const score = scorePair(el, other);
      if (score.confidence < minConfidence) continue;
      if (score.confidence === 0) continue;

      candidates.push({
        sourceId: el.id,
        targetId: other.id,
        targetName: other.name,
        relationshipType: score.relationshipType,
        confidence: score.confidence,
        reasoning: score.reasoning,
      });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const top = candidates.slice(0, topN);
    if (top.length > 0) {
      perElement.set(el.id, top);
      total += top.length;
    }
  }

  return {
    elementsAnalyzed: opts.elements.length,
    suggestionsTotal: total,
    perElement,
  };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface PairScore {
  confidence: number;
  relationshipType: StandardConnectionType;
  reasoning: string;
}

/**
 * Scoring rule:
 *   confidence = 0.5 * layerCompatibility + 0.5 * aspectMatch
 *   - layerCompatibility: 1.0 same layer, 0.7 adjacent layer, 0.4 cross-layer
 *   - aspectMatch: 1.0 if a strong (non-association) relationship exists, 0.5 association-only
 *   - returns confidence 0 for unknown element types so the caller skips them
 */
function scorePair(a: SuggestionInput, b: SuggestionInput): PairScore {
  const ca = CATEGORY_BY_TYPE.get(a.type as ElementType);
  const cb = CATEGORY_BY_TYPE.get(b.type as ElementType);
  if (!ca || !cb) {
    return { confidence: 0, relationshipType: 'association', reasoning: 'unknown element type' };
  }

  const valid = getValidRelationships(a.type as ElementType, b.type as ElementType);
  const hasStrong = valid.some(r => r !== 'association');

  const aspectMatch = hasStrong ? 1.0 : 0.5;
  const layerCompat =
    ca.layer === cb.layer ? 1.0 :
    Math.abs(rank(ca.layer) - rank(cb.layer)) === 1 ? 0.7 :
    0.4;

  const confidence = 0.5 * layerCompat + 0.5 * aspectMatch;

  return {
    confidence: Number(confidence.toFixed(3)),
    relationshipType: getDefaultRelationship(a.type as ElementType, b.type as ElementType),
    reasoning:
      `${a.type} → ${b.type}: ` +
      (ca.layer === cb.layer ? 'same layer' : `${ca.layer}→${cb.layer}`) +
      `, ${hasStrong ? 'strong' : 'association-only'} relationship`,
  };
}

const LAYER_ORDER = [
  'physical', 'technology', 'application', 'information',
  'business', 'strategy', 'motivation', 'implementation_migration',
];
function rank(layer: string): number {
  const i = LAYER_ORDER.indexOf(layer);
  return i === -1 ? 0 : i;
}
