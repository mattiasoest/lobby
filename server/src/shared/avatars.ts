export const DEFAULT_AVATAR_ID = 'default';

export const UNLOCKED_AVATAR_IDS = ['default', 'option1', 'option2', 'option3'] as const;
export type UnlockedAvatarId = (typeof UNLOCKED_AVATAR_IDS)[number];

const UNLOCKED_AVATAR_ID_SET = new Set<string>(UNLOCKED_AVATAR_IDS);

export function isUnlockedAvatarId(id: string): boolean {
  return UNLOCKED_AVATAR_ID_SET.has(id);
}

export function sanitizeAvatarId(raw: unknown): string {
  if (typeof raw === 'string' && isUnlockedAvatarId(raw)) return raw;
  return DEFAULT_AVATAR_ID;
}
