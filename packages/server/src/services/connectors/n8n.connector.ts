/**
 * n8n Connector (Server-side)
 *
 * Connects to n8n REST API to discover and import workflows as architecture elements.
 * Port of the client-side n8nParser.ts with live API fetching.
 *
 * API: GET /api/v1/workflows — lists all workflows
 *      GET /api/v1/workflows/:id — single workflow with nodes + connections
 *
 * Auth: API Key via header `X-N8N-API-KEY`
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';

// ─── Node Type → ArchiMate Mapping (from client n8nParser.ts) ───

interface ElementMapping {
  type: string;
  layer: string;
}

const NODE_TYPE_RULES: { pattern: RegExp; mapping: ElementMapping }[] = [
  { pattern: /trigger/i, mapping: { type: 'business_service', layer: 'business' } },
  { pattern: /httpRequest|http/i, mapping: { type: 'application_service', layer: 'application' } },
  { pattern: /\.code$|\.function$|functionItem/i, mapping: { type: 'application_component', layer: 'application' } },
  { pattern: /postgres|mongo|mysql|mariadb|redis|neo4j|sqlite|mssql|oracle|supabase|airtable/i, mapping: { type: 'data_entity', layer: 'application' } },
  { pattern: /s3|ftp|ssh|minio|googleDrive|dropbox|oneDrive|nextCloud/i, mapping: { type: 'technology_component', layer: 'technology' } },
  { pattern: /rabbitmq|kafka|amqp|sqs/i, mapping: { type: 'technology_component', layer: 'technology' } },
  { pattern: /slack|gmail|sheets|notion|discord|telegram|teams|jira|asana|trello|hubspot|salesforce|stripe|twilio|sendgrid|mailchimp/i, mapping: { type: 'application_service', layer: 'application' } },
  { pattern: /openAi|langchain|agent|anthropic|ollama|gemini/i, mapping: { type: 'application_component', layer: 'application' } },
  { pattern: /\.if$|\.switch$|\.merge$|\.set$|splitInBatches|\.filter$|\.sort$|\.limit$|\.removeDuplicates$|\.itemLists$|noOp|respondToWebhook/i, mapping: { type: 'process', layer: 'business' } },
];

const DEFAULT_MAPPING: ElementMapping = { type: 'application_service', layer: 'application' };

function mapNodeType(n8nType: string): ElementMapping {
  for (const rule of NODE_TYPE_RULES) {
    if (rule.pattern.test(n8nType)) return rule.mapping;
  }
  return DEFAULT_MAPPING;
}

// ─── n8n Types ───

interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  disabled?: boolean;
  notes?: string;
}

interface N8nConnectionTarget {
  node: string;
  type: string;
  index: number;
}

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: Record<string, Record<string, N8nConnectionTarget[][]>>;
  tags?: { id: string; name: string }[];
  createdAt?: string;
  updatedAt?: string;
}

export class N8nConnector implements IConnector {
  readonly type: ConnectorType = 'n8n';
  readonly displayName = 'n8n';
  readonly supportedAuthMethods: AuthMethod[] = ['api_key'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const resp = await this.request(config, '/api/v1/workflows?limit=1');
      const data = await resp.json() as { data: unknown[] };
      return { success: true, message: `Connected — n8n instance reachable` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async getAvailableTypes(_config: ConnectorConfig): Promise<string[]> {
    return ['Workflow', 'Trigger', 'Action', 'Code', 'Database', 'API', 'Integration'];
  }

  async fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];

    // Fetch all workflows
    const workflows = await this.fetchAllWorkflows(config);

    // Filter by tag if specified
    const tagFilter = config.filters.tag?.toLowerCase();
    const activeOnly = config.filters.activeOnly === 'true';

    const filtered = workflows.filter(wf => {
      if (activeOnly && !wf.active) return false;
      if (tagFilter && !(wf.tags || []).some(t => t.name.toLowerCase().includes(tagFilter))) return false;
      return true;
    });

    for (const wf of filtered) {
      try {
        // Fetch full workflow with nodes
        const fullWf = await this.fetchWorkflow(config, wf.id);
        const result = this.parseWorkflow(fullWf);
        elements.push(...result.elements);
        connections.push(...result.connections);
      } catch (err: any) {
        warnings.push(`Failed to parse workflow "${wf.name}": ${err.message}`);
      }
    }

    warnings.push(`n8n: ${filtered.length} workflows, ${elements.length} nodes imported`);
    return { elements, connections, warnings, metadata: { totalWorkflows: workflows.length, imported: filtered.length } };
  }

  // ─── Workflow Parsing ───

  private parseWorkflow(wf: N8nWorkflow): { elements: ParsedElement[]; connections: ParsedConnection[] } {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const nodeNameToId = new Map<string, string>();

    // Workflow-level element
    const wfElemId = `elem-${uuid().slice(0, 8)}`;
    elements.push({
      id: wfElemId,
      name: wf.name || 'n8n Workflow',
      type: 'process',
      layer: 'business',
      description: `n8n Workflow (ID: ${wf.id})${wf.active ? ' [active]' : ' [inactive]'}`,
      status: wf.active ? 'current' : 'retired',
      riskLevel: 'low',
      maturityLevel: 3,
      properties: { n8nWorkflowId: wf.id, source: 'n8n' },
    });

    // Map each node
    for (const node of wf.nodes || []) {
      const mapping = mapNodeType(node.type);
      const elemId = `elem-${uuid().slice(0, 8)}`;
      nodeNameToId.set(node.name, elemId);

      elements.push({
        id: elemId,
        name: node.name,
        type: mapping.type,
        layer: mapping.layer,
        description: `n8n: ${node.type}${node.typeVersion ? ` v${node.typeVersion}` : ''}${node.notes ? ` — ${node.notes}` : ''}`,
        status: node.disabled ? 'retired' : 'current',
        riskLevel: 'low',
        maturityLevel: 3,
        properties: { n8nNodeId: node.id, n8nType: node.type, n8nWorkflowId: wf.id, source: 'n8n' },
      });

      // Link node to workflow
      connections.push({
        id: `conn-${uuid().slice(0, 8)}`,
        sourceId: elemId,
        targetId: wfElemId,
        type: 'composition',
      });
    }

    // Parse n8n connections
    if (wf.connections) {
      for (const [sourceName, outputs] of Object.entries(wf.connections)) {
        const sourceId = nodeNameToId.get(sourceName);
        if (!sourceId) continue;

        for (const [, outputGroups] of Object.entries(outputs)) {
          if (!Array.isArray(outputGroups)) continue;

          for (const targets of outputGroups) {
            if (!Array.isArray(targets)) continue;

            for (const target of targets) {
              const targetId = nodeNameToId.get(target.node);
              if (!targetId) continue;

              const sourceNode = (wf.nodes || []).find(n => n.name === sourceName);
              const isTrigger = sourceNode && /trigger/i.test(sourceNode.type);

              connections.push({
                id: `conn-${uuid().slice(0, 8)}`,
                sourceId,
                targetId,
                type: isTrigger ? 'triggering' : 'flow',
              });
            }
          }
        }
      }
    }

    return { elements, connections };
  }

  // ─── API Helpers ───

  private async fetchAllWorkflows(config: ConnectorConfig): Promise<N8nWorkflow[]> {
    const limit = parseInt(config.filters.limit || '100', 10);
    const resp = await this.request(config, `/api/v1/workflows?limit=${limit}`);
    const data = await resp.json() as { data: N8nWorkflow[] };
    return data.data || [];
  }

  private async fetchWorkflow(config: ConnectorConfig, id: string): Promise<N8nWorkflow> {
    const resp = await this.request(config, `/api/v1/workflows/${id}`);
    return await resp.json() as N8nWorkflow;
  }

  private async request(config: ConnectorConfig, path: string): Promise<Response> {
    const host = config.baseUrl.replace(/\/$/, '');
    const url = `${host}${path}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // n8n uses X-N8N-API-KEY header
    const apiKey = config.credentials.api_key || config.credentials.token || '';
    if (apiKey) {
      headers['X-N8N-API-KEY'] = apiKey;
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`n8n API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
    }

    return resp;
  }
}

/** @internal Exported for testing only */
export const __testExports = { mapNodeType, NODE_TYPE_RULES, DEFAULT_MAPPING };
