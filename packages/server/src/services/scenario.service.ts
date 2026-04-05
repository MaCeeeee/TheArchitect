/**
 * Scenario Comparison Service
 * Delta/overlay model: baseline in Neo4j, deltas in MongoDB, merged at query time.
 */

import { Scenario, IScenario } from '../models/Scenario';
import { computeGraphCentrality, blackScholesCall, changeSaturationMultiplier } from './cost-engine.service';
import { runCypher } from '../config/neo4j';
import type {
  ScenarioDelta,
  ScenarioCostProfile,
  ScenarioComparisonResult,
  McdaWeights,
  McdaCriteriaScores,
  McdaResult,
} from '@thearchitect/shared';

// ─── CRUD ───

export async function createScenario(
  projectId: string,
  name: string,
  description?: string,
  deltas?: ScenarioDelta[],
): Promise<IScenario> {
  const scenario = await Scenario.create({
    projectId,
    name,
    description,
    deltas: deltas || [],
  });

  // Auto-compute cost profile
  const costProfile = await computeScenarioCost(projectId, scenario.deltas);
  scenario.costProfile = costProfile;
  await scenario.save();

  return scenario;
}

export async function listScenarios(projectId: string) {
  return Scenario.find({ projectId }).sort({ createdAt: -1 }).lean();
}

export async function getScenario(projectId: string, scenarioId: string) {
  return Scenario.findOne({ _id: scenarioId, projectId }).lean();
}

export async function deleteScenario(projectId: string, scenarioId: string): Promise<boolean> {
  const result = await Scenario.deleteOne({ _id: scenarioId, projectId });
  return result.deletedCount > 0;
}

export async function updateDeltas(
  projectId: string,
  scenarioId: string,
  deltas: ScenarioDelta[],
): Promise<IScenario | null> {
  const scenario = await Scenario.findOne({ _id: scenarioId, projectId });
  if (!scenario) return null;

  scenario.deltas = deltas as any;

  // Recompute cost profile with new deltas
  const costProfile = await computeScenarioCost(projectId, deltas);
  scenario.costProfile = costProfile as any;
  await scenario.save();

  return scenario;
}

// ─── Cost Computation ───

/**
 * Compute the cost profile for a scenario by applying deltas to the baseline.
 * 1. Fetch baseline cost profiles from cost engine
 * 2. Apply deltas (modify element properties virtually)
 * 3. Recompute affected dimensions
 */
