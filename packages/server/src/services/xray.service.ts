import { assessRisk, estimateCosts, runMonteCarloSimulation } from './analytics.service';
import { runCypher } from '../config/neo4j';

export interface XRaySummary {
  metrics: {
    totalRiskExposure: number;
    transformationProgress: number;
    timeToTarget: number;
    decisionConfidence: number;
  };
  riskElements: {
    elementId: string;
    name: string;
    type: string;
    riskScore: number;
    layer?: string;
  }[];
  costSummary: {
    totalCost: number;
    optimizationTotal: number;
    byCategory: Record<string, number>;
  };
  criticalPath: string[];
}

export async function getXRaySummary(projectId: string): Promise<XRaySummary> {
  // Run risk and cost assessments in parallel
  const [riskResult, costResult] = await Promise.all([
    assessRisk(projectId),
    estimateCosts(projectId),
  ]);

  // Calculate total risk exposure (risk * cost weighted)
  const riskCostMap = new Map<string, number>();
  for (const re of riskResult.elements) {
    const ce = costResult.elements.find((c) => c.elementId === re.elementId);
    const cost = ce?.estimatedCost || 15000;
    riskCostMap.set(re.elementId, (re.riskScore * cost) / 10);
  }
  const totalRiskExposure = Array.from(riskCostMap.values()).reduce((s, v) => s + v, 0);

  // Transformation progress
  const statusCounts = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.status as status, count(e) as cnt`,
    { projectId }
  );

  const counts: Record<string, number> = {};
  for (const r of statusCounts) {
    counts[r.get('status')] = r.get('cnt').toNumber();
  }
  const current = counts['current'] || 0;
  const target = counts['target'] || 0;
  const transitional = counts['transitional'] || 0;
  const totalTransformable = current + target + transitional;
  const transformationProgress = totalTransformable > 0 ? Math.round((target / totalTransformable) * 100) : 0;

  // Time to target estimate
  const timeToTarget = Math.max(3, transitional * 2 + (current - target));

  // Decision confidence from Monte Carlo
  const simulation = runMonteCarloSimulation({
    baselineCost: costResult.totalCost,
    riskFactors: riskResult.elements
      .filter((e) => e.riskScore >= 5)
      .slice(0, 10)
      .map((e) => ({
        name: e.name,
        probability: e.riskScore / 15,
        impactMin: (riskCostMap.get(e.elementId) || 0) * 0.5,
        impactMax: (riskCostMap.get(e.elementId) || 0) * 1.5,
      })),
    iterations: 5000,
  });

  const costRange = simulation.p90 - simulation.p10;
  const decisionConfidence = Math.max(10, Math.min(95, Math.round(100 - (costRange / costResult.totalCost) * 100)));

  // Find critical path via Neo4j
  let criticalPath: string[] = [];
  try {
    const pathRecords = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       WHERE e.riskLevel IN ['critical', 'high']
       WITH e ORDER BY e.riskLevel DESC, e.maturityLevel ASC
       LIMIT 1
       MATCH path = (e)-[*1..5]->(dep:ArchitectureElement {projectId: $projectId})
       RETURN [node IN nodes(path) | node.id] as pathIds
       ORDER BY length(path) DESC
       LIMIT 1`,
      { projectId }
    );
    if (pathRecords.length > 0) {
      criticalPath = pathRecords[0].get('pathIds');
    }
  } catch {
    // If graph query fails, return empty path
  }

  return {
    metrics: {
      totalRiskExposure: Math.round(totalRiskExposure),
      transformationProgress,
      timeToTarget: Math.max(1, Math.round(timeToTarget)),
      decisionConfidence,
    },
    riskElements: riskResult.elements.slice(0, 20).map((e) => ({
      elementId: e.elementId,
      name: e.name,
      type: e.type,
      riskScore: e.riskScore,
    })),
    costSummary: {
      totalCost: costResult.totalCost,
      optimizationTotal: costResult.optimizationTotal,
      byCategory: costResult.byCategory,
    },
    criticalPath,
  };
}

export function generateXRayNarrativePrompt(summary: XRaySummary): string {
  const { metrics, riskElements, costSummary } = summary;
  const topRisks = riskElements.filter((e) => e.riskScore >= 7);

  return `You are an enterprise architecture advisor. Generate exactly 3 concise sentences in German for a C-level executive summarizing:

1. Risk status: ${topRisks.length} critical/high-risk elements, total exposure €${Math.round(metrics.totalRiskExposure).toLocaleString()}
2. Transformation: ${metrics.transformationProgress}% complete, ${metrics.timeToTarget} months to target state
3. Cost: Total TCO €${Math.round(costSummary.totalCost).toLocaleString()}, optimization potential €${Math.round(costSummary.optimizationTotal).toLocaleString()}
4. Top risk elements: ${topRisks.slice(0, 3).map((e) => e.name).join(', ')}
5. Decision confidence: ${metrics.decisionConfidence}%

Be direct, actionable, and specific. Reference element names. End with a concrete recommendation.`;
}
