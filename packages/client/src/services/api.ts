import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import type { PolicyDraft, ContextTraceRecord } from '@thearchitect/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach access token + fix FormData Content-Type
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let the browser set multipart/form-data with correct boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Response interceptor - handle token refresh
let isRefreshing = false;
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _retryCount?: number };

    // ── 429 Too Many Requests → single jittered retry ──
    // One retry only: more just amplifies a burst (N requests × retries) and keeps
    // the rate window pinned. We honor the server's retryAfter hint but CAP it — a
    // long global window, or the AI limiters' retryAfter of up to 24h, must never
    // turn into a multi-minute (or multi-hour) hanging request. Random jitter
    // de-synchronizes a burst of simultaneous 429s so their retries don't arrive
    // together and re-trip the same window (thundering herd). Beyond one retry we
    // fail fast and let the caller surface a graceful "couldn't load" state.
    if (error.response?.status === 429) {
      const retryCount = originalRequest._retryCount || 0;
      const MAX_429_RETRIES = 1;
      if (retryCount < MAX_429_RETRIES) {
        originalRequest._retryCount = retryCount + 1;
        const retryAfter = (error.response.data as { retryAfter?: number })?.retryAfter;
        const base = retryAfter ? retryAfter * 1000 : 1000;
        const delay = Math.min(base, 6000) + Math.random() * 400;
        await new Promise((r) => setTimeout(r, delay));
        return api(originalRequest);
      }
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const errorData = error.response.data as { code?: string } | undefined;

      if (errorData?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token: string) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(api(originalRequest));
              },
              reject,
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = useAuthStore.getState().refreshToken;
          if (!refreshToken) {
            throw new Error('No refresh token');
          }

          // Retry refresh up to 3 times if rate-limited (429)
          let refreshData;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const resp = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
              refreshData = resp.data;
              break;
            } catch (retryErr: unknown) {
              const axErr = retryErr as AxiosError;
              if (axErr.response?.status === 429 && attempt < 2) {
                await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
                continue;
              }
              throw retryErr;
            }
          }
          if (!refreshData) throw new Error('Token refresh failed after retries');

          const newAccessToken = refreshData.accessToken;
          useAuthStore.getState().setTokens(newAccessToken, refreshData.refreshToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          processQueue(null, newAccessToken);

          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      // Generic 401 (invalid token, missing token, etc.) — logout and redirect
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),

  mfaVerify: (mfaToken: string, code: string) =>
    api.post('/auth/mfa/verify', { mfaToken, code }),

  mfaSetup: () =>
    api.post('/auth/mfa/setup'),

  mfaConfirm: (code: string) =>
    api.post('/auth/mfa/confirm', { code }),

  mfaDisable: (password: string) =>
    api.post('/auth/mfa/disable', { password }),

  me: () =>
    api.get('/auth/me'),

  logout: () =>
    api.post('/auth/logout'),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),

  verifyEmail: (token: string) =>
    api.get('/auth/verify-email', { params: { token } }),

  resendVerification: (email: string) =>
    api.post('/auth/resend-verification', { email }),
};

// Project API
export const projectAPI = {
  list: () => api.get('/projects'),
  create: (data: { name: string; description?: string; tags?: string[] }) =>
    api.post('/projects', data),
  get: (id: string) => api.get(`/projects/${id}`),
  getStats: (id: string) => api.get(`/projects/${id}/stats`),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  createVersion: (id: string, label: string, snapshot: unknown) =>
    api.post(`/projects/${id}/versions`, { label, snapshot }),
  getCollaborators: (id: string) =>
    api.get(`/projects/${id}/collaborators`),
  searchUsers: (id: string, q: string) =>
    api.get(`/projects/${id}/collaborators/search`, { params: { q } }),
  addCollaborator: (id: string, email: string, role: string) =>
    api.post(`/projects/${id}/collaborators`, { email, role }),
  updateCollaborator: (id: string, userId: string, role: string) =>
    api.put(`/projects/${id}/collaborators/${userId}`, { role }),
  removeCollaborator: (id: string, userId: string) =>
    api.delete(`/projects/${id}/collaborators/${userId}`),
};

// Architecture API
export const architectureAPI = {
  getElements: (projectId: string) =>
    api.get(`/projects/${projectId}/elements`),
  createElement: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/elements`, data),
  getElement: (projectId: string, elementId: string) =>
    api.get(`/projects/${projectId}/elements/${elementId}`),
  updateElement: (projectId: string, elementId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/elements/${elementId}`, data),
  deleteElement: (projectId: string, elementId: string) =>
    api.delete(`/projects/${projectId}/elements/${elementId}`),
  getDependencies: (projectId: string, elementId: string, depth = 3) =>
    api.get(`/projects/${projectId}/elements/${elementId}/dependencies?depth=${depth}`),
  getChildren: (projectId: string, elementId: string) =>
    api.get(`/projects/${projectId}/elements/${elementId}/children`),
  getConnections: (projectId: string) =>
    api.get(`/projects/${projectId}/connections`),
  createConnection: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/connections`, data),
  deleteConnection: (projectId: string, connectionId: string) =>
    api.delete(`/projects/${projectId}/connections/${connectionId}`),
  importBPMN: (projectId: string, data: { elements: unknown[]; connections: unknown[] }) =>
    api.post(`/projects/${projectId}/import/bpmn`, data),
  importN8n: (projectId: string, data: { elements: unknown[]; connections: unknown[] }) =>
    api.post(`/projects/${projectId}/import/n8n`, data),
  fetchN8nWorkflows: (projectId: string, data: { n8nUrl: string; apiKey: string }) =>
    api.post(`/projects/${projectId}/import/n8n/fetch`, data),
  fetchN8nWorkflow: (projectId: string, data: { n8nUrl: string; apiKey: string; workflowId: string }) =>
    api.post(`/projects/${projectId}/import/n8n/fetch`, data),
  importCSV: (projectId: string, data: { elements: unknown[]; connections: unknown[] }) =>
    api.post(`/projects/${projectId}/import/csv`, data),
  healConnections: (
    projectId: string,
    opts: {
      mode: 'dryRun' | 'apply';
      minConfidence?: number;
      whitelist?: Array<{ sourceId: string; targetId: string; type: string }>;
    },
    // Heal fires one LLM call per isolated element (concurrency 5) +
    // optional RAG lookup. The default 30s timeout was tripping on
    // larger projects (BSH ESG: ~20 isolated elements). 5 min is generous
    // enough for the demo without hiding genuine server hangs.
  ) => api.post(`/projects/${projectId}/heal-connections`, opts, { timeout: 300_000 }),
};

// Workspace API
export const workspaceAPI = {
  list: (projectId: string) => api.get(`/workspaces/${projectId}`),
  create: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/workspaces/${projectId}`, data),
  update: (projectId: string, workspaceId: string, data: Record<string, unknown>) =>
    api.put(`/workspaces/${projectId}/${workspaceId}`, data),
  delete: (projectId: string, workspaceId: string) =>
    api.delete(`/workspaces/${projectId}/${workspaceId}`),
};

