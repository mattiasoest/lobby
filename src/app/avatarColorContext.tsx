import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { clampRgbInt, randomAvatarColor } from '../game/room/playerColor.ts';

const STORAGE_PREFIX = 'lobby_player_avatar_rgb';

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${scope}`;
}

function readStoredRgb(scope: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    return raw !== null ? clampRgbInt(raw) : null;
  } catch {
    return null;
  }
}

type AvatarColorContextValue = {
  avatarRgb: number;
  setAvatarRgb: (rgb: number) => void;
};

const AvatarColorContext = createContext<AvatarColorContextValue | null>(null);

export function AvatarColorProvider({ storageScope, children }: { storageScope: string; children: ReactNode }) {
  const [avatarRgb, setAvatarRgbState] = useState(() => readStoredRgb(storageScope) ?? randomAvatarColor());

  const setAvatarRgb = useCallback(
    (rgb: number) => {
      const clampedRgb = clampRgbInt(rgb);
      const next = clampedRgb ?? randomAvatarColor();
      setAvatarRgbState(next);
      try {
        localStorage.setItem(storageKey(storageScope), String(next));
      } catch {
        /* ignore quota / disabled storage */
      }
    },
    [storageScope],
  );

  const value = useMemo(() => ({ avatarRgb, setAvatarRgb }), [avatarRgb, setAvatarRgb]);

  return <AvatarColorContext.Provider value={value}>{children}</AvatarColorContext.Provider>;
}

/* eslint-disable react-refresh/only-export-components -- paired hook for AvatarColorProvider */
export function useAvatarColor() {
  const ctx = useContext(AvatarColorContext);
  if (!ctx) throw new Error('useAvatarColor must be used within AvatarColorProvider');
  return ctx;
}
