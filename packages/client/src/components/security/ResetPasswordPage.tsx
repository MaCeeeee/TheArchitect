import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { Eye, EyeOff, Check, X, ArrowLeft } from 'lucide-react';
import {
  PASSWORD_CHECKS,
  getPasswordScore,
  getPasswordStrengthLabel,
  getPasswordStrengthColor,
  isPasswordValid,
} from '@thearchitect/shared';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      navigate('/login');
    } else {
      pwRef.current?.focus();
    }
  }, [token, navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsLoading(true);
    setError('');

    if (!isPasswordValid(password)) {
      setError('Password does not meet all requirements');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      await authAPI.resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to reset password';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const passwordScore = getPasswordScore(password);
  const strengthLabel = getPasswordStrengthLabel(passwordScore);
  const strengthColor = getPasswordStrengthColor(passwordScore);

  const inputClass = 'w-full rounded-lg border border-[#334155] bg-[#0f172a]/70 px-3 py-2.5 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#7c3aed] focus:ring-1 focus:ring-[#7c3aed]/30 transition-all';
  const btnPrimary = 'w-full rounded-lg bg-[#7c3aed] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50 transition-all active:scale-[0.98]';

  return (
    <>
          {success ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check size={24} className="text-emerald-400" />
              </div>
              <h2 className="text-sm font-semibold text-white">Password Reset Successful</h2>
              <p className="text-xs text-[#94a3b8]">Your password has been updated. You can now sign in with your new password.</p>
              <button onClick={() => navigate('/login')} className={btnPrimary}>
                Go to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <h2 className="text-sm font-semibold text-white">Set New Password</h2>
              <p className="text-xs text-[#94a3b8]">Choose a strong password for your account.</p>

              {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    ref={pwRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    required
                    autoComplete="new-password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#94a3b8] transition"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Strength */}
              {password.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[#1e293b] rounded-full overflow-hidden flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-full transition-all duration-300"
                          style={{ backgroundColor: i <= passwordScore ? strengthColor : '#334155' }}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-medium min-w-[70px] text-right" style={{ color: strengthColor }}>
                      {strengthLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {PASSWORD_CHECKS.map((check) => {
                      const passed = check.test(password);
                      return (
                        <div key={check.label} className="flex items-center gap-1.5">
                          {passed ? <Check size={12} className="text-emerald-400 shrink-0" /> : <X size={12} className="text-[#64748b] shrink-0" />}
                          <span className={`text-[11px] ${passed ? 'text-emerald-400' : 'text-[#64748b]'}`}>{check.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Confirm */}
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    required
                    autoComplete="new-password"
                    className={`${inputClass} pr-10 ${
                      confirmPassword.length > 0 && confirmPassword !== password
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-400/30'
                        : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#94a3b8] transition"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="text-[11px] text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || !isPasswordValid(password) || password !== confirmPassword}
                className={btnPrimary}
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-1 text-xs text-[#64748b] hover:text-[#94a3b8] transition"
              >
                <ArrowLeft size={12} /> Back to login
              </button>
            </form>
          )}
    </>
  );
}
