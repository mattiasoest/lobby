/** Trim and collapse internal whitespace before persisting; keeps @mentions and display consistent. */
export function collapseUsernameWhitespace(username: string, maxLen: number): string {
  return username.trim().replace(/\s+/g, '').slice(0, maxLen);
}
