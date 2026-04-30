import { runCypher, serializeNeo4jProperties } from '../../config/neo4j';
import type { AgentPersona } from '@thearchitect/shared/src/types/simulation.types';

interface FilteredElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  togafDomain: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  description: string;
}

interface FilteredConnection {
  sourceName: string;
  targetName: string;
  type: string;
  label: string;
}

/**
 * Project-level vision context shared across all agents.
 * Vision/principles/drivers/goals are non-negotiable framing — agents must
 * reject actions that violate principles, regardless of scenario pressure.
 */
export interface ProjectVisionContext {
  visionStatement: string;
  principles: string[];
  drivers: string[];
  goals: string[];
}

// Generic words that match too broadly to be useful as personal-concern filters.
// Without this skip-list, every persona with priorities like "General architecture
// oversight" would match every element with "architecture" in name/description.
const GENERIC_PRIORITY_WORDS = new Set([
  'general', 'architecture', 'oversight', 'the', 'and', 'for', 'with',
  'all', 'any', 'new', 'old', 'use', 'has', 'have',
]);

/**
 * Splits persona.priorities into individual lowercase keywords (>= 3 chars,
 * non-generic) for case-insensitive Cypher CONTAINS matching.
 *
 * Example: ["cost_reduction", "audit-trail compliance"] → ["cost", "reduction", "audit", "trail", "compliance"]
 */
function extractPriorityKeywords(priorities: string[] | undefined): string[] {
  if (!priorities || priorities.length === 0) return [];
  const words = new Set<string>();
  for (const p of priorities) {
    const parts = String(p).toLowerCase().split(/[\s_\-,/]+/);
    for (const w of parts) {
      const trimmed = w.trim();
      if (trimmed.length >= 3 && !GENERIC_PRIORITY_WORDS.has(trimmed)) {
        words.add(trimmed);
      }
    }
  }
  return Array.from(words);
}

function toFilteredElement(props: Record<string, unknown>): FilteredElement {
  return {
    id: String(props.id || ''),
    name: String(props.name || ''),
    type: String(props.type || ''),
    layer: String(props.layer || ''),
    togafDomain: String(props.togafDomain || ''),
    status: String(props.status || ''),
    riskLevel: String(props.riskLevel || ''),
    maturityLevel: Number(props.maturityLevel) || 0,
    description: String(props.description || '').slice(0, 100),
  };
}

/**
 * Builds a filtered architecture context for a specific agent persona.
 * Only includes elements within the persona's visible layers and domains.
 * Injects hard constraints (budget, risk threshold) into the prompt.
 *
 * Two-tier element rendering:
 * - "Personal Concerns" — elements matching the persona's priorities (keyword
 *   match on name/description) plus their 1-hop CONNECTS_TO neighbors. This is
 *   what gives different stakeholder types DIFFERENT element views, which is
 *   the primary driver of authentic disagreement.
 * - "Background Architecture" — the broad layer/domain-filtered listing,
 *   unchanged from the prior implementation, kept for reference.
 *
 * Backward-compatible: if no priority keywords match (or persona has only
 * generic priorities like "General architecture oversight"), the Personal
 * Concerns section is omitted and the prompt looks like before.
 */
