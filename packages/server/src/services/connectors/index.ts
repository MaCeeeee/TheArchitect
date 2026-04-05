/**
 * Connector Registry — registers all available connectors at startup.
 */
import {
  registerConnector, getAllConnectorTypes, getConnector,
  registerEnrichmentConnector, getEnrichmentConnector, getAllEnrichmentConnectorTypes,
} from './base.connector';
import { JiraConnector } from './jira.connector';
import { GitHubConnector, GitLabConnector } from './github.connector';
import { SonarQubeConnector } from './sonarqube.connector';
import { LeanIXConnector } from './leanix.connector';
import { ServiceNowConnector } from './servicenow.connector';
import { SAPConnector } from './sap.connector';
import { N8nConnector } from './n8n.connector';
import { SalesforceConnector } from './salesforce.connector';
import { CitrixConnector } from './citrix.connector';
import { SparxEAConnector } from './sparxea.connector';
import { AbacusConnector } from './abacus.connector';
import { StandardsConnector } from './standards.connector';

// Register creation connectors
const jira = new JiraConnector();
const leanix = new LeanIXConnector();
const servicenow = new ServiceNowConnector();
const sap = new SAPConnector();

registerConnector(jira);
registerConnector(new GitHubConnector());
registerConnector(new GitLabConnector());
registerConnector(leanix);
registerConnector(servicenow);
registerConnector(sap);
registerConnector(new N8nConnector());
registerConnector(new SalesforceConnector());
registerConnector(new CitrixConnector());
registerConnector(new SparxEAConnector());
registerConnector(new StandardsConnector());

// Register enrichment connectors
registerEnrichmentConnector(new SonarQubeConnector());
registerEnrichmentConnector(jira);
registerEnrichmentConnector(leanix);
registerEnrichmentConnector(servicenow);
registerEnrichmentConnector(sap);
registerEnrichmentConnector(new AbacusConnector());

export { getAllConnectorTypes, getConnector, getEnrichmentConnector, getAllEnrichmentConnectorTypes };
export type { ConnectorConfig, SyncResult, ConnectorType, AuthMethod, MappingRule, SyncStatus, ICostEnrichmentConnector } from './base.connector';
