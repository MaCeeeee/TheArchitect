import { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, ChevronDown, ChevronRight, Loader2, Calendar, CheckCircle2, Circle, Clock, FileCheck, MessageSquare, Save } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';
import toast from 'react-hot-toast';

interface AuditReadinessDashboardProps {
  projectId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  not_started: { label: 'Not Started', color: '#64748b', icon: Circle },
  in_progress: { label: 'In Progress', color: '#eab308', icon: Clock },
  evidence_collected: { label: 'Evidence', color: '#3b82f6', icon: FileCheck },
  verified: { label: 'Verified', color: '#22c55e', icon: CheckCircle2 },
};

export default function AuditReadinessDashboard({ projectId }: AuditReadinessDashboardProps) {
  const {
    auditChecklists, isLoadingChecklists, loadAuditChecklists,
    selectedChecklist, loadAuditChecklist, updateChecklistItem,
    portfolioOverview,
  } = useComplianceStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { createAuditChecklist } = useComplianceStore();
  const [newName, setNewName] = useState('');
  const [newStandardId, setNewStandardId] = useState('');
  const [newDate, setNewDate] = useState('');

  // Track which items have their notes panel open and local notes edits
  const [notesOpenIds, setNotesOpenIds] = useState<Set<string>>(new Set());
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAuditChecklists(projectId);
  }, [projectId, loadAuditChecklists]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    await loadAuditChecklist(projectId, id);
  };

  const handleCreate = async () => {
    if (!newName || !newStandardId || !newDate) return;
    const id = await createAuditChecklist(projectId, {
      standardId: newStandardId,
      name: newName,
      targetDate: newDate,
    });
    if (id) {
      setShowCreate(false);
      setNewName('');
      setNewStandardId('');
      setNewDate('');
    }
  };

  const handleItemStatusChange = async (checklistId: string, itemId: string, newStatus: string) => {
    await updateChecklistItem(projectId, checklistId, itemId, { status: newStatus });
  };

  const toggleNotes = (itemId: string, currentNotes: string) => {
    setNotesOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        // Initialize local notes with current value
        if (!(itemId in localNotes)) {
          setLocalNotes((n) => ({ ...n, [itemId]: currentNotes || '' }));
        }
      }
      return next;
    });
  };

  const handleSaveNotes = async (checklistId: string, itemId: string) => {
    const notes = localNotes[itemId];
    if (notes === undefined) return;
    setSavingNotes((prev) => new Set(prev).add(itemId));
    try {
      await updateChecklistItem(projectId, checklistId, itemId, { notes });
      toast.success('Findings saved');
    } catch {
      toast.error('Failed to save findings');
    } finally {
      setSavingNotes((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Readiness ring (SVG)
  const ReadinessRing = ({ value, size = 48 }: { value: number; size?: number }) => {
    const r = (size - 6) / 2;
    const circ = 2 * Math.PI * r;
    const progress = (value / 100) * circ;
    const color = value >= 80 ? '#22c55e' : value >= 50 ? '#eab308' : '#ef4444';
    return (
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${progress} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fill={color} fontSize={11} fontWeight="bold">
          {value}%
        </text>
      </svg>
    );
  };

  const standards = portfolioOverview?.portfolio ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#e2e8f0] flex items-center gap-2">
          <ClipboardCheck size={16} className="text-[#7c3aed]" />
          Audit Readiness
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#7c3aed]/20 text-[#a78bfa] hover:bg-[#7c3aed]/30 transition-colors"
        >
          <Plus size={14} />
          New Checklist
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-[var(--surface-overlay)] rounded-lg p-4 space-y-3 border border-[var(--border-subtle)]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Checklist name (e.g., ISO 27001 Audit Q2)"
            className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#64748b]"
          />
          <select
            value={newStandardId}
            onChange={(e) => setNewStandardId(e.target.value)}
            className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-2 text-sm text-[#e2e8f0]"
          >
            <option value="">Select standard...</option>
            {standards.map((s) => (
              <option key={s.standardId} value={s.standardId}>{s.standardName}</option>
            ))}
          </select>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-2 text-sm text-[#e2e8f0]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName || !newStandardId || !newDate}
              className="flex-1 py-2 text-sm rounded bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-40 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm rounded bg-[#334155] text-[var(--text-secondary)] hover:bg-[#475569] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoadingChecklists ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : auditChecklists.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
          No audit checklists yet. Create one to start tracking readiness.
        </div>
      ) : (
        <div className="space-y-3">
          {auditChecklists.map((cl) => {
            const isExpanded = expandedId === cl._id;
            const daysUntil = Math.ceil(
              (new Date(cl.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            const urgent = daysUntil <= 14;

            return (
              <div key={cl._id} className="bg-[var(--surface-overlay)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => handleExpand(cl._id)}
                  className="w-full flex items-center gap-3 p-3.5 hover:bg-[var(--surface-overlay)]/80 transition-colors text-left"
                >
                  {isExpanded ? <ChevronDown size={16} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={16} className="text-[var(--text-tertiary)]" />}
                  <ReadinessRing value={cl.overallReadiness} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#e2e8f0] truncate">{cl.name}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {cl.items.filter((i) => i.status === 'verified').length}/{cl.items.length} verified
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${urgent ? 'text-[#ef4444]' : 'text-[var(--text-tertiary)]'}`}>
                        <Calendar size={12} />
                        {daysUntil > 0 ? `${daysUntil}d left` : 'Overdue'}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Expanded items */}
                {isExpanded && selectedChecklist?._id === cl._id && (
                  <div className="border-t border-[var(--border-subtle)]">
                    {selectedChecklist.items.map((item) => {
                      const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.not_started;
                      const Icon = cfg.icon;
                      const isNotesOpen = notesOpenIds.has(item.id);
                      const hasNotes = !!(item.notes && item.notes.trim());
                      const isSaving = savingNotes.has(item.id);

                      return (
                        <div
                          key={item.id}
                          className="border-b border-[var(--border-subtle)]/50 last:border-b-0"
                        >
                          <div className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-[var(--surface-raised)]/30">
                            <Icon size={16} style={{ color: cfg.color }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-[#e2e8f0]">
                                <span className="text-[var(--text-tertiary)] mr-1.5">{item.sectionNumber}</span>
                                {item.title}
                              </div>
                              {item.evidence.length > 0 && (
                                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                  {item.evidence.length} evidence item{item.evidence.length > 1 ? 's' : ''}
                                </div>
                              )}
                            </div>

                            {/* Findings toggle */}
                            <button
                              onClick={() => toggleNotes(item.id, item.notes)}
                              className={`p-1 rounded transition ${hasNotes ? 'text-[#7c3aed]' : 'text-[var(--text-tertiary)]'} hover:text-[#a78bfa] hover:bg-[var(--surface-raised)]`}
                              title={hasNotes ? 'View/edit findings' : 'Add findings'}
                            >
                              <MessageSquare size={14} />
                            </button>

                            <select
                              value={item.status}
                              onChange={(e) => handleItemStatusChange(cl._id, item.id, e.target.value)}
                              className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-secondary)]"
                            >
                              {Object.entries(STATUS_CONFIG).map(([key, v]) => (
                                <option key={key} value={key}>{v.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Findings/Notes panel */}
                          {isNotesOpen && (
                            <div className="px-3.5 pb-3 pt-1">
                              <label className="text-xs text-[var(--text-secondary)] font-medium mb-1 block">
                                Findings &amp; Actions
                              </label>
                              <textarea
                                value={localNotes[item.id] ?? item.notes ?? ''}
                                onChange={(e) => setLocalNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                                placeholder="Document what was found during the audit and what actions are needed..."
                                rows={3}
                                className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#475569] resize-y focus:border-[#7c3aed] outline-none"
                              />
                              <div className="flex justify-end mt-1.5">
                                <button
                                  onClick={() => handleSaveNotes(cl._id, item.id)}
                                  disabled={isSaving}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#7c3aed]/20 text-[#a78bfa] hover:bg-[#7c3aed]/30 disabled:opacity-50 transition-colors"
                                >
                                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                  Save Findings
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
