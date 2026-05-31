import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_AVATAR_ID, isUnlockedAvatarId, sanitizeAvatarId } from '../game/config/avatars.ts';
import { useMeQuery, useUpdateAvatarMutation } from '@/query/hooks.ts';
import { useAuth } from './authContext.tsx';

type AvatarContextValue = {
  avatarId: string;
  avatarLoading: boolean;
  setAvatarId: (avatarId: string) => void;
  avatarUpdating: boolean;
};

const AvatarContext = createContext<AvatarContextValue | null>(null);

export function AvatarProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const meQuery = useMeQuery(token);
  const updateMutation = useUpdateAvatarMutation(token);

  const avatarId = meQuery.data ? sanitizeAvatarId(meQuery.data.avatarId) : DEFAULT_AVATAR_ID;

  const setAvatarId = useCallback(
    (nextAvatarId: string) => {
      if (!isUnlockedAvatarId(nextAvatarId) || !token) return;
      updateMutation.mutate(nextAvatarId);
    },
    [token, updateMutation],
  );

  const value = useMemo(
    () => ({
      avatarId,
      avatarLoading: !!token && meQuery.isLoading,
      setAvatarId,
      avatarUpdating: updateMutation.isPending,
    }),
    [avatarId, meQuery.isLoading, setAvatarId, token, updateMutation.isPending],
  );

  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>;
}

/* eslint-disable react-refresh/only-export-components -- paired hook for AvatarProvider */
export function useAvatar() {
  const ctx = useContext(AvatarContext);
  if (!ctx) throw new Error('useAvatar must be used within AvatarProvider');
  return ctx;
}
