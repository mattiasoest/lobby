import type { Ticker } from 'pixi.js';
import { Application, Assets } from 'pixi.js';
import type { PlayerDTO } from '../types.ts';
import { ROOM_CAMERA_ZOOM } from './core/constants.ts';
import { roomServerTimeMs } from './core/syncState.ts';
import { entityInnerQuad, scrollWorldPx, clampWorldTopLeft } from './core/worldMath.ts';
import { Scene } from './scenes/Scene.ts';
import type { MerchantIdleFrames } from './entities/Merchant.ts';
import { AnimalSystem } from './systems/AnimalSystem.ts';
import { ChatNpcSystem } from './systems/ChatNpcSystem.ts';
import { CameraSystem } from './systems/CameraSystem.ts';
import { InputSystem } from './systems/InputSystem.ts';
import { MinimapSystem } from './systems/MinimapSystem.ts';
import { MovementSystem } from './systems/MovementSystem.ts';
import { PlayerRenderSystem } from './systems/PlayerRenderSystem.ts';
import { RemoteInterpolationSystem } from './systems/RemoteInterpolationSystem.ts';
import { SpeechBubbleSystem } from './systems/SpeechBubbleSystem.ts';
import { WeatherSystem } from './systems/WeatherSystem.ts';
import type { FrameContext, GameOptions, Viewport } from './types.ts';

/**
 * Main game engine: Pixi lifecycle, update/render loop, and system orchestration.
 * React keeps a mutable sync ref updated each render; the ticker reads from it.
 */
export class Game {
  private readonly opts: GameOptions;
  private cancelBootstrap = false;
  private app: Application | null = null;
  private scene: Scene | null = null;
  private tickerFn: ((ticker: Ticker) => void) | null = null;
  private viewport: Viewport = { left: 0, top: 0, w: 0, h: 0 };

