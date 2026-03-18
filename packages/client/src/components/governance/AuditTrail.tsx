import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { History, FileEdit, Plus, Trash2, Link, Loader2, ChevronDown } from 'lucide-react';
import { governanceAPI } from '../../services/api';

interface AuditEntry {
  _id: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId: { name?: string; email?: string } | string;
  timestamp: string;
  riskLevel: string;
}

const PAGE_SIZE = 30;

export default function AuditTrail() {
  const { projectId } = useParams();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('');

  const loadEntries = async (loadOffset = 0, append = false) => {
    if (!projectId) return;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const params: { limit: number; offset: number; action?: string } = { limit: PAGE_SIZE, offset: loadOffset };
      if (actionFilter) params.action = actionFilter;
      const { data } = await governanceAPI.getAuditLog(projectId, params);
      const result = data.data || {};
      if (append) {
        setEntries((prev) => [...prev, ...(result.logs || [])]);
      } else {
        setEntries(result.logs || []);
      }
      setTotal(result.total || 0);
      setOffset(loadOffset + PAGE_SIZE);
    } catch {
      setError('Failed to load audit log');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    loadEntries(0);
  }, [projectId, actionFilter]);

  const actionIcon = (a: string) => {
    if (a.includes('create')) return <Plus size={10} className="text-[#22c55e]" />;
    if (a.includes('update') || a.includes('decide')) return <FileEdit size={10} className="text-[#3b82f6]" />;
    if (a.includes('delete')) return <Trash2 size={10} className="text-[#ef4444]" />;
    return <Link size={10} className="text-[#00ff41]" />;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getUserName = (userId: AuditEntry['userId']) => {
    if (typeof userId === 'object' && userId !== null) return userId.name || userId.email || 'Unknown';
    return 'Unknown';
  };

  const riskColor: Record<string, string> = {
    low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444',
  };

  // Collect unique actions for filter
  const uniqueActions = [...new Set(entries.map((e) => e.action))].sort();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#1a2a1a]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <History size={14} className="text-[#00ff41]" />
          Audit Trail
        </h3>
        <p className="text-[10px] text-[#4a5a4a] mt-1">{total} recorded actions</p>
      </div>

      {/* Filter */}
      <div className="px-3 py-2 border-b border-[#1a2a1a]">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-full bg-[#0a0a0a] rounded px-2 py-1 text-[10px] text-white border border-[#1a2a1a] outline-none focus:border-[#00ff41]"
        >
          <option value="">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <span className="text-[10px] text-red-300">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-[#00ff41]" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry._id} className="flex items-start gap-2 px-3 py-2 border-b border-[#1a2a1a]/30 hover:bg-[#0a0a0a] transition">
              <div className="mt-0.5">{actionIcon(entry.action)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-white truncate">
                  {entry.action.replace(/_/g, ' ')}
                  {entry.entityType && <span className="text-[#4a5a4a]"> · {entry.entityType}</span>}
                </div>
                <div className="text-[8px] text-[#3a4a3a] mt-0.5 flex items-center gap-1">
                  {getUserName(entry.userId)} · {formatTime(entry.timestamp)}
                  {entry.riskLevel && entry.riskLevel !== 'low' && (
                    <span
                      className="px-1 rounded text-[7px]"
                      style={{ color: riskColor[entry.riskLevel], backgroundColor: `${riskColor[entry.riskLevel]}20` }}
                    >
                      {entry.riskLevel}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {entries.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-xs text-[#4a5a4a] text-center">No audit entries yet</p>
            </div>
          )}

          {/* Load More */}
          {entries.length < total && (
            <button
              onClick={() => loadEntries(offset, true)}
              disabled={loadingMore}
              className="w-full flex items-center justify-center gap-1 py-2 text-[10px] text-[#7a8a7a] hover:text-white transition"
            >
              {loadingMore ? <Loader2 size={10} className="animate-spin" /> : <ChevronDown size={10} />}
              {loadingMore ? 'Loading...' : `Load more (${total - entries.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
