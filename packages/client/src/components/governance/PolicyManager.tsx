import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ScrollText, Plus, ToggleLeft, ToggleRight, AlertTriangle, AlertCircle, Info, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { governanceAPI } from '../../services/api';

interface PolicyRule {
  field: string;
  operator: string;
  value: unknown;
  message: string;
}

interface PolicyItem {
  _id: string;
  name: string;
  description: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
  framework: string;
  rules: PolicyRule[];
  scope: { domains: string[]; elementTypes: string[]; layers: string[] };
}

const CATEGORIES = ['architecture', 'security', 'naming', 'compliance', 'data', 'custom'] as const;
const SEVERITIES = ['error', 'warning', 'info'] as const;
const OPERATORS = ['equals', 'not_equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'exists', 'regex'] as const;
const FIELDS = ['description', 'maturityLevel', 'riskLevel', 'status', 'type', 'layer', 'name'] as const;

export default function PolicyManager() {
  const { projectId } = useParams();
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<string>('architecture');
  const [newSeverity, setNewSeverity] = useState<string>('warning');
  const [newDescription, setNewDescription] = useState('');
  const [ruleField, setRuleField] = useState<string>('description');
  const [ruleOperator, setRuleOperator] = useState<string>('exists');
  const [ruleValue, setRuleValue] = useState('true');
  const [ruleMessage, setRuleMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const loadPolicies = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await governanceAPI.getPolicies(projectId);
      setPolicies(data.data || []);
    } catch {
      setError('Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPolicies(); }, [projectId]);

  const togglePolicy = async (id: string, enabled: boolean) => {
    if (!projectId) return;
    setPolicies((prev) => prev.map((p) => p._id === id ? { ...p, enabled } : p));
    try {
      await governanceAPI.updatePolicy(projectId, id, { enabled });
      toast.success('Policy updated');
    } catch {
      setPolicies((prev) => prev.map((p) => p._id === id ? { ...p, enabled: !enabled } : p));
      toast.error('Failed to toggle policy');
      setError('Failed to toggle policy');
    }
  };

  const handleCreate = async () => {
    if (!projectId || !newName.trim() || !ruleMessage.trim()) return;
    setCreating(true);
    try {
      let parsedValue: unknown = ruleValue;
      if (ruleValue === 'true') parsedValue = true;
      else if (ruleValue === 'false') parsedValue = false;
      else if (!isNaN(Number(ruleValue))) parsedValue = Number(ruleValue);

      await governanceAPI.createPolicy(projectId, {
        name: newName.trim(),
        category: newCategory,
        severity: newSeverity,
        description: newDescription.trim(),
        rules: [{ field: ruleField, operator: ruleOperator, value: parsedValue, message: ruleMessage.trim() }],
      });
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
      setRuleMessage('');
      await loadPolicies();
      toast.success('Policy created');
    } catch {
      toast.error('Failed to create policy');
      setError('Failed to create policy');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!projectId) return;
    try {
      await governanceAPI.deletePolicy(projectId, id);
      setPolicies((prev) => prev.filter((p) => p._id !== id));
      toast.success('Policy deleted');
    } catch {
      toast.error('Failed to delete policy');
      setError('Failed to delete policy');
    }
  };

  const severityIcon = (s: string) => {
    if (s === 'error') return <AlertCircle size={10} className="text-[#ef4444]" />;
    if (s === 'warning') return <AlertTriangle size={10} className="text-[#eab308]" />;
    return <Info size={10} className="text-[#3b82f6]" />;
  };

  const categoryColors: Record<string, string> = {
    architecture: '#00ff41', security: '#ef4444', naming: '#3b82f6',
    compliance: '#22c55e', data: '#06b6d4', custom: '#7a8a7a',
  };

  const enabledCount = policies.filter((p) => p.enabled).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <ScrollText size={14} className="text-[#06b6d4]" />
          Policy Manager
        </h3>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{enabledCount}/{policies.length} policies active</p>
      </div>

      <div className="p-3">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="w-full rounded-md bg-[#1a2a1a] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#3a4a3a] transition flex items-center justify-center gap-1"
        >
          <Plus size={10} />
          Create Policy
        </button>
      </div>

      {showCreate && (
        <div className="px-3 pb-3">
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Policy name"
              className="w-full bg-[var(--surface-raised)] rounded px-2 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41]"
            />
            <div className="flex gap-1">
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded px-2 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded px-2 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-[var(--surface-raised)] rounded px-2 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41]"
            />

            {/* Rule */}
            <div className="border-t border-[var(--border-subtle)] pt-2">
              <span className="text-[9px] text-[var(--text-tertiary)] font-semibold uppercase">Rule</span>
              <div className="flex gap-1 mt-1">
                <select value={ruleField} onChange={(e) => setRuleField(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded px-1 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none">
                  {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={ruleOperator} onChange={(e) => setRuleOperator(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded px-1 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none">
                  {OPERATORS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <input
                value={ruleValue}
                onChange={(e) => setRuleValue(e.target.value)}
                placeholder="Expected value"
                className="w-full bg-[var(--surface-raised)] rounded px-2 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41] mt-1"
              />
              <input
                value={ruleMessage}
                onChange={(e) => setRuleMessage(e.target.value)}
                placeholder="Violation message"
                className="w-full bg-[var(--surface-raised)] rounded px-2 py-1 text-[10px] text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41] mt-1"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !ruleMessage.trim() || creating}
                className="flex-1 rounded bg-[#00ff41] px-2 py-1 text-[10px] text-black hover:bg-[#00cc33] disabled:opacity-50"
              >
                {creating ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded bg-[#1a2a1a] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[#3a4a3a]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <span className="text-[10px] text-red-300">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-[#06b6d4]" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {policies.map((p) => (
            <div key={p._id} className="px-3 py-2 border-b border-[var(--border-subtle)]/30 hover:bg-[var(--surface-base)] transition group">
              <div className="flex items-center gap-2">
                {severityIcon(p.severity)}
                <span className="text-[10px] text-white font-medium flex-1 truncate">{p.name}</span>
                <button
                  onClick={() => handleDelete(p._id)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[#ef4444] transition p-0.5"
                  title="Delete policy"
                >
                  <Trash2 size={10} />
                </button>
                <button onClick={() => togglePolicy(p._id, !p.enabled)} className="text-[var(--text-secondary)]">
                  {p.enabled
                    ? <ToggleRight size={16} className="text-[#22c55e]" />
                    : <ToggleLeft size={16} className="text-[var(--text-disabled)]" />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1 ml-4">
                <span
                  className="text-[8px] px-1 rounded capitalize"
                  style={{ color: categoryColors[p.category] || '#7a8a7a', backgroundColor: `${categoryColors[p.category] || '#7a8a7a'}20` }}
                >
                  {p.category}
                </span>
                <span className="text-[8px] text-[var(--text-disabled)]">{p.rules.length} rule{p.rules.length !== 1 ? 's' : ''}</span>
              </div>
              {p.description && <p className="text-[9px] text-[var(--text-tertiary)] mt-1 ml-4">{p.description}</p>}
            </div>
          ))}
          {policies.length === 0 && (
            <p className="text-[10px] text-[var(--text-tertiary)] text-center py-6">No policies yet. Create one to start.</p>
          )}
        </div>
      )}
    </div>
  );
}
