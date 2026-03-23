import { useState } from 'react';
import { Shield, Check, X } from 'lucide-react';
import { authAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function MFASetup({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<'init' | 'verify' | 'done'>('init');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const updateUser = useAuthStore((s) => s.updateUser);

  if (!isOpen) return null;

  const handleSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await authAPI.mfaSetup();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep('verify');
    } catch {
      setError('Failed to initialize MFA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError('');
    try {
      await authAPI.mfaConfirm(code);
      updateUser({ mfaEnabled: true });
      setStep('done');
    } catch {
      setError('Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-[#00ff41]" />
            <h2 className="text-sm font-semibold text-white">Setup Two-Factor Authentication</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-white">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {step === 'init' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-secondary)]">
              Add an extra layer of security to your account with a TOTP authenticator app
              (Google Authenticator, Authy, 1Password, etc.).
            </p>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full rounded-md bg-[#00ff41] px-4 py-2 text-sm font-medium text-black hover:bg-[#00cc33] disabled:opacity-50 transition"
            >
              {loading ? 'Setting up...' : 'Begin Setup'}
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-secondary)]">
              Scan this QR code with your authenticator app:
            </p>
            {qrCode && (
              <div className="flex justify-center bg-white rounded-lg p-3">
                <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
              </div>
            )}
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2">
              <p className="text-[10px] text-[var(--text-tertiary)] mb-1">Or enter this secret manually:</p>
              <code className="text-xs text-[var(--text-secondary)] font-mono break-all select-all">{secret}</code>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Verification Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white text-center tracking-[0.5em] font-mono outline-none focus:border-[#00ff41] transition"
              />
            </div>
            <button
              onClick={handleVerify}
              disabled={loading || code.length < 6}
              className="w-full rounded-md bg-[#00ff41] px-4 py-2 text-sm font-medium text-black hover:bg-[#00cc33] disabled:opacity-50 transition"
            >
              {loading ? 'Verifying...' : 'Verify & Enable'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <Check size={24} className="text-green-400" />
            </div>
            <p className="text-sm text-white font-medium">MFA Enabled Successfully</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Your account is now protected with two-factor authentication.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-md bg-[#1a2a1a] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a4a3a] transition"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
