import { useState, useEffect } from 'react';
import { FileText, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminAPI } from '../../services/api';

interface AuditEntry {
  _id: string;
  userId: { name?: string; email?: string } | string;
  action: string;
  entityType: string;
  entityId: string;
  riskLevel: string;
  ip: string;
  timestamp: string;
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
  login_success: '#06b6d4',
  login_failed: '#ef4444',
  mfa_enabled: '#00ff41',
  mfa_disabled: '#eab308',
  change_user_role: '#ec4899',
};

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filterAction, setFilterAction] = useState('');
  const [loading, setLoading] = useState(false);
  const limit = 50;

  useEffect(() => {
    loadLogs();
  }, [offset, filterAction]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getAuditLog({
        action: filterAction || undefined,
        limit,
        offset,
      });
      setLogs(data.data);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (userId: AuditEntry['userId']) => {
    if (typeof userId === 'object' && userId) {
      return userId.name || userId.email || 'Unknown';
    }
    return String(userId).slice(0, 8);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[#1a2a1a] flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <FileText size={14} className="text-[#00ff41]" />
          Audit Log
        </h3>
        <span className="text-[10px] text-[#4a5a4a]">{total} entries</span>
      </div>

      {/* Filter */}
      <div className="p-2 border-b border-[#1a2a1a] flex items-center gap-2">
        <Filter size={12} className="text-[#4a5a4a]" />
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }}
          className="flex-1 bg-[#0a0a0a] border border-[#1a2a1a] rounded text-[10px] text-[#7a8a7a] px-2 py-1 outline-none"
        >
          <option value="">All Actions</option>
          <option value="create_element">Create Element</option>
          <option value="update_element">Update Element</option>
          <option value="delete_element">Delete Element</option>
          <option value="create_project">Create Project</option>
          <option value="delete_project">Delete Project</option>
          <option value="import_bpmn">BPMN Import</option>
          <option value="login_success">Login Success</option>
          <option value="login_failed">Login Failed</option>
          <option value="change_user_role">Role Change</option>
        </select>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-6">
            <span className="text-xs text-[#4a5a4a]">Loading...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center p-6">
            <span className="text-xs text-[#4a5a4a]">No audit entries found</span>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log._id} className="px-3 py-2 border-b border-[#111111] hover:bg-[#111111]/50">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: `${ACTION_COLORS[log.action] || '#4a5a4a'}20`,
                      color: ACTION_COLORS[log.action] || '#4a5a4a',
                    }}
                  >
                    {log.action.replace(/_/g, ' ')}
                  </span>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: RISK_COLORS[log.riskLevel] || '#4a5a4a' }}
                  />
                </div>
                <span className="text-[9px] text-[#3a4a3a]">
                  {new Date(log.timestamp).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#7a8a7a]">{getUserName(log.userId)}</span>
                {log.entityId && (
                  <span className="text-[9px] text-[#3a4a3a] font-mono">{log.entityId.slice(0, 8)}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="p-2 border-t border-[#1a2a1a] flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="text-[10px] text-[#4a5a4a] hover:text-white disabled:opacity-30 flex items-center gap-0.5"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <span className="text-[10px] text-[#3a4a3a]">
            {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="text-[10px] text-[#4a5a4a] hover:text-white disabled:opacity-30 flex items-center gap-0.5"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
