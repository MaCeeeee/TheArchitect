import { useState, useEffect } from 'react';
import {
  Plus, Plug, RefreshCw, Trash2, CheckCircle, XCircle, Loader2,
  ExternalLink, AlertTriangle, Settings, Database,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { integrationAPI, settingsAPI, enrichmentAPI } from '../../services/api';

interface ConnectionRef {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
}

interface Integration {
  id: string;
  connectionId: string;
  connectionName: string;
  connectionType: string;
  baseUrl: string;
  filters: Record<string, string>;
  mappingRules: Array<{ sourceType: string; targetType: string }>;
  syncIntervalMinutes: number;
  enabled: boolean;
  lastSync?: {
    status: string;
    syncedAt: string;
    elementsCreated: number;
    connectionsCreated: number;
    durationMs: number;
    warnings: string[];
  };
}

interface Props {
  projectId: string;
}

// ─── Connector Colors (shared with ConnectionsSettings) ───

const CONNECTOR_COLORS: Record<string, string> = {
  jira: '#0052CC', github: '#ffffff', gitlab: '#FC6D26', sonarqube: '#4E9BCD',
  leanix: '#003366', servicenow: '#81B5A1', sap: '#0070F2', n8n: '#FF6D5A',
  salesforce: '#00A1E0', citrix: '#452170', sparx_ea: '#1B72BE', abacus: '#E4002B',
  standards_db: '#2D8C3C', confluence: '#1868DB', azure_devops: '#0078D7',
};

// Enrichment-capable connectors
const ENRICHMENT_TYPES = new Set(['sonarqube', 'leanix', 'servicenow', 'sap', 'jira', 'abacus']);

function getErrorHint(message: string): string | null {
  if (/401|unauthorized/i.test(message)) return 'Token expired or invalid — regenerate in Settings → Connections';
  if (/403|forbidden/i.test(message)) return 'Insufficient permissions — check API token scopes';
  if (/404|not found/i.test(message)) return 'Endpoint not found — verify the Base URL in Settings';
  if (/429|rate.?limit/i.test(message)) return 'Rate limited — wait a moment and retry';
  if (/500|internal.?server/i.test(message)) return 'Server error — check if the service is running';
  if (/ECONNREFUSED|ENOTFOUND|timeout/i.test(message)) return 'Cannot reach server — check URL and network';
  return null;
}

export default function ConnectorPanel({ projectId }: Props) {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<ConnectionRef[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [enriching, setEnriching] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => { load(); }, [projectId]);

  const load = async () => {
    try {
      const [connRes, integRes] = await Promise.all([
        integrationAPI.listConnections(projectId),
        integrationAPI.list(projectId),
      ]);
      setConnections(connRes.data.data);
      setIntegrations(integRes.data.data);
    } catch {}
  };

  const handleTest = async (integrationId: string) => {
    setTesting(integrationId);
    try {
      const { data } = await integrationAPI.test(projectId, integrationId);
      setTestResults((prev) => ({ ...prev, [integrationId]: data.data }));
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [integrationId]: { success: false, message: err.response?.data?.error || 'Test failed' } }));
    }
    setTesting(null);
  };

  const handleSync = async (integrationId: string) => {
    setSyncing(integrationId);
    try {
      const { data } = await integrationAPI.sync(projectId, integrationId);
      setIntegrations((prev) =>
        prev.map((i) => (i.id === integrationId ? { ...i, lastSync: data.data } : i)),
      );
    } catch (err: any) {
      setIntegrations((prev) =>
        prev.map((i) =>
          i.id === integrationId
            ? { ...i, lastSync: { status: 'error', syncedAt: new Date().toISOString(), elementsCreated: 0, connectionsCreated: 0, durationMs: 0, warnings: [err.response?.data?.error || 'Sync failed'] } }
            : i,
        ),
      );
    }
    setSyncing(null);
  };

  const handleEnrich = async (integ: Integration) => {
    setEnriching(integ.id);
    try {
      const { data } = await enrichmentAPI.connectorPreview(projectId, integ.connectionId, integ.filters);
      const matches = data.data?.matches || [];
      if (matches.length === 0) {
        setTestResults((prev) => ({ ...prev, [`enrich-${integ.id}`]: { success: true, message: 'No enrichment matches found' } }));
      } else {
        // Auto-apply with overwrite strategy
        const applyPayload = matches
          .filter((m: any) => m.confidence >= 0.5)
          .map((m: any) => ({ elementId: m.elementId, fields: m.fields, conflictStrategy: 'higher_wins' }));
        if (applyPayload.length > 0) {
          await enrichmentAPI.apply(projectId, applyPayload);
        }
        setTestResults((prev) => ({
          ...prev,
          [`enrich-${integ.id}`]: { success: true, message: `Enriched ${applyPayload.length} elements with cost data` },
        }));
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [`enrich-${integ.id}`]: { success: false, message: err.response?.data?.error || 'Enrichment failed' },
      }));
    }
    setEnriching(null);
  };

  const handleDelete = async (integrationId: string) => {
    try {
      await integrationAPI.remove(projectId, integrationId);
      setIntegrations((prev) => prev.filter((i) => i.id !== integrationId));
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug size={16} className="text-[#00ff41]" />
          <h3 className="text-sm font-semibold text-white">Integrations</h3>
          {integrations.length > 0 && (
            <span className="text-[9px] bg-[var(--surface-base)] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded-full">
              {integrations.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/settings/connections')}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-white transition"
          >
            <Settings size={12} /> Manage Connections
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 rounded-md bg-[#00ff41] px-2.5 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition"
          >
            <Plus size={12} /> Add Integration
          </button>
        </div>
      </div>

      {showAdd && (
        <AddIntegrationForm
          projectId={projectId}
          connections={connections}
          onCreated={() => { setShowAdd(false); load(); }}
          onManageConnections={() => navigate('/settings/connections')}
        />
      )}

      {integrations.length === 0 && !showAdd && (
        <div className="rounded-lg border border-[var(--border-subtle)] p-6 text-center">
          <Plug size={24} className="mx-auto text-[#1a2a1a] mb-2" />
          <p className="text-xs text-[var(--text-tertiary)]">No integrations configured</p>
          <p className="text-[10px] text-[var(--text-disabled)] mt-1">
            {connections.length > 0
              ? 'Link a connection to sync external data into this project.'
              : 'First add a connection in Settings, then link it here.'}
          </p>
        </div>
      )}

      {integrations.map((integ) => {
        const sync = integ.lastSync;
        const test = testResults[integ.id];
        const enrichResult = testResults[`enrich-${integ.id}`];
        const isSyncing = syncing === integ.id;
        const isTesting = testing === integ.id;
        const isEnriching = enriching === integ.id;
        const canEnrich = ENRICHMENT_TYPES.has(integ.connectionType);

        return (
          <div key={integ.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ConnectorIcon type={integ.connectionType} />
                <div>
                  <p className="text-sm font-medium text-white">{integ.connectionName}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {integ.baseUrl} &middot; {integ.connectionType}
                    {integ.syncIntervalMinutes > 0 && (
                      <span className="ml-1 text-[#00ff41]"> &middot; auto-sync every {integ.syncIntervalMinutes}min</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleTest(integ.id)}
                  disabled={isTesting}
                  className="rounded px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-base)] transition"
                >
                  {isTesting ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                </button>
                {canEnrich && (
                  <button
                    onClick={() => handleEnrich(integ)}
                    disabled={isEnriching}
                    className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-purple-400 hover:bg-purple-500/10 transition"
                    title="Enrich cost data from this connector"
                  >
                    {isEnriching ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                    Enrich
                  </button>
                )}
                {/* TODO: Add "Preview" option that shows element count + types before committing sync */}
                <button
                  onClick={() => handleSync(integ.id)}
                  disabled={isSyncing}
                  className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-[#00ff41] border border-[#00ff41]/30 hover:bg-[#00ff41]/10 transition"
                >
                  {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Sync
                </button>
                <button
                  onClick={() => handleDelete(integ.id)}
                  className="rounded px-1.5 py-1 text-[var(--text-disabled)] hover:text-red-400 transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {test && (
              <div className={`flex items-center gap-2 text-[10px] ${test.success ? 'text-green-400' : 'text-red-400'}`}>
                {test.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                <span>
                  {test.message}
                  {!test.success && getErrorHint(test.message) && (
                    <span className="block text-[var(--text-tertiary)] mt-0.5">{getErrorHint(test.message)}</span>
                  )}
                </span>
              </div>
            )}

            {enrichResult && (
              <div className={`flex items-center gap-2 text-[10px] ${enrichResult.success ? 'text-purple-400' : 'text-red-400'}`}>
                {enrichResult.success ? <Database size={12} /> : <XCircle size={12} />}
                {enrichResult.message}
              </div>
            )}

            {sync && (
              <div className={`rounded-md p-2 text-[10px] ${sync.status === 'success' ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
                {sync.status === 'success' ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium animate-[pulse_1s_ease-in-out]">
                        {sync.elementsCreated > 0 ? `${sync.elementsCreated} elements & ${sync.connectionsCreated} connections discovered` : 'Sync complete — no new elements'}
                      </span>
                      <span className="text-[var(--text-disabled)]">{sync.durationMs}ms</span>
                    </div>
                    {sync.elementsCreated > 0 && (
                      <button
                        onClick={() => navigate(`/project/${projectId}`)}
                        className="text-[#00ff41] text-[10px] hover:underline"
                      >
                        View in 3D →
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <span>Error: {sync.warnings?.[0] || 'Sync failed'}</span>
                    {getErrorHint(sync.warnings?.[0] || '') && <span className="block text-[var(--text-tertiary)] mt-0.5">{getErrorHint(sync.warnings?.[0] || '')}</span>}
                  </>
                )}
                {sync.syncedAt && (
                  <span className="text-[var(--text-disabled)] block mt-1">
                    {new Date(sync.syncedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {Object.keys(integ.filters).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(integ.filters).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-[var(--surface-base)] px-2 py-0.5 text-[9px] text-[var(--text-tertiary)]">
                    {k}: {String(v).length > 30 ? String(v).slice(0, 30) + '...' : v}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Add Integration Form ───

interface OrgEntry { login: string; type: string; id?: number; name?: string }
interface RepoEntry { name: string; fullName: string; description: string; language: string; private: boolean; archived: boolean; updatedAt: string }

function AddIntegrationForm({
  projectId,
  connections,
  onCreated,
  onManageConnections,
}: {
  projectId: string;
  connections: ConnectionRef[];
  onCreated: () => void;
  onManageConnections: () => void;
}) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id || '');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [syncInterval, setSyncInterval] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-fetch state (GitHub/GitLab/Jira)
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgEntry | null>(null);

  const selectedConn = connections.find((c) => c.id === connectionId);
  const connType = selectedConn?.type || '';

  // Reset filters when connection changes
  useEffect(() => {
    setFilters({});
    setOrgs([]);
    setRepos([]);
    setSelectedOrg(null);
    setSelectedRepos(new Set());
    if (connType === 'github' || connType === 'gitlab' || connType === 'jira') {
      if (connectionId) fetchOrgs(connectionId);
    }
  }, [connectionId, connType]);

  useEffect(() => {
    if (!selectedOrg || !connectionId) return;
    setRepos([]);
    setSelectedRepos(new Set());
    if (connType === 'github' || connType === 'gitlab') {
      fetchRepos(connectionId, selectedOrg.login, selectedOrg.type);
    }
  }, [selectedOrg, connectionId, connType]);

  const fetchOrgs = async (connId: string) => {
    setLoadingOrgs(true);
    try {
      const { data } = await settingsAPI.getConnectionOrgs(connId);
      setOrgs(data.data);
      if (data.data.length > 0) {
        setSelectedOrg(data.data[0]);
        const first = data.data[0];
        if (connType === 'github') setFilters((f) => ({ ...f, org: first.login }));
        else if (connType === 'gitlab') setFilters((f) => ({ ...f, groupId: first.login }));
        else if (connType === 'jira') setFilters((f) => ({ ...f, jql: `project = ${first.login} ORDER BY created DESC` }));
      }
    } catch {}
    setLoadingOrgs(false);
  };

  const fetchRepos = async (connId: string, org: string, orgType: string) => {
    setLoadingRepos(true);
    try {
      const { data } = await settingsAPI.getConnectionRepos(connId, org, orgType);
      setRepos(data.data);
    } catch {}
    setLoadingRepos(false);
  };

  const handleOrgChange = (login: string) => {
    const org = orgs.find((o) => o.login === login);
    if (!org) return;
    setSelectedOrg(org);
    if (connType === 'github') setFilters((f) => ({ ...f, org: org.login }));
    else if (connType === 'gitlab') setFilters((f) => ({ ...f, groupId: org.login }));
    else if (connType === 'jira') setFilters((f) => ({ ...f, jql: `project = ${org.login} ORDER BY created DESC` }));
  };

  const toggleRepo = (fullName: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      setFilters((f) => ({ ...f, repos: Array.from(next).join(', ') }));
      return next;
    });
  };

  const selectAllRepos = () => {
    const all = new Set(repos.filter((r) => !r.archived).map((r) => r.fullName));
    setSelectedRepos(all);
    setFilters((f) => ({ ...f, repos: Array.from(all).join(', ') }));
  };

  const deselectAllRepos = () => {
    setSelectedRepos(new Set());
    setFilters((f) => { const next = { ...f }; delete next.repos; return next; });
  };

  if (connections.length === 0) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-center">
        <AlertTriangle size={20} className="mx-auto text-amber-400 mb-2" />
        <p className="text-xs text-[var(--text-secondary)]">No connections available</p>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1 mb-3">
          Add a connection in Settings first, then link it to this project.
        </p>
        <button
          onClick={onManageConnections}
          className="flex items-center gap-1 mx-auto rounded-md bg-[#00ff41] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition"
        >
          <ExternalLink size={12} /> Go to Settings
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    if (!connectionId) { setError('Select a connection'); return; }
    setSaving(true);
    setError('');
    try {
      await integrationAPI.create(projectId, { connectionId, filters, syncIntervalMinutes: syncInterval });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add integration');
    }
    setSaving(false);
  };

  return (
    <div className="rounded-lg border border-[#00ff41]/20 bg-[#00ff41]/5 p-4 space-y-3">
      <p className="text-xs font-medium text-white">Add Integration</p>
      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="space-y-3">
        {/* Connection picker */}
        <label className="space-y-1 block">
          <span className="text-[10px] text-[var(--text-tertiary)]">Connection</span>
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
            ))}
          </select>
        </label>

        {/* ── Type-specific filter forms ── */}

        {/* GitHub/GitLab: org + repo picker */}
        {(connType === 'github' || connType === 'gitlab' || connType === 'jira') && (
          <label className="space-y-1 block">
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {connType === 'jira' ? 'Project' : connType === 'gitlab' ? 'Group' : 'Organization / User'}
              {loadingOrgs && <Loader2 size={10} className="inline ml-1 animate-spin" />}
            </span>
            {orgs.length > 0 ? (
              <select
                value={selectedOrg?.login || ''}
                onChange={(e) => handleOrgChange(e.target.value)}
                className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
              >
                {orgs.map((o) => (
                  <option key={o.login} value={o.login}>
                    {o.name ? `${o.name} (${o.login})` : o.login}
                    {o.type === 'user' ? ' (personal)' : ''}
                  </option>
                ))}
              </select>
            ) : !loadingOrgs ? (
              <p className="text-[10px] text-[var(--text-disabled)] px-1">No organizations found.</p>
            ) : null}
          </label>
        )}

        {connType === 'jira' && selectedOrg && (
          <FilterInput label="JQL Filter" filterKey="jql" filters={filters} setFilters={setFilters} placeholder="project = KEY ORDER BY created DESC" />
        )}

        {(connType === 'github' || connType === 'gitlab') && selectedOrg && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-tertiary)]">
                Repositories {loadingRepos && <Loader2 size={10} className="inline ml-1 animate-spin" />}
                {!loadingRepos && repos.length > 0 && <span className="text-[var(--text-disabled)] ml-1">({selectedRepos.size}/{repos.filter((r) => !r.archived).length})</span>}
              </span>
              {repos.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={selectAllRepos} className="text-[9px] text-[#00ff41] hover:underline">All</button>
                  <button onClick={deselectAllRepos} className="text-[9px] text-[var(--text-disabled)] hover:underline">None</button>
                </div>
              )}
            </div>
            {repos.length > 0 ? (
              <div className="max-h-40 overflow-y-auto rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] divide-y divide-[var(--border-subtle)]">
                {repos.filter((r) => !r.archived).map((repo) => (
                  <label key={repo.fullName} className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--surface-overlay)] transition ${selectedRepos.has(repo.fullName) ? 'bg-[#00ff41]/5' : ''}`}>
                    <input type="checkbox" checked={selectedRepos.has(repo.fullName)} onChange={() => toggleRepo(repo.fullName)} className="rounded accent-[#00ff41]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white truncate">{repo.name}</p>
                      {repo.description && <p className="text-[9px] text-[var(--text-disabled)] truncate">{repo.description}</p>}
                    </div>
                    {repo.language && <span className="text-[9px] text-[var(--text-disabled)] shrink-0">{repo.language}</span>}
                    {repo.private && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 rounded shrink-0">private</span>}
                  </label>
                ))}
              </div>
            ) : !loadingRepos ? <p className="text-[10px] text-[var(--text-disabled)] px-1">No repositories found.</p> : null}
          </div>
        )}

        {/* LeanIX */}
        {connType === 'leanix' && (
          <FilterInput label="Fact Sheet Types (comma-separated)" filterKey="factSheetTypes" filters={filters} setFilters={setFilters} placeholder="Application, ITComponent, BusinessCapability" />
        )}

        {/* ServiceNow */}
        {connType === 'servicenow' && (
          <>
            <FilterInput label="CMDB Tables (comma-separated)" filterKey="tables" filters={filters} setFilters={setFilters} placeholder="cmdb_ci_appl, cmdb_ci_business_app, cmdb_ci_service" />
            <FilterInput label="sysparm_query" filterKey="sysparm_query" filters={filters} setFilters={setFilters} placeholder="install_status=1^operational_status=1" />
          </>
        )}

        {/* SAP */}
        {connType === 'sap' && (
          <label className="space-y-1 block">
            <span className="text-[10px] text-[var(--text-tertiary)]">SAP Mode</span>
            <select
              value={filters.mode || 'solman'}
              onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="solman">Solution Manager (LMDB)</option>
              <option value="cloud_alm">Cloud ALM</option>
              <option value="s4hana">S/4HANA</option>
            </select>
          </label>
        )}

        {/* n8n */}
        {connType === 'n8n' && (
          <>
            <FilterInput label="Tag Filter" filterKey="tag" filters={filters} setFilters={setFilters} placeholder="production" />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.activeOnly === 'true'}
                onChange={(e) => setFilters({ ...filters, activeOnly: e.target.checked ? 'true' : '' })}
                className="rounded accent-[#00ff41]"
              />
              <span className="text-[10px] text-[var(--text-tertiary)]">Active workflows only</span>
            </label>
          </>
        )}

        {/* Salesforce */}
        {connType === 'salesforce' && (
          <FilterInput label="Objects (comma-separated)" filterKey="objects" filters={filters} setFilters={setFilters} placeholder="Account, Opportunity, Product2, Contact" />
        )}

        {/* Citrix */}
        {connType === 'citrix' && (
          <>
            <label className="space-y-1 block">
              <span className="text-[10px] text-[var(--text-tertiary)]">Mode</span>
              <select
                value={filters.mode || 'cloud'}
                onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
                className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
              >
                <option value="cloud">Citrix Cloud</option>
                <option value="onprem">On-Premises CVAD</option>
              </select>
            </label>
            {filters.mode === 'cloud' && (
              <FilterInput label="Customer ID" filterKey="customerId" filters={filters} setFilters={setFilters} placeholder="abc123def" />
            )}
          </>
        )}

        {/* Sparx EA */}
        {connType === 'sparx_ea' && (
          <>
            <FilterInput label="Package ID" filterKey="packageId" filters={filters} setFilters={setFilters} placeholder="42" />
            <FilterInput label="Object Types" filterKey="objectTypes" filters={filters} setFilters={setFilters} placeholder="Component, Class, Activity" />
          </>
        )}

        {/* Abacus */}
        {connType === 'abacus' && (
          <FilterInput label="Mandant (Client Number)" filterKey="mandant" filters={filters} setFilters={setFilters} placeholder="100" />
        )}

        {/* Standards DB */}
        {connType === 'standards_db' && (
          <label className="space-y-1 block">
            <span className="text-[10px] text-[var(--text-tertiary)]">Standard / Framework</span>
            <select
              value={filters.standard || 'iso27001'}
              onChange={(e) => setFilters({ ...filters, standard: e.target.value })}
              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="iso27001">ISO 27001:2022</option>
              <option value="dora">DORA (EU)</option>
              <option value="nis2">NIS2 (EU)</option>
              <option value="bsi">BSI IT-Grundschutz</option>
              <option value="kritis">KRITIS / IT-SiG 2.0</option>
              <option value="nist_800_53">NIST SP 800-53 (live OSCAL)</option>
            </select>
          </label>
        )}

        {/* SonarQube — no special filters needed */}
        {connType === 'sonarqube' && (
          <p className="text-[10px] text-[var(--text-disabled)]">
            SonarQube will auto-discover projects and enrich ksloc, technical debt, error rate, and fitness scores.
          </p>
        )}

        {/* Sync interval */}
        <label className="space-y-1 block">
          <span className="text-[10px] text-[var(--text-tertiary)]">Auto-Sync Interval</span>
          <select
            value={syncInterval}
            onChange={(e) => setSyncInterval(parseInt(e.target.value, 10))}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
          >
            <option value={0}>Manual only</option>
            <option value={60}>Every hour</option>
            <option value={360}>Every 6 hours</option>
            <option value={720}>Every 12 hours</option>
            <option value={1440}>Daily</option>
            <option value={10080}>Weekly</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 rounded-md bg-[#00ff41] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
        </button>
      </div>
    </div>
  );
}

// ─── Shared Components ───

function FilterInput({
  label, filterKey, filters, setFilters, placeholder,
}: {
  label: string;
  filterKey: string;
  filters: Record<string, string>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  placeholder: string;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <input
        value={filters[filterKey] || ''}
        onChange={(e) => setFilters((f) => ({ ...f, [filterKey]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]"
      />
    </label>
  );
}

function ConnectorIcon({ type }: { type: string }) {
  return (
    <div
      className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
      style={{
        backgroundColor: `${CONNECTOR_COLORS[type] || '#6b7280'}20`,
        color: CONNECTOR_COLORS[type] || '#6b7280',
      }}
    >
      {type[0]?.toUpperCase()}
    </div>
  );
}
