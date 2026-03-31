import { runCypher } from '../config/neo4j';
import { assessRisk, estimateCosts } from './analytics.service';
import { checkCompliance } from './compliance.service';
import { propagateCascadeRisk, kolmogorovSmirnovTest, getThresholds } from './stochastic.service';
import { SimulationRun } from '../models/SimulationRun';
import { ArchitectureSnapshot } from '../models/ArchitectureSnapshot';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import type {
  AdvisorInsight,
  AdvisorScanResult,
  HealthScore,
  HealthScoreFactor,
  InsightSeverity,
  AffectedElement,
  RoadmapStrategy,
} from '@thearchitect/shared';

// ─── Element Shape from Neo4j ───

interface GraphElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  status: string;
  riskLevel: string;
  maturity: number;
  description: string;
  updatedAt: string;
  inDegree: number;
  outDegree: number;
}

// ─── Full Advisor Scan ───

export async function runAdvisorScan(projectId: string): Promise<AdvisorScanResult> {
  const start = Date.now();

  // Fetch all elements with degrees in a single query
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     OPTIONAL MATCH (e)-[out]->()
     OPTIONAL MATCH ()-[inc]->(e)
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.status as status, e.riskLevel as riskLevel,
            e.maturityLevel as maturity, e.description as description,
            e.updatedAt as updatedAt,
            count(DISTINCT out) as outDegree, count(DISTINCT inc) as inDegree`,
    { projectId },
  );

  const elements: GraphElement[] = records.map((r) => ({
    id: r.get('id'),
    name: r.get('name') || '',
    type: r.get('type') || '',
    layer: r.get('layer') || '',
    status: r.get('status') || 'current',
    riskLevel: r.get('riskLevel') || 'low',
    maturity: r.get('maturity')?.toNumber?.() || 3,
    description: r.get('description') || '',
    updatedAt: r.get('updatedAt') || '',
    inDegree: r.get('inDegree')?.toNumber?.() || 0,
    outDegree: r.get('outDegree')?.toNumber?.() || 0,
  }));

  // Run all detectors in parallel
  const [
    spofInsights,
    orphanInsights,
    cycleInsights,
    complianceInsights,
    staleInsights,
    riskConcInsights,
    costInsights,
    maturityInsights,
    mirofishInsights,
    cascadeInsights,
    driftInsights,
    missingComplianceInsights,
    timeInsights,
  ] = await Promise.all([
    detectSPOF(elements),
    detectOrphans(elements),
    detectCycles(projectId),
    detectComplianceIssues(projectId),
    detectStaleTransitions(elements),
    detectRiskConcentration(elements),
    detectCostHotspots(projectId),
    detectMaturityGaps(elements),
    detectMiroFishConflicts(projectId),
    detectCascadeRisks(projectId, elements),
    detectArchitectureDrift(projectId, elements),
    detectMissingComplianceElements(projectId),
    detectTIMEClassificationIssues(elements),
  ]);

  const allInsights = [
    ...spofInsights,
    ...orphanInsights,
    ...cycleInsights,
    ...complianceInsights,
    ...staleInsights,
    ...riskConcInsights,
    ...costInsights,
    ...maturityInsights,
    ...mirofishInsights,
    ...cascadeInsights,
    ...driftInsights,
    ...missingComplianceInsights,
    ...timeInsights,
  ];

  // Sort by severity priority, then by affected elements count
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, high: 1, warning: 2, info: 3 };
  allInsights.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return b.affectedElements.length - a.affectedElements.length;
  });

  // Limit to top 20
  const insights = allInsights.slice(0, 20);

  // Calculate health score
  const healthScore = await calculateHealthScore(projectId, elements, insights);

  return {
    projectId,
    healthScore,
    insights,
    totalElements: elements.length,
    scanDurationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
}

// ─── Health Score Calculator ───

async function calculateHealthScore(
  projectId: string,
  elements: GraphElement[],
  insights: AdvisorInsight[],
): Promise<HealthScore> {
  if (elements.length === 0) {
    return {
      total: 100,
      trend: 'stable',
      trendDelta: 0,
      factors: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Factor 1: Dependency Risk (30%) — inverse of average risk score
  let riskScore = 100;
  try {
    const risk = await assessRisk(projectId);
    if (risk.summary.total > 0) {
      riskScore = Math.max(0, 100 - (risk.summary.averageScore / 10) * 100);
    }
  } catch { /* neo4j down — default to 100 */ }

  // Factor 2: Compliance (25%)
  let complianceScore = 100;
  try {
    const compliance = await checkCompliance(projectId);
    complianceScore = compliance.summary.complianceScore;
  } catch { /* no policies — default to 100 */ }

  // Factor 3: Redundancy / Orphans (20%)
  const orphanCount = elements.filter((e) => e.inDegree === 0 && e.outDegree === 0).length;
  const redundancyScore = elements.length > 0
    ? Math.max(0, 100 - (orphanCount / elements.length) * 200) // 50% orphans = 0
    : 100;

  // Factor 4: Lifecycle Health (15%)
  const retiredActive = elements.filter((e) => e.status === 'retired' && (e.inDegree > 0 || e.outDegree > 0)).length;
  const staleTransitional = elements.filter((e) => {
    if (e.status !== 'transitional') return false;
    const updated = new Date(e.updatedAt).getTime();
    return !isNaN(updated) && Date.now() - updated > 90 * 86400000;
  }).length;
  const lifecycleIssues = retiredActive + staleTransitional;
  const lifecycleScore = elements.length > 0
    ? Math.max(0, 100 - (lifecycleIssues / elements.length) * 300)
    : 100;

  // Factor 5: Cost Efficiency (10%)
  let costScore = 100;
  try {
    const costs = await estimateCosts(projectId);
    if (costs.totalCost > 0) {
      costScore = Math.max(0, 100 - (costs.optimizationTotal / costs.totalCost) * 100);
    }
  } catch { /* default */ }

  const factors: HealthScoreFactor[] = [
    { factor: 'Dependency Risk', weight: 0.30, score: Math.round(riskScore), description: 'Average risk across all elements' },
    { factor: 'Compliance', weight: 0.25, score: Math.round(complianceScore), description: 'Policy adherence rate' },
    { factor: 'Connectivity', weight: 0.20, score: Math.round(redundancyScore), description: 'Orphaned elements penalty' },
    { factor: 'Lifecycle Health', weight: 0.15, score: Math.round(lifecycleScore), description: 'Stale transitions & active retired' },
    { factor: 'Cost Efficiency', weight: 0.10, score: Math.round(costScore), description: 'Optimization potential ratio' },
  ];

  const total = Math.round(factors.reduce((sum, f) => sum + f.weight * f.score, 0));

  return {
    total,
    trend: 'stable', // Would compare with previous snapshot; for now, stable
    trendDelta: 0,
    factors,
    timestamp: new Date().toISOString(),
  };
}

// ─── Detector 1: Single Point of Failure ───

function detectSPOF(elements: GraphElement[]): AdvisorInsight[] {
  const insights: AdvisorInsight[] = [];
  const spofs = elements.filter((e) => e.inDegree > 4);

  for (const el of spofs.slice(0, 3)) {
    insights.push({
      id: `spof-${el.id}`,
      category: 'single_point_of_failure',
      severity: el.inDegree > 8 ? 'critical' : 'high',
      title: `Single Point of Failure: ${el.name}`,
      description: `${el.name} has ${el.inDegree} dependents but no redundancy detected. If this component fails, ${el.inDegree} systems are affected.`,
      affectedElements: [toAffected(el)],
      suggestedAction: {
        type: 'edit_field',
        label: 'Review dependencies',
        elementId: el.id,
      },
      effort: 'high',
      impact: 'high',
    });
  }
  return insights;
}

// ─── Detector 2: Orphan Elements ───

function detectOrphans(elements: GraphElement[]): AdvisorInsight[] {
  const orphans = elements.filter((e) => e.inDegree === 0 && e.outDegree === 0);
  if (orphans.length === 0) return [];

  return [{
    id: 'orphans',
    category: 'orphan_elements',
    severity: orphans.length > 5 ? 'warning' : 'info',
    title: `${orphans.length} orphaned element${orphans.length > 1 ? 's' : ''} detected`,
    description: `These elements have no connections. They may be unused or missing relationships.`,
    affectedElements: orphans.slice(0, 10).map(toAffected),
    suggestedAction: orphans.length > 0 ? {
      type: 'retire_element',
      label: 'Archive orphans',
      elementId: orphans[0].id,
    } : undefined,
    effort: 'low',
    impact: 'medium',
  }];
}

// ─── Detector 3: Circular Dependencies ───

async function detectCycles(projectId: string): Promise<AdvisorInsight[]> {
  try {
    const records = await runCypher(
      `MATCH path = (e:ArchitectureElement {projectId: $projectId})-[*2..6]->(e)
       WITH [node IN nodes(path) | {id: node.id, name: node.name, type: node.type, layer: node.layer}] as cycle
       RETURN cycle LIMIT 3`,
      { projectId },
    );

    return records.map((r, i) => {
      const cycle = r.get('cycle') as AffectedElement[];
      const names = cycle.map((c) => c.name).join(' → ');
      return {
        id: `cycle-${i}`,
        category: 'circular_dependency' as const,
        severity: 'high' as const,
        title: `Circular dependency detected`,
        description: `Cycle: ${names}. Circular dependencies create tight coupling and make changes risky.`,
        affectedElements: cycle.map((c) => ({
          elementId: c.elementId || (c as unknown as Record<string, string>).id,
          name: c.name,
          type: c.type,
          layer: c.layer,
        })),
      };
    });
  } catch {
    return [];
  }
}

// ─── Detector 4: Compliance Violations ───

async function detectComplianceIssues(projectId: string): Promise<AdvisorInsight[]> {
  try {
    const report = await checkCompliance(projectId);
    if (report.summary.errors === 0 && report.summary.warnings === 0) return [];

    const errorViolations = report.violations.filter((v) => v.severity === 'error');
    const warningViolations = report.violations.filter((v) => v.severity === 'warning');

    const insights: AdvisorInsight[] = [];

    if (errorViolations.length > 0) {
      insights.push({
        id: 'compliance-errors',
        category: 'compliance_violation',
        severity: 'high',
        title: `${errorViolations.length} compliance error${errorViolations.length > 1 ? 's' : ''}`,
        description: `Policy violations requiring immediate attention: ${[...new Set(errorViolations.map((v) => v.policyName))].join(', ')}`,
        affectedElements: errorViolations.slice(0, 5).map((v) => ({
          elementId: v.elementId,
          name: v.elementName,
          type: v.elementType,
          layer: '',
        })),
        effort: 'low',
        impact: 'high',
      });
    }

    if (warningViolations.length > 0) {
      insights.push({
        id: 'compliance-warnings',
        category: 'compliance_violation',
        severity: 'warning',
        title: `${warningViolations.length} compliance warning${warningViolations.length > 1 ? 's' : ''}`,
        description: `Non-critical policy issues found across ${[...new Set(warningViolations.map((v) => v.elementName))].length} elements.`,
        affectedElements: warningViolations.slice(0, 5).map((v) => ({
          elementId: v.elementId,
          name: v.elementName,
          type: v.elementType,
          layer: '',
        })),
        effort: 'low',
        impact: 'medium',
      });
    }

    return insights;
  } catch {
    return [];
  }
}

// ─── Detector 5: Stale Transitions ───

function detectStaleTransitions(elements: GraphElement[]): AdvisorInsight[] {
  const now = Date.now();
  const stale = elements.filter((e) => {
    if (e.status !== 'transitional') return false;
    const updated = new Date(e.updatedAt).getTime();
    return !isNaN(updated) && now - updated > 90 * 86400000; // 90 days
  });

  if (stale.length === 0) return [];

  return [{
    id: 'stale-transitions',
    category: 'stale_transition',
    severity: 'warning',
    title: `${stale.length} stale transition${stale.length > 1 ? 's' : ''} (>90 days)`,
    description: `Elements stuck in transitional status for over 90 days. Migration may be blocked or abandoned.`,
    affectedElements: stale.slice(0, 5).map(toAffected),
    suggestedAction: stale.length > 0 ? {
      type: 'update_status',
      label: 'Update status',
      elementId: stale[0].id,
    } : undefined,
    effort: 'low',
    impact: 'medium',
  }];
}

// ─── Detector 6: Risk Concentration ───

function detectRiskConcentration(elements: GraphElement[]): AdvisorInsight[] {
  const insights: AdvisorInsight[] = [];
  const layers = [...new Set(elements.map((e) => e.layer))];

  for (const layer of layers) {
    const layerElements = elements.filter((e) => e.layer === layer);
    const highRisk = layerElements.filter((e) => e.riskLevel === 'high' || e.riskLevel === 'critical');
    const ratio = layerElements.length > 0 ? highRisk.length / layerElements.length : 0;

    if (ratio > 0.6 && highRisk.length >= 3) {
      insights.push({
        id: `risk-conc-${layer}`,
        category: 'risk_concentration',
        severity: 'high',
        title: `Risk concentration in ${layer} layer`,
        description: `${highRisk.length} of ${layerElements.length} elements (${Math.round(ratio * 100)}%) in the ${layer} layer are high/critical risk.`,
        affectedElements: highRisk.slice(0, 5).map(toAffected),
        effort: 'medium',
        impact: 'high',
      });
    }
  }

  return insights;
}

// ─── Detector 7: Cost Hotspots ───

async function detectCostHotspots(projectId: string): Promise<AdvisorInsight[]> {
  try {
    const costs = await estimateCosts(projectId);
    if (costs.totalCost === 0) return [];

    const topOptimizable = costs.elements
      .filter((e) => e.optimizationPotential > 0)
      .sort((a, b) => b.optimizationPotential - a.optimizationPotential)
      .slice(0, 3);

    if (topOptimizable.length === 0) return [];

    const totalOpt = topOptimizable.reduce((s, e) => s + e.optimizationPotential, 0);
    const pct = Math.round((totalOpt / costs.totalCost) * 100);

    return [{
      id: 'cost-hotspots',
      category: 'cost_hotspot',
      severity: pct > 30 ? 'warning' : 'info',
      title: `€${(totalOpt / 1000).toFixed(0)}K optimization potential (${pct}% of TCO)`,
      description: `Top candidates: ${topOptimizable.map((e) => `${e.name} (€${(e.optimizationPotential / 1000).toFixed(0)}K)`).join(', ')}`,
      affectedElements: topOptimizable.map((e) => ({
        elementId: e.elementId,
        name: e.name,
        type: e.type,
        layer: '',
      })),
      effort: 'medium',
      impact: 'medium',
    }];
  } catch {
    return [];
  }
}

// ─── Detector 8: Maturity Gaps ───

function detectMaturityGaps(elements: GraphElement[]): AdvisorInsight[] {
  const lowMaturity = elements.filter((e) => e.maturity <= 2 && e.status === 'current');
  if (lowMaturity.length === 0) return [];

  return [{
    id: 'maturity-gaps',
    category: 'maturity_gap',
    severity: lowMaturity.length > 5 ? 'warning' : 'info',
    title: `${lowMaturity.length} production system${lowMaturity.length > 1 ? 's' : ''} with low maturity`,
    description: `Active systems with maturity level ≤2 need review. Low maturity increases operational risk.`,
    affectedElements: lowMaturity.slice(0, 5).map(toAffected),
    effort: 'medium',
    impact: 'medium',
  }];
}

// ─── Detector 9: MiroFish Conflicts ───

async function detectMiroFishConflicts(projectId: string): Promise<AdvisorInsight[]> {
  try {
    const latestRun = await SimulationRun.findOne(
      { projectId, status: 'completed' },
      { rounds: 1, result: 1, config: 1 },
    ).sort({ createdAt: -1 }).lean();

    if (!latestRun?.result) return [];

    const result = latestRun.result as Record<string, unknown>;
    const emergenceMetrics = result.emergenceMetrics as Record<string, number> | undefined;
    const fatigueReport = result.fatigueReport as Record<string, unknown> | undefined;

    const insights: AdvisorInsight[] = [];

    if (emergenceMetrics && emergenceMetrics.deadlockCount > 0) {
      insights.push({
        id: 'mirofish-deadlocks',
        category: 'mirofish_conflict',
        severity: emergenceMetrics.deadlockCount >= 3 ? 'high' : 'warning',
        title: `${emergenceMetrics.deadlockCount} deadlock${emergenceMetrics.deadlockCount > 1 ? 's' : ''} in last simulation`,
        description: `Stakeholders could not reach agreement. ${fatigueReport?.recommendation || 'Consider adjusting constraints or involving mediators.'}`,
        affectedElements: [],
        effort: 'medium',
        impact: 'high',
      });
    }

    if (fatigueReport) {
      const rating = fatigueReport.rating as string;
      if (rating === 'red' || rating === 'orange') {
        insights.push({
          id: 'mirofish-fatigue',
          category: 'mirofish_conflict',
          severity: rating === 'red' ? 'high' : 'warning',
          title: `High simulation fatigue (${rating})`,
          description: fatigueReport.recommendation as string || 'Simulation shows significant stakeholder resistance.',
          affectedElements: [],
          effort: 'high',
          impact: 'high',
        });
      }
    }

    return insights;
  } catch {
    return [];
  }
}

// ─── Detector 10: Cascade Risk (Bayesian Propagation) ───

async function detectCascadeRisks(
  projectId: string,
  elements: GraphElement[],
  strategy: RoadmapStrategy = 'balanced',
): Promise<AdvisorInsight[]> {
  try {
    const thresholds = getThresholds(strategy);
    const insights: AdvisorInsight[] = [];

    // Check top hub elements (highest inDegree) for cascade potential
    const hubs = elements
      .filter((e) => e.inDegree >= 3)
      .sort((a, b) => b.inDegree - a.inDegree)
      .slice(0, 5);

    for (const hub of hubs) {
      const result = await propagateCascadeRisk(projectId, hub.id);
      if (result.maxCascadeProbability <= thresholds.cascadeHighThreshold) continue;

      const severity: InsightSeverity =
        result.maxCascadeProbability > thresholds.cascadeCriticalThreshold ? 'critical' : 'high';

      const topAffected = result.affectedElements.slice(0, 3);
      const pctStr = (p: number) => `${(p * 100).toFixed(1)}%`;

      insights.push({
        id: `cascade-${hub.id}`,
        category: 'cascade_risk',
        severity,
        title: `Cascade risk from ${hub.name}`,
        description: topAffected
          .map((a) => `${hub.name} failure increases ${a.name} failure probability to ${pctStr(a.conditionalProbability)}`)
          .join('. '),
        affectedElements: [
          toAffected(hub),
          ...topAffected.map((a) => ({
            elementId: a.elementId,
            name: a.name,
            type: '',
            layer: '',
          })),
        ],
        suggestedAction: {
          type: 'add_connection' as const,
          label: 'Add redundancy',
          elementId: hub.id,
        },
        effort: 'high',
        impact: 'high',
      });
    }

    return insights.slice(0, 3);
  } catch {
    return [];
  }
}

// ─── Detector 11: Architecture Drift (K-S Test) ───

async function detectArchitectureDrift(
  projectId: string,
  elements: GraphElement[],
): Promise<AdvisorInsight[]> {
  try {
    // Get latest baseline snapshot
    const baseline = await ArchitectureSnapshot.findOne(
      { projectId, type: 'baseline' },
      {},
      { sort: { createdAt: -1 } },
    );

    if (!baseline) return []; // No baseline yet, nothing to compare

    // Build current distributions
    const currentDegrees = elements.map((e) => e.inDegree + e.outDegree);
    const riskMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const currentRisks = elements.map((e) => riskMap[e.riskLevel] || 1);

    const insights: AdvisorInsight[] = [];

    // K-S test on degree distribution
    if (baseline.degreeDistribution.length >= 5 && currentDegrees.length >= 5) {
      const ksResult = kolmogorovSmirnovTest(baseline.degreeDistribution, currentDegrees);

      if (ksResult.significant) {
        const severity: InsightSeverity = ksResult.pValue < 0.01 ? 'critical' : 'high';
        insights.push({
          id: 'drift-degree',
          category: 'architecture_drift',
          severity,
          title: 'Architecture topology drift detected',
          description: `Connection patterns have shifted significantly since last baseline (D=${ksResult.statistic.toFixed(3)}, p=${ksResult.pValue.toFixed(4)}). This may indicate unplanned structural changes.`,
          affectedElements: [],
          effort: 'medium',
          impact: 'high',
        });
      }
    }

    // K-S test on risk score distribution
    if (baseline.riskScoreDistribution.length >= 5 && currentRisks.length >= 5) {
      const ksResult = kolmogorovSmirnovTest(baseline.riskScoreDistribution, currentRisks);

      if (ksResult.significant) {
        const severity: InsightSeverity = ksResult.pValue < 0.01 ? 'critical' : 'high';
        insights.push({
          id: 'drift-risk',
          category: 'architecture_drift',
          severity,
          title: 'Risk profile drift detected',
          description: `Risk distribution has changed significantly since last baseline (D=${ksResult.statistic.toFixed(3)}, p=${ksResult.pValue.toFixed(4)}). Review recent changes for unintended risk increases.`,
          affectedElements: [],
          effort: 'medium',
          impact: 'high',
        });
      }
    }

    return insights;
  } catch {
    return [];
  }
}

// ─── Detector #12: Missing Compliance Elements (REQ-CDTP-025) ───

async function detectMissingComplianceElements(projectId: string): Promise<AdvisorInsight[]> {
  try {
    const standards = await Standard.find({ projectId });
    if (standards.length === 0) return [];

    const insights: AdvisorInsight[] = [];

    for (const standard of standards) {
      const totalSections = standard.sections.length;
      if (totalSections === 0) continue;

      const mappings = await StandardMapping.find({ projectId, standardId: String(standard._id) });
      const mappedSectionIds = new Set(mappings.map((m) => m.sectionId));
      const unmappedCount = standard.sections.filter((s) => !mappedSectionIds.has(s.id)).length;
      const unmappedPercent = Math.round((unmappedCount / totalSections) * 100);

      if (unmappedPercent > 20) {
        const severity: InsightSeverity = unmappedPercent > 50 ? 'critical' : unmappedPercent > 35 ? 'high' : 'warning';
        insights.push({
          id: `missing-compliance-${standard._id}`,
          category: 'missing_compliance_element',
          severity,
          title: `${standard.name}: ${unmappedPercent}% sections unmapped`,
          description: `${unmappedCount} of ${totalSections} sections in "${standard.name}" have no architecture element mapping. This indicates significant compliance gaps that need new elements or explicit mappings.`,
          affectedElements: [],
          effort: unmappedCount > 10 ? 'high' : 'medium',
          impact: 'high',
        });
      }
    }

    return insights;
  } catch {
    return [];
  }
}

// ─── Detector #13: TIME Classification Issues ───

function detectTIMEClassificationIssues(elements: GraphElement[]): AdvisorInsight[] {
  const insights: AdvisorInsight[] = [];

  // Find elements that should be classified but aren't
  const appAndTechTypes = new Set([
    'application', 'application_component', 'application_service', 'service',
    'node', 'device', 'system_software', 'technology_service', 'platform_service',
    'technology_component', 'infrastructure',
  ]);

  const classifiable = elements.filter(e => appAndTechTypes.has(e.type));
  // We don't have timeClassification in GraphElement — detect elements that
  // are high-risk + low-maturity (candidates for "eliminate" or "migrate")
  const eliminateCandidates = classifiable.filter(
    e => (e.riskLevel === 'critical' || e.riskLevel === 'high') && e.maturity <= 2
  );

  if (eliminateCandidates.length > 0) {
    insights.push({
      id: `time-eliminate-${Date.now()}`,
      title: 'High-risk, low-maturity components detected',
      description: `${eliminateCandidates.length} application/technology element(s) combine high risk with low maturity — consider marking for elimination or migration in the TIME classification.`,
      severity: 'warning' as InsightSeverity,
      category: 'portfolio',
      recommendation: 'Open Portfolio → TIME Grid to review and classify these elements.',
      affectedElements: eliminateCandidates.slice(0, 5).map(toAffected),
      effort: 'medium',
    });
  }

  // Detect stale "operate" elements with high risk
  const staleOperators = classifiable.filter(
    e => e.status === 'current' && e.riskLevel === 'high' && e.maturity >= 3
  );

  if (staleOperators.length >= 3) {
    insights.push({
      id: `time-migrate-${Date.now()}`,
      title: 'Stable but risky components — migration candidates',
      description: `${staleOperators.length} components are mature (3+) but carry high risk — migration to modern alternatives may reduce risk.`,
      severity: 'info' as InsightSeverity,
      category: 'portfolio',
      recommendation: 'Consider TIME classification "Migrate" for these elements.',
      affectedElements: staleOperators.slice(0, 5).map(toAffected),
      effort: 'medium',
    });
  }

  return insights;
}

// ─── Helpers ───

function toAffected(el: GraphElement): AffectedElement {
  return {
    elementId: el.id,
    name: el.name,
    type: el.type,
    layer: el.layer,
  };
}
