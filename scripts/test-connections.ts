/**
 * Manual Connection Test Script
 *
 * Tests live connections to external systems using real credentials.
 * Credentials are read from environment variables or a .env file.
 *
 * Usage:
 *   # Test all configured connectors:
 *   cd packages/server && npx tsx ../../scripts/test-connections.ts
 *
 *   # Test specific connector(s):
 *   cd packages/server && npx tsx ../../scripts/test-connections.ts --only jira,github,n8n
 *
 *   # Dry run (show which connectors would be tested):
 *   cd packages/server && npx tsx ../../scripts/test-connections.ts --dry
 *
 *   # Full fetch test (also runs fetchData / fetchCostData):
 *   cd packages/server && npx tsx ../../scripts/test-connections.ts --fetch --only n8n
 *
 * Environment Variables per Connector:
 *
 *   JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN, JIRA_JQL
 *   GITHUB_TOKEN, GITHUB_ORG
 *   GITLAB_BASE_URL, GITLAB_TOKEN, GITLAB_GROUP
 *   SONARQUBE_BASE_URL, SONARQUBE_TOKEN
 *   LEANIX_BASE_URL, LEANIX_API_KEY (or LEANIX_CLIENT_ID + LEANIX_CLIENT_SECRET)
 *   SERVICENOW_BASE_URL, SERVICENOW_USER, SERVICENOW_PASS
 *   SAP_BASE_URL, SAP_USER, SAP_PASS, SAP_MODE (solman|cloud_alm|s4hana)
 *   N8N_BASE_URL (or N8N_API_URL), N8N_API_KEY
 *   SALESFORCE_BASE_URL, SALESFORCE_TOKEN (or SALESFORCE_CLIENT_ID + SALESFORCE_CLIENT_SECRET + SALESFORCE_USER + SALESFORCE_PASS)
 *   CITRIX_BASE_URL, CITRIX_CLIENT_ID, CITRIX_CLIENT_SECRET, CITRIX_CUSTOMER_ID, CITRIX_MODE (cloud|onprem)
 *   SPARX_BASE_URL, SPARX_TOKEN
 *   ABACUS_BASE_URL, ABACUS_TOKEN, ABACUS_MANDANT
 *   STANDARDS_FRAMEWORK (iso27001|dora|nis2|bsi|kritis|nist_800_53)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from multiple locations
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import type { ConnectorConfig, ConnectorType, AuthMethod } from '../packages/server/src/services/connectors/base.connector';

// Register all connectors
import '../packages/server/src/services/connectors/index';
import {
  getConnector,
  getEnrichmentConnector,
  getAllConnectorTypes,
  getAllEnrichmentConnectorTypes,
} from '../packages/server/src/services/connectors/index';

// ─── CLI Args ───

const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith('--only='))?.split('=')[1]
  || (args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined);
const onlyFilter = onlyArg?.split(',').map(s => s.trim());
const isDry = args.includes('--dry');
const doFetch = args.includes('--fetch');

// ─── Connector Config Builders ───

interface ConnectorTestDef {
  type: ConnectorType;
  label: string;
  envCheck: string[];
  buildConfig: () => ConnectorConfig;
  isEnrichmentOnly?: boolean;
}

function base(type: ConnectorType, baseUrl: string, authMethod: AuthMethod, credentials: Record<string, string>, filters: Record<string, string> = {}): ConnectorConfig {
  return {
    type,
    name: `Test ${type}`,
    baseUrl,
    authMethod,
    credentials,
    projectId: 'test-project',
    mappingRules: [],
    syncIntervalMinutes: 0,
    filters,
    enabled: true,
  };
}

const env = process.env;

const CONNECTOR_DEFS: ConnectorTestDef[] = [
  {
    type: 'jira',
    label: 'Jira Cloud',
    envCheck: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_TOKEN'],
    buildConfig: () => base('jira', env.JIRA_BASE_URL!, 'api_key',
      { email: env.JIRA_EMAIL!, token: env.JIRA_TOKEN! },
      { jql: env.JIRA_JQL || 'ORDER BY created DESC', maxResults: '10' }),
  },
  {
    type: 'github',
    label: 'GitHub',
    envCheck: ['GITHUB_TOKEN||GITHUB_API_KEY'],
    buildConfig: () => base('github', 'https://api.github.com', 'personal_token',
      { token: env.GITHUB_TOKEN || env.GITHUB_API_KEY || '' },
      { org: env.GITHUB_ORG || '', limit: '10' }),
  },
  {
    type: 'gitlab',
    label: 'GitLab',
    envCheck: ['GITLAB_TOKEN'],
    buildConfig: () => base('gitlab', env.GITLAB_BASE_URL || 'https://gitlab.com', 'personal_token',
      { token: env.GITLAB_TOKEN! },
      { group: env.GITLAB_GROUP || '', limit: '10' }),
  },
  {
    type: 'sonarqube',
    label: 'SonarQube',
    envCheck: ['SONARQUBE_BASE_URL', 'SONARQUBE_TOKEN'],
    isEnrichmentOnly: true,
    buildConfig: () => base('sonarqube', env.SONARQUBE_BASE_URL!, 'api_key',
      { token: env.SONARQUBE_TOKEN! }),
  },
  {
    type: 'leanix',
    label: 'LeanIX',
    envCheck: ['LEANIX_BASE_URL'],
    buildConfig: () => base('leanix', env.LEANIX_BASE_URL!,
      env.LEANIX_API_KEY ? 'api_key' : 'oauth2',
      env.LEANIX_API_KEY
        ? { api_key: env.LEANIX_API_KEY }
        : { client_id: env.LEANIX_CLIENT_ID!, client_secret: env.LEANIX_CLIENT_SECRET! },
      { factSheetTypes: 'Application,ITComponent' }),
  },
  {
    type: 'servicenow',
    label: 'ServiceNow CMDB',
    envCheck: ['SERVICENOW_BASE_URL', 'SERVICENOW_USER', 'SERVICENOW_PASS'],
    buildConfig: () => base('servicenow', env.SERVICENOW_BASE_URL!, 'basic',
      { username: env.SERVICENOW_USER!, password: env.SERVICENOW_PASS! },
      { tables: 'cmdb_ci_appl,cmdb_ci_service' }),
  },
  {
    type: 'sap',
    label: 'SAP',
    envCheck: ['SAP_BASE_URL', 'SAP_USER', 'SAP_PASS'],
    buildConfig: () => base('sap', env.SAP_BASE_URL!, 'basic',
      { username: env.SAP_USER!, password: env.SAP_PASS! },
      { mode: env.SAP_MODE || 'solman' }),
  },
  {
    type: 'n8n',
    label: 'n8n',
    envCheck: ['N8N_API_KEY'],
    buildConfig: () => {
      let baseUrl = env.N8N_BASE_URL || env.N8N_HOST || '';
      if (!baseUrl && env.N8N_API_URL) {
        baseUrl = env.N8N_API_URL.replace(/\/api\/v1\/?$/, '');
      }
      if (!baseUrl) baseUrl = 'http://localhost:5678';
      return base('n8n', baseUrl, 'api_key',
        { api_key: env.N8N_API_KEY! },
        { activeOnly: 'false', limit: '10' });
    },
  },
  {
    type: 'salesforce',
    label: 'Salesforce',
    envCheck: ['SALESFORCE_BASE_URL'],
    buildConfig: () => base('salesforce', env.SALESFORCE_BASE_URL!,
      env.SALESFORCE_TOKEN ? 'api_key' : 'oauth2',
      env.SALESFORCE_TOKEN
        ? { token: env.SALESFORCE_TOKEN }
        : {
            client_id: env.SALESFORCE_CLIENT_ID!,
            client_secret: env.SALESFORCE_CLIENT_SECRET!,
            username: env.SALESFORCE_USER!,
            password: env.SALESFORCE_PASS!,
          },
      { objects: 'Account,Opportunity' }),
  },
  {
    type: 'citrix',
    label: 'Citrix Cloud',
    envCheck: ['CITRIX_BASE_URL'],
    buildConfig: () => base('citrix', env.CITRIX_BASE_URL!,
      env.CITRIX_CLIENT_ID ? 'oauth2' : 'api_key',
      env.CITRIX_CLIENT_ID
        ? { client_id: env.CITRIX_CLIENT_ID, client_secret: env.CITRIX_CLIENT_SECRET! }
        : { token: env.CITRIX_TOKEN! },
      { mode: env.CITRIX_MODE || 'cloud', customerId: env.CITRIX_CUSTOMER_ID || '' }),
  },
  {
    type: 'sparx_ea',
    label: 'Sparx EA',
    envCheck: ['SPARX_BASE_URL'],
    buildConfig: () => base('sparx_ea', env.SPARX_BASE_URL!,
      env.SPARX_USER ? 'basic' : 'api_key',
      env.SPARX_USER
        ? { username: env.SPARX_USER, password: env.SPARX_PASS! }
        : { token: env.SPARX_TOKEN! },
      { limit: '20' }),
  },
  {
    type: 'abacus',
    label: 'Abacus ERP',
    envCheck: ['ABACUS_BASE_URL', 'ABACUS_TOKEN'],
    isEnrichmentOnly: true,
    buildConfig: () => base('abacus', env.ABACUS_BASE_URL!, 'api_key',
      { token: env.ABACUS_TOKEN! },
      { mandant: env.ABACUS_MANDANT || '' }),
  },
  {
    type: 'standards_db',
    label: 'Standards DB',
    envCheck: [],
    buildConfig: () => base('standards_db', 'https://localhost', 'api_key', {},
      { standard: env.STANDARDS_FRAMEWORK || 'iso27001' }),
  },
];

// ─── Formatting ───

const C = {
  r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m',
  g: '\x1b[32m', R: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', dim: '\x1b[90m',
};

function ok(msg: string)   { console.log(`  ${C.g}✓${C.r} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.R}✗${C.r} ${msg}`); }
function info(msg: string) { console.log(`  ${C.dim}${msg}${C.r}`); }
function warn(msg: string) { console.log(`  ${C.y}⚠${C.r} ${msg}`); }

function missingEnv(vars: string[]): string[] {
  return vars.filter(v => {
    // Support "VAR_A||VAR_B" syntax — at least one must be set
    if (v.includes('||')) {
      return !v.split('||').some(alt => env[alt]);
    }
    return !env[v];
  });
}

// ─── Main ───

async function main() {
  console.log(`\n${C.b}═══ TheArchitect — Connection Test ═══${C.r}\n`);

  const allTypes = getAllConnectorTypes();
  const enrichTypes = getAllEnrichmentConnectorTypes();
  console.log(`${C.d}Registered: ${allTypes.length} creation, ${enrichTypes.length} enrichment connectors${C.r}`);

  let defs = CONNECTOR_DEFS;
  if (onlyFilter?.length) {
    defs = defs.filter(d => onlyFilter.includes(d.type));
    console.log(`${C.c}Filter: [${onlyFilter.join(', ')}]${C.r}`);
  }

  // ─── Dry Run ───
  if (isDry) {
    console.log(`\n${C.y}DRY RUN — no connections will be made${C.r}\n`);
    for (const def of defs) {
      const miss = missingEnv(def.envCheck);
      if (miss.length > 0) {
        console.log(`  ${C.d}⊘ ${def.label}${C.r} ${C.dim}— missing: ${miss.join(', ')}${C.r}`);
      } else {
        console.log(`  ${C.g}● ${def.label}${C.r} — ready`);
      }
    }
    console.log('');
    return;
  }

  // ─── Live Tests ───
  let passed = 0, failed = 0, skipped = 0;

  for (const def of defs) {
    console.log(`\n${C.b}─── ${def.label} (${def.type}) ───${C.r}`);

    const miss = missingEnv(def.envCheck);
    if (miss.length > 0 && def.type !== 'standards_db') {
      warn(`Skipped — missing env: ${miss.join(', ')}`);
      skipped++;
      continue;
    }

    const config = def.buildConfig();
    const connector = def.isEnrichmentOnly
      ? getEnrichmentConnector(def.type)
      : getConnector(def.type) || getEnrichmentConnector(def.type);

    if (!connector) {
      fail(`Connector "${def.type}" not in registry`);
      failed++;
      continue;
    }

    // 1. testConnection
    const t0 = Date.now();
    try {
      const result = await connector.testConnection(config);
      const ms = Date.now() - t0;
      if (result.success) {
        ok(`testConnection: ${result.message} ${C.d}(${ms}ms)${C.r}`);
        passed++;
      } else {
        fail(`testConnection: ${result.message} ${C.d}(${ms}ms)${C.r}`);
        failed++;
        continue;
      }
    } catch (err: any) {
      fail(`testConnection threw: ${err.message} ${C.d}(${Date.now() - t0}ms)${C.r}`);
      failed++;
      continue;
    }

    // 2. getAvailableTypes
    if (!def.isEnrichmentOnly) {
      const c = getConnector(def.type);
      if (c) {
        try {
          const types = await c.getAvailableTypes(config);
          info(`getAvailableTypes: ${types.length} types — [${types.slice(0, 5).join(', ')}${types.length > 5 ? ', ...' : ''}]`);
        } catch (err: any) {
          warn(`getAvailableTypes: ${err.message}`);
        }
      }
    }

    // 3. fetchData + fetchCostData (--fetch flag only)
    if (!doFetch) continue;

    if (!def.isEnrichmentOnly) {
      const c = getConnector(def.type);
      if (c) {
        try {
          const t1 = Date.now();
          const result = await c.fetchData(config);
          const ms = Date.now() - t1;
          ok(`fetchData: ${result.elements.length} elements, ${result.connections.length} connections ${C.d}(${ms}ms)${C.r}`);
          for (const w of result.warnings) info(`  ↳ ${w}`);
          if (result.elements.length > 0) {
            const s = result.elements[0];
            info(`  Sample: "${s.name}" → ${s.type} (${s.layer})`);
          }
        } catch (err: any) {
          fail(`fetchData: ${err.message}`);
        }
      }
    }

    const ec = getEnrichmentConnector(def.type);
    if (ec) {
      try {
        const t1 = Date.now();
        const result = await ec.fetchCostData(config);
        const ms = Date.now() - t1;
        ok(`fetchCostData: ${result.enrichments.length} enrichments ${C.d}(${ms}ms)${C.r}`);
        for (const w of result.warnings) info(`  ↳ ${w}`);
        if (result.enrichments.length > 0) {
          const s = result.enrichments[0];
          info(`  Sample: "${s.sourceName}" → fields: [${Object.keys(s.fields).join(', ')}] (conf: ${s.confidence})`);
        }
      } catch (err: any) {
        fail(`fetchCostData: ${err.message}`);
      }

      try {
        const sources = await ec.discoverSources(config);
        info(`discoverSources: ${sources.length} sources`);
      } catch (err: any) {
        warn(`discoverSources: ${err.message}`);
      }
    }
  }

  // ─── Summary ───
  console.log(`\n${C.b}═══ Summary ═══${C.r}`);
  console.log(`  ${C.g}${passed} passed${C.r}  ${C.R}${failed} failed${C.r}  ${C.y}${skipped} skipped${C.r}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${C.R}Fatal:${C.r}`, err.message);
  process.exit(1);
});
