import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ScrollText, Plus, ToggleLeft, ToggleRight, AlertTriangle, AlertCircle, Info, Trash2, Loader2 } from 'lucide-react';
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
    } catch {
      setPolicies((prev) => prev.map((p) => p._id === id ? { ...p, enabled: !enabled } : p));
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
    } catch {
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
    } catch {
      setError('Failed to delete policy');
    }
  };

  const severityIcon = (s: string) => {
    if (s === 'error') return <AlertCircle size={10} className="text-[#ef4444]" />;
    if (s === 'warning') return <AlertTriangle size={10} className="text-[#eab308]" />;
    return <Info size={10} className="text-[#3b82f6]" />;
  };

  const categoryColors: Record<string, string> = {
    architecture: '#a855f7', security: '#ef4444', naming: '#3b82f6',
    compliance: '#22c55e', data: '#06b6d4', custom: '#94a3b8',
  };

  const enabledCount = policies.filter((p) => p.enabled).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[#334155]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <ScrollText size={14} className="text-[#06b6d4]" />
          Policy Manager
        </h3>
        <p className="text-[10px] text-[#64748b] mt-1">{enabledCount}/{policies.length} policies active</p>
      </div>

      <div className="p-3">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="w-full rounded-md bg-[#334155] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[#475569] transition flex items-center justify-center gap-1"
        >
          <Plus size={10} />
          Create Policy
        </button>
      </div>

      {showCreate && (
        <div className="px-3 pb-3">
          <div className="rounded-md border border-[#334155] bg-[#0f172a] p-2 space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Policy name"
              className="w-full bg-[#1e293b] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#7c3aed]"
            />
            <div className="flex gap-1">
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 bg-[#1e293b] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)} className="flex-1 bg-[#1e293b] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-[#1e293b] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#7c3aed]"
            />

            {/* Rule */}
            <div className="border-t border-[#334155] pt-2">
              <span className="text-[9px] text-[#64748b] font-semibold uppercase">Rule</span>
              <div className="flex gap-1 mt-1">
                <select value={ruleField} onChange={(e) => setRuleField(e.target.value)} className="flex-1 bg-[#1e293b] rounded px-1 py-1 text-[10px] text-white border border-[#334155] outline-none">
                  {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={ruleOperator} onChange={(e) => setRuleOperator(e.target.value)} className="flex-1 bg-[#1e293b] rounded px-1 py-1 text-[10px] text-white border border-[#334155] outline-none">
                  {OPERATORS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <input
                value={ruleValue}
                onChange={(e) => setRuleValue(e.target.value)}
                placeholder="Expected value"
                className="w-full bg-[#1e293b] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#7c3aed] mt-1"
              />
              <input
                value={ruleMessage}
                onChange={(e) => setRuleMessage(e.target.value)}
                placeholder="Violation message"
                className="w-full bg-[#1e293b] rounded px-2 py-1 text-[10px] text-white border border-[#334155] outline-none focus:border-[#7c3aed] mt-1"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !ruleMessage.trim() || creating}
                className="flex-1 rounded bg-[#7c3aed] px-2 py-1 text-[10px] text-white hover:bg-[#6d28d9] disabled:opacity-50"
              >
                {creating ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded bg-[#334155] px-2 py-1 text-[10px] text-[#94a3b8] hover:bg-[#475569]">
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
            <div key={p._id} className="px-3 py-2 border-b border-[#334155]/30 hover:bg-[#0f172a] transition group">
              <div className="flex items-center gap-2">
                {severityIcon(p.severity)}
                <span className="text-[10px] text-white font-medium flex-1 truncate">{p.name}</span>
                <button
                  onClick={() => handleDelete(p._id)}
                  className="opacity-0 group-hover:opacity-100 text-[#64748b] hover:text-[#ef4444] transition p-0.5"
                  title="Delete policy"
                >
                  <Trash2 size={10} />
                </button>
                <button onClick={() => togglePolicy(p._id, !p.enabled)} className="text-[#94a3b8]">
                  {p.enabled
                    ? <ToggleRight size={16} className="text-[#22c55e]" />
                    : <ToggleLeft size={16} className="text-[#475569]" />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1 ml-4">
                <span
                  className="text-[8px] px-1 rounded capitalize"
                  style={{ color: categoryColors[p.category] || '#94a3b8', backgroundColor: `${categoryColors[p.category] || '#94a3b8'}20` }}
                >
                  {p.category}
                </span>
                <span className="text-[8px] text-[#475569]">{p.rules.length} rule{p.rules.length !== 1 ? 's' : ''}</span>
              </div>
              {p.description && <p className="text-[9px] text-[#64748b] mt-1 ml-4">{p.description}</p>}
            </div>
          ))}
          {policies.length === 0 && (
            <p className="text-[10px] text-[#64748b] text-center py-6">No policies yet. Create one to start.</p>
          )}
        </div>
      )}
    </div>
  );
}
