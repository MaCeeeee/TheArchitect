/**
 * Cost Engine Service — Phase 1: Tier 0 Graph-Based Relative Ranking
 *
 * Implements PageRank, Betweenness Centrality, Louvain Community Detection,
 * dependency depth, and Metcalfe's Law as in-process algorithms over
 * adjacency data from Neo4j (no GDS plugin required).
 */

import { runCypher } from '../config/neo4j';
import type {
  ElementCostProfile,
  GraphCentralityMetrics,
  CostTier,
  CostDimension,
  TierMetadata,
  SevenRsStrategy,
  IndustryDefaults,
} from '@thearchitect/shared';
import {
  BASE_COSTS_BY_TYPE,
  STATUS_COST_MULTIPLIERS,
  SEVEN_RS_MULTIPLIERS,
  TRAINING_DAYS_PER_STRATEGY,
  INDUSTRY_DEFAULTS,
  COCOMO_A,
  COCOMO_B_BASE,
  COCOMO_SF_INCREMENT,
  COCOMO_SCHEDULE_A,
  COCOMO_SCHEDULE_SE_BASE,
  COCOMO_SCHEDULE_SE_FACTOR,
} from '@thearchitect/shared';
import { estimateSmartCost } from './smart-cost.service';

// ─── Internal Types ───

interface AdjacencyNode {
  id: string;
  name: string;
  type: string;
  layer?: string;
  status: string;
  riskLevel?: string;
  // Tier 1
  annualCost?: number;
  userCount?: number;
  recordCount?: number;
  transformationStrategy?: SevenRsStrategy;
  // Tier 2
  ksloc?: number;
  technicalFitness?: number;
  functionalFitness?: number;
  errorRatePercent?: number;
  hourlyRate?: number;
  monthlyInfraCost?: number;
  technicalDebtRatio?: number;
  // Tier 3
  costEstimateOptimistic?: number;
  costEstimateMostLikely?: number;
  costEstimatePessimistic?: number;
  successProbability?: number;
  costOfDelayPerWeek?: number;
}

interface AdjacencyEdge {
  sourceId: string;
  targetId: string;
}

interface AdjacencyData {
  nodes: Map<string, AdjacencyNode>;
  edges: AdjacencyEdge[];
  outNeighbors: Map<string, string[]>;
  inNeighbors: Map<string, string[]>;
}

// ─── Data Loading ───

