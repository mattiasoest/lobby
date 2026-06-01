import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useState,
} from 'react';
import { chatContentWithMentionHighlights } from './chatMentionParts';
import type { ChatMessageDTO } from '@/services/messagesApi.ts';
import styles from './ChatBox.css';

/** Pixels from the bottom below which we treat the feed as "following" new messages. */
const PINNED_BOTTOM_PX = 64;

function isPinnedToBottom(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= PINNED_BOTTOM_PX;
}

export function ChatBox({
  messages,
  viewerUsername,
  roomUsernamesLower,
  onSend,
  onTypingChange,
  composerRef,
  composerSeed,
  variant = 'default',
}: {
  messages: ChatMessageDTO[];
  /** When set, incoming @mentions targeting this name may be highlighted (you are the receiver). */
  viewerUsername?: string | null;
  /** Normalized keys from `PlayerDTO.username` ({@link usernameForMentionMatch}: lowercased, no whitespace). */
  roomUsernamesLower: ReadonlySet<string>;
  onSend: (text: string) => void;
  /** Disables Pixi WASD/arrows while the composer is focused */
  onTypingChange?: (typing: boolean) => void;
  composerRef?: RefObject<HTMLInputElement | null>;
  /** When `key` changes, focus the composer and set its value (e.g. NPC tap). */
  composerSeed?: { key: number; text: string };
  variant?: 'default' | 'canvasHud';
}) {
  const [text, setText] = useState('');
  const [prevComposerSeedKey, setPrevComposerSeedKey] = useState<number | undefined>();

  if (composerSeed && composerSeed.key !== prevComposerSeedKey) {
    setPrevComposerSeedKey(composerSeed.key);
    setText(composerSeed.text);
  }

  const ordered = useMemo(
    () => [...messages].sort((first, second) => Date.parse(first.created_at) - Date.parse(second.created_at)),
    [messages],
  );

  const feedRef = useRef<HTMLDivElement>(null);
  /** When true, new messages snap the scroll position to the latest line. */
  const followLatestRef = useRef(true);

  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    followLatestRef.current = isPinnedToBottom(el);
  }, []);

  const jumpToLatest = useCallback(() => {
    followLatestRef.current = true;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const el = feedRef.current;
    if (!el || !followLatestRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [ordered]);

  useLayoutEffect(() => {
    if (!composerSeed) return;
    const input = composerRef?.current;
    if (input) {
      input.focus();
      const len = composerSeed.text.length;
      input.setSelectionRange(len, len);
    }
  }, [composerRef, composerSeed]);

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = text.trim();
      if (trimmed) {
        jumpToLatest();
        onSend(trimmed);
        setText('');
      }
    },
    [jumpToLatest, onSend, text],
  );

  const onComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
      event.preventDefault();
      const trimmed = text.trim();
      if (trimmed) {
        jumpToLatest();
        onSend(trimmed);
        setText('');
      }
      event.currentTarget.blur();
    },
    [jumpToLatest, onSend, text],
  );

  const rootClass = variant === 'canvasHud' ? styles.canvasHud : styles.root;

  return (
    <div className={rootClass} role="region" aria-label="Chat">
      <div ref={feedRef} className={styles.feed} aria-live="polite" onScroll={onFeedScroll}>
        {ordered.map((message) => (
          <div key={message.id} className={styles.line}>
            <span className={styles.user}>{message.username}</span>{' '}
            <span className={styles.content}>
              {chatContentWithMentionHighlights(message, viewerUsername, roomUsernamesLower)}
            </span>
          </div>
        ))}
      </div>
      <form className={styles.compose} onSubmit={submit}>
        <input
          ref={composerRef}
          data-chat-composer=""
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={onComposerKeyDown}
          onFocus={() => onTypingChange?.(true)}
          onBlur={() => onTypingChange?.(false)}
          placeholder="Message"
          aria-label="Message"
          autoComplete="off"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
