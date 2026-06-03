/** Stable Pixi/roster id for the local avatar before the room socket connects (rekeyed to socket id on connect). */
export const LOCAL_DISPLAY_ID = '__local__';

/** World position sync to server (Hz) */
export const POSITION_SYNC_HZ = 60;
export const SYNC_MS = 1000 / POSITION_SYNC_HZ;

/** Local movement speed (px/s) */
export const MOVE_PX_PER_SEC = 110;

/** AABB side length for player/npc entity–entity collision (world px). */
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
 * Playback delay bounds. For a casual lobby we prefer smoothness over responsiveness — keep the
 * buffer deep so playback rarely catches the newest sample (which causes hold-then-jump flicker).
 * MIN is intentionally close to MAX so a shallow buffer still waits long enough to bracket jitter.
 */
export const REMOTE_RENDER_DELAY_MAX_MS = 280;
export const REMOTE_RENDER_DELAY_MIN_MS = 220;

/** Drop buffered samples older than this to cap memory. */
export const REMOTE_SAMPLE_TTL_MS = 2500;

export const MAX_REMOTE_SAMPLES = 48;

/**
 * Drop front anchors only when the gap before the next sample is very large (lost packets / long
 * stall). A tight limit here collapses the buffer on routine prod jitter and reads as a snap.
 */
export const MAX_REMOTE_SEGMENT_MS = REMOTE_EXPECTED_STEP_MS * 8 + 80;

/**
 * Remote snapshots carry the server send time. They're replayed on a local timeline anchored to the
 * first snapshot's arrival, advancing by server-reported deltas — so a clump of packets keeps its
 * true server spacing instead of collapsing into the arrival jitter. The anchor is gently pulled
 * toward real-time each snapshot ({@link REMOTE_CLOCK_CORRECTION}) so drifting latency doesn't
 * accumulate; a large divergence (clock jump / long stall) hard re-anchors
 * ({@link REMOTE_CLOCK_REANCHOR_MS}).
 */
export const REMOTE_CLOCK_CORRECTION = 0.008;
export const REMOTE_CLOCK_REANCHOR_MS = 520;

/** Ignore jittery duplicate snapshots (world px). */
export const REMOTE_SNAP_EPS_SQ = 0.06 * 0.06;

/** Soft follow from last drawn pos → buffer target (lower = silkier; avoid high values — they read as flicker). */
export const REMOTE_DISPLAY_LAMBDA = 18;
/** Burst follow disabled for anti-flicker profile — kept equal to {@link REMOTE_DISPLAY_LAMBDA}. */
export const REMOTE_DISPLAY_LAMBDA_BURST = 18;
export const REMOTE_BURST_DURATION_MS = 0;
/** Burst wake disabled — high threshold so the burst window never opens. */
export const REMOTE_BURST_IDLE_SPEED_PX_S = 22;
export const REMOTE_BURST_WAKE_SPEED_PX_S = 999;
/** No delay shave during burst — deep buffer at all times. */
export const REMOTE_BURST_DELAY_SHAVE_MS = 0;
/** Floor matches MIN so playback never runs with a dangerously shallow buffer. */
export const REMOTE_RENDER_DELAY_FLOOR_MS = 220;
