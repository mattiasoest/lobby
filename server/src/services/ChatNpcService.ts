import { desc, eq } from 'drizzle-orm';
import {
  chatNpcMentionIncludesMessage,
  getRoomChatNpcConfig,
  messageMentionsChatNpc,
  pickRandomChatNpcFallbackMessage,
  type RoomChatNpcConfig,
} from '../domain/chatNpc.js';
import { generateChatNpcReply, type GroqChatMessage } from '../infrastructure/ai/groq.js';
import type { AppDatabase } from '../infrastructure/db/createDatabase.js';
import { messages, users } from '../infrastructure/db/schema.js';
import type { MessageService, ChatMessagePayload } from './MessageService.js';
import { ChatNpcRateLimiter } from '../realtime/ChatNpcRateLimiter.js';

const NPC_TYPING_DELAY_MS = 600;
const NPC_HISTORY_LIMIT = 10;

export class ChatNpcService {
  constructor(
    private readonly db: AppDatabase,
    private readonly messageService: MessageService,
    private readonly groqApiKey: string | undefined,
    private readonly rateLimiter: ChatNpcRateLimiter,
  ) {}

  async maybeReply(
    roomId: number,
    userContent: string,
    emit: (msg: ChatMessagePayload) => void,
  ): Promise<void> {
    const chatNpc = getRoomChatNpcConfig(roomId);
    if (!chatNpc) return;
    if (!messageMentionsChatNpc(userContent, chatNpc.username)) return;
    if (!chatNpcMentionIncludesMessage(userContent, chatNpc.username)) return;
    if (!this.rateLimiter.canReplyInRoom(roomId)) return;

    let reply: string | null = null;
    if (this.groqApiKey && this.rateLimiter.canCallGroq()) {
      this.rateLimiter.consumeGroqSlot();
      const history = await this.loadRecentRoomHistory(roomId, chatNpc);
      reply = await generateChatNpcReply({
        systemPrompt: chatNpc.systemPrompt,
        history,
        model: chatNpc.primaryModel,
        fallbackModel: chatNpc.fallbackModel,
        apiKey: this.groqApiKey,
      });
    }

    if (!reply) {
      reply = pickRandomChatNpcFallbackMessage();
    }

    this.rateLimiter.markReplied(roomId);

    await new Promise((resolve) => setTimeout(resolve, NPC_TYPING_DELAY_MS));
    const msg = await this.messageService.insertNpcMessage(
      roomId,
      chatNpc.userId,
      chatNpc.username,
      reply,
    );
    if (msg) emit(msg);
  }

  private async loadRecentRoomHistory(
    roomId: number,
    chatNpc: RoomChatNpcConfig,
  ): Promise<GroqChatMessage[]> {
    const rows = await this.db
      .select({
        userId: messages.userId,
        content: messages.content,
        username: users.username,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.createdAt))
      .limit(NPC_HISTORY_LIMIT);

    return rows
      .reverse()
      .map((row) =>
        row.userId === chatNpc.userId
          ? ({ role: 'assistant', content: row.content } satisfies GroqChatMessage)
          : ({ role: 'user', content: `${row.username}: ${row.content}` } satisfies GroqChatMessage),
      );
  }
}
