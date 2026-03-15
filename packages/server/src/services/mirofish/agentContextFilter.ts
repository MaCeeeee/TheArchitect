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
 * Builds a filtered architecture context for a specific agent persona.
 * Only includes elements within the persona's visible layers and domains.
 * Injects hard constraints (budget, risk threshold) into the prompt.
 */
export async function buildAgentContext(
  projectId: string,
  persona: AgentPersona,
  previousRoundSummary?: string,
): Promise<string> {
  // Query elements filtered by persona's visibility
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

  const elements: FilteredElement[] = elementRecords.map((r) => {
    const props = serializeNeo4jProperties(r.toObject());
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
  });

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

  // Element listing with IDs (critical for action validation)
  lines.push(`## Your Visible Architecture (${elements.length} elements)`);

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
