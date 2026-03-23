import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Search, Download, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Loader2, AlertCircle, X,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

interface AuditEntry {
  _id: string;
  userId: { name?: string; email?: string } | string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  riskLevel: string;
  timestamp: string;
}

interface Stats {
  total: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

const ACTION_COLORS: Record<string, string> = {
  create_element: '#22c55e',
  update_element: '#3b82f6',
  delete_element: '#ef4444',
  create_connection: '#22c55e',
  delete_connection: '#ef4444',
  create_project: '#22c55e',
  delete_project: '#ef4444',
  import_bpmn: '#f97316',
  import_n8n: '#f97316',
  login_success: '#06b6d4',
  login_failed: '#ef4444',
  mfa_enabled: '#00ff41',
  mfa_disabled: '#eab308',
  change_user_role: '#ec4899',
  create_approval: '#22c55e',
  decide_approval: '#3b82f6',
  create_policy: '#22c55e',
  update_policy: '#3b82f6',
  delete_policy: '#ef4444',
};

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create_element', label: 'Create Element' },
  { value: 'update_element', label: 'Update Element' },
  { value: 'delete_element', label: 'Delete Element' },
  { value: 'create_connection', label: 'Create Connection' },
  { value: 'delete_connection', label: 'Delete Connection' },
  { value: 'create_project', label: 'Create Project' },
  { value: 'delete_project', label: 'Delete Project' },
  { value: 'import_bpmn', label: 'BPMN Import' },
  { value: 'import_n8n', label: 'n8n Import' },
  { value: 'login_success', label: 'Login Success' },
  { value: 'login_failed', label: 'Login Failed' },
  { value: 'mfa_enabled', label: 'MFA Enabled' },
  { value: 'mfa_disabled', label: 'MFA Disabled' },
  { value: 'change_user_role', label: 'Role Change' },
  { value: 'create_approval', label: 'Create Approval' },
  { value: 'decide_approval', label: 'Decide Approval' },
  { value: 'create_policy', label: 'Create Policy' },
  { value: 'update_policy', label: 'Update Policy' },
  { value: 'delete_policy', label: 'Delete Policy' },
];

const ENTITY_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'element', label: 'Element' },
  { value: 'connection', label: 'Connection' },
  { value: 'project', label: 'Project' },
  { value: 'user', label: 'User' },
  { value: 'policy', label: 'Policy' },
  { value: 'approval', label: 'Approval' },
  { value: 'workspace', label: 'Workspace' },
];

