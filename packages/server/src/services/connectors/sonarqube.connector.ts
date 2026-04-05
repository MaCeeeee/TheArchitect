/**
 * SonarQube Cost Enrichment Connector
 *
 * Fetches code quality metrics from SonarQube/SonarCloud and maps them
 * to TheArchitect cost fields:
 *   - ncloc / 1000 → ksloc
 *   - sqale_debt_ratio / 100 → technicalDebtRatio
 *   - bugs / ncloc * 100 → errorRatePercent
 *   - composite(reliability + security + sqale) → technicalFitness (1-5)
 */

import type { ConnectorConfig, ICostEnrichmentConnector, AuthMethod, ConnectorType } from './base.connector';
import type { CostEnrichmentResult } from '@thearchitect/shared';

const METRICS = [
  'ncloc', 'sqale_debt_ratio', 'bugs', 'code_smells',
  'reliability_rating', 'security_rating', 'sqale_rating',
].join(',');

export class SonarQubeConnector implements ICostEnrichmentConnector {
  readonly type: ConnectorType = 'sonarqube';
  readonly displayName = 'SonarQube';
  readonly supportedAuthMethods: AuthMethod[] = ['api_key', 'personal_token'];
  readonly enrichableFields = ['ksloc', 'technicalDebtRatio', 'errorRatePercent', 'technicalFitness'];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const resp = await this.fetch(config, '/api/system/status');
      if (resp.status === 'UP') {
        return { success: true, message: `Connected to SonarQube ${resp.version || ''}`.trim() };
      }
      return { success: false, message: `SonarQube status: ${resp.status}` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async discoverSources(config: ConnectorConfig): Promise<Array<{ key: string; name: string; type?: string }>> {
    const projects: Array<{ key: string; name: string; type?: string }> = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const resp = await this.fetch(config, `/api/projects/search?ps=${pageSize}&p=${page}`);
      const components = resp.components || [];

      for (const comp of components) {
        projects.push({
          key: comp.key,
          name: comp.name,
          type: comp.qualifier === 'TRK' ? 'project' : comp.qualifier,
        });
      }

      if (components.length < pageSize) break;
      page++;
      if (page > 10) break; // safety limit: 1000 projects
    }

    return projects;
  }

  async fetchCostData(config: ConnectorConfig): Promise<{
    enrichments: CostEnrichmentResult[];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const enrichments: CostEnrichmentResult[] = [];

    // Determine which projects to fetch
    let projectKeys: string[];
    if (config.filters.projects) {
      projectKeys = config.filters.projects.split(',').map(k => k.trim()).filter(Boolean);
    } else {
      // Fetch all projects
      const sources = await this.discoverSources(config);
      projectKeys = sources.map(s => s.key);
    }

    for (const key of projectKeys) {
      try {
        const resp = await this.fetch(
          config,
          `/api/measures/component?component=${encodeURIComponent(key)}&metricKeys=${METRICS}`,
        );

        const measures = resp.component?.measures || [];
        const metrics = new Map<string, number>();
        for (const m of measures) {
          metrics.set(m.metric, parseFloat(m.value));
        }

        const fields: Partial<CostEnrichmentResult['fields']> = {};

        // ksloc: ncloc / 1000
        const ncloc = metrics.get('ncloc');
        if (ncloc !== undefined && !isNaN(ncloc)) {
          fields.ksloc = Math.round((ncloc / 1000) * 10) / 10;
        }

        // technicalDebtRatio: sqale_debt_ratio as percentage → 0-1
        const tdr = metrics.get('sqale_debt_ratio');
        if (tdr !== undefined && !isNaN(tdr)) {
          fields.technicalDebtRatio = Math.round((tdr / 100) * 1000) / 1000;
        }

        // errorRatePercent: bugs per ksloc
        const bugs = metrics.get('bugs');
        if (bugs !== undefined && ncloc && ncloc > 0) {
          fields.errorRatePercent = Math.round((bugs / ncloc) * 10000) / 100;
        }

        // technicalFitness: composite of reliability + security + sqale ratings
        // SonarQube ratings are 1(best)-5(worst), we invert to 1(worst)-5(best)
        const reliability = metrics.get('reliability_rating');
        const security = metrics.get('security_rating');
        const sqale = metrics.get('sqale_rating');
        const ratingValues = [reliability, security, sqale].filter((v): v is number => v !== undefined && !isNaN(v));

        if (ratingValues.length > 0) {
          const avgRating = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
          // Invert: SQ 1=A(best) → fitness 5, SQ 5=E(worst) → fitness 1
          fields.technicalFitness = Math.round((6 - avgRating) * 10) / 10;
          // Clamp to 1-5
          fields.technicalFitness = Math.max(1, Math.min(5, fields.technicalFitness));
        }

        if (Object.keys(fields).length > 0) {
          enrichments.push({
            sourceKey: key,
            sourceName: resp.component?.name || key,
            fields,
            confidence: ratingValues.length >= 2 ? 0.9 : 0.7,
            metadata: {
              ncloc,
              bugs,
              tdr,
              reliability_rating: reliability,
              security_rating: security,
              sqale_rating: sqale,
            },
          });
        } else {
          warnings.push(`No metrics available for ${key}`);
        }
      } catch (err: any) {
        warnings.push(`Failed to fetch metrics for ${key}: ${err.message}`);
      }
    }

    return { enrichments, warnings };
  }

  // ─── HTTP Helper ───

  private async fetch(config: ConnectorConfig, path: string): Promise<any> {
    const url = `${config.baseUrl.replace(/\/$/, '')}${path}`;
    const headers: Record<string, string> = { 'Accept': 'application/json' };

    // SonarQube uses token as Basic auth with empty password
    const token = config.credentials.token || config.credentials.api_key || '';
    if (token) {
      headers['Authorization'] = `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
    } else if (config.credentials.username && config.credentials.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.credentials.username}:${config.credentials.password}`).toString('base64')}`;
    }

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`SonarQube API ${resp.status}: ${body.slice(0, 200)}`);
    }
    return resp.json();
  }
}
