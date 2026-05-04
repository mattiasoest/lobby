import type { ChatMessageDTO } from '../types.ts';
import { apiFetch } from './api.ts';

export function fetchRoomMessages(roomId: number, token: string): Promise<ChatMessageDTO[]> {
  return apiFetch(`/api/rooms/${roomId}/messages`, token);
}

export type ProvidersResponse = {
  google: boolean
  github: boolean
  dev: boolean
}

export function fetchProviders(): Promise<ProvidersResponse> {
  return fetch('/api/auth/providers').then((r) => {
    if (!r.ok) throw new Error('providers');
    return r.json() as Promise<ProvidersResponse>;
  });
}

export async function devLogin(username: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
  } catch {
    throw new Error(
      'Could not reach the API (is `npm run dev` running in /server on port 3001?).'
    );
  }
  const text = await res.text();
  let data: { token?: string; error?: string };
  try {
    data = JSON.parse(text) as { token?: string; error?: string };
  } catch {
    throw new Error(
      text.trim()
        ? `Unexpected response (${res.status}): ${text.slice(0, 160)}`
        : `Unexpected empty response (${res.status}).`
    );
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  if (!data.token) throw new Error('missing token');
  return data.token;
}
