import type { ChatMessageDTO } from '../types.ts';
import { apiFetch } from './api.ts';
import { apiUrl } from './apiOrigin.ts';

export function fetchRoomMessages(roomId: number, token: string): Promise<ChatMessageDTO[]> {
  return apiFetch(`/api/rooms/${roomId}/messages`, token);
}

export type ProvidersResponse = {
  google: boolean;
  github: boolean;
  dev: boolean;
  guest: boolean;
};

export function fetchProviders(): Promise<ProvidersResponse> {
  return fetch(apiUrl('/api/auth/providers')).then((response) => {
    if (!response.ok) throw new Error('providers');
    return response.json() as Promise<ProvidersResponse>;
  });
}

export async function devLogin(username: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/auth/dev-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username }),
    });
  } catch {
    throw new Error('Could not reach the API (is `npm run dev` running in /server on port 3001?).');
  }
  const text = await res.text();
  let data: { accessToken?: string; error?: string };
  try {
    data = JSON.parse(text) as { accessToken?: string; error?: string };
  } catch {
    throw new Error(
      text.trim()
        ? `Unexpected response (${res.status}): ${text.slice(0, 160)}`
        : `Unexpected empty response (${res.status}).`,
    );
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  if (!data.accessToken) throw new Error('missing access token');
  return data.accessToken;
}

export async function guestLogin(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/auth/guest-login'), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    throw new Error('Could not reach the API (is `npm run dev` running in /server on port 3001?).');
  }
  const text = await res.text();
  let data: { accessToken?: string; error?: string };
  try {
    data = JSON.parse(text) as { accessToken?: string; error?: string };
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
