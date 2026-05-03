import type { ArchitectureElement, Connection } from '../stores/architectureStore';

/**
 * Coverage-Score for ArchiMate Requirement elements.
 *
 * "How well is this Requirement actually fulfilled by the current
 * architecture?" — answers the BSH-demo question: an auditor sees a
 * Requirement node and immediately wants to know whether real,
 * production capabilities back it up, or whether it's only on paper.
 *
 * Score ∈ [0, 1]:
 *   1.0 = at least one current, fully-mature element realizes it
 *   0.0 = nothing realizes it (or only target/retired, or zero maturity)
 *
 * We take MAX over fulfilling elements (not sum or avg): one solid
 * realizer is enough — additional realizers don't push score above 1.0
 * and a weak realizer should not drag down a strong one.
 */

const FULFILLMENT_TYPES = new Set([
  'realization',
  'realisation',
  'influence',
  'assignment',
  'serving',
]);

/**
 * Source-element types that DO NOT count as fulfillers, even when they
 * have an incoming fulfillment-typed edge to the requirement. ArchiMate
 * Driver/Goal/Principle MOTIVATE a requirement (often via 'influence');
 * they don't realize it. Treating them as realizers makes a barely-
 * connected requirement look "covered" when nothing concrete actually
 * implements it.
 */
const NON_FULFILLER_SOURCE_TYPES = new Set([
  'driver',
  'goal',
  'principle',
  'requirement',
  'constraint',
  'assessment',
  'value',
  'meaning',
  'outcome',
]);

const STATUS_MULTIPLIER: Record<string, number> = {
  current: 1.0,
  transitional: 0.5,
  target: 0.0,
  retired: 0.0,
};

const MAX_MATURITY = 5;

export interface CoverageContribution {
  elementId: string;
  elementName: string;
  elementType: string;
  status: ArchitectureElement['status'];
  maturityLevel: number;
  relationshipType: string;
  contribution: number;
}

export interface CoverageResult {
  coverage: number;
  band: 'red' | 'yellow' | 'green';
  fulfillingCount: number;
  contributions: CoverageContribution[];
  reason: string;
}

export function bandFor(score: number): 'red' | 'yellow' | 'green' {
  if (score < 0.3) return 'red';
  if (score < 0.7) return 'yellow';
  return 'green';
}

export function computeRequirementCoverage(
  requirementId: string,
  elements: ArchitectureElement[],
  connections: Connection[],
): CoverageResult {
  const elementById = new Map(elements.map((e) => [e.id, e]));
  const incoming = connections.filter(
    (c) => c.targetId === requirementId && FULFILLMENT_TYPES.has(c.type),
  );

  const contributions: CoverageContribution[] = [];
  for (const conn of incoming) {
    const src = elementById.get(conn.sourceId);
    if (!src) continue;
    // Skip motivation-layer "source-of-requirement" links — Driver/Goal
    // INFLUENCE the requirement but don't fulfill it. Including them
    // would inflate coverage just because the upstream regulation exists.
    if (NON_FULFILLER_SOURCE_TYPES.has(src.type)) continue;
    const statusMult = STATUS_MULTIPLIER[src.status] ?? 0;
    const maturityNorm = Math.max(0, Math.min(1, (src.maturityLevel ?? 0) / MAX_MATURITY));
    const contribution = statusMult * maturityNorm;
    contributions.push({
      elementId: src.id,
      elementName: src.name,
      elementType: src.type,
      status: src.status,
      maturityLevel: src.maturityLevel ?? 0,
      relationshipType: conn.type,
      contribution,
    });
  }

  contributions.sort((a, b) => b.contribution - a.contribution);
  const coverage = contributions.length === 0 ? 0 : contributions[0].contribution;

  let reason: string;
  if (contributions.length === 0) {
    reason = 'No element realizes this requirement yet';
  } else {
    const top = contributions[0];
    if (coverage === 0) {
      reason = `Realized only by target/retired elements (e.g. "${top.elementName}", status=${top.status})`;
    } else if (coverage < 0.3) {
      reason = `Weak coverage — top realizer "${top.elementName}" is ${top.status}, maturity ${top.maturityLevel}/5`;
    } else if (coverage < 0.7) {
      reason = `Partial coverage — "${top.elementName}" (${top.status}, maturity ${top.maturityLevel}/5)`;
    } else {
      reason = `Well covered by "${top.elementName}" (${top.status}, maturity ${top.maturityLevel}/5)`;
    }
  }

  return {
    coverage,
    band: bandFor(coverage),
    fulfillingCount: contributions.length,
    contributions,
    reason,
  };
}
