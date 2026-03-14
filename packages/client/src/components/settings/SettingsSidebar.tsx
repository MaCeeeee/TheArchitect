import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  User, Lock, Palette, Bell, ShieldCheck, Key, Accessibility, CreditCard,
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
] as const;

const BILLING_ROLES = ['chief_architect', 'enterprise_architect'];

export default function SettingsSidebar() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const active = section || 'profile';
  const role = useAuthStore((s) => s.user?.role);

  const visibleSections = SECTIONS.filter(
    (s) => s.id !== 'billing' || BILLING_ROLES.includes(role || '')
  );

  return (
    <nav className="w-56 shrink-0 border-r border-[#334155] bg-[#1e293b] p-4 space-y-1">
      {visibleSections.map((s) => (
        <button
          key={s.id}
          onClick={() => navigate(`/settings/${s.id}`)}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
            active === s.id
              ? 'bg-[#7c3aed]/20 text-[#a78bfa]'
              : 'text-[#94a3b8] hover:bg-[#0f172a] hover:text-white'
          }`}
        >
          <s.icon size={16} />
          {s.label}
        </button>
      ))}
    </nav>
  );
}
