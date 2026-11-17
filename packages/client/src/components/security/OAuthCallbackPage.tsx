import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { authAPI } from '../../services/api';

export default function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    // Security-Audit H9: Tokens kommen nie aus der URL — sonst meldet ein
    // fremder Link mit eingebetteten Tokens das Opfer im Konto des
    // Angreifers an. Der Callback liefert einen Einmal-Code, den nur der
    // Browser einlösen kann, der den Login gestartet hat.
    const code = params.get('code');

    if (!code) {
      navigate('/login?error=Authentication+failed', { replace: true });
      return;
    }

    authAPI
      .oauthExchange(code)
      .then(({ data }) => {
        const { accessToken, refreshToken } = data as { accessToken: string; refreshToken: string };
        // Set tokens so the /me call is authenticated via the Axios interceptor
        useAuthStore.setState({ token: accessToken, refreshToken, isAuthenticated: false });
        return authAPI.me().then(({ data: me }) => {
          login(me, accessToken, refreshToken);
          navigate('/dashboard', { replace: true });
        });
      })
      .catch(() => {
        useAuthStore.getState().logout();
        navigate('/login?error=Authentication+failed', { replace: true });
      });
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-base)]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
        <p className="text-sm text-[var(--text-secondary)]">Completing sign in...</p>
      </div>
    </div>
  );
}
