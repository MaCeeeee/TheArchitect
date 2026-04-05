import { runCypher } from '../config/neo4j';
import type {
  CascadeRiskResult,
  CascadeAffectedElement,
  KSTestResult,
  PlateauStabilityResult,
  PlateauState,
  StochasticThresholds,
} from '@thearchitect/shared';
import type { RoadmapStrategy } from '@thearchitect/shared';
import { STRATEGY_THRESHOLDS as THRESHOLDS } from '@thearchitect/shared';

// ─── 1. Kolmogorov Axiom Validation ───

const EPSILON = 1e-9;

/**
 * Validates a probability space against Kolmogorov's three axioms:
 *   I.  Non-negativity: P(E) >= 0
 *   II. Normalization:  Σ P(E) = 1
 *   III. σ-Additivity:  P(A ∪ B) = P(A) + P(B) for disjoint A, B
 *        (implied by I + II for finite spaces)
 *
 * Throws on violation to guard all downstream probabilistic calculations.
 */
export function validateProbabilitySpace(probabilities: number[]): boolean {
  if (probabilities.length === 0) {
    throw new Error('Kolmogorov violation: empty probability space');
  }

  // Axiom I: Non-negativity
  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] < -EPSILON) {
      throw new Error(
        `Kolmogorov Axiom I violation: P(E_${i}) = ${probabilities[i]} < 0`
      );
    }
  }

  // Axiom II: Normalization (Σ = 1)
  const sum = probabilities.reduce((s, p) => s + p, 0);
  if (Math.abs(sum - 1.0) > EPSILON * probabilities.length + 1e-6) {
    throw new Error(
      `Kolmogorov Axiom II violation: Σ P(E) = ${sum}, expected 1.0`
    );
  }

  return true;
}

// ─── 2. Beta-PERT Distribution ───

/**
 * Returns a sampler function for the Beta-PERT distribution.
 * Replaces uniform distribution in Monte Carlo for realistic
 * asymmetric cost/duration estimates.
 *
 * Uses the modified PERT with λ=4 (standard weighting of the mode).
 */
export function betaPertDistribution(
  min: number,
  mode: number,
  max: number
): () => number {
  if (min > mode || mode > max || min >= max) {
    throw new Error(
      `Invalid PERT parameters: min=${min}, mode=${mode}, max=${max}`
    );
  }

  const range = max - min;
  const mu = (min + 4 * mode + max) / 6;

  // Shape parameters for the Beta distribution
  const alpha1 = ((mu - min) * (2 * mode - min - max)) / ((mode - mu) * range);
  const alpha2 = alpha1 * (max - mu) / (mu - min);

  // Handle edge cases where shape params are invalid
  if (alpha1 <= 0 || alpha2 <= 0 || !isFinite(alpha1) || !isFinite(alpha2)) {
    // Fallback: triangular distribution
    return () => {
      const u = Math.random();
      const fc = (mode - min) / range;
      if (u < fc) {
        return min + Math.sqrt(u * range * (mode - min));
      }
      return max - Math.sqrt((1 - u) * range * (max - mode));
    };
  }

  return () => {
    // Sample from Beta(alpha1, alpha2) using Jöhnk's algorithm
    const beta = sampleBeta(alpha1, alpha2);
    return min + beta * range;
  };
}

/** Sample from Beta(a, b) distribution */
function sampleBeta(a: number, b: number): number {
  // Use gamma sampling: Beta(a,b) = Ga/(Ga+Gb)
  const ga = sampleGamma(a);
  const gb = sampleGamma(b);
  return ga / (ga + gb);
}

/** Sample from Gamma(shape, 1) using Marsaglia and Tsang's method */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Box-Muller transform for standard normal samples */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── 3. Kolmogorov-Smirnov Test ───

/**
 * Two-sided Kolmogorov-Smirnov test.
 * Compares two empirical distributions via max eCDF distance.
 * Non-parametric — makes no distributional assumptions.
 */
