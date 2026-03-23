import { runCypher } from '../config/neo4j';
import {
  assessRisk, estimateCosts, runMonteCarloSimulation, computeTopologyBatch,
  getN8nNodeCategory, getN8nEffortHours,
  RiskAssessment, CostEstimate,
} from './analytics.service';
import { calculatePlateauStability } from './stochastic.service';
import { checkCompliance, ComplianceReport } from './compliance.service';
import { runAdvisorScan } from './advisor.service';
import { buildProjectContext } from './ai.service';
import { SimulationRun } from '../models/SimulationRun';
import { TransformationRoadmap } from '../models/TransformationRoadmap';
import { StandardMapping } from '../models/StandardMapping';
import { Standard } from '../models/Standard';
import { Policy } from '../models/Policy';
import type {
  RoadmapConfig,
  RoadmapWave,
  RoadmapSummary,
  WaveElement,
  WaveMetrics,
  TransformationRoadmap as TRoadmap,
  CandidatesPreview,
  MigrationCandidate,
  GapCategory,
  ElementStatus,
  ConfidenceLevel,
} from '@thearchitect/shared';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ───

interface GraphNode {
  id: string;
  name: string;
  type: string;
  layer: string;
  togafDomain: string;
  status: string;
  riskLevel: string;
  dependsOn: string[];
  metadata: Record<string, unknown>;
}

interface EnrichmentData {
  riskMap: Map<string, RiskAssessment>;
  costMap: Map<string, CostEstimate>;
  compliance: ComplianceReport | null;
  fatigueMap: Map<string, number>;
  advisorInsightIds: string[];
  topologyMap: Map<string, number>;
  metadataMap: Map<string, Record<string, unknown>>;
}

// ─── Wave Names ───

const WAVE_NAMES: Record<number, string> = {
  1: 'Foundation & Prerequisites',
  2: 'Core Transformation',
  3: 'Application Modernization',
  4: 'Integration & Optimization',
  5: 'Consolidation',
  6: 'Finalization',
  7: 'Cleanup & Decommission',
  8: 'Validation & Handover',
};

// ─── Main Entry Point ───

