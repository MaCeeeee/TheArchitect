import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { settingsAPI } from '../../services/api';
import ConfirmationModal from './ConfirmationModal';
import { ROLE_PERMISSIONS, PERMISSIONS } from '@thearchitect/shared';

export default function AccountSection() {
  const { changePassword, loading } = useSettingsStore();
  const logout = useAuthStore((s) => s.logout);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const userRole = useAuthStore((s) => s.user?.role) || 'viewer';

  const permissionGroups = useMemo(() => {
    const perms = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS] || [];
    const allPerms = Object.values(PERMISSIONS);
    const groups: Record<string, { label: string; has: boolean }[]> = {};
    for (const p of allPerms) {
      const [domain, action] = p.split(':');
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push({ label: action.replace(/_/g, ' '), has: perms.includes(p) });
    }
    return groups;
  }, [userRole]);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch {
      setMessage({ type: 'error', text: 'Failed to change password. Check your current password.' });
      toast.error('Failed to change password');
    }
  };

  const handleDeleteAccount = async (password?: string) => {
    try {
      await settingsAPI.deleteAccount(password || '');
      toast.success('Account deleted');
      logout();
      window.location.href = '/login';
    } catch {
      toast.error('Failed to delete account');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Account</h2>
      <p className="text-sm text-[var(--text-tertiary)] mb-6">Manage your account security and settings.</p>

      <div className="space-y-6">
        {/* Change Password */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Change Password</h3>
          <div className="space-y-3 max-w-md">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white outline-none focus:border-[#00ff41]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white outline-none focus:border-[#00ff41]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white outline-none focus:border-[#00ff41]"
              />
            </div>

            {message && (
              <p className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            )}

            <button
              onClick={handleChangePassword}
              disabled={loading || !currentPassword || !newPassword}
              className="rounded-md bg-[#00ff41] px-4 py-2 text-sm font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-50"
            >
              Update Password
            </button>
          </div>
        </div>

        {/* Role & Permissions */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Role &amp; Permissions</h3>
            <span className="rounded-full bg-[#7c3aed]/20 px-3 py-1 text-xs font-medium text-[#a78bfa] capitalize">
              {userRole.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(permissionGroups).map(([domain, perms]) => (
              <div key={domain}>
                <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">{domain}</p>
                <ul className="space-y-1">
                  {perms.map((p) => (
                    <li key={p.label} className="flex items-center gap-1.5 text-xs">
                      {p.has ? (
                        <span className="text-green-400">&#10003;</span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">&#10005;</span>
                      )}
                      <span className={p.has ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)] line-through'}>
                        {p.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-lg border border-red-900/50 bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Once you delete your account, there is no going back. All your data will be permanently removed.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
          >
            Delete Account
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <ConfirmationModal
          title="Delete Account"
          message="This action is irreversible. All your projects, settings, and data will be permanently deleted."
          confirmLabel="Delete My Account"
          requirePassword
          danger
          onConfirm={handleDeleteAccount}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
