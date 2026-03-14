import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { settingsAPI } from '../../services/api';
import ConfirmationModal from './ConfirmationModal';

export default function AccountSection() {
  const { changePassword, loading } = useSettingsStore();
  const logout = useAuthStore((s) => s.logout);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
    } catch {
      setMessage({ type: 'error', text: 'Failed to change password. Check your current password.' });
    }
  };

  const handleDeleteAccount = async (password?: string) => {
    await settingsAPI.deleteAccount(password || '');
    logout();
    window.location.href = '/login';
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Account</h2>
      <p className="text-sm text-[#64748b] mb-6">Manage your account security and settings.</p>

      <div className="space-y-6">
        {/* Change Password */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Change Password</h3>
          <div className="space-y-3 max-w-md">
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
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
              className="rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] transition disabled:opacity-50"
            >
              Update Password
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-lg border border-red-900/50 bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-sm text-[#94a3b8] mb-4">
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
