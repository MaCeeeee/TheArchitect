import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SettingsSidebar from './SettingsSidebar';
import ProfileSection from './ProfileSection';
import AccountSection from './AccountSection';
import AppearanceSection from './AppearanceSection';
import NotificationsSection from './NotificationsSection';
import SecuritySection from './SecuritySection';
import ApiKeysSection from './ApiKeysSection';
import AccessibilitySection from './AccessibilitySection';
import BillingSection from './BillingSection';
import UsersSection from './UsersSection';

const SECTION_MAP: Record<string, React.ComponentType> = {
  profile: ProfileSection,
  account: AccountSection,
  appearance: AppearanceSection,
  notifications: NotificationsSection,
  security: SecuritySection,
  'api-keys': ApiKeysSection,
  accessibility: AccessibilitySection,
  billing: BillingSection,
  users: UsersSection,
};

export default function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const activeSection = section || 'profile';

  if (!section) {
    return <Navigate to="/settings/profile" replace />;
  }

  const SectionComponent = SECTION_MAP[activeSection];

  return (
    <div className="flex h-full bg-[#0f172a]">
      <SettingsSidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-[#94a3b8] hover:text-white transition mb-6"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>

          {SectionComponent ? (
            <SectionComponent />
          ) : (
            <div className="text-[#94a3b8]">Section not found</div>
          )}
        </div>
      </div>
    </div>
  );
}
