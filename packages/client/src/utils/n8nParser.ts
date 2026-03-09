import type { ArchitectureElement, Connection } from '../stores/architectureStore';

// ── n8n JSON types ──────────────────────────────────────

interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  position: [number, number];
  disabled?: boolean;
  notes?: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

interface N8nConnectionTarget {
  node: string;
  type: string;
  index: number;
}

interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: Record<string, Record<string, N8nConnectionTarget[][]>>;
  active?: boolean;
  settings?: Record<string, unknown>;
  tags?: { id: string; name: string }[];
}

// ── ArchiMate mapping ───────────────────────────────────

interface ElementMapping {
  type: ArchitectureElement['type'];
  layer: ArchitectureElement['layer'];
  togafDomain: ArchitectureElement['togafDomain'];
}

const NODE_TYPE_RULES: { pattern: RegExp; mapping: ElementMapping }[] = [
  // Triggers → Business Service
  { pattern: /trigger/i, mapping: { type: 'business_service', layer: 'business', togafDomain: 'business' } },
  // HTTP / API calls → Application Service
  { pattern: /httpRequest|http/i, mapping: { type: 'application_service', layer: 'application', togafDomain: 'application' } },
  // Code nodes → Application Component
  { pattern: /\.code$|\.function$|functionItem/i, mapping: { type: 'application_component', layer: 'application', togafDomain: 'application' } },
  // Databases → Data Entity
  { pattern: /postgres|mongo|mysql|mariadb|redis|neo4j|sqlite|mssql|oracle|supabase|airtable/i, mapping: { type: 'data_entity', layer: 'information', togafDomain: 'data' } },
  // File / Storage / Infra → Technology Component
  { pattern: /s3|ftp|ssh|minio|googleDrive|dropbox|oneDrive|nextCloud/i, mapping: { type: 'technology_component', layer: 'technology', togafDomain: 'technology' } },
  // Message Queues → Technology Component
  { pattern: /rabbitmq|kafka|amqp|sqs/i, mapping: { type: 'technology_component', layer: 'technology', togafDomain: 'technology' } },
  // SaaS integrations → Application Service
  { pattern: /slack|gmail|sheets|notion|discord|telegram|teams|jira|asana|trello|hubspot|salesforce|stripe|twilio|sendgrid|mailchimp/i, mapping: { type: 'application_service', layer: 'application', togafDomain: 'application' } },
  // AI / LLM → Application Component
  { pattern: /openAi|langchain|agent|anthropic|ollama|gemini/i, mapping: { type: 'application_component', layer: 'application', togafDomain: 'application' } },
  // Transform / Logic → Business Process
  { pattern: /\.if$|\.switch$|\.merge$|\.set$|splitInBatches|\.filter$|\.sort$|\.limit$|\.removeDuplicates$|\.itemLists$|noOp|respondToWebhook/i, mapping: { type: 'process', layer: 'business', togafDomain: 'business' } },
];

const DEFAULT_MAPPING: ElementMapping = { type: 'application_service', layer: 'application', togafDomain: 'application' };

function mapNodeType(n8nType: string): ElementMapping {
  for (const rule of NODE_TYPE_RULES) {
    if (rule.pattern.test(n8nType)) return rule.mapping;
  }
  return DEFAULT_MAPPING;
}

// ── Layer Y positions (match TOGAF constants) ───────────

const LAYER_Y: Record<string, number> = {
  strategy: 12,
  business: 8,
  information: 4,
  application: 0,
  technology: -4,
};