const RISK_OPTIONS = [
  { value: '', label: 'All Risk Levels' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const LIMIT = 50;

function getUserName(userId: AuditEntry['userId']): string {
  if (typeof userId === 'object' && userId) {
    return userId.name || userId.email || 'Unknown';
  }
  return String(userId).slice(0, 8);
}

function getUserEmail(userId: AuditEntry['userId']): string {
  if (typeof userId === 'object' && userId) {
    return userId.email || '';
  }
  return '';
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  if (total > 1) pages.push(total);
  return pages;
}

const selectClass = 'bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-secondary)] px-2 py-1.5 outline-none focus:border-[#00ff41]/40 transition';
const inputClass = 'bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-secondary)] px-2 py-1.5 outline-none focus:border-[#00ff41]/40 transition';

export default function AuditLogsSection() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, low: 0, medium: 0, high: 0, critical: 0 });
  const [exporting, setExporting] = useState(false);

  // Filters
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterRiskLevel, setFilterRiskLevel] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce user search
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedUserSearch(userSearch);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [userSearch]);

  // Load stats on mount
  useEffect(() => {
    adminAPI.getAuditLogStats().then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  // Load logs when filters or page change
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (filterAction) params.action = filterAction;
      if (filterEntityType) params.entityType = filterEntityType;
      if (filterRiskLevel) params.riskLevel = filterRiskLevel;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      if (debouncedUserSearch) params.userSearch = debouncedUserSearch;

      const { data } = await adminAPI.getAuditLog(params as Parameters<typeof adminAPI.getAuditLog>[0]);
      setLogs(data.data);
      setTotal(data.total);
    } catch {
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterEntityType, filterRiskLevel, dateFrom, dateTo, debouncedUserSearch]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.ceil(total / LIMIT);
  const hasFilters = filterAction || filterEntityType || filterRiskLevel || dateFrom || dateTo || userSearch;

  const clearFilters = () => {
    setFilterAction('');
    setFilterEntityType('');
    setFilterRiskLevel('');
    setDateFrom('');
    setDateTo('');
    setUserSearch('');
    setDebouncedUserSearch('');
    setPage(1);
  };

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (filterAction) params.action = filterAction;
      if (filterEntityType) params.entityType = filterEntityType;
      if (filterRiskLevel) params.riskLevel = filterRiskLevel;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      if (debouncedUserSearch) params.userSearch = debouncedUserSearch;

      const { data } = await adminAPI.exportAuditLog(params);
      const blob = new Blob([data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Audit log exported');
    } catch {
      toast.error('Failed to export audit log');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <h2 className="text-xl font-semibold text-white mb-1">Audit Logs</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        System-wide activity log. Track all actions, changes, and security events.
      </p>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', count: stats.total, color: '#00ff41' },
          { label: 'Low', count: stats.low, color: RISK_COLORS.low },
          { label: 'Medium', count: stats.medium, color: RISK_COLORS.medium },
          { label: 'High', count: stats.high, color: RISK_COLORS.high },
          { label: 'Critical', count: stats.critical, color: RISK_COLORS.critical },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <div>
              <div className="text-lg font-semibold text-white">{s.count.toLocaleString()}</div>
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={filterAction} onChange={handleFilterChange(setFilterAction)} className={selectClass}>
          {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterEntityType} onChange={handleFilterChange(setFilterEntityType)} className={selectClass}>
          {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterRiskLevel} onChange={handleFilterChange(setFilterRiskLevel)} className={selectClass}>
          {RISK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={handleFilterChange(setDateFrom)}
          className={inputClass}
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={handleFilterChange(setDateTo)}
          className={inputClass}
          placeholder="To"
        />
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search user..."
            className={`${inputClass} pl-6 w-36`}
          />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-[10px] text-[var(--text-secondary)] hover:text-white flex items-center gap-1 transition">
            <X size={12} /> Clear
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[#00ff41] transition disabled:opacity-50"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export CSV
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[150px_1fr_140px_100px_90px_70px_100px] gap-2 px-4 py-2.5 bg-[var(--surface-base)] border-b border-[var(--border-subtle)]">
          {['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Risk', 'IP'].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[#00ff41]" />
            <span className="ml-2 text-sm text-[var(--text-secondary)]">Loading audit logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FileText size={24} className="text-[#1a2a1a] mb-2" />
            <span className="text-sm text-[var(--text-tertiary)]">No audit entries found</span>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log._id}>
              <div
                onClick={() => setExpandedRow(expandedRow === log._id ? null : log._id)}
                className="grid grid-cols-[150px_1fr_140px_100px_90px_70px_100px] gap-2 px-4 py-2.5 border-b border-[#111111] hover:bg-[var(--surface-raised)]/50 cursor-pointer transition items-center"
              >
                {/* Timestamp */}
                <span className="text-xs text-[var(--text-secondary)] font-mono">{formatTimestamp(log.timestamp)}</span>

                {/* User */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="text-xs text-white truncate">{getUserName(log.userId)}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] truncate">{getUserEmail(log.userId)}</div>
                  </div>
                </div>

                {/* Action Badge */}
                <span
                  className="text-[10px] px-2 py-0.5 rounded font-medium w-fit"
                  style={{
                    backgroundColor: `${ACTION_COLORS[log.action] || '#4a5a4a'}20`,
                    color: ACTION_COLORS[log.action] || '#4a5a4a',
                  }}
                >
                  {log.action.replace(/_/g, ' ')}
                </span>

                {/* Entity Type */}
                <span className="text-xs text-[var(--text-secondary)]">{log.entityType}</span>

                {/* Entity ID */}
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate">
                  {log.entityId ? log.entityId.slice(0, 8) : '—'}
                </span>

                {/* Risk */}
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: RISK_COLORS[log.riskLevel] || '#4a5a4a' }} />
                  <span className="text-[10px] text-[var(--text-tertiary)]">{log.riskLevel}</span>
                </div>

                {/* IP */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{log.ip || '—'}</span>
                  {expandedRow === log._id ? <ChevronUp size={12} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={12} className="text-[var(--text-tertiary)]" />}
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedRow === log._id && (
                <div className="px-4 py-3 bg-[var(--surface-base)] border-b border-[var(--border-subtle)] space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider">Entity ID</span>
                      <div className="text-[var(--text-secondary)] font-mono mt-0.5">{log.entityId || '—'}</div>
                    </div>
                    <div>
                      <span className="text-[var(--text-tertiary)] text-[10px] uppercase tracking-wider">User Agent</span>
                      <div className="text-[var(--text-secondary)] mt-0.5 break-all text-[10px]">{log.userAgent || '—'}</div>
                    </div>
                  </div>

                  {(log.before || log.after) && (
                    <div className="grid grid-cols-2 gap-4">
                      {log.before && (
                        <div>
                          <span className="text-[10px] text-red-400 uppercase tracking-wider font-semibold">Before</span>
                          <pre className="mt-1 p-2 rounded bg-red-500/5 border border-red-500/10 text-[10px] text-[var(--text-secondary)] font-mono overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(log.before, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.after && (
                        <div>
                          <span className="text-[10px] text-green-400 uppercase tracking-wider font-semibold">After</span>
                          <pre className="mt-1 p-2 rounded bg-green-500/5 border border-green-500/10 text-[10px] text-[var(--text-secondary)] font-mono overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(log.after, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-[var(--text-tertiary)]">
            Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total.toLocaleString()} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-1 text-[var(--text-tertiary)] hover:text-white disabled:opacity-30 transition"
            >
              <ChevronLeft size={16} />
            </button>
            {getPageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-xs text-[var(--text-tertiary)]">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-[28px] h-7 rounded text-xs transition ${
                    page === p
                      ? 'bg-[#00ff41]/20 text-[#33ff66]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-white'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-1 text-[var(--text-tertiary)] hover:text-white disabled:opacity-30 transition"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