export async function generateRoadmap(
  projectId: string,
  userId: string,
  config: RoadmapConfig,
): Promise<TRoadmap> {
  const start = Date.now();

  // Create document with generating status
  const doc = await TransformationRoadmap.create({
    projectId,
    createdBy: userId,
    name: config.customConstraints
      ? `Roadmap: ${config.customConstraints.slice(0, 60)}`
      : `${config.strategy.charAt(0).toUpperCase() + config.strategy.slice(1)} Transformation Roadmap`,
    status: 'generating',
    config,
    waves: [],
    summary: null,
    advisorInsightsAddressed: [],
    version: 1,
  });

  try {
    // 1. Parallel data gathering
    const [graphNodes, enrichment] = await Promise.all([
      fetchDependencyGraph(projectId),
      gatherEnrichmentData(projectId),
    ]);

    // Build metadata map from graph nodes
    const metadataMap = new Map<string, Record<string, unknown>>();
    for (const node of graphNodes) {
      metadataMap.set(node.id, node.metadata);
    }
    enrichment.metadataMap = metadataMap;

    // 2. Identify migration candidates
    let candidates = identifyCandidates(graphNodes, config.targetStates);

    // 2a. Merge compliance candidates if requested (REQ-CDTP-014)
    if (config.includeComplianceCandidates) {
      const complianceCandidates = await identifyComplianceCandidates(
        projectId,
        config.standardId,
      );
      // Deduplicate by elementId, keeping higher priority
      const existingIds = new Set(candidates.map((c) => c.id));
      for (const cc of complianceCandidates) {
        if (!existingIds.has(cc.id)) {
          candidates.push({ ...cc, targetStatus: cc.targetStatus });
          existingIds.add(cc.id);
        }
      }
    }

    if (candidates.length === 0) {
      const emptyRoadmap = buildEmptyRoadmap(doc, config);
      await TransformationRoadmap.findByIdAndUpdate(doc._id, {
        status: 'completed',
        waves: [],
        summary: emptyRoadmap.summary,
      });
      return emptyRoadmap;
    }

    // 2.5. Compute topology complexity for all candidates
    const candidateIds = candidates.map((c) => c.id);
    enrichment.topologyMap = await computeTopologyBatch(projectId, candidateIds).catch(() => new Map());

    // 3. Sequence into waves
    const rawWaves = sequenceWaves(candidates, graphNodes, config.strategy, config.maxWaves);

    // 4. Enrich waves with metrics
    const waves = enrichWaves(rawWaves, enrichment, config.strategy);

    // 5. Generate recommendations (AI or rule-based)
    await generateRecommendations(waves, projectId, config);

    // 6. Calculate summary with Monte Carlo
    const summary = calculateSummary(waves, enrichment, config);

    // 7. Save architecture baseline snapshot for drift detection
    try {
      const { ArchitectureSnapshot } = await import('../models/ArchitectureSnapshot');
      const topologyValues = [...enrichment.topologyMap.values()];
      const riskScores = [...enrichment.riskMap.values()].map((r) => r.riskScore);
      await ArchitectureSnapshot.create({
        projectId,
        type: 'baseline',
        degreeDistribution: topologyValues,
        riskScoreDistribution: riskScores,
        elementCount: enrichment.riskMap.size,
        connectionCount: topologyValues.reduce((s, d) => s + d, 0),
      });
    } catch {
      // Non-critical, don't block roadmap generation
    }

    // 8. Persist
    const insightIds = enrichment.advisorInsightIds;
    await TransformationRoadmap.findByIdAndUpdate(doc._id, {
      status: 'completed',
      waves,
      summary,
      advisorInsightsAddressed: insightIds,
    });

    return {
      id: doc._id.toString(),
      projectId,
      createdBy: userId,
      name: doc.name,
      config,
      waves,
      summary,
      advisorInsightsAddressed: insightIds,
      status: 'completed',
      version: 1,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    await TransformationRoadmap.findByIdAndUpdate(doc._id, { status: 'failed' });
    throw err;
  }
}

// ─── Data Gathering ───

async function fetchDependencyGraph(projectId: string): Promise<GraphNode[]> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     OPTIONAL MATCH (e)-[r:CONNECTS_TO]->(dep:ArchitectureElement {projectId: $projectId})
     WHERE r.type IN ['depends_on', 'data_flow']
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.togafDomain as togafDomain, e.status as status, e.riskLevel as riskLevel,
            e.metadataJson as metadataJson,
            collect(DISTINCT dep.id) as dependsOn`,
    { projectId },
  );

  return records.map((r) => {
    let metadata: Record<string, unknown> = {};
    try {
      const raw = r.get('metadataJson');
      if (raw) metadata = JSON.parse(raw);
    } catch { /* ignore */ }

    return {
      id: r.get('id'),
      name: r.get('name') || '',
      type: r.get('type') || '',
      layer: r.get('layer') || '',
      togafDomain: r.get('togafDomain') || r.get('layer') || '',
      status: r.get('status') || 'current',
      riskLevel: r.get('riskLevel') || 'low',
      dependsOn: (r.get('dependsOn') || []).filter(Boolean),
      metadata,
    };
  });
}

async function gatherEnrichmentData(projectId: string): Promise<EnrichmentData> {
  const [riskResult, costResult, compliance, advisorResult, latestSim] = await Promise.all([
    assessRisk(projectId).catch(() => ({ elements: [], summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, averageScore: 0 } })),
    estimateCosts(projectId).catch(() => ({ elements: [], totalCost: 0, byCategory: {}, byStatus: {}, optimizationTotal: 0 })),
    checkCompliance(projectId).catch(() => null),
    runAdvisorScan(projectId).catch(() => ({ insights: [], healthScore: null, totalElements: 0, scanDurationMs: 0, projectId, timestamp: '' })),
    SimulationRun.findOne({ projectId, status: 'completed' }).sort({ createdAt: -1 }).lean().catch(() => null),
  ]);

  const riskMap = new Map<string, RiskAssessment>();
  for (const el of riskResult.elements) riskMap.set(el.elementId, el);

  const costMap = new Map<string, CostEstimate>();
  for (const el of costResult.elements) costMap.set(el.elementId, el);

  // Extract per-element fatigue from simulation
  const fatigueMap = new Map<string, number>();
  if (latestSim?.result) {
    const result = latestSim.result as Record<string, unknown>;
    const fatigue = result.fatigue as Record<string, unknown> | undefined;
    const perElement = fatigue?.perElement as Array<{ elementId: string; compositeIndex: number }> | undefined;
    if (perElement) {
      for (const ef of perElement) {
        fatigueMap.set(ef.elementId, ef.compositeIndex);
      }
    }
  }

  return {
    riskMap,
    costMap,
    compliance,
    fatigueMap,
    advisorInsightIds: advisorResult.insights.map((i) => i.id),
    topologyMap: new Map(),    // populated later after candidates are known
    metadataMap: new Map(),    // populated later from graphNodes
  };
}

// ─── Candidate Identification ───

function identifyCandidates(
  nodes: GraphNode[],
  targetStates: Record<string, string>,
): Array<GraphNode & { targetStatus: string }> {
  const candidates: Array<GraphNode & { targetStatus: string }> = [];

  for (const node of nodes) {
    // Explicit target state from config
    if (targetStates[node.id] && targetStates[node.id] !== node.status) {
      candidates.push({ ...node, targetStatus: targetStates[node.id] });
      continue;
    }

    // Auto-detection when no explicit targets
    if (Object.keys(targetStates).length === 0) {
      // Transitional elements → should become target
      if (node.status === 'transitional') {
        candidates.push({ ...node, targetStatus: 'target' });
        continue;
      }
      // Retired elements with dependencies → need cleanup
      if (node.status === 'retired' && node.dependsOn.length > 0) {
        candidates.push({ ...node, targetStatus: 'retired' });
        continue;
      }
      // High-risk current elements → should migrate to target
      if (node.status === 'current' && (node.riskLevel === 'critical' || node.riskLevel === 'high')) {
        candidates.push({ ...node, targetStatus: 'target' });
        continue;
      }
    }
  }

  return candidates;
}

// ─── TOGAF Gap Classification ───

function classifyGap(node: GraphNode): { gapCategory: GapCategory; suggestedTarget: ElementStatus; autoSelected: boolean } {
  if (node.status === 'transitional') {
    return { gapCategory: 'upgrade', suggestedTarget: 'target', autoSelected: true };
  }
  if (node.status === 'retired') {
    return { gapCategory: 'retire', suggestedTarget: 'retired', autoSelected: node.dependsOn.length > 0 };
  }
  if (node.status === 'current') {
    if (node.riskLevel === 'critical' || node.riskLevel === 'high') {
      return { gapCategory: 'modernize', suggestedTarget: 'target', autoSelected: true };
    }
    return { gapCategory: 'retain', suggestedTarget: 'current', autoSelected: false };
  }
  return { gapCategory: 'retain', suggestedTarget: node.status as ElementStatus, autoSelected: false };
}

async function fetchConnectionCounts(projectId: string): Promise<Map<string, number>> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     OPTIONAL MATCH (e)-[r]-(other:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, count(DISTINCT other) as connectionCount`,
    { projectId },
  );
  const map = new Map<string, number>();
  for (const r of records) {
    const count = r.get('connectionCount');
    map.set(r.get('id'), typeof count === 'object' && count.toNumber ? count.toNumber() : Number(count) || 0);
  }
  return map;
}

