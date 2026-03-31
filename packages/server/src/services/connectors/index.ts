/**
 * Connector Registry — registers all available connectors at startup.
 */
import { registerConnector, getAllConnectorTypes, getConnector } from './base.connector';
import { JiraConnector } from './jira.connector';
import { GitHubConnector, GitLabConnector } from './github.connector';

// Register all connectors
registerConnector(new JiraConnector());
registerConnector(new GitHubConnector());
registerConnector(new GitLabConnector());

export { getAllConnectorTypes, getConnector };
export type { ConnectorConfig, SyncResult, ConnectorType, AuthMethod, MappingRule, SyncStatus } from './base.connector';
