import { apiFetch } from './api.ts';

export type MeResponse = {
  avatarId: string;
};

export function fetchMe(token: string): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me', token);
}

export function updateAvatar(token: string, avatarId: string): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me', token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarId }),
  });
}
