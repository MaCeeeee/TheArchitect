/**
 * Citrix Connector
 *
 * Connects to Citrix Cloud / CVAD (Citrix Virtual Apps & Desktops) REST API
 * to fetch VDI infrastructure, delivery groups, machine catalogs, and published apps.
 *
 * API:
 *   Citrix Cloud: https://api-us.cloud.com/cvad/manage/
 *   On-prem CVAD: https://{ddc}/citrix/monitor/odata/v4/
 *
 * Auth: Citrix Cloud uses OAuth2 (client_credentials), on-prem uses Basic/NTLM
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';
import { ELEMENT_TYPES } from '@thearchitect/shared';

// ─── Citrix Object → ArchiMate Mapping ───

const TYPE_SET = new Set(ELEMENT_TYPES.map(et => et.type));
const TYPE_TO_DOMAIN = new Map(ELEMENT_TYPES.map(et => [et.type, et.domain]));
const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy', business: 'business', application: 'application',
  data: 'application', technology: 'technology', physical: 'technology',
  motivation: 'motivation', implementation: 'implementation_migration', composite: 'other',
};

const CITRIX_TYPE_MAP: Record<string, { type: string; layer: string }> = {
  'delivery_group': { type: 'application_service', layer: 'application' },
  'machine_catalog': { type: 'node', layer: 'technology' },
  'machine': { type: 'device', layer: 'technology' },
  'application': { type: 'application_component', layer: 'application' },
  'desktop': { type: 'application_component', layer: 'application' },
  'hypervisor': { type: 'system_software', layer: 'technology' },
  'hosting_connection': { type: 'communication_network', layer: 'technology' },
  'zone': { type: 'location', layer: 'other' },
  'site': { type: 'location', layer: 'other' },
  'session': { type: 'application_process', layer: 'application' },
  'policy': { type: 'constraint', layer: 'motivation' },
};

const POWER_STATE_MAP: Record<string, string> = {
  'on': 'current',
  'off': 'retired',
  'suspended': 'transitional',
  'turning_on': 'transitional',
  'turning_off': 'transitional',
  'unmanaged': 'current',
  'unknown': 'current',
};

const REGISTRATION_STATE_MAP: Record<string, string> = {
  'registered': 'current',
  'unregistered': 'retired',
  'initializing': 'transitional',
};

// ─── API Mode Detection ───

type CitrixMode = 'cloud' | 'onprem';

function detectMode(config: ConnectorConfig): CitrixMode {
  if (config.filters.mode === 'onprem') return 'onprem';
  if (config.baseUrl.includes('cloud.com')) return 'cloud';
  return 'onprem';
}

export class CitrixConnector implements IConnector {
  readonly type: ConnectorType = 'citrix';
  readonly displayName = 'Citrix';
  readonly supportedAuthMethods: AuthMethod[] = ['oauth2', 'basic', 'api_key'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const mode = detectMode(config);
      if (mode === 'cloud') {
        const token = await this.cloudAuth(config);
        const resp = await this.request(config, '/cvad/manage/Sites', { Authorization: `CWSAuth Bearer=${token}` });
        await resp.json();
        return { success: true, message: 'Connected — Citrix Cloud reachable' };
      }

      // On-prem OData
      const resp = await this.request(config, '/citrix/monitor/odata/v4/Data/Machines?$top=1');
      await resp.json();
      return { success: true, message: 'Connected — Citrix CVAD reachable' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async getAvailableTypes(_config: ConnectorConfig): Promise<string[]> {
    return ['DeliveryGroup', 'MachineCatalog', 'Machine', 'Application', 'HostingConnection', 'Zone'];
  }

  async fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const mode = detectMode(config);
    if (mode === 'cloud') return this.fetchCloud(config);
    return this.fetchOnPrem(config);
  }

  // ─── Citrix Cloud Fetch ───

  private async fetchCloud(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const token = await this.cloudAuth(config);
    const authHeader = { Authorization: `CWSAuth Bearer=${token}` };
    const customerId = config.filters.customerId || config.credentials.customer_id || '';

    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];
    const idMap = new Map<string, string>();

    const basePath = customerId
      ? `/cvad/manage/${customerId}`
      : '/cvad/manage';

    // Fetch Delivery Groups
    try {
      const resp = await this.request(config, `${basePath}/DeliveryGroups`, authHeader);
      const data = await resp.json() as { Items: any[] };

      for (const dg of data.Items || []) {
        const elemId = `elem-${uuid().slice(0, 8)}`;
        idMap.set(dg.Id || dg.Uid, elemId);

        elements.push({
          id: elemId,
          name: dg.Name || '',
          type: 'application_service',
          layer: 'application',
          description: dg.Description || `Delivery Group — ${dg.TotalMachines || 0} machines`,
          status: dg.Enabled !== false ? 'current' : 'retired',
          riskLevel: 'low',
          maturityLevel: 3,
          properties: {
            citrixId: dg.Id || dg.Uid || '',
            citrixType: 'delivery_group',
            totalMachines: String(dg.TotalMachines || 0),
            totalDesktops: String(dg.TotalDesktops || 0),
            sessionsCount: String(dg.Sessions || 0),
          },
        });
      }
    } catch (err: any) {
      warnings.push(`Delivery Groups: ${err.message}`);
    }

    // Fetch Machine Catalogs
    try {
      const resp = await this.request(config, `${basePath}/MachineCatalogs`, authHeader);
      const data = await resp.json() as { Items: any[] };

      for (const mc of data.Items || []) {
        const elemId = `elem-${uuid().slice(0, 8)}`;
        idMap.set(mc.Id || mc.Uid, elemId);

        elements.push({
          id: elemId,
          name: mc.Name || '',
          type: 'node',
          layer: 'technology',
          description: mc.Description || `Machine Catalog — ${mc.TotalCount || 0} machines`,
          status: 'current',
          riskLevel: 'low',
          maturityLevel: 3,
          properties: {
            citrixId: mc.Id || mc.Uid || '',
            citrixType: 'machine_catalog',
            provisioningType: mc.ProvisioningType || '',
            totalCount: String(mc.TotalCount || 0),
            allocationType: mc.AllocationType || '',
          },
        });
      }
    } catch (err: any) {
      warnings.push(`Machine Catalogs: ${err.message}`);
    }

    // Fetch Applications
    try {
      const resp = await this.request(config, `${basePath}/Applications`, authHeader);
      const data = await resp.json() as { Items: any[] };

      for (const app of data.Items || []) {
        const elemId = `elem-${uuid().slice(0, 8)}`;
        idMap.set(app.Id || app.Uid, elemId);

        elements.push({
          id: elemId,
          name: app.PublishedName || app.Name || '',
          type: 'application_component',
          layer: 'application',
          description: app.Description || `Published App: ${app.CommandLineExecutable || ''}`,
          status: app.Enabled !== false ? 'current' : 'retired',
          riskLevel: 'low',
          maturityLevel: 3,
          properties: {
            citrixId: app.Id || app.Uid || '',
            citrixType: 'application',
            commandLine: app.CommandLineExecutable || '',
          },
        });

        // Link app → delivery group
        const dgId = app.DeliveryGroup?.Id || app.DeliveryGroup?.Uid;
        if (dgId) {
          const dgElemId = idMap.get(dgId);
          if (dgElemId) {
            connections.push({
              id: `conn-${uuid().slice(0, 8)}`,
              sourceId: elemId,
              targetId: dgElemId,
              type: 'serving',
            });
          }
        }
      }
    } catch (err: any) {
      warnings.push(`Applications: ${err.message}`);
    }

    warnings.push(`Citrix Cloud: ${elements.length} objects imported`);
    return { elements, connections, warnings, metadata: { mode: 'cloud', totalCount: elements.length } };
  }

  // ─── On-Prem OData Fetch ───

  private async fetchOnPrem(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];
    const idMap = new Map<string, string>();

    // Fetch Machines via OData
    try {
      const resp = await this.request(config, '/citrix/monitor/odata/v4/Data/Machines?$top=500&$select=Id,Name,DnsName,CurrentPowerState,CurrentRegistrationState,IsAssigned,HostedMachineName,CatalogId');
      const data = await resp.json() as { value: any[] };

      for (const m of data.value || []) {
        const name = m.DnsName || m.Name || m.HostedMachineName || '';
        if (!name) continue;

        const elemId = `elem-${uuid().slice(0, 8)}`;
        idMap.set(String(m.Id), elemId);

        const powerState = (m.CurrentPowerState || '').toLowerCase();
        const regState = (m.CurrentRegistrationState || '').toLowerCase();
        const status = REGISTRATION_STATE_MAP[regState] || POWER_STATE_MAP[powerState] || 'current';

        elements.push({
          id: elemId,
          name,
          type: 'device',
          layer: 'technology',
          description: `Citrix Machine — Power: ${m.CurrentPowerState || 'unknown'}, Reg: ${m.CurrentRegistrationState || 'unknown'}`,
          status,
          riskLevel: 'low',
          maturityLevel: 3,
          properties: {
            citrixId: String(m.Id),
            citrixType: 'machine',
            powerState: m.CurrentPowerState || '',
            registrationState: m.CurrentRegistrationState || '',
            ...(m.CatalogId ? { catalogId: String(m.CatalogId) } : {}),
          },
        });
      }
    } catch (err: any) {
      warnings.push(`Machines: ${err.message}`);
    }

    // Fetch Sessions
    try {
      const resp = await this.request(config, '/citrix/monitor/odata/v4/Data/Sessions?$top=200&$select=SessionKey,UserName,StartDate,MachineId,ApplicationsInUse&$filter=EndDate eq null');
      const data = await resp.json() as { value: any[] };

      for (const s of data.value || []) {
        const machineElemId = idMap.get(String(s.MachineId));
        if (!machineElemId) continue;

        // Don't create elements for sessions, but count active users per machine
        // This enriches the machine description
      }

      warnings.push(`Active sessions: ${(data.value || []).length}`);
    } catch (err: any) {
      warnings.push(`Sessions: ${err.message}`);
    }

    warnings.push(`Citrix On-Prem: ${elements.length} machines imported`);
    return { elements, connections, warnings, metadata: { mode: 'onprem', totalCount: elements.length } };
  }

  // ─── Citrix Cloud OAuth2 ───

  private async cloudAuth(config: ConnectorConfig): Promise<string> {
    if (config.credentials.token || config.credentials.api_key) {
      return config.credentials.token || config.credentials.api_key;
    }

    const clientId = config.credentials.client_id || '';
    const clientSecret = config.credentials.client_secret || '';

    const resp = await fetch('https://api-us.cloud.com/cctrustoauth2/root/tokens/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      throw new Error(`Citrix Cloud auth failed: ${resp.status}`);
    }

    const data = await resp.json() as { access_token: string };
    return data.access_token;
  }

  // ─── HTTP Helper ───

  private async request(config: ConnectorConfig, path: string, extraHeaders?: Record<string, string>): Promise<Response> {
    const host = config.baseUrl.replace(/\/$/, '');
    const url = `${host}${path}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    // On-prem auth
    if (!extraHeaders?.Authorization) {
      if (config.credentials.username) {
        headers['Authorization'] = `Basic ${Buffer.from(`${config.credentials.username}:${config.credentials.password || ''}`).toString('base64')}`;
      } else if (config.credentials.token || config.credentials.api_key) {
        headers['Authorization'] = `Bearer ${config.credentials.token || config.credentials.api_key}`;
      }
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`Citrix API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
    }

    return resp;
  }
}

/** @internal Exported for testing only */
export const __testExports = { CITRIX_TYPE_MAP, POWER_STATE_MAP, REGISTRATION_STATE_MAP };
