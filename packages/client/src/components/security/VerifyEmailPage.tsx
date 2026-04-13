import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { Check, XCircle, Loader2, ArrowLeft, Mail } from 'lucide-react';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token provided.');
      return;
    }

    let cancelled = false;

    authAPI.verifyEmail(token).then(() => {
      if (!cancelled) setStatus('success');
    }).catch((err: unknown) => {
      if (cancelled) return;
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Verification failed. The link may have expired.';
      setError(msg);
      setStatus('error');
    });

    return () => { cancelled = true; };
  }, [token]);

  const btnPrimary = 'w-full rounded-lg bg-[#00ff41] px-4 py-2.5 text-sm font-medium text-black hover:bg-[#00cc33] transition-all active:scale-[0.98]';

  return (
    <>
      {status === 'verifying' && (
        <div className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Loader2 size={24} className="text-blue-400 animate-spin" />
          </div>
          <h2 className="text-sm font-semibold text-white">Verifying your email...</h2>
          <p className="text-xs text-[var(--text-secondary)]">Please wait while we confirm your email address.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check size={24} className="text-emerald-400" />
          </div>
          <h2 className="text-sm font-semibold text-white">Email Verified</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Your email has been verified successfully. You now have full access to all features.
          </p>
          <button onClick={() => navigate('/login')} className={btnPrimary}>
            Go to Login
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <XCircle size={24} className="text-red-400" />
          </div>
          <h2 className="text-sm font-semibold text-white">Verification Failed</h2>
          <p className="text-xs text-[var(--text-secondary)]">{error}</p>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/login')}
              className={btnPrimary}
            >
              Go to Login
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full flex items-center justify-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition"
            >
              <Mail size={12} /> Request new verification email
            </button>
          </div>
        </div>
      )}
    </>
  );
}
