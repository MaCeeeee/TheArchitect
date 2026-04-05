/**
 * Salesforce Connector
 *
 * Connects to Salesforce REST API to fetch business objects and relationships.
 * Maps Salesforce objects (Accounts, Products, Opportunities) to ArchiMate elements.
 *
 * API: Salesforce REST API v59.0
 *   Auth: OAuth2 (client_credentials or username-password flow)
 *   Query: SOQL via /services/data/v59.0/query?q=...
 *
 * Implements IConnector (create elements from Salesforce objects).
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';

// ─── Salesforce Object → ArchiMate Mapping ───

const SF_OBJECT_MAP: Record<string, { type: string; layer: string }> = {
  'account': { type: 'business_actor', layer: 'business' },
  'contact': { type: 'business_role', layer: 'business' },
  'opportunity': { type: 'work_package', layer: 'implementation_migration' },
  'product2': { type: 'product', layer: 'business' },
  'lead': { type: 'business_role', layer: 'business' },
  'case': { type: 'business_event', layer: 'business' },
  'campaign': { type: 'work_package', layer: 'implementation_migration' },
  'contract': { type: 'contract', layer: 'business' },
  'order': { type: 'business_object', layer: 'business' },
  'asset': { type: 'business_object', layer: 'business' },
  'pricebookentry': { type: 'business_object', layer: 'business' },
  'task': { type: 'deliverable', layer: 'implementation_migration' },
  'event': { type: 'business_event', layer: 'business' },
  'customobject': { type: 'business_object', layer: 'business' },
};

const SF_STAGE_MAP: Record<string, string> = {
  'prospecting': 'target',
  'qualification': 'target',
  'needs analysis': 'target',
  'value proposition': 'transitional',
  'id. decision makers': 'transitional',
  'perception analysis': 'transitional',
  'proposal/price quote': 'transitional',
  'negotiation/review': 'transitional',
  'closed won': 'current',
  'closed lost': 'retired',
};

export class SalesforceConnector implements IConnector {
  readonly type: ConnectorType = 'salesforce';
  readonly displayName = 'Salesforce';
  readonly supportedAuthMethods: AuthMethod[] = ['oauth2', 'basic'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.authenticate(config);
      const resp = await this.sfRequest(config, token, '/services/data/v59.0/');
      await resp.json();
      return { success: true, message: 'Connected — Salesforce instance reachable' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async getAvailableTypes(config: ConnectorConfig): Promise<string[]> {
    try {
      const token = await this.authenticate(config);
      const resp = await this.sfRequest(config, token, '/services/data/v59.0/sobjects/');
      const data = await resp.json() as { sobjects: Array<{ name: string; queryable: boolean }> };
      return (data.sobjects || [])
        .filter(obj => obj.queryable)
        .map(obj => obj.name)
        .slice(0, 50);
    } catch {
      return ['Account', 'Contact', 'Opportunity', 'Product2', 'Lead', 'Case', 'Campaign', 'Contract'];
    }
  }

  async fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const token = await this.authenticate(config);
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];
    const idMap = new Map<string, string>(); // SF Id → our ID

    // Determine which objects to fetch
    const objects = config.filters.objects
      ? config.filters.objects.split(',').map(s => s.trim())
      : ['Account', 'Opportunity', 'Product2'];

    for (const objType of objects) {
      try {
        const result = await this.fetchObject(config, token, objType, idMap);
        elements.push(...result.elements);
        connections.push(...result.connections);
        if (result.warning) warnings.push(result.warning);
      } catch (err: any) {
        warnings.push(`Failed to fetch ${objType}: ${err.message}`);
      }
    }

    // Fetch relationships between Accounts and Opportunities
    if (objects.includes('Account') && objects.includes('Opportunity')) {
      try {
        const soql = `SELECT Id, AccountId FROM Opportunity WHERE AccountId != null LIMIT 500`;
        const resp = await this.soqlQuery(config, token, soql);

        for (const rec of resp.records || []) {
          const sourceId = idMap.get(rec.Id);
          const targetId = idMap.get(rec.AccountId);
          if (sourceId && targetId) {
            connections.push({
              id: `conn-${uuid().slice(0, 8)}`,
              sourceId,
              targetId,
              type: 'association',
            });
          }
        }
      } catch (err: any) {
        warnings.push(`Failed to fetch Account-Opportunity links: ${err.message}`);
      }
    }

    warnings.push(`Salesforce: ${elements.length} objects, ${connections.length} relations imported`);
    return { elements, connections, warnings, metadata: { objects, totalCount: elements.length } };
  }

  // ─── Object Fetch ───

  private async fetchObject(
    config: ConnectorConfig,
    token: AuthToken,
    objType: string,
    idMap: Map<string, string>,
  ): Promise<{ elements: ParsedElement[]; connections: ParsedConnection[]; warning?: string }> {
    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const key = objType.toLowerCase();

    // Build SOQL based on object type
    let soql: string;
    switch (key) {
      case 'account':
        soql = 'SELECT Id, Name, Description, Industry, Type, BillingCountry, NumberOfEmployees, AnnualRevenue FROM Account LIMIT 500';
        break;
      case 'opportunity':
        soql = 'SELECT Id, Name, Description, StageName, Amount, CloseDate, AccountId FROM Opportunity LIMIT 500';
        break;
      case 'product2':
        soql = 'SELECT Id, Name, Description, ProductCode, Family, IsActive FROM Product2 LIMIT 500';
        break;
      case 'contact':
        soql = 'SELECT Id, Name, Title, Department, AccountId FROM Contact LIMIT 500';
        break;
      case 'lead':
        soql = 'SELECT Id, Name, Company, Status, Industry FROM Lead LIMIT 500';
        break;
      case 'case':
        soql = 'SELECT Id, Subject, Description, Status, Priority, AccountId FROM Case LIMIT 500';
        break;
      case 'campaign':
        soql = 'SELECT Id, Name, Description, Status, Type, StartDate, EndDate FROM Campaign LIMIT 200';
        break;
      case 'contract':
        soql = 'SELECT Id, ContractNumber, Status, StartDate, EndDate, AccountId FROM Contract LIMIT 200';
        break;
      default:
        soql = `SELECT Id, Name FROM ${objType} LIMIT 200`;
    }

    const resp = await this.soqlQuery(config, token, soql);
    const mapping = SF_OBJECT_MAP[key] || { type: 'business_object', layer: 'business' };

    for (const rec of resp.records || []) {
      const name = rec.Name || rec.Subject || rec.ContractNumber || '';
      if (!name) continue;

      const elemId = `elem-${uuid().slice(0, 8)}`;
      idMap.set(rec.Id, elemId);

      let status = 'current';
      if (rec.StageName) {
        status = SF_STAGE_MAP[rec.StageName.toLowerCase()] || 'current';
      }
      if (rec.Status) {
        const st = rec.Status.toLowerCase();
        if (st === 'closed' || st === 'completed') status = 'current';
        else if (st === 'cancelled' || st === 'expired') status = 'retired';
        else if (st === 'draft' || st === 'planned') status = 'target';
      }
      if (rec.IsActive === false) status = 'retired';

      const props: Record<string, string> = { salesforceId: rec.Id, sfObjectType: objType };
      if (rec.Industry) props.industry = rec.Industry;
      if (rec.ProductCode) props.productCode = rec.ProductCode;
      if (rec.Amount) props.amount = String(rec.Amount);

      elements.push({
        id: elemId,
        name,
        type: mapping.type,
        layer: mapping.layer,
        description: rec.Description || '',
        status,
        riskLevel: 'low',
        maturityLevel: 3,
        properties: props,
      });

      // Link Contacts/Cases/Contracts to their Account
      if (rec.AccountId) {
        const accountElemId = idMap.get(rec.AccountId);
        if (accountElemId) {
          connections.push({
            id: `conn-${uuid().slice(0, 8)}`,
            sourceId: elemId,
            targetId: accountElemId,
            type: 'association',
          });
        }
      }
    }

    return { elements, connections };
  }

  // ─── Auth: OAuth2 Username-Password Flow ───

  private async authenticate(config: ConnectorConfig): Promise<AuthToken> {
    // If token provided directly
    if (config.credentials.token || config.credentials.access_token) {
      const instanceUrl = config.baseUrl.replace(/\/$/, '');
      return { accessToken: config.credentials.token || config.credentials.access_token, instanceUrl };
    }

    // OAuth2 username-password flow
    const loginUrl = config.baseUrl.includes('test.salesforce.com')
      ? 'https://test.salesforce.com/services/oauth2/token'
      : 'https://login.salesforce.com/services/oauth2/token';

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: config.credentials.client_id || '',
      client_secret: config.credentials.client_secret || '',
      username: config.credentials.username || '',
      password: `${config.credentials.password || ''}${config.credentials.security_token || ''}`,
    });

    const resp = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      throw new Error(`Salesforce auth failed: ${resp.status} ${await resp.text().catch(() => '')}`);
    }

    const data = await resp.json() as { access_token: string; instance_url: string };
    return { accessToken: data.access_token, instanceUrl: data.instance_url };
  }

  // ─── SOQL Query ───

  private async soqlQuery(config: ConnectorConfig, token: AuthToken, soql: string): Promise<{ records: any[]; totalSize: number }> {
    const resp = await this.sfRequest(config, token, `/services/data/v59.0/query?q=${encodeURIComponent(soql)}`);
    return await resp.json() as { records: any[]; totalSize: number };
  }

  // ─── HTTP Helper ───

  private async sfRequest(config: ConnectorConfig, token: AuthToken, path: string): Promise<Response> {
    const url = `${token.instanceUrl}${path}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`Salesforce API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
    }

    return resp;
  }
}

interface AuthToken {
  accessToken: string;
  instanceUrl: string;
}

/** @internal Exported for testing only */
export const __testExports = { SF_OBJECT_MAP, SF_STAGE_MAP };