export async function computeScenarioCost(
  projectId: string,
  deltas: ScenarioDelta[],
): Promise<ScenarioCostProfile> {
  // Get baseline cost profiles
  const baselineProfiles = await computeGraphCentrality(projectId);

  // Baseline totals
  const baselineTotalCost = baselineProfiles.reduce((s, p) => s + (p.totalEstimated || 0), 0);
  const baselineP10 = baselineProfiles.reduce((s, p) => s + (p.confidenceLow || (p.totalEstimated || 0) * 0.7), 0);
  const baselineP90 = baselineProfiles.reduce((s, p) => s + (p.confidenceHigh || (p.totalEstimated || 0) * 1.45), 0);

  // Aggregate baseline dimensions
  const baselineDimensions: Record<string, number> = {};
  for (const p of baselineProfiles) {
    if (p.dimensions) {
      for (const [key, val] of Object.entries(p.dimensions)) {
        baselineDimensions[key] = (baselineDimensions[key] || 0) + (val as number || 0);
      }
    }
  }

  if (deltas.length === 0) {
    return {
      totalCost: Math.round(baselineTotalCost),
      dimensions: baselineDimensions,
      p10: Math.round(baselineP10),
      p50: Math.round(baselineTotalCost),
      p90: Math.round(baselineP90),
      deltaFromBaseline: 0,
      deltaPercent: 0,
    };
  }

  // Build a delta map: elementId -> { field -> scenarioValue }
  const deltaMap = new Map<string, Map<string, unknown>>();
  for (const d of deltas) {
    if (!deltaMap.has(d.elementId)) deltaMap.set(d.elementId, new Map());
    deltaMap.get(d.elementId)!.set(d.field, d.scenarioValue);
  }

  // Apply cost impact estimation based on delta types
  let costAdjustment = 0;
  const dimensionAdjustments: Record<string, number> = {};

  for (const [elementId, fields] of deltaMap) {
    const profile = baselineProfiles.find((p) => p.elementId === elementId);
    const elementCost = profile?.totalEstimated || 0;

    for (const [field, newValue] of fields) {
      switch (field) {
        case 'status': {
          // Status changes affect transformation cost
          const statusMultipliers: Record<string, number> = {
            current: 1.0, transitional: 1.15, target: 0.85, retired: 0.10,
          };
          const newMult = statusMultipliers[newValue as string] || 1.0;
          const adjustment = elementCost * (newMult - 1.0);
          costAdjustment += adjustment;
          dimensionAdjustments.applicationTransformation =
            (dimensionAdjustments.applicationTransformation || 0) + adjustment;
          break;
        }
        case 'transformationStrategy': {
          // Strategy changes shift cost model
          const strategyMultipliers: Record<string, number> = {
            retain: 0.05, retire: 0.15, rehost: 0.30, relocate: 0.25,
            replatform: 0.50, repurchase: 0.70, refactor: 1.00,
          };
          const newMult = strategyMultipliers[newValue as string] || 0.50;
          const oldProfile = baselineProfiles.find((p) => p.elementId === elementId);
          const baseCost = oldProfile?.totalEstimated || 0;
          // Strategy change adjusts process and app transformation dimensions
          const adjustment = baseCost * (newMult - 0.50); // delta from average
          costAdjustment += adjustment;
          dimensionAdjustments.process = (dimensionAdjustments.process || 0) + adjustment * 0.4;
          dimensionAdjustments.applicationTransformation =
            (dimensionAdjustments.applicationTransformation || 0) + adjustment * 0.6;
          break;
        }
        case 'annualCost': {
          // Direct cost override
          const oldCost = profile?.totalEstimated || 0;
          const diff = (newValue as number) - oldCost;
          costAdjustment += diff;
          dimensionAdjustments.infrastructure =
            (dimensionAdjustments.infrastructure || 0) + diff;
          break;
        }
        case 'riskLevel': {
          // Risk changes affect risk-adjusted dimension
          const riskMultipliers: Record<string, number> = {
            low: 0.95, medium: 1.0, high: 1.15, critical: 1.35,
          };
          const riskMult = riskMultipliers[newValue as string] || 1.0;
          const adjustment = elementCost * (riskMult - 1.0);
          costAdjustment += adjustment;
          dimensionAdjustments.riskAdjustedFinancial =
            (dimensionAdjustments.riskAdjustedFinancial || 0) + adjustment;
          break;
        }
        case 'userCount': {
          // User count affects training dimension
          const oldUsers = profile ? 50 : 50; // fallback
          const newUsers = newValue as number;
          const trainingCostPerUser = 85 * 8 * 3; // hourlyRate * 8h * 3 days
          const adjustment = (newUsers - oldUsers) * trainingCostPerUser;
          costAdjustment += adjustment;
          dimensionAdjustments.trainingChange =
            (dimensionAdjustments.trainingChange || 0) + adjustment;
          break;
        }
        default:
          // Other field changes: small cost impact estimate
          break;
      }
    }
  }

  const scenarioTotalCost = baselineTotalCost + costAdjustment;
  const scenarioDimensions = { ...baselineDimensions };
  for (const [key, adj] of Object.entries(dimensionAdjustments)) {
    scenarioDimensions[key] = (scenarioDimensions[key] || 0) + adj;
  }

  // Scale P10/P90 proportionally
  const ratio = baselineTotalCost > 0 ? scenarioTotalCost / baselineTotalCost : 1;
  const scenarioP10 = baselineP10 * ratio;
  const scenarioP90 = baselineP90 * ratio;

  return {
    totalCost: Math.round(scenarioTotalCost),
    dimensions: scenarioDimensions,
    p10: Math.round(scenarioP10),
    p50: Math.round(scenarioTotalCost),
    p90: Math.round(scenarioP90),
    deltaFromBaseline: Math.round(costAdjustment),
    deltaPercent: baselineTotalCost > 0 ? Math.round((costAdjustment / baselineTotalCost) * 10000) / 100 : 0,
  };
}

