import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { StandardMapping } from '../models/StandardMapping';
import { TransformationRoadmap } from '../models/TransformationRoadmap';
import { log } from '../config/logger';
import {
  computeCriticality,
  type CriticalityElement,
  type CriticalityConnection,
  type StandardMappingInput,
  type RoadmapWaveInput,
} from './criticality.service';
import {
  computeInputHash,
  getCachedScores,
  saveCachedScores,
} from './criticalityCache.service';
import {
  DEFAULT_FACTOR_WEIGHTS,
  type CriticalityScoreEntry,
  type FactorWeights,
} from '@thearchitect/shared';

export interface RunCriticalityOptions {
  forceRefresh?: boolean;
  weights?: FactorWeights;
}

export interface RunCriticalityResult {
  scores: CriticalityScoreEntry[];
  computedAt: Date;
  weights: FactorWeights;
  fromCache: boolean;
}

export async function runCriticalityForProject(
  projectId: string,
  opts: RunCriticalityOptions = {},
): Promise<RunCriticalityResult> {
  const effectiveWeights: FactorWeights = opts.weights
    ? { ...DEFAULT_FACTOR_WEIGHTS, ...opts.weights }
    : { ...DEFAULT_FACTOR_WEIGHTS };

  const [elementRecords, connectionRecords, cycleRecords, mappingDocs, roadmap] = await Promise.all([
    runCypher(
      'MATCH (e:ArchitectureElement {projectId: $projectId}) RETURN e',
      { projectId },
    ),
    runCypher(
      'MATCH (s:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(t:ArchitectureElement {projectId: $projectId}) RETURN s.id AS sid, t.id AS tid',
      { projectId },
    ),
    runCypher(
      'MATCH p=(n:ArchitectureElement {projectId: $projectId})-[:CONNECTS_TO*1..5]->(n) RETURN DISTINCT n.id AS nid',
      { projectId },
    ).catch((err: Error) => {
      log.warn({ err: err.message }, '[criticality] cycle detection failed, continuing without');
      return [];
    }),
    StandardMapping.find({ projectId }).lean(),
    TransformationRoadmap.findOne({ projectId }).sort({ createdAt: -1 }).lean(),
  ]);

  const elements: CriticalityElement[] = elementRecords.map((r) => {
    const props = serializeNeo4jProperties(r.get('e').properties);
    return {
      id: String(props.id),
      name: String(props.name ?? ''),
      type: String(props.type ?? ''),
      layer: String(props.layer ?? ''),
      riskLevel: (props.riskLevel as CriticalityElement['riskLevel']) ?? null,
      maturityLevel: typeof props.maturityLevel === 'number' ? props.maturityLevel : null,
    };
  });

  if (elements.length === 0) {
    return {
      scores: [],
      computedAt: new Date(),
      weights: effectiveWeights,
      fromCache: false,
    };
  }

  const connections: CriticalityConnection[] = connectionRecords.map((r) => ({
    sourceId: String(r.get('sid')),
    targetId: String(r.get('tid')),
  }));

  const inputHash = computeInputHash({
    elementIds: elements.map((e) => e.id),
    connectionEdges: connections.map((c) => [c.sourceId, c.targetId] as [string, string]),
    mappingKeys: mappingDocs.map((m) => `${m.elementId}:${m.status}`),
    waveCount: roadmap && Array.isArray(roadmap.waves) ? roadmap.waves.length : 0,
    weights: effectiveWeights,
  });

  if (!opts.forceRefresh) {
    const cached = await getCachedScores(projectId, inputHash);
    if (cached) {
      return {
        scores: cached.scores,
        computedAt: cached.computedAt,
        weights: cached.weights,
        fromCache: true,
      };
    }
  }

  const cycleMembers = new Set<string>(cycleRecords.map((r) => String(r.get('nid'))));

  const standardMappings: StandardMappingInput[] = mappingDocs.map((m) => ({
    elementId: String(m.elementId),
    hasRealizer: m.status === 'compliant' || m.status === 'partial',
  }));

  const roadmapWaves: RoadmapWaveInput[] = [];
  if (roadmap && Array.isArray(roadmap.waves)) {
    for (const w of roadmap.waves as Array<Record<string, unknown>>) {
      const elementCostsRaw = (w.elements ?? w.elementCosts ?? []) as Array<Record<string, unknown>>;
      if (!Array.isArray(elementCostsRaw)) continue;
      const elementCosts = elementCostsRaw
        .map((ec) => ({
          elementId: String(ec.elementId ?? ec.id ?? ''),
          cost: Number(ec.cost ?? ec.estimatedCost ?? 0),
        }))
        .filter((ec) => ec.elementId && Number.isFinite(ec.cost));
      const totalCost =
        Number(w.totalCost ?? w.cost ?? elementCosts.reduce((s, e) => s + e.cost, 0)) || 0;
      if (totalCost > 0) roadmapWaves.push({ totalCost, elementCosts });
    }
  }

  const breakdownMap = computeCriticality({
    elements,
    connections,
    standardMappings,
    roadmapWaves,
    cycleMembers,
    weights: effectiveWeights,
  });

  const elementById = new Map(elements.map((e) => [e.id, e]));
  const allScores: CriticalityScoreEntry[] = Array.from(breakdownMap.entries())
    .map(([elementId, breakdown]) => {
      const el = elementById.get(elementId)!;
      return {
        elementId,
        name: el.name,
        type: el.type,
        layer: el.layer,
        totalScore: breakdown.totalScore,
        factors: breakdown.factors,
        dominantFactor: breakdown.dominantFactor,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  saveCachedScores(projectId, allScores, effectiveWeights, inputHash).catch((err: Error) => {
    log.warn({ err: err.message }, '[criticality] cache save failed');
  });

  return {
    scores: allScores,
    computedAt: new Date(),
    weights: effectiveWeights,
    fromCache: false,
  };
}
