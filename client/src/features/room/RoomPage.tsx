import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROOM_IDS } from '../../app/constants.ts';
import { decodeJwtPayload } from '../../app/store.ts';
import { useAuth } from '../../app/authContext.tsx';
import { CanvasLoadingFallback } from '../../components/Canvas/CanvasLoadingFallback.tsx';
import { RoomMinimap } from '../../components/Canvas/RoomMinimap.tsx';
import {
  canvasViewPixels,
  ROOM_TILE_SIZE,
  ROOM_VIEW_COLS,
  ROOM_VIEW_ROWS,
  ROOM_WORLD_COLS,
  ROOM_WORLD_ROWS,
} from '../../components/Canvas/canvasLoaderLayout.ts';
import { useRoomPanelLayout } from '../../utils/useRoomScrollArea.ts';
import { useGameFrameWidth } from '../../utils/useGameFrameWidth.ts';
import { ChatBox } from '../../components/Chat/ChatBox.tsx';
import { RoomPlayerList } from '../../components/UI/RoomPlayerList.tsx';
import { createPlayerListPositionStore } from '../../components/UI/playerListPositionStore.ts';
import { queryKeys } from '../../query/keys.ts';
import { queryClient } from '../../query/queryClient.ts';
import { useRoomMessagesQuery } from '../../query/hooks.ts';
import { isTypingTarget } from '../../game/room/keyboard.ts';
import { useAvatar } from '../../app/avatarContext.tsx';
import { createRoomSocket } from '../../services/socket.ts';
import { createInitialSyncState, type RoomCanvasSyncState } from '../../game/room/index.ts';
import type { ChatMessageDTO, PlayerDTO } from '../../types.ts';
import { usernameForMentionMatch } from '../../utils/usernameForMentions.ts';
import type { Socket } from 'socket.io-client';

const LazyPixiRoomCanvas = lazy(() =>
  import('../../components/Canvas/PixiCanvas.tsx').then((m) => ({ default: m.PixiCanvas })),
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

/** Until the server echoes our socket id, the ticker still needs a local row (see {@link syncRef}). */
function withGhostPlayerIfNeeded(
  server: PlayerDTO[],
  socketId: string | null,
  spawnPx: { x: number; y: number },
  username: string | null | undefined,
  claims: ReturnType<typeof decodeJwtPayload>,
  avatarId: string,
): PlayerDTO[] {
  if (!socketId || server.some((p) => p.id === socketId)) return server;
  const ghostUserId = typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : (socketId ?? 'local');
  return [
    ...server,
    {
      id: socketId,
      username: username ?? claims?.username ?? 'You',
      x: spawnPx.x,
      y: spawnPx.y,
      userId: ghostUserId,
      avatarId,
    },
  ];
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

  const spawnPx = useMemo(() => {
    // Spawn coordinates do not use room geometry (same WORLD_* everywhere). We still key this memo on
    // roomId so navigating to another room draws a fresh jittered spawn; to reuse one spawn for all
    // rooms, use [] and drop roomId from the callback. `void roomId` ties the callback to the dep so
    // eslint exhaustive-deps does not treat roomId as unused.
    void roomId;
    return jitterAroundWorldSpawn();
  }, [roomId]);

  useEffect(() => {
    rosterStructureKeyRef.current = '';
    syncRef.current.players = [];
    syncRef.current.minimapSnapshot = null;
    syncRef.current.serverClockOffsetMs = null;
    syncRef.current.clearSpeechBubbles?.();
    playerListStore.publish([]);
    queueMicrotask(() => {
      setServerPlayers([]);
    });
  }, [playerListStore, roomId]);

  const claims = useMemo(() => decodeJwtPayload(token), [token]);

  const roomStackRef = useRef<HTMLDivElement>(null);
  const {
    stackMaxHeightPx: roomPanelMaxHeightPx,
    viewRows: roomViewRows,
    showPlayerList,
  } = useRoomPanelLayout(roomStackRef, ROOM_TILE_SIZE, ROOM_VIEW_ROWS);

  const canvasViewBox = useMemo(() => canvasViewPixels(ROOM_TILE_SIZE, ROOM_VIEW_COLS, roomViewRows), [roomViewRows]);

  const [pixiCanvasReady, setPixiCanvasReady] = useState(false);

  useGameFrameWidth(pixiCanvasReady);

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

    function handlePlayers(payload: PlayerDTO[]) {
      serverPlayersRef.current = payload;
      const sid = sock.id ?? null;
      const merged = withGhostPlayerIfNeeded(payload, sid, spawnPx, username, claims, avatarId);
      syncRef.current.players = merged;
      playerListStore.publish(merged.map((p) => ({ ...p })));
      const nextKey = rosterStructureKey(payload);
      if (nextKey !== rosterStructureKeyRef.current) {
        rosterStructureKeyRef.current = nextKey;
        setServerPlayers(payload);
      }
      flushPendingRemoteSpeech(payload);
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
      if (sid) {
        const merged = withGhostPlayerIfNeeded(serverPlayersRef.current, sid, spawnPx, username, claims, avatarId);
        playerListStore.publish(merged.map((p) => ({ ...p })));
      }
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

  const roomUsernamesLower = useMemo(
    () => new Set(displayPlayers.map((player) => usernameForMentionMatch(player.username)).filter(Boolean)),
    [displayPlayers],
  );

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
    <div className="room-page">
      <div className="room-shell">
        <div className="room-stage">
          <div ref={roomStackRef} className="room-game-stack" style={{ maxHeight: roomPanelMaxHeightPx }}>
            <div className="room-switcher-bar">
              <nav className="room-switcher" aria-label="Switch room">
                {ROOM_IDS.map((id) => (
                  <Link
                    key={id}
                    to={`/room/${id}`}
                    className={`room-switcher-btn${id === roomId ? ' room-switcher-btn--active' : ''}`}
                    aria-current={id === roomId ? 'page' : undefined}
                  >
                    Room {id}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="room-panel">
              <div
                className="pixi-mount-host"
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
                    viewCols={ROOM_VIEW_COLS}
                    viewRows={roomViewRows}
                    worldCols={ROOM_WORLD_COLS}
                    worldRows={ROOM_WORLD_ROWS}
                    worldSpawnPx={spawnPx}
                    players={displayPlayers}
                    localId={socketId}
                    roomId={roomId}
                    keysDisabled={typingFocus}
                    onPositionSync={handlePositionSync}
                    onCanvasReady={handlePixiCanvasReady}
                  />
                </Suspense>
                {showRoomCanvasLoader && (
                  <div className="pixi-mount-bootstrap-overlay">
                    <CanvasLoadingFallback />
                  </div>
                )}
                {pixiCanvasReady && <RoomMinimap syncRef={syncRef} active={pixiCanvasReady} />}
                <ChatBox
                  className="chat--canvas-hud"
                  messages={messages}
                  viewerUsername={username}
                  roomUsernamesLower={roomUsernamesLower}
                  onSend={sendChat}
                  onTypingChange={setTypingFocus}
                  composerRef={chatComposerRef}
                />
              </div>
              {showPlayerList && (
                <div className="player-list-scroll" aria-label="Players in room">
                  <RoomPlayerList store={playerListStore} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