// ─── Compare ───

export async function compareScenarios(
  projectId: string,
  scenarioAId: string,
  scenarioBId: string,
): Promise<ScenarioComparisonResult> {
  // 'baseline' is a special ID meaning current live state (no deltas)
  const [scenarioA, scenarioB] = await Promise.all([
    scenarioAId === 'baseline'
      ? null
      : Scenario.findOne({ _id: scenarioAId, projectId }).lean(),
    scenarioBId === 'baseline'
      ? null
      : Scenario.findOne({ _id: scenarioBId, projectId }).lean(),
  ]);

  const deltasA = scenarioA?.deltas || [];
  const deltasB = scenarioB?.deltas || [];

  const [costA, costB] = await Promise.all([
    computeScenarioCost(projectId, deltasA),
    computeScenarioCost(projectId, deltasB),
  ]);

  // Dimension deltas
  const dimensionDeltas: Record<string, number> = {};
  const allDimKeys = new Set([...Object.keys(costA.dimensions), ...Object.keys(costB.dimensions)]);
  for (const key of allDimKeys) {
    dimensionDeltas[key] = ((costB.dimensions as Record<string, number>)[key] || 0) -
      ((costA.dimensions as Record<string, number>)[key] || 0);
  }

  // Element change counts
  const aElementIds = new Set(deltasA.map((d) => d.elementId));
  const bElementIds = new Set(deltasB.map((d) => d.elementId));
  const onlyInA = [...aElementIds].filter((id) => !bElementIds.has(id)).length;
  const onlyInB = [...bElementIds].filter((id) => !aElementIds.has(id)).length;
  const inBoth = [...aElementIds].filter((id) => bElementIds.has(id)).length;

  // Risk delta: fetch from Neo4j
  let riskDelta = 0;
  try {
    const records = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       RETURN avg(CASE e.riskLevel
         WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 WHEN 'critical' THEN 4
         ELSE 2 END) AS avgRisk`,
      { projectId },
    );
    const avgRisk = records[0]?.get('avgRisk') || 2;
    // Simple risk approximation: deltas that change riskLevel shift the average
    const bRiskDeltas = deltasB.filter((d) => d.field === 'riskLevel');
    const aRiskDeltas = deltasA.filter((d) => d.field === 'riskLevel');
    riskDelta = (bRiskDeltas.length - aRiskDeltas.length) * 0.1;
  } catch {
    // Neo4j might not be available
  }

  return {
    scenarioA: {
      id: scenarioAId,
      name: scenarioA?.name || 'Baseline',
      totalCost: costA.totalCost,
    },
    scenarioB: {
      id: scenarioBId,
      name: scenarioB?.name || 'Baseline',
      totalCost: costB.totalCost,
    },
    costDelta: costB.totalCost - costA.totalCost,
    costDeltaPercent: costA.totalCost > 0
      ? Math.round(((costB.totalCost - costA.totalCost) / costA.totalCost) * 10000) / 100
      : 0,
    dimensionDeltas,
    elementChanges: {
      added: onlyInB,
      removed: onlyInA,
      modified: inBoth,
    },
    riskDelta,
  };
}

// ─── MCDA WSM Ranking ───

export async function rankScenariosMCDA(
  projectId: string,
  scenarioIds: string[],
  weights: McdaWeights = { cost: 0.25, risk: 0.25, agility: 0.20, compliance: 0.15, time: 0.15 },
): Promise<McdaResult> {
  // Fetch all scenarios
  const scenarios = await Scenario.find({
    projectId,
    _id: { $in: scenarioIds },
  }).lean();

  // Compute cost profiles and compliance scores for all
  const profilePromises = scenarios.map(async (sc) => {
    const cost = sc.costProfile || await computeScenarioCost(projectId, sc.deltas);
    let compScore = 0.5;
    try {
      const comp = await computeComplianceCostScore(projectId, String(sc._id), 'dora');
      compScore = comp.score;
    } catch { /* fallback to 0.5 */ }
    return { scenario: sc, cost, compScore };
  });
  const profiledScenarios = await Promise.all(profilePromises);

  if (profiledScenarios.length === 0) {
    return { method: 'wsm', weights, scores: [], ranking: [] };
  }

  // Extract raw criteria values
  const rawScores = profiledScenarios.map((ps) => ({
    id: String(ps.scenario._id),
    name: ps.scenario.name,
    cost: ps.cost.totalCost,
    risk: Math.abs(ps.cost.deltaPercent), // higher delta = more risk
    agility: ps.scenario.deltas.length, // more changes = more agile transformation
    compliance: ps.compScore, // real compliance score from DORA framework
    time: Math.abs(ps.cost.deltaFromBaseline) / (ps.cost.totalCost || 1), // relative effort
  }));

  // Normalize to 0-1 (min-max)
  const normalize = (values: number[], invert: boolean) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((v) => {
      const norm = (v - min) / range;
      return invert ? 1 - norm : norm;
    });
  };

  const costNorm = normalize(rawScores.map((s) => s.cost), true); // lower = better
  const riskNorm = normalize(rawScores.map((s) => s.risk), true);
  const agilityNorm = normalize(rawScores.map((s) => s.agility), false); // higher = better
  const complianceNorm = normalize(rawScores.map((s) => s.compliance), false); // higher = better
  const timeNorm = normalize(rawScores.map((s) => s.time), true);

  // Compute WSM scores
  const scores: McdaCriteriaScores[] = rawScores.map((raw, i) => {
    const weightedScore =
      weights.cost * costNorm[i] +
      weights.risk * riskNorm[i] +
      weights.agility * agilityNorm[i] +
      weights.compliance * complianceNorm[i] +
      weights.time * timeNorm[i];

    return {
      scenarioId: raw.id,
      scenarioName: raw.name,
      cost: Math.round(costNorm[i] * 100) / 100,
      risk: Math.round(riskNorm[i] * 100) / 100,
      agility: Math.round(agilityNorm[i] * 100) / 100,
      compliance: Math.round(complianceNorm[i] * 100) / 100,
      time: Math.round(timeNorm[i] * 100) / 100,
      weightedScore: Math.round(weightedScore * 1000) / 1000,
      rank: 0, // filled below
    };
  });

  // Sort by weighted score descending and assign ranks
  scores.sort((a, b) => b.weightedScore - a.weightedScore);
  scores.forEach((s, i) => { s.rank = i + 1; });

  // Update mcdaScore on each scenario document
  for (const s of scores) {
    await Scenario.updateOne(
      { _id: s.scenarioId },
      { $set: { mcdaScore: s.weightedScore } },
    );
  }

  return {
    method: 'wsm',
    weights,
    scores,
    ranking: scores.map((s) => s.scenarioId),
  };
}

// ─── TOPSIS Ranking ───

export interface TopsisResult {
  method: 'topsis';
  weights: McdaWeights;
  scores: (McdaCriteriaScores & { closeness: number })[];
  ranking: string[];
}

export async function rankScenariosTOPSIS(
  projectId: string,
  scenarioIds: string[],
  weights: McdaWeights = { cost: 0.25, risk: 0.25, agility: 0.20, compliance: 0.15, time: 0.15 },
): Promise<TopsisResult> {
  const scenarios = await Scenario.find({
    projectId,
    _id: { $in: scenarioIds },
  }).lean();

  const profilePromises = scenarios.map(async (sc) => {
    const cost = sc.costProfile || await computeScenarioCost(projectId, sc.deltas);
    const compScore = await computeComplianceCostScore(projectId, String(sc._id), 'dora');
    return { scenario: sc, cost, compScore };
  });
  const profiledScenarios = await Promise.all(profilePromises);

  if (profiledScenarios.length === 0) {
    return { method: 'topsis', weights, scores: [], ranking: [] };
  }

  const criteria = ['cost', 'risk', 'agility', 'compliance', 'time'] as const;
  // cost-type criteria: lower is better → false = benefit, true = cost
  const isCost = [true, true, false, false, true];
  const weightArr = [weights.cost, weights.risk, weights.agility, weights.compliance, weights.time];

  // Raw decision matrix
  const matrix = profiledScenarios.map((ps) => [
    ps.cost.totalCost,
    Math.abs(ps.cost.deltaPercent),
    ps.scenario.deltas.length,
    ps.compScore.score,
    Math.abs(ps.cost.deltaFromBaseline) / (ps.cost.totalCost || 1),
  ]);

  // Step 1: Normalize (vector normalization)
  const n = matrix.length;
  const m = criteria.length;
  const colNorms: number[] = [];
  for (let j = 0; j < m; j++) {
    const sumSq = matrix.reduce((s, row) => s + row[j] * row[j], 0);
    colNorms.push(Math.sqrt(sumSq) || 1);
  }

  const normalized = matrix.map((row) =>
    row.map((val, j) => (val / colNorms[j]) * weightArr[j])
  );

  // Step 2: Ideal best and worst
  const idealBest: number[] = [];
  const idealWorst: number[] = [];
  for (let j = 0; j < m; j++) {
    const col = normalized.map((row) => row[j]);
    if (isCost[j]) {
      idealBest.push(Math.min(...col));
      idealWorst.push(Math.max(...col));
    } else {
      idealBest.push(Math.max(...col));
      idealWorst.push(Math.min(...col));
    }
  }

  // Step 3: Distance to ideal best/worst
  const distBest = normalized.map((row) =>
    Math.sqrt(row.reduce((s, v, j) => s + (v - idealBest[j]) ** 2, 0))
  );
  const distWorst = normalized.map((row) =>
    Math.sqrt(row.reduce((s, v, j) => s + (v - idealWorst[j]) ** 2, 0))
  );

  // Step 4: Closeness coefficient
  const closeness = distBest.map((db, i) => {
    const total = db + distWorst[i];
    return total > 0 ? distWorst[i] / total : 0;
  });

  // Build scores
  const scores = profiledScenarios.map((ps, i) => ({
    scenarioId: String(ps.scenario._id),
    scenarioName: ps.scenario.name,
    cost: Math.round((1 - normalized[i][0] / (Math.max(...normalized.map((r) => r[0])) || 1)) * 100) / 100,
    risk: Math.round((1 - normalized[i][1] / (Math.max(...normalized.map((r) => r[1])) || 1)) * 100) / 100,
    agility: Math.round((normalized[i][2] / (Math.max(...normalized.map((r) => r[2])) || 1)) * 100) / 100,
    compliance: Math.round((normalized[i][3] / (Math.max(...normalized.map((r) => r[3])) || 1)) * 100) / 100,
    time: Math.round((1 - normalized[i][4] / (Math.max(...normalized.map((r) => r[4])) || 1)) * 100) / 100,
    weightedScore: Math.round(closeness[i] * 1000) / 1000,
    closeness: Math.round(closeness[i] * 1000) / 1000,
    rank: 0,
  }));

  scores.sort((a, b) => b.closeness - a.closeness);
  scores.forEach((s, i) => { s.rank = i + 1; });

  return {
    method: 'topsis',
    weights,
    scores,
    ranking: scores.map((s) => s.scenarioId),
  };
}

// ─── Compliance Cost Scoring ───

export interface ComplianceCostResult {
  framework: string;
  score: number;             // 0-1 (1 = fully compliant)
  gapCount: number;
  estimatedPenalty: number;  // EUR
  estimatedRemediationCost: number;
  details: { area: string; status: 'compliant' | 'partial' | 'non-compliant'; penalty: number }[];
}

const COMPLIANCE_FRAMEWORKS: Record<string, { areas: string[]; basePenalty: number; description: string }> = {
  dora: {
    areas: ['ICT Risk Management', 'Incident Reporting', 'Digital Resilience Testing', 'Third-Party Risk', 'Info Sharing'],
    basePenalty: 500000,
    description: 'Digital Operational Resilience Act',
  },
  nis2: {
    areas: ['Risk Management', 'Incident Handling', 'Business Continuity', 'Supply Chain Security', 'Encryption', 'Access Control', 'Vulnerability Management'],
    basePenalty: 10000000,
    description: 'Network and Information Security Directive 2',
  },
  kritis: {
    areas: ['Availability', 'Integrity', 'Confidentiality', 'Resilience', 'Incident Response', 'IT-SiG 2.0 Compliance'],
    basePenalty: 2000000,
    description: 'Critical Infrastructure Protection (Germany)',
  },
};

export async function computeComplianceCostScore(
  projectId: string,
  scenarioId: string,
  framework: 'dora' | 'nis2' | 'kritis',
): Promise<ComplianceCostResult> {
  const fw = COMPLIANCE_FRAMEWORKS[framework];
  if (!fw) {
    return { framework, score: 0, gapCount: 0, estimatedPenalty: 0, estimatedRemediationCost: 0, details: [] };
  }

  // Fetch scenario deltas
  const scenario = scenarioId !== 'baseline'
    ? await Scenario.findById(scenarioId).lean()
    : null;
  const deltas = scenario?.deltas || [];

  // Fetch project's compliance state from Neo4j
  let complianceElements = 0;
  let totalElements = 0;
  let securityElements = 0;
  try {
    const records = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       RETURN count(e) AS total,
              count(CASE WHEN e.status = 'target' THEN 1 END) AS targetCount,
              count(CASE WHEN e.type IN ['TechnologyService', 'TechnologyInterface', 'SystemSoftware', 'Node', 'Device', 'CommunicationNetwork'] THEN 1 END) AS techCount`,
      { projectId },
    );
    totalElements = records[0]?.get('total')?.low ?? records[0]?.get('total') ?? 0;
    const targetCount = records[0]?.get('targetCount')?.low ?? records[0]?.get('targetCount') ?? 0;
    securityElements = records[0]?.get('techCount')?.low ?? records[0]?.get('techCount') ?? 0;
    complianceElements = targetCount; // target-state elements are considered more compliant
  } catch {
    // Neo4j unavailable
  }

  // Heuristic compliance scoring per area
  const baseCompliance = totalElements > 0 ? Math.min(complianceElements / totalElements, 1) : 0.3;
  const techRatio = totalElements > 0 ? securityElements / totalElements : 0.2;

  // Deltas that improve compliance
  const improvingDeltas = deltas.filter((d) =>
    d.field === 'status' && d.scenarioValue === 'target' ||
    d.field === 'riskLevel' && ['low', 'medium'].includes(d.scenarioValue as string)
  ).length;

  const deltaBoost = Math.min(improvingDeltas * 0.05, 0.3);

  const details = fw.areas.map((area, i) => {
    // Vary compliance per area based on heuristics
    const areaBase = baseCompliance + deltaBoost + (techRatio * (i % 2 === 0 ? 0.1 : -0.05));
    const areaScore = Math.max(0, Math.min(1, areaBase + (Math.random() * 0.1 - 0.05)));

    let status: 'compliant' | 'partial' | 'non-compliant';
    if (areaScore >= 0.8) status = 'compliant';
    else if (areaScore >= 0.4) status = 'partial';
    else status = 'non-compliant';

    const penalty = status === 'non-compliant' ? fw.basePenalty / fw.areas.length :
      status === 'partial' ? fw.basePenalty / fw.areas.length * 0.3 : 0;

    return { area, status, penalty: Math.round(penalty) };
  });

  const gapCount = details.filter((d) => d.status !== 'compliant').length;
  const score = Math.round((1 - gapCount / fw.areas.length) * 100) / 100;
  const estimatedPenalty = details.reduce((s, d) => s + d.penalty, 0);
  const estimatedRemediationCost = Math.round(gapCount * 50000); // ~50K per gap remediation

  return {
    framework,
    score,
    gapCount,
    estimatedPenalty,
    estimatedRemediationCost,
    details,
  };
}

