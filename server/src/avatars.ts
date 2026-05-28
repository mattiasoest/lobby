export const DEFAULT_AVATAR_ID = 'default';

const UNLOCKED_AVATAR_IDS = new Set<string>([DEFAULT_AVATAR_ID, 'option1']);

export function isUnlockedAvatarId(id: string): boolean {
  return UNLOCKED_AVATAR_IDS.has(id);
}

export function sanitizeAvatarId(raw: unknown): string {
  if (typeof raw === 'string' && isUnlockedAvatarId(raw)) return raw;
  return DEFAULT_AVATAR_ID;
}
