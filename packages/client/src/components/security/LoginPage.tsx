import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { authAPI } from '../../services/api';
import { Shield } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register' | 'mfa'>('login');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Show error from OAuth redirect (e.g. /login?error=Google+login+was+cancelled)
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
    }
  }, []);

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
      navigate('/');
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

    try {
      const { data } = await authAPI.register(email, password, name);
      login(data.user, data.accessToken, data.refreshToken);
      navigate('/');
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
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Invalid code';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0f172a]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#7c3aed]">TheArchitect</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Enterprise Architecture Management</p>
        </div>

        {mode === 'mfa' ? (
          <form onSubmit={handleMFA} className="rounded-xl border border-[#334155] bg-[#1e293b] p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={20} className="text-[#7c3aed]" />
              <h2 className="text-sm font-semibold text-white">Two-Factor Authentication</h2>
            </div>
            <p className="text-xs text-[#94a3b8]">Enter the 6-digit code from your authenticator app.</p>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <input
              type="text"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white text-center tracking-[0.5em] font-mono outline-none focus:border-[#7c3aed] transition"
            />
            <button type="submit" disabled={isLoading || mfaCode.length < 6} className="w-full rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50 transition">
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setMfaToken(''); setMfaCode(''); }} className="w-full text-xs text-[#64748b] hover:text-[#94a3b8]">
              Back to login
            </button>
          </form>
        ) : (
          <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-6 space-y-4">
            <form
              onSubmit={mode === 'login' ? handleLogin : handleRegister}
              className="space-y-4"
            >
              <h2 className="text-sm font-semibold text-white">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
              {error && <p className="text-xs text-red-400">{error}</p>}

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#7c3aed] transition"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#7c3aed] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Min. 8 characters' : 'Enter password'}
                  required
                  className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#7c3aed] transition"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50 transition"
              >
                {isLoading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#334155]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#1e293b] px-2 text-[#64748b]">or continue with</span>
              </div>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { window.location.href = '/api/auth/oauth/google'; }}
                className="w-full flex items-center justify-center gap-2.5 rounded-md border border-[#334155] bg-[#0f172a] px-4 py-2 text-sm text-[#e2e8f0] hover:border-[#7c3aed] hover:text-white transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = '/api/auth/oauth/github'; }}
                className="w-full flex items-center justify-center gap-2.5 rounded-md border border-[#334155] bg-[#0f172a] px-4 py-2 text-sm text-[#e2e8f0] hover:border-[#7c3aed] hover:text-white transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <span>GitHub</span>
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = '/api/auth/oauth/microsoft'; }}
                className="w-full flex items-center justify-center gap-2.5 rounded-md border border-[#334155] bg-[#0f172a] px-4 py-2 text-sm text-[#e2e8f0] hover:border-[#7c3aed] hover:text-white transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M13 1h10v10H13z"/>
                  <path fill="#7fba00" d="M1 13h10v10H1z"/>
                  <path fill="#ffb900" d="M13 13h10v10H13z"/>
                </svg>
                <span>Microsoft</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="w-full text-xs text-[#64748b] hover:text-[#94a3b8]"
            >
              {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
