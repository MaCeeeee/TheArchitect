import { useState, useEffect } from 'react';
import {
  Plus, Plug, Trash2, CheckCircle, XCircle, Loader2, RefreshCw,
} from 'lucide-react';
import { settingsAPI } from '../../services/api';

interface ConnectionInfo {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  authMethod: string;
  hasCredentials: boolean;
  lastTestedAt?: string;
  lastTestResult?: { success: boolean; message: string };
  createdAt: string;
}

interface ConnectorType {
  type: string;
  displayName: string;
  authMethods: string[];
}

export default function ConnectionsSettings() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [types, setTypes] = useState<ConnectorType[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [connRes, typesRes] = await Promise.all([
        settingsAPI.getConnections(),
        settingsAPI.getConnectorTypes(),
      ]);
      setConnections(connRes.data.data);
      setTypes(typesRes.data.data);
    } catch {}
    setLoading(false);
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const { data } = await settingsAPI.testConnection(id);
      setConnections((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, lastTestResult: data.data, lastTestedAt: new Date().toISOString() }
            : c,
        ),
      );
    } catch (err: any) {
      setConnections((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, lastTestResult: { success: false, message: err.response?.data?.error || 'Test failed' } }
            : c,
        ),
      );
    }
    setTesting(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await settingsAPI.deleteConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[var(--text-tertiary)] py-12">
        <Loader2 size={16} className="animate-spin" /> Loading connections...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Connections</h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Manage credentials for external services. Use connections in project integrations.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition"
        >
          <Plus size={14} /> Add Connection
        </button>
      </div>

      {showAdd && (
        <AddConnectionForm
          types={types}
          onCreated={() => { setShowAdd(false); load(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {connections.length === 0 && !showAdd && (
        <div className="rounded-lg border border-[var(--border-subtle)] p-8 text-center">
          <Plug size={28} className="mx-auto text-[var(--text-disabled)] mb-3" />
          <p className="text-sm text-[var(--text-tertiary)]">No connections configured</p>
          <p className="text-xs text-[var(--text-disabled)] mt-1">
            Add a connection to GitHub, Jira, or GitLab to sync data into projects.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ConnectorIcon type={conn.type} />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{conn.name}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {conn.baseUrl} &middot; {conn.type} &middot; {conn.authMethod.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleTest(conn.id)}
                  disabled={testing === conn.id}
                  className="rounded px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)] transition"
                >
                  {testing === conn.id ? <Loader2 size={12} className="animate-spin" /> : <><RefreshCw size={10} className="inline mr-1" />Test</>}
                </button>
                <button
                  onClick={() => handleDelete(conn.id)}
                  className="rounded px-1.5 py-1 text-[var(--text-disabled)] hover:text-red-400 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {conn.lastTestResult && (
              <div className={`mt-2 flex items-center gap-2 text-[11px] ${conn.lastTestResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {conn.lastTestResult.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {conn.lastTestResult.message}
                {conn.lastTestedAt && (
                  <span className="text-[var(--text-disabled)] ml-auto">
                    {new Date(conn.lastTestedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Add Connection Form ───

function AddConnectionForm({
  types,
  onCreated,
  onCancel,
}: {
  types: ConnectorType[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState(types[0]?.type || 'github');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [authMethod, setAuthMethod] = useState('personal_token');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedType = types.find((t) => t.type === type);

  const placeholders: Record<string, string> = {
    jira: 'https://yourorg.atlassian.net',
    github: 'https://github.com/your-org',
    gitlab: 'https://gitlab.com',
  };

  const handleSave = async () => {
    if (!name || !baseUrl) { setError('Name and URL are required'); return; }
    setSaving(true);
    setError('');
    try {
      await settingsAPI.createConnection({ name, type, baseUrl, authMethod, credentials });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create connection');
    }
    setSaving(false);
  };

  return (
    <div className="rounded-lg border border-[#00ff41]/20 bg-[#00ff41]/5 p-5 space-y-4">
      <p className="text-sm font-medium text-[var(--text-primary)]">New Connection</p>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Type</span>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setAuthMethod(types.find(t => t.type === e.target.value)?.authMethods[0] || 'personal_token'); }}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
          >
            {types.map((t) => <option key={t.type} value={t.type}>{t.displayName}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My GitHub"
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]"
          />
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-[10px] text-[var(--text-tertiary)]">Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={placeholders[type] || 'https://...'}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Auth Method</span>
          <select
            value={authMethod}
            onChange={(e) => setAuthMethod(e.target.value)}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
          >
            {(selectedType?.authMethods || ['personal_token']).map((m) => (
              <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">Token / API Key</span>
          <input
            type="password"
            value={credentials.token || ''}
            onChange={(e) => setCredentials({ ...credentials, token: e.target.value })}
            className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none"
          />
        </label>
        {type === 'jira' && (
          <label className="space-y-1 col-span-2">
            <span className="text-[10px] text-[var(--text-tertiary)]">Email (Jira Cloud)</span>
            <input
              value={credentials.email || ''}
              onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
              placeholder="user@company.com"
              className="w-full rounded bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-white outline-none placeholder:text-[var(--text-disabled)]"
            />
          </label>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-white transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 rounded-md bg-[#00ff41] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create
        </button>
      </div>
    </div>
  );
}

function ConnectorIcon({ type }: { type: string }) {
  const colors: Record<string, string> = { jira: '#0052CC', github: '#ffffff', gitlab: '#FC6D26' };
  return (
    <div
      className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold"
      style={{ backgroundColor: `${colors[type] || '#6b7280'}20`, color: colors[type] || '#6b7280' }}
    >
      {type[0]?.toUpperCase()}
    </div>
  );
}
