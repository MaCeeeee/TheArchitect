import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';

const SECTION_LABELS: Record<string, string> = {
  // Compliance pipeline
  pipeline: 'Pipeline',
  portfolio: 'Portfolio',
  standards: 'Standards',
  matrix: 'Matrix',
  policies: 'Policies',
  elements: 'Elements',
  progress: 'Progress',
  audit: 'Audit',
  // Governance
  'compliance-dashboard': 'Dashboard',
  approvals: 'Approvals',
  'policy-mgr': 'Policy Manager',
  'audit-trail': 'Audit Trail',
  // Settings
  profile: 'Profile',
  account: 'Account',
  appearance: 'Appearance',
  notifications: 'Notifications',
  security: 'Security',
  'api-keys': 'API Keys',
  accessibility: 'Accessibility',
  billing: 'Billing',
  users: 'Users',
  'audit-logs': 'Audit Logs',
};

interface Crumb {
  label: string;
  to?: string;
}

export default function BreadcrumbBar() {
  const location = useLocation();
  const { projectId, section } = useParams<{ projectId?: string; section?: string }>();
  const projectName = useArchitectureStore((s) => s.projectName);

  const crumbs: Crumb[] = [];
  const path = location.pathname;

  // Dashboard is always root
  crumbs.push({ label: 'Dashboard', to: '/dashboard' });

  if (path.startsWith('/project/') && projectId) {
    crumbs.push({ label: projectName || 'Project', to: `/project/${projectId}` });

    if (path.includes('/compliance')) {
      crumbs.push({ label: 'Comply', to: `/project/${projectId}/compliance/pipeline` });
      if (section && SECTION_LABELS[section]) {
        crumbs.push({ label: SECTION_LABELS[section] });
      }
    }
  } else if (path.startsWith('/settings')) {
    crumbs.push({ label: 'Settings', to: '/settings/profile' });
    if (section && SECTION_LABELS[section]) {
      crumbs.push({ label: SECTION_LABELS[section] });
    }
  }

  // Don't render if only Dashboard crumb
  if (crumbs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--surface-base)] border-b border-[var(--border-subtle)] text-[11px]">
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1.5">
            {idx > 0 && <ChevronRight size={10} className="text-[#334155]" />}
            {isLast || !crumb.to ? (
              <span className="text-[var(--text-secondary)]">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.to}
                className="text-[var(--text-tertiary)] hover:text-white transition"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
