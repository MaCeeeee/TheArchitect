/**
 * LeanIX Live Connector
 *
 * Connects to LeanIX Integration API (GraphQL) to fetch fact sheets
 * and enrich architecture elements with portfolio data.
 *
 * Implements both IConnector (create elements) and ICostEnrichmentConnector (enrich costs).
 * Reuses type/relation mappings from the existing file-based LeanIX adapter.
 */

import { v4 as uuid } from 'uuid';
import type { ConnectorConfig, IConnector, ICostEnrichmentConnector, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';
import type { CostEnrichmentResult } from '@thearchitect/shared';
import { ELEMENT_TYPES, LEGACY_TYPE_MAP } from '@thearchitect/shared';

// ─── Type Mappings (from leanix.adapter.ts) ───

const TYPE_SET = new Set(ELEMENT_TYPES.map(et => et.type));
const TYPE_TO_DOMAIN = new Map(ELEMENT_TYPES.map(et => [et.type, et.domain]));
const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy', business: 'business', application: 'application',
  data: 'application', technology: 'technology', physical: 'technology',
  motivation: 'motivation', implementation: 'implementation_migration', composite: 'other',
};

const LEANIX_TYPE_MAP: Record<string, string> = {
  'application': 'application_component',
  'itcomponent': 'system_software', 'it component': 'system_software',
  'businesscapability': 'business_capability', 'business capability': 'business_capability',
  'process': 'process', 'businessprocess': 'process',
  'dataobject': 'data_object', 'data object': 'data_object',
  'interface': 'application_interface',
  'provider': 'business_actor',
  'project': 'work_package',
  'technicalstack': 'node', 'technical stack': 'node',
  'usergroup': 'business_role', 'user group': 'business_role',
  'domain': 'grouping',
  'microservice': 'application_component',
  'behavior': 'application_function',
};

const LEANIX_RELATION_MAP: Record<string, string> = {
  'reltosuccessor': 'flow', 'reltopredecessor': 'flow',
  'reltorequires': 'serving', 'reltoprovides': 'serving',
  'reltoparent': 'composition', 'reltochild': 'aggregation',
  'reltobusinesscapability': 'realization', 'reltoapplication': 'serving',
  'reltoitcomponent': 'serving', 'reltodataobject': 'access',
  'reltointerface': 'serving', 'reltoprovider': 'assignment',
  'reltousergroup': 'association', 'reltoprocess': 'triggering',
  'reltoproject': 'realization',
};

const LIFECYCLE_MAP: Record<string, string> = {
  'plan': 'target', 'phasein': 'target',
  'active': 'current',
  'phaseout': 'transitional',
  'endoflife': 'retired',
};

// ─── TIME Model → 7Rs Strategy ───

const TIME_TO_STRATEGY: Record<string, string> = {
  'tolerate': 'retain',
  'invest': 'replatform',
  'migrate': 'refactor',
  'eliminate': 'retire',
};

// ─── GraphQL Queries ───

const FACTSHEETS_QUERY = `query($filter: FilterInput) {
  allFactSheets(filter: $filter) {
    totalCount
    edges {
      node {
        id
        displayName
        name
        type
        description
        lifecycle { asString phases { phase startDate } }
        tags { name }
        ... on Application {
          alias
          businessCriticality
          functionalSuitability
          technicalSuitability
          lifecycle { asString }
          relApplicationToITComponent { edges { node { factSheet { id displayName } } } }
          relApplicationToBusinessCapability { edges { node { factSheet { id displayName } } } }
          relApplicationToDataObject { edges { node { factSheet { id displayName } } } }
          relApplicationToUserGroup { edges { node { factSheet { id displayName } } } }
        }
        ... on ITComponent {
          alias
          category
          relITComponentToApplication { edges { node { factSheet { id displayName } } } }
          relITComponentToProvider { edges { node { factSheet { id displayName } } } }
        }
        ... on BusinessCapability {
          relBusinessCapabilityToApplication { edges { node { factSheet { id displayName } } } }
        }
      }
    }
  }
}`;

export class LeanIXConnector implements IConnector, ICostEnrichmentConnector {
  readonly type: ConnectorType = 'leanix';
  readonly displayName = 'LeanIX';
  readonly supportedAuthMethods: AuthMethod[] = ['oauth2', 'api_key'];
  readonly enrichableFields = [
    'annualCost', 'technicalFitness', 'functionalFitness',
    'userCount', 'transformationStrategy', 'monthlyInfraCost',
  ];