function computeConfidence(
  node: GraphNode,
  connectionCount: number,
): { score: number; level: ConfidenceLevel; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // Source metadata (n8n type, workflow data) → strongest signal
  const meta = node.metadata || {};
  if (meta.source === 'n8n' && meta.n8nType) {
    score += 0.30;
    factors.push('n8n workflow data');
  } else if (Object.keys(meta).length > 0) {
    score += 0.15;
    factors.push('partial metadata');
  }

  // Real topology from Neo4j
  if (connectionCount > 0) {
    score += 0.25;
    factors.push(`${connectionCount} connections mapped`);
  }

  // Dependencies in graph
  if (node.dependsOn.length > 0) {
    score += 0.15;
    factors.push(`${node.dependsOn.length} dependencies`);
  }

  // Risk was explicitly assessed (not default)
  if (node.riskLevel && node.riskLevel !== 'low') {
    score += 0.15;
    factors.push(`risk assessed: ${node.riskLevel}`);
  }

  // TOGAF domain classified
  if (node.togafDomain) {
    score += 0.10;
    factors.push('TOGAF domain set');
  }

  score = Math.min(score, 1.0);

  if (factors.length === 0) {
    factors.push('type-based heuristic only');
  }

  const level: ConfidenceLevel = score >= 0.6 ? 'measured' : score >= 0.3 ? 'estimated' : 'heuristic';
  return { score: Math.round(score * 100) / 100, level, factors };
}

export async function previewCandidates(projectId: string): Promise<CandidatesPreview> {
  const [graphNodes, connectionCounts] = await Promise.all([
    fetchDependencyGraph(projectId),
    fetchConnectionCounts(projectId),
  ]);

  const candidates: MigrationCandidate[] = graphNodes
    .filter((node) => node.status !== 'target')
    .map((node) => {
      const { gapCategory, suggestedTarget, autoSelected } = classifyGap(node);
      const connCount = connectionCounts.get(node.id) || 0;
      const { score, level, factors } = computeConfidence(node, connCount);
      return {
        elementId: node.id,
        name: node.name,
        type: node.type,
        togafDomain: node.togafDomain || node.layer,
        currentStatus: node.status as ElementStatus,
        suggestedTarget,
        riskLevel: node.riskLevel,
        connectionCount: connCount,
        gapCategory,
        autoSelected,
        confidenceScore: score,
        confidenceLevel: level,
        confidenceFactors: factors,
      };
    });

  // Aggregate confidence stats
  let totalScore = 0;
  let measured = 0, estimated = 0, heuristic = 0;
  for (const c of candidates) {
    totalScore += c.confidenceScore;
    if (c.confidenceLevel === 'measured') measured++;
    else if (c.confidenceLevel === 'estimated') estimated++;
    else heuristic++;
  }

  return {
    candidates,
    totalElements: graphNodes.length,
    autoSelectedCount: candidates.filter((c) => c.autoSelected).length,
    dataConfidence: {
      overall: candidates.length > 0 ? Math.round((totalScore / candidates.length) * 100) / 100 : 0,
      measuredCount: measured,
      estimatedCount: estimated,
      heuristicCount: heuristic,
    },
  };
}

// ─── Compliance-Driven Candidates (CDTP F3: REQ-CDTP-011, REQ-CDTP-012) ───

/**
 * Identify compliance-driven migration candidates from StandardMapping gaps.
 * Uses 8-criteria weighted priority scoring per the CDTP spec.
 */
