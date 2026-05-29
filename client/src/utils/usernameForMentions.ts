/** Lowercase, whitespace-free key for roster + @mention matching. */
export function usernameForMentionMatch(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}
