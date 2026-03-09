import { runCypher } from '../config/neo4j';

export interface ImpactResult {
  elementId: string;
  name: string;
  type: string;
  layer: string;
  distance: number;
  impactScore: number;
  relationshipPath: string[];
}

export interface RiskAssessment {
  elementId: string;
  name: string;
  type: string;
  riskLevel: string;
  riskScore: number;
  factors: { factor: string; weight: number; score: number }[];
  dependencyCount: number;
  dependentCount: number;
}

export interface CostEstimate {
  elementId: string;
  name: string;
  type: string;
  status: string;
  estimatedCost: number;
  costCategory: string;
  optimizationPotential: number;
}

// Impact Analysis - cascading effects when an element changes/fails
export async function analyzeImpact(
  projectId: string,
  elementId: string,
  depth: number = 5
): Promise<{ directImpact: ImpactResult[]; transitiveImpact: ImpactResult[]; totalAffected: number; criticalPathLength: number }> {
  // Direct dependencies (elements this element connects to)
  const directRecords = await runCypher(
    `MATCH (e:ArchitectureElement {id: $elementId})-[r]->(dep:ArchitectureElement {projectId: $projectId})
     RETURN dep.id as id, dep.name as name, dep.type as type, dep.layer as layer,
            dep.riskLevel as riskLevel, dep.maturityLevel as maturity, type(r) as relType`,
    { elementId, projectId }
  );

  const directImpact: ImpactResult[] = directRecords.map((r) => ({
    elementId: r.get('id'),
    name: r.get('name'),
    type: r.get('type'),
    layer: r.get('layer'),
    distance: 1,
    impactScore: calculateImpactScore(r.get('riskLevel'), r.get('maturity')?.toNumber?.() || 3, 1),
    relationshipPath: [r.get('relType')],
  }));

  // Transitive dependencies (cascading)
  const transitiveRecords = await runCypher(
    `MATCH path = (e:ArchitectureElement {id: $elementId})-[r*2..${Math.min(depth, 10)}]->(dep:ArchitectureElement {projectId: $projectId})
     WHERE dep.id <> $elementId
     RETURN dep.id as id, dep.name as name, dep.type as type, dep.layer as layer,
            dep.riskLevel as riskLevel, dep.maturityLevel as maturity,
            length(path) as distance, [rel in r | type(rel)] as relTypes`,
    { elementId, projectId }
  );

  const seenIds = new Set(directImpact.map((d) => d.elementId));
  const transitiveImpact: ImpactResult[] = [];

  for (const r of transitiveRecords) {
    const id = r.get('id');
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const dist = r.get('distance').toNumber();
    transitiveImpact.push({
      elementId: id,
      name: r.get('name'),
      type: r.get('type'),
      layer: r.get('layer'),
      distance: dist,
      impactScore: calculateImpactScore(r.get('riskLevel'), r.get('maturity')?.toNumber?.() || 3, dist),
      relationshipPath: r.get('relTypes'),
    });
  }

  const allImpact = [...directImpact, ...transitiveImpact];
  const criticalPathLength = allImpact.length > 0 ? Math.max(...allImpact.map((i) => i.distance)) : 0;

  return {
    directImpact,
    transitiveImpact,
    totalAffected: allImpact.length,
    criticalPathLength,
  };
}

// Risk Assessment across all elements
export async function assessRisk(projectId: string): Promise<{
  elements: RiskAssessment[];
  summary: { total: number; critical: number; high: number; medium: number; low: number; averageScore: number };
}> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     OPTIONAL MATCH (e)-[out]->()
     OPTIONAL MATCH ()-[inc]->(e)
     RETURN e.id as id, e.name as name, e.type as type, e.riskLevel as riskLevel,
            e.maturityLevel as maturity, e.status as status,
            count(DISTINCT out) as outDegree, count(DISTINCT inc) as inDegree`,
    { projectId }
  );

  const elements: RiskAssessment[] = records.map((r) => {
    const outDegree = r.get('outDegree').toNumber();
    const inDegree = r.get('inDegree').toNumber();
    const maturity = r.get('maturity')?.toNumber?.() || 1;
    const riskLevel = r.get('riskLevel') || 'low';
    const status = r.get('status') || 'current';

    const factors = [
      { factor: 'Inherent Risk', weight: 0.3, score: riskToScore(riskLevel) },
      { factor: 'Maturity', weight: 0.2, score: (5 - maturity) * 2 }, // lower maturity = higher risk
      { factor: 'Dependency Exposure', weight: 0.2, score: Math.min(outDegree * 1.5, 10) },
      { factor: 'Dependents Impact', weight: 0.2, score: Math.min(inDegree * 2, 10) },
      { factor: 'Lifecycle Risk', weight: 0.1, score: statusToRiskScore(status) },
    ];

    const riskScore = factors.reduce((sum, f) => sum + f.weight * f.score, 0);

    return {
      elementId: r.get('id'),
      name: r.get('name'),
      type: r.get('type'),
      riskLevel,
      riskScore: Math.round(riskScore * 10) / 10,
      factors,
      dependencyCount: outDegree,
      dependentCount: inDegree,
    };
  });

  elements.sort((a, b) => b.riskScore - a.riskScore);

  const summary = {
    total: elements.length,
    critical: elements.filter((e) => e.riskScore >= 8).length,
    high: elements.filter((e) => e.riskScore >= 6 && e.riskScore < 8).length,
    medium: elements.filter((e) => e.riskScore >= 4 && e.riskScore < 6).length,
    low: elements.filter((e) => e.riskScore < 4).length,
    averageScore: elements.length > 0
      ? Math.round((elements.reduce((s, e) => s + e.riskScore, 0) / elements.length) * 10) / 10
      : 0,
  };

  return { elements, summary };
}

// Cost estimation
export async function estimateCosts(projectId: string): Promise<{
  elements: CostEstimate[];
  totalCost: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  optimizationTotal: number;
}> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name, e.type as type, e.status as status,
            e.togafDomain as domain, e.maturityLevel as maturity, e.riskLevel as riskLevel`,
    { projectId }
  );

  const elements: CostEstimate[] = records.map((r) => {
    const type = r.get('type');
    const status = r.get('status') || 'current';
    const domain = r.get('domain') || 'technology';
    const maturity = r.get('maturity')?.toNumber?.() || 3;

    const baseCost = getBaseCost(type, domain);
    const statusMultiplier = status === 'retired' ? 0.2 : status === 'transitional' ? 1.5 : status === 'target' ? 1.8 : 1.0;
    const estimatedCost = Math.round(baseCost * statusMultiplier);

    const optimizationPotential = status === 'retired' ? estimatedCost * 0.9
      : maturity <= 2 ? estimatedCost * 0.3
      : status === 'transitional' ? estimatedCost * 0.4
      : 0;

    return {
      elementId: r.get('id'),
      name: r.get('name'),
      type,
      status,
      estimatedCost,
      costCategory: domain,
      optimizationPotential: Math.round(optimizationPotential),
    };
  });

  const totalCost = elements.reduce((s, e) => s + e.estimatedCost, 0);
  const optimizationTotal = elements.reduce((s, e) => s + e.optimizationPotential, 0);

  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const el of elements) {
    byCategory[el.costCategory] = (byCategory[el.costCategory] || 0) + el.estimatedCost;
    byStatus[el.status] = (byStatus[el.status] || 0) + el.estimatedCost;
  }

  return { elements, totalCost, byCategory, byStatus, optimizationTotal };
}

