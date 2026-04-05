/**
 * ServiceNow CMDB Connector
 *
 * Connects to ServiceNow Table API to fetch CIs from CMDB
 * and enrich architecture elements with CMDB data.
 *
 * Implements both IConnector (create elements) and ICostEnrichmentConnector (enrich costs).
 *
 * ServiceNow Table API:
 *   GET /api/now/table/{tableName}?sysparm_query=...&sysparm_fields=...
 *   Auth: Basic (user:pass) or OAuth2 or API Key (via custom header)
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, ICostEnrichmentConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';
import type { CostEnrichmentResult } from '@thearchitect/shared';
import { ELEMENT_TYPES, LEGACY_TYPE_MAP } from '@thearchitect/shared';

// ─── Type Mappings ───

const TYPE_SET = new Set(ELEMENT_TYPES.map(et => et.type));

const CMDB_CLASS_MAP: Record<string, string> = {
  // Application CIs
  'cmdb_ci_appl': 'application_component',
  'cmdb_ci_service': 'application_service',
  'cmdb_ci_service_auto': 'application_service',
  'cmdb_ci_service_discovered': 'application_service',
  'cmdb_ci_app_server': 'application_component',
  'cmdb_ci_web_site': 'application_component',
  'cmdb_ci_database': 'data_object',
  'cmdb_ci_db_instance': 'data_object',
  'cmdb_ci_db_ora_instance': 'data_object',
  'cmdb_ci_db_mssql_instance': 'data_object',
  // Infrastructure CIs
  'cmdb_ci_server': 'node',
  'cmdb_ci_win_server': 'node',
  'cmdb_ci_linux_server': 'node',
  'cmdb_ci_unix_server': 'node',
  'cmdb_ci_esx_server': 'node',
  'cmdb_ci_vm_instance': 'node',
  'cmdb_ci_computer': 'device',
  'cmdb_ci_hardware': 'device',
  // Network
  'cmdb_ci_ip_switch': 'communication_network',
  'cmdb_ci_ip_router': 'communication_network',
  'cmdb_ci_ip_firewall': 'communication_network',
  'cmdb_ci_lb': 'communication_network',
  'cmdb_ci_netgear': 'communication_network',
  // Storage
  'cmdb_ci_storage_device': 'artifact',
  'cmdb_ci_san': 'artifact',
  'cmdb_ci_nas': 'artifact',
  // Software
  'cmdb_ci_spkg': 'system_software',
  'cmdb_ci_os': 'system_software',
  'cmdb_ci_middleware': 'system_software',
  // Business
  'cmdb_ci_business_app': 'application_component',
  'cmdb_ci_service_business': 'business_service',
  'cmdb_ci_service_technical': 'application_service',
  // Cloud
  'cmdb_ci_cloud_service_account': 'node',
};

const RELATION_TYPE_MAP: Record<string, string> = {
  'Depends on::Used by': 'serving',
  'Runs on::Runs': 'assignment',
  'Contains::Contained by': 'composition',
  'Hosted on::Hosts': 'assignment',
  'Cluster of::Cluster': 'aggregation',
  'Members::Member of': 'aggregation',
  'Connects to::Connected by': 'flow',
  'Sends data to::Receives data from': 'flow',
  'Managed by::Manages': 'association',
  'Provided by::Provides': 'serving',
  'Used by::Uses': 'serving',
};

const LIFECYCLE_MAP: Record<string, string> = {
  'pipeline': 'target',
  'catalog': 'target',
  'installed': 'current',
  'operational': 'current',
  'retired': 'retired',
  'absent': 'retired',
  'stolen': 'retired',
};

const CRITICALITY_TO_RISK: Record<string, string> = {
  '1 - most critical': 'critical',
  '2 - somewhat critical': 'high',
  '3 - less critical': 'medium',
  '4 - not critical': 'low',
};

// Default fields fetched from ServiceNow
const CI_FIELDS = [
  'sys_id', 'name', 'short_description', 'sys_class_name',
  'install_status', 'operational_status', 'busines_criticality',
  'assigned_to', 'category', 'subcategory', 'cost', 'cost_cc',
  'u_annual_cost', 'u_monthly_cost', 'u_user_count',
  'u_technical_fitness', 'u_functional_fitness',
  'manufacturer', 'model_id', 'serial_number',
  'ip_address', 'dns_domain', 'fqdn',
  'sys_updated_on', 'sys_created_on',
].join(',');

// Tables that contain application portfolio data
const APP_TABLES = ['cmdb_ci_appl', 'cmdb_ci_business_app', 'cmdb_ci_service'];

export class ServiceNowConnector implements IConnector, ICostEnrichmentConnector {
  readonly type: ConnectorType = 'servicenow';
  readonly displayName = 'ServiceNow CMDB';
  readonly supportedAuthMethods: AuthMethod[] = ['basic', 'oauth2', 'api_key'];
  readonly enrichableFields = [
    'annualCost', 'monthlyInfraCost', 'userCount',
    'technicalFitness', 'functionalFitness', 'transformationStrategy',
  ];

  // ─── IConnector Methods ───

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const resp = await this.request(config, '/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id');
      const data = await resp.json() as { result: unknown[] };
      return { success: true, message: `Connected — ServiceNow instance reachable` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async getAvailableTypes(config: ConnectorConfig): Promise<string[]> {
    try {
      const resp = await this.request(config, '/api/now/table/sys_db_object?sysparm_query=nameSTARTSWITHcmdb_ci&sysparm_fields=name,label&sysparm_limit=100');
      const data = await resp.json() as { result: Array<{ name: string; label: string }> };
      return data.result.map(r => `${r.name} (${r.label})`);
    } catch {
      return Object.keys(CMDB_CLASS_MAP);
    }
  }

  async fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const tables = config.filters.tables
      ? config.filters.tables.split(',').map(s => s.trim())
      : APP_TABLES;

    const sysparmQuery = config.filters.sysparm_query || '';
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];
    const idMap = new Map<string, string>(); // ServiceNow sys_id → our ID

    for (const table of tables) {
      let query = `sysparm_fields=${CI_FIELDS}&sysparm_limit=500`;
      if (sysparmQuery) query += `&sysparm_query=${encodeURIComponent(sysparmQuery)}`;

      try {
        const resp = await this.request(config, `/api/now/table/${table}?${query}`);
        const data = await resp.json() as { result: any[] };

        for (const ci of data.result || []) {
          const name = ci.name || ci.short_description || '';
          if (!name) continue;

          const type = mapCIClass(ci.sys_class_name || table);
          const elemId = `elem-${uuid().slice(0, 8)}`;
          idMap.set(ci.sys_id, elemId);

          const status = LIFECYCLE_MAP[(ci.install_status || '').toLowerCase()] || 'current';
          const riskLevel = CRITICALITY_TO_RISK[(ci.busines_criticality || '').toLowerCase()] || 'low';

          elements.push({
            id: elemId,
            name,
            type,
            layer: inferLayer(type),
            description: ci.short_description || '',
            status,
            riskLevel,
            maturityLevel: 3,
            properties: {
              servicenowId: ci.sys_id,
              sysClassName: ci.sys_class_name,
              ...(ci.ip_address ? { ipAddress: ci.ip_address } : {}),
              ...(ci.fqdn ? { fqdn: ci.fqdn } : {}),
              ...(ci.manufacturer?.display_value ? { manufacturer: ci.manufacturer.display_value } : {}),
            },
          });
        }
      } catch (err: any) {
        warnings.push(`Failed to fetch ${table}: ${err.message}`);
      }
    }

    // Fetch relationships
    if (elements.length > 0 && idMap.size <= 500) {
      try {
        const sysIds = Array.from(idMap.keys()).slice(0, 200);
        const relQuery = `sysparm_query=parent.sys_idIN${sysIds.join(',')}&sysparm_fields=parent,child,type&sysparm_limit=2000`;
        const resp = await this.request(config, `/api/now/table/cmdb_rel_ci?${relQuery}`);
        const data = await resp.json() as { result: any[] };

        for (const rel of data.result || []) {
          const parentSysId = rel.parent?.value;
          const childSysId = rel.child?.value;
          if (!parentSysId || !childSysId) continue;

          const sourceId = idMap.get(parentSysId);
          const targetId = idMap.get(childSysId);
          if (!sourceId || !targetId) continue;

          const relTypeLabel = rel.type?.display_value || '';
          const relType = RELATION_TYPE_MAP[relTypeLabel] || 'association';

          connections.push({
            id: `conn-${uuid().slice(0, 8)}`,
            sourceId,
            targetId,
            type: relType,
          });
        }
      } catch (err: any) {
        warnings.push(`Failed to fetch relationships: ${err.message}`);
      }
    }

    warnings.push(`ServiceNow: ${elements.length} CIs, ${connections.length} relations imported`);

    return { elements, connections, warnings, metadata: { tables, totalCount: elements.length } };
  }

  // ─── ICostEnrichmentConnector Methods ───

  async fetchCostData(config: ConnectorConfig): Promise<{
    enrichments: CostEnrichmentResult[];
    warnings: string[];
  }> {
    const tables = config.filters.tables
      ? config.filters.tables.split(',').map(s => s.trim())
      : APP_TABLES;

    const enrichments: CostEnrichmentResult[] = [];
    const warnings: string[] = [];

    for (const table of tables) {
      try {
        const fields = 'sys_id,name,short_description,cost,u_annual_cost,u_monthly_cost,u_user_count,u_technical_fitness,u_functional_fitness,busines_criticality,install_status,operational_status';
        const resp = await this.request(config, `/api/now/table/${table}?sysparm_fields=${fields}&sysparm_limit=500`);
        const data = await resp.json() as { result: any[] };

        for (const ci of data.result || []) {
          const name = ci.name || ci.short_description || '';
          if (!name) continue;

          const costFields: Record<string, unknown> = {};

          // annualCost from custom field or computed from cost
          const annualCost = parseFloat(ci.u_annual_cost) || parseFloat(ci.cost) * 12 || 0;
          if (annualCost > 0) costFields.annualCost = annualCost;

          // monthlyInfraCost
          const monthly = parseFloat(ci.u_monthly_cost) || parseFloat(ci.cost) || 0;
          if (monthly > 0) costFields.monthlyInfraCost = monthly;

          // userCount
          const userCount = parseInt(ci.u_user_count, 10);
          if (userCount > 0) costFields.userCount = userCount;

          // technicalFitness from custom field (1-5)
          const techFit = parseInt(ci.u_technical_fitness, 10);
          if (techFit >= 1 && techFit <= 5) costFields.technicalFitness = techFit;

          // functionalFitness from custom field (1-5)
          const funcFit = parseInt(ci.u_functional_fitness, 10);
          if (funcFit >= 1 && funcFit <= 5) costFields.functionalFitness = funcFit;

          // transformationStrategy from lifecycle status
          const strategy = mapLifecycleToStrategy(ci.install_status, ci.operational_status);
          if (strategy) costFields.transformationStrategy = strategy;

          if (Object.keys(costFields).length > 0) {
            enrichments.push({
              sourceKey: ci.sys_id,
              sourceName: name,
              fields: costFields as any,
              confidence: 0.80,
              metadata: {
                servicenowId: ci.sys_id,
                table,
                businessCriticality: ci.busines_criticality,
              },
            });
          }
        }
      } catch (err: any) {
        warnings.push(`Failed to fetch cost data from ${table}: ${err.message}`);
      }
    }

    return { enrichments, warnings };
  }

  async discoverSources(config: ConnectorConfig): Promise<Array<{ key: string; name: string; type?: string }>> {
    const results: Array<{ key: string; name: string; type?: string }> = [];

    for (const table of APP_TABLES) {
      try {
        const resp = await this.request(config, `/api/now/table/${table}?sysparm_fields=sys_id,name,sys_class_name&sysparm_limit=200`);
        const data = await resp.json() as { result: any[] };

        for (const ci of data.result || []) {
          if (ci.name) {
            results.push({
              key: ci.sys_id,
              name: ci.name,
              type: ci.sys_class_name,
            });
          }
        }
      } catch {
        // skip table on error
      }
    }

    return results;
  }

  // ─── HTTP Helper ───

  private async request(config: ConnectorConfig, path: string): Promise<Response> {
    const host = config.baseUrl.replace(/\/$/, '');
    const url = `${host}${path}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // Auth
    if (config.authMethod === 'basic' || config.credentials.username) {
      const user = config.credentials.username || '';
      const pass = config.credentials.password || '';
      headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    } else if (config.credentials.token || config.credentials.api_key) {
      headers['Authorization'] = `Bearer ${config.credentials.token || config.credentials.api_key}`;
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`ServiceNow API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
    }

    return resp;
  }
}

// ─── Helpers ───

const TYPE_TO_DOMAIN = new Map(ELEMENT_TYPES.map(et => [et.type, et.domain]));
const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy', business: 'business', application: 'application',
  data: 'application', technology: 'technology', physical: 'technology',
  motivation: 'motivation', implementation: 'implementation_migration', composite: 'other',
};

function mapCIClass(sysClassName: string): string {
  const key = sysClassName.toLowerCase().trim();
  const mapped = CMDB_CLASS_MAP[key];
  if (mapped && TYPE_SET.has(mapped as any)) return mapped;

  // Fallback heuristics
  if (key.includes('server') || key.includes('vm')) return 'node';
  if (key.includes('appl') || key.includes('app')) return 'application_component';
  if (key.includes('db') || key.includes('database')) return 'data_object';
  if (key.includes('network') || key.includes('switch') || key.includes('router')) return 'communication_network';
  if (key.includes('storage')) return 'artifact';
  return 'application_component';
}

function inferLayer(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type as any);
  return domain ? (DOMAIN_TO_LAYER[domain] || 'other') : 'other';
}

function mapLifecycleToStrategy(installStatus: string | undefined, operationalStatus: string | undefined): string | null {
  const status = (installStatus || '').toLowerCase();
  const opStatus = (operationalStatus || '').toLowerCase();

  if (status === 'retired' || opStatus === 'retired') return 'retire';
  if (status === 'pipeline' || status === 'on order') return 'replatform';
  if (opStatus === 'non-operational' || opStatus === 'repair in progress') return 'retain';
  if (status === 'installed' && opStatus === 'operational') return 'retain';
  return null;
}

/** @internal Exported for testing only */
export const __testExports = { mapCIClass, inferLayer, mapLifecycleToStrategy, CMDB_CLASS_MAP, RELATION_TYPE_MAP, LIFECYCLE_MAP, CRITICALITY_TO_RISK };
