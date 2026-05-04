import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/authContext.tsx';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setToken } = useAuth();

  useEffect(() => {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const incoming = params.get('token');
    window.history.replaceState(null, '', window.location.pathname);

    if (incoming) {
      setToken(incoming);
      navigate('/lobby', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate, setToken]);

  return (
    <div className="auth-page">
      <p>Completing sign-in…</p>
    </div>
  );
}