export async function identifyComplianceCandidates(
  projectId: string,
  standardId?: string,
): Promise<Array<GraphNode & { targetStatus: string; compliancePriority: number }>> {
  // Find gap/partial mappings that reference real architecture elements
  const mappingFilter: Record<string, unknown> = {
    projectId,
    status: { $in: ['gap', 'partial'] },
    elementId: { $ne: '__COVERAGE_GAP__' },
  };
  if (standardId) mappingFilter.standardId = standardId;

  const gapMappings = await StandardMapping.find(mappingFilter);
  if (gapMappings.length === 0) return [];

  // Get unique element IDs
  const elementIds = [...new Set(gapMappings.map((m) => m.elementId))];

  // Fetch element data from Neo4j
  const elementRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.id IN $elementIds
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.status as status, e.riskLevel as riskLevel,
            e.maturityLevel as maturityLevel, e.description as description
     LIMIT 200`,
    { projectId, elementIds },
  );

  if (elementRecords.length === 0) return [];

  // Fetch connection counts for relation scoring
  const connRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.id IN $elementIds
     OPTIONAL MATCH (e)-[r]-()
     RETURN e.id as id, count(r) as connCount`,
    { projectId, elementIds },
  );
  const connMap = new Map<string, number>();
  for (const r of connRecords) {
    const props = r.toObject();
    connMap.set(String(props.id), Number(props.connCount) || 0);
  }

  // Count policy violations per element (if policies with standardId exist)
  const policyFilter: Record<string, unknown> = { projectId, enabled: true };
  if (standardId) policyFilter.standardId = standardId;
  const policyCount = await Policy.countDocuments(policyFilter);

  // Count gap mappings per element for urgency
  const gapCountMap = new Map<string, number>();
  for (const m of gapMappings) {
    gapCountMap.set(m.elementId, (gapCountMap.get(m.elementId) || 0) + 1);
  }

  // Build candidates with 8-criteria scoring
  const candidates: Array<GraphNode & { targetStatus: string; compliancePriority: number }> = [];

  for (const record of elementRecords) {
    const props = record.toObject();
    const id = String(props.id);
    const riskLevel = String(props.riskLevel || 'medium');
    const maturityLevel = Number(props.maturityLevel) || 3;
    const connCount = connMap.get(id) || 0;
    const gapCount = gapCountMap.get(id) || 0;
    const status = String(props.status || 'current');

    // 8-criteria weighted scoring (REQ-CDTP-012)
    const scores = {
      bizValue:    maturityLevel >= 4 ? 3 : maturityLevel >= 2 ? 6 : 9,     // lower maturity = higher need
      bizRisk:     riskLevel === 'critical' ? 9 : riskLevel === 'high' ? 7 : riskLevel === 'medium' ? 4 : 2,
      implChall:   10 - Math.min(connCount, 8),                              // more connections = harder (inverted)
      success:     maturityLevel >= 3 ? 8 : 5,                               // higher maturity = more likely success
      compliance:  Math.min(gapCount * 3, 9),                                // more gaps = higher compliance urgency
      relations:   Math.min(connCount * 2, 9),                               // more connected = more impact
      urgency:     gapCount >= 3 ? 9 : gapCount >= 2 ? 6 : 3,              // more gaps = more urgent
      statusScore: status === 'retired' ? 2 : status === 'current' ? 7 : 5, // current elements benefit most
    };

    // Weighted average (weights from spec)
    const weights = { bizValue: 0.15, bizRisk: 0.15, implChall: 0.10, success: 0.10, compliance: 0.20, relations: 0.10, urgency: 0.10, statusScore: 0.10 };
    const priority = Math.round(
      (scores.bizValue * weights.bizValue +
       scores.bizRisk * weights.bizRisk +
       scores.implChall * weights.implChall +
       scores.success * weights.success +
       scores.compliance * weights.compliance +
       scores.relations * weights.relations +
       scores.urgency * weights.urgency +
       scores.statusScore * weights.statusScore) * 100
    ) / 100;

    candidates.push({
      id,
      name: String(props.name || ''),
      type: String(props.type || ''),
      layer: String(props.layer || ''),
      togafDomain: String(props.layer || ''),
      status,
      riskLevel,
      dependsOn: [],
      metadata: {},
      targetStatus: 'target',
      compliancePriority: priority,
    });
  }

  // Sort by priority descending
  candidates.sort((a, b) => b.compliancePriority - a.compliancePriority);
  return candidates;
}

// ─── Wave Sequencing (Kahn's Topological Sort) ───

function sequenceWaves(
  candidates: Array<GraphNode & { targetStatus: string }>,
  allNodes: GraphNode[],
  strategy: string,
  maxWaves: number,
): Array<Array<GraphNode & { targetStatus: string }>> {
  const candidateIds = new Set(candidates.map((c) => c.id));
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  // Build adjacency list (only edges within candidates)
  // For migrate candidates: foundation first (follow dependency direction)
  // For retire candidates: leaf first (reverse dependency direction)
  const retireCandidates = candidates.filter((c) => c.targetStatus === 'retired');
  const migrateCandidates = candidates.filter((c) => c.targetStatus !== 'retired');

  const migrateLayers = kahnSort(migrateCandidates, allNodes, candidateIds, false);
  const retireLayers = kahnSort(retireCandidates, allNodes, candidateIds, true);

  // Combine: migrate first, then retire
  let allLayers = [...migrateLayers, ...retireLayers].filter((l) => l.length > 0);

  // Strategy-based sorting within each layer
  for (const layer of allLayers) {
    sortByStrategy(layer, strategy);
  }

  // Fit to maxWaves
  allLayers = fitToWaveCount(allLayers, maxWaves);

  return allLayers;
}

