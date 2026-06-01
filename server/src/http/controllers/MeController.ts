import type { RequestHandler } from 'express';
import type { AuthedRequest } from '../../auth/AuthGuard.js';
import type { UserService } from '../../services/UserService.js';

export type MeResponse = {
  avatarId: string;
};

export class MeController {
  constructor(private readonly userService: UserService) {}

  getMe: RequestHandler = async (req, res) => {
    const userId = (req as AuthedRequest).user.sub;
    try {
      const result = await this.userService.getAvatar(userId);
      if (!result) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json({ avatarId: result.avatarId } satisfies MeResponse);
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  };

  patchMe: RequestHandler = async (req, res) => {
    const userId = (req as AuthedRequest).user.sub;
    const rawAvatarId = req.body?.avatarId;
    if (typeof rawAvatarId !== 'string') {
      res.status(400).json({ error: 'invalid_avatar' });
      return;
    }
    try {
      const result = await this.userService.updateAvatar(userId, rawAvatarId);
      if (result === null) {
        const existing = await this.userService.getAvatar(userId);
        if (!existing) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(400).json({ error: 'invalid_avatar' });
        return;
      }
      res.json({ avatarId: result.avatarId } satisfies MeResponse);
    } catch {
      res.status(500).json({ error: 'failed' });
    }
  };
}
