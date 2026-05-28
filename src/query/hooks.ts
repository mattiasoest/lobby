import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { bootstrapServerSession, clearSessionBootstrapCache } from '../features/auth/oauthBootstrap.ts';
import type { ProvidersResponse } from '../services/messagesApi.ts';
import { devLogin, fetchProviders, fetchRoomMessages, guestLogin } from '../services/messagesApi.ts';
import { fetchMe, updateAvatar } from '../services/meApi.ts';
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

export function useMeQuery(token: string | null) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => fetchMe(token as string),
    enabled: !!token,
  });
}

export function useUpdateAvatarMutation(token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (avatarId: string) => updateAvatar(token as string, avatarId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.me, data);
    },
  });
}

export function useDevLoginMutation(opts: { setToken: (token: string) => void }) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (username: string) => devLogin(username),
    onSuccess: (accessToken) => {
      opts.setToken(accessToken);
      navigate('/lobby', { replace: true });
    },
  });
}

export function useGuestLoginMutation(opts: { setToken: (token: string) => void }) {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => guestLogin(),
    onSuccess: (accessToken) => {
      opts.setToken(accessToken);
      navigate('/lobby', { replace: true });
    },
  });
}

export function useOAuthBindSessionMutation() {
  return useMutation({
    mutationFn: async ({ access, refreshToken }: { access: string; refreshToken: string | null }): Promise<boolean> =>
      refreshToken ? bootstrapServerSession(access, refreshToken) : Promise.resolve(true),
    onSettled: (_settledData, _settledError, vars) => {
      clearSessionBootstrapCache(vars.access);
    },
  });
}
