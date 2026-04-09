import { useNavigate, useParams } from 'react-router-dom';
import {
  ShieldAlert, FileText, Grid3X3, FileCheck, Sparkles, TrendingUp, ClipboardCheck, LayoutDashboard,
  Shield, CheckCircle, History, Map, Wrench, Eye, EyeOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'pipeline' | 'governance';
}

const SECTIONS: Section[] = [
  // Compliance Pipeline
  { id: 'pipeline', label: 'Pipeline', icon: ShieldAlert, group: 'pipeline' },
  { id: 'portfolio', label: 'Portfolio', icon: LayoutDashboard, group: 'pipeline' },
  { id: 'standards', label: 'Standards', icon: FileText, group: 'pipeline' },
  { id: 'matrix', label: 'Matrix', icon: Grid3X3, group: 'pipeline' },
  { id: 'remediate', label: 'Remediate', icon: Wrench, group: 'pipeline' },
  { id: 'policies', label: 'Gen. Policies', icon: FileCheck, group: 'pipeline' },
  { id: 'roadmap', label: 'Roadmap', icon: Map, group: 'pipeline' },
  { id: 'elements', label: 'Elements', icon: Sparkles, group: 'pipeline' },
  { id: 'progress', label: 'Progress', icon: TrendingUp, group: 'pipeline' },
  { id: 'audit', label: 'Audit', icon: ClipboardCheck, group: 'pipeline' },
  // Governance
  { id: 'compliance-dashboard', label: 'Dashboard', icon: Shield, group: 'governance' },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle, group: 'governance' },
  { id: 'policy-mgr', label: 'Policy Manager', icon: FileText, group: 'governance' },
  { id: 'audit-trail', label: 'Audit Trail', icon: History, group: 'governance' },
];

const GROUPS = [
  { key: 'pipeline' as const, label: 'Compliance Pipeline' },
  { key: 'governance' as const, label: 'Governance' },
];

export default function ComplianceSidebar() {
  const navigate = useNavigate();
  const { projectId, section } = useParams<{ projectId: string; section?: string }>();
  const active = section || 'pipeline';
  const showPolicyBoard = useUIStore((s) => s.showPolicyBoard);
  const togglePolicyBoard = useUIStore((s) => s.togglePolicyBoard);

  return (
    <nav className="w-56 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-4">
      {GROUPS.map((group) => (
        <div key={group.key}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 px-3">
            {group.label}
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
    </nav>
  );
}
