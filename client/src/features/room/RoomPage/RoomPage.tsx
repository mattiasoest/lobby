import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROOM_IDS } from '@/app/constants.ts';
import { decodeJwtPayload } from '@/utils/jwt.ts';
import { useAuth } from '@/app/authContext.tsx';
import { CanvasLoadingFallback } from '@/components/CanvasLoadingFallback/CanvasLoadingFallback.tsx';
import { RoomMinimap } from '@/components/RoomMinimap/RoomMinimap.tsx';
import {
  roomCanvasViewLayout,
  ROOM_TILE_SIZE,
  ROOM_VIEW_HEIGHT_PX,
  ROOM_WORLD_COLS,
  ROOM_WORLD_ROWS,
} from '@/utils/canvasLoaderLayout.ts';
import { useRoomPanelLayout } from '@/utils/useRoomScrollArea.ts';
import { ChatBox } from '@/components/ChatBox/ChatBox.tsx';
import { RoomPlayerList } from '@/components/RoomPlayerList/RoomPlayerList.tsx';
import { createPlayerListPositionStore } from '@/utils/playerListPositionStore.ts';
import { queryKeys } from '@/query/keys.ts';
import { queryClient } from '@/query/queryClient.ts';
import { useRoomMessagesQuery } from '@/query/hooks.ts';
import { isTypingTarget } from '../../../game/config/keyboard.ts';
import { useAvatar } from '@/app/avatarContext.tsx';
import { createRoomSocket } from '@/services/socket.ts';
import { LOCAL_DISPLAY_ID } from '../../../game/core/constants.ts';
import { createInitialSyncState, type RoomCanvasSyncState } from '../../../game/core/syncState.ts';
import { getRoomChatNpc, isRoomChatNpcUserId } from '../../../game/config/chatNpc.ts';
import type { ChatMessageDTO } from '@/services/messagesApi.ts';
import type { PlayerDTO } from '@/types.ts';
import { usernameForMentionMatch } from '@/utils/usernameForMentions.ts';
import type { Socket } from 'socket.io-client';
import { importWithChunkRetry } from '@/utils/chunkLoadError.ts';
import layout from '@/styles/layout.module.css';
import roomStyles from './RoomPage.css';

const LazyPixiRoomCanvas = lazy(() =>
  importWithChunkRetry(() => import('@/components/PixiCanvas/PixiCanvas.tsx').then((m) => ({ default: m.PixiCanvas }))),
);

function worldSpawnPx() {
  const pad = ROOM_TILE_SIZE * 0.14;
  const size = ROOM_TILE_SIZE - pad * 2;
  const worldWidthPx = ROOM_WORLD_COLS * ROOM_TILE_SIZE;
  const worldHeightPx = ROOM_WORLD_ROWS * ROOM_TILE_SIZE;
  return { x: worldWidthPx / 2 - size / 2, y: worldHeightPx / 2 - size / 2 };
}

const SPAWN_JITTER_PX = 125;

/** Random offset ±{@link SPAWN_JITTER_PX} on each axis from map center (world top-left of avatar). */
function jitterAroundWorldSpawn() {
  const base = worldSpawnPx();
  const spawnJitterRadiusPx = SPAWN_JITTER_PX;
  return {
    x: base.x + (Math.random() * 2 * spawnJitterRadiusPx - spawnJitterRadiusPx),
    y: base.y + (Math.random() * 2 * spawnJitterRadiusPx - spawnJitterRadiusPx),
  };
}

const EMPTY_ROOM_MESSAGES: ChatMessageDTO[] = [];

function rosterStructureKey(players: PlayerDTO[]): string {
  if (players.length === 0) return '';
  return [...players]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `${p.id}\0${p.username}\0${p.userId}\0${p.avatarId}`)
    .join('|');
}

/** Stable id for the local avatar row before the room socket connects (rekeyed to socket id on connect). */
export function resolveLocalPlayerId(socketId: string | null, claims: ReturnType<typeof decodeJwtPayload>): string {
  if (socketId) return socketId;
  if (typeof claims?.sub === 'string' && claims.sub.length > 0) return claims.sub;
  return LOCAL_DISPLAY_ID;
}

function buildLocalPreviewPlayer(
  localId: string,
  spawnPx: { x: number; y: number },
  username: string | null | undefined,
  claims: ReturnType<typeof decodeJwtPayload>,
  avatarId: string,
): PlayerDTO {
  const userId = typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : localId;
  return {
    id: localId,
    username: username ?? claims?.username ?? 'You',
    x: spawnPx.x,
    y: spawnPx.y,
    userId,
    avatarId,
  };
}

