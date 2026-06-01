import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useAuth } from '@/app/authContext.tsx';
import { useAvatar } from '@/app/avatarContext.tsx';
import { createInitialSyncState, type RoomCanvasSyncState } from '../../game/core/syncState.ts';
import { getRoomChatNpc, isRoomChatNpcUserId } from '../../game/config/chatNpc.ts';
import { queryKeys } from '@/query/keys.ts';
import { queryClient } from '@/query/queryClient.ts';
import { useRoomMessagesQuery } from '@/query/hooks.ts';
import { createRoomSocket } from '@/services/socket.ts';
import type { ChatMessageDTO } from '@/services/messagesApi.ts';
import type { PlayerDTO } from '@/types.ts';
import { decodeJwtPayload } from '@/utils/jwt.ts';
import { createPlayerListPositionStore, type PlayerListPositionStore } from '@/utils/playerListPositionStore.ts';
import { usernameForMentionMatch } from '@/utils/usernameForMentions.ts';
import type { Socket } from 'socket.io-client';
import { jitterAroundWorldSpawn } from './roomSpawn.ts';
import { resolveLocalPlayerId, rosterStructureKey, withGhostPlayerIfNeeded } from './roomPlayerRoster.ts';

const EMPTY_ROOM_MESSAGES: ChatMessageDTO[] = [];

export type UseRoomRealtimeResult = {
  syncRef: RefObject<RoomCanvasSyncState>;
  playerListStore: PlayerListPositionStore & { publish: (players: PlayerDTO[]) => void };
  messages: ChatMessageDTO[];
  spawnPx: { x: number; y: number };
  displayPlayers: PlayerDTO[];
  effectiveLocalId: string;
  roomUsernamesLower: Set<string>;
  handlePositionSync: (pos: { x: number; y: number }) => void;
  sendChat: (text: string) => void;
};

export function useRoomRealtime(roomId: number): UseRoomRealtimeResult {
  const { token, username } = useAuth();
  const { avatarId } = useAvatar();
  const messagesQuery = useRoomMessagesQuery(roomId, token);
  const messages = messagesQuery.data ?? EMPTY_ROOM_MESSAGES;

  const socketRef = useRef<Socket | null>(null);

  const [socketId, setSocketId] = useState<string | null>(null);
  const [serverPlayers, setServerPlayers] = useState<PlayerDTO[]>([]);
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

  const sendChat = useCallback((text: string) => {
    socketRef.current?.emit('chat:send', { content: text });
  }, []);

  return {
    syncRef,
    playerListStore,
    messages,
    spawnPx,
    displayPlayers,
    effectiveLocalId,
    roomUsernamesLower,
    handlePositionSync,
    sendChat,
  };
}
