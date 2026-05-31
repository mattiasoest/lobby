/** World position sync to server (Hz) */
export const POSITION_SYNC_HZ = 60;
export const SYNC_MS = 1000 / POSITION_SYNC_HZ;

/** Local movement speed (px/s) */
export const MOVE_PX_PER_SEC = 110;

/** AABB side length for player/animal entity–entity collision (world px). */
export const ENTITY_COLLISION_SIZE_PX = 11;

/**
 * Soft per-frame cap when separating two entities that became overlapped without
 * a movement input (e.g. a remote player snapped on top of us due to network jitter).
 * Blocking against an obstacle while actively walking is NOT capped — you stop at the edge.
 */
export const ENTITY_OVERLAP_RESOLVE_PX_PER_SEC = 80;

/**
 * Stage scale for the scrolling world.
 * Values above 1 zoom in so 32×32 tiles and characters read larger in the canvas.
 */
export const ROOM_CAMERA_ZOOM = 2.4;

/**
 * Server re-broadcasts moving players on a fixed tick (see server `BROADCAST_HZ`). This is the
 * expected spacing between remote snapshots; the interpolation buffer and segment limits are sized
 * around it rather than the (faster) local `SYNC_MS` send rate.
 */
export const REMOTE_EXPECTED_STEP_MS = 50;

/**
 * Playback delay bounds: shallow buffers use the min so motion starts sooner;
 * once depth builds, ramp toward max for steadier bracketing. Sized to absorb production network
 * jitter — must comfortably exceed one server broadcast step so a late/clumped packet still has a
 * sample to interpolate toward instead of starving the buffer (which reads as a freeze + snap).
 */
export const REMOTE_RENDER_DELAY_MAX_MS = 135;
export const REMOTE_RENDER_DELAY_MIN_MS = 75;

/** Drop buffered samples older than this to cap memory. */
export const REMOTE_SAMPLE_TTL_MS = 2500;

export const MAX_REMOTE_SAMPLES = 48;

/**
 * Drop front anchors if the gap before the next sample exceeds ~2 network steps.
 * Keeps interpolation segments short so idle→motion doesn't span huge time windows.
 */
export const MAX_REMOTE_SEGMENT_MS = REMOTE_EXPECTED_STEP_MS * 2 + 40;

/**
 * Remote snapshots carry the server send time. They're replayed on a local timeline anchored to the
 * first snapshot's arrival, advancing by server-reported deltas — so a clump of packets keeps its
 * true server spacing instead of collapsing into the arrival jitter. The anchor is gently pulled
 * toward real-time each snapshot ({@link REMOTE_CLOCK_CORRECTION}) so drifting latency doesn't
 * accumulate; a large divergence (clock jump / long stall) hard re-anchors
 * ({@link REMOTE_CLOCK_REANCHOR_MS}).
 */
export const REMOTE_CLOCK_CORRECTION = 0.03;
export const REMOTE_CLOCK_REANCHOR_MS = 280;

/** Ignore jittery duplicate snapshots (world px). */
export const REMOTE_SNAP_EPS_SQ = 0.06 * 0.06;

/** Soft follow from last drawn pos → buffer target (higher = snappier, lower = silkier). */
export const REMOTE_DISPLAY_LAMBDA = 48;
/** After rest→motion, follow buffer target more tightly for a longer window. */
export const REMOTE_DISPLAY_LAMBDA_BURST = 118;
export const REMOTE_BURST_DURATION_MS = 308;
/** Smoothed speed below this (px/s) counts as “idle” for wake detection. */
export const REMOTE_BURST_IDLE_SPEED_PX_S = 22;
/** Smoothed speed above this after idle starts the burst window (lower = catches gentle starts). */
export const REMOTE_BURST_WAKE_SPEED_PX_S = 43;
/** During burst, shave ms off render delay (floor still applies). */
export const REMOTE_BURST_DELAY_SHAVE_MS = 20;
export const REMOTE_RENDER_DELAY_FLOOR_MS = 25;