/** Ensures the ticker always has a local row — uses JWT auth before the room socket connects. */
function withGhostPlayerIfNeeded(
  server: PlayerDTO[],
  socketId: string | null,
  spawnPx: { x: number; y: number },
  username: string | null | undefined,
  claims: ReturnType<typeof decodeJwtPayload>,
  avatarId: string,
): PlayerDTO[] {
  const localId = resolveLocalPlayerId(socketId, claims);
  if (server.some((player) => player.id === localId)) return server;
  const selfUserId = typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : null;
  if (selfUserId && server.some((player) => player.userId === selfUserId)) return server;
  return [...server, buildLocalPreviewPlayer(localId, spawnPx, username, claims, avatarId)];
}

export function RoomPage({ roomId }: { roomId: number }) {
  const { token, username } = useAuth();
  const { avatarId } = useAvatar();
  const messagesQuery = useRoomMessagesQuery(roomId, token);
  const messages = messagesQuery.data ?? EMPTY_ROOM_MESSAGES;

  const socketRef = useRef<Socket | null>(null);

  const [socketId, setSocketId] = useState<string | null>(null);
  const [serverPlayers, setServerPlayers] = useState<PlayerDTO[]>([]);
  const [typingFocus, setTypingFocus] = useState(false);
  const [composerSeed, setComposerSeed] = useState<{ key: number; text: string } | undefined>();
  const chatComposerRef = useRef<HTMLInputElement>(null);
  const serverPlayersRef = useRef<PlayerDTO[]>([]);
  const selfUserIdRef = useRef<string>('');
  /** Messages from others before roster lists their socket id yet (latest per user id) */
  const pendingRemoteSpeechRef = useRef<Map<string, ChatMessageDTO>>(new Map());
  const syncRef = useRef<RoomCanvasSyncState>(createInitialSyncState());
  const rosterStructureKeyRef = useRef<string>('');
  const listDepsRef = useRef({
    spawnPx: { x: 0, y: 0 },
    username: null as string | null | undefined,
    claims: null as ReturnType<typeof decodeJwtPayload>,
    avatarId: 'default',
  });

  const playerListStore = useMemo(() => createPlayerListPositionStore(), []);

  /** When `roomId` changes, reset room-scoped React state during render so Pixi stays mounted and
   *  `switchRoom` can transition without the bootstrap loader flicker. Refs and the player-list
   *  store reset in layout effect (same commit, before paint) — not in `useEffect`, which runs too late. */
  const [trackedRoomId, setTrackedRoomId] = useState(roomId);
  if (roomId !== trackedRoomId) {
    setTrackedRoomId(roomId);
    setServerPlayers([]);
  }

  const spawnPx = useMemo(() => {
    // Spawn coordinates do not use room geometry (same WORLD_* everywhere). We still key this memo on
    // roomId so navigating to another room draws a fresh jittered spawn; to reuse one spawn for all
    // rooms, use [] and drop roomId from the callback. `void roomId` ties the callback to the dep so
    // eslint exhaustive-deps does not treat roomId as unused.
    void roomId;
    return jitterAroundWorldSpawn();
  }, [roomId]);

  const claims = useMemo(() => decodeJwtPayload(token), [token]);

  useLayoutEffect(() => {
    rosterStructureKeyRef.current = '';
    pendingRemoteSpeechRef.current.clear();
    syncRef.current.localPx = { x: spawnPx.x, y: spawnPx.y };
    syncRef.current.minimapSnapshot = null;
    syncRef.current.serverClockOffsetMs = null;
    syncRef.current.playersServerStampMs = 0;
    syncRef.current.clearSpeechBubbles?.();
    syncRef.current.onChatNpcTap = undefined;
  }, [playerListStore, roomId, spawnPx]);

  const roomStackRef = useRef<HTMLDivElement>(null);
  const {
    stackMaxHeightPx: roomPanelMaxHeightPx,
    viewHeightPx: roomViewHeightPx,
    showPlayerList,
  } = useRoomPanelLayout(roomStackRef, ROOM_VIEW_HEIGHT_PX);

  const canvasViewBox = useMemo(() => roomCanvasViewLayout(roomViewHeightPx), [roomViewHeightPx]);

  const [pixiCanvasReady, setPixiCanvasReady] = useState(false);

  const handlePixiCanvasReady = useCallback((ready: boolean) => {
    setPixiCanvasReady(ready);
  }, []);

  /** Chunk load is covered by Suspense (`lazy`); WebGL bootstrap uses `pixiCanvasReady`. One overlay until both complete. */
  const showRoomCanvasLoader = !pixiCanvasReady;

  useLayoutEffect(() => {
    serverPlayersRef.current = serverPlayers;
    selfUserIdRef.current = typeof claims?.sub === 'string' ? claims.sub : '';
    listDepsRef.current = { spawnPx, username, claims, avatarId };
  }, [serverPlayers, claims, spawnPx, username, avatarId]);

  useEffect(() => {
    if (!token) return;

    const pendingForCleanup = pendingRemoteSpeechRef.current;

    const sock = createRoomSocket({ roomId, token });
    socketRef.current = sock;

    function scheduleRemoteBubble(senderSocketId: string, content: string) {
      syncRef.current.showSpeechBubble?.(senderSocketId, content);
    }

    /** @returns Whether the bubble was shown (sender on roster). */
    function tryShowRemoteBubble(msg: ChatMessageDTO, roster: PlayerDTO[]): boolean {
      const sender = roster.find((player) => player.userId === msg.user_id);
      if (!sender) return false;
      scheduleRemoteBubble(sender.id, msg.content);
      return true;
    }

    function flushPendingRemoteSpeech(roster: PlayerDTO[]) {
      const pend = pendingRemoteSpeechRef.current;
      for (const [userId, pendingMessage] of [...pend.entries()]) {
        if (tryShowRemoteBubble(pendingMessage, roster)) pend.delete(userId);
      }
    }

    function handlePlayers(payload: PlayerDTO[] | { t?: number; players: PlayerDTO[] }) {
      // Newer servers send { t, players }; tolerate the bare array for resilience during rollout.
      const roster = Array.isArray(payload) ? payload : (payload?.players ?? []);
      const serverStampMs = Array.isArray(payload) ? undefined : payload?.t;
      if (typeof serverStampMs === 'number' && Number.isFinite(serverStampMs)) {
        syncRef.current.playersServerStampMs = serverStampMs;
      }
      serverPlayersRef.current = roster;
      const sid = sock.id ?? null;
      const merged = withGhostPlayerIfNeeded(roster, sid, spawnPx, username, claims, avatarId);
      syncRef.current.players = merged;
      playerListStore.publish(merged.map((p) => ({ ...p })));
      const nextKey = rosterStructureKey(roster);
      if (nextKey !== rosterStructureKeyRef.current) {
        rosterStructureKeyRef.current = nextKey;
        setServerPlayers(roster);
      }
      flushPendingRemoteSpeech(roster);
    }

    function handleChatMessage(msg: ChatMessageDTO) {
      queryClient.setQueryData<ChatMessageDTO[]>(queryKeys.rooms.messages(roomId), (prev) => {
        const list = prev ?? [];
        if (list.some((existing) => existing.id === msg.id)) return list;
        return [...list, msg];
      });

      if (msg.user_id === selfUserIdRef.current) {
        const localSocketId = sock.id ?? syncRef.current.localId;
        if (localSocketId) scheduleRemoteBubble(localSocketId, msg.content);
        return;
      }

      if (isRoomChatNpcUserId(msg.user_id, roomId)) {
        syncRef.current.showChatNpcSpeechBubble?.(msg.content);
        return;
      }

      const rosterAtEvent = serverPlayersRef.current;
      if (tryShowRemoteBubble(msg, rosterAtEvent)) return;

      pendingRemoteSpeechRef.current.set(msg.user_id, msg);
    }

    function handleRoomClock(payload: { serverNowMs?: number }) {
      const serverNowMs = payload?.serverNowMs;
      if (typeof serverNowMs !== 'number' || !Number.isFinite(serverNowMs)) return;
      syncRef.current.serverClockOffsetMs = serverNowMs - Date.now();
    }

    sock.on('connect', () => {
      setSocketId(sock.id ?? null);
      sock.emit('player:join', {
        x: spawnPx.x,
        y: spawnPx.y,
      });
      const sid = sock.id ?? null;
      const merged = withGhostPlayerIfNeeded(serverPlayersRef.current, sid, spawnPx, username, claims, avatarId);
      syncRef.current.players = merged;
      playerListStore.publish(merged.map((p) => ({ ...p })));
    });

    sock.on('players:update', handlePlayers);
    sock.on('chat:message', handleChatMessage);
    sock.on('room:clock', handleRoomClock);

    return () => {
      pendingForCleanup.clear();
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
      setSocketId(null);
    };
  }, [avatarId, claims, playerListStore, roomId, spawnPx, token, username]);

  const handlePositionSync = useCallback(
    (pos: { x: number; y: number }) => {
      const sock = socketRef.current;
      if (!sock?.connected) return;
      sock.emit('player:move', pos);
      const sid = sock.id ?? null;
      if (!sid) return;
      const { spawnPx: sp, username: un, claims: cl, avatarId: aid } = listDepsRef.current;
      const server = serverPlayersRef.current;
      let merged = withGhostPlayerIfNeeded(server, sid, sp, un, cl, aid);
      merged = merged.map((p) => (p.id === sid ? { ...p, x: pos.x, y: pos.y } : p));
      playerListStore.publish(merged.map((p) => ({ ...p })));
    },
    [playerListStore],
  );

  /** Roster for layer rebuilds / UI; live positions for the canvas come from {@link syncRef}. */
  const displayPlayers = useMemo(
    () =>
      withGhostPlayerIfNeeded(
        serverPlayers.map((p) => ({ ...p })),
        socketId,
        spawnPx,
        username,
        claims,
        avatarId,
      ),
    [avatarId, claims, serverPlayers, socketId, spawnPx, username],
  );

  const effectiveLocalId = resolveLocalPlayerId(socketId, claims);

  useLayoutEffect(() => {
    syncRef.current.localId = effectiveLocalId;
    syncRef.current.players = displayPlayers.map((player) => ({ ...player }));
    playerListStore.publish(displayPlayers.map((player) => ({ ...player })));
  }, [displayPlayers, effectiveLocalId, playerListStore]);

  const roomUsernamesLower = useMemo(() => {
    const names = new Set(displayPlayers.map((player) => usernameForMentionMatch(player.username)).filter(Boolean));
    const chatNpc = getRoomChatNpc(roomId);
    if (chatNpc) names.add(usernameForMentionMatch(chatNpc.username));
    return names;
  }, [displayPlayers, roomId]);

  useEffect(() => {
    const chatNpc = getRoomChatNpc(roomId);
    const sync = syncRef.current;
    sync.onChatNpcTap = () => {
      if (!chatNpc) return;
      setComposerSeed({ key: Date.now(), text: `@${chatNpc.username} ` });
    };
    return () => {
      sync.onChatNpcTap = undefined;
    };
  }, [roomId]);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.emit('chat:send', { content: text });
  }, []);

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Enter' || keyEvent.repeat) return;
      if (keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey) return;
      // keyEvent.target is the focus at dispatch time — covers the case where the chat input
      // handler already blurred itself in response to the same Enter event.
      if (isTypingTarget(keyEvent.target) || isTypingTarget(document.activeElement)) return;
      const input = chatComposerRef.current ?? document.querySelector<HTMLInputElement>('[data-chat-composer]');
      if (!input) return;
      keyEvent.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={roomStyles.page}>
      <div className={roomStyles.shell}>
        <div className={roomStyles.stage}>
          <div ref={roomStackRef} className={roomStyles.gameStack} style={{ maxHeight: roomPanelMaxHeightPx }}>
            <div className={`${layout.track} ${roomStyles.switcherBar} room-switcher-bar`}>
              <nav className={roomStyles.switcher} aria-label="Switch room">
                {ROOM_IDS.map((id) => (
                  <Link
                    key={id}
                    to={`/room/${id}`}
                    className={`${roomStyles.switcherBtn}${id === roomId ? ` ${roomStyles.switcherBtnActive}` : ''}`}
                    aria-current={id === roomId ? 'page' : undefined}
                  >
                    Room {id}
                  </Link>
                ))}
              </nav>
            </div>
            <div className={roomStyles.panel}>
              <div
                className={`${roomStyles.mountHost} pixi-mount-host`}
                style={{
                  position: 'relative',
                  height: canvasViewBox.height,
                }}
                aria-busy={showRoomCanvasLoader}
                aria-label="Room canvas"
              >
                <Suspense fallback={null}>
                  <LazyPixiRoomCanvas
                    syncRef={syncRef}
                    tileSize={ROOM_TILE_SIZE}
                    viewHeightPx={roomViewHeightPx}
                    worldCols={ROOM_WORLD_COLS}
                    worldRows={ROOM_WORLD_ROWS}
                    worldSpawnPx={spawnPx}
                    players={displayPlayers}
                    localId={effectiveLocalId}
                    roomId={roomId}
                    keysDisabled={typingFocus}
                    onPositionSync={handlePositionSync}
                    onCanvasReady={handlePixiCanvasReady}
                  />
                </Suspense>
                {showRoomCanvasLoader && (
                  <div className={roomStyles.bootstrapOverlay}>
                    <CanvasLoadingFallback overlay />
                  </div>
                )}
                {pixiCanvasReady && <RoomMinimap syncRef={syncRef} active={pixiCanvasReady} />}
                <ChatBox
                  variant="canvasHud"
                  messages={messages}
                  viewerUsername={username}
                  roomUsernamesLower={roomUsernamesLower}
                  onSend={sendChat}
                  onTypingChange={setTypingFocus}
                  composerRef={chatComposerRef}
                  composerSeed={composerSeed}
                />
              </div>
              {showPlayerList && (
                <div className={roomStyles.playerListScroll} aria-label="Players in room">
                  <RoomPlayerList store={playerListStore} className={roomStyles.playerListInScroll} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
