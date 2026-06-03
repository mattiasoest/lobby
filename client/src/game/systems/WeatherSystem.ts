import type { Container } from 'pixi.js';
import { getRoomConfig } from '../config/roomConfig.ts';
import { Rain } from '../views/Rain.ts';
import { Snow } from '../views/Snow.ts';
import type { Viewport } from '../types.ts';

export class WeatherSystem {
  private worldRain: Rain | null = null;
  private worldSnow: Snow | null = null;
  private weatherWorld: Container | null = null;

  init(roomId: number, weatherWorld: Container): void {
    this.weatherWorld = weatherWorld;
    this.setupForRoom(roomId);
  }

  switchRoom(roomId: number): void {
    this.worldRain?.destroy();
    this.worldRain = null;
    this.worldSnow?.destroy();
    this.worldSnow = null;
    this.setupForRoom(roomId);
  }

  private setupForRoom(roomId: number): void {
    const weatherWorld = this.weatherWorld;
    if (!weatherWorld) return;

    const weather = getRoomConfig(roomId)?.weather ?? null;
    if (weather === 'snow') {
      this.worldSnow = new Snow(weatherWorld);
    }
    if (weather === 'rain') {
      this.worldRain = new Rain(weatherWorld);
    }
  }

  update(dtMs: number, viewport: Viewport): void {
    this.worldRain?.update(dtMs, viewport);
    this.worldSnow?.update(dtMs, viewport);
  }

  destroy(): void {
    this.worldRain?.destroy();
    this.worldRain = null;
    this.worldSnow?.destroy();
    this.worldSnow = null;
    this.weatherWorld = null;
  }
}
