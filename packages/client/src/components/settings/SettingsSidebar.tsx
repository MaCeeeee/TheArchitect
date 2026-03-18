import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  User, Lock, Palette, Bell, ShieldCheck, Key, Accessibility, CreditCard, Users, FileText,
} from 'lucide-react';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Lock },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
] as const;

const ADMIN_ROLES = ['chief_architect', 'enterprise_architect'];
const BILLING_ROLES = ['chief_architect', 'enterprise_architect'];

export default function SettingsSidebar() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const active = section || 'profile';
  const role = useAuthStore((s) => s.user?.role);

  const visibleSections = SECTIONS.filter((s) => {
    if (s.id === 'billing') return BILLING_ROLES.includes(role || '');
    if (s.id === 'users') return ADMIN_ROLES.includes(role || '');
    if (s.id === 'audit-logs') return ADMIN_ROLES.includes(role || '');
    return true;
  });

  return (
    <nav className="w-56 shrink-0 border-r border-[#1a2a1a] bg-[#111111] p-4 space-y-1">
      {visibleSections.map((s) => (
        <button
          key={s.id}
          onClick={() => navigate(`/settings/${s.id}`)}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
            active === s.id
              ? 'bg-[#00ff41]/20 text-[#33ff66]'
              : 'text-[#7a8a7a] hover:bg-[#0a0a0a] hover:text-white'
          }`}
        >
          <s.icon size={16} />
          {s.label}
        </button>
      ))}
    </nav>
  );
}
