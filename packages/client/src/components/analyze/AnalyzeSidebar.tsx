import { useNavigate, useParams } from 'react-router-dom';
import {
  LayoutDashboard, Shield, Zap, DollarSign, Dice5, GitCompare, Server, Map,
  Briefcase, Cable, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'overview' | 'assess' | 'simulate' | 'plan' | 'manage';
}

const SECTIONS: Section[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'overview' },
  { id: 'risk', label: 'Risk', icon: Shield, group: 'assess' },
  { id: 'impact', label: 'Impact', icon: Zap, group: 'assess' },
  { id: 'cost', label: 'Cost', icon: DollarSign, group: 'assess' },
  { id: 'monte-carlo', label: 'Monte Carlo', icon: Dice5, group: 'simulate' },
  { id: 'scenarios', label: 'Scenarios', icon: GitCompare, group: 'simulate' },
  { id: 'capacity', label: 'Capacity', icon: Server, group: 'simulate' },
  { id: 'oracle', label: 'Oracle', icon: Eye, group: 'simulate' },
  { id: 'roadmap', label: 'Roadmap', icon: Map, group: 'plan' },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase, group: 'manage' },
  { id: 'integrations', label: 'Integrations', icon: Cable, group: 'manage' },
];

const GROUPS = [
  { key: 'overview' as const, label: 'Overview' },
  { key: 'assess' as const, label: 'Assess' },
  { key: 'simulate' as const, label: 'Simulate' },
  { key: 'plan' as const, label: 'Plan' },
  { key: 'manage' as const, label: 'Manage' },
];

export default function AnalyzeSidebar() {
  const navigate = useNavigate();
  const { projectId, section } = useParams<{ projectId: string; section?: string }>();
  const active = section || 'dashboard';

  return (
    <nav className="w-56 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-4">
      {GROUPS.map((group) => (
        <div key={group.key}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 px-3">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {SECTIONS.filter((s) => s.group === group.key).map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/project/${projectId}/analyze/${s.id}`)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active === s.id
                    ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[#e2e8f0]'
                }`}
              >
                <s.icon size={16} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
