import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { decodeJwtPayload } from '../../app/store.ts';
import { useAuth } from '../../app/authContext.tsx';
import { PixiCanvas } from '../../components/Canvas/PixiCanvas.tsx';
import { ChatBox } from '../../components/Chat/ChatBox.tsx';
import { PlayerList } from '../../components/UI/PlayerList.tsx';
import { queryKeys } from '../../query/keys.ts';
import { queryClient } from '../../query/queryClient.ts';
import { useRoomMessagesQuery } from '../../query/hooks.ts';
import { createRoomSocket } from '../../services/socket.ts';
import type { ChatMessageDTO, PlayerDTO } from '../../types.ts';
import type { Socket } from 'socket.io-client';

const TILE = 32;
const VIEW_COLS = 24;
const VIEW_ROWS = 16;
const WORLD_COLS = 48;
const WORLD_ROWS = 32;

function worldSpawnPx() {
  const pad = TILE * 0.14;
  const size = TILE - pad * 2;
  const w = WORLD_COLS * TILE;
  const h = WORLD_ROWS * TILE;
  return { x: w / 2 - size / 2, y: h / 2 - size / 2 };
}

export function RoomPage({ roomId }: { roomId: number }) {
  const { token, username } = useAuth();
  const messagesQuery = useRoomMessagesQuery(roomId, token);
  const messages = messagesQuery.data ?? [];

  const socketRef = useRef<Socket | null>(null);

  const [socketId, setSocketId] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [serverPlayers, setServerPlayers] = useState<PlayerDTO[]>([]);
  const [typingFocus, setTypingFocus] = useState(false);
  /** Text shown above the local avatar after sending chat; cleared after a delay */
  const [localSpeechBubble, setLocalSpeechBubble] = useState<string | null>(null);
  const speechHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [remoteSpeechBubbles, setRemoteSpeechBubbles] = useState<Map<string, string>>(() => new Map());
  const remoteSpeechTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const serverPlayersRef = useRef<PlayerDTO[]>([]);
  const selfUserIdRef = useRef<string>('');
  /** Messages from others before roster lists their socket id yet (latest per user id) */
  const pendingRemoteSpeechRef = useRef<Map<string, ChatMessageDTO>>(new Map());
  /** Throttled sidebar position (~30 Hz from canvas) */
  const [localListPos, setLocalListPos] = useState(worldSpawnPx);

  const claims = useMemo(() => decodeJwtPayload(token), [token]);

  useLayoutEffect(() => {
    serverPlayersRef.current = serverPlayers;
    selfUserIdRef.current = typeof claims?.sub === 'string' ? claims.sub : '';
  }, [serverPlayers, claims]);

  useEffect(() => {
    if (!token) return;

    const timersForCleanup = remoteSpeechTimersRef.current;
    const pendingForCleanup = pendingRemoteSpeechRef.current;

    const sock = createRoomSocket({ roomId, token });
    socketRef.current = sock;

    function scheduleRemoteBubble(senderSocketId: string, content: string) {
      setRemoteSpeechBubbles((prev) => {
        const next = new Map(prev);
        next.set(senderSocketId, content);
        return next;
      });

      const timers = remoteSpeechTimersRef.current;
      const prevTimer = timers.get(senderSocketId);
      if (prevTimer) clearTimeout(prevTimer);
      const timerId = window.setTimeout(() => {
        setRemoteSpeechBubbles((prev) => {
          const next = new Map(prev);
          next.delete(senderSocketId);
          return next;
        });
        timers.delete(senderSocketId);
      }, 4000);
      timers.set(senderSocketId, timerId);
    }

    /** @returns Whether the bubble was shown (sender on roster). */
    function tryShowRemoteBubble(msg: ChatMessageDTO, roster: PlayerDTO[]): boolean {
      const sender = roster.find((p) => p.userId === msg.user_id);
      if (!sender) return false;
      scheduleRemoteBubble(sender.id, msg.content);
      return true;
    }

    function flushPendingRemoteSpeech(roster: PlayerDTO[]) {
      const pend = pendingRemoteSpeechRef.current;
      for (const [uid, m] of [...pend.entries()]) {
        if (tryShowRemoteBubble(m, roster)) pend.delete(uid);
      }
    }

    function handlePlayers(payload: PlayerDTO[]) {
      serverPlayersRef.current = payload;
      setServerPlayers(payload);
      flushPendingRemoteSpeech(payload);
    }

    function handleChatMessage(msg: ChatMessageDTO) {
      queryClient.setQueryData<ChatMessageDTO[]>(queryKeys.rooms.messages(roomId), (prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === msg.id)) return list;
        return [...list, msg];
      });

      if (msg.user_id === selfUserIdRef.current) return;

      const rosterAtEvent = serverPlayersRef.current;
      if (tryShowRemoteBubble(msg, rosterAtEvent)) return;

      pendingRemoteSpeechRef.current.set(msg.user_id, msg);
    }

    sock.on('connect', () => {
      setSocketConnected(true);
      setSocketId(sock.id ?? null);
      const spawn = worldSpawnPx();
      sock.emit('player:join', { x: spawn.x, y: spawn.y });
    });

    sock.on('disconnect', () => {
      setSocketConnected(false);
    });

    sock.on('connect_error', () => {
      setSocketConnected(sock.connected);
    });

    sock.on('players:update', handlePlayers);
    sock.on('chat:message', handleChatMessage);

    return () => {
      for (const t of timersForCleanup.values()) clearTimeout(t);
      timersForCleanup.clear();
      pendingForCleanup.clear();
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      setSocketId(null);
    };
  }, [roomId, token]);

  const handlePositionSync = useCallback((pos: { x: number; y: number }) => {
    setLocalListPos(pos);
    const sock = socketRef.current;
    if (!sock?.connected) return;
    sock.emit('player:move', pos);
  }, []);

  const displayPlayers = useMemo(() => {
    const overridden = serverPlayers.map((p) =>
      socketId && p.id === socketId ? { ...p, x: localListPos.x, y: localListPos.y } : p,
    );

    const ghostUserId = typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : (socketId ?? 'local');

    if (socketId && !overridden.some((p) => p.id === socketId)) {
      overridden.push({
        id: socketId,
        username: username ?? claims?.username ?? 'You',
        x: localListPos.x,
        y: localListPos.y,
        userId: ghostUserId,
      });
    }

    return overridden;
  }, [claims, localListPos.x, localListPos.y, serverPlayers, socketId, username]);

  const spawnPx = useMemo(() => worldSpawnPx(), []);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.emit('chat:send', { content: text });
    if (speechHideTimerRef.current) {
      clearTimeout(speechHideTimerRef.current);
    }
    setLocalSpeechBubble(text);
    speechHideTimerRef.current = setTimeout(() => {
      setLocalSpeechBubble(null);
      speechHideTimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(
    () => () => {
      if (speechHideTimerRef.current) clearTimeout(speechHideTimerRef.current);
    },
    [],
  );

  return (
    <div className="room-page">
      <header className="room-header">
        <h2>Room {roomId}</h2>
        <p className="muted">
          {socketConnected ? 'Connected' : 'Connecting…'} {socketId ? `· Socket ${socketId.slice(0, 6)}` : ''}
        </p>
      </header>

      <div className="room-shell">
        <div className="room-stage">
          <PixiCanvas
            tileSize={TILE}
            viewCols={VIEW_COLS}
            viewRows={VIEW_ROWS}
            worldCols={WORLD_COLS}
            worldRows={WORLD_ROWS}
            worldSpawnPx={spawnPx}
            players={displayPlayers}
            localId={socketId}
            roomId={roomId}
            localSpeechBubble={localSpeechBubble}
            remoteSpeechBubbles={remoteSpeechBubbles}
            keysDisabled={typingFocus}
            onPositionSync={handlePositionSync}
          />
          <PlayerList players={displayPlayers} />
        </div>
        <ChatBox messages={messages} onSend={sendChat} onTypingChange={setTypingFocus} />
      </div>
    </div>
  );
}