function kahnSort(
  candidates: Array<GraphNode & { targetStatus: string }>,
  allNodes: GraphNode[],
  candidateIds: Set<string>,
  reverse: boolean,
): Array<Array<GraphNode & { targetStatus: string }>> {
  if (candidates.length === 0) return [];

  const ids = new Set(candidates.map((c) => c.id));
  const nodeMap = new Map(candidates.map((c) => [c.id, c]));

  // Build in-degree map (edges only within this candidate set)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const c of candidates) {
    inDegree.set(c.id, 0);
    adj.set(c.id, []);
  }

  // Build edges from allNodes dependency data
  for (const node of allNodes) {
    if (!ids.has(node.id)) continue;
    for (const depId of node.dependsOn) {
      if (!ids.has(depId)) continue;
      if (reverse) {
        // Reverse: depId depends on node → node comes first
        adj.get(node.id)!.push(depId);
        inDegree.set(depId, (inDegree.get(depId) || 0) + 1);
      } else {
        // Normal: node depends on depId → depId comes first
        adj.get(depId)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
      }
    }
  }

  // Kahn's algorithm with layer tracking
  const layers: Array<Array<GraphNode & { targetStatus: string }>> = [];
  let queue = [...ids].filter((id) => (inDegree.get(id) || 0) === 0);

  while (queue.length > 0) {
    const layer: Array<GraphNode & { targetStatus: string }> = [];
    const nextQueue: string[] = [];

    for (const id of queue) {
      const node = nodeMap.get(id);
      if (node) layer.push(node);

      for (const neighbor of adj.get(id) || []) {
        const deg = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) nextQueue.push(neighbor);
      }
    }

    if (layer.length > 0) layers.push(layer);
    queue = nextQueue;
  }

  // Handle cycles: any remaining nodes not in layers
  const placed = new Set(layers.flat().map((n) => n.id));
  const remaining = candidates.filter((c) => !placed.has(c.id));
  if (remaining.length > 0) {
    layers.push(remaining); // Put cyclic nodes in last layer
  }

  return layers;
}

function sortByStrategy(layer: Array<GraphNode & { targetStatus: string }>, strategy: string): void {
  const riskScore = (n: GraphNode) => {
    const scores: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };
    return scores[n.riskLevel] || 1;
  };

  switch (strategy) {
    case 'conservative':
      layer.sort((a, b) => riskScore(a) - riskScore(b)); // low-risk first
      break;
    case 'aggressive':
      layer.sort((a, b) => riskScore(b) - riskScore(a)); // high-risk first
      break;
    case 'balanced':
    default:
      layer.sort((a, b) => riskScore(b) - riskScore(a)); // highest ROI first
      break;
  }
}

function fitToWaveCount<T>(layers: T[][], maxWaves: number): T[][] {
  if (layers.length <= maxWaves) return layers;

  // Merge adjacent layers until we fit
  while (layers.length > maxWaves) {
    // Find smallest adjacent pair to merge
    let minSize = Infinity;
    let mergeIdx = 0;
    for (let i = 0; i < layers.length - 1; i++) {
      const combined = layers[i].length + layers[i + 1].length;
      if (combined < minSize) {
        minSize = combined;
        mergeIdx = i;
      }
    }
    layers[mergeIdx] = [...layers[mergeIdx], ...layers[mergeIdx + 1]];
    layers.splice(mergeIdx + 1, 1);
  }

  return layers;
}

// ─── Wave Enrichment ───

function computeFrictionMultiplier(fatigue: number): number {
  if (fatigue < 0.3) return 1.0;
  if (fatigue < 0.6) return 1.0 + (fatigue - 0.3) * (0.5 / 0.3);
  if (fatigue < 0.8) return 1.5 + (fatigue - 0.6) * (1.0 / 0.2);
  return 2.5 + (fatigue - 0.8) * (1.5 / 0.2);
}

