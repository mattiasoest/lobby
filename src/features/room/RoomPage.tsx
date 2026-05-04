import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const COLS = 24;
const ROWS = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function RoomPage({ roomId }: { roomId: number }) {
  const { token, username } = useAuth();
  const messagesQuery = useRoomMessagesQuery(roomId, token);
  const messages = messagesQuery.data ?? [];

  const socketRef = useRef<Socket | null>(null);
  const localRef = useRef({ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) });
  const lastSent = useRef<{ x: number; y: number } | null>(null);

  const [socketId, setSocketId] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [serverPlayers, setServerPlayers] = useState<PlayerDTO[]>([]);
  const [typingFocus, setTypingFocus] = useState(false);

  const claims = decodeJwtPayload(token);

  const [localPos, setLocalPos] = useState(localRef.current);
  useEffect(() => {
    localRef.current = localPos;
  }, [localPos]);

  useEffect(() => {
    localRef.current = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
    setLocalPos(localRef.current);
    setServerPlayers([]);
    lastSent.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!token) return;

    const sock = createRoomSocket({ roomId, token });
    socketRef.current = sock;

    function handlePlayers(payload: PlayerDTO[]) {
      setServerPlayers(payload);
    }

    function handleChatMessage(msg: ChatMessageDTO) {
      queryClient.setQueryData<ChatMessageDTO[]>(queryKeys.rooms.messages(roomId), (prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === msg.id)) return list;
        return [...list, msg];
      });
    }

    sock.on('connect', () => {
      setSocketConnected(true);
      setSocketId(sock.id ?? null);
      sock.emit('player:join', { ...localRef.current });
    });

    sock.on('disconnect', () => {
      setSocketConnected(false);
      lastSent.current = null;
    });

    sock.on('connect_error', () => {
      setSocketConnected(sock.connected);
    });

    sock.on('players:update', handlePlayers);
    sock.on('chat:message', handleChatMessage);

    return () => {
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      setSocketId(null);
      lastSent.current = null;
    };
  }, [roomId, token]);

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock?.connected) return;

    const last = lastSent.current;
    if (last?.x === localPos.x && last?.y === localPos.y) return;

    lastSent.current = { x: localPos.x, y: localPos.y };
    sock.emit('player:move', { x: localPos.x, y: localPos.y });
  }, [localPos, socketConnected]);

  const attemptMove = useCallback((dx: number, dy: number) => {
    setLocalPos((prev) => {
      const next = {
        x: clamp(prev.x + dx, 0, COLS - 1),
        y: clamp(prev.y + dy, 0, ROWS - 1),
      };

      if (next.x === prev.x && next.y === prev.y) return prev;

      localRef.current = next;
      return next;
    });
  }, []);

  const displayPlayers = useMemo(() => {
    const overridden = serverPlayers.map((p) =>
      socketId && p.id === socketId ? { ...p, x: localPos.x, y: localPos.y } : p
    );

    const ghostUserId =
      typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : socketId ?? 'local';

    if (socketId && !overridden.some((p) => p.id === socketId)) {
      overridden.push({
        id: socketId,
        username: username ?? claims?.username ?? 'You',
        x: localPos.x,
        y: localPos.y,
        userId: ghostUserId,
      });
    }

    return overridden;
  }, [claims?.sub, claims?.username, localPos.x, localPos.y, serverPlayers, socketId, username]);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.emit('chat:send', { content: text });
  }, []);

  return (
    <div className="room-page">
      <header className="room-header">
        <h2>Room {roomId}</h2>
        <p className="muted">
          {socketConnected ? 'Connected' : 'Connecting…'}{' '}
          {socketId ? `· Socket ${socketId.slice(0, 6)}` : ''}
        </p>
      </header>

      <div className="room-shell">
        <div className="room-stage">
          <PixiCanvas
            tileSize={TILE}
            cols={COLS}
            rows={ROWS}
            players={displayPlayers}
            localId={socketId}
            keysDisabled={typingFocus}
            onMoveIntent={attemptMove}
          />
          <PlayerList players={displayPlayers} />
        </div>
        <ChatBox messages={messages} onSend={sendChat} onTypingChange={setTypingFocus} />
      </div>
    </div>
  );
}
