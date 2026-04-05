/**
 * SAP Connector
 *
 * Connects to SAP systems to fetch landscape data and enrich cost fields.
 * Supports multiple SAP modes:
 *   - SAP Solution Manager (LMDB) — primary, landscape data via OData
 *   - SAP S/4HANA — OData for business objects
 *   - SAP Cloud ALM — REST API for application portfolio
 *
 * Implements both IConnector (create elements) and ICostEnrichmentConnector (enrich costs).
 *
 * API Patterns:
 *   SolMan LMDB:  GET /sap/opu/odata/sap/LMDB_ODATA_SRV/SoftwareComponents?$format=json
 *   Cloud ALM:    GET /api/calm-tasks/v1/landscape-objects
 *   S/4 OData:    GET /sap/opu/odata/sap/API_BUSINESS_PARTNER?$format=json
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, ICostEnrichmentConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';
import type { CostEnrichmentResult } from '@thearchitect/shared';
import { ELEMENT_TYPES } from '@thearchitect/shared';

// ─── Type Mappings: SAP Object Types → ArchiMate ───

const TYPE_SET = new Set(ELEMENT_TYPES.map(et => et.type));

const SAP_TYPE_MAP: Record<string, string> = {
  // Solution Manager LMDB types
  'software_component': 'application_component',
  'technical_system': 'system_software',
  'technical_instance': 'node',
  'business_system': 'application_component',
  'logical_component': 'application_component',
  'product': 'application_component',
  'product_version': 'application_component',
  'host': 'node',
  'database': 'data_object',
  // S/4HANA object types
  'business_process': 'process',
  'business_role': 'business_role',
  'organizational_unit': 'business_actor',
  'business_partner': 'business_actor',
  'cost_center': 'business_object',
  'profit_center': 'business_object',
  'company_code': 'business_actor',
  'plant': 'facility',
  'material': 'business_object',
  // Cloud ALM types
  'application': 'application_component',
  'service': 'application_service',
  'integration': 'application_interface',
  'process_step': 'process',
  'requirement': 'requirement',
  'feature': 'work_package',
};

const SAP_RELATION_MAP: Record<string, string> = {
  'runs_on': 'assignment',
  'depends_on': 'serving',
  'contains': 'composition',
  'communicates_with': 'flow',
  'uses': 'serving',
  'manages': 'association',
  'realized_by': 'realization',
  'deployed_on': 'assignment',
  'connects_to': 'flow',
};

const SAP_STATUS_MAP: Record<string, string> = {
  'active': 'current',
  'productive': 'current',
  'in_development': 'target',
  'planned': 'target',
  'decommissioned': 'retired',
  'inactive': 'retired',
  'testing': 'transitional',
  'staging': 'transitional',
};

// ─── SAP API Mode Detection ───

type SAPMode = 'solman' | 'cloud_alm' | 's4hana';

function detectMode(config: ConnectorConfig): SAPMode {
  const mode = config.filters.mode?.toLowerCase();
  if (mode === 'cloud_alm' || mode === 'calm') return 'cloud_alm';
  if (mode === 's4hana' || mode === 's4') return 's4hana';
  return 'solman'; // default
}

export class SAPConnector implements IConnector, ICostEnrichmentConnector {
  readonly type: ConnectorType = 'sap';
  readonly displayName = 'SAP';
  readonly supportedAuthMethods: AuthMethod[] = ['basic', 'oauth2', 'api_key'];
  readonly enrichableFields = [
    'annualCost', 'monthlyInfraCost', 'userCount',
    'technicalFitness', 'transformationStrategy', 'hourlyRate',
  ];

  // ─── IConnector Methods ───

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const mode = detectMode(config);

      if (mode === 'cloud_alm') {
        const resp = await this.request(config, '/api/calm-tasks/v1/landscape-objects?$top=1');
        await resp.json();
        return { success: true, message: 'Connected — SAP Cloud ALM reachable' };
      }

      if (mode === 's4hana') {
        const resp = await this.request(config, '/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=1&$format=json');
        await resp.json();
        return { success: true, message: 'Connected — SAP S/4HANA reachable' };
      }

      // SolMan LMDB
      const resp = await this.request(config, '/sap/opu/odata/sap/LMDB_ODATA_SRV/SoftwareComponents?$top=1&$format=json');
      const data = await resp.json() as any;
      const count = data?.d?.results?.length ?? 0;
      return { success: true, message: `Connected — SAP Solution Manager (${count > 0 ? 'data available' : 'empty'})` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async getAvailableTypes(config: ConnectorConfig): Promise<string[]> {
    const mode = detectMode(config);

    if (mode === 'cloud_alm') {
      return ['Application', 'Service', 'Integration', 'ProcessStep', 'Requirement', 'Feature'];
    }
    if (mode === 's4hana') {
      return ['BusinessPartner', 'CostCenter', 'ProfitCenter', 'CompanyCode', 'Plant', 'Material', 'BusinessProcess'];
    }
    return ['SoftwareComponent', 'TechnicalSystem', 'TechnicalInstance', 'BusinessSystem', 'LogicalComponent', 'Host', 'Database'];
  }

  async fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const mode = detectMode(config);

    if (mode === 'cloud_alm') return this.fetchCloudALM(config);
    if (mode === 's4hana') return this.fetchS4Hana(config);
    return this.fetchSolMan(config);
  }

  // ─── SolMan LMDB Fetch ───

  private async fetchSolMan(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];
    const idMap = new Map<string, string>();

    // Fetch software components
    const endpoints = [
      { path: '/sap/opu/odata/sap/LMDB_ODATA_SRV/SoftwareComponents?$format=json&$top=500', objType: 'software_component' },
      { path: '/sap/opu/odata/sap/LMDB_ODATA_SRV/TechnicalSystems?$format=json&$top=500', objType: 'technical_system' },
      { path: '/sap/opu/odata/sap/LMDB_ODATA_SRV/Hosts?$format=json&$top=500', objType: 'host' },
    ];

    for (const ep of endpoints) {
      try {
        const resp = await this.request(config, ep.path);
        const data = await resp.json() as any;
        const results = data?.d?.results || [];

        for (const item of results) {
          const name = item.Name || item.Description || item.SystemId || '';
          if (!name) continue;

          const type = SAP_TYPE_MAP[ep.objType] || 'application_component';
          const elemId = `elem-${uuid().slice(0, 8)}`;
          const sapId = item.Id || item.SystemId || item.Name;
          idMap.set(sapId, elemId);

          const status = SAP_STATUS_MAP[(item.Status || item.LifecycleStatus || '').toLowerCase()] || 'current';

          elements.push({
            id: elemId,
            name,
            type,
            layer: inferLayer(type),
            description: item.Description || '',
            status,
            riskLevel: 'low',
            maturityLevel: 3,
            properties: {
              sapId,
              sapType: ep.objType,
              ...(item.Version ? { version: item.Version } : {}),
              ...(item.Vendor ? { vendor: item.Vendor } : {}),
            },
          });
        }
      } catch (err: any) {
        warnings.push(`SolMan ${ep.objType}: ${err.message}`);
      }
    }

    // Fetch relationships between technical systems
    try {
      const resp = await this.request(config, '/sap/opu/odata/sap/LMDB_ODATA_SRV/SystemRelations?$format=json&$top=1000');
      const data = await resp.json() as any;
      const rels = data?.d?.results || [];

      for (const rel of rels) {
        const sourceId = idMap.get(rel.SourceSystemId);
        const targetId = idMap.get(rel.TargetSystemId);
        if (!sourceId || !targetId) continue;

        const relType = SAP_RELATION_MAP[(rel.RelationType || '').toLowerCase()] || 'association';
        connections.push({
          id: `conn-${uuid().slice(0, 8)}`,
          sourceId,
          targetId,
          type: relType,
        });
      }
    } catch (err: any) {
      warnings.push(`SolMan relations: ${err.message}`);
    }

    warnings.push(`SAP SolMan: ${elements.length} landscape objects, ${connections.length} relations imported`);
    return { elements, connections, warnings, metadata: { mode: 'solman', totalCount: elements.length } };
  }

  // ─── Cloud ALM Fetch ───

  private async fetchCloudALM(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];
    const idMap = new Map<string, string>();

    try {
      const resp = await this.request(config, '/api/calm-tasks/v1/landscape-objects?$top=500');
      const data = await resp.json() as any;
      const items = data?.value || data?.results || data || [];

      for (const item of (Array.isArray(items) ? items : [])) {
        const name = item.name || item.displayName || '';
        if (!name) continue;

        const rawType = (item.type || item.objectType || 'application').toLowerCase().replace(/[\s-]+/g, '_');
        const type = SAP_TYPE_MAP[rawType] || 'application_component';
        const elemId = `elem-${uuid().slice(0, 8)}`;
        idMap.set(item.id || name, elemId);

        const status = SAP_STATUS_MAP[(item.status || item.lifecycleStatus || '').toLowerCase()] || 'current';

        elements.push({
          id: elemId,
          name,
          type,
          layer: inferLayer(type),
          description: item.description || '',
          status,
          riskLevel: 'low',
          maturityLevel: 3,
          properties: {
            sapId: item.id,
            sapType: rawType,
            sapMode: 'cloud_alm',
          },
        });
      }
    } catch (err: any) {
      warnings.push(`Cloud ALM: ${err.message}`);
    }

    warnings.push(`SAP Cloud ALM: ${elements.length} objects imported`);
    return { elements, connections, warnings, metadata: { mode: 'cloud_alm', totalCount: elements.length } };
  }

  // ─── S/4HANA Fetch ───

  private async fetchS4Hana(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];

    const endpoints = [
      { path: '/sap/opu/odata/sap/API_COSTCENTER_0001/A_CostCenter?$format=json&$top=200', objType: 'cost_center', nameField: 'CostCenterName' },
      { path: '/sap/opu/odata/sap/API_PROFITCENTER_0001/A_ProfitCenter?$format=json&$top=200', objType: 'profit_center', nameField: 'ProfitCenterName' },
      { path: '/sap/opu/odata/sap/API_COMPANYCODE_SRV/A_CompanyCode?$format=json&$top=100', objType: 'company_code', nameField: 'CompanyCodeName' },
    ];

    for (const ep of endpoints) {
      try {
        const resp = await this.request(config, ep.path);
        const data = await resp.json() as any;
        const results = data?.d?.results || [];

        for (const item of results) {
          const name = item[ep.nameField] || item.Description || '';
          if (!name) continue;

          const type = SAP_TYPE_MAP[ep.objType] || 'business_object';
          const elemId = `elem-${uuid().slice(0, 8)}`;

          elements.push({
            id: elemId,
            name,
            type: TYPE_SET.has(type as any) ? type : 'business_object',
            layer: inferLayer(type),
            description: item.Description || '',
            status: 'current',
            riskLevel: 'low',
            maturityLevel: 3,
            properties: {
              sapId: item.CostCenter || item.ProfitCenter || item.CompanyCode || '',
              sapType: ep.objType,
              sapMode: 's4hana',
            },
          });
        }
      } catch (err: any) {
        warnings.push(`S/4HANA ${ep.objType}: ${err.message}`);
      }
    }

    warnings.push(`SAP S/4HANA: ${elements.length} business objects imported`);
    return { elements, connections, warnings, metadata: { mode: 's4hana', totalCount: elements.length } };
  }

  // ─── ICostEnrichmentConnector Methods ───

  async fetchCostData(config: ConnectorConfig): Promise<{
    enrichments: CostEnrichmentResult[];
    warnings: string[];
  }> {
    const mode = detectMode(config);
    const enrichments: CostEnrichmentResult[] = [];
    const warnings: string[] = [];

    if (mode === 's4hana') {
      // Fetch cost center actual costs
      try {
        const resp = await this.request(config, '/sap/opu/odata/sap/API_COSTCENTER_0001/A_CostCenter?$format=json&$top=200&$select=CostCenter,CostCenterName,CompanyCode');
        const data = await resp.json() as any;
        const results = data?.d?.results || [];

        for (const cc of results) {
          const name = cc.CostCenterName || '';
          if (!name) continue;

          enrichments.push({
            sourceKey: cc.CostCenter,
            sourceName: name,
            fields: {} as any, // S/4 cost centers provide context, actual cost values need CO-PA reports
            confidence: 0.70,
            metadata: {
              sapId: cc.CostCenter,
              companyCode: cc.CompanyCode,
              sapMode: 's4hana',
            },
          });
        }
      } catch (err: any) {
        warnings.push(`S/4 cost centers: ${err.message}`);
      }
    }

    if (mode === 'solman') {
      // SolMan landscape objects with lifecycle/status for strategy mapping
      try {
        const resp = await this.request(config, '/sap/opu/odata/sap/LMDB_ODATA_SRV/SoftwareComponents?$format=json&$top=500');
        const data = await resp.json() as any;
        const results = data?.d?.results || [];

        for (const item of results) {
          const name = item.Name || item.Description || '';
          if (!name) continue;

          const fields: Record<string, unknown> = {};

          // Map lifecycle to transformation strategy
          const status = (item.Status || item.LifecycleStatus || '').toLowerCase();
          const strategy = mapSAPStatusToStrategy(status);
          if (strategy) fields.transformationStrategy = strategy;

          if (Object.keys(fields).length > 0) {
            enrichments.push({
              sourceKey: item.Id || item.SystemId || name,
              sourceName: name,
              fields: fields as any,
              confidence: 0.75,
              metadata: {
                sapId: item.Id || item.SystemId,
                version: item.Version,
                vendor: item.Vendor,
                sapMode: 'solman',
              },
            });
          }
        }
      } catch (err: any) {
        warnings.push(`SolMan enrichment: ${err.message}`);
      }
    }

    if (mode === 'cloud_alm') {
      try {
        const resp = await this.request(config, '/api/calm-tasks/v1/landscape-objects?$top=500');
        const data = await resp.json() as any;
        const items = data?.value || data?.results || data || [];

        for (const item of (Array.isArray(items) ? items : [])) {
          const name = item.name || item.displayName || '';
          if (!name) continue;

          const fields: Record<string, unknown> = {};

          const status = (item.status || item.lifecycleStatus || '').toLowerCase();
          const strategy = mapSAPStatusToStrategy(status);
          if (strategy) fields.transformationStrategy = strategy;

          if (item.userCount && item.userCount > 0) fields.userCount = item.userCount;
          if (item.annualCost && item.annualCost > 0) fields.annualCost = item.annualCost;
          if (item.monthlyCost && item.monthlyCost > 0) fields.monthlyInfraCost = item.monthlyCost;

          if (Object.keys(fields).length > 0) {
            enrichments.push({
              sourceKey: item.id || name,
              sourceName: name,
              fields: fields as any,
              confidence: 0.80,
              metadata: {
                sapId: item.id,
                sapMode: 'cloud_alm',
              },
            });
          }
        }
      } catch (err: any) {
        warnings.push(`Cloud ALM enrichment: ${err.message}`);
      }
    }

    return { enrichments, warnings };
  }

  async discoverSources(config: ConnectorConfig): Promise<Array<{ key: string; name: string; type?: string }>> {
    const mode = detectMode(config);
    const results: Array<{ key: string; name: string; type?: string }> = [];

    try {
      if (mode === 'cloud_alm') {
        const resp = await this.request(config, '/api/calm-tasks/v1/landscape-objects?$top=500');
        const data = await resp.json() as any;
        const items = data?.value || data?.results || data || [];
        for (const item of (Array.isArray(items) ? items : [])) {
          if (item.name || item.displayName) {
            results.push({ key: item.id || item.name, name: item.name || item.displayName, type: item.type });
          }
        }
      } else if (mode === 's4hana') {
        const resp = await this.request(config, '/sap/opu/odata/sap/API_COSTCENTER_0001/A_CostCenter?$format=json&$top=200&$select=CostCenter,CostCenterName');
        const data = await resp.json() as any;
        for (const cc of data?.d?.results || []) {
          if (cc.CostCenterName) {
            results.push({ key: cc.CostCenter, name: cc.CostCenterName, type: 'CostCenter' });
          }
        }
      } else {
        const resp = await this.request(config, '/sap/opu/odata/sap/LMDB_ODATA_SRV/SoftwareComponents?$format=json&$top=500&$select=Id,Name');
        const data = await resp.json() as any;
        for (const item of data?.d?.results || []) {
          if (item.Name) {
            results.push({ key: item.Id || item.Name, name: item.Name, type: 'SoftwareComponent' });
          }
        }
      }
    } catch {
      // return empty on error
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

    // SAP typically uses Basic auth
    if (config.credentials.username) {
      const user = config.credentials.username;
      const pass = config.credentials.password || '';
      headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    } else if (config.credentials.token || config.credentials.api_key) {
      headers['Authorization'] = `Bearer ${config.credentials.token || config.credentials.api_key}`;
    }

    // SAP CSRF token handling (needed for write ops, but we only read)
    headers['X-CSRF-Token'] = 'Fetch';

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`SAP API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
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

function inferLayer(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type as any);
  return domain ? (DOMAIN_TO_LAYER[domain] || 'other') : 'other';
}

function mapSAPStatusToStrategy(status: string): string | null {
  if (status === 'decommissioned' || status === 'inactive' || status === 'end_of_life') return 'retire';
  if (status === 'planned' || status === 'in_development') return 'replatform';
  if (status === 'testing' || status === 'staging') return 'rehost';
  if (status === 'active' || status === 'productive') return 'retain';
  return null;
}

/** @internal Exported for testing only */
export const __testExports = { inferLayer, mapSAPStatusToStrategy, SAP_TYPE_MAP, SAP_RELATION_MAP, SAP_STATUS_MAP };