function generateId(): string {
  return `n8n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Main parser ─────────────────────────────────────────

export function parseN8nWorkflow(input: string | object): { elements: ArchitectureElement[]; connections: Connection[] } {
  const workflow: N8nWorkflow = typeof input === 'string' ? JSON.parse(input) : input as N8nWorkflow;

  if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
    throw new Error('Invalid n8n workflow: missing nodes array');
  }

  // Build name→id lookup (n8n connections reference nodes by name)
  const nodeNameToId = new Map<string, string>();
  const elements: ArchitectureElement[] = [];

  // Track per-layer counts for grid positioning
  const layerCounts: Record<string, number> = {};

  // 1) Create a workflow-level meta element
  const workflowId = generateId();
  const workflowLayer = 'business';
  layerCounts[workflowLayer] = (layerCounts[workflowLayer] || 0);
  const wCol = layerCounts[workflowLayer]++;

  elements.push({
    id: workflowId,
    type: 'process',
    name: workflow.name || 'n8n Workflow',
    description: `n8n Workflow${workflow.id ? ` (ID: ${workflow.id})` : ''}${workflow.active ? ' [active]' : ' [inactive]'}`,
    layer: workflowLayer,
    togafDomain: 'business',
    maturityLevel: 3,
    riskLevel: 'low',
    status: 'current',
    position3D: { x: wCol * 3, y: LAYER_Y[workflowLayer], z: -3 },
    metadata: { n8nWorkflowId: workflow.id, source: 'n8n' },
  });

  // 2) Map each node to an architecture element
  for (const node of workflow.nodes) {
    const mapping = mapNodeType(node.type);
    const newId = generateId();
    nodeNameToId.set(node.name, newId);

    const layer = mapping.layer;
    layerCounts[layer] = layerCounts[layer] || 0;
    const col = layerCounts[layer];
    layerCounts[layer]++;

    const spacing = 3;
    const rowSize = 5;
    const x = (col % rowSize) * spacing - ((Math.min(rowSize, (layerCounts[layer])) - 1) * spacing) / 2;
    const z = Math.floor(col / rowSize) * spacing;

    elements.push({
      id: newId,
      type: mapping.type,
      name: node.name,
      description: `n8n: ${node.type}${node.typeVersion ? ` v${node.typeVersion}` : ''}${node.notes ? ` — ${node.notes}` : ''}`,
      layer,
      togafDomain: mapping.togafDomain,
      maturityLevel: 3,
      riskLevel: 'low',
      status: node.disabled ? 'retired' : 'current',
      position3D: { x, y: LAYER_Y[layer] || 0, z },
      metadata: {
        n8nNodeId: node.id,
        n8nType: node.type,
        n8nTypeVersion: node.typeVersion,
        source: 'n8n',
      },
    });
  }

  // 3) Flatten n8n connections → Connection[]
  const connections: Connection[] = [];

  // Link all nodes to the workflow element via belongs_to
  for (const [, nodeId] of nodeNameToId) {
    connections.push({
      id: generateId(),
      sourceId: nodeId,
      targetId: workflowId,
      type: 'belongs_to',
      label: 'part of workflow',
    });
  }

  // Parse n8n connections object
  if (workflow.connections) {
    for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
      const sourceId = nodeNameToId.get(sourceName);
      if (!sourceId) continue;

      for (const [, outputGroups] of Object.entries(outputs)) {
        if (!Array.isArray(outputGroups)) continue;

        for (let outputIdx = 0; outputIdx < outputGroups.length; outputIdx++) {
          const targets = outputGroups[outputIdx];
          if (!Array.isArray(targets)) continue;

          for (const target of targets) {
            const targetId = nodeNameToId.get(target.node);
            if (!targetId) continue;

            // Determine connection type: trigger→first = 'triggers', rest = 'data_flow'
            const sourceNode = workflow.nodes.find((n) => n.name === sourceName);
            const isTrigger = sourceNode && /trigger/i.test(sourceNode.type);

            connections.push({
              id: generateId(),
              sourceId,
              targetId,
              type: isTrigger ? 'triggers' : 'data_flow',
              label: outputGroups.length > 1 ? `output_${outputIdx}` : undefined,
            });
          }
        }
      }
    }
  }

  return { elements, connections };
}