function enrichWaves(
  rawWaves: Array<Array<GraphNode & { targetStatus: string }>>,
  data: EnrichmentData,
  strategy: string,
): RoadmapWave[] {
  const waves: RoadmapWave[] = [];
  const elementToWave = new Map<string, number>();

  // Map elements to their wave numbers
  rawWaves.forEach((wave, idx) => {
    for (const el of wave) elementToWave.set(el.id, idx + 1);
  });

  for (let i = 0; i < rawWaves.length; i++) {
    const rawWave = rawWaves[i];
    const waveNumber = i + 1;

    const elements: WaveElement[] = rawWave.map((node) => {
      const risk = data.riskMap.get(node.id);
      const cost = data.costMap.get(node.id);
      const fatigue = data.fatigueMap.get(node.id) || 0;
      const topoMult = data.topologyMap.get(node.id) || 1.0;
      const frictionMult = computeFrictionMultiplier(fatigue);
      const meta = data.metadataMap.get(node.id) || {};
      const isN8n = meta.source === 'n8n';

      // Cross-wave dependencies
      const deps = node.dependsOn
        .filter((depId) => {
          const depWave = elementToWave.get(depId);
          return depWave && depWave < waveNumber;
        });

      // Hours-based cost with topology + friction
      let estimatedHours: number;
      let estimatedCost: number;

      if (isN8n && meta.n8nType) {
        const baseHours = getN8nEffortHours(meta.n8nType as string);
        estimatedHours = Math.round(baseHours * topoMult * frictionMult * 10) / 10;
        estimatedCost = Math.round(estimatedHours * 100); // €100/h
      } else {
        const baseCost = cost?.estimatedCost || 0;
        estimatedCost = Math.round(baseCost * topoMult * frictionMult);
        estimatedHours = Math.round((estimatedCost / 150) * 10) / 10; // €150/h enterprise
      }

      return {
        elementId: node.id,
        name: node.name,
        type: node.type,
        layer: node.layer,
        currentStatus: node.status as WaveElement['currentStatus'],
        targetStatus: node.targetStatus as WaveElement['targetStatus'],
        riskScore: risk?.riskScore || 0,
        estimatedCost,
        stakeholderFatigue: fatigue,
        dependsOnElementIds: deps,
        costModel: isN8n ? 'n8n' as const : 'enterprise' as const,
        estimatedHours,
        topologyComplexity: Math.round(topoMult * 100) / 100,
      };
    });

    // Compute metrics
    const totalCost = elements.reduce((s, e) => s + e.estimatedCost, 0);
    const totalHours = elements.reduce((s, e) => s + (e.estimatedHours || 0), 0);
    const avgRisk = elements.length > 0
      ? elements.reduce((s, e) => s + e.riskScore, 0) / elements.length
      : 0;
    const riskDelta = -avgRisk * 0.3;
    const avgFatigue = elements.length > 0
      ? elements.reduce((s, e) => s + e.stakeholderFatigue, 0) / elements.length
      : 0;

    // Compliance impact
    let complianceImpact = 0;
    if (data.compliance) {
      const elementIds = new Set(elements.map((e) => e.elementId));
      complianceImpact = data.compliance.violations.filter(
        (v) => elementIds.has(v.elementId),
      ).length;
    }

    // Duration: hours-based with parallelism
    const parallelism = strategy === 'aggressive' ? 3 : strategy === 'conservative' ? 1 : 2;
    const monthsFromHours = (totalHours / parallelism) / 160;
    const maxChain = elements.reduce((m, e) => Math.max(m, e.dependsOnElementIds.length), 0);
    const chainPenalty = maxChain * 0.25;
    const estimatedDurationMonths = Math.max(1, Math.ceil(monthsFromHours + chainPenalty));

    // Wave dependencies
    const dependsOnWaves = [...new Set(
      elements.flatMap((e) => e.dependsOnElementIds.map((depId) => elementToWave.get(depId) || 0)),
    )].filter((w) => w > 0 && w < waveNumber);

    const metrics: WaveMetrics = {
      totalCost,
      riskDelta: Math.round(riskDelta * 10) / 10,
      complianceImpact,
      avgFatigue: Math.round(avgFatigue * 100) / 100,
      elementCount: elements.length,
      totalEstimatedHours: Math.round(totalHours * 10) / 10,
    };

    waves.push({
      waveNumber,
      name: WAVE_NAMES[waveNumber] || `Wave ${waveNumber}`,
      description: generateWaveDescription(elements, data.metadataMap, totalHours),
      elements,
      metrics,
      dependsOnWaves,
      estimatedDurationMonths,
    });
  }

  return waves;
}

