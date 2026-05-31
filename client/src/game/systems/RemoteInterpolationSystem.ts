import {
  MAX_REMOTE_SAMPLES,
  REMOTE_BURST_DELAY_SHAVE_MS,
  REMOTE_BURST_DURATION_MS,
  REMOTE_BURST_IDLE_SPEED_PX_S,
  REMOTE_BURST_WAKE_SPEED_PX_S,
  REMOTE_CLOCK_CORRECTION,
  REMOTE_CLOCK_REANCHOR_MS,
  REMOTE_DISPLAY_LAMBDA,
  REMOTE_DISPLAY_LAMBDA_BURST,
  REMOTE_RENDER_DELAY_FLOOR_MS,
  REMOTE_SAMPLE_TTL_MS,
  REMOTE_SNAP_EPS_SQ,
} from '../core/constants.ts';
import type { RoomCanvasSyncState } from '../core/syncState.ts';
import {
  dropRemoteStaleAnchors,
  posFromRemoteBuffer,
  remoteRenderDelayMs,
  type RemoteSample,
} from '../core/worldMath.ts';

export class RemoteInterpolationSystem {
  private remotePxRef = new Map<string, { x: number; y: number }>();
  private remoteSampleBufRef = new Map<string, RemoteSample[]>();
  private lastServerSnapRef = new Map<string, { x: number; y: number }>();
  private remoteTargetPrevRef = new Map<string, { x: number; y: number }>();
  private remoteSpeedSmoothedRef = new Map<string, number>();
  private remoteBurstUntilRef = new Map<string, number>();
  private remoteClockAnchorRef: { localMs: number; serverMs: number } | null = null;
  private lastRemoteServerStampRef = 0;
  private lastRemoteSampleTimeRef = 0;

  getRemotePx(id: string): { x: number; y: number } | undefined {
    return this.remotePxRef.get(id);
  }

  getRemotePxMap(): Map<string, { x: number; y: number }> {
    return this.remotePxRef;
  }

  getObstacles(localId: string | null, syncState: RoomCanvasSyncState): { x: number; y: number }[] {
    const obstacles: { x: number; y: number }[] = [];
    for (const player of syncState.players) {
      if (localId && player.id === localId) continue;
      const remotePos = this.remotePxRef.get(player.id);
      obstacles.push(remotePos ?? { x: player.x, y: player.y });
    }
    return obstacles;
  }

  seed(id: string, x: number, y: number, timeMs: number): void {
    this.remotePxRef.set(id, { x, y });
    this.remoteSampleBufRef.set(id, [{ time: timeMs, x, y }]);
    this.lastServerSnapRef.set(id, { x, y });
  }

  reset(): void {
    this.remotePxRef.clear();
    this.remoteSampleBufRef.clear();
    this.lastServerSnapRef.clear();
    this.remoteTargetPrevRef.clear();
    this.remoteSpeedSmoothedRef.clear();
    this.remoteBurstUntilRef.clear();
    this.resetRemoteClock();
  }

  private resetRemoteClock(): void {
    this.remoteClockAnchorRef = null;
    this.lastRemoteServerStampRef = 0;
    this.lastRemoteSampleTimeRef = 0;
  }

  private advanceRemoteClock(serverStampMs: number, nowLocalMs: number): number {
    if (!serverStampMs) return nowLocalMs;

    let anchor = this.remoteClockAnchorRef;
    if (!anchor) {
      anchor = { localMs: nowLocalMs, serverMs: serverStampMs };
      this.remoteClockAnchorRef = anchor;
      this.lastRemoteServerStampRef = serverStampMs;
      this.lastRemoteSampleTimeRef = nowLocalMs;
      return nowLocalMs;
    }

    if (serverStampMs === this.lastRemoteServerStampRef) return this.lastRemoteSampleTimeRef;

    let mapped = anchor.localMs + (serverStampMs - anchor.serverMs);
    const lead = mapped - nowLocalMs;
    if (Math.abs(lead) > REMOTE_CLOCK_REANCHOR_MS) {
      anchor.localMs = nowLocalMs;
      anchor.serverMs = serverStampMs;
      mapped = nowLocalMs;
    } else if (lead !== 0) {
      anchor.localMs -= lead * REMOTE_CLOCK_CORRECTION;
      mapped = anchor.localMs + (serverStampMs - anchor.serverMs);
    }

    this.lastRemoteServerStampRef = serverStampMs;
    this.lastRemoteSampleTimeRef = mapped;
    return mapped;
  }