// Invitation API
export const invitationAPI = {
  // Project-scoped
  list: (projectId: string) =>
    api.get(`/projects/${projectId}/invitations`),
  create: (projectId: string, email: string, role: string) =>
    api.post(`/projects/${projectId}/invitations`, { email, role }),
  resend: (projectId: string, invitationId: string) =>
    api.post(`/projects/${projectId}/invitations/${invitationId}/resend`),
  cancel: (projectId: string, invitationId: string) =>
    api.delete(`/projects/${projectId}/invitations/${invitationId}`),
  // Token-based (public)
  getByToken: (token: string) =>
    api.get(`/invitations/by-token/${token}`),
  accept: (token: string) =>
    api.post(`/invitations/by-token/${token}/accept`),
  decline: (token: string) =>
    api.post(`/invitations/by-token/${token}/decline`),
  // Current user's pending invitations
  mine: () =>
    api.get('/invitations/mine'),
};

// Report API
export const reportAPI = {
  downloadExecutive: (projectId: string) =>
    api.get(`/projects/${projectId}/reports/executive`, { responseType: 'blob' }),
  downloadSimulation: (projectId: string, runId: string) =>
    api.get(`/projects/${projectId}/reports/simulation`, { params: { runId }, responseType: 'blob' }),
  downloadInventory: (projectId: string) =>
    api.get(`/projects/${projectId}/reports/inventory`, { responseType: 'blob' }),
};

// Analytics API
export const analyticsAPI = {
  getImpact: (projectId: string, elementId: string, depth = 5) =>
    api.get(`/projects/${projectId}/analytics/impact/${elementId}?depth=${depth}`),
  getRisk: (projectId: string) =>
    api.get(`/projects/${projectId}/analytics/risk`),
  getCost: (projectId: string) =>
    api.get(`/projects/${projectId}/analytics/cost`),
  simulate: (projectId: string, params: { baselineCost: number; riskFactors: unknown[]; iterations?: number }) =>
    api.post(`/projects/${projectId}/analytics/simulate`, params),
  getGraphCost: (projectId: string) =>
    api.get(`/projects/${projectId}/analytics/cost/graph`),
  getRankings: (projectId: string) =>
    api.get(`/projects/${projectId}/analytics/cost/rankings`),
  runProbabilistic: (projectId: string, params: { elements: unknown[]; iterations?: number }) =>
    api.post(`/projects/${projectId}/analytics/cost/probabilistic`, params),
  getWSJF: (projectId: string) =>
    api.get(`/projects/${projectId}/analytics/cost/wsjf`),
  computeEVM: (projectId: string, params: { budgetAtCompletion: number; plannedPercent: number; earnedPercent: number; actualCost: number }) =>
    api.post(`/projects/${projectId}/analytics/cost/evm`, params),
};

