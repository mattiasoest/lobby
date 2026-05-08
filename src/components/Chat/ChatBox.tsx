import {
  useCallback,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useMemo,
  useState,
} from 'react';
import type { ChatMessageDTO } from '../../types.ts';

export function ChatBox({
  messages,
  onSend,
  onTypingChange,
  composerRef,
}: {
  messages: ChatMessageDTO[];
  onSend: (text: string) => void;
  /** Disables Pixi WASD/arrows while the composer is focused */
  onTypingChange?: (typing: boolean) => void;
  composerRef?: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');

  const ordered = useMemo(
    () => [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    [messages],
  );

  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed) {
        onSend(trimmed);
        setText('');
      }
    },
    [onSend, text],
  );

  const onComposerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed) {
        onSend(trimmed);
        setText('');
      }
      e.currentTarget.blur();
    },
    [onSend, text],
  );

  return (
    <div className="chat">
      <h3 className="chat-title">Chat</h3>
      <div className="chat-feed" aria-live="polite">
        {ordered.map((m) => (
          <div key={m.id} className="chat-line">
            <span className="chat-user">{m.username}</span> <span className="chat-content">{m.content}</span>
          </div>
        ))}
      </div>
      <form className="chat-compose" onSubmit={submit}>
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
