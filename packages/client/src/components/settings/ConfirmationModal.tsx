import { useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  requirePassword?: boolean;
  danger?: boolean;
  onConfirm: (password?: string) => Promise<void>;
  onClose: () => void;
}

export default function ConfirmationModal({
  title,
  message,
  confirmLabel = 'Confirm',
  requirePassword = false,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmationModalProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trapRef = useFocusTrap(true, onClose);

  const handleConfirm = async () => {
    if (requirePassword && !password) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(requirePassword ? password : undefined);
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true" aria-label={title} ref={trapRef}>
      <div className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 shadow-xl animate-[scaleIn_200ms_ease-out]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-4">{message}</p>

        {requirePassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--text-tertiary)] outline-none focus:border-[#00ff41] mb-4"
          />
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#00ff41] hover:bg-[#00cc33]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
