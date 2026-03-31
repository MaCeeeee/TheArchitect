import { useState, useEffect } from 'react';
import {
  Plus, Plug, RefreshCw, Trash2, CheckCircle, XCircle, Loader2,
  ChevronDown, ExternalLink, AlertTriangle,
} from 'lucide-react';
import api from '../../services/api';

interface ConnectorType {
  type: string;
  displayName: string;
  authMethods: string[];
}

interface ConnectorConfig {
  type: string;
  name: string;
  baseUrl: string;
  authMethod: string;
  hasCredentials: boolean;
  mappingRules: Array<{ sourceType: string; targetType: string }>;
  syncIntervalMinutes: number;
  filters: Record<string, string>;
  enabled: boolean;
}

interface SyncResult {
  status: string;
  elementsCreated: number;
  connectionsCreated: number;
  warnings: string[];
  durationMs: number;
  syncedAt: string;
}

interface Props {
  projectId: string;
}

export default function ConnectorPanel({ projectId }: Props) {
  const [types, setTypes] = useState<ConnectorType[]>([]);
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Record<string, SyncResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => {
    loadTypes();
    loadConnectors();
  }, [projectId]);

  const loadTypes = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/connectors/types`);
      setTypes(data.data);
    } catch {}
  };

  const loadConnectors = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/connectors`);
      setConnectors(data.data);
    } catch {}
  };

  const handleTest = async (name: string) => {
    setTesting(name);
    try {
      const { data } = await api.post(`/projects/${projectId}/connectors/${encodeURIComponent(name)}/test`);
      setTestResults(prev => ({ ...prev, [name]: data.data }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [name]: { success: false, message: err.response?.data?.error || 'Test failed' } }));
    } finally {
      setTesting(null);
    }
  };

  const handleSync = async (name: string) => {
    setSyncing(name);
    try {
      const { data } = await api.post(`/projects/${projectId}/connectors/${encodeURIComponent(name)}/sync`);
      setLastSync(prev => ({ ...prev, [name]: data.data }));
    } catch (err: any) {
      setLastSync(prev => ({
        ...prev,
        [name]: { status: 'error', elementsCreated: 0, connectionsCreated: 0, warnings: [err.response?.data?.error || 'Sync failed'], durationMs: 0, syncedAt: new Date().toISOString() },
      }));
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await api.delete(`/projects/${projectId}/connectors/${encodeURIComponent(name)}`);
      setConnectors(prev => prev.filter(c => c.name !== name));
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug size={16} className="text-[#00ff41]" />
          <h3 className="text-sm font-semibold text-white">Integrations</h3>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 rounded-md bg-[#00ff41] px-2.5 py-1 text-[10px] font-medium text-black hover:bg-[#00cc33] transition"
        >
          <Plus size={12} /> Add Connector
        </button>
      </div>

      {/* Add connector form */}
      {showAdd && <AddConnectorForm projectId={projectId} types={types} onCreated={() => { setShowAdd(false); loadConnectors(); }} />}

      {/* Connector list */}
      {connectors.length === 0 && !showAdd && (
        <div className="rounded-lg border border-[var(--border-subtle)] p-6 text-center">
          <Plug size={24} className="mx-auto text-[#1a2a1a] mb-2" />
          <p className="text-xs text-[var(--text-tertiary)]">No connectors configured</p>
          <p className="text-[10px] text-[var(--text-disabled)] mt-1">Connect Jira, GitHub, or GitLab to sync architecture data</p>
        </div>
      )}

      {connectors.map((conn) => {
        const sync = lastSync[conn.name];
        const test = testResults[conn.name];
        const isSyncing = syncing === conn.name;
        const isTesting = testing === conn.name;

        return (
          <div key={conn.name} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ConnectorIcon type={conn.type} />
                <div>
                  <p className="text-sm font-medium text-white">{conn.name}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{conn.baseUrl} — {conn.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleTest(conn.name)}
                  disabled={isTesting}
                  className="rounded px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-base)] transition"
                >
                  {isTesting ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                </button>
                <button
                  onClick={() => handleSync(conn.name)}
                  disabled={isSyncing}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-[#00ff41] hover:bg-[#00ff41]/10 transition"
                >
                  {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Sync
                </button>
                <button
                  onClick={() => handleDelete(conn.name)}
                  className="rounded px-1.5 py-1 text-[var(--text-disabled)] hover:text-red-400 transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Test result */}
            {test && (
              <div className={`flex items-center gap-2 text-[10px] ${test.success ? 'text-green-400' : 'text-red-400'}`}>
                {test.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {test.message}
              </div>
            )}

            {/* Sync result */}
            {sync && (
              <div className={`rounded-md p-2 text-[10px] ${sync.status === 'success' ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
                {sync.status === 'success'
                  ? `Synced ${sync.elementsCreated} elements, ${sync.connectionsCreated} connections in ${sync.durationMs}ms`
                  : `Sync failed: ${sync.warnings?.[0] || 'Unknown error'}`}
                {sync.warnings.length > 1 && (
                  <span className="ml-2 text-amber-400">(+{sync.warnings.length - 1} warnings)</span>
                )}
              </div>
            )}

            {/* Filters */}
            {Object.keys(conn.filters).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(conn.filters).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-[var(--surface-base)] px-2 py-0.5 text-[9px] text-[var(--text-tertiary)]">
                    {k}: {v.length > 30 ? v.slice(0, 30) + '...' : v}
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

// ─── Add Connector Form ───

function AddConnectorForm({ projectId, types, onCreated }: { projectId: string; types: ConnectorType[]; onCreated: () => void }) {
  const [type, setType] = useState(types[0]?.type || 'jira');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [authMethod, setAuthMethod] = useState('api_key');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedType = types.find(t => t.type === type);

  const handleSave = async () => {
    if (!name || !baseUrl) { setError('Name and URL are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/projects/${projectId}/connectors`, {
        type, name, baseUrl, authMethod, credentials, filters,
        mappingRules: [], syncIntervalMinutes: 0,
      });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create connector');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#00ff41]/20 bg-[#00ff41]/5 p-4 space-y-3">
      <p className="text-xs font-medium text-white">New Connector</p>

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Type</span>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none">
            {types.map(t => <option key={t.type} value={t.type}>{t.displayName}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="My Jira"
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]" />
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-[10px] text-[var(--text-tertiary)]">Base URL</span>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder={type === 'jira' ? 'https://yourorg.atlassian.net' : type === 'github' ? 'https://api.github.com' : 'https://gitlab.com'}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Auth Method</span>
          <select value={authMethod} onChange={e => setAuthMethod(e.target.value)}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none">
            {(selectedType?.authMethods || ['api_key']).map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Token / API Key</span>
          <input type="password" value={credentials.token || ''} onChange={e => setCredentials({ ...credentials, token: e.target.value })}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none" />
        </label>
        {type === 'jira' && (
          <label className="space-y-1 col-span-2">
            <span className="text-[10px] text-[var(--text-tertiary)]">Email (Jira Cloud)</span>
            <input value={credentials.email || ''} onChange={e => setCredentials({ ...credentials, email: e.target.value })}
              placeholder="user@company.com"
              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]" />
          </label>
        )}
        {type === 'jira' && (
          <label className="space-y-1 col-span-2">
            <span className="text-[10px] text-[var(--text-tertiary)]">JQL Filter</span>
            <input value={filters.jql || ''} onChange={e => setFilters({ ...filters, jql: e.target.value })}
              placeholder="project = MYPROJ AND type = Epic ORDER BY created DESC"
              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]" />
          </label>
        )}
        {(type === 'github' || type === 'gitlab') && (
          <label className="space-y-1 col-span-2">
            <span className="text-[10px] text-[var(--text-tertiary)]">Organization / Group</span>
            <input value={filters.org || filters.groupId || ''} onChange={e => setFilters({ ...filters, [type === 'gitlab' ? 'groupId' : 'org']: e.target.value })}
              placeholder={type === 'github' ? 'my-org' : 'group-id'}
              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]" />
          </label>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 rounded-md bg-[#00ff41] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create
        </button>
      </div>
    </div>
  );
}

function ConnectorIcon({ type }: { type: string }) {
  const colors: Record<string, string> = { jira: '#0052CC', github: '#ffffff', gitlab: '#FC6D26' };
  return (
    <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
      style={{ backgroundColor: `${colors[type] || '#6b7280'}20`, color: colors[type] || '#6b7280' }}>
      {type[0]?.toUpperCase()}
    </div>
  );
}