function generateWaveDescription(
  elements: WaveElement[],
  metadataMap: Map<string, Record<string, unknown>>,
  totalHours: number,
): string {
  const n8nElements = elements.filter((e) => {
    const m = metadataMap.get(e.elementId);
    return m?.source === 'n8n';
  });
  const eaElements = elements.filter((e) => {
    const m = metadataMap.get(e.elementId);
    return !m?.source || m.source !== 'n8n';
  });

  const parts: string[] = [];

  // N8n-specific: group by category
  if (n8nElements.length > 0) {
    const byCategory = new Map<string, { transform: number; retire: number }>();
    for (const el of n8nElements) {
      const meta = metadataMap.get(el.elementId) || {};
      const cat = getN8nNodeCategory((meta.n8nType as string) || '');
      if (!byCategory.has(cat)) byCategory.set(cat, { transform: 0, retire: 0 });
      const entry = byCategory.get(cat)!;
      if (el.targetStatus === 'retired') entry.retire++;
      else entry.transform++;
    }
    for (const [cat, counts] of byCategory) {
      if (cat === 'Passiv') continue; // Skip sticky notes in description
      if (counts.transform > 0) parts.push(`${counts.transform} ${cat}-Node${counts.transform > 1 ? 's' : ''} aktualisieren`);
      if (counts.retire > 0) parts.push(`${counts.retire} ${cat}-Node${counts.retire > 1 ? 's' : ''} entfernen`);
    }
  }

  // Enterprise elements
  if (eaElements.length > 0) {
    const retireCount = eaElements.filter((e) => e.targetStatus === 'retired').length;
    const migrateCount = eaElements.length - retireCount;
    const layers = [...new Set(eaElements.map((e) => e.layer))];
    if (migrateCount > 0) parts.push(`${migrateCount} ${layers.join('/')}-Komponente${migrateCount > 1 ? 'n' : ''} transformieren`);
    if (retireCount > 0) parts.push(`${retireCount} Komponente${retireCount > 1 ? 'n' : ''} ablösen`);
  }

  // Add effort estimate
  const totalCost = elements.reduce((s, e) => s + e.estimatedCost, 0);
  if (totalHours > 0) {
    const hoursStr = totalHours < 8 ? `~${Math.round(totalHours)}h` : `~${Math.round(totalHours / 8)} Tage`;
    parts.push(`Aufwand: ${hoursStr}, ${formatCostShort(totalCost)}`);
  }

  return parts.join('. ') || `Wave transformation`;
}

function formatCostShort(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(1)}K`;
  return `€${n}`;
}

// ─── AI Recommendations ───

async function generateRecommendations(
  waves: RoadmapWave[],
  projectId: string,
  config: RoadmapConfig,
): Promise<void> {
  if (!config.includeAIRecommendations) {
    applyRuleBasedRecommendations(waves, config.strategy);
    return;
  }

  const provider = detectProvider();
  if (provider === 'none') {
    applyRuleBasedRecommendations(waves, config.strategy);
    return;
  }

  try {
    const context = await buildProjectContext(projectId);
    await Promise.all(waves.map((wave) => generateWaveRecommendation(wave, context, config, provider)));
  } catch {
    applyRuleBasedRecommendations(waves, config.strategy);
  }
}

function detectProvider(): 'openai' | 'anthropic' | 'none' {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

async function generateWaveRecommendation(
  wave: RoadmapWave,
  context: string,
  config: RoadmapConfig,
  provider: 'openai' | 'anthropic',
): Promise<void> {
  const elementList = wave.elements
    .map((e) => `- ${e.name} (${e.type}, ${e.currentStatus}→${e.targetStatus}, risk: ${e.riskScore})`)
    .join('\n');

  const prompt = `You are an Enterprise Architecture Transformation Advisor.
Analyze Wave ${wave.waveNumber} of a migration roadmap and provide:
1) A strategic summary (2 sentences max)
2) Top risk mitigation recommendation
3) Stakeholder communication tip

Architecture Context:
${context.slice(0, 2000)}

Wave ${wave.waveNumber}: "${wave.name}"
Elements:
${elementList}
Metrics: Cost €${wave.metrics.totalCost}, Risk Delta ${wave.metrics.riskDelta}, Compliance fixes: ${wave.metrics.complianceImpact}, Avg Fatigue: ${wave.metrics.avgFatigue}
Strategy: ${config.strategy}

