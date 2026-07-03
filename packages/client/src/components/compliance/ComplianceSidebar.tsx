import { useNavigate, useParams } from 'react-router-dom';
import {
  ShieldAlert, FileText, Grid3X3, FileCheck, Sparkles, TrendingUp, ClipboardCheck, LayoutDashboard,
  Shield, CheckCircle, History, Map, Wrench, Eye, EyeOff, BadgeCheck, Workflow, Compass, Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

// ─── Conformance IA (ADR-0003) ──────────────────────────────────────────────
// One "Conformance" section, split by SUBJECT (what is being assessed):
//   Architecture Conformance → your model   (gates: COVER + ENFORCE)
//   Workflow Conformance     → imported artifacts (gate: ATTEST)
// The gate verbs (Cover/Enforce/Attest) are an internal model — the UI shows
// speaking names; the verb appears only as a small badge next to the group.

export interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'cover' | 'enforce' | 'attest';
}

export const SECTIONS: Section[] = [
  // COVER — requirements → architecture (what does my model satisfy?)
  { id: 'pipeline', label: 'Pipeline', icon: ShieldAlert, group: 'cover' },
  { id: 'portfolio', label: 'Portfolio', icon: LayoutDashboard, group: 'cover' },
  { id: 'standards', label: 'Standards', icon: FileText, group: 'cover' },
  { id: 'matrix', label: 'Matrix', icon: Grid3X3, group: 'cover' },
  { id: 'remediate', label: 'Remediate', icon: Wrench, group: 'cover' },
  { id: 'policies', label: 'Gen. Policies', icon: FileCheck, group: 'cover' },
  { id: 'roadmap', label: 'Roadmap', icon: Map, group: 'cover' },
  { id: 'elements', label: 'Elements', icon: Sparkles, group: 'cover' },
  { id: 'progress', label: 'Progress', icon: TrendingUp, group: 'cover' },
  // UC-GAP-001 (THE-307): the Track view — which requirements are still open
  { id: 'gaps', label: 'Gap Analysis', icon: Target, group: 'cover' },
  { id: 'audit', label: 'Audit', icon: ClipboardCheck, group: 'cover' },
  // ENFORCE — architecture → internal policies (where does it break my rules?)
  { id: 'compliance-dashboard', label: 'Dashboard', icon: Shield, group: 'enforce' },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle, group: 'enforce' },
  { id: 'policy-mgr', label: 'Policy Manager', icon: FileText, group: 'enforce' },
  { id: 'audit-trail', label: 'Audit Trail', icon: History, group: 'enforce' },
  // ATTEST — imported artifact → regulation (is the record complete? who signs?)
  { id: 'assess', label: 'Assess Workflow', icon: Workflow, group: 'attest' },
  { id: 'certify', label: 'Certify', icon: BadgeCheck, group: 'attest' },
];

export interface Group {
  key: Section['group'];
  label: string;
  /** Internal gate verb (ADR-0003) — shown only as a small badge. */
  verb: 'Cover' | 'Enforce' | 'Attest';
  subject: 'architecture' | 'workflow';
}

export const GROUPS: Group[] = [
  { key: 'cover', label: 'Standards Coverage', verb: 'Cover', subject: 'architecture' },
  { key: 'enforce', label: 'Policy Enforcement', verb: 'Enforce', subject: 'architecture' },
  { key: 'attest', label: 'Attestation', verb: 'Attest', subject: 'workflow' },
];

export const SUBJECTS: Array<{ key: Group['subject']; label: string; hint: string }> = [
  { key: 'architecture', label: 'Architecture Conformance', hint: 'Subject: your model' },
  { key: 'workflow', label: 'Workflow Conformance', hint: 'Subject: imported workflows' },
];

export default function ComplianceSidebar() {
  const navigate = useNavigate();
  const { projectId, section } = useParams<{ projectId: string; section?: string }>();
  const active = section || 'hub';
  const showPolicyBoard = useUIStore((s) => s.showPolicyBoard);
  const togglePolicyBoard = useUIStore((s) => s.togglePolicyBoard);

  return (
    <nav className="w-56 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-5 overflow-y-auto">
      {/* Conformance Hub — the "what do you want to check?" entry router */}
      <button
        onClick={() => navigate(`/project/${projectId}/compliance/hub`)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
          active === 'hub'
            ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[#e2e8f0]'
        }`}
      >
        <Compass size={16} />
        Conformance Hub
      </button>

      {SUBJECTS.map((subject) => (
        <div key={subject.key} className="space-y-3">
          <div className="px-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
              {subject.label}
            </p>
            <p className="text-[9px] text-[var(--text-tertiary)]">{subject.hint}</p>
          </div>

          {GROUPS.filter((g) => g.subject === subject.key).map((group) => (
            <div key={group.key}>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 px-3">
                {group.label}
                <span className="rounded bg-[rgba(255,255,255,0.05)] px-1 py-px text-[8px] font-medium normal-case tracking-normal text-[var(--text-disabled)]">
                  {group.verb}
                </span>
              </p>
              <div className="space-y-0.5">
                {SECTIONS.filter((s) => s.group === group.key).map((s) => (
                  <div key={s.id} className="flex items-center">
                    <button
                      onClick={() => navigate(`/project/${projectId}/compliance/${s.id}`)}
                      className={`flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                        active === s.id
                          ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[#e2e8f0]'
                      }`}
                    >
                      <s.icon size={16} />
                      {s.label}
                    </button>
                    {s.id === 'policy-mgr' && (
                      <button
                        onClick={togglePolicyBoard}
                        title={showPolicyBoard ? 'Hide 3D Policy Board' : 'Show 3D Policy Board'}
                        className={`p-1 rounded transition ${
                          showPolicyBoard
                            ? 'text-[#a78bfa] hover:text-white'
                            : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        {showPolicyBoard ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}
