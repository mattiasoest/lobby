import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { getRoomChatNpc } from '../../game/config/chatNpc.ts';
import type { RoomCanvasSyncState } from '../../game/core/syncState.ts';
import { isTypingTarget } from '../../game/config/keyboard.ts';

export type UseRoomChatComposerArgs = {
  roomId: number;
  syncRef: RefObject<RoomCanvasSyncState>;
  isTouchDevice: boolean;
  roomViewHeightPx: number;
  typingFocus: boolean;
  setTypingFocus: (v: boolean) => void;
};

export type UseRoomChatComposerResult = {
  composerSeed: { key: number; text: string } | undefined;
  chatComposerRef: RefObject<HTMLInputElement | null>;
};

export function useRoomChatComposer({
  roomId,
  syncRef,
  isTouchDevice,
  roomViewHeightPx,
  typingFocus,
  setTypingFocus,
}: UseRoomChatComposerArgs): UseRoomChatComposerResult {
  const [composerSeed, setComposerSeed] = useState<{ key: number; text: string } | undefined>();
  const chatComposerRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!typingFocus || !isTouchDevice) return;
    const input = chatComposerRef.current;
    if (!input || document.activeElement !== input) return;
    input.focus({ preventScroll: true });
  }, [isTouchDevice, roomViewHeightPx, typingFocus]);

  useEffect(() => {
    const chatNpc = getRoomChatNpc(roomId);
    const sync = syncRef.current;
    sync.onChatNpcTap = () => {
      if (!chatNpc) return;
      const text = `@${chatNpc.username} `;
      flushSync(() => {
        setTypingFocus(true);
        setComposerSeed({ key: Date.now(), text });
      });
      const input = chatComposerRef.current;
      if (input) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(text.length, text.length);
      }
    };
    return () => {
      sync.onChatNpcTap = undefined;
    };
  }, [roomId, setTypingFocus, syncRef]);

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

  return {
    composerSeed,
    chatComposerRef,
  };
}
