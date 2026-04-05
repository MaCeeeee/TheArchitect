/**
 * Jira Connector (Read-only)
 *
 * Fetches Jira issues via REST API v3 and maps them to ArchitectureElements.
 * Supports: Jira Cloud + Jira Server/Data Center.
 *
 * Mapping:
 * - Epic → work_package
 * - Story/Task/Bug → deliverable
 * - Component → application_component
 * - Version/Release → plateau
 * - Links between issues → connections
 */

import { v4 as uuid } from 'uuid';
import type { IConnector, ICostEnrichmentConnector, ConnectorConfig, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';
import type { CostEnrichmentResult } from '@thearchitect/shared';

const JIRA_TYPE_MAP: Record<string, string> = {
  'epic': 'work_package',
  'story': 'deliverable',
  'task': 'deliverable',
  'sub-task': 'deliverable',
  'subtask': 'deliverable',
  'bug': 'deliverable',
  'initiative': 'goal',
  'feature': 'business_capability',
  'improvement': 'deliverable',
  'new feature': 'business_capability',
  'change request': 'work_package',
  'risk': 'assessment',
  'requirement': 'requirement',
};

const JIRA_LINK_MAP: Record<string, string> = {
  'blocks': 'triggering',
  'is blocked by': 'triggering',
  'clones': 'specialization',
  'is cloned by': 'specialization',
  'duplicates': 'association',
  'is duplicated by': 'association',
  'relates to': 'association',
  'causes': 'influence',
  'is caused by': 'influence',
  'is child of': 'composition',
  'is parent of': 'aggregation',
  'depends on': 'serving',
};

const JIRA_STATUS_MAP: Record<string, string> = {
  'to do': 'target',
  'open': 'target',
  'in progress': 'transitional',
  'in review': 'transitional',
  'done': 'current',
  'closed': 'current',
  'resolved': 'current',
  'won\'t fix': 'retired',
  'cancelled': 'retired',
};

const JIRA_PRIORITY_MAP: Record<string, string> = {
  'blocker': 'critical',
  'critical': 'critical',
  'highest': 'high',
  'high': 'high',
  'medium': 'medium',
  'normal': 'medium',
  'low': 'low',
  'lowest': 'low',
  'trivial': 'low',
};

export class JiraConnector implements IConnector, ICostEnrichmentConnector {
  readonly type: ConnectorType = 'jira';
  readonly displayName = 'Jira';
  readonly supportedAuthMethods: AuthMethod[] = ['api_key', 'personal_token', 'basic', 'oauth2'];
  readonly enrichableFields = [
    'userCount', 'technicalFitness', 'transformationStrategy',
  ];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.jiraFetch(config, '/rest/api/3/myself');
      if (response.ok) {
        const user = await response.json() as Record<string, any>;
        return { success: true, message: `Connected as ${user.displayName || user.emailAddress}` };
      }
      return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
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

    // Build JQL from filters
    const jql = config.filters.jql || 'ORDER BY created DESC';
    const maxResults = parseInt(config.filters.maxResults || '200', 10);

    let startAt = 0;
    let total = 0;
    const idMap = new Map<string, string>(); // Jira key → element ID

    do {
      const searchUrl = `/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=50&fields=summary,issuetype,status,priority,assignee,labels,components,fixVersions,issuelinks,description,created,updated`;
      const response = await this.jiraFetch(config, searchUrl);

      if (!response.ok) {
        warnings.push(`Jira search failed at offset ${startAt}: HTTP ${response.status}`);
        break;
      }

      const data = await response.json() as Record<string, any>;
      total = data.total || 0;
      const issues = data.issues || [];

      for (const issue of issues) {
        const fields = issue.fields || {};
        const issueType = (fields.issuetype?.name || 'Task').toLowerCase();
        const type = this.mapType(issueType, config.mappingRules);
        const elemId = `jira-${uuid().slice(0, 8)}`;

        idMap.set(issue.key, elemId);

        elements.push({
          id: elemId,
          name: `[${issue.key}] ${fields.summary || 'Untitled'}`,
          type,
          layer: this.inferLayer(type),
          description: this.extractDescription(fields.description),
          status: JIRA_STATUS_MAP[(fields.status?.name || '').toLowerCase()] || 'current',
          riskLevel: JIRA_PRIORITY_MAP[(fields.priority?.name || '').toLowerCase()] || 'low',
          maturityLevel: 3,
          properties: {
            jiraKey: issue.key,
            jiraType: fields.issuetype?.name || '',
            jiraStatus: fields.status?.name || '',
            jiraPriority: fields.priority?.name || '',
            assignee: fields.assignee?.displayName || '',
            labels: (fields.labels || []).join(', '),
            components: (fields.components || []).map((c: any) => c.name).join(', '),
          },
        });

        // Extract issue links → connections
        for (const link of (fields.issuelinks || [])) {
          const linkType = link.type?.name || '';
          const outward = link.outwardIssue?.key;
          const inward = link.inwardIssue?.key;

          if (outward) {
            connections.push({
              id: `conn-${uuid().slice(0, 8)}`,
              sourceId: issue.key,  // will resolve later
              targetId: outward,
              type: JIRA_LINK_MAP[(link.type?.outward || '').toLowerCase()] || 'association',
              label: linkType,
            });
          }
          if (inward) {
            connections.push({
              id: `conn-${uuid().slice(0, 8)}`,
              sourceId: inward,
              targetId: issue.key,
              type: JIRA_LINK_MAP[(link.type?.inward || '').toLowerCase()] || 'association',
              label: linkType,
            });
          }
        }

        // Epic-child relationships
        if (fields.parent?.key) {
          connections.push({
            id: `conn-${uuid().slice(0, 8)}`,
            sourceId: fields.parent.key,
            targetId: issue.key,
            type: 'aggregation',
            label: 'parent',
          });
        }
      }

      startAt += issues.length;
    } while (startAt < total && startAt < maxResults);

    // Resolve connection IDs
    for (const conn of connections) {
      const resolvedSource = idMap.get(conn.sourceId);
      const resolvedTarget = idMap.get(conn.targetId);
      if (resolvedSource) conn.sourceId = resolvedSource;
      if (resolvedTarget) conn.targetId = resolvedTarget;
    }

    // Remove unresolvable connections
    const validIds = new Set(elements.map(e => e.id));
    const validConns = connections.filter(c => validIds.has(c.sourceId) && validIds.has(c.targetId));
    const dropped = connections.length - validConns.length;
    if (dropped > 0) warnings.push(`Dropped ${dropped} links to issues outside the query scope`);

    return {
      elements,
      connections: validConns,
      warnings,
      metadata: { jql, totalJiraIssues: total, fetched: elements.length },
    };
  }

  async getAvailableTypes(config: ConnectorConfig): Promise<string[]> {
    try {
      const response = await this.jiraFetch(config, '/rest/api/3/issuetype');
      if (!response.ok) return ['Epic', 'Story', 'Task', 'Bug'];
      const types = await response.json() as any[];
      return types.map((t: any) => t.name);
    } catch {
      return ['Epic', 'Story', 'Task', 'Bug'];
    }
  }

  // ─── ICostEnrichmentConnector Methods ───

  async fetchCostData(config: ConnectorConfig): Promise<{
    enrichments: CostEnrichmentResult[];
    warnings: string[];
  }> {
    const enrichments: CostEnrichmentResult[] = [];
    const warnings: string[] = [];

    // Fetch epics with aggregated data (story points, subtask counts, etc.)
    const jql = config.filters.jql || 'issuetype = Epic ORDER BY created DESC';
    const maxResults = parseInt(config.filters.maxResults || '100', 10);

    try {
      const searchUrl = `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,issuetype,status,priority,assignee,components,fixVersions,aggregateprogress,progress,subtasks,watches,votes`;
      const response = await this.jiraFetch(config, searchUrl);

      if (!response.ok) {
        warnings.push(`Jira search failed: HTTP ${response.status}`);
        return { enrichments, warnings };
      }

      const data = await response.json() as Record<string, any>;
      const issues = data.issues || [];

      for (const issue of issues) {
        const fields = issue.fields || {};
        const name = fields.summary || '';
        if (!name) continue;

        const costFields: Record<string, unknown> = {};

        // userCount: watchers + assignee as proxy for team size
        const watchCount = fields.watches?.watchCount || 0;
        const subtaskCount = (fields.subtasks || []).length;
        if (watchCount > 0) costFields.userCount = watchCount;

        // technicalFitness: derive from bug density in subtasks
        // High bug count relative to total → lower fitness
        if (subtaskCount > 0) {
          const bugCount = (fields.subtasks || []).filter((st: any) =>
            (st.fields?.issuetype?.name || '').toLowerCase() === 'bug'
          ).length;
          const bugRatio = bugCount / subtaskCount;
          // bugRatio 0 → fitness 5, bugRatio >= 0.5 → fitness 1
          const fitness = Math.max(1, Math.min(5, Math.round(5 - bugRatio * 8)));
          costFields.technicalFitness = fitness;
        }

        // transformationStrategy from status
        const statusName = (fields.status?.name || '').toLowerCase();
        if (statusName === 'done' || statusName === 'closed' || statusName === 'resolved') {
          costFields.transformationStrategy = 'retain';
        } else if (statusName === 'in progress' || statusName === 'in review') {
          costFields.transformationStrategy = 'replatform';
        } else if (statusName === 'to do' || statusName === 'open') {
          costFields.transformationStrategy = 'refactor';
        }

        if (Object.keys(costFields).length > 0) {
          enrichments.push({
            sourceKey: issue.key,
            sourceName: `[${issue.key}] ${name}`,
            fields: costFields as any,
            confidence: 0.65,
            metadata: {
              jiraKey: issue.key,
              jiraType: fields.issuetype?.name || '',
              jiraStatus: fields.status?.name || '',
              subtaskCount,
            },
          });
        }
      }
    } catch (err: any) {
      warnings.push(`Jira enrichment failed: ${err.message}`);
    }

    return { enrichments, warnings };
  }

  async discoverSources(config: ConnectorConfig): Promise<Array<{ key: string; name: string; type?: string }>> {
    try {
      const response = await this.jiraFetch(config, '/rest/api/3/search?jql=issuetype%20%3D%20Epic%20ORDER%20BY%20created%20DESC&maxResults=200&fields=summary,issuetype');
      if (!response.ok) return [];
      const data = await response.json() as Record<string, any>;
      return (data.issues || []).map((issue: any) => ({
        key: issue.key,
        name: `[${issue.key}] ${issue.fields?.summary || ''}`,
        type: issue.fields?.issuetype?.name,
      }));
    } catch {
      return [];
    }
  }

  // ─── Helpers ───

  private async jiraFetch(config: ConnectorConfig, path: string): Promise<Response> {
    const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    switch (config.authMethod) {
      case 'api_key':
      case 'personal_token':
        // Jira Cloud uses email + API token as Basic auth
        headers['Authorization'] = `Basic ${Buffer.from(
          `${config.credentials.email || config.credentials.username}:${config.credentials.token || config.credentials.apiKey}`
        ).toString('base64')}`;
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${Buffer.from(
          `${config.credentials.username}:${config.credentials.password}`
        ).toString('base64')}`;
        break;
      case 'oauth2':
        headers['Authorization'] = `Bearer ${config.credentials.accessToken}`;
        break;
    }

    return fetch(url, { headers });
  }

  private mapType(jiraType: string, rules: ConnectorConfig['mappingRules']): string {
    // Check custom mapping rules first
    for (const rule of rules) {
      if (rule.sourceType.toLowerCase() === jiraType.toLowerCase()) {
        return rule.targetType;
      }
    }
    return JIRA_TYPE_MAP[jiraType] || 'deliverable';
  }

  private inferLayer(type: string): string {
    const layerMap: Record<string, string> = {
      work_package: 'implementation_migration', deliverable: 'implementation_migration',
      goal: 'motivation', assessment: 'motivation', requirement: 'motivation',
      business_capability: 'strategy', application_component: 'application',
      plateau: 'implementation_migration',
    };
    return layerMap[type] || 'implementation_migration';
  }

  private extractDescription(adf: any): string {
    if (!adf) return '';
    if (typeof adf === 'string') return adf;
    // ADF (Atlassian Document Format) — extract text nodes
    try {
      const texts: string[] = [];
      const walk = (node: any) => {
        if (node.type === 'text' && node.text) texts.push(node.text);
        if (node.content) for (const child of node.content) walk(child);
      };
      walk(adf);
      return texts.join(' ').substring(0, 500);
    } catch {
      return '';
    }
  }
}

/** @internal Exported for testing only */
export const __testExports = { JIRA_TYPE_MAP, JIRA_LINK_MAP };