export function kolmogorovSmirnovTest(
  sample1: number[],
  sample2: number[],
  alpha: number = 0.05
): KSTestResult {
  if (sample1.length === 0 || sample2.length === 0) {
    throw new Error('K-S test requires non-empty samples');
  }

  const n1 = sample1.length;
  const n2 = sample2.length;

  const sorted1 = [...sample1].sort((a, b) => a - b);
  const sorted2 = [...sample2].sort((a, b) => a - b);

  // Merge and compute max eCDF distance
  let i = 0;
  let j = 0;
  let maxD = 0;

  while (i < n1 && j < n2) {
    const d1 = sorted1[i];
    const d2 = sorted2[j];

    if (d1 <= d2) {
      i++;
    }
    if (d2 <= d1) {
      j++;
    }

    const eCDF1 = i / n1;
    const eCDF2 = j / n2;
    const d = Math.abs(eCDF1 - eCDF2);
    if (d > maxD) maxD = d;
  }

  // Approximate p-value using asymptotic formula
  const en = Math.sqrt((n1 * n2) / (n1 + n2));
  const lambda = (en + 0.12 + 0.11 / en) * maxD;
  // Kolmogorov distribution approximation
  const pValue = 2 * Math.exp(-2 * lambda * lambda);
  const clampedP = Math.max(0, Math.min(1, pValue));

  return {
    statistic: maxD,
    pValue: clampedP,
    significant: clampedP < alpha,
    sampleSize1: n1,
    sampleSize2: n2,
  };
}

// ─── 4. Cascade Risk Propagation (Bayes + Logistic) ───

/**
 * Propagates failure probability through the Neo4j dependency graph
 * using Bayesian conditional probabilities and logistic capacity modeling.
 *
 * Lazy-initializes edge weights using hybrid heuristics.
 */
export async function propagateCascadeRisk(
  projectId: string,
  sourceElementId: string
): Promise<CascadeRiskResult> {
  // Ensure edge weights exist (lazy initialization)
  await initializeEdgeWeights(projectId);

  // BFS traversal with conditional probability propagation
  const records = await runCypher(
    `MATCH path = (source:ArchitectureElement {id: $sourceElementId, projectId: $projectId})
           -[rels:CONNECTS_TO*1..6]->(target:ArchitectureElement {projectId: $projectId})
     WITH target, rels, length(path) as dist,
          [r IN rels | coalesce(r.failureProbability, 0.05)] as probs,
          [r IN rels | coalesce(r.cascadeWeight, 1.0)] as weights,
          [n IN nodes(path) | n.id] as pathIds
     RETURN DISTINCT target.id as targetId, target.name as targetName,
            probs, weights, dist, pathIds
     ORDER BY dist ASC`,
    { sourceElementId, projectId }
  );

  // Calculate conditional probabilities per target
  const targetMap = new Map<string, CascadeAffectedElement>();

  for (const record of records) {
    const targetId = record.get('targetId');
    const probs: number[] = record.get('probs');
    const weights: number[] = record.get('weights');
    const dist: number = typeof record.get('dist') === 'object'
      ? record.get('dist').toNumber()
      : record.get('dist');
    const pathIds: string[] = record.get('pathIds');

    // P(target fails | source fails) = Π(P_edge * weight) along path
    // Apply logistic dampening for non-linear cascading
    let conditionalP = 1.0;
    for (let k = 0; k < probs.length; k++) {
      const edgeP = probs[k] * weights[k];
      conditionalP *= logisticCascade(edgeP, dist);
    }
    conditionalP = Math.min(conditionalP, 1.0);

    const existing = targetMap.get(targetId);
    // Keep the path with highest conditional probability
    if (!existing || conditionalP > existing.conditionalProbability) {
      targetMap.set(targetId, {
        elementId: targetId,
        name: record.get('targetName'),
        conditionalProbability: conditionalP,
        distance: dist,
        cascadePath: pathIds,
      });
    }
  }

  const affectedElements = Array.from(targetMap.values()).sort(
    (a, b) => b.conditionalProbability - a.conditionalProbability
  );

  return {
    sourceElementId,
    affectedElements,
    totalBlastRadius: affectedElements.length,
    maxCascadeProbability:
      affectedElements.length > 0 ? affectedElements[0].conditionalProbability : 0,
  };
}

/**
 * Logistic cascade function: non-linear capacity modeling.
 * P(fail) = 1 / (1 + e^(-k*(load - threshold)))
 * At distance, cascade effect diminishes.
 */
