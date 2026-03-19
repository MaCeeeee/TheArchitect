import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../../stores/authStore';
import { authAPI } from '../../services/api';
import api from '../../services/api';
import { Shield, Eye, EyeOff, Check, X, ArrowLeft, Mail } from 'lucide-react';
import {
  PASSWORD_CHECKS,
  getPasswordScore,
  getPasswordStrengthLabel,
  getPasswordStrengthColor,
  isPasswordValid,
} from '@thearchitect/shared';

type Mode = 'login' | 'register' | 'mfa' | 'forgot' | 'forgot-sent';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const emailRef = useRef<HTMLInputElement>(null);
  const mfaRef = useRef<HTMLInputElement>(null);

  // Autofocus
  useEffect(() => {
    if (mode === 'mfa') {
      mfaRef.current?.focus();
    } else {
      emailRef.current?.focus();
    }
  }, [mode]);

  // Google Identity Services
  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      try {
        setIsLoading(true);
        setError('');
        const { data } = await api.post('/auth/oauth/google/token', {
          credential: codeResponse.code,
          flow: 'auth-code',
        });
        login(data.user, data.accessToken, data.refreshToken);
        navigate(redirectTo);
      } catch {
        setError('Google authentication failed');
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => setError('Google login was cancelled'),
  });

  // OAuth error from redirect
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
    }
  }, [searchParams]);

  const switchMode = (newMode: Mode) => {
    setError('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
    setMode(newMode);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data } = await authAPI.login(email, password);

      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setMode('mfa');
        setIsLoading(false);
        return;
      }

      login(data.user, data.accessToken, data.refreshToken);
      navigate(redirectTo);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { data } = await authAPI.register(email, password, name);
      login(data.user, data.accessToken, data.refreshToken);
      navigate(redirectTo);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Registration failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data } = await authAPI.mfaVerify(mfaToken, mfaCode);
      login(data.user, data.accessToken, data.refreshToken);
      navigate(redirectTo);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Invalid code';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await authAPI.forgotPassword(email);
      switchMode('forgot-sent');
    } catch {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const passwordScore = getPasswordScore(password);
  const strengthLabel = getPasswordStrengthLabel(passwordScore);
  const strengthColor = getPasswordStrengthColor(passwordScore);

  const inputClass = 'w-full rounded-lg border border-[#1a2a1a] bg-[#0a0a0a]/70 px-3 py-2.5 text-sm text-white placeholder:text-[#4a5a4a] outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41]/30 focus:shadow-[0_0_10px_rgba(0,255,65,0.2)] transition-all';
  const btnPrimary = 'w-full rounded-lg bg-[#00ff41] px-4 py-2.5 text-sm font-medium text-black hover:bg-[#00cc33] disabled:opacity-50 transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,65,0.3)]';
  const btnOAuth = 'w-full flex items-center justify-center gap-2.5 rounded-lg border border-[#1a2a1a] bg-[#0a0a0a]/70 px-4 py-2.5 text-sm text-[#d0d0d0] hover:border-[#3a4a3a] hover:bg-[#111111]/70 transition-all active:scale-[0.98]';

  return (
    <>
          {/* ── MFA ── */}
          {mode === 'mfa' && (
            <form onSubmit={handleMFA} className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={20} className="text-[#00ff41]" />
                <h2 className="text-sm font-semibold text-white">Two-Factor Authentication</h2>
              </div>
              <p className="text-xs text-[#7a8a7a]">Enter the 6-digit code from your authenticator app.</p>
              {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              <input
                ref={mfaRef}
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoComplete="one-time-code"
                className={`${inputClass} text-center tracking-[0.5em] font-mono text-lg`}
              />
              <button type="submit" disabled={isLoading || mfaCode.length < 6} className={btnPrimary}>
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
              <button type="button" onClick={() => switchMode('login')} className="w-full flex items-center justify-center gap-1 text-xs text-[#4a5a4a] hover:text-[#7a8a7a] transition">
                <ArrowLeft size={12} /> Back to login
              </button>
            </form>
          )}

          {/* ── Forgot Password ── */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <h2 className="text-sm font-semibold text-white">Reset Password</h2>
              <p className="text-xs text-[#7a8a7a]">Enter your email address and we'll send you a link to reset your password.</p>
              {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className={inputClass}
              />
              <button type="submit" disabled={isLoading} className={btnPrimary}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => switchMode('login')} className="w-full flex items-center justify-center gap-1 text-xs text-[#4a5a4a] hover:text-[#7a8a7a] transition">
                <ArrowLeft size={12} /> Back to login
              </button>
            </form>
          )}

          {/* ── Forgot Sent Confirmation ── */}
          {mode === 'forgot-sent' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-[#00ff41]/20 flex items-center justify-center">
                <Mail size={24} className="text-[#00ff41]" />
              </div>
              <h2 className="text-sm font-semibold text-white">Check Your Email</h2>
              <p className="text-xs text-[#7a8a7a] leading-relaxed">
                If an account exists for <strong className="text-[#d0d0d0]">{email}</strong>, you'll receive a password reset link shortly.
              </p>
              <button type="button" onClick={() => switchMode('login')} className={btnPrimary}>
                Back to Login
              </button>
            </div>
          )}

          {/* ── Login / Register ── */}
          {(mode === 'login' || mode === 'register') && (
            <>
              <form
                onSubmit={mode === 'login' ? handleLogin : handleRegister}
                className="space-y-4"
              >
                <h2 className="text-sm font-semibold text-white">
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </h2>

                {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

                {/* Name (register only) */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-[#7a8a7a] mb-1.5">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      required
                      autoComplete="name"
                      className={inputClass}
                    />
                  </div>
                )}

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-[#7a8a7a] mb-1.5">Email</label>
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    className={inputClass}
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[#7a8a7a]">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs text-[#00ff41] hover:text-[#33ff66] transition"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? 'Create a strong password' : 'Enter password'}
                      required
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a5a4a] hover:text-[#7a8a7a] transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Password Strength (register only) */}
                {mode === 'register' && password.length > 0 && (
                  <div className="space-y-2">
                    {/* Strength bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#111111] rounded-full overflow-hidden flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-full transition-all duration-300"
                            style={{
                              backgroundColor: i <= passwordScore ? strengthColor : '#1a2a1a',
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium min-w-[70px] text-right" style={{ color: strengthColor }}>
                        {strengthLabel}
                      </span>
                    </div>
                    {/* Checklist */}
                    <div className="grid grid-cols-1 gap-0.5">
                      {PASSWORD_CHECKS.map((check) => {
                        const passed = check.test(password);
                        return (
                          <div key={check.label} className="flex items-center gap-1.5">
                            {passed ? (
                              <Check size={12} className="text-emerald-400 shrink-0" />
                            ) : (
                              <X size={12} className="text-[#4a5a4a] shrink-0" />
                            )}
                            <span className={`text-[11px] ${passed ? 'text-emerald-400' : 'text-[#4a5a4a]'}`}>
                              {check.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Confirm Password (register only) */}
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-[#7a8a7a] mb-1.5">Confirm Password</label>
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a5a4a] hover:text-[#7a8a7a] transition"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && confirmPassword !== password && (
                      <p className="text-[11px] text-red-400 mt-1">Passwords do not match</p>
                    )}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading || (mode === 'register' && (!isPasswordValid(password) || password !== confirmPassword))}
                  className={btnPrimary}
                >
                  {isLoading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1a2a1a]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-transparent px-2 text-[#4a5a4a]">or continue with</span>
                </div>
              </div>

              {/* OAuth Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => googleLogin()}
                  className={btnOAuth}
                  title="Sign in with Google"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => { window.location.href = '/api/auth/oauth/github'; }}
                  className={btnOAuth}
                  title="Sign in with GitHub"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => { window.location.href = '/api/auth/oauth/microsoft'; }}
                  className={btnOAuth}
                  title="Sign in with Microsoft"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#f25022" d="M1 1h10v10H1z"/>
                    <path fill="#00a4ef" d="M13 1h10v10H13z"/>
                    <path fill="#7fba00" d="M1 13h10v10H1z"/>
                    <path fill="#ffb900" d="M13 13h10v10H13z"/>
                  </svg>
                </button>
              </div>

              {/* Toggle Login/Register */}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                className="w-full mt-4 text-xs text-[#4a5a4a] hover:text-[#7a8a7a] transition"
              >
                {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
              </button>
            </>
          )}
    </>
  );
}
