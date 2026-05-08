import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { bootstrapServerSession, clearSessionBootstrapCache } from '../features/auth/oauthBootstrap.ts';
import type { ProvidersResponse } from '../services/messagesApi.ts';
import { devLogin, fetchProviders, fetchRoomMessages } from '../services/messagesApi.ts';
import { queryKeys } from './keys.ts';

export function useAuthProvidersQuery() {
  return useQuery({
    queryKey: queryKeys.auth.providers,
    queryFn: (): Promise<ProvidersResponse> => fetchProviders(),
  });
}

export function useRoomMessagesQuery(roomId: number, token: string | null) {
  const enabled = !!token && typeof roomId === 'number' && roomId >= 1 && roomId <= 4;

  return useQuery({
    queryKey: queryKeys.rooms.messages(roomId),
    queryFn: () => fetchRoomMessages(roomId, token as string),
    enabled,
  });
}

export function useDevLoginMutation(opts: { setToken: (t: string) => void }) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (username: string) => devLogin(username),
    onSuccess: (accessToken) => {
      opts.setToken(accessToken);
      navigate('/lobby', { replace: true });
    },
  });
}

export function useOAuthBindSessionMutation() {
  return useMutation({
    mutationFn: async ({ access, rt }: { access: string; rt: string | null }): Promise<boolean> =>
      rt ? bootstrapServerSession(access, rt) : Promise.resolve(true),
    onSettled: (_d, _e, vars) => {
      clearSessionBootstrapCache(vars.access);
    },
  });
}
