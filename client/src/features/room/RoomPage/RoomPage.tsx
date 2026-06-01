import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/authContext.tsx';
import { LoadingIndicatorFallback } from '@/components/LoadingIndicatorFallback/LoadingIndicatorFallback.tsx';
import { RoomMinimap } from '@/components/RoomMinimap/RoomMinimap.tsx';
import { RoomSwitcher } from '@/components/RoomSwitcher/RoomSwitcher.tsx';
import {
  roomCanvasViewLayout,
  ROOM_TILE_SIZE,
  ROOM_VIEW_HEIGHT_PX,
  ROOM_WORLD_COLS,
  ROOM_WORLD_ROWS,
} from '@/utils/canvasLoaderLayout.ts';
import { useRoomPanelLayout } from '@/utils/useRoomScrollArea.ts';
import { useIsTouchDevice } from '@/utils/useIsTouchDevice.ts';
import { ChatBox } from '@/components/ChatBox/ChatBox.tsx';
import { RoomPlayerList } from '@/components/RoomPlayerList/RoomPlayerList.tsx';
import { importWithChunkRetry } from '@/utils/chunkLoadError.ts';
import { useRoomRealtime } from '../useRoomRealtime.ts';
import { useRoomChatComposer } from '../useRoomChatComposer.ts';
import roomStyles from './RoomPage.css';

const LazyPixiRoomCanvas = lazy(() =>
  importWithChunkRetry(() => import('@/components/PixiCanvas/PixiCanvas.tsx').then((m) => ({ default: m.PixiCanvas }))),
);

export function RoomPage({ roomId }: { roomId: number }) {
  const { username } = useAuth();
  const realtime = useRoomRealtime(roomId);
  const isTouchDevice = useIsTouchDevice();
  const roomStackRef = useRef<HTMLDivElement>(null);
  const [typingFocus, setTypingFocus] = useState(false);

  const {
    stackMaxHeightPx: roomPanelMaxHeightPx,
    viewHeightPx: roomViewHeightPx,
    showPlayerList,
  } = useRoomPanelLayout(roomStackRef, ROOM_VIEW_HEIGHT_PX, typingFocus);

  const chat = useRoomChatComposer({
    roomId,
    syncRef: realtime.syncRef,
    isTouchDevice,
    roomViewHeightPx,
    typingFocus,
    setTypingFocus,
  });

  const [pixiCanvasReady, setPixiCanvasReady] = useState(false);
  const handlePixiCanvasReady = useCallback((ready: boolean) => {
    setPixiCanvasReady(ready);
  }, []);

  const canvasViewBox = useMemo(() => roomCanvasViewLayout(roomViewHeightPx), [roomViewHeightPx]);

  /** Chunk load is covered by Suspense (`lazy`); WebGL bootstrap uses `pixiCanvasReady`. One overlay until both complete. */
  const showRoomCanvasLoader = !pixiCanvasReady;

  return (
    <div className={roomStyles.page}>
      <div className={roomStyles.shell}>
        <div className={roomStyles.stage}>
          <div ref={roomStackRef} className={roomStyles.gameStack} style={{ maxHeight: roomPanelMaxHeightPx }}>
            <RoomSwitcher roomId={roomId} />
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
                    syncRef={realtime.syncRef}
                    tileSize={ROOM_TILE_SIZE}
                    viewHeightPx={roomViewHeightPx}
                    worldCols={ROOM_WORLD_COLS}
                    worldRows={ROOM_WORLD_ROWS}
                    worldSpawnPx={realtime.spawnPx}
                    players={realtime.displayPlayers}
                    localId={realtime.effectiveLocalId}
                    roomId={roomId}
                    keysDisabled={typingFocus}
                    onPositionSync={realtime.handlePositionSync}
                    onCanvasReady={handlePixiCanvasReady}
                  />
                </Suspense>
                {showRoomCanvasLoader && (
                  <div className={roomStyles.bootstrapOverlay}>
                    <LoadingIndicatorFallback overlay />
                  </div>
                )}
                {pixiCanvasReady && <RoomMinimap syncRef={realtime.syncRef} active={pixiCanvasReady} />}
                <ChatBox
                  variant="canvasHud"
                  messages={realtime.messages}
                  viewerUsername={username}
                  roomUsernamesLower={realtime.roomUsernamesLower}
                  onSend={realtime.sendChat}
                  onTypingChange={setTypingFocus}
                  composerRef={chat.chatComposerRef}
                  composerSeed={chat.composerSeed}
                />
              </div>
              {showPlayerList && (
                <div className={roomStyles.playerListScroll} aria-label="Players in room">
                  <RoomPlayerList store={realtime.playerListStore} className={roomStyles.playerListInScroll} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
