import { Container, Graphics, Text } from 'pixi.js';
import type { PlayerDTO } from '../../types.ts';
import { avatarMinimapColor, sanitizeAvatarId } from '../config/avatars.ts';
import { Entity } from '../entities/Entity.ts';
import { Player, type CharacterTextureSet } from '../entities/Player.ts';
import { ROOM_PIXEL_FONT_STACK, roomWorldCanvasTextOptions } from '../core/pixelTypography.ts';
import { SpeechBubble } from '../views/SpeechBubble.ts';
import { LOCAL_DISPLAY_ID } from '../core/constants.ts';
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

  hasLocalDisplay(): boolean {
    return this.playerRootByIdRef.has(LOCAL_DISPLAY_ID) && this.playerNameLabelByIdRef.has(LOCAL_DISPLAY_ID);
  }

  /** Keep the local sprite, sync remote sprites from the roster. */
  sync(
    players: PlayerDTO[],
    localId: string | null,
    localPx: { x: number; y: number },
    tileSize: number,
    remoteSystem: RemoteInterpolationSystem,
  ): void {
    const actorLayer = this.actorLayer;
    const nameLayer = this.playerNameLayer;
    if (!actorLayer || !nameLayer) return;

    this.ensureLocal(localId, players, localPx, tileSize);

    const remoteIds = new Set<string>();
    for (const player of players) {
      if (localId && player.id === localId) continue;
      remoteIds.add(player.id);
    }

    for (const id of [...this.playerRootByIdRef.keys()]) {
      if (id === LOCAL_DISPLAY_ID) continue;
      if (!remoteIds.has(id)) this.removePlayerDisplay(id);
    }

    remoteSystem.reset();

    const tSeed = performance.now();
    for (const player of players) {
      if (localId && player.id === localId) continue;
      if (this.playerRootByIdRef.has(player.id)) this.removePlayerDisplay(player.id);
      this.addDisplay(player.id, player, tileSize, localPx, remoteSystem, tSeed, false);
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

    for (const player of players) {
      if (localId && player.id === localId) continue;
      this.updateDisplay(player.id, remotePx.get(player.id), false, localPx, nameCenterX, nameLabelY, dtSec, dtMs);
    }

    if (this.hasLocalDisplay()) {
      this.updateDisplay(LOCAL_DISPLAY_ID, null, true, localPx, nameCenterX, nameLabelY, dtSec, dtMs);
    }

    this.actorLayer?.sortChildren();
    this.playerNameLayer?.sortChildren();

    const activeIds = new Set(players.filter((p) => !localId || p.id !== localId).map((p) => p.id));
    activeIds.add(LOCAL_DISPLAY_ID);
    for (const id of [...this.prevRenderedPxRef.keys()]) {
      if (!activeIds.has(id)) this.prevRenderedPxRef.delete(id);
    }
  }

  /** Face forward idle and clear motion history so a spawn teleport does not skew direction. */
  resetLocalFacing(localPx: { x: number; y: number }): void {
    this.PlayerByIdRef.get(LOCAL_DISPLAY_ID)?.resetToIdle('front');
    this.prevRenderedPxRef.set(LOCAL_DISPLAY_ID, { x: localPx.x, y: localPx.y });
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

  private ensureLocal(
    localId: string | null,
    players: PlayerDTO[],
    localPx: { x: number; y: number },
    tileSize: number,
  ): void {
    const rosterPlayer = this.findLocalRosterPlayer(localId, players);

    if (this.hasLocalDisplay()) {
      if (rosterPlayer) {
        const nameLabel = this.playerNameLabelByIdRef.get(LOCAL_DISPLAY_ID);
        if (nameLabel) {
          const nextName = rosterPlayer.username || 'Player';
          if (nameLabel.text !== nextName) nameLabel.text = nextName;
        }
      }
      return;
    }

    if (!rosterPlayer) return;

    this.addDisplay(LOCAL_DISPLAY_ID, rosterPlayer, tileSize, localPx, null, 0, true);
    this.actorLayer?.sortChildren();
    this.playerNameLayer?.sortChildren();
  }

  private findLocalRosterPlayer(localId: string | null, players: PlayerDTO[]): PlayerDTO | undefined {
    if (localId) {
      const exact = players.find((player) => player.id === localId);
      if (exact) return exact;
    }
    return players.length === 1 ? players[0] : undefined;
  }

  private removePlayerDisplay(id: string): void {
    const actorLayer = this.actorLayer;
    const nameLayer = this.playerNameLayer;
    const root = this.playerRootByIdRef.get(id);
    if (root && actorLayer) {
      actorLayer.removeChild(root);
      root.destroy({ children: true });
    }
    const nameLabel = this.playerNameLabelByIdRef.get(id);
    if (nameLabel && nameLayer) {
      nameLayer.removeChild(nameLabel);
      nameLabel.destroy({ children: true });
    }
    this.playerRootByIdRef.delete(id);
    this.playerNameLabelByIdRef.delete(id);
    this.PlayerByIdRef.delete(id);
    this.prevRenderedPxRef.delete(id);
  }

  private addDisplay(
    mapId: string,
    player: PlayerDTO,
    tileSize: number,
    localPx: { x: number; y: number },
    remoteSystem: RemoteInterpolationSystem | null,
    tSeed: number,
    isLocal: boolean,
  ): void {
    const actorLayer = this.actorLayer;
    const nameLayer = this.playerNameLayer;
    if (!actorLayer || !nameLayer) return;

    const pad = tileSize * 0.14;
    const size = tileSize - pad * 2;
    const spriteOverhang = Entity.spriteOverhangForTileSize(tileSize);
    const useSpriteLayout = this.characterTexturesByAvatarId.size > 0;
    const avatarId = sanitizeAvatarId(player.avatarId);

    const root = new Container();
    const playerTextures = this.characterTexturesByAvatarId.get(avatarId);

    if (playerTextures) {
      const avatar = new Player(playerTextures, tileSize);
      avatar.view.position.set(-pad, -pad);
      root.addChild(avatar.view);
      this.PlayerByIdRef.set(mapId, avatar);
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

    let px = player.x;
    let py = player.y;
    if (isLocal) {
      px = localPx.x;
      py = localPx.y;
    } else if (remoteSystem) {
      remoteSystem.seed(player.id, player.x, player.y, tSeed);
    }

    const nameCenterX = useSpriteLayout ? size / 2 - pad : size / 2;
    root.position.set(px, py);
    root.zIndex = py;
    nameLabel.position.set(px + nameCenterX, py - spriteOverhang - SpeechBubble.PLAYER_NAME_LABEL_BOTTOM_GAP_PX);
    nameLabel.zIndex = py;

    this.prevRenderedPxRef.set(mapId, { x: px, y: py });
    this.playerRootByIdRef.set(mapId, root);
    this.playerNameLabelByIdRef.set(mapId, nameLabel);
    actorLayer.addChild(root);
    nameLayer.addChild(nameLabel);
  }

  private updateDisplay(
    mapId: string,
    remotePos: { x: number; y: number } | null | undefined,
    isLocal: boolean,
    localPx: { x: number; y: number },
    nameCenterX: number,
    nameLabelY: number,
    dtSec: number,
    dtMs: number,
  ): void {
    const root = this.playerRootByIdRef.get(mapId);
    if (!root) return;
    const pos = isLocal ? localPx : remotePos;
    if (!pos) return;

    root.position.set(pos.x, pos.y);
    root.zIndex = pos.y;

    const nameLabel = this.playerNameLabelByIdRef.get(mapId);
    if (nameLabel) {
      nameLabel.position.set(pos.x + nameCenterX, pos.y + nameLabelY);
      nameLabel.zIndex = pos.y;
    }

    const avatar = this.PlayerByIdRef.get(mapId);
    if (!avatar) return;

    const prev = this.prevRenderedPxRef.get(mapId);
    let vxPxS = 0;
    let vyPxS = 0;
    if (prev) {
      vxPxS = (pos.x - prev.x) / dtSec;
      vyPxS = (pos.y - prev.y) / dtSec;
    }
    avatar.update(dtMs, vxPxS, vyPxS);
    this.prevRenderedPxRef.set(mapId, { x: pos.x, y: pos.y });
  }
}