  // ─── IConnector Methods ───

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getAccessToken(config);
      const resp = await this.graphql(config, token, '{ allFactSheets { totalCount } }');
      const count = resp?.data?.allFactSheets?.totalCount ?? 0;
      return { success: true, message: `Connected — ${count} fact sheets available` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async getAvailableTypes(config: ConnectorConfig): Promise<string[]> {
    try {
      const token = await this.getAccessToken(config);
      const resp = await this.graphql(config, token, `{
        allFactSheets { edges { node { type } } }
      }`);
      const types = new Set<string>();
      for (const edge of resp?.data?.allFactSheets?.edges || []) {
        if (edge?.node?.type) types.add(edge.node.type);
      }
      return Array.from(types);
    } catch {
      return ['Application', 'ITComponent', 'BusinessCapability', 'Process', 'DataObject', 'Interface', 'Provider'];
    }
  }

  async fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }> {
    const token = await this.getAccessToken(config);
    const filter = config.filters.factSheetTypes
      ? { facetFilters: [{ facetKey: 'FactSheetTypes', keys: config.filters.factSheetTypes.split(',').map(s => s.trim()) }] }
      : undefined;

    const resp = await this.graphql(config, token, FACTSHEETS_QUERY, { filter });
    const edges = resp?.data?.allFactSheets?.edges || [];

    const elements: ParsedElement[] = [];
    const connections: ParsedConnection[] = [];
    const warnings: string[] = [];
    const idMap = new Map<string, string>(); // LeanIX ID → our ID

    for (const edge of edges) {
      const fs = edge?.node;
      if (!fs) continue;

      const name = fs.displayName || fs.name || '';
      if (!name) continue;

      const type = mapType(fs.type || '');
      const elemId = `elem-${uuid().slice(0, 8)}`;
      idMap.set(fs.id, elemId);

      const lifecycle = fs.lifecycle?.asString?.toLowerCase() || '';
      const status = LIFECYCLE_MAP[lifecycle] || 'current';

      elements.push({
        id: elemId,
        name,
        type,
        layer: inferLayer(type),
        description: fs.description || '',
        status,
        riskLevel: 'low',
        maturityLevel: mapFitToMaturity(fs.technicalSuitability),
        properties: { leanixId: fs.id, ...(fs.alias ? { alias: fs.alias } : {}) },
      });

      // Extract relations
      for (const [key, value] of Object.entries(fs)) {
        if (!key.startsWith('rel') || !value) continue;
        const relEdges = (value as any)?.edges || [];
        const relType = LEANIX_RELATION_MAP[key.toLowerCase()] || 'association';

        for (const relEdge of relEdges) {
          const targetId = relEdge?.node?.factSheet?.id;
          if (!targetId) continue;
          connections.push({
            id: `conn-${uuid().slice(0, 8)}`,
            sourceId: elemId,
            targetId, // resolved below
            type: relType,
          });
        }
      }
    }

    // Resolve connection IDs
    const validIds = new Set(elements.map(e => e.id));
    const resolved: ParsedConnection[] = [];
    for (const conn of connections) {
      const targetResolved = idMap.get(conn.targetId);
      if (targetResolved && validIds.has(targetResolved)) {
        conn.targetId = targetResolved;
        resolved.push(conn);
      }
    }

    warnings.push(`LeanIX: ${elements.length} fact sheets, ${resolved.length} relations imported`);

    return { elements, connections: resolved, warnings, metadata: { totalCount: edges.length } };
  }

  // ─── ICostEnrichmentConnector Methods ───

  async fetchCostData(config: ConnectorConfig): Promise<{
    enrichments: CostEnrichmentResult[];
    warnings: string[];
  }> {
    const token = await this.getAccessToken(config);

    const query = `{
      allFactSheets(filter: { facetFilters: [{ facetKey: "FactSheetTypes", keys: ["Application"] }] }) {
        edges {
          node {
            id displayName name
            ... on Application {
              functionalSuitability technicalSuitability businessCriticality
              lifecycle { asString phases { phase startDate } }
              relApplicationToUserGroup { totalCount }
            }
          }
        }
      }
    }`;

    const resp = await this.graphql(config, token, query);
    const edges = resp?.data?.allFactSheets?.edges || [];
    const enrichments: CostEnrichmentResult[] = [];
    const warnings: string[] = [];

    for (const edge of edges) {
      const fs = edge?.node;
      if (!fs) continue;

      const name = fs.displayName || fs.name || '';
      if (!name) continue;

      const fields: Record<string, unknown> = {};

      // technicalFitness: LeanIX uses 1-4 scale, map to 1-5
      if (fs.technicalSuitability) {
        const score = mapSuitabilityToFitness(fs.technicalSuitability);
        if (score) fields.technicalFitness = score;
      }

      // functionalFitness
      if (fs.functionalSuitability) {
        const score = mapSuitabilityToFitness(fs.functionalSuitability);
        if (score) fields.functionalFitness = score;
      }

      // transformationStrategy from lifecycle / TIME model
      const lifecycle = fs.lifecycle?.asString?.toLowerCase() || '';
      const strategy = TIME_TO_STRATEGY[lifecycle];
      if (strategy) fields.transformationStrategy = strategy;

      // userCount from user group relations
      const userGroupCount = fs.relApplicationToUserGroup?.totalCount;
      if (userGroupCount && userGroupCount > 0) {
        fields.userCount = userGroupCount;
      }

      if (Object.keys(fields).length > 0) {
        enrichments.push({
          sourceKey: fs.id,
          sourceName: name,
          fields: fields as any,
          confidence: 0.85,
          metadata: {
            leanixId: fs.id,
            businessCriticality: fs.businessCriticality,
            technicalSuitability: fs.technicalSuitability,
            functionalSuitability: fs.functionalSuitability,
          },
        });
      }
    }

    return { enrichments, warnings };
  }