// Monte Carlo Simulation
export function runMonteCarloSimulation(params: {
  baselineCost: number;
  riskFactors: { name: string; probability: number; impactMin: number; impactMax: number }[];
  iterations: number;
}): {
  mean: number;
  median: number;
  p10: number;
  p50: number;
  p90: number;
  stdDev: number;
  distribution: { bucket: number; count: number }[];
  riskContributions: { name: string; avgImpact: number; frequency: number }[];
} {
  const { baselineCost, riskFactors, iterations = 10000 } = params;
  const results: number[] = [];
  const riskHits: Record<string, { totalImpact: number; hits: number }> = {};

  for (const rf of riskFactors) {
    riskHits[rf.name] = { totalImpact: 0, hits: 0 };
  }

  for (let i = 0; i < iterations; i++) {
    let totalCost = baselineCost;

    for (const rf of riskFactors) {
      if (Math.random() < rf.probability) {
        const impact = rf.impactMin + Math.random() * (rf.impactMax - rf.impactMin);
        totalCost += impact;
        riskHits[rf.name].totalImpact += impact;
        riskHits[rf.name].hits++;
      }
    }

    results.push(totalCost);
  }

  results.sort((a, b) => a - b);

  const mean = results.reduce((s, v) => s + v, 0) / results.length;
  const median = results[Math.floor(results.length / 2)];
  const p10 = results[Math.floor(results.length * 0.1)];
  const p50 = results[Math.floor(results.length * 0.5)];
  const p90 = results[Math.floor(results.length * 0.9)];
  const variance = results.reduce((s, v) => s + (v - mean) ** 2, 0) / results.length;
  const stdDev = Math.sqrt(variance);

  // Build distribution histogram
  const min = results[0];
  const max = results[results.length - 1];
  const bucketCount = 20;
  const bucketSize = (max - min) / bucketCount || 1;
  const distribution: { bucket: number; count: number }[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const bucketStart = min + b * bucketSize;
    const count = results.filter((v) => v >= bucketStart && v < bucketStart + bucketSize).length;
    distribution.push({ bucket: Math.round(bucketStart), count });
  }

  const riskContributions = Object.entries(riskHits).map(([name, data]) => ({
    name,
    avgImpact: data.hits > 0 ? Math.round(data.totalImpact / data.hits) : 0,
    frequency: Math.round((data.hits / iterations) * 100),
  }));

  return {
    mean: Math.round(mean),
    median: Math.round(median),
    p10: Math.round(p10),
    p50: Math.round(p50),
    p90: Math.round(p90),
    stdDev: Math.round(stdDev),
    distribution,
    riskContributions,
  };
}

// Helper functions
function calculateImpactScore(riskLevel: string, maturity: number, distance: number): number {
  const riskBase = riskToScore(riskLevel);
  const maturityFactor = (5 - maturity) / 4; // 0 to 1
  const distancePenalty = 1 / distance; // closer = higher impact
  return Math.round((riskBase * 0.4 + maturityFactor * 10 * 0.3 + distancePenalty * 10 * 0.3) * 10) / 10;
}

function riskToScore(riskLevel: string): number {
  switch (riskLevel) {
    case 'critical': return 10;
    case 'high': return 7;
    case 'medium': return 4;
    case 'low': return 1;
    default: return 2;
  }
}

function statusToRiskScore(status: string): number {
  switch (status) {
    case 'retired': return 8;
    case 'transitional': return 6;
    case 'target': return 3;
    case 'current': return 1;
    default: return 5;
  }
}

function getBaseCost(type: string, domain: string): number {
  const costs: Record<string, number> = {
    application: 50000,
    application_component: 20000,
    application_service: 15000,
    service: 15000,
    technology_component: 30000,
    infrastructure: 80000,
    platform_service: 40000,
    data_entity: 10000,
    data_model: 8000,
    business_capability: 5000,
    process: 12000,
    value_stream: 8000,
  };
  return costs[type] || (domain === 'technology' ? 25000 : 10000);
}
