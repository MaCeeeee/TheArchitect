import { runCypher } from '../config/neo4j';
import type { TIMEClassification } from '@thearchitect/shared/src/types/architecture.types';

/**
 * TIME Classification Engine
 *
 * Heuristic-based classifier that assigns Tolerate/Invest/Migrate/Eliminate
 * based on element properties: maturity, risk, status, age, dependencies, cost.
 *
 * In future sprints this can be enhanced with LLM-based classification.
 */

interface ClassifiableElement {
  id: string;
  name: string;
  type: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  lifecyclePhase: string | null;
  endOfLifeDate: string | null;
  annualCost: number | null;
  userCount: number | null;
  inDegree: number;
  outDegree: number;
  updatedAt: string;
}

interface ClassificationResult {
  elementId: string;
  classification: TIMEClassification;
  confidence: number;  // 0-1
  reasons: string[];
}

// ─── Scoring weights ───

const WEIGHTS = {
  maturity: 0.20,
  risk: 0.25,
  status: 0.15,
  lifecycle: 0.15,
  staleness: 0.10,
  dependencies: 0.15,
};

/**
 * Classify all elements in a project using heuristic scoring.
 */
export async function classifyProject(projectId: string): Promise<ClassificationResult[]> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     OPTIONAL MATCH (e)-[out]->()
     OPTIONAL MATCH ()-[inc]->(e)
     RETURN e.id AS id, e.name AS name, e.type AS type,
            e.status AS status, e.riskLevel AS riskLevel,
            e.maturityLevel AS maturityLevel,
            e.lifecyclePhase AS lifecyclePhase,
            e.endOfLifeDate AS endOfLifeDate,
            e.annualCost AS annualCost,
            e.userCount AS userCount,
            e.updatedAt AS updatedAt,
            count(DISTINCT out) AS outDegree, count(DISTINCT inc) AS inDegree`,
    { projectId },
  );

  const elements: ClassifiableElement[] = records.map((r) => ({
    id: r.get('id'),
    name: r.get('name') || '',
    type: r.get('type') || '',
    status: r.get('status') || 'current',
    riskLevel: r.get('riskLevel') || 'low',
    maturityLevel: r.get('maturityLevel')?.toNumber?.() ?? 3,
    lifecyclePhase: r.get('lifecyclePhase') || null,
    endOfLifeDate: r.get('endOfLifeDate') || null,
    annualCost: r.get('annualCost')?.toNumber?.() ?? null,
    userCount: r.get('userCount')?.toNumber?.() ?? null,
    inDegree: r.get('inDegree')?.toNumber?.() || 0,
    outDegree: r.get('outDegree')?.toNumber?.() || 0,
    updatedAt: r.get('updatedAt') || '',
  }));

  return elements.map(classifyElement);
}

function classifyElement(el: ClassifiableElement): ClassificationResult {
  const reasons: string[] = [];
  let eliminateScore = 0;
  let migrateScore = 0;
  let tolerateScore = 0;
  let investScore = 0;

  // 1. Maturity scoring (low maturity → migrate/eliminate)
  if (el.maturityLevel <= 1) {
    eliminateScore += WEIGHTS.maturity;
    reasons.push('Very low maturity (1/5)');
  } else if (el.maturityLevel <= 2) {
    migrateScore += WEIGHTS.maturity;
    reasons.push('Low maturity (2/5)');
  } else if (el.maturityLevel >= 4) {
    investScore += WEIGHTS.maturity;
    reasons.push('High maturity — strategic value');
  } else {
    tolerateScore += WEIGHTS.maturity;
  }

  // 2. Risk scoring
  const riskMap: Record<string, () => void> = {
    critical: () => { eliminateScore += WEIGHTS.risk; reasons.push('Critical risk level'); },
    high: () => { migrateScore += WEIGHTS.risk; reasons.push('High risk level'); },
    medium: () => { tolerateScore += WEIGHTS.risk * 0.5; migrateScore += WEIGHTS.risk * 0.5; },
    low: () => { tolerateScore += WEIGHTS.risk * 0.5; investScore += WEIGHTS.risk * 0.5; },
  };
  (riskMap[el.riskLevel] || riskMap.low)();

  // 3. Status scoring
  if (el.status === 'retired') {
    eliminateScore += WEIGHTS.status;
    reasons.push('Status: retired');
  } else if (el.status === 'target') {
    investScore += WEIGHTS.status;
    reasons.push('Status: target (planned growth)');
  } else if (el.status === 'transitional') {
    migrateScore += WEIGHTS.status;
    reasons.push('Status: transitional');
  } else {
    tolerateScore += WEIGHTS.status * 0.5;
    investScore += WEIGHTS.status * 0.5;
  }

  // 4. Lifecycle phase
  if (el.lifecyclePhase === 'retire' || el.lifecyclePhase === 'phase_out') {
    eliminateScore += WEIGHTS.lifecycle;
    reasons.push(`Lifecycle: ${el.lifecyclePhase}`);
  } else if (el.lifecyclePhase === 'plan' || el.lifecyclePhase === 'build') {
    investScore += WEIGHTS.lifecycle;
    reasons.push(`Lifecycle: ${el.lifecyclePhase} — actively invested`);
  } else if (el.lifecyclePhase === 'operate') {
    tolerateScore += WEIGHTS.lifecycle;
  } else {
    tolerateScore += WEIGHTS.lifecycle * 0.5;
  }

  // 5. EOL proximity
  if (el.endOfLifeDate) {
    const eol = new Date(el.endOfLifeDate);
    const monthsToEOL = (eol.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000);
    if (monthsToEOL < 0) {
      eliminateScore += WEIGHTS.staleness;
      reasons.push('Past end-of-life date');
    } else if (monthsToEOL < 6) {
      migrateScore += WEIGHTS.staleness;
      reasons.push('EOL within 6 months');
    } else if (monthsToEOL < 12) {
      migrateScore += WEIGHTS.staleness * 0.5;
    }
  }

  // 6. Dependency weight (high deps → harder to eliminate)
  const totalDeps = el.inDegree + el.outDegree;
  if (totalDeps > 10) {
    // Core dependency — tolerate/invest, hard to eliminate
    investScore += WEIGHTS.dependencies * 0.6;
    tolerateScore += WEIGHTS.dependencies * 0.4;
    if (eliminateScore > 0) reasons.push(`${totalDeps} dependencies — high migration cost`);
  } else if (totalDeps > 5) {
    tolerateScore += WEIGHTS.dependencies;
  } else {
    // Low deps — easier to migrate/eliminate
    migrateScore += WEIGHTS.dependencies * 0.3;
    eliminateScore += WEIGHTS.dependencies * 0.3;
  }

  // Determine classification
  const scores = {
    tolerate: tolerateScore,
    invest: investScore,
    migrate: migrateScore,
    eliminate: eliminateScore,
  };

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const classification = sorted[0][0] as TIMEClassification;
  const topScore = sorted[0][1];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const confidence = Math.round((topScore / totalScore) * 100) / 100;

  return {
    elementId: el.id,
    classification,
    confidence,
    reasons: reasons.slice(0, 3),
  };
}

/**
 * Classify and persist TIME classifications to Neo4j.
 */
export async function classifyAndPersist(projectId: string): Promise<ClassificationResult[]> {
  const results = await classifyProject(projectId);

  // Batch update via individual SET statements
  for (const r of results) {
    await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId, id: $elementId})
       SET e.timeClassification = $classification, e.updatedAt = datetime().epochMillis`,
      { projectId, elementId: r.elementId, classification: r.classification },
    );
  }

  return results;
}
