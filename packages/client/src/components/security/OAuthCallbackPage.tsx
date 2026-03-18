import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { authAPI } from '../../services/api';

export default function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (!accessToken || !refreshToken) {
      navigate('/login?error=Authentication+failed', { replace: true });
      return;
    }

    // Set tokens so the /me call is authenticated via the Axios interceptor
    useAuthStore.setState({ token: accessToken, refreshToken, isAuthenticated: false });

    authAPI
      .me()
      .then(({ data }) => {
        login(data, accessToken, refreshToken);
        navigate('/', { replace: true });
      })
      .catch(() => {
        useAuthStore.getState().logout();
        navigate('/login?error=Failed+to+load+profile', { replace: true });
      });
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-[#00ff41] border-t-transparent animate-spin" />
        <p className="text-sm text-[#7a8a7a]">Completing sign in...</p>
      </div>
    </div>
  );
}
