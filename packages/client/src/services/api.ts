import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import type { PolicyDraft } from '@thearchitect/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

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

          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          const newAccessToken = data.accessToken;

          useAuthStore.getState().setTokens(newAccessToken, data.refreshToken);
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
  updateElement: (projectId: string, elementId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/elements/${elementId}`, data),
  deleteElement: (projectId: string, elementId: string) =>
    api.delete(`/projects/${projectId}/elements/${elementId}`),
  getDependencies: (projectId: string, elementId: string, depth = 3) =>
    api.get(`/projects/${projectId}/elements/${elementId}/dependencies?depth=${depth}`),
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
  getMappings: (projectId: string, standardId: string) =>
    api.get(`/projects/${projectId}/standards/${standardId}/mappings`),
  getMatrix: (projectId: string, standardId: string, sectionIds?: string[]) =>
    api.get(`/projects/${projectId}/standards/${standardId}/matrix`, {
      params: sectionIds ? { sectionIds: sectionIds.join(',') } : {},
    }),
  upsertMapping: (projectId: string, standardId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/standards/${standardId}/mappings`, data),
  bulkCreateMappings: (projectId: string, standardId: string, mappings: Record<string, unknown>[]) =>
    api.post(`/projects/${projectId}/standards/${standardId}/mappings/bulk`, { mappings }),
  deleteMapping: (projectId: string, standardId: string, mappingId: string) =>
    api.delete(`/projects/${projectId}/standards/${standardId}/mappings/${mappingId}`),
};

// Compliance Pipeline API
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
  getApiKeys: () => api.get('/settings/api-keys'),
  createApiKey: (data: { name: string; permissions?: string[]; expiresInDays?: number }) =>
    api.post('/settings/api-keys', data),
  revokeApiKey: (keyId: string) =>
    api.delete(`/settings/api-keys/${keyId}`),
  getBilling: () => api.get('/settings/billing'),
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
  delete: (projectId: string, roadmapId: string) =>
    api.delete(`/projects/${projectId}/roadmaps/${roadmapId}`),
  regenerate: (projectId: string, roadmapId: string, config: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/roadmaps/${roadmapId}/regenerate`, config),
  downloadPDF: (projectId: string, roadmapId: string) =>
    api.get(`/projects/${projectId}/reports/roadmap`, { params: { roadmapId }, responseType: 'blob' }),
};

export const demoAPI = {
  create: () => api.post('/demo/create'),
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

export default api;
