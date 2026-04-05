import { useState, useEffect } from 'react';
import {
  Plus, Plug, RefreshCw, Trash2, CheckCircle, XCircle, Loader2,
  ExternalLink, AlertTriangle, Settings,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { integrationAPI, settingsAPI } from '../../services/api';

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

export default function ConnectorPanel({ projectId }: Props) {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<ConnectionRef[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
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
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/settings/connections')}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] text-[var(--text-tertiary)] hover:text-white transition"
          >
            <Settings size={12} /> Manage Connections
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 rounded-md bg-[#00ff41] px-2.5 py-1 text-[10px] font-medium text-black hover:bg-[#00cc33] transition"
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
              : 'First add a connection in Settings > Connections, then link it here.'}
          </p>
        </div>
      )}

      {integrations.map((integ) => {
        const sync = integ.lastSync;
        const test = testResults[integ.id];
        const isSyncing = syncing === integ.id;
        const isTesting = testing === integ.id;

        return (
          <div key={integ.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ConnectorIcon type={integ.connectionType} />
                <div>
                  <p className="text-sm font-medium text-white">{integ.connectionName}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{integ.baseUrl} &middot; {integ.connectionType}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleTest(integ.id)}
                  disabled={isTesting}
                  className="rounded px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-base)] transition"
                >
                  {isTesting ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                </button>
                <button
                  onClick={() => handleSync(integ.id)}
                  disabled={isSyncing}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-[#00ff41] hover:bg-[#00ff41]/10 transition"
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
                {test.message}
              </div>
            )}

            {sync && (
              <div className={`rounded-md p-2 text-[10px] ${sync.status === 'success' ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
                {sync.status === 'success'
                  ? `Synced ${sync.elementsCreated} elements, ${sync.connectionsCreated} connections in ${sync.durationMs}ms`
                  : `Error: ${sync.warnings?.[0] || 'Sync failed'}`}
                {(sync.warnings?.length || 0) > 1 && (
                  <span className="ml-2 text-amber-400">(+{sync.warnings.length - 1} warnings)</span>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-fetch state
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgEntry | null>(null);

  const selectedConn = connections.find((c) => c.id === connectionId);
  const connType = selectedConn?.type || '';

  // Fetch orgs/projects when connection changes
  useEffect(() => {
    if (!connectionId || connType === '') return;
    setOrgs([]);
    setRepos([]);
    setSelectedOrg(null);
    setSelectedRepos(new Set());
    if (connType === 'github' || connType === 'gitlab' || connType === 'jira') {
      fetchOrgs(connectionId);
    }
  }, [connectionId, connType]);

  // Fetch repos when org changes
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
        // Auto-set filter
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
      // Update filters
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
      await integrationAPI.create(projectId, { connectionId, filters });
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

        {/* Organization / Project picker (auto-fetched) */}
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
              <p className="text-[10px] text-[var(--text-disabled)] px-1">No organizations found. Check credentials.</p>
            ) : null}
          </label>
        )}

        {/* Jira: auto-generated JQL with option to customize */}
        {connType === 'jira' && selectedOrg && (
          <label className="space-y-1 block">
            <span className="text-[10px] text-[var(--text-tertiary)]">JQL Filter (auto-generated, editable)</span>
            <input
              value={filters.jql || ''}
              onChange={(e) => setFilters({ ...filters, jql: e.target.value })}
              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
            />
          </label>
        )}

        {/* Repo multi-select (auto-fetched) */}
        {(connType === 'github' || connType === 'gitlab') && selectedOrg && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-tertiary)]">
                Repositories
                {loadingRepos && <Loader2 size={10} className="inline ml-1 animate-spin" />}
                {!loadingRepos && repos.length > 0 && (
                  <span className="text-[var(--text-disabled)] ml-1">
                    ({selectedRepos.size}/{repos.filter((r) => !r.archived).length} selected)
                  </span>
                )}
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
                  <label
                    key={repo.fullName}
                    className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--surface-overlay)] transition ${
                      selectedRepos.has(repo.fullName) ? 'bg-[#00ff41]/5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRepos.has(repo.fullName)}
                      onChange={() => toggleRepo(repo.fullName)}
                      className="rounded accent-[#00ff41]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white truncate">{repo.name}</p>
                      {repo.description && (
                        <p className="text-[9px] text-[var(--text-disabled)] truncate">{repo.description}</p>
                      )}
                    </div>
                    {repo.language && (
                      <span className="text-[9px] text-[var(--text-disabled)] shrink-0">{repo.language}</span>
                    )}
                    {repo.private && (
                      <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 rounded shrink-0">private</span>
                    )}
                  </label>
                ))}
              </div>
            ) : !loadingRepos ? (
              <p className="text-[10px] text-[var(--text-disabled)] px-1">No repositories found.</p>
            ) : null}
          </div>
        )}
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

function ConnectorIcon({ type }: { type: string }) {
  const colors: Record<string, string> = { jira: '#0052CC', github: '#ffffff', gitlab: '#FC6D26' };
  return (
    <div
      className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
      style={{ backgroundColor: `${colors[type] || '#6b7280'}20`, color: colors[type] || '#6b7280' }}
    >
      {type[0]?.toUpperCase()}
    </div>
  );
}
