const ROOM_COOLDOWN_MS = 3_000;
const GLOBAL_RPM_LIMIT = 29;
const DAILY_LIMIT = 800;

type RoomBucket = {
  lastReplyAtMs: number;
};

export class ChatNpcRateLimiter {
  private readonly roomBuckets = new Map<number, RoomBucket>();
  private readonly minuteTimestamps: number[] = [];
  private dailyCount = 0;
  private dailyResetUtcDay = this.utcDayKey();

  private utcDayKey(now = Date.now()): number {
    return Math.floor(now / 86_400_000);
  }

  private resetDailyIfNeeded(now: number): void {
    const day = this.utcDayKey(now);
    if (day !== this.dailyResetUtcDay) {
      this.dailyResetUtcDay = day;
      this.dailyCount = 0;
    }
  }

  private pruneMinuteWindow(now: number): void {
    const cutoff = now - 60_000;
    while (this.minuteTimestamps.length > 0 && this.minuteTimestamps[0] < cutoff) {
      this.minuteTimestamps.shift();
    }
  }

  /** Minimum gap between any ChatNpc reply in a room (LLM or canned). */
  canReplyInRoom(roomId: number, now = Date.now()): boolean {
    const bucket = this.roomBuckets.get(roomId);
    if (!bucket) return true;
    return now - bucket.lastReplyAtMs >= ROOM_COOLDOWN_MS;
  }

  markReplied(roomId: number, now = Date.now()): void {
    this.roomBuckets.set(roomId, { lastReplyAtMs: now });
  }

  /** Whether a Groq API call is still within org/day/minute budget. */
  canCallGroq(now = Date.now()): boolean {
    this.resetDailyIfNeeded(now);
    this.pruneMinuteWindow(now);
    if (this.dailyCount >= DAILY_LIMIT) return false;
    if (this.minuteTimestamps.length >= GLOBAL_RPM_LIMIT) return false;
    return true;
  }

  consumeGroqSlot(now = Date.now()): void {
    this.resetDailyIfNeeded(now);
    this.pruneMinuteWindow(now);
    this.minuteTimestamps.push(now);
    this.dailyCount += 1;
  }
}
