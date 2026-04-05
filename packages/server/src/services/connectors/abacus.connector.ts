/**
 * Abacus ERP Connector
 *
 * Connects to Abacus ERP (Swiss ERP system by Abacus Research AG) REST API
 * to enrich architecture elements with financial/accounting data.
 *
 * Abacus provides:
 *   - Cost centers with actual costs → annualCost, monthlyInfraCost
 *   - Employee data per department → userCount, hourlyRate
 *   - Project costs → cost allocation
 *
 * API: Abacus AbaConnect REST API
 *   GET /api/entity/CostCenters
 *   GET /api/entity/Projects
 *   GET /api/entity/Employees
 *
 * Implements ICostEnrichmentConnector only (no element creation).
 */

import type { ConnectorConfig, ICostEnrichmentConnector, AuthMethod, ConnectorType } from './base.connector';
import type { CostEnrichmentResult } from '@thearchitect/shared';

export class AbacusConnector implements ICostEnrichmentConnector {
  readonly type: ConnectorType = 'abacus';
  readonly displayName = 'Abacus ERP';
  readonly supportedAuthMethods: AuthMethod[] = ['basic', 'api_key', 'oauth2'];
  readonly enrichableFields = [
    'annualCost', 'monthlyInfraCost', 'userCount', 'hourlyRate',
    'transformationStrategy',
  ];

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const resp = await this.request(config, '/api/entity/CostCenters?$top=1');
      await resp.json();
      return { success: true, message: 'Connected — Abacus ERP reachable' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async fetchCostData(config: ConnectorConfig): Promise<{
    enrichments: CostEnrichmentResult[];
    warnings: string[];
  }> {
    const enrichments: CostEnrichmentResult[] = [];
    const warnings: string[] = [];

    // Fetch cost centers with actual costs
    try {
      const resp = await this.request(config, '/api/entity/CostCenters?$top=500');
      const data = await resp.json() as any;
      const items = data.value || data.results || data || [];

      for (const cc of (Array.isArray(items) ? items : [])) {
        const name = cc.Description || cc.Name || cc.CostCenterNumber || '';
        if (!name) continue;

        const fields: Record<string, unknown> = {};

        // Annual cost from budget or actual
        const annualCost = parseFloat(cc.ActualCostYTD) || parseFloat(cc.BudgetAmount) || 0;
        if (annualCost > 0) fields.annualCost = annualCost;

        // Monthly infra cost
        const monthlyCost = parseFloat(cc.MonthlyActual) || (annualCost > 0 ? annualCost / 12 : 0);
        if (monthlyCost > 0) fields.monthlyInfraCost = Math.round(monthlyCost);

        // Employee count
        const employeeCount = parseInt(cc.EmployeeCount || cc.HeadCount, 10);
        if (employeeCount > 0) fields.userCount = employeeCount;

        // Hourly rate from cost center settings
        const hourlyRate = parseFloat(cc.HourlyRate || cc.InternalRate);
        if (hourlyRate > 0) fields.hourlyRate = hourlyRate;

        if (Object.keys(fields).length > 0) {
          enrichments.push({
            sourceKey: cc.CostCenterNumber || cc.Id || name,
            sourceName: name,
            fields: fields as any,
            confidence: 0.85,
            metadata: {
              abacusId: cc.Id || cc.CostCenterNumber,
              costCenterNumber: cc.CostCenterNumber,
              department: cc.Department || '',
            },
          });
        }
      }
    } catch (err: any) {
      warnings.push(`Cost centers: ${err.message}`);
    }

    // Fetch project costs
    try {
      const year = new Date().getFullYear();
      const resp = await this.request(config, `/api/entity/Projects?$top=200&$filter=Year eq ${year}`);
      const data = await resp.json() as any;
      const items = data.value || data.results || data || [];

      for (const proj of (Array.isArray(items) ? items : [])) {
        const name = proj.Description || proj.Name || proj.ProjectNumber || '';
        if (!name) continue;

        const fields: Record<string, unknown> = {};

        const totalCost = parseFloat(proj.ActualCost) || parseFloat(proj.TotalCost) || 0;
        if (totalCost > 0) fields.annualCost = totalCost;

        const budgetedHours = parseFloat(proj.BudgetHours);
        const actualHours = parseFloat(proj.ActualHours);
        if (budgetedHours > 0 && actualHours > 0 && totalCost > 0) {
          fields.hourlyRate = Math.round(totalCost / actualHours);
        }

        // Project status → transformation strategy
        const status = (proj.Status || '').toLowerCase();
        if (status === 'completed' || status === 'closed') {
          fields.transformationStrategy = 'retain';
        } else if (status === 'active' || status === 'in progress') {
          fields.transformationStrategy = 'replatform';
        } else if (status === 'planned') {
          fields.transformationStrategy = 'refactor';
        }

        if (Object.keys(fields).length > 0) {
          enrichments.push({
            sourceKey: proj.ProjectNumber || proj.Id || name,
            sourceName: `[Projekt] ${name}`,
            fields: fields as any,
            confidence: 0.80,
            metadata: {
              abacusId: proj.Id || proj.ProjectNumber,
              projectNumber: proj.ProjectNumber,
              year: String(year),
            },
          });
        }
      }
    } catch (err: any) {
      warnings.push(`Projects: ${err.message}`);
    }

    return { enrichments, warnings };
  }

  async discoverSources(config: ConnectorConfig): Promise<Array<{ key: string; name: string; type?: string }>> {
    const results: Array<{ key: string; name: string; type?: string }> = [];

    // Discover cost centers
    try {
      const resp = await this.request(config, '/api/entity/CostCenters?$top=200&$select=CostCenterNumber,Description');
      const data = await resp.json() as any;
      const items = data.value || data.results || data || [];

      for (const cc of (Array.isArray(items) ? items : [])) {
        if (cc.Description || cc.CostCenterNumber) {
          results.push({
            key: cc.CostCenterNumber || cc.Id,
            name: cc.Description || cc.CostCenterNumber,
            type: 'CostCenter',
          });
        }
      }
    } catch { /* skip */ }

    // Discover projects
    try {
      const resp = await this.request(config, '/api/entity/Projects?$top=200&$select=ProjectNumber,Description');
      const data = await resp.json() as any;
      const items = data.value || data.results || data || [];

      for (const proj of (Array.isArray(items) ? items : [])) {
        if (proj.Description || proj.ProjectNumber) {
          results.push({
            key: proj.ProjectNumber || proj.Id,
            name: proj.Description || proj.ProjectNumber,
            type: 'Project',
          });
        }
      }
    } catch { /* skip */ }

    return results;
  }

  // ─── HTTP Helper ───

  private async request(config: ConnectorConfig, path: string): Promise<Response> {
    const host = config.baseUrl.replace(/\/$/, '');
    const url = `${host}${path}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (config.credentials.username) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.credentials.username}:${config.credentials.password || ''}`).toString('base64')}`;
    } else if (config.credentials.token || config.credentials.api_key) {
      headers['Authorization'] = `Bearer ${config.credentials.token || config.credentials.api_key}`;
    }

    // Abacus-specific: Mandant (client) header
    if (config.credentials.mandant || config.filters.mandant) {
      headers['X-Abacus-Mandant'] = config.credentials.mandant || config.filters.mandant;
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`Abacus API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
    }

    return resp;
  }
}
