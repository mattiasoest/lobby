export function sanitizeAvatarColor(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.floor(raw) & 0xffffff;
  }
  return 0xffffff;
}
