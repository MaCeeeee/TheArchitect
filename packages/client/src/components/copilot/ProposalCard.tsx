import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Check, X, Play, RotateCcw,
  Edit3, Save, Layers, Link2,
} from 'lucide-react';
import type { RemediationProposal, ProposalElement } from '@thearchitect/shared';

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-yellow-400 bg-yellow-500/10' },
  validated: { label: 'Validated', color: 'text-green-400 bg-green-500/10' },
  partially_applied: { label: 'Partial', color: 'text-blue-400 bg-blue-500/10' },
  applied: { label: 'Applied', color: 'text-[#00ff41] bg-[#00ff41]/10' },
  rejected: { label: 'Rejected', color: 'text-red-400 bg-red-500/10' },
  expired: { label: 'Expired', color: 'text-gray-400 bg-gray-500/10' },
};

function confidenceColor(c: number): string {
  if (c >= 0.7) return 'text-green-400';
  if (c >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

interface ProposalCardProps {
  proposal: RemediationProposal;
  onApply: (proposalId: string, selectedTempIds?: string[]) => void;
  onRollback: (proposalId: string) => void;
  onEdit: (proposalId: string, changes: Record<string, unknown>) => void;
  onPreview: (elements: ProposalElement[]) => void;
  isApplying: boolean;
}

export default function ProposalCard({
  proposal,
  onApply,
  onRollback,
  onEdit,
  onPreview,
  isApplying,
}: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTempIds, setSelectedTempIds] = useState<Set<string>>(
    new Set(proposal.elements.map((e) => e.tempId)),
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(proposal.title);

  const status = STATUS_STYLES[proposal.status] || STATUS_STYLES.draft;
  const canApply = proposal.status === 'validated' || proposal.status === 'draft';
  const canRollback = proposal.status === 'applied' || proposal.status === 'partially_applied';

  const toggleElement = (tempId: string) => {
    setSelectedTempIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const handleApply = () => {
    const allSelected = selectedTempIds.size === proposal.elements.length;
    onApply(proposal.id, allSelected ? undefined : [...selectedTempIds]);
  };

  const handleSaveTitle = () => {
    if (titleDraft.trim() && titleDraft !== proposal.title) {
      onEdit(proposal.id, { title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  return (
    <div className="rounded border border-[#334155] bg-[#1e293b]/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) onPreview(proposal.elements);
        }}
        className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-white/[0.02] transition"
      >
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                className="text-sm font-medium text-white bg-[#0f172a] border border-[#7c3aed]/50 rounded px-1.5 py-0.5 w-full outline-none"
                autoFocus
              />
              <button onClick={handleSaveTitle} className="text-[#00ff41] hover:text-[#33ff66]">
                <Save size={10} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p className="text-sm font-semibold text-white leading-tight truncate">{proposal.title}</p>
              {canApply && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
                  className="text-[var(--text-tertiary)] hover:text-white shrink-0"
                >
                  <Edit3 size={8} />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${status.color}`}>
              {status.label}
            </span>
            <span className={`text-[11px] ${confidenceColor(proposal.confidence)}`}>
              {Math.round(proposal.confidence * 100)}% confidence
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {proposal.elements.length} elements, {proposal.connections.length} connections
            </span>
          </div>
        </div>
        {expanded
          ? <ChevronDown size={12} className="text-[var(--text-tertiary)] mt-1 shrink-0" />
          : <ChevronRight size={12} className="text-[var(--text-tertiary)] mt-1 shrink-0" />
        }
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {proposal.description && (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{proposal.description}</p>
          )}

          {/* Elements List */}
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Layers size={9} className="text-[#7c3aed]" />
              <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Proposed Elements</span>
            </div>
            {proposal.elements.map((el) => (
              <div
                key={el.tempId}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-[#0f172a]/50 hover:bg-[#0f172a]/80 transition"
              >
                {canApply && (
                  <button
                    onClick={() => toggleElement(el.tempId)}
                    className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
                      selectedTempIds.has(el.tempId)
                        ? 'bg-[#7c3aed] border-[#7c3aed]'
                        : 'border-[#475569]'
                    }`}
                  >
                    {selectedTempIds.has(el.tempId) && <Check size={8} className="text-white" />}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{el.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-[var(--text-disabled)]">{el.type}</span>
                    <span className="text-[10px] text-[var(--text-disabled)]">{el.layer}</span>
                    {el.sectionReference && (
                      <span className="text-[10px] text-[#7c3aed]">{el.sectionReference}</span>
                    )}
                  </div>
                </div>
                <span className={`text-[11px] shrink-0 ${confidenceColor(el.confidence)}`}>
                  {Math.round(el.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>

          {/* Connections List */}
          {proposal.connections.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Link2 size={9} className="text-[#7c3aed]" />
                <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Proposed Connections</span>
              </div>
              {proposal.connections.map((conn) => (
                <div key={conn.tempId} className="px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                  {conn.sourceTempId} <span className="text-[#7c3aed]">--[{conn.type}]--&gt;</span> {conn.targetTempId}
                </div>
              ))}
            </div>
          )}

          {/* Validation Warnings */}
          {proposal.validation && !proposal.validation.overallValid && (
            <div className="space-y-0.5">
              <span className="text-[11px] text-yellow-400 uppercase tracking-wider">Validation Issues</span>
              {proposal.validation.elementResults
                .filter((r) => r.warnings.length > 0 || r.errors.length > 0)
                .slice(0, 5)
                .map((r) => (
                  <div key={r.tempId} className="text-[11px]">
                    {r.errors.map((e, i) => (
                      <p key={i} className="text-red-400">{r.tempId}: {e}</p>
                    ))}
                    {r.warnings.map((w, i) => (
                      <p key={i} className="text-yellow-400">{r.tempId}: {w}</p>
                    ))}
                  </div>
                ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {canApply && (
              <>
                <button
                  onClick={handleApply}
                  disabled={isApplying || selectedTempIds.size === 0}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <Play size={9} />
                  {selectedTempIds.size === proposal.elements.length
                    ? (proposal.elements.length === 1 ? 'Apply this' : `Apply all ${proposal.elements.length}`)
                    : `Apply ${selectedTempIds.size} of ${proposal.elements.length}`}
                </button>
                <button
                  onClick={() => onEdit(proposal.id, { status: 'rejected' })}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition"
                >
                  <X size={9} />
                  Reject
                </button>
              </>
            )}
            {canRollback && (
              <button
                onClick={() => onRollback(proposal.id)}
                disabled={isApplying}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50 transition"
              >
                <RotateCcw size={9} />
                Rollback
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
