import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardCheck, Clock, CheckCircle, XCircle, ChevronRight, Plus, Loader2, X } from 'lucide-react';
import { governanceAPI } from '../../services/api';

interface ApprovalStep {
  approverName: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string;
  decidedAt?: string;
}

interface ApprovalItem {
  _id: string;
  title: string;
  type: string;
  description: string;
  requesterName: string;
  requesterId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  steps: ApprovalStep[];
  currentStep: number;
  createdAt: string;
}

const TYPES = ['change_request', 'architecture_review', 'policy_exception', 'deployment'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export default function ApprovalWorkflow() {
  const { projectId } = useParams();
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<string>('change_request');
  const [newPriority, setNewPriority] = useState<string>('medium');
  const [newDescription, setNewDescription] = useState('');
  const [newApproverName, setNewApproverName] = useState('');
  const [creating, setCreating] = useState(false);

  // Decision
  const [deciding, setDeciding] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');

  const loadApprovals = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await governanceAPI.getApprovals(projectId);
      setApprovals(data.data || []);
    } catch {
      setError('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadApprovals(); }, [projectId]);

  const filtered = approvals.filter((a) => {
    if (filter === 'pending') return a.status === 'pending';
    if (filter === 'completed') return a.status === 'approved' || a.status === 'rejected';
    return true;
  });

  const handleCreate = async () => {
    if (!projectId || !newTitle.trim() || !newApproverName.trim()) return;
    setCreating(true);
    try {
      await governanceAPI.createApproval(projectId, {
        title: newTitle.trim(),
        type: newType,
        priority: newPriority,
        description: newDescription.trim(),
        steps: [{ approverId: 'self', approverName: newApproverName.trim() }],
      });
      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
      setNewApproverName('');
      await loadApprovals();
    } catch {
      setError('Failed to create approval');
    } finally {
      setCreating(false);
    }
  };

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!projectId || !selected) return;
    setDeciding(true);
    try {
      await governanceAPI.decideApproval(projectId, selected, decision, decisionComment.trim() || undefined);
      setDecisionComment('');
      await loadApprovals();
    } catch {
      setError('Failed to process decision');
    } finally {
      setDeciding(false);
    }
  };

  const handleCancel = async (approvalId: string) => {
    if (!projectId) return;
    try {
      await governanceAPI.cancelApproval(projectId, approvalId);
      setSelected(null);
      await loadApprovals();
    } catch {
      setError('Failed to cancel');
    }
  };

  const statusIcon = (s: string) => {
    if (s === 'approved') return <CheckCircle size={10} className="text-[#22c55e]" />;
    if (s === 'rejected') return <XCircle size={10} className="text-[#ef4444]" />;
    return <Clock size={10} className="text-[#eab308]" />;
  };

  const priorityColor: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
  };

  const selectedApproval = approvals.find((a) => a._id === selected);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#334155]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <ClipboardCheck size={14} className="text-[#3b82f6]" />
            Approval Workflow
          </h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded p-1 text-[#94a3b8] hover:text-white hover:bg-[#334155] transition"
            title="Create Approval"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="p-3 border-b border-[#334155] space-y-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Approval title"
            className="w-full bg-[#0f172a] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#3b82f6]"
          />
          <div className="flex gap-1">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="flex-1 bg-[#0f172a] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none">
              {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="flex-1 bg-[#0f172a] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <input
            value={newApproverName}
            onChange={(e) => setNewApproverName(e.target.value)}
            placeholder="Approver name"
            className="w-full bg-[#0f172a] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#3b82f6]"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-[#0f172a] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#3b82f6] resize-none"
          />
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || !newApproverName.trim() || creating}
              className="flex-1 rounded bg-[#3b82f6] px-2 py-1 text-[10px] text-white hover:bg-[#2563eb] disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)} className="flex-1 rounded bg-[#334155] px-2 py-1 text-[10px] text-[#94a3b8] hover:bg-[#475569]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex border-b border-[#334155]">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium capitalize ${
              filter === f ? 'text-white border-b-2 border-[#3b82f6]' : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}
          >
            {f}
          </button>
        ))}
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
          <Loader2 size={16} className="animate-spin text-[#3b82f6]" />
        </div>
      ) : !selectedApproval ? (
        /* List */
        <div className="flex-1 overflow-y-auto">
          {filtered.map((a) => (
            <button
              key={a._id}
              onClick={() => setSelected(a._id)}
              className="flex w-full items-center gap-2 px-3 py-2 border-b border-[#334155]/50 hover:bg-[#0f172a] transition text-left"
            >
              {statusIcon(a.status)}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-white truncate">{a.title}</div>
                <div className="text-[9px] text-[#475569]">{a.requesterName} · {a.type.replace(/_/g, ' ')}</div>
              </div>
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: priorityColor[a.priority] }} />
              <ChevronRight size={12} className="text-[#475569]" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-[10px] text-[#64748b] text-center py-6">No approval requests</p>
          )}
        </div>
      ) : (
        /* Detail View */
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <button onClick={() => setSelected(null)} className="text-[10px] text-[#3b82f6] hover:underline">
            &larr; Back
          </button>
          <div className="rounded-md border border-[#334155] bg-[#0f172a] p-3">
            <div className="flex items-center gap-2 mb-2">
              {statusIcon(selectedApproval.status)}
              <span className="text-xs text-white font-medium">{selectedApproval.title}</span>
            </div>
            {selectedApproval.description && (
              <p className="text-[9px] text-[#94a3b8] mb-2">{selectedApproval.description}</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-[9px]">
              <div><span className="text-[#64748b]">Type:</span> <span className="text-[#94a3b8] capitalize">{selectedApproval.type.replace(/_/g, ' ')}</span></div>
              <div><span className="text-[#64748b]">Priority:</span> <span style={{ color: priorityColor[selectedApproval.priority] }} className="capitalize">{selectedApproval.priority}</span></div>
              <div><span className="text-[#64748b]">Requester:</span> <span className="text-[#94a3b8]">{selectedApproval.requesterName}</span></div>
              <div><span className="text-[#64748b]">Created:</span> <span className="text-[#94a3b8]">{new Date(selectedApproval.createdAt).toLocaleDateString()}</span></div>
            </div>
          </div>

          {/* Steps */}
          <h4 className="text-[10px] font-semibold uppercase text-[#64748b]">Approval Steps</h4>
          <div className="space-y-1">
            {selectedApproval.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1.5">
                {statusIcon(step.status)}
                <span className="text-[10px] text-white flex-1">{step.approverName}</span>
                <span className="text-[9px] text-[#475569] capitalize">{step.status}</span>
                {i === selectedApproval.currentStep && selectedApproval.status === 'pending' && (
                  <span className="text-[8px] bg-[#eab308]/20 text-[#eab308] px-1 rounded">Current</span>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          {selectedApproval.status === 'pending' && (
            <div className="space-y-2 pt-2 border-t border-[#334155]">
              <textarea
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                placeholder="Comment (optional)"
                rows={2}
                className="w-full bg-[#0f172a] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#3b82f6] resize-none"
              />
              <div className="flex gap-1">
                <button
                  onClick={() => handleDecision('approved')}
                  disabled={deciding}
                  className="flex-1 rounded bg-[#22c55e] px-2 py-1.5 text-[10px] font-medium text-white hover:bg-[#16a34a] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleDecision('rejected')}
                  disabled={deciding}
                  className="flex-1 rounded bg-[#ef4444] px-2 py-1.5 text-[10px] font-medium text-white hover:bg-[#dc2626] disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
              <button
                onClick={() => handleCancel(selectedApproval._id)}
                className="w-full rounded border border-[#334155] px-2 py-1 text-[10px] text-[#94a3b8] hover:text-white hover:border-[#475569] transition"
              >
                Cancel Request
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