// ─── AI Variant Generation ───

export async function generateAIVariants(
  projectId: string,
  scenarioId: string,
  count: number = 3,
): Promise<IScenario[]> {
  // Get the source scenario
  const source = scenarioId !== 'baseline'
    ? await Scenario.findOne({ _id: scenarioId, projectId }).lean()
    : null;

  // Get project elements for context
  const profiles = await computeGraphCentrality(projectId);
  const topElements = profiles.slice(0, 20);

  // Strategy permutations for generating variants
  const strategies = ['retain', 'retire', 'rehost', 'relocate', 'replatform', 'repurchase', 'refactor'];
  const riskLevels = ['low', 'medium', 'high'];
  const statuses = ['current', 'target', 'transitional', 'retired'];

  const variants: IScenario[] = [];

  // Generate variant strategies
  const variantTemplates = [
    { name: 'Cost-Optimized', bias: 'cheapest', strategyPreference: ['retain', 'retire', 'rehost'] },
    { name: 'Cloud-First', bias: 'cloud', strategyPreference: ['replatform', 'repurchase', 'rehost'] },
    { name: 'Modernize All', bias: 'modern', strategyPreference: ['refactor', 'repurchase', 'replatform'] },
    { name: 'Risk-Averse', bias: 'safe', strategyPreference: ['retain', 'rehost', 'relocate'] },
    { name: 'Aggressive Retire', bias: 'retire', strategyPreference: ['retire', 'repurchase', 'retain'] },
  ];

  const templatesToUse = variantTemplates.slice(0, Math.min(count, variantTemplates.length));

  for (const template of templatesToUse) {
    const deltas: ScenarioDelta[] = [];

    for (const el of topElements) {
      // Apply strategy bias
      const strategyIdx = Math.floor(Math.random() * template.strategyPreference.length);
      const newStrategy = template.strategyPreference[strategyIdx];

      deltas.push({
        elementId: el.elementId,
        field: 'transformationStrategy',
        baselineValue: 'retain',
        scenarioValue: newStrategy,
      });

      // Apply status changes based on bias
      if (template.bias === 'retire' && Math.random() > 0.6) {
        deltas.push({
          elementId: el.elementId,
          field: 'status',
          baselineValue: 'current',
          scenarioValue: 'retired',
        });
      } else if (template.bias === 'modern' && Math.random() > 0.4) {
        deltas.push({
          elementId: el.elementId,
          field: 'status',
          baselineValue: 'current',
          scenarioValue: 'target',
        });
      }

      // Risk adjustments
      if (template.bias === 'safe') {
        deltas.push({
          elementId: el.elementId,
          field: 'riskLevel',
          baselineValue: 'high',
          scenarioValue: 'low',
        });
      }
    }

    const sourceName = source?.name || 'Baseline';
    const scenario = await Scenario.create({
      projectId,
      name: `${template.name} (AI from ${sourceName})`,
      description: `AI-generated variant: ${template.bias} optimization strategy applied to top ${topElements.length} elements`,
      deltas,
    });

    // Compute cost profile
    const costProfile = await computeScenarioCost(projectId, deltas);
    scenario.costProfile = costProfile as any;
    await scenario.save();

    variants.push(scenario);
  }

  return variants;
}

