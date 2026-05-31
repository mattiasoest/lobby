import { Container, Graphics, Text } from 'pixi.js';
import type { PlayerDTO } from '../../types.ts';
import { avatarMinimapColor, sanitizeAvatarId } from '../config/avatars.ts';
import { Entity } from '../entities/Entity.ts';
import { Player, type CharacterTextureSet } from '../entities/Player.ts';
import { ROOM_PIXEL_FONT_STACK, roomWorldCanvasTextOptions } from '../core/pixelTypography.ts';
import { SpeechBubble } from '../views/SpeechBubble.ts';
import type { FrameContext } from '../types.ts';
import type { RemoteInterpolationSystem } from './RemoteInterpolationSystem.ts';

export class PlayerRenderSystem {
  private playerRootByIdRef = new Map<string, Container>();
  private playerNameLabelByIdRef = new Map<string, Text>();
  private PlayerByIdRef = new Map<string, Player>();
  private prevRenderedPxRef = new Map<string, { x: number; y: number }>();
  private characterTexturesByAvatarId = new Map<string, CharacterTextureSet>();
  private actorLayer: Container | null = null;
  private playerNameLayer: Container | null = null;

  setLayers(actorLayer: Container, playerNameLayer: Container): void {
    this.actorLayer = actorLayer;
    this.playerNameLayer = playerNameLayer;
  }

  setCharacterTextures(textures: Map<string, CharacterTextureSet>): void {
    this.characterTexturesByAvatarId = textures;
  }

  rebuild(
    players: PlayerDTO[],
    localId: string | null,
    tileSize: number,
    localPx: { x: number; y: number },
    remoteSystem: RemoteInterpolationSystem,
  ): void {
    const actorLayer = this.actorLayer;
    const nameLayer = this.playerNameLayer;
    if (!actorLayer || !nameLayer) return;

    for (const root of [...this.playerRootByIdRef.values()]) {
      actorLayer.removeChild(root);
      root.destroy({ children: true });
    }
    for (let idx = nameLayer.children.length - 1; idx >= 0; idx -= 1) {
      nameLayer.removeChildAt(idx).destroy({ children: true });
    }
    this.playerRootByIdRef.clear();
    this.playerNameLabelByIdRef.clear();
    this.PlayerByIdRef.clear();
    this.prevRenderedPxRef.clear();
    remoteSystem.reset();

    const pad = tileSize * 0.14;
    const size = tileSize - pad * 2;
    const spriteOverhang = Entity.spriteOverhangForTileSize(tileSize);
    const tSeed = performance.now();
    const useSpriteLayout = this.characterTexturesByAvatarId.size > 0;

    for (const player of players) {
      const root = new Container();
      const isLocal = !!localId && player.id === localId;
      const playerTextures = this.characterTexturesByAvatarId.get(sanitizeAvatarId(player.avatarId));

      if (playerTextures) {
        const avatar = new Player(playerTextures, tileSize);
        avatar.view.position.set(-pad, -pad);
        root.addChild(avatar.view);
        this.PlayerByIdRef.set(player.id, avatar);
      } else {
        const graphic = new Graphics();
        graphic.rect(0, 0, size, size);
        graphic.fill({ color: avatarMinimapColor(player.avatarId) });
        root.addChild(graphic);
      }

      const nameLabel = new Text({
        text: player.username || 'Player',
        ...roomWorldCanvasTextOptions(),
        style: {
          fontFamily: ROOM_PIXEL_FONT_STACK,
          fontSize: 11,
          letterSpacing: 0,
          lineHeight: 14,
          fill: 0xf8fafc,
          stroke: { color: 0x0f172a, width: 3 },
          align: 'center',
        },
      });
      nameLabel.anchor.set(0.5, 1);
      const nameCenterX = useSpriteLayout ? size / 2 - pad : size / 2;

      let px = player.x;
      let py = player.y;
      if (isLocal) {
        px = localPx.x;
        py = localPx.y;
      } else {
        remoteSystem.seed(player.id, player.x, player.y, tSeed);
      }
      root.position.set(px, py);
      root.zIndex = py;
      nameLabel.position.set(px + nameCenterX, py - spriteOverhang - SpeechBubble.PLAYER_NAME_LABEL_BOTTOM_GAP_PX);
      nameLabel.zIndex = py;
      this.prevRenderedPxRef.set(player.id, { x: px, y: py });
      this.playerRootByIdRef.set(player.id, root);
      this.playerNameLabelByIdRef.set(player.id, nameLabel);
      actorLayer.addChild(root);
      nameLayer.addChild(nameLabel);
    }

    actorLayer.sortChildren();
    nameLayer.sortChildren();
  }

  render(fc: FrameContext, localPx: { x: number; y: number }, remotePx: Map<string, { x: number; y: number }>): void {
    const { syncState, dtSec, dtMs, size, pad } = fc;
    const { players, localId } = syncState;
    const useSpriteLayout = this.characterTexturesByAvatarId.size > 0;
    const nameCenterX = useSpriteLayout ? size / 2 - pad : size / 2;
    const nameLabelY = -Entity.spriteOverhangForTileSize(fc.tileSize) - SpeechBubble.PLAYER_NAME_LABEL_BOTTOM_GAP_PX;
    const actorLayer = this.actorLayer;
    const playerNameLayer = this.playerNameLayer;

    for (const player of players) {
      const root = this.playerRootByIdRef.get(player.id);
      if (!root) continue;
      const isLocal = !!localId && player.id === localId;
      const pos = isLocal ? localPx : remotePx.get(player.id);
      if (!pos) continue;
      root.position.set(pos.x, pos.y);
      root.zIndex = pos.y;

      const nameLabel = this.playerNameLabelByIdRef.get(player.id);
      if (nameLabel) {
        nameLabel.position.set(pos.x + nameCenterX, pos.y + nameLabelY);
        nameLabel.zIndex = pos.y;
      }

      const avatar = this.PlayerByIdRef.get(player.id);
      if (avatar) {
        const prev = this.prevRenderedPxRef.get(player.id);
        let vxPxS = 0;
        let vyPxS = 0;
        if (prev) {
          vxPxS = (pos.x - prev.x) / dtSec;
          vyPxS = (pos.y - prev.y) / dtSec;
        }
        avatar.update(dtMs, vxPxS, vyPxS);
        this.prevRenderedPxRef.set(player.id, { x: pos.x, y: pos.y });
      }
    }

    actorLayer?.sortChildren();
    playerNameLayer?.sortChildren();

    const activeIds = new Set<string>();
    for (const player of players) activeIds.add(player.id);
    for (const id of [...this.prevRenderedPxRef.keys()]) {
      if (!activeIds.has(id)) this.prevRenderedPxRef.delete(id);
    }
  }

  clear(): void {
    this.playerRootByIdRef.clear();
    this.playerNameLabelByIdRef.clear();
    this.PlayerByIdRef.clear();
    this.prevRenderedPxRef.clear();
    this.characterTexturesByAvatarId.clear();
    this.actorLayer = null;
    this.playerNameLayer = null;
  }
}
