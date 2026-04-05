import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useArchitectureStore } from '../../stores/architectureStore';
import SettingsSidebar from './SettingsSidebar';
import ProfileSection from './ProfileSection';
import AccountSection from './AccountSection';
import RolesAccessSection from './RolesAccessSection';
import AppearanceSection from './AppearanceSection';
import NotificationsSection from './NotificationsSection';
import SecuritySection from './SecuritySection';
import ApiKeysSection from './ApiKeysSection';
import ConnectionsSettings from './ConnectionsSettings';
import AccessibilitySection from './AccessibilitySection';
import BillingSection from './BillingSection';
import UsersSection from './UsersSection';
import AuditLogsSection from './AuditLogsSection';

const SECTION_MAP: Record<string, React.ComponentType> = {
  profile: ProfileSection,
  account: AccountSection,
  'roles-access': RolesAccessSection,
  appearance: AppearanceSection,
  notifications: NotificationsSection,
  security: SecuritySection,
  'api-keys': ApiKeysSection,
  connections: ConnectionsSettings,
  accessibility: AccessibilitySection,
  billing: BillingSection,
  users: UsersSection,
  'audit-logs': AuditLogsSection,
};

export default function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const projectId = useArchitectureStore((s) => s.projectId);
  const activeSection = section || 'profile';

  if (!section) {
    return <Navigate to="/settings/profile" replace />;
  }

  const SectionComponent = SECTION_MAP[activeSection];

  return (
    <div className="flex h-full bg-[var(--surface-base)]">
      <SettingsSidebar />
      <div className="flex-1 overflow-y-auto">
        <div className={`${activeSection === 'audit-logs' || activeSection === 'connections' ? 'max-w-4xl' : 'max-w-3xl'} mx-auto px-8 py-6`}>
          <button
            onClick={() => navigate(projectId ? `/project/${projectId}` : '/')}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition mb-6"
          >
            <ArrowLeft size={16} />
            {projectId ? 'Back to Project' : 'Back to Dashboard'}
          </button>

          {SectionComponent ? (
            <SectionComponent />
          ) : (
            <div className="text-[var(--text-secondary)]">Section not found</div>
          )}
        </div>
      </div>
    </div>
  );
}
