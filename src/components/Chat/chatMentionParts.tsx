import type { ReactNode } from 'react';
import type { ChatMessageDTO } from '../../types.ts';

const MENTION = /@([A-Za-z0-9_.-]{1,64})/g;

/** Parses `content`, wrapping @mentions that target the viewer (from another chatter, name on roster). */
export function chatContentWithMentionHighlights(
  message: ChatMessageDTO,
  viewerUsername: string | null | undefined,
  roomUsernamesLower: ReadonlySet<string>,
): ReactNode[] {
  const viewer = typeof viewerUsername === 'string' ? viewerUsername.trim().toLowerCase() : '';
  const sender = message.username.trim().toLowerCase();
  const content = message.content;
  const out: ReactNode[] = [];

  let last = 0;
  for (const m of content.matchAll(MENTION)) {
    const index = m.index ?? 0;
    const mentionText = m[0];
    const bare = (m[1] ?? '').toLowerCase();

    if (index > last) {
      out.push(<span key={`${message.id}-t-${out.length}`}>{content.slice(last, index)}</span>);
    }

    const fromSomeoneElse = sender.length > 0 && viewer.length > 0 && sender !== viewer;
    const addressesViewer = bare === viewer;
    const rosterOk = roomUsernamesLower.size === 0 || roomUsernamesLower.has(bare);

    const highlight = fromSomeoneElse && addressesViewer && rosterOk;

    out.push(
      <span key={`${message.id}-m-${out.length}`} className={highlight ? 'chat-mention-highlight' : undefined}>
        {mentionText}
      </span>,
    );

    last = index + mentionText.length;
  }

  if (last < content.length) {
    out.push(<span key={`${message.id}-t-${out.length}`}>{content.slice(last)}</span>);
  }

  return out.length > 0 ? out : [<span key={`${message.id}-whole`}>{content}</span>];
}
