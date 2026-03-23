import { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, ChevronDown, ChevronRight, Loader2, Calendar, CheckCircle2, Circle, Clock, FileCheck } from 'lucide-react';
import { useComplianceStore } from '../../stores/complianceStore';

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#e2e8f0] flex items-center gap-2">
          <ClipboardCheck size={14} className="text-[#7c3aed]" />
          Audit Readiness
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-[#7c3aed]/20 text-[#a78bfa] hover:bg-[#7c3aed]/30 transition-colors"
        >
          <Plus size={12} />
          New Checklist
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-[var(--surface-overlay)] rounded-lg p-3 space-y-2 border border-[var(--border-subtle)]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Checklist name (e.g., ISO 27001 Audit Q2)"
            className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[#e2e8f0] placeholder-[#64748b]"
          />
          <select
            value={newStandardId}
            onChange={(e) => setNewStandardId(e.target.value)}
            className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[#e2e8f0]"
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
            className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[#e2e8f0]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName || !newStandardId || !newDate}
              className="flex-1 py-1.5 text-xs rounded bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-40 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs rounded bg-[#334155] text-[var(--text-secondary)] hover:bg-[#475569] transition-colors"
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
        <div className="text-center py-8 text-[var(--text-tertiary)] text-xs">
          No audit checklists yet. Create one to start tracking readiness.
        </div>
      ) : (
        <div className="space-y-2">
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
                  className="w-full flex items-center gap-3 p-3 hover:bg-[var(--surface-overlay)]/80 transition-colors text-left"
                >
                  {isExpanded ? <ChevronDown size={14} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={14} className="text-[var(--text-tertiary)]" />}
                  <ReadinessRing value={cl.overallReadiness} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[#e2e8f0] truncate">{cl.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {cl.items.filter((i) => i.status === 'verified').length}/{cl.items.length} verified
                      </span>
                      <span className={`text-[10px] flex items-center gap-1 ${urgent ? 'text-[#ef4444]' : 'text-[var(--text-tertiary)]'}`}>
                        <Calendar size={10} />
                        {daysUntil > 0 ? `${daysUntil}d left` : 'Overdue'}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Expanded items */}
                {isExpanded && selectedChecklist?._id === cl._id && (
                  <div className="border-t border-[var(--border-subtle)] max-h-[300px] overflow-y-auto">
                    {selectedChecklist.items.map((item) => {
                      const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.not_started;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)]/50 last:border-b-0 hover:bg-[var(--surface-raised)]/30"
                        >
                          <Icon size={14} style={{ color: cfg.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-[#e2e8f0] truncate">
                              <span className="text-[var(--text-tertiary)] mr-1">{item.sectionNumber}</span>
                              {item.title}
                            </div>
                            {item.evidence.length > 0 && (
                              <div className="text-[9px] text-[var(--text-tertiary)] mt-0.5">
                                {item.evidence.length} evidence item{item.evidence.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                          <select
                            value={item.status}
                            onChange={(e) => handleItemStatusChange(cl._id, item.id, e.target.value)}
                            className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                          >
                            {Object.entries(STATUS_CONFIG).map(([key, v]) => (
                              <option key={key} value={key}>{v.label}</option>
                            ))}
                          </select>
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
