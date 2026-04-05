/**
 * Sparx EA Connector
 *
 * Connects to Sparx Enterprise Architect repositories via direct database access.
 * Sparx EA stores models in relational databases (SQL Server, MySQL, PostgreSQL, SQLite).
 *
 * Key tables:
 *   t_object  — all elements (Object_ID, Name, Object_Type, Stereotype, Note, Status)
 *   t_connector — relationships (Connector_ID, Start_Object_ID, End_Object_ID, Connector_Type)
 *   t_package — package hierarchy
 *   t_diagram — diagrams
 *   t_objectproperties — tagged values
 *
 * Since direct DB drivers are heavy dependencies, this connector uses a REST proxy pattern:
 * it expects a lightweight REST endpoint that wraps Sparx EA DB queries.
 * Format: GET /api/elements?package={id}&limit=500
 *
 * Alternatively supports Sparx EA Cloud Services (Pro Cloud Server) REST API.
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';
import { ELEMENT_TYPES, LEGACY_TYPE_MAP } from '@thearchitect/shared';

// ─── Sparx EA Object Type → ArchiMate Mapping ───

const TYPE_SET = new Set(ELEMENT_TYPES.map(et => et.type));
const TYPE_TO_DOMAIN = new Map(ELEMENT_TYPES.map(et => [et.type, et.domain]));
const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy', business: 'business', application: 'application',
  data: 'application', technology: 'technology', physical: 'technology',
  motivation: 'motivation', implementation: 'implementation_migration', composite: 'other',
};

const SPARX_TYPE_MAP: Record<string, string> = {
  // ArchiMate stereotypes (Sparx EA ArchiMate MDG)
  'archimate_applicationcomponent': 'application_component',
  'archimate_applicationservice': 'application_service',
  'archimate_applicationinterface': 'application_interface',
  'archimate_applicationfunction': 'application_function',
  'archimate_applicationprocess': 'application_process',
  'archimate_dataobject': 'data_object',
  'archimate_businessprocess': 'process',
  'archimate_businessservice': 'business_service',
  'archimate_businessactor': 'business_actor',
  'archimate_businessrole': 'business_role',
  'archimate_businessfunction': 'business_function',
  'archimate_businessobject': 'business_object',
  'archimate_businesscapability': 'business_capability',
  'archimate_contract': 'contract',
  'archimate_product': 'product',
  'archimate_technologyservice': 'technology_service',
  'archimate_node': 'node',
  'archimate_device': 'device',
  'archimate_systemsoftware': 'system_software',
  'archimate_artifact': 'artifact',
  'archimate_communicationnetwork': 'communication_network',
  'archimate_path': 'path',
  'archimate_stakeholder': 'stakeholder',
  'archimate_driver': 'driver',
  'archimate_assessment': 'assessment',
  'archimate_goal': 'goal',
  'archimate_requirement': 'requirement',
  'archimate_constraint': 'constraint',
  'archimate_principle': 'principle',
  'archimate_workpackage': 'work_package',
  'archimate_deliverable': 'deliverable',
  'archimate_plateau': 'plateau',
  'archimate_gap': 'gap',
  'archimate_location': 'location',
  'archimate_grouping': 'grouping',
  // Generic UML types
  'class': 'business_object',
  'component': 'application_component',
  'interface': 'application_interface',
  'package': 'grouping',
  'activity': 'process',
  'usecase': 'business_service',
  'actor': 'business_actor',
  'node': 'node',
  'artifact': 'artifact',
  'deployment': 'node',
  'object': 'business_object',
  'requirement': 'requirement',
  'risk': 'assessment',
  'constraint': 'constraint',
  'issue': 'assessment',
  'change': 'work_package',
  'document': 'artifact',
  'action': 'process',
};

const SPARX_CONNECTOR_MAP: Record<string, string> = {
  'association': 'association',
  'aggregation': 'aggregation',
  'composition': 'composition',
  'dependency': 'serving',
  'generalization': 'specialization',
  'realization': 'realization',
  'nesting': 'composition',
  'usage': 'serving',
  'flow': 'flow',
  'informationflow': 'flow',
  'access': 'access',
  'influence': 'influence',
  'serving': 'serving',
  'triggering': 'triggering',
  'assignment': 'assignment',
  'specialization': 'specialization',
};

const SPARX_STATUS_MAP: Record<string, string> = {
  'proposed': 'target',
  'approved': 'target',
  'implemented': 'current',
  'validated': 'current',
  'mandatory': 'current',
  'deprecated': 'transitional',
  'obsolete': 'retired',
};

export class SparxEAConnector implements IConnector {
  readonly type: ConnectorType = 'sparx_ea';
  readonly displayName = 'Sparx EA';
  readonly supportedAuthMethods: AuthMethod[] = ['basic', 'api_key'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const resp = await this.request(config, '/api/elements?limit=1');
      const data = await resp.json() as any;
      const count = data.totalCount ?? data.length ?? 0;
      return { success: true, message: `Connected — ${count} elements available` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async getAvailableTypes(config: ConnectorConfig): Promise<string[]> {
    try {
      const resp = await this.request(config, '/api/element-types');
      const data = await resp.json() as string[];
      return data;
    } catch {
      return ['Component', 'Class', 'Interface', 'Activity', 'UseCase', 'Actor', 'Node', 'Artifact', 'Requirement', 'Package'];
    }
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
    const idMap = new Map<string, string>(); // Sparx Object_ID → our ID

    // Fetch elements
    const packageFilter = config.filters.packageId ? `&packageId=${config.filters.packageId}` : '';
    const typeFilter = config.filters.objectTypes ? `&types=${encodeURIComponent(config.filters.objectTypes)}` : '';
    const limit = config.filters.limit || '500';

    try {
      const resp = await this.request(config, `/api/elements?limit=${limit}${packageFilter}${typeFilter}`);
      const data = await resp.json() as any;
      const items = data.elements || data.value || data || [];

      for (const item of (Array.isArray(items) ? items : [])) {
        const name = item.Name || item.name || '';
        if (!name) continue;

        const objectId = String(item.Object_ID || item.objectId || item.id);
        const objectType = (item.Object_Type || item.objectType || '').toLowerCase();
        const stereotype = (item.Stereotype || item.stereotype || '').toLowerCase();

        const type = mapSparxType(objectType, stereotype);
        const elemId = `elem-${uuid().slice(0, 8)}`;
        idMap.set(objectId, elemId);

        const status = SPARX_STATUS_MAP[(item.Status || item.status || '').toLowerCase()] || 'current';

        elements.push({
          id: elemId,
          name,
          type,
          layer: inferLayer(type),
          description: stripHtml(item.Note || item.note || item.description || ''),
          status,
          riskLevel: 'low',
          maturityLevel: 3,
          properties: {
            sparxId: objectId,
            sparxType: objectType,
            ...(stereotype ? { stereotype } : {}),
            ...(item.Alias || item.alias ? { alias: item.Alias || item.alias } : {}),
            ...(item.Version || item.version ? { version: item.Version || item.version } : {}),
            ...(item.Author || item.author ? { author: item.Author || item.author } : {}),
          },
        });
      }
    } catch (err: any) {
      warnings.push(`Elements fetch failed: ${err.message}`);
    }

    // Fetch connectors (relationships)
    try {
      const resp = await this.request(config, `/api/connectors?limit=2000${packageFilter}`);
      const data = await resp.json() as any;
      const items = data.connectors || data.value || data || [];

      for (const item of (Array.isArray(items) ? items : [])) {
        const startId = String(item.Start_Object_ID || item.startObjectId || item.sourceId);
        const endId = String(item.End_Object_ID || item.endObjectId || item.targetId);

        const sourceElemId = idMap.get(startId);
        const targetElemId = idMap.get(endId);
        if (!sourceElemId || !targetElemId) continue;

        const connType = (item.Connector_Type || item.connectorType || item.type || '').toLowerCase();
        const relType = SPARX_CONNECTOR_MAP[connType] || 'association';

        connections.push({
          id: `conn-${uuid().slice(0, 8)}`,
          sourceId: sourceElemId,
          targetId: targetElemId,
          type: relType,
          label: item.Name || item.name || undefined,
        });
      }
    } catch (err: any) {
      warnings.push(`Connectors fetch failed: ${err.message}`);
    }

    warnings.push(`Sparx EA: ${elements.length} elements, ${connections.length} connectors imported`);
    return { elements, connections, warnings, metadata: { totalCount: elements.length } };
  }

  // ─── HTTP Helper ───

  private async request(config: ConnectorConfig, path: string): Promise<Response> {
    const host = config.baseUrl.replace(/\/$/, '');
    const url = `${host}${path}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (config.credentials.username) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.credentials.username}:${config.credentials.password || ''}`).toString('base64')}`;
    } else if (config.credentials.token || config.credentials.api_key) {
      headers['Authorization'] = `Bearer ${config.credentials.token || config.credentials.api_key}`;
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`Sparx EA API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
    }

    return resp;
  }
}

// ─── Helpers ───

function mapSparxType(objectType: string, stereotype: string): string {
  // Stereotype takes priority (ArchiMate MDG uses stereotypes)
  const stereoKey = `archimate_${stereotype.replace(/[\s-]+/g, '')}`;
  if (SPARX_TYPE_MAP[stereoKey]) return SPARX_TYPE_MAP[stereoKey];
  if (SPARX_TYPE_MAP[stereotype]) return SPARX_TYPE_MAP[stereotype];
  if (SPARX_TYPE_MAP[objectType]) return SPARX_TYPE_MAP[objectType];

  // Try legacy map
  const legacy = LEGACY_TYPE_MAP[objectType as keyof typeof LEGACY_TYPE_MAP];
  if (legacy && TYPE_SET.has(legacy as any)) return legacy;

  return 'application_component';
}

function inferLayer(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type as any);
  return domain ? (DOMAIN_TO_LAYER[domain] || 'other') : 'other';
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim().substring(0, 500);
}

/** @internal Exported for testing only */
export const __testExports = { mapSparxType, inferLayer, stripHtml, SPARX_TYPE_MAP, SPARX_CONNECTOR_MAP, SPARX_STATUS_MAP };
