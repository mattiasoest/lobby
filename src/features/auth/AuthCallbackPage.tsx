import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/authContext.tsx';
import { useOAuthBindSessionMutation } from '../../query/hooks.ts';
import { clearOAuthFragmentStaging, consumeOAuthFragmentFromUrl } from './oauthBootstrap.ts';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const bindSession = useOAuthBindSessionMutation();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const fragment = consumeOAuthFragmentFromUrl();
      if (!fragment) {
        navigate('/login', { replace: true });
        return;
      }

      const { access, refreshToken } = fragment;
      let ok: boolean;
      try {
        ok = await bindSession.mutateAsync({ access, refreshToken });
      } catch {
        ok = false;
      }

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
  }, [bindSession, navigate, setToken]);

  return (
    <div className="auth-page">
      <p>Completing sign-in…</p>
    </div>
  );
}
