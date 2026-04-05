/**
 * GitHub / GitLab Repository Connector (Read-only)
 *
 * Fetches repositories and maps them to ArchitectureElements.
 *
 * Mapping:
 * - Repository → application_component / artifact
 * - Repository dependency (package.json) → serving connections
 * - Topics/tags → metadata
 */

import { v4 as uuid } from 'uuid';
import type { IConnector, ConnectorConfig, AuthMethod, ConnectorType } from './base.connector';
import type { ParsedElement, ParsedConnection } from '../upload.service';

const LANGUAGE_TO_TYPE: Record<string, string> = {
  'typescript': 'application_component',
  'javascript': 'application_component',
  'python': 'application_component',
  'java': 'application_component',
  'go': 'application_component',
  'rust': 'system_software',
  'c': 'system_software',
  'c++': 'system_software',
  'c#': 'application_component',
  'ruby': 'application_component',
  'php': 'application_component',
  'swift': 'application_component',
  'kotlin': 'application_component',
  'terraform': 'node',
  'hcl': 'node',
  'dockerfile': 'system_software',
  'shell': 'artifact',
  'html': 'application_interface',
  'css': 'application_interface',
};

export class GitHubConnector implements IConnector {
  readonly type: ConnectorType = 'github';
  readonly displayName = 'GitHub';
  readonly supportedAuthMethods: AuthMethod[] = ['personal_token', 'oauth2'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.apiFetch(config, '/user');
      if (response.ok) {
        const user = await response.json() as Record<string, any>;
        return { success: true, message: `Connected as ${user.login} (${user.name || ''})` };
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

    // Auto-extract org/user and repo from baseUrl like github.com/MaCeeeee/TheArchitect
    let orgOrUser = config.filters.org || config.filters.user || '';
    let repoFilter = config.filters.repos || '';  // comma-separated repo names
    if (!orgOrUser) {
      const match = config.baseUrl?.match(/github\.com\/([^/]+)(?:\/([^/]+))?/i);
      if (match) {
        orgOrUser = match[1];
        if (match[2] && !repoFilter) repoFilter = `${match[1]}/${match[2]}`;
      }
    }
    const includeArchived = config.filters.includeArchived === 'true';

    let repos: any[] = [];

    if (repoFilter) {
      // Fetch specific repos
      for (const repoName of repoFilter.split(',').map(r => r.trim())) {
        const owner = repoName.includes('/') ? '' : `${orgOrUser}/`;
        const fullName = repoName.includes('/') ? repoName : `${owner}${repoName}`;
        try {
          const resp = await this.apiFetch(config, `/repos/${fullName}`);
          if (resp.ok) repos.push(await resp.json());
          else warnings.push(`Repo '${fullName}': HTTP ${resp.status}`);
        } catch (err: any) {
          warnings.push(`Repo '${fullName}': ${err.message}`);
        }
      }
    } else if (orgOrUser) {
      // Fetch all repos for org/user
      let page = 1;
      const perPage = 100;
      while (true) {
        const path = config.filters.org
          ? `/orgs/${orgOrUser}/repos?per_page=${perPage}&page=${page}&type=all`
          : `/users/${orgOrUser}/repos?per_page=${perPage}&page=${page}`;
        const resp = await this.apiFetch(config, path);
        if (!resp.ok) {
          warnings.push(`Failed to fetch repos page ${page}: HTTP ${resp.status}`);
          break;
        }
        const batch = await resp.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        repos.push(...batch);
        if (batch.length < perPage) break;
        page++;
        if (page > 10) { warnings.push('Stopped at 1000 repos (pagination limit)'); break; }
      }
    }

    // Filter out archived if needed
    if (!includeArchived) {
      repos = repos.filter(r => !r.archived);
    }

    const repoIdMap = new Map<string, string>();

    for (const repo of repos) {
      const language = (repo.language || '').toLowerCase();
      const type = this.mapType(language, repo.topics || [], config.mappingRules);
      const elemId = `gh-${uuid().slice(0, 8)}`;
      repoIdMap.set(repo.full_name, elemId);

      // Determine status from activity
      const lastPush = repo.pushed_at ? new Date(repo.pushed_at) : null;
      const monthsSinceUpdate = lastPush
        ? (Date.now() - lastPush.getTime()) / (30 * 24 * 60 * 60 * 1000)
        : 999;

      let status = 'current';
      if (repo.archived) status = 'retired';
      else if (monthsSinceUpdate > 12) status = 'retired';
      else if (monthsSinceUpdate > 6) status = 'transitional';

      // Risk from visibility and maintenance
      let risk = 'low';
      if (repo.archived) risk = 'medium';
      if (!repo.private && repo.has_issues && (repo.open_issues_count || 0) > 50) risk = 'high';

      elements.push({
        id: elemId,
        name: repo.name,
        type,
        layer: this.inferLayer(type),
        description: repo.description || '',
        status,
        riskLevel: risk,
        maturityLevel: this.estimateMaturity(repo),
        properties: {
          githubUrl: repo.html_url,
          language: repo.language || '',
          topics: (repo.topics || []).join(', '),
          stars: String(repo.stargazers_count || 0),
          forks: String(repo.forks_count || 0),
          openIssues: String(repo.open_issues_count || 0),
          visibility: repo.private ? 'private' : 'public',
          defaultBranch: repo.default_branch || 'main',
          lastPushed: repo.pushed_at || '',
        },
      });
    }

    // Detect fork relationships
    for (const repo of repos) {
      if (repo.fork && repo.parent?.full_name) {
        const sourceId = repoIdMap.get(repo.parent.full_name);
        const targetId = repoIdMap.get(repo.full_name);
        if (sourceId && targetId) {
          connections.push({
            id: `conn-${uuid().slice(0, 8)}`,
            sourceId,
            targetId,
            type: 'specialization',
            label: 'fork',
          });
        }
      }
    }

    return {
      elements,
      connections,
      warnings,
      metadata: { totalRepos: repos.length, org: orgOrUser },
    };
  }

  async getAvailableTypes(config: ConnectorConfig): Promise<string[]> {
    return ['Repository', 'Fork', 'Template'];
  }

  // ─── Helpers ───

  private async apiFetch(config: ConnectorConfig, path: string): Promise<Response> {
    let baseUrl = config.baseUrl || 'https://api.github.com';
    // Normalize: github.com → api.github.com, strip repo paths
    if (/^https?:\/\/(www\.)?github\.com/i.test(baseUrl)) {
      baseUrl = 'https://api.github.com';
    }
    const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const token = config.credentials.token || config.credentials.accessToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(url, { headers });
  }

  private mapType(language: string, topics: string[], rules: ConnectorConfig['mappingRules']): string {
    // Custom rules first
    for (const rule of rules) {
      if (rule.sourceType.toLowerCase() === language) return rule.targetType;
      if (topics.some(t => t.toLowerCase() === rule.sourceType.toLowerCase())) return rule.targetType;
    }

    // Topic-based inference
    if (topics.includes('infrastructure') || topics.includes('terraform') || topics.includes('devops')) return 'node';
    if (topics.includes('library') || topics.includes('sdk')) return 'artifact';
    if (topics.includes('api') || topics.includes('microservice')) return 'application_service';
    if (topics.includes('frontend') || topics.includes('ui')) return 'application_interface';
    if (topics.includes('database') || topics.includes('data')) return 'data_object';

    return LANGUAGE_TO_TYPE[language] || 'application_component';
  }

  private inferLayer(type: string): string {
    const map: Record<string, string> = {
      application_component: 'application', application_service: 'application',
      application_interface: 'application', data_object: 'application',
      system_software: 'technology', node: 'technology', artifact: 'technology',
    };
    return map[type] || 'application';
  }

  private estimateMaturity(repo: any): number {
    let score = 2;
    if ((repo.stargazers_count || 0) > 10) score++;
    if (repo.has_wiki) score++;
    if ((repo.topics || []).length > 2) score++;
    return Math.min(score, 5);
  }
}

// ─── GitLab Connector (similar API surface) ───

export class GitLabConnector implements IConnector {
  readonly type: ConnectorType = 'gitlab';
  readonly displayName = 'GitLab';
  readonly supportedAuthMethods: AuthMethod[] = ['personal_token', 'oauth2'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.apiFetch(config, '/api/v4/user');
      if (response.ok) {
        const user = await response.json() as Record<string, any>;
        return { success: true, message: `Connected as ${user.username} (${user.name || ''})` };
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
    const warnings: string[] = [];

    const groupId = config.filters.groupId || '';
    let page = 1;
    let repos: any[] = [];

    while (true) {
      const path = groupId
        ? `/api/v4/groups/${groupId}/projects?per_page=100&page=${page}&include_subgroups=true`
        : `/api/v4/projects?membership=true&per_page=100&page=${page}`;
      const resp = await this.apiFetch(config, path);
      if (!resp.ok) { warnings.push(`GitLab API error: HTTP ${resp.status}`); break; }
      const batch = await resp.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      repos.push(...batch);
      if (batch.length < 100) break;
      page++;
      if (page > 10) break;
    }

    for (const repo of repos) {
      const elemId = `gl-${uuid().slice(0, 8)}`;
      elements.push({
        id: elemId,
        name: repo.name,
        type: 'application_component',
        layer: 'application',
        description: repo.description || '',
        status: repo.archived ? 'retired' : 'current',
        riskLevel: 'low',
        maturityLevel: 3,
        properties: {
          gitlabUrl: repo.web_url,
          namespace: repo.namespace?.full_path || '',
          visibility: repo.visibility || 'private',
          defaultBranch: repo.default_branch || 'main',
        },
      });
    }

    return { elements, connections: [], warnings, metadata: { totalRepos: repos.length } };
  }

  async getAvailableTypes(): Promise<string[]> {
    return ['Project'];
  }

  private async apiFetch(config: ConnectorConfig, path: string): Promise<Response> {
    const baseUrl = config.baseUrl || 'https://gitlab.com';
    const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
    const token = config.credentials.token || config.credentials.accessToken;
    return fetch(url, {
      headers: {
        'PRIVATE-TOKEN': token || '',
        'Accept': 'application/json',
      },
    });
  }
}
