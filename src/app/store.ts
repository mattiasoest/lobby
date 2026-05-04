const TOKEN_KEY = 'lobby_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function decodeJwtPayload(token: string | null): {
  username?: string
  sub?: string
} | null {
  if (!token) return null;
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = decodeURIComponent(
      [...atob(padded)].map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`).join('')
    );
    const payload = JSON.parse(decoded) as { username?: string; sub?: string };
    return payload;
  } catch {
    return null;
  }
}

export function decodeJwtUsername(token: string | null): string | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.username === 'string' ? payload.username : null;
}
