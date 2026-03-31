import { runCypher } from '../config/neo4j';

// ─── Types ───

export interface PortfolioElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  description: string;
  lifecyclePhase: string | null;
  goLiveDate: string | null;
  endOfLifeDate: string | null;
  replacedBy: string | null;
  timeClassification: string | null;
  businessOwner: string | null;
  technicalOwner: string | null;
  businessCriticality: string | null;
  annualCost: number | null;
  userCount: number | null;
  inDegree: number;
  outDegree: number;
  updatedAt: string;
  createdAt: string;
}

export interface PortfolioSummary {
  totalApplications: number;
  totalServices: number;
  totalTechnology: number;
  lifecycleDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  criticalityDistribution: Record<string, number>;
  avgMaturity: number;
  totalAnnualCost: number;
  appsNearingEOL: number;
  appsWithoutOwner: number;
}

export interface LifecycleEvent {
  elementId: string;
  elementName: string;
  elementType: string;
  phase: string;
  goLiveDate: string | null;
  endOfLifeDate: string | null;
  status: string;
}

// ─── Application types relevant for portfolio views ───

const APPLICATION_TYPES = [
  'application', 'application_component', 'application_service',
  'service', 'application_function',
];

const SERVICE_TYPES = [
  'application_service', 'service', 'technology_service', 'business_service',
];

const TECHNOLOGY_TYPES = [
  'node', 'device', 'system_software', 'artifact',
  'technology_service', 'platform_service', 'technology_component', 'infrastructure',
];

// ─── Portfolio Inventory ───

export async function getPortfolioInventory(
  projectId: string,
  filters?: {
    types?: string[];
    layers?: string[];
    status?: string[];
    riskLevel?: string[];
    lifecyclePhase?: string[];
    search?: string;
  },
): Promise<PortfolioElement[]> {
  let whereClause = 'e.projectId = $projectId';
  const params: Record<string, unknown> = { projectId };

  if (filters?.types && filters.types.length > 0) {
    whereClause += ' AND e.type IN $types';
    params.types = filters.types;
  }
  if (filters?.layers && filters.layers.length > 0) {
    whereClause += ' AND e.layer IN $layers';
    params.layers = filters.layers;
  }
  if (filters?.status && filters.status.length > 0) {
    whereClause += ' AND e.status IN $statuses';
    params.statuses = filters.status;
  }
  if (filters?.riskLevel && filters.riskLevel.length > 0) {
    whereClause += ' AND e.riskLevel IN $riskLevels';
    params.riskLevels = filters.riskLevel;
  }
  if (filters?.lifecyclePhase && filters.lifecyclePhase.length > 0) {
    whereClause += ' AND e.lifecyclePhase IN $phases';
    params.phases = filters.lifecyclePhase;
  }
  if (filters?.search) {
    whereClause += ' AND (toLower(e.name) CONTAINS toLower($search) OR toLower(e.description) CONTAINS toLower($search))';
    params.search = filters.search;
  }

  const records = await runCypher(
    `MATCH (e:ArchitectureElement)
     WHERE ${whereClause}
     OPTIONAL MATCH (e)-[out]->()
     OPTIONAL MATCH ()-[inc]->(e)
     RETURN e.id AS id, e.name AS name, e.type AS type, e.layer AS layer,
            e.status AS status, e.riskLevel AS riskLevel,
            e.maturityLevel AS maturityLevel, e.description AS description,
            e.lifecyclePhase AS lifecyclePhase,
            e.goLiveDate AS goLiveDate, e.endOfLifeDate AS endOfLifeDate,
            e.replacedBy AS replacedBy, e.timeClassification AS timeClassification,
            e.businessOwner AS businessOwner, e.technicalOwner AS technicalOwner,
            e.businessCriticality AS businessCriticality,
            e.annualCost AS annualCost, e.userCount AS userCount,
            count(DISTINCT out) AS outDegree, count(DISTINCT inc) AS inDegree,
            e.updatedAt AS updatedAt, e.createdAt AS createdAt
     ORDER BY e.name`,
    params,
  );

  return records.map((r) => ({
    id: r.get('id'),
    name: r.get('name') || '',
    type: r.get('type') || '',
    layer: r.get('layer') || '',
    status: r.get('status') || 'current',
    riskLevel: r.get('riskLevel') || 'low',
    maturityLevel: r.get('maturityLevel')?.toNumber?.() ?? 3,
    description: r.get('description') || '',
    lifecyclePhase: r.get('lifecyclePhase') || null,
    goLiveDate: r.get('goLiveDate') || null,
    endOfLifeDate: r.get('endOfLifeDate') || null,
    replacedBy: r.get('replacedBy') || null,
    timeClassification: r.get('timeClassification') || null,
    businessOwner: r.get('businessOwner') || null,
    technicalOwner: r.get('technicalOwner') || null,
    businessCriticality: r.get('businessCriticality') || null,
    annualCost: r.get('annualCost')?.toNumber?.() ?? null,
    userCount: r.get('userCount')?.toNumber?.() ?? null,
    inDegree: r.get('inDegree')?.toNumber?.() || 0,
    outDegree: r.get('outDegree')?.toNumber?.() || 0,
    updatedAt: r.get('updatedAt') || '',
    createdAt: r.get('createdAt') || '',
  }));
}