// Governance API
export const governanceAPI = {
  getApprovals: (projectId: string, status?: string) =>
    api.get(`/projects/${projectId}/approvals`, { params: status ? { status } : {} }),
  createApproval: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/approvals`, data),
  decideApproval: (projectId: string, approvalId: string, decision: string, comment?: string) =>
    api.put(`/projects/${projectId}/approvals/${approvalId}/decide`, { decision, comment }),
  cancelApproval: (projectId: string, approvalId: string) =>
    api.put(`/projects/${projectId}/approvals/${approvalId}/cancel`),
  getPolicies: (projectId: string) =>
    api.get(`/projects/${projectId}/policies`),
  createPolicy: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/policies`, data),
  updatePolicy: (projectId: string, policyId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/policies/${policyId}`, data),
  deletePolicy: (projectId: string, policyId: string) =>
    api.delete(`/projects/${projectId}/policies/${policyId}`),
  checkCompliance: (projectId: string) =>
    api.get(`/projects/${projectId}/compliance`),
  getAuditLog: (projectId: string, params?: { action?: string; limit?: number; offset?: number }) =>
    api.get(`/projects/${projectId}/audit-log`, { params }),
  // Policy Violations
  getViolations: (projectId: string, params?: { status?: string; severity?: string; limit?: number; offset?: number }) =>
    api.get(`/projects/${projectId}/violations`, { params }),
  getViolationsByElement: (projectId: string, elementId: string) =>
    api.get(`/projects/${projectId}/violations/by-element/${elementId}`),
  reEvaluateViolations: (projectId: string) =>
    api.post(`/projects/${projectId}/violations/re-evaluate`),
  // Seed Policy Templates
  seedPolicies: (projectId: string, templates: string[]) =>
    api.post(`/projects/${projectId}/policies/seed`, { templates }),
};

// Certification (Notar-Workflow) API — Trust-Spine UC-CERT-001
export const certificationAPI = {
  // Pending: machine-generated atoms (provenance <> 'user' & not yet certified)
  getPending: (projectId: string) =>
    api.get(`/projects/${projectId}/certification/pending`),
  // Certify by IDs, or all pending atoms when { all: true }
  certify: (
    projectId: string,
    body: { elementIds?: string[]; connectionIds?: string[]; all?: boolean },
  ) => api.post(`/projects/${projectId}/certification/certify`, body),
  // Aggregated trust signal (UC-TRUST-001): % confirmed vs. AI-assumed
  getTrustSummary: (projectId: string) =>
    api.get(`/projects/${projectId}/certification/trust-summary`),
};

// Marketplace API
export const marketplaceAPI = {
  list: (params?: { category?: string; q?: string; sort?: string }) =>
    api.get('/marketplace', { params }),
  get: (templateId: string) =>
    api.get(`/marketplace/${templateId}`),
  create: (data: Record<string, unknown>) =>
    api.post('/marketplace', data),
  deploy: (templateId: string) =>
    api.post(`/marketplace/${templateId}/deploy`),
  rate: (templateId: string, rating: number) =>
    api.post(`/marketplace/${templateId}/rate`, { rating }),
};

// Standards API
export const standardsAPI = {
  upload: (projectId: string, formData: FormData) =>
    api.post(`/projects/${projectId}/standards/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    }),
  list: (projectId: string) =>
    api.get(`/projects/${projectId}/standards`),
  get: (projectId: string, standardId: string) =>
    api.get(`/projects/${projectId}/standards/${standardId}`),
  delete: (projectId: string, standardId: string) =>
    api.delete(`/projects/${projectId}/standards/${standardId}`),
  getMappings: (projectId: string, standardId: string, cacheBust?: number) =>
    api.get(`/projects/${projectId}/standards/${standardId}/mappings`, {
      params: cacheBust ? { _t: cacheBust } : {},
    }),
  getMatrix: (projectId: string, standardId: string, sectionIds?: string[], cacheBust?: number) =>
    api.get(`/projects/${projectId}/standards/${standardId}/matrix`, {
      params: {
        ...(sectionIds ? { sectionIds: sectionIds.join(',') } : {}),
        ...(cacheBust ? { _t: cacheBust } : {}),
      },
    }),
  upsertMapping: (projectId: string, standardId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/standards/${standardId}/mappings`, data),
  bulkCreateMappings: (projectId: string, standardId: string, mappings: Record<string, unknown>[]) =>
    api.post(`/projects/${projectId}/standards/${standardId}/mappings/bulk`, { mappings }),
  deleteMapping: (projectId: string, standardId: string, mappingId: string) =>
    api.delete(`/projects/${projectId}/standards/${standardId}/mappings/${mappingId}`),
};

// UC-CANON-001 / THE-390 P4b — unified Norm view (upload standards + corpus laws).
// workId format: `upload:<standardId>` | `corpus:<source>` (e.g. `corpus:dsgvo`).
export const normsAPI = {
  list: (projectId: string) =>
    api.get(`/projects/${projectId}/norms`),
  getMappings: (projectId: string, workId: string) =>
    api.get(`/projects/${projectId}/norms/${encodeURIComponent(workId)}/mappings`),
  // THE-570: eine Section mit Volltext — Vorschau im Requirements-Generator.
  getSection: (projectId: string, workId: string, eId: string) =>
    api.get<{ success: boolean; data: { eId: string; heading: string; number: string; text: string; expressionLanguage?: string } }>(
      `/projects/${projectId}/norms/${encodeURIComponent(workId)}/sections/${encodeURIComponent(eId)}`),
  // "Add regulation to pipeline" — creates the pipeline state + initial stats.
  addToPipeline: (projectId: string, workId: string) =>
    api.post(`/projects/${projectId}/norms/${encodeURIComponent(workId)}/pipeline`),
  // UC-LAW-001 — which laws apply to this architecture? Deterministic signal
  // check over elements (incl. AI-wizard provenance) + project context.
  applicability: (projectId: string) =>
    api.get(`/projects/${projectId}/norms/applicability`),
  // THE-555: Frage 1 — LegalProfile x Korpus-Typisierung, vier Zustaende je Gesetz.
  legalApplicability: (projectId: string) =>
    api.get(`/projects/${projectId}/norms/legal-applicability`),
  // UC-LAW-002 — corpus-wide discovery (LLM judge). Explicit user action, costs provider money.
  // Long-running: with LAW_DISCOVERY_HYDE on, a run is one HyDE rewrite + one vector search +
  // up to LAW_DISCOVERY_MAX_JUDGE sequential judge calls. The default 30s tripped once HyDE
  // widened the candidate set (server finished fine, browser had already given up → misleading
  // "Failed to discover from corpus"). Same reasoning as heal-connections above.
  discover: (projectId: string) =>
    api.post(`/projects/${projectId}/norms/discover`, undefined, { timeout: 300_000 }),
  discoveryFindings: (projectId: string) =>
    api.get(`/projects/${projectId}/norms/discover/findings`),
  confirmFinding: (projectId: string, family: string, corpusVersionHash: string) =>
    api.post(`/projects/${projectId}/norms/discover/confirm`, { family, corpusVersionHash }),
  rejectFinding: (projectId: string, family: string, corpusVersionHash: string) =>
    api.post(`/projects/${projectId}/norms/discover/reject`, { family, corpusVersionHash }),
  // THE-423 Task 13 — fetch a single ContextTrace by id (a discovery finding's
  // or mapping's contextTraceId) to show which paragraphs/versions an AI call
  // actually consumed. A disabled-tracing run stamps outputs with an id that
  // was never persisted, so callers must tolerate a 404 here.
  getContextTrace: (projectId: string, traceId: string) =>
    api.get<{ success: boolean; data: ContextTraceRecord }>(
      `/projects/${projectId}/contexttrace/${encodeURIComponent(traceId)}`,
    ),
  // THE-423 Task 12 (AC-5) — reverse-lookup: every output whose generating
  // request consumed this exact regulationKey@versionHash.
  getRegulationImpact: (projectId: string, regulationKey: string, versionHash: string) =>
    api.get(`/projects/${projectId}/regulations/impact`, {
      params: { regulationKey, versionHash },
    }),
};

// Compliance Pipeline API
// UC-ICM-001 Regulations
export const regulationsAPI = {
  list: (projectId: string, opts?: { source?: string; limit?: number; page?: number }) =>
    api.get(`/projects/${projectId}/regulations`, { params: opts ?? {} }),
  getById: (projectId: string, regulationId: string) =>
    api.get(`/projects/${projectId}/regulations/${regulationId}`),
  // Manual create — used by Paste & See Confirm flow
  create: (projectId: string, body: {
    source: string;
    paragraphNumber: string;
    title?: string;
    fullText: string;
    language?: 'de' | 'en';
    jurisdiction?: string;
    sourceUrl?: string;
  }) =>
    api.post(`/projects/${projectId}/regulations`, body),
};

// UC-ICM-002 Compliance Mapping (Regulation ↔ ArchiMate-Element)
export const complianceMappingAPI = {
  // Bulk lookup for Heat-Map (REQ-ICM-003.1) — all mappings in project
  getAll: (projectId: string) =>
    api.get(`/projects/${projectId}/compliance/mappings`),

  // Reverse-lookup for PropertyPanel Compliance-Tab (REQ-ICM-003.2)
  getByElement: (projectId: string, elementId: string) =>
    api.get(`/projects/${projectId}/compliance/mappings/by-element/${encodeURIComponent(elementId)}`),

  // Forward-lookup for Heat-Map (REQ-ICM-003.1)
  getByRegulation: (projectId: string, regulationId: string) =>
    api.get(`/projects/${projectId}/compliance/mappings/by-regulation/${regulationId}`),

  // Batch auto-mapping (UC-ICM-002 D3)
  runAuto: (projectId: string, opts?: { regulationIds?: string[]; concurrency?: number }) =>
    api.post(`/projects/${projectId}/compliance/mappings/auto`, opts ?? {}),

  // Live "Paste & See" (REQ-ICM-003.3)
  preview: (projectId: string, body: {
    text: string;
    source?: string;
    paragraphNumber?: string;
    language?: 'de' | 'en';
    jurisdiction?: string;
  }) =>
    api.post(`/projects/${projectId}/compliance/mappings/preview`, body),

  // Persist user-confirmed mappings (REQ-ICM-003.3 Confirm step)
  confirm: (projectId: string, body: {
    regulationId: string;
    mappings: Array<{
      elementId: string;
      elementType: string;
      confidence: number;
      reasoning: string;
    }>;
  }) =>
    api.post(`/projects/${projectId}/compliance/mappings/confirm`, body),
};

// ADR-0008 / THE-569: Harmonisierungs-Vorschlag — geteilte Massnahme.
export interface HarmonizationMemberDetail {
  systemRequirementId: string;
  requirementId: string | null;
  title: string | null;
  linkedElementIds: string[];
}

export interface HarmonizationProposeResult {
  grouping: {
    measures: Array<{ id: string; memberIds: string[]; laws: string[] }>;
    excludedByDisplacement: Array<{ a: string; b: string; displaced: string; prevailing: string; citations: string[] }>;
    cappedPairs: number;
  };
  memberDetails: HarmonizationMemberDetail[];
  stats: { total: number; unmappedAddressee: number; unclassified: number; pairsJudged: number };
}

// THE-565: bidirektionale Traceability (rein lesend) + expliziter Klausel-Drift.
export interface TraceBackwardRequirement {
  id: string;
  title: string;
  priority: string;
  legalBasis: string;
  deadline: { dauer: { wert: number; einheit: 'h' | 'd' | 'mon' }; bezugspunkt: string; stufe: string | null; quelle: string } | null;
  soleCoverage: boolean;
}

export interface TraceForwardResult {
  norms: Array<{
    regulationKey: string;
    clauses: Array<{
      contentId: string;
      clausePath?: string;
      clauseText: string | null;
      requirements: Array<{ id: string; title: string; priority: string; gates?: RequirementDoc['gates'] }>;
      linkedElementIds: string[];
    }>;
  }>;
  withoutClauseAnchor: { count: number; requirementIds: string[] };
}

export const traceAPI = {
  forward: (projectId: string) =>
    api.get<{ success: boolean; data: TraceForwardResult }>(`/projects/${projectId}/requirements/trace/forward`),
  byElement: (projectId: string, elementId: string) =>
    api.get<{ success: boolean; data: { elementId: string; requirements: TraceBackwardRequirement[]; impact: { wouldLoseCoverage: number; laws: string[] } } }>(
      `/projects/${projectId}/requirements/trace/by-element/${encodeURIComponent(elementId)}`),
  driftCheck: (projectId: string) =>
    api.post<{
      success: boolean;
      data: {
        checked: number;
        staled: number;
        skipped: number;
        /** Ketten-Anforderungen ohne Korpus-Anker — unprüfbar, aber gezählt (THE-575). */
        unanchored: number;
        evidenceStaled: number;
        attestedReset: number;
      };
    }>(`/projects/${projectId}/requirements/trace/drift-check`, {}),
};

export const harmonizationAPI = {
  propose: (projectId: string, body: { maxJudgedPairs?: number } = {}) =>
    api.post<{ success: boolean; data: HarmonizationProposeResult }>(
      `/projects/${projectId}/requirements/harmonization/propose`, body, { timeout: 180_000 }),
  confirm: (projectId: string, body: { systemRequirementIds: string[]; elementId: string }) =>
    api.post<{ success: boolean; data: { linkedRequirements: number } }>(
      `/projects/${projectId}/requirements/harmonization/confirm`, body),
};

// UC-REQGEN-001 Compliance Requirements Generator (LLM extracts actionable requirements)
/** ADR-0008 Phase 1: Quoten der Ketten-Engine — Teil der Antwort, nie nur Log. */
export interface ChainStats {
  clauses: number;
  unreadableExtractions: number;
  splitCount: number;
  clausesWithoutRequirement: number;
  implFreedomViolations: number;
  unreadableSysReqs: number;
}

export interface RequirementCandidate {
  title: string;
  description: string;
  priority: 'must' | 'should' | 'may';
  linkedElementIds: string[];
  /** ADR-0008 Phase 1: Ketten-Material aus der Chain-Engine — beim Confirm durchreichen. */
  chain?: {
    regulationKey: string;
    clauseContentId: string;
    clausePath?: string;
    clauseText: string;
    stakeholderRequirement: {
      text: string;
      slots: { action: string; recipient: string; modality: string; condition: string };
      kind: 'requirement' | 'constraint';
      deadline: {
        dauer: { wert: number; einheit: 'h' | 'd' | 'mon' };
        bezugspunkt: 'kenntnis' | 'einstufung' | 'vorherige-meldung' | 'ereignis';
        stufe: 'erst' | 'zwischen' | 'abschluss' | null;
        quelle: string;
      } | null;
    };
    systemRequirement: {
      text: string;
      schutzgut: string;
      verpflichteter: string;
      ausloeser: string;
      nachweis: string;
      implementationFree: boolean;
    };
  };
  // Explainability layer (audit-grade): two distinct axes + their rationales.
  // Optional because human-curated / legacy docs may lack them; LLM preview always sets them.
  extractionConfidence?: number;   // "is this a genuine obligation?" (anti-hallucination)
  extractionRationale?: string;    // why genuine + why this score
  mappingConfidence?: number;      // "how well do the linked elements fit?" (0 if none)
  mappingRationale?: string;       // why these elements (or why none)
}

export interface RequirementDoc extends RequirementCandidate {
  _id: string;
  projectId: string;
  regulationId: string;
  sourceParagraph: string;
  status: 'open' | 'in_progress' | 'done' | 'waived';
  /** THE-557: Drei-Tore-Tripel — Abwesenheit heißt „nie bewertet". */
  gates?: {
    covered: { state: 'unknown' | 'no' | 'yes'; setBy?: string; setAt?: string; reason?: string };
    enforced: { state: 'unknown' | 'no' | 'yes'; setBy?: string; setAt?: string; reason?: string };
    attested: { state: 'unknown' | 'no' | 'yes'; setBy?: string; setAt?: string; reason?: string };
  };
  createdBy: 'llm' | 'human';
  assigneeId?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export const requirementsAPI = {
  // Preview: LLM extracts requirements, no persist
  generate: (projectId: string, body: {
    /** Freitext-Weg. Alternativ THE-570: normId + sectionEId (Server holt den Text). */
    text?: string;
    /** THE-570: Korpus-Anker — der Server loest den Section-Text auf und setzt den regulationKey. */
    normId?: string;
    sectionEId?: string;
    source?: string;
    paragraphNumber?: string;
    language?: 'de' | 'en';
    jurisdiction?: string;
  }) =>
    // LLM call against the full element catalog (100+ elements) + 8k-token output
    // can take 20-40s. Override the 30s default to avoid premature aborts.
    api.post(`/projects/${projectId}/requirements/generate`, body, { timeout: 120_000 }),

  // Confirm: persist user-curated requirements (createdBy=human, explainability preserved)
  confirm: (projectId: string, body: {
    regulationId: string;
    /** THE-570: Korpus-Anker — ohne ihn findet der Klausel-Drift die Anforderung nicht. */
    normId?: string;
    sectionEId?: string;
    sourceParagraph: string;
    requirements: Array<{
      title: string;
      description: string;
      priority: 'must' | 'should' | 'may';
      linkedElementIds: string[];
      extractionConfidence?: number;
      extractionRationale?: string;
      mappingConfidence?: number;
      mappingRationale?: string;
      chain?: RequirementCandidate['chain'];
    }>;
  }) =>
    api.post(`/projects/${projectId}/requirements`, body),

  // List requirements with filters
  list: (projectId: string, opts?: {
    status?: 'open' | 'in_progress' | 'done' | 'waived';
    priority?: 'must' | 'should' | 'may';
    regulationId?: string;
    assigneeId?: string;
    limit?: number;
    skip?: number;
  }) =>
    api.get(`/projects/${projectId}/requirements`, { params: opts ?? {} }),

  // Reverse-lookup: which requirements affect this element?
  byElement: (projectId: string, elementId: string) =>
    api.get(`/projects/${projectId}/requirements/by-element/${encodeURIComponent(elementId)}`),

  // Update status / assignee / due date / fields
  update: (projectId: string, id: string, body: Partial<{
    status: 'open' | 'in_progress' | 'done' | 'waived';
    assigneeId: string;
    dueDate: string;
    title: string;
    description: string;
    priority: 'must' | 'should' | 'may';
    linkedElementIds: string[];
  }>) =>
    api.patch(`/projects/${projectId}/requirements/${id}`, body),

  // THE-557: Notar-Akt — nur enforced/attested, Begründung Pflicht.
  setGate: (projectId: string, id: string, body: { gate: 'enforced' | 'attested'; state: 'yes' | 'no'; reason: string }) =>
    api.post(`/projects/${projectId}/requirements/${id}/gates`, body),

  // THE-559: Prüfer-Bündel — PDF als Blob, JSON als Daten. Auditiert server-seitig.
  auditBundlePdf: (projectId: string, regulationId?: string) =>
    api.get(`/projects/${projectId}/requirements/audit-bundle`, {
      params: { format: 'pdf', ...(regulationId ? { regulationId } : {}) },
      responseType: 'blob',
    }),
  auditBundleJson: (projectId: string, regulationId?: string) =>
    api.get(`/projects/${projectId}/requirements/audit-bundle`, {
      params: { format: 'json', ...(regulationId ? { regulationId } : {}) },
    }),

  delete: (projectId: string, id: string) =>
    api.delete(`/projects/${projectId}/requirements/${id}`),

  // UC-REQPROJ-001: project confirmed requirements into the architecture graph
  // as ArchiMate Motivation elements (requirement/constraint) + edges
  projectToModel: (projectId: string, requirementIds?: string[]) =>
    api.post(
      `/projects/${projectId}/requirements/project-to-model`,
      requirementIds ? { requirementIds } : {},
      { timeout: 60_000 },
    ),

  // UC-GAP-001 (THE-307): live gap analysis — what is still open, per
  // regulation / element / global. Always computed fresh server-side.
  gaps: (projectId: string, opts?: {
    regulationId?: string;
    elementId?: string;
    priority?: 'must' | 'should' | 'may';
  }) =>
    api.get(`/projects/${projectId}/compliance/gaps`, { params: opts ?? {} }),
};

// UC-GAP-001 (THE-307) — gap analysis DTOs (mirror of compliance-gaps.service.ts)
export interface GapItem {
  _id: string;
  regulationId: string;
  regulationTitle: string;
  title: string;
  description: string;
  priority: 'must' | 'should' | 'may';
  status: 'open' | 'in_progress' | 'done' | 'waived';
  linkedElementIds: string[];
  ageDays: number;
  createdBy: string;
  createdAt: string;
}

export interface RegulationGapSummary {
  regulationId: string;
  regulationTitle: string;
  total: number;
  open: number;
  done: number;
  openMust: number;
  pctOpen: number;
}

export interface ElementGapSummary {
  elementId: string;
  open: number;
  openMust: number;
}

export interface GapsSummary {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  waived: number;
  openMust: number;
  unlinked: number;
  byRegulation: RegulationGapSummary[];
  topElements: ElementGapSummary[];
}

export interface RequirementProjectionSummary {
  driversUpserted: number;
  requirementsProjected: number;
  constraintsProjected: number;
  influenceEdges: number;
  realizationEdges: number;
  floatingGaps: number;
  elementIds: string[];
}

export const compliancePipelineAPI = {
  getPipelineStatus: (projectId: string) =>
    api.get(`/projects/${projectId}/standards/pipeline-status`),
  getPortfolio: (projectId: string) =>
    api.get(`/projects/${projectId}/standards/portfolio`),
  refreshStats: (projectId: string, standardId: string) =>
    api.post(`/projects/${projectId}/standards/${standardId}/refresh-stats`),
  approvePolicies: (projectId: string, standardId: string, approved: PolicyDraft[]) =>
    api.post(`/projects/${projectId}/standards/${standardId}/approve-policies`, { approved }),
  suggestElements: (projectId: string, standardId: string) =>
    api.get(`/projects/${projectId}/standards/${standardId}/suggest-elements`),
  acceptSuggestedElement: (projectId: string, standardId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/standards/${standardId}/accept-suggested-element`, data),
  // Compliance Snapshots
  getSnapshots: (projectId: string, standardId?: string) =>
    api.get(`/projects/${projectId}/standards/compliance-snapshots`, { params: standardId ? { standardId } : {} }),
  captureSnapshot: (projectId: string, standardId?: string) =>
    api.post(`/projects/${projectId}/standards/compliance-snapshots/capture`, { standardId }),
  // Audit Checklists
  getAuditChecklists: (projectId: string) =>
    api.get(`/projects/${projectId}/standards/audit-checklists`),
  createAuditChecklist: (projectId: string, data: { standardId: string; name: string; targetDate: string; responsibleUserId?: string }) =>
    api.post(`/projects/${projectId}/standards/audit-checklists`, data),
  getAuditChecklist: (projectId: string, id: string) =>
    api.get(`/projects/${projectId}/standards/audit-checklists/${id}`),
  updateChecklistItem: (projectId: string, checklistId: string, itemId: string, data: Record<string, unknown>) =>
    api.patch(`/projects/${projectId}/standards/audit-checklists/${checklistId}/items/${itemId}`, data),
};