Respond as JSON: {"summary": "...", "riskMitigation": "...", "stakeholderNote": "..."}`;

  try {
    let text = '';
    if (provider === 'openai') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
      const resp = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.5,
      });
      text = resp.choices[0]?.message?.content || '';
    } else {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });
      text = resp.content[0]?.type === 'text' ? resp.content[0].text : '';
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      wave.recommendation = parsed.summary || undefined;
      wave.riskMitigations = parsed.riskMitigation ? [parsed.riskMitigation] : undefined;
      wave.stakeholderNotes = parsed.stakeholderNote || undefined;
    }
  } catch {
    // Fall through to rule-based
    applyRuleBasedForWave(wave, config.strategy);
  }
}

function applyRuleBasedRecommendations(waves: RoadmapWave[], strategy: string): void {
  for (const wave of waves) {
    applyRuleBasedForWave(wave, strategy);
  }
}

function applyRuleBasedForWave(wave: RoadmapWave, strategy: string): void {
  const mitigations: string[] = [];

  // High-risk elements
  const highRiskElements = wave.elements.filter((e) => e.riskScore >= 7);
  if (highRiskElements.length > 0) {
    mitigations.push(`Phased rollout recommended for ${highRiskElements.map((e) => e.name).join(', ')} — implement fallback plan`);
  }

  // High fatigue
  if (wave.metrics.avgFatigue > 0.6) {
    mitigations.push('Stakeholder resistance detected — schedule alignment workshops before this wave');
  }

  // Compliance
  if (wave.metrics.complianceImpact > 0) {
    mitigations.push(`This wave resolves ${wave.metrics.complianceImpact} compliance violation${wave.metrics.complianceImpact > 1 ? 's' : ''} — prioritize for audit readiness`);
  }

  // Retirements
  const retireElements = wave.elements.filter((e) => e.targetStatus === 'retired');
  if (retireElements.length > 0) {
    mitigations.push(`Decommission ${retireElements.map((e) => e.name).join(', ')} — verify no active consumers before shutdown`);
  }

  // Strategy-specific
  const strategyNotes: Record<string, string> = {
    conservative: 'Conservative approach: validate each change before proceeding to minimize disruption',
    balanced: 'Balanced approach: optimize for risk-adjusted ROI across this wave',
    aggressive: 'Aggressive approach: fast-track with parallel workstreams to compress timeline',
  };

  wave.recommendation = strategyNotes[strategy] || strategyNotes.balanced;
  wave.riskMitigations = mitigations.length > 0 ? mitigations : ['No significant risks identified for this wave'];
  wave.stakeholderNotes = wave.metrics.avgFatigue > 0.3
    ? 'Pre-alignment with affected stakeholders recommended before kickoff'
    : 'Stakeholder alignment appears manageable for this wave';
}

// ─── Summary Calculation ───

function calculateSummary(waves: RoadmapWave[], data: EnrichmentData, config?: RoadmapConfig): RoadmapSummary {
  const totalCost = waves.reduce((s, w) => s + w.metrics.totalCost, 0);
  const totalDurationMonths = waves.reduce((s, w) => s + w.estimatedDurationMonths, 0);
  const totalElements = waves.reduce((s, w) => s + w.metrics.elementCount, 0);
  const complianceImprovement = waves.reduce((s, w) => s + w.metrics.complianceImpact, 0);

  // Risk reduction estimate
  const avgRiskBefore = data.riskMap.size > 0
    ? [...data.riskMap.values()].reduce((s, r) => s + r.riskScore, 0) / data.riskMap.size
    : 0;
  const riskReduction = avgRiskBefore > 0 ? Math.round(Math.abs(waves.reduce((s, w) => s + w.metrics.riskDelta, 0)) / avgRiskBefore * 100) : 0;

  // Monte Carlo for cost confidence
  const riskFactors = waves.map((w) => ({
    name: `Wave ${w.waveNumber}`,
    probability: 0.3 + w.metrics.avgFatigue * 0.4, // higher fatigue = higher risk of cost overrun
    impactMin: w.metrics.totalCost * 0.05,
    impactMax: w.metrics.totalCost * 0.25,
  }));

  let costConfidence = { p10: totalCost, p50: totalCost, p90: totalCost };
  try {
    const mc = runMonteCarloSimulation({
      baselineCost: totalCost,
      riskFactors,
      iterations: 5000,
    });
    costConfidence = { p10: mc.p10, p50: mc.p50, p90: mc.p90 };
  } catch {
    // Fallback: simple ±15% range
    costConfidence = {
      p10: Math.round(totalCost * 0.85),
      p50: totalCost,
      p90: Math.round(totalCost * 1.15),
    };
  }

  // Plateau stability per wave
  const strategy = config?.strategy || 'balanced';
  const autoInsert = config?.autoInsertTransitionalStates || false;
  const plateauStability = waves.map((wave) => {
    const plateauStates = wave.elements.map((el) => ({
      elementId: el.elementId,
      name: el.name,
      failureProbability: el.riskScore / 10, // normalize 1-10 to 0-1
      dependsOnElementIds: el.dependsOnElementIds,
      cascadeWeight: el.topologyComplexity ? el.topologyComplexity / 5 : 1.0,
    }));
    return calculatePlateauStability(
      plateauStates,
      strategy,
      autoInsert,
      wave.metrics.avgFatigue || 1.0,
    );
  });

  // Compliance projection per wave (CDTP F3)
  const complianceProjection = config?.includeComplianceCandidates
    ? waves.map((wave, i) => {
        // Each wave resolves some compliance elements; project improvement
        const resolvedUpToWave = waves.slice(0, i + 1).reduce((s, w) => s + w.metrics.elementCount, 0);
        const projectedCoverage = totalElements > 0
          ? Math.round((resolvedUpToWave / totalElements) * 100)
          : 0;
        return {
          waveNumber: wave.waveNumber,
          projectedPolicyScore: Math.min(projectedCoverage + 10, 100),
          projectedCoverageScore: projectedCoverage,
        };
      })
    : undefined;

  return {
    totalCost,
    totalDurationMonths,
    totalElements,
    riskReduction: Math.min(riskReduction, 100),
    complianceImprovement,
    waveCount: waves.length,
    costConfidence,
    plateauStability,
    complianceProjection,
  };
}

// ─── Helpers ───

function buildEmptyRoadmap(doc: InstanceType<typeof TransformationRoadmap>, config: RoadmapConfig): TRoadmap {
  return {
    id: doc._id.toString(),
    projectId: doc.projectId.toString(),
    createdBy: doc.createdBy.toString(),
    name: doc.name,
    config,
    waves: [],
    summary: {
      totalCost: 0,
      totalDurationMonths: 0,
      totalElements: 0,
      riskReduction: 0,
      complianceImprovement: 0,
      waveCount: 0,
      costConfidence: { p10: 0, p50: 0, p90: 0 },
    },
    advisorInsightsAddressed: [],
    status: 'completed',
    version: 1,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