// ─── Real Options Analysis for Scenario ───

export interface ScenarioRealOptionsResult {
  scenarioId: string;
  scenarioName: string;
  callValue: number;
  deferValue: number;
  recommendation: 'proceed' | 'defer' | 'abandon';
  parameters: { S: number; K: number; T: number; r: number; sigma: number };
}

export async function analyzeScenarioRealOptions(
  projectId: string,
  scenarioId: string,
  timeToExpiry: number = 2,         // years
  riskFreeRate: number = 0.03,      // 3%
  volatility: number = 0.30,        // 30%
): Promise<ScenarioRealOptionsResult> {
  const scenario = await Scenario.findOne({ _id: scenarioId, projectId }).lean();
  if (!scenario) {
    throw new Error('Scenario not found');
  }

  const costProfile = scenario.costProfile || await computeScenarioCost(projectId, scenario.deltas);

  // S = expected benefit (rough: saved cost if transformation succeeds)
  // K = transformation cost (exercise price)
  const K = costProfile.totalCost;
  const S = K * 1.3; // assume 30% ROI on transformation (can be parameterized)

  const result = blackScholesCall(S, K, timeToExpiry, riskFreeRate, volatility);

  return {
    scenarioId: String(scenario._id),
    scenarioName: scenario.name,
    callValue: result.callValue,
    deferValue: result.deferValue,
    recommendation: result.recommendation,
    parameters: { S, K, T: timeToExpiry, r: riskFreeRate, sigma: volatility },
  };
}
