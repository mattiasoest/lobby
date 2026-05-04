import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/authContext.tsx';
import {
  bootstrapServerSession,
  clearOAuthFragmentStaging,
  clearSessionBootstrapCache,
  consumeOAuthFragmentFromUrl,
} from './oauthBootstrap.ts';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setToken } = useAuth();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const fragment = consumeOAuthFragmentFromUrl();
      if (!fragment) {
        navigate('/login', { replace: true });
        return;
      }

      const { access, rt } = fragment;
      const ok = await bootstrapServerSession(access, rt);

      if (!cancelled) clearSessionBootstrapCache(access);

      if (cancelled) return;

      if (!ok) {
        clearOAuthFragmentStaging();
        navigate('/login', { replace: true });
        return;
      }

      clearOAuthFragmentStaging();
      setToken(access);
      navigate('/lobby', { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, setToken]);

  return (
    <div className="auth-page">
      <p>Completing sign-in…</p>
    </div>
  );
}
