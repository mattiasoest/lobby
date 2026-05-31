import { apiUrl } from './apiOrigin.ts';

export type ProvidersResponse = {
  google: boolean;
  github: boolean;
  dev: boolean;
  guest: boolean;
};

type LoginResponse = {
  accessToken?: string;
  error?: string;
};

const API_UNREACHABLE_MESSAGE = 'Could not reach the API (is `npm run dev` running in /server on port 3001?).';

async function postAuthLogin(path: string, init?: RequestInit): Promise<string> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: 'include',
      ...init,
    });
  } catch {
    throw new Error(API_UNREACHABLE_MESSAGE);
  }

  const text = await res.text();
  let data: LoginResponse;
  try {
    data = JSON.parse(text) as LoginResponse;
  } catch {
    throw new Error(
      text.trim()
        ? `Unexpected response (${res.status}): ${text.slice(0, 160)}`
        : `Unexpected empty response (${res.status}).`,
    );
  }

  if (!res.ok) {
    if (data.error === 'rate_limited') {
      throw new Error('Too many guest sign-ins from your network. Try again later.');
    }
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  if (!data.accessToken) throw new Error('missing access token');
  return data.accessToken;
}

export function fetchProviders(): Promise<ProvidersResponse> {
  return fetch(apiUrl('/auth/providers')).then((response) => {
    if (!response.ok) throw new Error('providers');
    return response.json() as Promise<ProvidersResponse>;
  });
}

export function devLogin(username: string): Promise<string> {
  return postAuthLogin('/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
}

export function guestLogin(): Promise<string> {
  return postAuthLogin('/auth/guest-login', {
    method: 'POST',
  });
}
