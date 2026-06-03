import { CHAT_NPC_USER_IDS } from '../../../shared/chatNpcIds.js';
import { usernameForMentionMatch } from '../../../shared/mention.js';
import type { RoomId } from './rooms.js';
import { ROOM_IDS } from './rooms.js';

export { CHAT_NPC_USER_IDS, ROOM_IDS, usernameForMentionMatch };
export type { RoomId };

export const GROQ_MODEL_70B = 'llama-3.3-70b-versatile';
export const GROQ_MODEL_SCOUT = 'meta-llama/llama-4-scout-17b-16e-instruct';

export type RoomChatNpcConfig = {
  roomId: number;
  userId: string;
  username: string;
  systemPrompt: string;
  primaryModel: string;
  fallbackModel: string;
};

/** Canned replies when Groq or our API budget is exhausted (picked at random). */
export const CHAT_NPC_RATE_LIMIT_FALLBACK_MESSAGES = [
  'Go away! Im busy',
  'Slow down — one at a time!',
  "Too many chats at once. I'll be back soon.",
  'My brain is full right now.',
  'Hold on, catching my breath.',
  "Whoa, easy! I can't keep up.",
  "I'm all talked out for now.",
  "Let's pick this up in a minute.",
  'Stop talking at me for a second!',
  'Even I need a quiet moment sometimes.',
] as const;

export function pickRandomChatNpcFallbackMessage(): string {
  const pool = CHAT_NPC_RATE_LIMIT_FALLBACK_MESSAGES;
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
}

const ROOM_CHAT_NPC_CONFIGS: Record<RoomId, Omit<RoomChatNpcConfig, 'roomId'>> = {
  1: {
    userId: CHAT_NPC_USER_IDS[1],
    username: 'Grunk',
    systemPrompt: `You are Grunk, a goblin merchant running a stall in a cozy grassland area.
You speak in short, direct sentences (1-3 sentences max). You are a true salesman: always steering talk toward your wares, prices, and deals—smooth and professional, never rude. You're neither cheerful nor grouchy; you're purely business.
Stay in character; never mention being an AI or language model.`,
    primaryModel: GROQ_MODEL_70B,
    fallbackModel: GROQ_MODEL_SCOUT,
  },
  2: {
    userId: CHAT_NPC_USER_IDS[2],
    username: 'Snazz',
    systemPrompt: `You are Snazz, a cheerful goblin hanging out near a starfield base.
You speak in short, upbeat sentences (1-3 sentences max). You love the bright stars, the endless sky, and meeting travelers—always glad to chat and share a little wonder.
Stay in character; never mention being an AI or language model.`,
    primaryModel: GROQ_MODEL_SCOUT,
    fallbackModel: GROQ_MODEL_70B,
  },
  3: {
    userId: CHAT_NPC_USER_IDS[3],
    username: 'Slog',
    systemPrompt: `You are Slog, a grumpy goblin stuck in a hot dessert.
You speak in short, curt sentences (1-3 sentences max). You complain about hot weather, the sun, and thirst but you still grudgingly answer when pressed.
Stay in character; never mention being an AI or language model.`,
    primaryModel: GROQ_MODEL_70B,
    fallbackModel: GROQ_MODEL_SCOUT,
  },
  4: {
    userId: CHAT_NPC_USER_IDS[4],
    username: 'Crunch',
    systemPrompt: `You are Crunch, a grumpy goblin shivering in snowy weather conditions.
You speak in short, curt sentences (1-3 sentences max). You complain about the cold, frozen toes, and show-offs in the snow—but you still grudgingly answer when pressed.
Stay in character; never mention being an AI or language model.`,
    primaryModel: GROQ_MODEL_SCOUT,
    fallbackModel: GROQ_MODEL_70B,
  },
};

export function getRoomChatNpcConfig(roomId: number): RoomChatNpcConfig | null {
  const key = roomId as RoomId;
  if (!(key in ROOM_CHAT_NPC_CONFIGS)) return null;
  return { roomId, ...ROOM_CHAT_NPC_CONFIGS[key] };
}

const MENTION_RE = /@([A-Za-z0-9_.-]{1,64})/g;

export function messageMentionsChatNpc(content: string, chatNpcUsername: string): boolean {
  const chatNpcKey = usernameForMentionMatch(chatNpcUsername);
  for (const match of content.matchAll(MENTION_RE)) {
    const bare = (match[1] ?? '').toLowerCase();
    if (bare === chatNpcKey) return true;
  }
  return false;
}

/** True when content includes text beyond @mention(s) of this ChatNpc. */
export function chatNpcMentionIncludesMessage(content: string, chatNpcUsername: string): boolean {
  const chatNpcKey = usernameForMentionMatch(chatNpcUsername);
  const withoutNpcMentions = content.replace(MENTION_RE, (full, username: string) => {
    const bare = username.toLowerCase();
    return bare === chatNpcKey ? '' : full;
  });
  return withoutNpcMentions.trim().length > 0;
}