async function loadAdjacencyData(projectId: string): Promise<AdjacencyData> {
  const nodeRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id AS id, e.name AS name, e.type AS type,
            e.status AS status, e.annualCost AS annualCost,
            e.userCount AS userCount, e.recordCount AS recordCount,
            e.transformationStrategy AS transformationStrategy,
            e.ksloc AS ksloc, e.technicalFitness AS technicalFitness,
            e.functionalFitness AS functionalFitness, e.errorRatePercent AS errorRatePercent,
            e.hourlyRate AS hourlyRate, e.monthlyInfraCost AS monthlyInfraCost,
            e.technicalDebtRatio AS technicalDebtRatio,
            e.costEstimateOptimistic AS costEstimateOptimistic,
            e.costEstimateMostLikely AS costEstimateMostLikely,
            e.costEstimatePessimistic AS costEstimatePessimistic,
            e.successProbability AS successProbability,
            e.costOfDelayPerWeek AS costOfDelayPerWeek`,
    { projectId },
  );

  const edgeRecords = await runCypher(
    `MATCH (a:ArchitectureElement {projectId: $projectId})-[r]->(b:ArchitectureElement {projectId: $projectId})
     RETURN a.id AS sourceId, b.id AS targetId`,
    { projectId },
  );

  const nodes = new Map<string, AdjacencyNode>();
  for (const r of nodeRecords) {
    const id = r.get('id');
    nodes.set(id, {
      id,
      name: r.get('name') || '',
      type: r.get('type') || '',
      status: r.get('status') || 'current',
      annualCost: toNumber(r.get('annualCost')),
      userCount: toNumber(r.get('userCount')),
      recordCount: toNumber(r.get('recordCount')),
      transformationStrategy: r.get('transformationStrategy') || undefined,
      ksloc: toNumber(r.get('ksloc')),
      technicalFitness: toNumber(r.get('technicalFitness')),
      functionalFitness: toNumber(r.get('functionalFitness')),
      errorRatePercent: toNumber(r.get('errorRatePercent')),
      hourlyRate: toNumber(r.get('hourlyRate')),
      monthlyInfraCost: toNumber(r.get('monthlyInfraCost')),
      technicalDebtRatio: toNumber(r.get('technicalDebtRatio')),
      costEstimateOptimistic: toNumber(r.get('costEstimateOptimistic')),
      costEstimateMostLikely: toNumber(r.get('costEstimateMostLikely')),
      costEstimatePessimistic: toNumber(r.get('costEstimatePessimistic')),
      successProbability: toNumber(r.get('successProbability')),
      costOfDelayPerWeek: toNumber(r.get('costOfDelayPerWeek')),
    });
  }

  const outNeighbors = new Map<string, string[]>();
  const inNeighbors = new Map<string, string[]>();
  for (const id of nodes.keys()) {
    outNeighbors.set(id, []);
    inNeighbors.set(id, []);
  }

  const edges: AdjacencyEdge[] = [];
  for (const r of edgeRecords) {
    const src = r.get('sourceId');
    const tgt = r.get('targetId');
    if (nodes.has(src) && nodes.has(tgt)) {
      edges.push({ sourceId: src, targetId: tgt });
      outNeighbors.get(src)!.push(tgt);
      inNeighbors.get(tgt)!.push(src);
    }
  }

  return { nodes, edges, outNeighbors, inNeighbors };
}

// ─── PageRank (iterative power method, 20 iterations) ───

function computePageRank(
  adj: AdjacencyData,
  iterations = 20,
  dampingFactor = 0.85,
): Map<string, number> {
  const n = adj.nodes.size;
  if (n === 0) return new Map();

  const ids = Array.from(adj.nodes.keys());
  let ranks = new Map<string, number>();
  const initial = 1 / n;
  for (const id of ids) {
    ranks.set(id, initial);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Map<string, number>();
    // Collect dangling node mass (nodes with no outgoing edges)
    let danglingSum = 0;
    for (const id of ids) {
      if (adj.outNeighbors.get(id)!.length === 0) {
        danglingSum += ranks.get(id)!;
      }
    }

    for (const id of ids) {
      let inSum = 0;
      const inNbrs = adj.inNeighbors.get(id)!;
      for (const src of inNbrs) {
        const srcOutDeg = adj.outNeighbors.get(src)!.length;
        if (srcOutDeg > 0) {
          inSum += ranks.get(src)! / srcOutDeg;
        }
      }
      newRanks.set(
        id,
        (1 - dampingFactor) / n + dampingFactor * (inSum + danglingSum / n),
      );
    }
    ranks = newRanks;
  }

  // Normalize to 0-1 range
  let maxRank = 0;
  for (const v of ranks.values()) {
    if (v > maxRank) maxRank = v;
  }
  if (maxRank > 0) {
    for (const [id, v] of ranks) {
      ranks.set(id, v / maxRank);
    }
  }

  return ranks;
}

// ─── Betweenness Centrality (Brandes' algorithm) ───

function computeBetweenness(adj: AdjacencyData): Map<string, number> {
  const ids = Array.from(adj.nodes.keys());
  const n = ids.length;
  if (n === 0) return new Map();

  const cb = new Map<string, number>();
  for (const id of ids) {
    cb.set(id, 0);
  }

  for (const s of ids) {
    // BFS from s
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    const delta = new Map<string, number>();

    for (const id of ids) {
      pred.set(id, []);
      sigma.set(id, 0);
      dist.set(id, -1);
      delta.set(id, 0);
    }

    sigma.set(s, 1);
    dist.set(s, 0);
    const queue: string[] = [s];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      for (const w of adj.outNeighbors.get(v)!) {
        // First visit?
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        // Shortest path via v?
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    // Back-propagation
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) {
        cb.set(w, cb.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalize to 0-1
  let maxBc = 0;
  for (const v of cb.values()) {
    if (v > maxBc) maxBc = v;
  }
  if (maxBc > 0) {
    for (const [id, v] of cb) {
      cb.set(id, v / maxBc);
    }
  }

  return cb;
}

// ─── Louvain Community Detection (simplified greedy modularity) ───

function computeLouvain(adj: AdjacencyData): Map<string, number> {
  const ids = Array.from(adj.nodes.keys());
  const n = ids.length;
  if (n === 0) return new Map();

  // Build undirected adjacency + weight map
  const neighbors = new Map<string, Set<string>>();
  for (const id of ids) {
    neighbors.set(id, new Set());
  }
  for (const edge of adj.edges) {
    neighbors.get(edge.sourceId)!.add(edge.targetId);
    neighbors.get(edge.targetId)!.add(edge.sourceId);
  }

  const m = adj.edges.length; // total edges (directed, but treat as undirected weight)
  if (m === 0) {
    // No edges: each node is its own community
    const result = new Map<string, number>();
    ids.forEach((id, i) => result.set(id, i));
    return result;
  }

  // Initialize: each node in its own community
  const community = new Map<string, number>();
  ids.forEach((id, i) => community.set(id, i));

  // Degree of each node (undirected)
  const degree = new Map<string, number>();
  for (const id of ids) {
    degree.set(id, neighbors.get(id)!.size);
  }

  // Greedy phase: iterate until no improvement
  let improved = true;
  let passes = 0;
  const maxPasses = 10;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;

    for (const nodeId of ids) {
      const currentComm = community.get(nodeId)!;
      const ki = degree.get(nodeId)!;

      // Count edges to each neighboring community
      const commEdges = new Map<number, number>();
      for (const nbr of neighbors.get(nodeId)!) {
        const nbrComm = community.get(nbr)!;
        commEdges.set(nbrComm, (commEdges.get(nbrComm) || 0) + 1);
      }

      // Sum of degrees in each community
      const commDegreeSum = new Map<number, number>();
      for (const id of ids) {
        const c = community.get(id)!;
        commDegreeSum.set(c, (commDegreeSum.get(c) || 0) + degree.get(id)!);
      }

      let bestComm = currentComm;
      let bestDeltaQ = 0;
      const m2 = 2 * m;

      for (const [targetComm, edgesToComm] of commEdges) {
        if (targetComm === currentComm) continue;

        // Modularity gain of moving nodeId to targetComm
        const sumIn = commDegreeSum.get(targetComm) || 0;
        const edgesCurrentComm = commEdges.get(currentComm) || 0;

        const deltaQ =
          (edgesToComm - edgesCurrentComm) / m -
          ki * (sumIn - (commDegreeSum.get(currentComm) || 0) + ki) / (m2 * m);

        if (deltaQ > bestDeltaQ) {
          bestDeltaQ = deltaQ;
          bestComm = targetComm;
        }
      }

      if (bestComm !== currentComm) {
        community.set(nodeId, bestComm);
        improved = true;
      }
    }
  }

  // Re-index community IDs to sequential integers
  const commMap = new Map<number, number>();
  let nextId = 0;
  const result = new Map<string, number>();
  for (const id of ids) {
    const c = community.get(id)!;
    if (!commMap.has(c)) {
      commMap.set(c, nextId++);
    }
    result.set(id, commMap.get(c)!);
  }

  return result;
}

// ─── Dependency Depth (max path length to any leaf via BFS) ───

function computeDependencyDepth(adj: AdjacencyData): Map<string, number> {
  const ids = Array.from(adj.nodes.keys());
  const depth = new Map<string, number>();

  for (const id of ids) {
    // BFS to find max distance from this node
    const visited = new Set<string>();
    visited.add(id);
    let queue = [id];
    let maxDist = 0;
    let currentDist = 0;

    while (queue.length > 0) {
      const nextQueue: string[] = [];
      for (const v of queue) {
        for (const w of adj.outNeighbors.get(v)!) {
          if (!visited.has(w)) {
            visited.add(w);
            nextQueue.push(w);
          }
        }
      }
      if (nextQueue.length > 0) {
        currentDist++;
        maxDist = currentDist;
      }
      queue = nextQueue;
    }

    depth.set(id, maxDist);
  }

  return depth;
}

// ─── Metcalfe's Law: n(n-1)/2 for connected subgraph ───

function computeMetcalfeValues(adj: AdjacencyData): Map<string, number> {
  const ids = Array.from(adj.nodes.keys());

  // Find connected components (undirected BFS)
  const visited = new Set<string>();
  const components: string[][] = [];
  const undirected = new Map<string, Set<string>>();

  for (const id of ids) {
    undirected.set(id, new Set());
  }
  for (const edge of adj.edges) {
    undirected.get(edge.sourceId)!.add(edge.targetId);
    undirected.get(edge.targetId)!.add(edge.sourceId);
  }

  for (const id of ids) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);

    while (queue.length > 0) {
      const v = queue.shift()!;
      component.push(v);
      for (const w of undirected.get(v)!) {
        if (!visited.has(w)) {
          visited.add(w);
          queue.push(w);
        }
      }
    }
    components.push(component);
  }

  // Assign Metcalfe value per node = n(n-1)/2 of its component
  const metcalfe = new Map<string, number>();
  for (const comp of components) {
    const n = comp.length;
    const value = (n * (n - 1)) / 2;
    for (const id of comp) {
      metcalfe.set(id, value);
    }
  }

  return metcalfe;
}

// ─── Tier Detection ───

function detectTier(node: AdjacencyNode): { tier: CostTier; fieldsProvided: string[] } {
  const fields: string[] = [];

  // Tier 1 fields
  if (node.annualCost != null && node.annualCost > 0) fields.push('annualCost');
  if (node.transformationStrategy) fields.push('transformationStrategy');
  if (node.userCount != null && node.userCount > 0) fields.push('userCount');
  if (node.recordCount != null && node.recordCount > 0) fields.push('recordCount');

  // Tier 2 fields
  const tier2Fields: string[] = [];
  if (node.ksloc != null && node.ksloc > 0) tier2Fields.push('ksloc');
  if (node.technicalFitness != null) tier2Fields.push('technicalFitness');
  if (node.functionalFitness != null) tier2Fields.push('functionalFitness');
  if (node.errorRatePercent != null) tier2Fields.push('errorRatePercent');
  if (node.hourlyRate != null && node.hourlyRate > 0) tier2Fields.push('hourlyRate');
  if (node.monthlyInfraCost != null) tier2Fields.push('monthlyInfraCost');
  if (node.technicalDebtRatio != null) tier2Fields.push('technicalDebtRatio');

  // Tier 3 fields
  const tier3Fields: string[] = [];
  if (node.costEstimateOptimistic != null && node.costEstimateOptimistic > 0) tier3Fields.push('costEstimateOptimistic');
  if (node.costEstimateMostLikely != null && node.costEstimateMostLikely > 0) tier3Fields.push('costEstimateMostLikely');
  if (node.costEstimatePessimistic != null && node.costEstimatePessimistic > 0) tier3Fields.push('costEstimatePessimistic');
  if (node.successProbability != null) tier3Fields.push('successProbability');
  if (node.costOfDelayPerWeek != null && node.costOfDelayPerWeek > 0) tier3Fields.push('costOfDelayPerWeek');

  const allFields = [...fields, ...tier2Fields, ...tier3Fields];

  if (allFields.length === 0) {
    return { tier: 0, fieldsProvided: allFields };
  }

  // Tier 3: has O/M/P estimates (at least O + M + P)
  if (tier3Fields.length >= 3) {
    return { tier: 3, fieldsProvided: allFields };
  }

  // Tier 2: at least one Tier 1 field AND at least one Tier 2 field
  if (fields.length > 0 && tier2Fields.length > 0) {
    return { tier: 2, fieldsProvided: allFields };
  }

  // Tier 1: at least one Tier 1 field
  return { tier: 1, fieldsProvided: allFields };
}

function tierConfidenceBand(tier: CostTier): TierMetadata['confidenceBand'] {
  switch (tier) {
    case 0: return 'relative-only';
    case 1: return '±30-50%';
    case 2: return '±15-30%';
    case 3: return 'P10/P50/P90';
  }
}

// ─── Tier 1: First Absolute EUR Estimates ───

interface Tier1CostResult {
  dimensions: Partial<CostDimension>;
  totalEstimated: number;
  confidenceLow: number;
  confidenceHigh: number;
}

/**
 * Compute Tier 1 cost estimates using up to 4 user-provided fields:
 * annualCost, transformationStrategy, userCount, recordCount.
 *
 * Returns 7-dimension cost breakdown with ±30-50% confidence.
 */
export function computeTier1Cost(
  node: AdjacencyNode,
  defaults: IndustryDefaults = INDUSTRY_DEFAULTS,
): Tier1CostResult {
  const smartCost = node.annualCost
    ? { annualCost: node.annualCost, confidence: 'benchmark' as const }
    : estimateSmartCost(node.name || '', node.type, node.layer || 'application');
  const annualCost = smartCost.annualCost || 0;
  const strategy: SevenRsStrategy = node.transformationStrategy || 'retain';
  const userCount = node.userCount || 0;
  const recordCount = node.recordCount || 0;
  const statusMult = STATUS_COST_MULTIPLIERS[node.status] || 1.0;

  // 1. Application Transformation: annualCost * strategy multiplier
  const strategyMult = SEVEN_RS_MULTIPLIERS[strategy] || 0.05;
  const applicationTransformation = Math.round(annualCost * strategyMult * statusMult);

  // 2. Data Migration: recordCount * costPerRecord * qualityFactor
  const qualityFactor = 1 + defaults.defaultDataErrorRate; // 1.20
  const dataMigration = Math.round(recordCount * defaults.migrationCostPerRecord * qualityFactor);

  // 3. Training & Change Management: userCount * hourlyRate * trainingDays * 8h
  const trainingDays = TRAINING_DAYS_PER_STRATEGY[strategy] || 0;
  const trainingChange = Math.round(
    userCount * defaults.hourlyRateDACH * trainingDays * 8,
  );

  // 4. Infrastructure: annualCost * statusMultiplier (TCO base)
  const infrastructure = Math.round(annualCost * statusMult);

  // 5. Process Costs: CM budget allocation (10% of transformation)
  const process = Math.round(applicationTransformation * defaults.cmBudgetPercent);

  // 6. Opportunity Cost: J-curve productivity dip
  // -20% of annualCost over 4 months for affected users
  const opportunityCost = userCount > 0
    ? Math.round(
        annualCost * defaults.productivityDipPercent *
        (defaults.productivityDipMonths / 12),
      )
    : 0;

  // 7. Risk-Adjusted Financial: simple discount of total by success probability
  const subtotal = applicationTransformation + dataMigration + trainingChange +
    infrastructure + process + opportunityCost;
  const riskAdjustedFinancial = Math.round(
    subtotal * (1 - defaults.successProbPhase1) * defaults.conditionalRiskDirect,
  );

  const dimensions: Partial<CostDimension> = {
    process,
    dataMigration,
    trainingChange,
    applicationTransformation,
    infrastructure,
    opportunityCost,
    riskAdjustedFinancial,
  };

  const totalEstimated = subtotal + riskAdjustedFinancial;

  return {
    dimensions,
    totalEstimated,
    confidenceLow: Math.round(totalEstimated * 0.5),   // ±50% lower
    confidenceHigh: Math.round(totalEstimated * 1.5),   // ±50% upper
  };
}

// ─── Tier 2: Full 7-Dimension Cost Models ───

interface Tier2CostResult {
  dimensions: Partial<CostDimension>;
  totalEstimated: number;
  confidenceLow: number;
  confidenceHigh: number;
}

/**
 * Compute Tier 2 cost estimates using Tier 1 fields PLUS detailed model inputs:
 * ksloc, technicalFitness, functionalFitness, errorRatePercent, hourlyRate,
 * monthlyInfraCost, technicalDebtRatio.
 *
 * Models applied:
 * - COCOMO II (effort in person-months)
 * - SQALE/TDR (technical debt remediation)
 * - 1-10-100 Data Quality Rule
 * - Wright Learning Curve (training cost adjustment)
 * - J-Curve Productivity Loss
 * - ABC Process Costs (CM budget)
 * - COPQ (Cost of Poor Quality)
 * - TCO with infrastructure + legacy maintenance curve
 *
 * Returns 7-dimension cost breakdown with ±15-30% confidence.
 */
export function computeTier2Cost(
  node: AdjacencyNode,
  graphMetrics: GraphCentralityMetrics | undefined,
  defaults: IndustryDefaults = INDUSTRY_DEFAULTS,
): Tier2CostResult {
  const smartCost2 = node.annualCost
    ? { annualCost: node.annualCost, confidence: 'benchmark' as const }
    : estimateSmartCost(node.name || '', node.type, node.layer || 'application');
  const annualCost = smartCost2.annualCost || 0;
  const strategy: SevenRsStrategy = node.transformationStrategy || 'retain';
  const userCount = node.userCount || 0;
  const recordCount = node.recordCount || 0;
  const statusMult = STATUS_COST_MULTIPLIERS[node.status] || 1.0;
  const rate = node.hourlyRate || defaults.hourlyRateDACH;
  const ksloc = node.ksloc || 0;
  const tdr = node.technicalDebtRatio ?? defaults.defaultTDR;
  const errorRate = (node.errorRatePercent ?? (defaults.defaultDataErrorRate * 100)) / 100;
  const techFitness = node.technicalFitness ?? 3;
  const monthlyInfra = node.monthlyInfraCost ?? 0;

  // ── 1. Application Transformation ──
  // COCOMO II: effort(PM) = A * (KSLOC)^E where E = B_BASE + SF_INCREMENT * (5 - techFitness)
  let cocomoII = 0;
  if (ksloc > 0) {
    const scaleE = COCOMO_B_BASE + COCOMO_SF_INCREMENT * (5 - techFitness);
    const effortPM = COCOMO_A * Math.pow(ksloc, scaleE);
    cocomoII = Math.round(effortPM * rate * 160); // PM * hourlyRate * 160h/month
  }

  // SQALE / TDR: remediation cost = KSLOC * 1000 * TDR * hourlyRate (assuming 1h per LOC remediated at TDR rate)
  const sqaleRemediation = ksloc > 0
    ? Math.round(ksloc * 1000 * tdr * rate / 8) // TDR fraction * lines / 8h per day
    : 0;

  // 7 R's multiplier on annualCost
  const strategyMult = SEVEN_RS_MULTIPLIERS[strategy] || 0.05;
  const sevenRsCost = Math.round(annualCost * strategyMult * statusMult);

  // Legacy maintenance curve: annualCost * (1.10)^dependencyDepth (proxy for age)
  const depthProxy = graphMetrics?.dependencyDepth || 0;
  const legacyMaintenance = depthProxy > 0
    ? Math.round(annualCost * (Math.pow(1 + defaults.maintenanceGrowthRate, depthProxy) - 1))
    : 0;

  const applicationTransformation = cocomoII + sqaleRemediation + sevenRsCost + legacyMaintenance;

  // ── 2. Data Migration (1-10-100 Rule) ──
  // Cost = records * weighted cost * (errorRate / baseline)
  // 1-10-100: prevention=$1, correction=$10, failure=$100
  // Expected: 70% clean ($1), 20% correctable ($10), 10% failures ($100)
  const dataQualityCostPerRecord = 0.70 * 1 + 0.20 * 10 + 0.10 * 100; // = 12.70
  const errorMultiplier = errorRate > 0 ? errorRate / 0.05 : 1; // normalize to 5% baseline
  const dataMigration = recordCount > 0
    ? Math.round(recordCount * dataQualityCostPerRecord * Math.min(errorMultiplier, 10))
    : 0;

  // ── 3. Training & Change Management ──
  // Wright Learning Curve: Y = a * X^(log(learningRate)/log(2))
  const trainingDays = TRAINING_DAYS_PER_STRATEGY[strategy] || 0;
  let trainingBase = userCount * rate * trainingDays * 8;

  if (userCount > 1) {
    // Apply Wright curve: cumulative cost for N users
    const b = Math.log(defaults.wrightLearningRate) / Math.log(2); // ≈ -0.322
    // Average cost per unit across N users = a * N^b
    const wrightFactor = Math.pow(userCount, b);
    trainingBase = Math.round(trainingBase * wrightFactor);
  }

  // J-Curve productivity loss
  const jCurveLoss = userCount > 0
    ? Math.round(annualCost * defaults.productivityDipPercent * (defaults.productivityDipMonths / 12))
    : 0;

  // Change saturation: if concurrent changes > threshold, costs increase
  const concurrentChanges = graphMetrics?.outDegree || 0;
  const saturationPenalty = concurrentChanges > defaults.changeSaturationThreshold
    ? 1 + defaults.changeSaturationK * (concurrentChanges - defaults.changeSaturationThreshold)
    : 1;

  const trainingChange = Math.round((trainingBase + jCurveLoss) * saturationPenalty);

  // ── 4. Infrastructure (TCO) ──
  // Monthly infra * 12 + annualCost * statusMult
  const infraAnnual = monthlyInfra > 0 ? monthlyInfra * 12 : 0;
  const finOpsOptimization = infraAnnual > 0
    ? Math.round(infraAnnual * defaults.cloudWastePercent) // potential savings
    : 0;
  const infrastructure = Math.round((annualCost + infraAnnual) * statusMult);

  // ── 5. Process Costs (ABC + COPQ) ──
  // ABC: CM budget allocation
  const abcAllocation = Math.round(applicationTransformation * defaults.cmBudgetPercent);

  // COPQ: Cost of Poor Quality = copqAsRevenuePercent * annualCost * errorRate
  const copqEstimate = Math.round(annualCost * defaults.copqAsRevenuePercent * errorRate);

  const process = abcAllocation + copqEstimate;

  // ── 6. Opportunity Cost ──
  // Already captured in J-curve; add Metcalfe-based integration complexity
  const metcalfeNorm = graphMetrics?.metcalfeValue
    ? Math.min(graphMetrics.metcalfeValue / 100, 1)
    : 0;
  const integrationDelay = Math.round(annualCost * 0.05 * metcalfeNorm); // 0-5% of annualCost
  const opportunityCost = jCurveLoss + integrationDelay;

  // ── 7. Risk-Adjusted Financial ──
  const subtotal = applicationTransformation + dataMigration + trainingChange +
    infrastructure + process + opportunityCost;
  const riskAdjustedFinancial = Math.round(
    subtotal * (1 - defaults.successProbPhase2) * defaults.conditionalRiskDirect,
  );

  const dimensions: Partial<CostDimension> = {
    process,
    dataMigration,
    trainingChange,
    applicationTransformation,
    infrastructure,
    opportunityCost,
    riskAdjustedFinancial,
  };

  const totalEstimated = subtotal + riskAdjustedFinancial;

  return {
    dimensions,
    totalEstimated,
    confidenceLow: Math.round(totalEstimated * 0.7),   // ±30% lower
    confidenceHigh: Math.round(totalEstimated * 1.3),   // ±30% upper
  };
}

// ─── Public API ───

/**
 * Compute graph centrality metrics for all elements in a project.
 * Returns ElementCostProfile[] at Tier 0 (relative rankings, no EUR).
 */
export async function computeGraphCentrality(
  projectId: string,
): Promise<ElementCostProfile[]> {
  const adj = await loadAdjacencyData(projectId);

  if (adj.nodes.size === 0) {
    return [];
  }

  // Run all graph algorithms
  const pageRank = computePageRank(adj);
  const betweenness = computeBetweenness(adj);
  const communities = computeLouvain(adj);
  const depthMap = computeDependencyDepth(adj);
  const metcalfeMap = computeMetcalfeValues(adj);

  const profiles: ElementCostProfile[] = [];

  for (const [id, node] of adj.nodes) {
    const pr = pageRank.get(id) || 0;
    const bc = betweenness.get(id) || 0;
    const inDeg = adj.inNeighbors.get(id)?.length || 0;
    const outDeg = adj.outNeighbors.get(id)?.length || 0;

    const graphMetrics: GraphCentralityMetrics = {
      pageRank: round4(pr),
      betweennessCentrality: round4(bc),
      communityId: communities.get(id) || 0,
      dependencyDepth: depthMap.get(id) || 0,
      metcalfeValue: metcalfeMap.get(id) || 0,
      inDegree: inDeg,
      outDegree: outDeg,
    };

    // Composite importance: weighted combination of PageRank and Betweenness
    const relativeImportance = round4(0.6 * pr + 0.4 * bc);

    // Relative cost risk: combines importance with dependency exposure
    const depthNorm = Math.min((depthMap.get(id) || 0) / 5, 1);
    const degreeNorm = Math.min((inDeg + outDeg) / 10, 1);
    const relativeCostRisk = round4(0.4 * relativeImportance + 0.3 * depthNorm + 0.3 * degreeNorm);

    const { tier, fieldsProvided } = detectTier(node);
    const tierMetadata: TierMetadata = {
      tier,
      fieldsProvided,
      confidenceBand: tierConfidenceBand(tier),
    };

    const profile: ElementCostProfile = {
      elementId: id,
      elementName: node.name,
      elementType: node.type,
      tier,
      tierMetadata,
      graphMetrics,
      relativeImportance,
      relativeCostRisk,
    };

    // Compute cost based on detected tier
    if (tier >= 2) {
      const tier2 = computeTier2Cost(node, graphMetrics);
      profile.dimensions = tier2.dimensions;
      profile.totalEstimated = tier2.totalEstimated;
      profile.confidenceLow = tier2.confidenceLow;
      profile.confidenceHigh = tier2.confidenceHigh;
    } else if (tier >= 1) {
      const tier1 = computeTier1Cost(node);
      profile.dimensions = tier1.dimensions;
      profile.totalEstimated = tier1.totalEstimated;
      profile.confidenceLow = tier1.confidenceLow;
      profile.confidenceHigh = tier1.confidenceHigh;
    }

    profiles.push(profile);
  }

  // Sort by relative importance descending
  profiles.sort((a, b) => (b.relativeImportance || 0) - (a.relativeImportance || 0));

  return profiles;
}

/**
 * Compute relative rankings as a simplified summary.
 * Returns elements sorted by composite importance score.
 */
export async function computeRelativeRankings(
  projectId: string,
): Promise<{
  rankings: { elementId: string; name: string; type: string; importance: number; costRisk: number; communityId: number }[];
  communityCount: number;
  graphDensity: number;
}> {
  const profiles = await computeGraphCentrality(projectId);

  const rankings = profiles.map((p) => ({
    elementId: p.elementId,
    name: p.elementName,
    type: p.elementType,
    importance: p.relativeImportance || 0,
    costRisk: p.relativeCostRisk || 0,
    communityId: p.graphMetrics?.communityId || 0,
  }));

  const communityIds = new Set(rankings.map((r) => r.communityId));

  // Graph density = edges / (n * (n-1))
  // We need adjacency data again — but we can estimate from the profiles
  const n = profiles.length;
  const totalDegree = profiles.reduce(
    (s, p) => s + (p.graphMetrics?.outDegree || 0),
    0,
  );
  const graphDensity = n > 1 ? round4(totalDegree / (n * (n - 1))) : 0;

  return {
    rankings,
    communityCount: communityIds.size,
    graphDensity,
  };
}

/**
 * Get a Tier 0 cost estimate for a single element using BASE_COSTS fallback.
 * Used by other services (analytics, xray) when no user cost data exists.
 */
export function getTier0CostEstimate(type: string, status: string, name?: string): number {
  if (name) {
    const smart = estimateSmartCost(name, type, '');
    return Math.round(smart.annualCost * (STATUS_COST_MULTIPLIERS[status] || 1.0));
  }
  const baseCost = BASE_COSTS_BY_TYPE[type] || 0;
  const statusMult = STATUS_COST_MULTIPLIERS[status] || 1.0;
  return Math.round(baseCost * statusMult);
}

// ─── Real Options (Black-Scholes) ───

/**
 * Black-Scholes call option pricing for defer/abandon decisions.
 * C = S * N(d1) - K * e^(-rT) * N(d2)
 *
 * @param S  Current project value (e.g. NPV of benefits)
 * @param K  Exercise price (e.g. transformation cost)
 * @param T  Time to expiry in years
 * @param r  Risk-free rate (e.g. 0.03 for 3%)
 * @param sigma  Volatility of project value (e.g. 0.3 for 30%)
 */
export function blackScholesCall(S: number, K: number, T: number, r: number, sigma: number): {
  callValue: number;
  d1: number;
  d2: number;
  deferValue: number;
  recommendation: 'proceed' | 'defer' | 'abandon';
} {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) {
    return { callValue: 0, d1: 0, d2: 0, deferValue: 0, recommendation: 'abandon' };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const callValue = S * cumulativeNormal(d1) - K * Math.exp(-r * T) * cumulativeNormal(d2);
  const intrinsicValue = Math.max(S - K, 0);
  const deferValue = callValue - intrinsicValue;

  let recommendation: 'proceed' | 'defer' | 'abandon';
  if (intrinsicValue > callValue * 0.9) {
    recommendation = 'proceed'; // immediate value close to option value
  } else if (callValue > K * 0.1) {
    recommendation = 'defer'; // significant option value from waiting
  } else {
    recommendation = 'abandon';
  }

  return {
    callValue: Math.round(callValue),
    d1: round4(d1),
    d2: round4(d2),
    deferValue: Math.round(deferValue),
    recommendation,
  };
}

/** Cumulative standard normal distribution (Abramowitz & Stegun approximation) */
function cumulativeNormal(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

// ─── Change Saturation ───

/**
 * Models the cost multiplier when too many concurrent changes overwhelm the organization.
 * effectiveCost = baseCost * (1 + k * max(0, N_concurrent - threshold))
 *
 * @param baseCost       Base transformation cost
 * @param concurrent     Number of concurrent transformation initiatives
 * @param threshold      Organizational capacity threshold (default: 5)
 * @param k              Saturation coefficient (default: 0.15 = 15% cost increase per extra initiative)
 */
export function changeSaturationMultiplier(
  baseCost: number,
  concurrent: number,
  threshold: number = 5,
  k: number = 0.15,
): { effectiveCost: number; multiplier: number; overCapacity: number } {
  const overCapacity = Math.max(0, concurrent - threshold);
  const multiplier = 1 + k * overCapacity;
  return {
    effectiveCost: Math.round(baseCost * multiplier),
    multiplier: round4(multiplier),
    overCapacity,
  };
}

// ─── Helpers ───

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Safely convert Neo4j Integer or null to a JS number. */
function toNumber(val: unknown): number | undefined {
  if (val == null) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && 'low' in val) return (val as { low: number }).low;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}
