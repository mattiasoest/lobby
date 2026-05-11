import { MAX_REMOTE_SEGMENT_MS, REMOTE_RENDER_DELAY_MAX_MS, REMOTE_RENDER_DELAY_MIN_MS } from './constants.ts';

export type RemoteSample = { time: number; x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function dropRemoteStaleAnchors(samples: RemoteSample[]): void {
  while (samples.length >= 2) {
    const firstSample = samples[0];
    const secondSample = samples[1];
    if (secondSample.time - firstSample.time > MAX_REMOTE_SEGMENT_MS) {
      samples.shift();
    } else {
      break;
    }
  }
}

export function remoteRenderDelayMs(samples: RemoteSample[]): number {
  if (samples.length <= 2) return REMOTE_RENDER_DELAY_MIN_MS;
  const span = REMOTE_RENDER_DELAY_MAX_MS - REMOTE_RENDER_DELAY_MIN_MS;
  const depth = clamp((samples.length - 2) / 3, 0, 1);
  return REMOTE_RENDER_DELAY_MIN_MS + span * depth;
}

export function smoothstep01(unitT: number) {
  const clampedUnit = clamp(unitT, 0, 1);
  return clampedUnit * clampedUnit * (3 - 2 * clampedUnit);
}

export function posFromRemoteBuffer(samples: RemoteSample[], playbackTime: number): { x: number; y: number } {
  if (samples.length === 0) return { x: 0, y: 0 };
  if (samples.length === 1) return { x: samples[0].x, y: samples[0].y };

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (playbackTime <= first.time) return { x: first.x, y: first.y };
  if (playbackTime >= last.time) return { x: last.x, y: last.y };

  for (let segmentIndex = 0; segmentIndex < samples.length - 1; segmentIndex++) {
    const segmentStart = samples[segmentIndex];
    const segmentEnd = samples[segmentIndex + 1];
    if (playbackTime <= segmentEnd.time) {
      const span = segmentEnd.time - segmentStart.time;
      const linearMix = span < 1e-6 ? 0 : clamp((playbackTime - segmentStart.time) / span, 0, 1);
      const easedMix = smoothstep01(linearMix);
      return {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * easedMix,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * easedMix,
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
  worldH: number,
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
  topLeftX: number,
  topLeftY: number,
  tileSize: number,
  worldCols: number,
  worldRows: number,
) {
  const pad = tileSize * 0.14;
  const size = tileSize - pad * 2;
  const worldWidth = worldCols * tileSize;
  const worldHeight = worldRows * tileSize;
  return {
    x: clamp(topLeftX, pad, worldWidth - pad - size),
    y: clamp(topLeftY, pad, worldHeight - pad - size),
  };
}