  update(now: number, dt: number, syncState: RoomCanvasSyncState): void {
    const { players, localId, playersServerStampMs } = syncState;
    const sampleTimeMs = this.advanceRemoteClock(playersServerStampMs, now);

    for (const player of players) {
      if (localId && player.id === localId) continue;

      let samples = this.remoteSampleBufRef.get(player.id);
      if (!samples) {
        samples = [{ time: sampleTimeMs, x: player.x, y: player.y }];
        this.remoteSampleBufRef.set(player.id, samples);
        this.lastServerSnapRef.set(player.id, { x: player.x, y: player.y });
      } else {
        const prev = this.lastServerSnapRef.get(player.id);
        const moved = !prev || (player.x - prev.x) ** 2 + (player.y - prev.y) ** 2 > REMOTE_SNAP_EPS_SQ;
        if (moved) {
          this.lastServerSnapRef.set(player.id, { x: player.x, y: player.y });
          samples.push({ time: sampleTimeMs, x: player.x, y: player.y });
          while (samples.length > MAX_REMOTE_SAMPLES) {
            samples.shift();
          }
        }
      }

      const arr = this.remoteSampleBufRef.get(player.id);
      if (arr && arr.length > 0) {
        const cutoff = now - REMOTE_SAMPLE_TTL_MS;
        while (arr.length > 1 && arr[0].time < cutoff) {
          arr.shift();
        }
        dropRemoteStaleAnchors(arr);
      }

      const ready = this.remoteSampleBufRef.get(player.id) ?? [];
      const baseDelay = remoteRenderDelayMs(ready);
      let burst = now < (this.remoteBurstUntilRef.get(player.id) ?? 0);

      let playbackDelay = burst
        ? Math.max(REMOTE_RENDER_DELAY_FLOOR_MS, baseDelay - REMOTE_BURST_DELAY_SHAVE_MS)
        : baseDelay;
      let target = posFromRemoteBuffer(ready, now - playbackDelay);

      const prevTarget = this.remoteTargetPrevRef.get(player.id);
      let instSpeed = 0;
      if (prevTarget) {
        const invDt = 1 / Math.max(dt, 1e-4);
        instSpeed = Math.hypot(target.x - prevTarget.x, target.y - prevTarget.y) * invDt;
      }
      const prevSmooth = this.remoteSpeedSmoothedRef.get(player.id) ?? 0;
      let smoothSpeed = prevSmooth * 0.55 + instSpeed * 0.45;

      const woke =
        prevTarget !== undefined &&
        prevSmooth < REMOTE_BURST_IDLE_SPEED_PX_S &&
        smoothSpeed > REMOTE_BURST_WAKE_SPEED_PX_S;

      if (woke) {
        this.remoteBurstUntilRef.set(player.id, now + REMOTE_BURST_DURATION_MS);
        if (!burst) {
          burst = true;
          playbackDelay = Math.max(REMOTE_RENDER_DELAY_FLOOR_MS, baseDelay - REMOTE_BURST_DELAY_SHAVE_MS);
          target = posFromRemoteBuffer(ready, now - playbackDelay);
          if (prevTarget) {
            const invDt = 1 / Math.max(dt, 1e-4);
            instSpeed = Math.hypot(target.x - prevTarget.x, target.y - prevTarget.y) * invDt;
            smoothSpeed = prevSmooth * 0.55 + instSpeed * 0.45;
          }
        }
      }

      this.remoteSpeedSmoothedRef.set(player.id, smoothSpeed);
      this.remoteTargetPrevRef.set(player.id, { x: target.x, y: target.y });

      const prevDrawn = this.remotePxRef.get(player.id);
      const lambda = burst ? REMOTE_DISPLAY_LAMBDA_BURST : REMOTE_DISPLAY_LAMBDA;
      const blend = 1 - Math.exp(-lambda * dt);
      if (!prevDrawn) {
        this.remotePxRef.set(player.id, { ...target });
      } else {
        this.remotePxRef.set(player.id, {
          x: prevDrawn.x + (target.x - prevDrawn.x) * blend,
          y: prevDrawn.y + (target.y - prevDrawn.y) * blend,
        });
      }
    }

    const remoteIds = new Set<string>();
    for (const player of players) {
      if (!(localId && player.id === localId)) remoteIds.add(player.id);
    }
    for (const id of [...this.remoteSampleBufRef.keys()]) {
      if (!remoteIds.has(id)) {
        this.remoteSampleBufRef.delete(id);
        this.lastServerSnapRef.delete(id);
        this.remotePxRef.delete(id);
        this.remoteTargetPrevRef.delete(id);
        this.remoteSpeedSmoothedRef.delete(id);
        this.remoteBurstUntilRef.delete(id);
      }
    }
  }
}
