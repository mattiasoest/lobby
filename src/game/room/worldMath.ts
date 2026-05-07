import {
  MAX_REMOTE_SEGMENT_MS,
  REMOTE_RENDER_DELAY_MAX_MS,
  REMOTE_RENDER_DELAY_MIN_MS,
} from './constants.ts';

export type RemoteSample = { t: number; x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function dropRemoteStaleAnchors(samples: RemoteSample[]): void {
  while (samples.length >= 2) {
    const a = samples[0];
    const b = samples[1];
    if (b.t - a.t > MAX_REMOTE_SEGMENT_MS) {
      samples.shift();
    } else {
      break;
    }
  }
}

/** No-op: kept so stale callers cannot throw after removing squash behavior. */
export function squashRemoteIdleLeadIn(_samples: RemoteSample[]): void {}

export function remoteRenderDelayMs(samples: RemoteSample[]): number {
  if (samples.length <= 2) return REMOTE_RENDER_DELAY_MIN_MS;
  const span = REMOTE_RENDER_DELAY_MAX_MS - REMOTE_RENDER_DELAY_MIN_MS;
  const depth = clamp((samples.length - 2) / 3, 0, 1);
  return REMOTE_RENDER_DELAY_MIN_MS + span * depth;
}

export function smoothstep01(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function posFromRemoteBuffer(
  samples: RemoteSample[],
  playbackT: number
): { x: number; y: number } {
  if (samples.length === 0) return { x: 0, y: 0 };
  if (samples.length === 1) return { x: samples[0].x, y: samples[0].y };

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (playbackT <= first.t) return { x: first.x, y: first.y };
  if (playbackT >= last.t) return { x: last.x, y: last.y };

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (playbackT <= b.t) {
      const span = b.t - a.t;
      const uLin = span < 1e-6 ? 0 : clamp((playbackT - a.t) / span, 0, 1);
      const u = smoothstep01(uLin);
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
      };
    }
  }
  return { x: last.x, y: last.y };
}

export function scrollWorldPx(
  avatarLeft: number,
  avatarTop: number,
  avatarSize: number,
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number
) {
  const cx = avatarLeft + avatarSize / 2;
  const cy = avatarTop + avatarSize / 2;
  const maxLeft = Math.max(0, worldW - viewW);
  const maxTop = Math.max(0, worldH - viewH);
  return {
    left: clamp(cx - viewW / 2, 0, maxLeft),
    top: clamp(cy - viewH / 2, 0, maxTop),
  };
}

export function clampWorldTopLeft(
  x: number,
  y: number,
  tileSize: number,
  worldCols: number,
  worldRows: number
) {
  const pad = tileSize * 0.14;
  const size = tileSize - pad * 2;
  const w = worldCols * tileSize;
  const h = worldRows * tileSize;
  return {
    x: clamp(x, pad, w - pad - size),
    y: clamp(y, pad, h - pad - size),
  };
}