// ─── Portfolio Summary / KPIs ───

export async function getPortfolioSummary(projectId: string): Promise<PortfolioSummary> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.type AS type, e.status AS status, e.riskLevel AS riskLevel,
            e.lifecyclePhase AS lifecyclePhase, e.maturityLevel AS maturity,
            e.annualCost AS annualCost, e.endOfLifeDate AS eolDate,
            e.businessOwner AS owner, e.businessCriticality AS criticality`,
    { projectId },
  );

  const appTypeSet = new Set(APPLICATION_TYPES);
  const svcTypeSet = new Set(SERVICE_TYPES);
  const techTypeSet = new Set(TECHNOLOGY_TYPES);

  let totalApps = 0, totalServices = 0, totalTech = 0;
  const lifecycle: Record<string, number> = {};
  const statusDist: Record<string, number> = {};
  const riskDist: Record<string, number> = {};
  const critDist: Record<string, number> = {};
  let maturitySum = 0, maturityCount = 0;
  let totalCost = 0;
  let nearingEOL = 0, noOwner = 0;

  const now = new Date();
  const sixMonths = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

  for (const r of records) {
    const type = r.get('type') || '';
    const status = r.get('status') || 'current';
    const risk = r.get('riskLevel') || 'low';
    const phase = r.get('lifecyclePhase') || 'unknown';
    const maturity = r.get('maturity')?.toNumber?.() ?? 3;
    const cost = r.get('annualCost')?.toNumber?.() ?? 0;
    const eolDate = r.get('eolDate');
    const owner = r.get('owner');
    const criticality = r.get('criticality') || 'unknown';

    if (appTypeSet.has(type)) totalApps++;
    if (svcTypeSet.has(type)) totalServices++;
    if (techTypeSet.has(type)) totalTech++;

    lifecycle[phase] = (lifecycle[phase] || 0) + 1;
    statusDist[status] = (statusDist[status] || 0) + 1;
    riskDist[risk] = (riskDist[risk] || 0) + 1;
    critDist[criticality] = (critDist[criticality] || 0) + 1;

    maturitySum += maturity;
    maturityCount++;
    totalCost += cost;

    if (eolDate) {
      const eol = new Date(eolDate);
      if (eol <= sixMonths) nearingEOL++;
    }
    if (!owner) noOwner++;
  }

  return {
    totalApplications: totalApps,
    totalServices: totalServices,
    totalTechnology: totalTech,
    lifecycleDistribution: lifecycle,
    statusDistribution: statusDist,
    riskDistribution: riskDist,
    criticalityDistribution: critDist,
    avgMaturity: maturityCount > 0 ? Math.round((maturitySum / maturityCount) * 10) / 10 : 0,
    totalAnnualCost: totalCost,
    appsNearingEOL: nearingEOL,
    appsWithoutOwner: noOwner,
  };
}

// ─── Lifecycle Timeline ───

export async function getLifecycleTimeline(projectId: string): Promise<LifecycleEvent[]> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.goLiveDate IS NOT NULL OR e.endOfLifeDate IS NOT NULL
     RETURN e.id AS id, e.name AS name, e.type AS type,
            e.lifecyclePhase AS phase, e.goLiveDate AS goLive,
            e.endOfLifeDate AS eol, e.status AS status
     ORDER BY COALESCE(e.goLiveDate, e.endOfLifeDate)`,
    { projectId },
  );

  return records.map((r) => ({
    elementId: r.get('id'),
    elementName: r.get('name') || '',
    elementType: r.get('type') || '',
    phase: r.get('phase') || 'unknown',
    goLiveDate: r.get('goLive') || null,
    endOfLifeDate: r.get('eol') || null,
    status: r.get('status') || 'current',
  }));
}

// ─── Update lifecycle fields for a single element ───

export async function updateElementLifecycle(
  projectId: string,
  elementId: string,
  fields: {
    lifecyclePhase?: string;
    goLiveDate?: string | null;
    endOfLifeDate?: string | null;
    replacedBy?: string | null;
    timeClassification?: string | null;
    businessOwner?: string | null;
    technicalOwner?: string | null;
    businessCriticality?: string | null;
    annualCost?: number | null;
    userCount?: number | null;
  },
): Promise<void> {
  const sets: string[] = ['e.updatedAt = datetime().epochMillis'];
  const params: Record<string, unknown> = { projectId, elementId };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      sets.push(`e.${key} = $${key}`);
      params[key] = value;
    }
  }

  await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId, id: $elementId})
     SET ${sets.join(', ')}`,
    params,
  );
}

// ─── Bulk update lifecycle phase ───

export async function bulkUpdateLifecycle(
  projectId: string,
  updates: Array<{ elementId: string; lifecyclePhase: string }>,
): Promise<number> {
  let updated = 0;
  for (const u of updates) {
    await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId, id: $elementId})
       SET e.lifecyclePhase = $phase, e.updatedAt = datetime().epochMillis`,
      { projectId, elementId: u.elementId, phase: u.lifecyclePhase },
    );
    updated++;
  }
  return updated;
}
