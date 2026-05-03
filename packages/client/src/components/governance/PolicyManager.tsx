import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ScrollText, Plus, ToggleLeft, ToggleRight, AlertTriangle, AlertCircle, Info, Trash2, Loader2, FileStack, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react';
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
  const [showTemplates, setShowTemplates] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set(['dora', 'nis2']));
  const [seeding, setSeeding] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);

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

  const handleSeed = async () => {
    if (!projectId || selectedTemplates.size === 0) return;
    setSeeding(true);
    try {
      const { data } = await governanceAPI.seedPolicies(projectId, Array.from(selectedTemplates));
      toast.success(`${data.data.created} template policies created as draft`);
      setShowTemplates(false);
      loadPolicies();
    } catch {
      toast.error('Failed to apply templates');
    } finally {
      setSeeding(false);
    }
  };

  const handleReEvaluate = async () => {
    if (!projectId) return;
    setReEvaluating(true);
    try {
      const { data } = await governanceAPI.reEvaluateViolations(projectId);
      const evaluated = data?.data?.policiesEvaluated ?? 0;
      const cleaned = data?.data?.selfViolationsResolved ?? 0;
      toast.success(
        cleaned > 0
          ? `Re-evaluated ${evaluated} policies · cleaned up ${cleaned} self-violation${cleaned === 1 ? '' : 's'}`
          : `Re-evaluated ${evaluated} policies`,
      );
    } catch {
      toast.error('Failed to re-evaluate policies');
    } finally {
      setReEvaluating(false);
    }
  };

  const toggleTemplate = (t: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const severityIcon = (s: string) => {
    if (s === 'error') return <AlertCircle size={16} className="text-[#ef4444]" />;
    if (s === 'warning') return <AlertTriangle size={16} className="text-[#eab308]" />;
    return <Info size={16} className="text-[#3b82f6]" />;
  };

  const categoryColors: Record<string, string> = {
    architecture: '#00ff41', security: '#ef4444', naming: '#3b82f6',
    compliance: '#22c55e', data: '#06b6d4', custom: '#7a8a7a',
  };

  const enabledCount = policies.filter((p) => p.enabled).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <ScrollText size={18} className="text-[#06b6d4]" />
          Policy Manager
        </h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">{enabledCount}/{policies.length} policies active</p>
      </div>

      <div className="p-4 flex gap-2">
        <button
          onClick={() => { setShowCreate(!showCreate); setShowTemplates(false); }}
          className="flex-1 rounded-md bg-[#1a2a1a] px-4 py-2 text-xs font-medium text-white hover:bg-[#3a4a3a] transition flex items-center justify-center gap-1.5"
        >
          <Plus size={14} />
          Create
        </button>
        <button
          onClick={() => { setShowTemplates(!showTemplates); setShowCreate(false); }}
          className="flex-1 rounded-md bg-[#1a2a1a] px-4 py-2 text-xs font-medium text-white hover:bg-[#3a4a3a] transition flex items-center justify-center gap-1.5"
        >
          <FileStack size={14} />
          Templates
        </button>
        <button
          onClick={handleReEvaluate}
          disabled={reEvaluating}
          title="Re-evaluate all active policies against current architecture and clean up stale self-violations"
          className="flex-1 rounded-md bg-[#1a2a1a] px-4 py-2 text-xs font-medium text-white hover:bg-[#3a4a3a] transition flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {reEvaluating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
          {reEvaluating ? 'Re-evaluating…' : 'Re-evaluate'}
        </button>
      </div>

      {showTemplates && (
        <div className="px-4 pb-4">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 space-y-3">
            <p className="text-xs text-[var(--text-secondary)]">Apply policy templates from regulatory frameworks. Imported as draft — review before activating.</p>
            {[
              { id: 'dora', label: 'DORA', desc: '5 policies (ICT Risk, Incidents, Resilience, Third-Party, Intelligence)', severity: 'critical/high' },
              { id: 'nis2', label: 'NIS2', desc: '4 policies (Risk, Incidents, Continuity, Supply Chain)', severity: 'high/medium' },
              { id: 'togaf', label: 'TOGAF Baseline', desc: '3 policies (Description, Naming, Layer Integrity)', severity: 'medium' },
            ].map(({ id, label, desc, severity }) => (
              <label key={id} className="flex items-start gap-2 cursor-pointer hover:bg-white/5 rounded p-1.5 -m-1.5 transition">
                <input
                  type="checkbox"
                  checked={selectedTemplates.has(id)}
                  onChange={() => toggleTemplate(id)}
                  className="mt-0.5 accent-[#00ff41]"
                />
                <div>
                  <div className="text-xs text-white font-medium">{label}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{desc}</div>
                  <div className="text-[10px] text-[var(--text-disabled)]">Severity: {severity}</div>
                </div>
              </label>
            ))}
            <button
              onClick={handleSeed}
              disabled={seeding || selectedTemplates.size === 0}
              className="w-full rounded-md bg-[#00ff41] px-4 py-2 text-xs font-semibold text-black hover:bg-[#00cc33] disabled:opacity-50 transition flex items-center justify-center gap-1.5"
            >
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <FileStack size={14} />}
              Apply {selectedTemplates.size} Template{selectedTemplates.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="px-4 pb-4">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 space-y-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Policy name"
              className="w-full bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41]"
            />
            <div className="flex gap-2">
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41]"
            />

            {/* Rule */}
            <div className="border-t border-[var(--border-subtle)] pt-3">
              <span className="text-xs text-[var(--text-tertiary)] font-semibold uppercase">Rule</span>
              <div className="flex gap-2 mt-2">
                <select value={ruleField} onChange={(e) => setRuleField(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none">
                  {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={ruleOperator} onChange={(e) => setRuleOperator(e.target.value)} className="flex-1 bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none">
                  {OPERATORS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <input
                value={ruleValue}
                onChange={(e) => setRuleValue(e.target.value)}
                placeholder="Expected value"
                className="w-full bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41] mt-2"
              />
              <input
                value={ruleMessage}
                onChange={(e) => setRuleMessage(e.target.value)}
                placeholder="Violation message"
                className="w-full bg-[var(--surface-raised)] rounded-md px-3 py-2 text-sm text-white border border-[var(--border-subtle)] outline-none focus:border-[#00ff41] mt-2"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !ruleMessage.trim() || creating}
                className="flex-1 rounded-md bg-[#00ff41] px-3 py-2 text-sm text-black font-medium hover:bg-[#00cc33] disabled:opacity-50"
              >
                {creating ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-md bg-[#1a2a1a] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[#3a4a3a]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20">
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[#06b6d4]" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {policies.map((p) => (
            <PolicyCard
              key={p._id}
              policy={p}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              onDelete={handleDelete}
              onToggle={togglePolicy}
              severityIcon={severityIcon}
            />
          ))}
          {policies.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No policies yet. Create one to start.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expandable Policy Card ─────────────────────────────
function PolicyCard({ policy: p, expandedId, onToggleExpand, onDelete, onToggle, severityIcon }: {
  policy: PolicyItem;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  severityIcon: (s: string) => React.ReactNode;
}) {
  const isExpanded = expandedId === p._id;
  const categoryColors: Record<string, string> = {
    compliance: '#22c55e', security: '#ef4444', architecture: '#f59e0b',
    naming: '#06b6d4', data: '#3b82f6', custom: '#a855f7',
  };

  return (
    <div className="border-b border-[var(--border-subtle)]/30 hover:bg-[var(--surface-base)] transition group">
      {/* Header — clickable to expand */}
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => onToggleExpand(p._id)}
      >
        <div className="flex items-center gap-2.5">
          {severityIcon(p.severity)}
          <span className="text-sm text-white font-medium flex-1 truncate">{p.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(p._id); }}
            className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[#ef4444] transition p-1"
            title="Delete policy"
          >
            <Trash2 size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onToggle(p._id, !p.enabled); }} className="text-[var(--text-secondary)]">
            {p.enabled
              ? <ToggleRight size={20} className="text-[#22c55e]" />
              : <ToggleLeft size={20} className="text-[var(--text-disabled)]" />}
          </button>
          {isExpanded ? <ChevronUp size={14} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={14} className="text-[var(--text-tertiary)]" />}
        </div>
        <div className="flex items-center gap-2.5 mt-1.5 ml-6">
          <span
            className="text-xs px-1.5 py-0.5 rounded capitalize"
            style={{ color: categoryColors[p.category] || '#7a8a7a', backgroundColor: `${categoryColors[p.category] || '#7a8a7a'}20` }}
          >
            {p.category}
          </span>
          {(p as PolicyItem & { status?: string }).status === 'draft' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#6b7280]/20 text-[#9ca3af]">draft</span>
          )}
          {(p as PolicyItem & { status?: string }).status === 'archived' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ef4444]/10 text-[#ef4444]/60">archived</span>
          )}
          <span className="text-xs text-[var(--text-disabled)]">{p.rules.length} rule{p.rules.length !== 1 ? 's' : ''}</span>
        </div>
        {p.description && <p className="text-xs text-[var(--text-tertiary)] mt-1 ml-6 line-clamp-1">{p.description}</p>}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-3 ml-6 space-y-2 border-t border-[var(--border-subtle)]/20 pt-2">
          {p.description && (
            <div>
              <span className="text-[10px] uppercase text-[var(--text-disabled)] tracking-wider">Description</span>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{p.description}</p>
            </div>
          )}
          <div>
            <span className="text-[10px] uppercase text-[var(--text-disabled)] tracking-wider">Rules ({p.rules.length})</span>
            <div className="mt-1 space-y-1.5">
              {p.rules.map((r, i) => (
                <div key={i} className="rounded bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <code className="text-cyan-300">{r.field}</code>
                    <span className="text-[var(--text-disabled)]">{r.operator}</span>
                    <code className="text-amber-300">{String(r.value)}</code>
                  </div>
                  {r.message && <p className="text-[var(--text-tertiary)] mt-0.5 text-[11px]">{r.message}</p>}
                </div>
              ))}
            </div>
          </div>
          {p.framework && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-[var(--text-disabled)] tracking-wider">Framework</span>
              <span className="text-xs text-[var(--text-secondary)]">{p.framework}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