export async function buildAgentContext(
  projectId: string,
  persona: AgentPersona,
  previousRoundSummary?: string,
  projectVision?: ProjectVisionContext,
): Promise<string> {
  // Query elements filtered by persona's visibility (broad background view)
  const elementRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.layer IN $visibleLayers
       AND e.togafDomain IN $visibleDomains
     RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
            e.togafDomain as togafDomain, e.status as status,
            e.riskLevel as riskLevel, e.maturityLevel as maturityLevel,
            e.description as description
     ORDER BY e.layer, e.name
     LIMIT 200`,
    {
      projectId,
      visibleLayers: persona.visibleLayers,
      visibleDomains: persona.visibleDomains,
    },
  );

  const elements: FilteredElement[] = elementRecords.map((r) =>
    toFilteredElement(serializeNeo4jProperties(r.toObject())),
  );

  // Personal-Concerns query — elements matching the persona's priority keywords.
  // This is what diverges per stakeholder: CFO sees cost/budget elements, CSO
  // sees ESG/compliance elements, HR sees grievance/rights elements, etc.
  const priorityKeywords = extractPriorityKeywords(persona.priorities);
  let primaryConcerns: FilteredElement[] = [];
  let neighborConcerns: FilteredElement[] = [];

  if (priorityKeywords.length > 0) {
    const primaryRecords = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       WHERE e.layer IN $visibleLayers
         AND ANY(kw IN $keywords WHERE
           toLower(coalesce(e.name, '')) CONTAINS kw OR
           toLower(coalesce(e.description, '')) CONTAINS kw
         )
       RETURN e.id as id, e.name as name, e.type as type, e.layer as layer,
              e.togafDomain as togafDomain, e.status as status,
              e.riskLevel as riskLevel, e.maturityLevel as maturityLevel,
              e.description as description
       ORDER BY e.layer, e.name
       LIMIT 30`,
      {
        projectId,
        visibleLayers: persona.visibleLayers,
        keywords: priorityKeywords,
      },
    );
    primaryConcerns = primaryRecords.map((r) =>
      toFilteredElement(serializeNeo4jProperties(r.toObject())),
    );

    // 1-hop CONNECTS_TO neighbors of the primary concerns — gives the agent the
    // immediate dependencies / dependents of the elements they care about.
    if (primaryConcerns.length > 0) {
      const primaryIds = primaryConcerns.map((p) => p.id);
      const neighborRecords = await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId})-[:CONNECTS_TO]-(n:ArchitectureElement {projectId: $projectId})
         WHERE e.id IN $primaryIds
           AND NOT n.id IN $primaryIds
           AND n.layer IN $visibleLayers
         RETURN DISTINCT n.id as id, n.name as name, n.type as type, n.layer as layer,
                n.togafDomain as togafDomain, n.status as status,
                n.riskLevel as riskLevel, n.maturityLevel as maturityLevel,
                n.description as description
         ORDER BY n.layer, n.name
         LIMIT 20`,
        {
          projectId,
          primaryIds,
          visibleLayers: persona.visibleLayers,
        },
      );
      neighborConcerns = neighborRecords.map((r) =>
        toFilteredElement(serializeNeo4jProperties(r.toObject())),
      );
    }
  }

  // Query connections between visible elements
  const connRecords = await runCypher(
    `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
     WHERE a.layer IN $visibleLayers AND a.togafDomain IN $visibleDomains
       AND b.layer IN $visibleLayers AND b.togafDomain IN $visibleDomains
     RETURN a.name as sourceName, b.name as targetName, r.type as type, r.label as label
     LIMIT 300`,
    {
      projectId,
      visibleLayers: persona.visibleLayers,
      visibleDomains: persona.visibleDomains,
    },
  );

  const connections: FilteredConnection[] = connRecords.map((r) => {
    const props = serializeNeo4jProperties(r.toObject());
    return {
      sourceName: String(props.sourceName || ''),
      targetName: String(props.targetName || ''),
      type: String(props.type || ''),
      label: String(props.label || ''),
    };
  });

  // Build context text
  const lines: string[] = [];

  // Project vision / principles / drivers / goals — non-negotiable framing.
  // Agents must reject actions that violate principles regardless of scenario pressure.
  if (projectVision) {
    const hasVision = (projectVision.visionStatement || '').trim().length > 0;
    const hasPrinciples = projectVision.principles && projectVision.principles.length > 0;
    const hasDrivers = projectVision.drivers && projectVision.drivers.length > 0;
    const hasGoals = projectVision.goals && projectVision.goals.length > 0;
    if (hasVision || hasPrinciples || hasDrivers || hasGoals) {
      lines.push(`## Enterprise Vision (NON-NEGOTIABLE)`);
      if (hasVision) {
        lines.push(`Vision: ${projectVision.visionStatement.trim()}`);
      }
      if (hasPrinciples) {
        lines.push(`Principles (any action violating these MUST be rejected):`);
        for (const p of projectVision.principles) {
          if (p && p.trim()) lines.push(`  - ${p.trim()}`);
        }
      }
      if (hasGoals) {
        lines.push(`Project goals: ${projectVision.goals.filter((g) => g && g.trim()).join('; ')}`);
      }
      if (hasDrivers) {
        lines.push(`Drivers: ${projectVision.drivers.filter((d) => d && d.trim()).join('; ')}`);
      }
      lines.push('');
    }
  }

  // Personal Concerns — elements matching this persona's priority keywords,
  // plus their 1-hop neighbors. Different personas see different concerns,
  // which is the structural lever against the all-APPROVE consensus pattern.
  if (primaryConcerns.length > 0) {
    const matchedKeywordsLine = priorityKeywords.length > 0
      ? ` (matched on: ${priorityKeywords.slice(0, 6).join(', ')}${priorityKeywords.length > 6 ? '…' : ''})`
      : '';
    lines.push(
      `## Your Personal Concerns (${primaryConcerns.length} elements directly tied to your priorities)${matchedKeywordsLine}`,
    );
    lines.push(`### Primary stakes — your decisions on these matter most`);
    for (const el of primaryConcerns) {
      lines.push(
        `- [ID:${el.id}] "${el.name}" [${el.type}] status=${el.status}, risk=${el.riskLevel}, maturity=${el.maturityLevel}${el.description ? ` — ${el.description}` : ''}`,
      );
    }
    if (neighborConcerns.length > 0) {
      lines.push(`### Connected dependencies (1-hop) — affected when your stakes change`);
      for (const el of neighborConcerns) {
        lines.push(
          `- [ID:${el.id}] "${el.name}" [${el.type}] status=${el.status}, risk=${el.riskLevel}${el.description ? ` — ${el.description}` : ''}`,
        );
      }
    }
    lines.push('');
  }

  // Element listing with IDs (critical for action validation)
  const backgroundHeader = primaryConcerns.length > 0
    ? `## Background Architecture (Reference — ${elements.length} elements)`
    : `## Your Visible Architecture (${elements.length} elements)`;
  lines.push(backgroundHeader);

  const byLayer: Record<string, FilteredElement[]> = {};
  for (const el of elements) {
    const layer = el.layer || 'unknown';
    if (!byLayer[layer]) byLayer[layer] = [];
    byLayer[layer].push(el);
  }

  for (const layer of persona.visibleLayers) {
    const layerEls = byLayer[layer];
    if (!layerEls || layerEls.length === 0) continue;
    lines.push(`### ${layer.charAt(0).toUpperCase() + layer.slice(1)} Layer (${layerEls.length})`);
    for (const el of layerEls) {
      lines.push(
        `- [ID:${el.id}] "${el.name}" [${el.type}] status=${el.status}, risk=${el.riskLevel}, maturity=${el.maturityLevel}${el.description ? ` — ${el.description}` : ''}`,
      );
    }
  }

  if (connections.length > 0) {
    lines.push(`\n## Connections (${connections.length})`);
    for (const c of connections) {
      lines.push(`- "${c.sourceName}" --[${c.type}]--> "${c.targetName}"${c.label ? ` (${c.label})` : ''}`);
    }
  }

  // Statistics
  const highRisk = elements.filter((e) => e.riskLevel === 'high' || e.riskLevel === 'critical').length;
  const transitional = elements.filter((e) => e.status === 'transitional').length;
  const retired = elements.filter((e) => e.status === 'retired').length;

  if (highRisk > 0 || transitional > 0 || retired > 0) {
    lines.push(`\n## Key Statistics`);
    if (highRisk > 0) lines.push(`- High/critical risk elements: ${highRisk}`);
    if (transitional > 0) lines.push(`- Elements in transition: ${transitional}`);
    if (retired > 0) lines.push(`- Retired elements: ${retired}`);
  }

  // Hard constraints injection
  lines.push(`\n## YOUR CONSTRAINTS (HARD LIMITS — DO NOT VIOLATE)`);
  if (persona.budgetConstraint) {
    lines.push(`- Budget ceiling: $${persona.budgetConstraint.toLocaleString()} — you CANNOT recommend investments exceeding this`);
  }
  if (persona.riskThreshold) {
    lines.push(`- Risk threshold: ${persona.riskThreshold} — you CANNOT approve changes that raise risk above "${persona.riskThreshold}"`);
  }
  lines.push(`- Capacity: ${persona.expectedCapacity} parallel changes max — exceeding this causes delays and quality degradation`);
  lines.push(`- You can ONLY reference elements listed above by their [ID:...]. Do NOT invent elements that don't exist.`);

  // Previous round context
  if (previousRoundSummary) {
    lines.push(`\n## Previous Round Summary`);
    lines.push(previousRoundSummary);
  }

  return lines.join('\n');
}

/**
 * Gets all element IDs visible to a persona (for validation).
 */
export async function getVisibleElementIds(
  projectId: string,
  persona: AgentPersona,
): Promise<Set<string>> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     WHERE e.layer IN $visibleLayers
       AND e.togafDomain IN $visibleDomains
     RETURN e.id as id`,
    {
      projectId,
      visibleLayers: persona.visibleLayers,
      visibleDomains: persona.visibleDomains,
    },
  );

  return new Set(records.map((r) => r.get('id') as string));
}
