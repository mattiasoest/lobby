import type { AnimalKind } from '../entities/npcs/Animal.ts';
import { CHAT_NPC_MARKER_COLOR_CSS } from '../config/chatNpc.ts';
import { rgbIntToCssHex } from '../config/playerColor.ts';

export type MinimapPlayer = {
  id: string;
  x: number;
  y: number;
  color: number;
  isLocal: boolean;
};

export type MinimapAnimal = {
  kind: AnimalKind;
  x: number;
  y: number;
};

export type MinimapChatNpc = {
  x: number;
  y: number;
};

export type MinimapSnapshot = {
  worldW: number;
  worldH: number;
  viewport: { x: number; y: number; w: number; h: number };
  players: MinimapPlayer[];
  animals: MinimapAnimal[];
  chatNpc: MinimapChatNpc | null;
};

/** Screen-space minimap painter. Reads a world-space snapshot and draws to a 2D canvas. */
export class Minimap {
  static readonly DEFAULT_WIDTH = 150;
  static readonly DEFAULT_HEIGHT = 100;

  readonly width: number;
  readonly height: number;

  constructor(width = Minimap.DEFAULT_WIDTH, height = Minimap.DEFAULT_HEIGHT) {
    this.width = width;
    this.height = height;
  }

  draw(ctx: CanvasRenderingContext2D, snap: MinimapSnapshot): void {
    const scaleX = this.width / snap.worldW;
    const scaleY = this.height / snap.worldH;

    ctx.clearRect(0, 0, this.width, this.height);

    ctx.fillStyle = 'rgba(26, 46, 26, 0.62)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.strokeStyle = 'rgba(134, 239, 172, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, this.width - 1, this.height - 1);

    const vx = snap.viewport.x * scaleX;
    const vy = snap.viewport.y * scaleY;
    const vw = snap.viewport.w * scaleX;
    const vh = snap.viewport.h * scaleY;
    ctx.fillStyle = 'rgba(248, 250, 252, 0.08)';
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.72)';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);

    for (const animal of snap.animals) {
      const px = animal.x * scaleX;
      const py = animal.y * scaleY;
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (snap.chatNpc) {
      const px = snap.chatNpc.x * scaleX;
      const py = snap.chatNpc.y * scaleY;
      ctx.fillStyle = CHAT_NPC_MARKER_COLOR_CSS;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const player of snap.players) {
      if (player.isLocal) continue;
      ctx.fillStyle = rgbIntToCssHex(player.color);
      ctx.beginPath();
      ctx.arc(player.x * scaleX, player.y * scaleY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const local = snap.players.find((player) => player.isLocal);
    if (local) {
      const px = local.x * scaleX;
      const py = local.y * scaleY;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
