/** World position sync to server (Hz) */
export const POSITION_SYNC_HZ = 30;
export const SYNC_MS = 1000 / POSITION_SYNC_HZ;

/** Local movement speed (px/s) */
export const MOVE_PX_PER_SEC = 110;

/**
 * Stage scale for the scrolling world (rain stays unscaled on stage).
 * Values above 1 zoom in so 32×32 tiles and characters read larger in the canvas.
 */
export const ROOM_CAMERA_ZOOM = 2.4;

/**
 * Playback delay bounds: shallow buffers use the min so motion starts sooner;
 * once depth builds, ramp toward max for steadier bracketing.
 */
export const REMOTE_RENDER_DELAY_MAX_MS = 105;
export const REMOTE_RENDER_DELAY_MIN_MS = 45;

/** Drop buffered samples older than this to cap memory. */
export const REMOTE_SAMPLE_TTL_MS = 2500;

export const MAX_REMOTE_SAMPLES = 48;

/**
 * Drop front anchors if the gap before the next sample exceeds ~2 network steps.
 * Keeps interpolation segments short so idle→motion doesn't span huge time windows.
 */
export const MAX_REMOTE_SEGMENT_MS = SYNC_MS * 2 + 24;

/** Ignore jittery duplicate snapshots (world px). */
export const REMOTE_SNAP_EPS_SQ = 0.06 * 0.06;

/** Soft follow from last drawn pos → buffer target (higher = snappier, lower = silkier). */
export const REMOTE_DISPLAY_LAMBDA = 26;
/** After rest→motion, follow buffer target more tightly for a longer window. */
export const REMOTE_DISPLAY_LAMBDA_BURST = 64;
export const REMOTE_BURST_DURATION_MS = 308;
/** Smoothed speed below this (px/s) counts as “idle” for wake detection. */
export const REMOTE_BURST_IDLE_SPEED_PX_S = 22;
/** Smoothed speed above this after idle starts the burst window (lower = catches gentle starts). */
export const REMOTE_BURST_WAKE_SPEED_PX_S = 43;
/** During burst, shave ms off render delay (floor still applies). */
export const REMOTE_BURST_DELAY_SHAVE_MS = 20;
export const REMOTE_RENDER_DELAY_FLOOR_MS = 25;
