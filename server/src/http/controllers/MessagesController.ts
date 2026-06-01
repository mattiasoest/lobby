import type { RequestHandler } from 'express';
import type { MessageService } from '../../services/MessageService.js';

export class MessagesController {
  constructor(private readonly messageService: MessageService) {}

  listRoomMessages: RequestHandler = async (req, res) => {
    const rid = Number(req.params.roomId);
    const result = await this.messageService.getRoomHistory(rid);
    if (result === null) {
      res.status(400).json({ error: 'invalid room' });
      return;
    }
    res.json(result);
  };
}