function logisticCascade(edgeP: number, distance: number): number {
  const k = 5; // steepness
  const threshold = 0.5;
  // Dampen probability by distance
  const load = edgeP * (1 / distance);
  return 1 / (1 + Math.exp(-k * (load - threshold)));
}

/**
 * Lazy-initializes edge weights using hybrid heuristics.
 * Only sets weights on edges that don't have them yet.
 */
async function initializeEdgeWeights(projectId: string): Promise<void> {
  // Check if any edges lack weights
  const uninitialized = await runCypher(
    `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
     WHERE r.failureProbability IS NULL
     RETURN count(r) as cnt`,
    { projectId }
  );

  const count = uninitialized[0]?.get('cnt');
  const cnt = typeof count === 'object' ? count.toNumber() : count;
  if (!cnt || cnt === 0) return;

  // Heuristic initialization based on element properties
  await runCypher(
    `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
     WHERE r.failureProbability IS NULL
     WITH a, b, r,
          CASE
            WHEN b.status = 'retired' THEN 0.15
            WHEN b.riskLevel = 'critical' THEN 0.12
            WHEN b.riskLevel = 'high' THEN 0.08
            WHEN b.type IN ['infrastructure', 'platform_service'] THEN 0.03
            ELSE 0.05
          END AS heuristicFP,
          CASE
            WHEN size([(b)-[:CONNECTS_TO]->() | 1]) > 5 THEN 1.5
            WHEN size([(b)-[:CONNECTS_TO]->() | 1]) > 2 THEN 1.2
            ELSE 1.0
          END AS heuristicCW
     SET r.failureProbability = heuristicFP,
         r.cascadeWeight = heuristicCW,
         r.confidenceLevel = 0.3,
         r.confidenceSource = 'heuristic'`,
    { projectId }
  );
}

// ─── 5. Plateau Stability ───

/**
 * Calculates plateau stability via joint failure probability.
 * Strategy-dependent thresholds determine stability.
 * Optionally suggests transitional states for unstable elements.
 */
export function calculatePlateauStability(
  elementStates: PlateauState[],
  strategy: RoadmapStrategy = 'balanced',
  autoInsertTransitional: boolean = false,
  organizationalFriction: number = 1.0
): PlateauStabilityResult {
  const thresholds = THRESHOLDS[strategy];

  if (elementStates.length === 0) {
    return {
      isStable: true,
      aggregateFailureProbability: 0,
      threshold: thresholds.plateauFailureThreshold,
      unstableElements: [],
      requiredTransitionalStates: [],
      organizationalFriction,
    };
  }

  // Build adjacency map for dependency-aware joint probability
  const depMap = new Map<string, string[]>();
  const probMap = new Map<string, number>();
  for (const el of elementStates) {
    depMap.set(el.elementId, el.dependsOnElementIds);
    probMap.set(el.elementId, el.failureProbability * el.cascadeWeight * organizationalFriction);
  }

  // Joint failure probability: P(any fails) = 1 - Π(1 - P_i)
  // With dependency amplification: if upstream fails, downstream P increases
  const effectiveProbs = new Map<string, number>();

  for (const el of elementStates) {
    let p = probMap.get(el.elementId) || 0;

    // Amplify by upstream failure probabilities
    for (const depId of el.dependsOnElementIds) {
      const upstreamP = probMap.get(depId);
      if (upstreamP !== undefined) {
        // P(el fails) = P(el) + P(upstream) * P(el | upstream) - P(el) * P(upstream)
        p = p + upstreamP * 0.5 - p * upstreamP;
      }
    }

    effectiveProbs.set(el.elementId, Math.min(p, 1.0));
  }

  // Aggregate: P(any failure) = 1 - Π(1 - P_i)
  let productSurvival = 1.0;
  const unstableElements: string[] = [];

  for (const [elementId, p] of effectiveProbs) {
    productSurvival *= 1 - p;
    if (p > thresholds.plateauFailureThreshold) {
      unstableElements.push(elementId);
    }
  }

  const aggregateFailureProbability = 1 - productSurvival;
  const isStable = aggregateFailureProbability < thresholds.plateauFailureThreshold;

  // Suggest transitional states if requested and unstable
  const requiredTransitionalStates: string[] = [];
  if (autoInsertTransitional && !isStable) {
    for (const elementId of unstableElements) {
      requiredTransitionalStates.push(elementId);
    }
  }

  return {
    isStable,
    aggregateFailureProbability,
    threshold: thresholds.plateauFailureThreshold,
    unstableElements,
    requiredTransitionalStates,
    organizationalFriction,
  };
}

