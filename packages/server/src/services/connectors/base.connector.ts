/**
 * Integration Connector Framework
 *
 * Base interface for all external system connectors (Jira, GitHub, GitLab, etc.)
 * Connectors are registered in the ConnectorRegistry and provide:
 * - Authentication (OAuth, API Key, Personal Token)
 * - Data fetching + mapping to ArchitectureElements/Connections
 * - Sync state tracking
 */

import type { ParsedElement, ParsedConnection } from '../upload.service';

// ─── Connector Types ───

export type ConnectorType = 'jira' | 'github' | 'gitlab' | 'confluence' | 'servicenow' | 'azure_devops';
export type AuthMethod = 'api_key' | 'oauth2' | 'personal_token' | 'basic';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface ConnectorConfig {
  type: ConnectorType;
  name: string;
  baseUrl: string;
  authMethod: AuthMethod;
  credentials: Record<string, string>;  // encrypted at rest
  projectId: string;
  mappingRules: MappingRule[];
  syncIntervalMinutes: number;          // 0 = manual only
  filters: Record<string, string>;      // connector-specific filters (e.g. jql, repo filter)
  enabled: boolean;
}

export interface MappingRule {
  sourceType: string;           // e.g. 'Epic', 'Story', 'Repository'
  targetType: string;           // e.g. 'work_package', 'application_component'
  fieldMappings: Array<{
    sourceField: string;
    targetField: string;
  }>;
}

export interface SyncResult {
  connectorId: string;
  status: SyncStatus;
  elementsCreated: number;
  elementsUpdated: number;
  connectionsCreated: number;
  warnings: string[];
  error?: string;
  syncedAt: string;
  durationMs: number;
}

// ─── Base Connector Interface ───

export interface IConnector {
  readonly type: ConnectorType;
  readonly displayName: string;
  readonly supportedAuthMethods: AuthMethod[];

  /** Validate credentials and connection */
  testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }>;

  /** Fetch data from external system and return parsed elements/connections */
  fetchData(config: ConnectorConfig): Promise<{
    elements: ParsedElement[];
    connections: ParsedConnection[];
    warnings: string[];
    metadata: Record<string, unknown>;
  }>;

  /** Get available item types from the external system (for mapping UI) */
  getAvailableTypes(config: ConnectorConfig): Promise<string[]>;
}

// ─── Connector Registry ───

const registry = new Map<ConnectorType, IConnector>();

export function registerConnector(connector: IConnector): void {
  registry.set(connector.type, connector);
}

export function getConnector(type: ConnectorType): IConnector | undefined {
  return registry.get(type);
}

export function getAllConnectorTypes(): Array<{ type: ConnectorType; displayName: string; authMethods: AuthMethod[] }> {
  return Array.from(registry.values()).map(c => ({
    type: c.type,
    displayName: c.displayName,
    authMethods: c.supportedAuthMethods,
  }));
}