  async discoverSources(config: ConnectorConfig): Promise<Array<{ key: string; name: string; type?: string }>> {
    const token = await this.getAccessToken(config);
    const resp = await this.graphql(config, token, `{
      allFactSheets {
        edges { node { id displayName type } }
      }
    }`);

    return (resp?.data?.allFactSheets?.edges || [])
      .filter((e: any) => e?.node?.displayName)
      .map((e: any) => ({
        key: e.node.id,
        name: e.node.displayName,
        type: e.node.type,
      }));
  }

  // ─── Auth: OAuth2 Client Credentials ───

  private async getAccessToken(config: ConnectorConfig): Promise<string> {
    // If API key provided directly, use it
    if (config.credentials.token || config.credentials.api_key) {
      return config.credentials.token || config.credentials.api_key;
    }

    // OAuth2 client_credentials flow
    const host = config.baseUrl.replace(/\/$/, '');
    const tokenUrl = `${host}/services/mtm/v1/oauth2/token`;

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.credentials.client_id || '',
        client_secret: config.credentials.client_secret || '',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      throw new Error(`LeanIX OAuth failed: ${resp.status} ${await resp.text().catch(() => '')}`);
    }

    const data = await resp.json() as { access_token: string };
    return data.access_token;
  }

  // ─── GraphQL Helper ───

  private async graphql(config: ConnectorConfig, token: string, query: string, variables?: Record<string, unknown>): Promise<any> {
    const host = config.baseUrl.replace(/\/$/, '');
    const url = `${host}/services/pathfinder/v1/graphql`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`LeanIX API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
    }

    const data = await resp.json() as any;
    if (data.errors?.length) {
      throw new Error(`LeanIX GraphQL: ${data.errors[0].message}`);
    }
    return data;
  }
}

// ─── Helpers ───

function mapType(raw: string): string {
  const key = raw.toLowerCase().replace(/[\s-]+/g, '');
  const mapped = LEANIX_TYPE_MAP[key];
  if (mapped) return mapped;
  let t = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const legacy = LEGACY_TYPE_MAP[t as keyof typeof LEGACY_TYPE_MAP];
  if (legacy) t = legacy;
  if (TYPE_SET.has(t as any)) return t;
  return 'application_component';
}

function inferLayer(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type as any);
  return domain ? (DOMAIN_TO_LAYER[domain] || 'other') : 'other';
}

function mapFitToMaturity(suitability: string | undefined): number {
  if (!suitability) return 3;
  const s = suitability.toLowerCase();
  if (s === 'excellent' || s === '4') return 5;
  if (s === 'adequate' || s === '3') return 4;
  if (s === 'insufficient' || s === '2') return 2;
  if (s === 'unreasonable' || s === '1') return 1;
  return 3;
}

function mapSuitabilityToFitness(suitability: string | undefined): number | null {
  if (!suitability) return null;
  const s = suitability.toLowerCase();
  if (s === 'excellent' || s === '4') return 5;
  if (s === 'adequate' || s === '3') return 4;
  if (s === 'insufficient' || s === '2') return 2;
  if (s === 'unreasonable' || s === '1') return 1;
  return null;
}

/** @internal Exported for testing only */
export const __testExports = { mapType, inferLayer, mapFitToMaturity, mapSuitabilityToFitness, LEANIX_TYPE_MAP, LEANIX_RELATION_MAP, LIFECYCLE_MAP, TIME_TO_STRATEGY };
