import { eq } from 'drizzle-orm';
import { isUnlockedAvatarId, sanitizeAvatarId } from '../shared/avatars.js';
import type { AppDatabase } from '../infrastructure/db/createDatabase.js';
import { users } from '../infrastructure/db/schema.js';

export class UserService {
  constructor(private readonly db: AppDatabase) {}

  async getAvatar(userId: string): Promise<{ avatarId: string } | null> {
    const rows = await this.db
      .select({ avatarId: users.avatarId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const raw = rows[0]?.avatarId;
    if (raw === undefined) return null;
    return { avatarId: sanitizeAvatarId(raw) };
  }

  async updateAvatar(userId: string, rawAvatarId: string): Promise<{ avatarId: string } | null> {
    if (!isUnlockedAvatarId(rawAvatarId)) return null;
    const updated = await this.db
      .update(users)
      .set({ avatarId: rawAvatarId })
      .where(eq(users.id, userId))
      .returning({ avatarId: users.avatarId });
    const row = updated[0];
    if (!row) return null;
    return { avatarId: row.avatarId };
  }
}