/**
 * Returns the thresholds for a given strategy.
 */
export function getThresholds(strategy: RoadmapStrategy): StochasticThresholds {
  return THRESHOLDS[strategy];
}

// ─── 6. PERT Monte Carlo for Cost Profiles ───

export interface PertMCInput {
  elementId: string;
  elementName: string;
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  successProbability?: number;
}

export interface PertMCResult {
  pertMean: number;
  pertStdDev: number;
  p10: number;
  p50: number;
  p90: number;
  var95: number;
  histogram: { bucket: number; count: number }[];
  elementContributions: { elementId: string; name: string; varianceContribution: number }[];
}

/**
 * Runs PERT-based Monte Carlo simulation across multiple elements.
 * Each element has O/M/P estimates. Returns portfolio-level P10/P50/P90.
 */
export function runPERTMonteCarlo(
  elements: PertMCInput[],
  iterations: number = 10000,
): PertMCResult {
  if (elements.length === 0) {
    return { pertMean: 0, pertStdDev: 0, p10: 0, p50: 0, p90: 0, var95: 0, histogram: [], elementContributions: [] };
  }

  // Build samplers per element
  const samplers = elements.map((el) => {
    const sampler = betaPertDistribution(el.optimistic, el.mostLikely, el.pessimistic);
    return { ...el, sampler };
  });

  const totals: number[] = [];
  const elementSums: number[][] = elements.map(() => []);

  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let j = 0; j < samplers.length; j++) {
      const s = samplers[j];
      let cost = s.sampler();
      // Apply success probability: if project phase fails, cost may double
      if (s.successProbability != null && s.successProbability < 1) {
        if (Math.random() > s.successProbability) {
          cost *= 1.5; // Failure: 50% cost overrun
        }
      }
      elementSums[j].push(cost);
      total += cost;
    }
    totals.push(total);
  }

  totals.sort((a, b) => a - b);

  const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
  const variance = totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length;
  const stdDev = Math.sqrt(variance);

  const p10 = totals[Math.floor(iterations * 0.10)];
  const p50 = totals[Math.floor(iterations * 0.50)];
  const p90 = totals[Math.floor(iterations * 0.90)];
  const var95 = totals[Math.floor(iterations * 0.95)];

  // Histogram (20 buckets)
  const bucketCount = 20;
  const minVal = totals[0];
  const maxVal = totals[totals.length - 1];
  const bucketSize = (maxVal - minVal) / bucketCount || 1;
  const histogram: { bucket: number; count: number }[] = [];
  for (let b = 0; b < bucketCount; b++) {
    histogram.push({ bucket: Math.round(minVal + b * bucketSize), count: 0 });
  }
  for (const v of totals) {
    const idx = Math.min(Math.floor((v - minVal) / bucketSize), bucketCount - 1);
    histogram[idx].count++;
  }

  // Variance contribution per element (tornado data)
  const elementContributions = elements.map((el, j) => {
    const elMean = elementSums[j].reduce((s, v) => s + v, 0) / elementSums[j].length;
    const elVar = elementSums[j].reduce((s, v) => s + (v - elMean) ** 2, 0) / elementSums[j].length;
    return {
      elementId: el.elementId,
      name: el.elementName,
      varianceContribution: variance > 0 ? elVar / variance : 0,
    };
  });
  elementContributions.sort((a, b) => b.varianceContribution - a.varianceContribution);

  return { pertMean: Math.round(mean), pertStdDev: Math.round(stdDev), p10: Math.round(p10), p50: Math.round(p50), p90: Math.round(p90), var95: Math.round(var95), histogram, elementContributions };
}

// ─── 7. Risk-adjusted NPV (rNPV) ───

