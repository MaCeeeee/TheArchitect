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
    if (s === 'approved') return <CheckCircle size={16} className="text-[#22c55e]" />;
    if (s === 'rejected') return <XCircle size={16} className="text-[#ef4444]" />;
    return <Clock size={16} className="text-[#eab308]" />;
  };

  const priorityColor: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
  };

  const selectedApproval = approvals.find((a) => a._id === selected);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ClipboardCheck size={18} className="text-[#3b82f6]" />
            Approval Workflow
          </h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded p-1.5 text-[var(--text-secondary)] hover:text-white hover:bg-[#1a2a1a] transition"
            title="Create Approval"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Approval title"
            className="w-full bg-[var(--surface-base)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#3b82f6]"
          />
          <div className="flex gap-2">
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="flex-1 bg-[var(--surface-base)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none">
              {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="flex-1 bg-[var(--surface-base)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <input
            value={newApproverName}
            onChange={(e) => setNewApproverName(e.target.value)}
            placeholder="Approver name"
            className="w-full bg-[var(--surface-base)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#3b82f6]"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-[var(--surface-base)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#3b82f6] resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || !newApproverName.trim() || creating}
              className="flex-1 rounded-md bg-[#3b82f6] px-3 py-2 text-sm text-white font-medium hover:bg-[#2563eb] disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)} className="flex-1 rounded-md bg-[#1a2a1a] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[#3a4a3a]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex border-b border-[var(--border-subtle)]">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium capitalize ${
              filter === f ? 'text-white border-b-2 border-[#3b82f6]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20">
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[#3b82f6]" />
        </div>
      ) : !selectedApproval ? (
        /* List */
        <div className="flex-1 overflow-y-auto">
          {filtered.map((a) => (
            <button
              key={a._id}
              onClick={() => setSelected(a._id)}
              className="flex w-full items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)]/50 hover:bg-[var(--surface-base)] transition text-left"
            >
              {statusIcon(a.status)}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{a.title}</div>
                <div className="text-xs text-[var(--text-disabled)]">{a.requesterName} · {a.type.replace(/_/g, ' ')}</div>
              </div>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priorityColor[a.priority] }} />
              <ChevronRight size={14} className="text-[var(--text-disabled)]" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No approval requests</p>
          )}
        </div>
      ) : (
        /* Detail View */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <button onClick={() => setSelected(null)} className="text-sm text-[#3b82f6] hover:underline">
            &larr; Back
          </button>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
            <div className="flex items-center gap-2.5 mb-3">
              {statusIcon(selectedApproval.status)}
              <span className="text-sm text-white font-medium">{selectedApproval.title}</span>
            </div>
            {selectedApproval.description && (
              <p className="text-xs text-[var(--text-secondary)] mb-3">{selectedApproval.description}</p>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[var(--text-tertiary)]">Type:</span> <span className="text-[var(--text-secondary)] capitalize">{selectedApproval.type.replace(/_/g, ' ')}</span></div>
              <div><span className="text-[var(--text-tertiary)]">Priority:</span> <span style={{ color: priorityColor[selectedApproval.priority] }} className="capitalize">{selectedApproval.priority}</span></div>
              <div><span className="text-[var(--text-tertiary)]">Requester:</span> <span className="text-[var(--text-secondary)]">{selectedApproval.requesterName}</span></div>
              <div><span className="text-[var(--text-tertiary)]">Created:</span> <span className="text-[var(--text-secondary)]">{new Date(selectedApproval.createdAt).toLocaleDateString()}</span></div>
            </div>
          </div>

          {/* Steps */}
          <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Approval Steps</h4>
          <div className="space-y-1.5">
            {selectedApproval.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2.5">
                {statusIcon(step.status)}
                <span className="text-sm text-white flex-1">{step.approverName}</span>
                <span className="text-xs text-[var(--text-disabled)] capitalize">{step.status}</span>
                {i === selectedApproval.currentStep && selectedApproval.status === 'pending' && (
                  <span className="text-xs bg-[#eab308]/20 text-[#eab308] px-1.5 py-0.5 rounded">Current</span>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          {selectedApproval.status === 'pending' && (
            <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
              <textarea
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                placeholder="Comment (optional)"
                rows={2}
                className="w-full bg-[var(--surface-base)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#3b82f6] resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecision('approved')}
                  disabled={deciding}
                  className="flex-1 rounded-md bg-[#22c55e] px-3 py-2 text-sm font-medium text-white hover:bg-[#16a34a] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleDecision('rejected')}
                  disabled={deciding}
                  className="flex-1 rounded-md bg-[#ef4444] px-3 py-2 text-sm font-medium text-white hover:bg-[#dc2626] disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
              <button
                onClick={() => handleCancel(selectedApproval._id)}
                className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-white hover:border-[#3a4a3a] transition"
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