  private readonly inputSystem: InputSystem;
  private readonly movementSystem = new MovementSystem();
  private readonly remoteSystem = new RemoteInterpolationSystem();
  private readonly cameraSystem = new CameraSystem();
  private readonly animalSystem = new AnimalSystem();
  private readonly chatNpcSystem = new ChatNpcSystem();
  private readonly playerRenderSystem = new PlayerRenderSystem();
  private readonly speechBubbleSystem = new SpeechBubbleSystem();
  private readonly weatherSystem = new WeatherSystem();
  private readonly minimapSystem = new MinimapSystem();
  private merchantIdleFrames: MerchantIdleFrames | null = null;

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.inputSystem = new InputSystem(opts.syncRef);
  }

  async init(): Promise<void> {
    const {
      mount,
      dimensions: { tileSize, viewPixelW, viewPixelH, worldCols, worldRows },
      worldSpawnPx,
      backgroundTextureSrc,
      characterTextureSrcByAvatarId,
      animalTextureSrc,
      merchantTextureSrc,
      onBootstrapComplete,
    } = this.opts;

    await Scene.loadFonts();

    const worldPixelW = worldCols * tileSize;
    const worldPixelH = worldRows * tileSize;

    const app = new Application();
    await app.init({
      width: viewPixelW,
      height: viewPixelH,
      antialias: true,
    });
    if (this.cancelBootstrap) {
      await app.destroy();
      return;
    }

    const canvas = app.canvas as HTMLCanvasElement;
    canvas.dataset.pixiCanvas = '';
    mount.appendChild(canvas);
    this.app = app;

    const assets = await Scene.loadAssets(
      backgroundTextureSrc,
      characterTextureSrcByAvatarId,
      animalTextureSrc,
      merchantTextureSrc,
    );
    if (this.cancelBootstrap) {
      await app.destroy();
      return;
    }

    const scene = new Scene({
      worldPixelW,
      worldPixelH,
      backgroundTexture: assets.backgroundTexture,
    });
    this.scene = scene;
    app.stage.addChild(scene.viewRoot);

    this.animalSystem.setTextures(assets.animalTextures);
    this.playerRenderSystem.setLayers(scene.actorLayer, scene.playerNameLayer);
    this.playerRenderSystem.setCharacterTextures(assets.characterTexturesByAvatarId);
    this.merchantIdleFrames = assets.merchantIdleFrames;
    this.animalSystem.spawn(this.opts.roomId, this.opts.dimensions, scene.actorLayer);
    this.spawnRoomChatNpc(scene, this.merchantIdleFrames);
    this.weatherSystem.init(this.opts.roomId, scene.weatherWorld);

    this.speechBubbleSystem.setWorldContainer(scene.speechBubbleWorld);
    this.speechBubbleSystem.setCharacterTextureCount(assets.characterTexturesByAvatarId.size);

    this.movementSystem.restoreLocalPxFromSync(
      this.opts.syncRef.current,
      worldSpawnPx,
      tileSize,
      worldCols,
      worldRows,
      this.animalSystem,
      this.chatNpcSystem,
      this.remoteSystem,
    );
    this.movementSystem.resetSyncTimer();

    const tickRun = (ticker: Ticker) => this.tick(ticker);
    this.tickerFn = tickRun;
    app.ticker.add(tickRun);

    const pad0 = tileSize * 0.14;
    const size0 = tileSize - pad0 * 2;
    const { left, top } = scrollWorldPx(
      this.movementSystem.getLocalPx().x,
      this.movementSystem.getLocalPx().y,
      size0,
      viewPixelW / ROOM_CAMERA_ZOOM,
      viewPixelH / ROOM_CAMERA_ZOOM,
      worldPixelW,
      worldPixelH,
    );
    scene.world.position.set(-left, -top);

    this.inputSystem.attach();
    this.syncPlayerLayer();
    onBootstrapComplete?.();
  }

  private buildFrameContext(ticker: Ticker): FrameContext {
    const now = performance.now();
    const syncState = this.opts.syncRef.current;
    const { tileSize, worldCols, worldRows, viewPixelW, viewPixelH, localId } = syncState;
    const { pad, size } = entityInnerQuad(tileSize);
    const dt = ticker.deltaMS / 1000;
    return {
      now,
      dt,
      dtMs: ticker.deltaMS,
      dtSec: Math.max(dt, 1e-4),
      roomNowMs: roomServerTimeMs(syncState),
      syncState,
      tileSize,
      worldCols,
      worldRows,
      viewPixelW,
      viewPixelH,
      localId,
      pad,
      size,
      worldW: worldCols * tileSize,
      worldH: worldRows * tileSize,
      viewW: viewPixelW / ROOM_CAMERA_ZOOM,
      viewH: viewPixelH / ROOM_CAMERA_ZOOM,
    };
  }

  private update(fc: FrameContext): void {
    const { now, dt, roomNowMs, syncState, tileSize, worldCols, worldRows, localId } = fc;

    this.animalSystem.update(roomNowMs);
    this.chatNpcSystem.update(fc.dtMs);

    const remotePlayerObstacles = this.remoteSystem.getObstacles(localId, syncState);
    const animalObstacles = this.animalSystem.getObstacles();
    const staticObstacles = this.chatNpcSystem.getObstacles();

    const move = this.inputSystem.getMoveVector();
    this.movementSystem.update(
      dt,
      move,
      remotePlayerObstacles,
      animalObstacles,
      staticObstacles,
      tileSize,
      worldCols,
      worldRows,
    );

    this.remoteSystem.update(now, dt, syncState);

    const scene = this.scene;
    if (scene) {
      this.viewport = this.cameraSystem.update(
        scene.world,
        this.movementSystem.getLocalPx(),
        fc.size,
        fc.viewW,
        fc.viewH,
        fc.worldW,
        fc.worldH,
      );
    }
  }

  private render(fc: FrameContext): void {
    if (!this.playerRenderSystem.hasLocalDisplay()) {
      this.syncPlayerLayer();
    }

    const localPx = this.movementSystem.getLocalPx();
    const remotePx = this.remoteSystem.getRemotePxMap();

    this.playerRenderSystem.render(fc, localPx, remotePx);
    this.speechBubbleSystem.render(fc, localPx, remotePx);

    this.movementSystem.maybeSyncPosition(fc.now, fc.syncState, this.movementSystem.getLastMovementResult());

    this.minimapSystem.write(
      fc.syncState,
      localPx,
      remotePx,
      this.viewport,
      fc.worldW,
      fc.worldH,
      fc.size,
      this.animalSystem,
      this.chatNpcSystem,
    );

    this.weatherSystem.update(fc.dtMs, this.viewport);
  }

  private tick(ticker: Ticker): void {
    const fc = this.buildFrameContext(ticker);
    this.update(fc);
    this.render(fc);
  }

  private spawnRoomChatNpc(scene: Scene, merchantIdleFrames: MerchantIdleFrames | null): void {
    this.chatNpcSystem.spawn(this.opts.roomId, this.opts.dimensions, scene.actorLayer, merchantIdleFrames, () => {
      this.opts.syncRef.current.onChatNpcTap?.();
    });
  }

  syncPlayerLayer(players?: PlayerDTO[], localId?: string | null, tileSize?: number): void {
    const syncState = this.opts.syncRef.current;
    this.playerRenderSystem.sync(
      players ?? syncState.players,
      localId ?? syncState.localId,
      this.movementSystem.getLocalPx(),
      tileSize ?? syncState.tileSize,
      this.remoteSystem,
    );
  }

  private snapLocalAndCamera(worldSpawnPx: { x: number; y: number }): void {
    const syncState = this.opts.syncRef.current;
    const { tileSize, worldCols, worldRows, viewPixelW, viewPixelH } = syncState;
    const spawn = clampWorldTopLeft(worldSpawnPx.x, worldSpawnPx.y, tileSize, worldCols, worldRows);
    this.movementSystem.setLocalPx(spawn.x, spawn.y);
    syncState.localPx = { x: spawn.x, y: spawn.y };

    const scene = this.scene;
    if (scene) {
      const pad = tileSize * 0.14;
      const size = tileSize - pad * 2;
      const { left, top } = scrollWorldPx(
        spawn.x,
        spawn.y,
        size,
        viewPixelW / ROOM_CAMERA_ZOOM,
        viewPixelH / ROOM_CAMERA_ZOOM,
        worldCols * tileSize,
        worldRows * tileSize,
      );
      scene.world.position.set(-left, -top);
    }
  }

  applyRoomSpawn(worldSpawnX: number, worldSpawnY: number): void {
    this.movementSystem.applyRoomSpawn(
      this.opts.syncRef.current,
      worldSpawnX,
      worldSpawnY,
      this.animalSystem,
      this.chatNpcSystem,
      this.remoteSystem,
    );
    this.remoteSystem.reset();
    this.movementSystem.resetSyncTimer();

    const scene = this.scene;
    const syncState = this.opts.syncRef.current;
    const { tileSize, worldCols, worldRows, viewPixelW, viewPixelH } = syncState;
    if (scene) {
      const pad = tileSize * 0.14;
      const size = tileSize - pad * 2;
      const loc = this.movementSystem.getLocalPx();
      const { left, top } = scrollWorldPx(
        loc.x,
        loc.y,
        size,
        viewPixelW / ROOM_CAMERA_ZOOM,
        viewPixelH / ROOM_CAMERA_ZOOM,
        worldCols * tileSize,
        worldRows * tileSize,
      );
      scene.world.position.set(-left, -top);
    }
    syncState.onPositionSync({
      x: this.movementSystem.getLocalPx().x,
      y: this.movementSystem.getLocalPx().y,
    });
  }

  showChatNpcSpeechBubble(text: string): void {
    this.chatNpcSystem.showSpeechBubble(text);
  }

  showSpeechBubble(playerSocketId: string, text: string): void {
    this.speechBubbleSystem.showSpeechBubble(playerSocketId, text);
  }

  clearSpeechBubbles(): void {
    this.speechBubbleSystem.clearSpeechBubbles();
  }

  clearMovementKeys(): void {
    this.inputSystem.clear();
  }

  async switchRoom(
    roomId: number,
    worldSpawnPx: { x: number; y: number },
    backgroundTextureSrc: string,
  ): Promise<void> {
    if (!this.app || !this.scene) return;

    this.clearSpeechBubbles();

    this.opts.roomId = roomId;
    this.opts.worldSpawnPx = worldSpawnPx;

    // Show the local avatar at the new spawn immediately — do not wait for background load or websocket.
    this.snapLocalAndCamera(worldSpawnPx);
    this.syncPlayerLayer();

    const backgroundTexture = await Assets.load(backgroundTextureSrc).catch(() => null);
    const { tileSize, worldCols, worldRows } = this.opts.dimensions;
    const worldPixelW = worldCols * tileSize;
    const worldPixelH = worldRows * tileSize;
    if (this.scene.background && backgroundTexture) {
      this.scene.setBackgroundTexture(backgroundTexture, worldPixelW, worldPixelH);
    }

    this.weatherSystem.switchRoom(roomId);
    this.animalSystem.spawn(roomId, this.opts.dimensions, this.scene.actorLayer);
    this.spawnRoomChatNpc(this.scene, this.merchantIdleFrames);
    this.applyRoomSpawn(worldSpawnPx.x, worldSpawnPx.y);
  }

  resizeView(viewPixelW: number, viewPixelH?: number): void {
    const { tileSize, worldCols } = this.opts.dimensions;
    const maxW = worldCols * tileSize;
    const clampedW = Math.max(tileSize, Math.min(maxW, Math.round(viewPixelW)));
    this.opts.dimensions.viewPixelW = clampedW;
    if (viewPixelH !== undefined) {
      this.opts.dimensions.viewPixelH = viewPixelH;
    }
    const heightPx = this.opts.dimensions.viewPixelH;
    const syncState = this.opts.syncRef.current;
    syncState.viewPixelW = clampedW;
    syncState.viewPixelH = heightPx;

    const app = this.app;
    if (!app) return;
    app.renderer.resize(clampedW, heightPx);
  }

  setMoveVector(x: number, y: number): void {
    this.inputSystem.setMoveVector(x, y);
  }

  destroy(): void {
    this.cancelBootstrap = true;
    this.speechBubbleSystem.destroy();
    this.inputSystem.detach();
    this.weatherSystem.destroy();

    const app = this.app;
    if (app?.ticker && this.tickerFn) {
      app.ticker.remove(this.tickerFn);
    }
    this.tickerFn = null;

    this.playerRenderSystem.clear();
    this.remoteSystem.reset();
    this.animalSystem.destroy();
    this.chatNpcSystem.destroy();
    this.opts.syncRef.current.minimapSnapshot = null;
    this.scene?.destroy();
    this.scene = null;

    this.app = null;
    void app?.destroy(true);

    const mountEl = this.opts.mount;
    while (mountEl.firstChild) {
      mountEl.removeChild(mountEl.firstChild);
    }
  }
}