/**
 * Computes risk-adjusted Net Present Value.
 * cashflows[i] = net cash flow in year i (negative = cost, positive = benefit)
 * successProbabilities[i] = P(reaching year i)
 * discountRate = WACC (e.g. 0.08 for 8%)
 */
export function computeRNPV(
  cashflows: number[],
  successProbabilities: number[],
  discountRate: number = 0.08,
): number {
  let rNPV = 0;
  let cumulativeProb = 1.0;

  for (let t = 0; t < cashflows.length; t++) {
    cumulativeProb *= (successProbabilities[t] ?? 1.0);
    const discountFactor = 1 / Math.pow(1 + discountRate, t);
    rNPV += cashflows[t] * cumulativeProb * discountFactor;
  }

  return Math.round(rNPV);
}

// ─── 8. WSJF (Weighted Shortest Job First) ───

export interface WSJFInput {
  elementId: string;
  elementName: string;
  costOfDelay: number;     // EUR/week (business value + time criticality + risk reduction)
  jobSize: number;          // effort estimate (e.g. total cost or person-months)
}

export interface WSJFOutput {
  elementId: string;
  elementName: string;
  costOfDelay: number;
  jobSize: number;
  wsjfScore: number;
  cd3Score: number;
  rank: number;
}

/**
 * Computes WSJF scores and ranks elements by priority.
 * WSJF = Cost of Delay / Job Size
 * CD3 = Cost of Delay / Duration (using sqrt(jobSize) as duration proxy)
 */
export function computeWSJF(elements: WSJFInput[]): WSJFOutput[] {
  const results = elements.map((el) => {
    const wsjf = el.jobSize > 0 ? el.costOfDelay / el.jobSize : 0;
    const duration = Math.sqrt(el.jobSize) || 1;
    const cd3 = el.costOfDelay / duration;

    return {
      elementId: el.elementId,
      elementName: el.elementName,
      costOfDelay: el.costOfDelay,
      jobSize: el.jobSize,
      wsjfScore: Math.round(wsjf * 100) / 100,
      cd3Score: Math.round(cd3 * 100) / 100,
      rank: 0,
    };
  });

  results.sort((a, b) => b.wsjfScore - a.wsjfScore);
  results.forEach((r, i) => { r.rank = i + 1; });

  return results;
}

// ─── 9. Earned Value Management (EVM) ───

export interface EVMInput {
  budgetAtCompletion: number;  // BAC: total planned budget
  plannedPercent: number;       // % of work scheduled by now (0-1)
  earnedPercent: number;        // % of work actually completed (0-1)
  actualCost: number;           // actual spend so far
}

export interface EVMOutput {
  plannedValue: number;    // PV = BAC * planned%
  earnedValue: number;     // EV = BAC * earned%
  actualCost: number;      // AC
  cpi: number;             // Cost Performance Index = EV/AC
  spi: number;             // Schedule Performance Index = EV/PV
  eac: number;             // Estimate at Completion = BAC/CPI
  etc: number;             // Estimate to Complete = EAC - AC
  vac: number;             // Variance at Completion = BAC - EAC
  cv: number;              // Cost Variance = EV - AC
  sv: number;              // Schedule Variance = EV - PV
}

/**
 * Computes Earned Value Management metrics.
 */
export function computeEVM(input: EVMInput): EVMOutput {
  const pv = input.budgetAtCompletion * input.plannedPercent;
  const ev = input.budgetAtCompletion * input.earnedPercent;
  const ac = input.actualCost;

  const cpi = ac > 0 ? ev / ac : 1;
  const spi = pv > 0 ? ev / pv : 1;
  const eac = cpi > 0 ? input.budgetAtCompletion / cpi : input.budgetAtCompletion;
  const etc = eac - ac;
  const vac = input.budgetAtCompletion - eac;

  return {
    plannedValue: Math.round(pv),
    earnedValue: Math.round(ev),
    actualCost: Math.round(ac),
    cpi: Math.round(cpi * 100) / 100,
    spi: Math.round(spi * 100) / 100,
    eac: Math.round(eac),
    etc: Math.round(etc),
    vac: Math.round(vac),
    cv: Math.round(ev - ac),
    sv: Math.round(ev - pv),
  };
}
