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

  /** Throttled sidebar position (~30 Hz from canvas) */
  const [localListPos, setLocalListPos] = useState(worldSpawnPx);

  const claims = decodeJwtPayload(token);

  useEffect(() => {
    setLocalListPos(worldSpawnPx());
    setServerPlayers([]);
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
      socketId && p.id === socketId ? { ...p, x: localListPos.x, y: localListPos.y } : p
    );

    const ghostUserId =
      typeof claims?.sub === 'string' && claims.sub.length ? claims.sub : socketId ?? 'local';

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
  }, [claims?.sub, claims?.username, localListPos.x, localListPos.y, serverPlayers, socketId, username]);

  const spawnPx = useMemo(() => worldSpawnPx(), []);

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
            viewCols={VIEW_COLS}
            viewRows={VIEW_ROWS}
            worldCols={WORLD_COLS}
            worldRows={WORLD_ROWS}
            worldSpawnPx={spawnPx}
            players={displayPlayers}
            localId={socketId}
            roomId={roomId}
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
