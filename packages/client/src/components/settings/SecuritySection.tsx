import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { authAPI } from '../../services/api';
import { ShieldCheck, Trash2, Monitor } from 'lucide-react';

export default function SecuritySection() {
  const { sessions, fetchSessions, revokeSession } = useSettingsStore();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSetupMFA = async () => {
    try {
      const { data } = await authAPI.mfaSetup();
      setQrCode(data.qrCodeUrl || data.qrCode);
      setMfaSetupOpen(true);
    } catch {
      setMfaError('Failed to initialize MFA setup');
    }
  };

  const handleConfirmMFA = async () => {
    setMfaLoading(true);
    setMfaError('');
    try {
      await authAPI.mfaConfirm(mfaCode);
      updateUser({ mfaEnabled: true });
      setMfaSetupOpen(false);
      setMfaCode('');
    } catch {
      setMfaError('Invalid code. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    setMfaLoading(true);
    setMfaError('');
    try {
      await authAPI.mfaDisable(disablePassword);
      updateUser({ mfaEnabled: false });
      setShowDisable(false);
      setDisablePassword('');
    } catch {
      setMfaError('Invalid password');
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Security</h2>
      <p className="text-sm text-[#64748b] mb-6">Manage two-factor authentication and active sessions.</p>

      <div className="space-y-6">
        {/* MFA */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck size={20} className={user?.mfaEnabled ? 'text-green-400' : 'text-[#64748b]'} />
            <div>
              <h3 className="text-sm font-semibold text-white">Two-Factor Authentication</h3>
              <p className="text-xs text-[#64748b]">
                {user?.mfaEnabled ? 'Enabled — your account is protected' : 'Not enabled — add an extra layer of security'}
              </p>
            </div>
          </div>

          {!user?.mfaEnabled && !mfaSetupOpen && (
            <button
              onClick={handleSetupMFA}
              className="rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] transition"
            >
              Enable 2FA
            </button>
          )}

          {mfaSetupOpen && (
            <div className="space-y-3 mt-4">
              <p className="text-sm text-[#94a3b8]">Scan this QR code with your authenticator app:</p>
              {qrCode && <img src={qrCode} alt="QR Code" className="h-48 w-48 rounded bg-white p-2" />}
              <div className="flex gap-2 max-w-xs">
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="flex-1 rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
                />
                <button
                  onClick={handleConfirmMFA}
                  disabled={mfaLoading || mfaCode.length !== 6}
                  className="rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] transition disabled:opacity-50"
                >
                  Verify
                </button>
              </div>
            </div>
          )}

          {user?.mfaEnabled && !showDisable && (
            <button
              onClick={() => setShowDisable(true)}
              className="rounded-md border border-red-600 px-4 py-2 text-sm text-red-400 hover:bg-red-600/10 transition"
            >
              Disable 2FA
            </button>
          )}

          {showDisable && (
            <div className="space-y-3 mt-4">
              <p className="text-sm text-[#94a3b8]">Enter your password to disable 2FA:</p>
              <div className="flex gap-2 max-w-xs">
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Password"
                  className="flex-1 rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
                />
                <button
                  onClick={handleDisableMFA}
                  disabled={mfaLoading || !disablePassword}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition disabled:opacity-50"
                >
                  Disable
                </button>
              </div>
            </div>
          )}

          {mfaError && <p className="text-sm text-red-400 mt-2">{mfaError}</p>}
        </div>

        {/* Sessions */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Active Sessions</h3>
          {sessions.length === 0 ? (
            <p className="text-sm text-[#64748b]">No active sessions found.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between rounded-md border border-[#334155] bg-[#0f172a] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Monitor size={16} className="text-[#94a3b8]" />
                    <div>
                      <p className="text-sm text-white">
                        {session.device}
                        {session.current && <span className="ml-2 text-xs text-green-400">(current)</span>}
                      </p>
                      <p className="text-xs text-[#64748b]">{session.ip} — Last active: {new Date(session.lastActive).toLocaleString()}</p>
                    </div>
                  </div>
                  {!session.current && (
                    <button
                      onClick={() => revokeSession(session.id)}
                      className="text-[#94a3b8] hover:text-red-400 transition"
                      title="Revoke session"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
