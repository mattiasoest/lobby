import type { Namespace, Socket } from 'socket.io';
import type { AuthUser } from '../../auth/AuthGuard.js';
import type { Services } from '../../services/createServices.js';
import type { ChatMessagePayload } from '../../services/MessageService.js';
import { PlayerPresence } from '../PlayerPresence.js';

type AuthedSocket = Socket & { data: { user: AuthUser } };

type RoomServices = Pick<Services, 'user' | 'message' | 'chatNpc'>;

/** Socket controller for a single room namespace — mirrors HTTP controllers in `http/controllers/`. */
export class RoomController {
  private readonly presence: PlayerPresence;

  constructor(
    private readonly roomId: number,
    private readonly nsp: Namespace,
    private readonly services: RoomServices,
  ) {
    this.presence = new PlayerPresence(nsp);
  }

  onConnect(socket: AuthedSocket): void {
    socket.emit('room:clock', { serverNowMs: Date.now() });
  }

  async onPlayerJoin(socket: AuthedSocket, payload: { x: number; y: number }): Promise<void> {
    const user = socket.data.user;
    let avatarId = 'default';
    try {
      const avatar = await this.services.user.getAvatar(user.sub);
      avatarId = avatar?.avatarId ?? 'default';
    } catch {
      // Fall back to default avatar when lookup fails.
    }
    this.presence.join(socket.id, user, payload, avatarId);
  }

  onPlayerMove(socket: AuthedSocket, payload: { x: number; y: number }): void {
    this.presence.move(socket.id, payload);
  }

  onPlayerLeave(socket: AuthedSocket): void {
    this.presence.leave(socket.id);
  }

  async onChatSend(socket: AuthedSocket, payload: { content: string }): Promise<void> {
    const user = socket.data.user;
    const raw = typeof payload?.content === 'string' ? payload.content : '';
    const msg = await this.services.message.sendChatMessage(this.roomId, user.sub, user.username, raw);
    if (!msg) return;
    this.nsp.emit('chat:message', msg);
    void this.services.chatNpc.maybeReply(
      this.roomId,
      raw.trim().slice(0, 2000),
      (chatMsg: ChatMessagePayload) => this.nsp.emit('chat:message', chatMsg),
    );
  }

  onDisconnect(socket: AuthedSocket): void {
    this.presence.leave(socket.id);
  }
}