// Settings API
export const settingsAPI = {
  getProfile: () => api.get('/settings/profile'),
  updateProfile: (data: { name?: string; bio?: string; avatarUrl?: string }) =>
    api.put('/settings/profile', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/settings/password', { currentPassword, newPassword }),
  deleteAccount: (password: string) =>
    api.delete('/settings/account', { data: { password } }),
  getPreferences: () => api.get('/settings/preferences'),
  updatePreferences: (data: Record<string, unknown>) =>
    api.put('/settings/preferences', data),
  getOAuthProviders: () => api.get('/settings/oauth-providers'),
  unlinkOAuthProvider: (provider: string) =>
    api.delete(`/settings/oauth-providers/${provider}`),
  getSessions: () => api.get('/settings/sessions'),
  revokeSession: (sessionId: string) =>
    api.delete(`/settings/sessions/${sessionId}`),
  // THE-535: meldet alle ANDEREN Geraete ab; die eigene Sitzung bleibt, damit
  // der Nutzer sich nicht mitten in der Aktion selbst aussperrt.
  revokeOtherSessions: () => api.delete('/settings/sessions'),
  getApiKeys: () => api.get('/settings/api-keys'),
  createApiKey: (data: { name: string; permissions?: string[]; expiresInDays?: number }) =>
    api.post('/settings/api-keys', data),
  revokeApiKey: (keyId: string) =>
    api.delete(`/settings/api-keys/${keyId}`),
  getBilling: () => api.get('/settings/billing'),
  // Connections (user-global credential vault)
  getConnectorTypes: () => api.get('/settings/connector-types'),
  getConnections: () => api.get('/settings/connections'),
  createConnection: (data: { name: string; type: string; baseUrl: string; authMethod: string; credentials: Record<string, string> }) =>
    api.post('/settings/connections', data),
  updateConnection: (id: string, data: Record<string, unknown>) =>
    api.put(`/settings/connections/${id}`, data),
  deleteConnection: (id: string) =>
    api.delete(`/settings/connections/${id}`),
  testConnection: (id: string) =>
    api.post(`/settings/connections/${id}/test`),
  // Discovery
  getConnectionOrgs: (id: string) =>
    api.get(`/settings/connections/${id}/orgs`),
  getConnectionRepos: (id: string, org: string, type: string) =>
    api.get(`/settings/connections/${id}/repos`, { params: { org, type } }),
};

// Admin API
export const adminAPI = {
  getUsers: () => api.get('/admin/users'),
  updateUserRole: (uid: string, role: string) =>
    api.put(`/admin/users/${uid}/role`, { role }),
  getAuditLog: (params?: {
    action?: string; entityType?: string; riskLevel?: string;
    startDate?: string; endDate?: string; userSearch?: string;
    limit?: number; offset?: number;
  }) => api.get('/admin/audit-log', { params }),
  getAuditLogStats: () => api.get('/admin/audit-log/stats'),
  exportAuditLog: (params?: Record<string, string>) =>
    api.get('/admin/audit-log/export', { params, responseType: 'blob' as const }),
};

// Ops Register API (THE-476) — platform-wide operational register, system-admin only.
export const opsRegisterAPI = {
  list: () => api.get('/ops/register'),
  gate: (chainId: string, body: { actionType: string; decision: 'approve' | 'reject' }) =>
    api.post(`/ops/register/${chainId}/gate`, body),
  close: (
    chainId: string,
    body: { testsGreen?: boolean; fixRef?: string; appliedAt?: string; note?: string },
  ) => api.post(`/ops/register/${chainId}/close`, body),
  slaSweep: () => api.post('/ops/register/sla-sweep', {}),
};

export const simulationAPI = {
  list: (projectId: string, page = 1, limit = 20) =>
    api.get(`/projects/${projectId}/simulations`, { params: { page, limit } }),
  get: (projectId: string, runId: string) =>
    api.get(`/projects/${projectId}/simulations/${runId}`),
  create: (projectId: string, config: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/simulations`, config),
  cancel: (projectId: string, runId: string) =>
    api.post(`/projects/${projectId}/simulations/${runId}/cancel`),
  delete: (projectId: string, runId: string) =>
    api.delete(`/projects/${projectId}/simulations/${runId}`),
  getPersonas: (projectId: string) =>
    api.get(`/projects/${projectId}/simulations/personas`),
  streamUrl: (projectId: string, runId: string) =>
    `${API_BASE}/projects/${projectId}/simulations/${runId}/stream`,
  // Custom personas
  listCustomPersonas: (projectId: string) =>
    api.get(`/projects/${projectId}/simulations/custom-personas`),
  createCustomPersona: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/simulations/custom-personas`, data),
  bulkCreatePersonas: (projectId: string, personas: Record<string, unknown>[]) =>
    api.post(`/projects/${projectId}/simulations/custom-personas/bulk`, { personas }),
  updateCustomPersona: (projectId: string, personaId: string, data: Record<string, unknown>) =>
    api.patch(`/projects/${projectId}/simulations/custom-personas/${personaId}`, data),
  deleteCustomPersona: (projectId: string, personaId: string) =>
    api.delete(`/projects/${projectId}/simulations/custom-personas/${personaId}`),
};

export const advisorAPI = {
  scan: (projectId: string) =>
    api.get(`/projects/${projectId}/advisor/scan`),
  health: (projectId: string) =>
    api.get(`/projects/${projectId}/advisor/health`),
};

export const roadmapAPI = {
  generate: (projectId: string, config: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/roadmaps`, config),
  getCandidates: (projectId: string) =>
    api.get(`/projects/${projectId}/roadmaps/candidates`),
  list: (projectId: string) =>
    api.get(`/projects/${projectId}/roadmaps`),
  get: (projectId: string, roadmapId: string) =>
    api.get(`/projects/${projectId}/roadmaps/${roadmapId}`),
  rename: (projectId: string, roadmapId: string, name: string) =>
    api.patch(`/projects/${projectId}/roadmaps/${roadmapId}`, { name }),
  delete: (projectId: string, roadmapId: string) =>
    api.delete(`/projects/${projectId}/roadmaps/${roadmapId}`),
  regenerate: (projectId: string, roadmapId: string, config: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/roadmaps/${roadmapId}/regenerate`, config),
  // UC-PLATEAU-001 / REQ-PLATEAU-002: toggle wave-element implementation flag
  markImplementation: (
    projectId: string,
    roadmapId: string,
    waveNumber: number,
    elementId: string,
    body: { implemented: boolean; note?: string },
  ) =>
    api.patch(
      `/projects/${projectId}/roadmaps/${roadmapId}/waves/${waveNumber}/elements/${encodeURIComponent(elementId)}/implementation`,
      body,
    ),
  downloadPDF: (projectId: string, roadmapId: string) =>
    api.get(`/projects/${projectId}/reports/roadmap`, { params: { roadmapId }, responseType: 'blob' }),
};

export const demoAPI = {
  create: () => api.post('/demo/create'),
  createBsh: () => api.post('/demo/create-bsh'),
};

export const blueprintAPI = {
  generateStreamUrl: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/blueprint/generate`,
  import: (projectId: string, data: { elements: unknown[]; connections: unknown[]; input: unknown; workspaceName?: string }) =>
    api.post(`/projects/${projectId}/blueprint/import`, data),
  autofill: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    // Content-Type must be undefined to clear the default 'application/json' header —
    // the browser will auto-set 'multipart/form-data; boundary=...' which multer requires
    return api.post(`/projects/${projectId}/blueprint/autofill`, formData, {
      headers: { 'Content-Type': undefined },
      timeout: 120_000,
    });
  },
};

export const remediationAPI = {
  generateStreamUrl: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/remediation/generate`,
  getProposals: (projectId: string) =>
    api.get(`/projects/${projectId}/remediation/proposals`),
  getProposal: (projectId: string, proposalId: string) =>
    api.get(`/projects/${projectId}/remediation/proposals/${proposalId}`),
  editProposal: (projectId: string, proposalId: string, data: Record<string, unknown>) =>
    api.patch(`/projects/${projectId}/remediation/proposals/${proposalId}`, data),
  applyProposal: (projectId: string, proposalId: string, data?: { selectedTempIds?: string[]; workspaceId?: string }) =>
    api.post(`/projects/${projectId}/remediation/proposals/${proposalId}/apply`, data || {}),
  applyBatch: (projectId: string, proposalIds: string[], workspaceId?: string) =>
    api.post(`/projects/${projectId}/remediation/apply-batch`, { proposalIds, workspaceId }),
  rollbackProposal: (projectId: string, proposalId: string) =>
    api.post(`/projects/${projectId}/remediation/proposals/${proposalId}/rollback`),
};

export const portfolioAPI = {
  getInventory: (projectId: string, params?: Record<string, string>) =>
    api.get(`/projects/${projectId}/portfolio/inventory`, { params }),
  getSummary: (projectId: string) =>
    api.get(`/projects/${projectId}/portfolio/summary`),
  getTimeline: (projectId: string) =>
    api.get(`/projects/${projectId}/portfolio/timeline`),
  updateLifecycle: (projectId: string, elementId: string, data: Record<string, unknown>) =>
    api.patch(`/projects/${projectId}/portfolio/elements/${elementId}/lifecycle`, data),
  bulkUpdateLifecycle: (projectId: string, updates: Array<{ elementId: string; lifecyclePhase: string }>) =>
    api.post(`/projects/${projectId}/portfolio/bulk-lifecycle`, { updates }),
  classifyTIME: (projectId: string) =>
    api.post(`/projects/${projectId}/portfolio/classify-time`),
};

export const scenarioAPI = {
  list: (projectId: string) =>
    api.get(`/projects/${projectId}/scenarios`),
  get: (projectId: string, scenarioId: string) =>
    api.get(`/projects/${projectId}/scenarios/${scenarioId}`),
  create: (projectId: string, data: { name: string; description?: string; deltas?: unknown[] }) =>
    api.post(`/projects/${projectId}/scenarios`, data),
  delete: (projectId: string, scenarioId: string) =>
    api.delete(`/projects/${projectId}/scenarios/${scenarioId}`),
  updateDeltas: (projectId: string, scenarioId: string, deltas: unknown[]) =>
    api.put(`/projects/${projectId}/scenarios/${scenarioId}/deltas`, { deltas }),
  compare: (projectId: string, scenarioAId: string, scenarioBId: string) =>
    api.post(`/projects/${projectId}/scenarios/compare`, { scenarioAId, scenarioBId }),
  rank: (projectId: string, scenarioIds: string[], weights?: Record<string, number>) =>
    api.post(`/projects/${projectId}/scenarios/rank`, { scenarioIds, weights }),
  rankTopsis: (projectId: string, scenarioIds: string[], weights?: Record<string, number>) =>
    api.post(`/projects/${projectId}/scenarios/rank-topsis`, { scenarioIds, weights }),
  getCompliance: (projectId: string, scenarioId: string, framework: string) =>
    api.get(`/projects/${projectId}/scenarios/${scenarioId}/compliance/${framework}`),
  generateAIVariants: (projectId: string, scenarioId: string, count?: number) =>
    api.post(`/projects/${projectId}/scenarios/${scenarioId}/ai-variants`, { count }),
  realOptions: (projectId: string, scenarioId: string, params?: Record<string, number>) =>
    api.post(`/projects/${projectId}/scenarios/${scenarioId}/real-options`, params || {}),
  changeSaturation: (projectId: string, data: { baseCost: number; concurrent: number; threshold?: number; k?: number }) =>
    api.post(`/projects/${projectId}/scenarios/change-saturation`, data),
};

export const integrationAPI = {
  listConnections: (projectId: string) =>
    api.get(`/projects/${projectId}/integrations/connections`),
  list: (projectId: string) =>
    api.get(`/projects/${projectId}/integrations`),
  create: (projectId: string, data: { connectionId: string; filters?: Record<string, string>; mappingRules?: Array<{ sourceType: string; targetType: string }>; syncIntervalMinutes?: number }) =>
    api.post(`/projects/${projectId}/integrations`, data),
  remove: (projectId: string, integrationId: string) =>
    api.delete(`/projects/${projectId}/integrations/${integrationId}`),
  sync: (projectId: string, integrationId: string) =>
    api.post(`/projects/${projectId}/integrations/${integrationId}/sync`),
  test: (projectId: string, integrationId: string) =>
    api.post(`/projects/${projectId}/integrations/${integrationId}/test`),
  syncLogs: (projectId: string, limit = 50, offset = 0) =>
    api.get(`/projects/${projectId}/sync-logs?limit=${limit}&offset=${offset}`),
};

export const enrichmentAPI = {
  csvPreview: (projectId: string, rows: Array<{ matchColumn: string; fields: Record<string, unknown> }>) =>
    api.post(`/projects/${projectId}/enrichment/csv-preview`, { rows }),
  connectorPreview: (projectId: string, connectionId: string, filters?: Record<string, string>) =>
    api.post(`/projects/${projectId}/enrichment/connector-preview`, { connectionId, filters }),
  discover: (projectId: string, connectionId: string) =>
    api.post(`/projects/${projectId}/enrichment/discover`, { connectionId }),
  apply: (projectId: string, matches: Array<{ elementId: string; fields: Record<string, unknown>; conflictStrategy: string }>) =>
    api.post(`/projects/${projectId}/enrichment/apply`, { matches }),
  connectorTypes: (projectId: string) =>
    api.get(`/projects/${projectId}/enrichment/connector-types`),
};

export const oracleAPI = {
  assess: (projectId: string, proposal: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/oracle/assess`, proposal),
  history: (projectId: string) =>
    api.get(`/projects/${projectId}/oracle/history`),
  generateAlternatives: (projectId: string, assessmentId: string, options?: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/oracle/${assessmentId}/generate-alternatives`, options || {}),
  checkSuitability: (projectId: string, elementId: string) =>
    api.post(`/projects/${projectId}/oracle/suitability`, { elementId }),
};

// UC-WFCOMP-001 — bring an n8n workflow, assess it against GDPR Art. 30, attest gaps.
export const wfcompAPI = {
  // The body IS the raw workflow JSON; the server sanitizes it (PII never persisted).
  assess: (projectId: string, workflow: unknown, opts?: { workflowId?: string; infer?: boolean }) =>
    api.post(`/projects/${projectId}/wfcomp/assess`, workflow, {
      params: {
        ...(opts?.workflowId ? { workflowId: opts.workflowId } : {}),
        ...(opts?.infer ? { infer: 'true' } : {}),
      },
    }),
  // Human sign-off: materializes the attested field(s) → the verdict is recomputed.
  recompute: (projectId: string, workflowId: string, attestations: Array<{ litera: string; value: string }>) =>
    api.post(`/projects/${projectId}/wfcomp/recompute`, { workflowId, attestations }),
};

export default api;
