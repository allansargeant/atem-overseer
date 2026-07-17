import { EventEmitter } from 'node:events';
import type { OverseerConfig } from '../config.js';
import type { DeviceSnapshot, LevelPacket } from '../types.js';
import type { DeviceRunner, StreamInfo } from './runner.js';
import { RealDevice } from './realDevice.js';
import { MockDevice } from './mock.js';

export interface ManagerEvents {
  snapshot: (s: DeviceSnapshot) => void;
  levels: (l: LevelPacket[]) => void;
}

/**
 * Owns every monitored device. Coalesces high-frequency per-device level
 * events into a single batched packet emitted at a fixed rate so the WS layer
 * isn't flooded, and re-emits coarse snapshots as they change.
 */
export class DeviceManager extends EventEmitter {
  private runners = new Map<string, DeviceRunner>();
  private latestLevels = new Map<string, LevelPacket>();
  private levelPump?: NodeJS.Timeout;
  private getStream: (id: string) => StreamInfo;

  constructor(
    private cfg: OverseerConfig,
    private mock: boolean,
    getStream: (id: string) => StreamInfo,
  ) {
    super();
    this.getStream = getStream;
  }

  async start(): Promise<void> {
    this.cfg.devices.forEach((d, i) => {
      const runner: DeviceRunner = this.mock
        ? new MockDevice(d, i, this.getStream)
        : new RealDevice(d, this.getStream);
      runner.on('snapshot', (s: DeviceSnapshot) => this.emit('snapshot', s));
      runner.on('levels', (audio) => {
        this.latestLevels.set(d.id, { id: d.id, audio });
      });
      runner.on('error', (e) => console.error(`[atem:${d.id}]`, e));
      this.runners.set(d.id, runner);
    });

    await Promise.all(
      [...this.runners.values()].map((r) =>
        r.start().catch((e) => console.error(`[atem:${r.id}] start failed:`, e?.message ?? e)),
      ),
    );

    // batch levels out at ~20 Hz
    this.levelPump = setInterval(() => {
      if (this.latestLevels.size === 0) return;
      this.emit('levels', [...this.latestLevels.values()]);
    }, 50);
  }

  async stop(): Promise<void> {
    clearInterval(this.levelPump);
    await Promise.all([...this.runners.values()].map((r) => r.stop().catch(() => undefined)));
  }

  snapshots(): DeviceSnapshot[] {
    return [...this.runners.values()].map((r) => r.snapshot());
  }

  get(id: string): DeviceRunner | undefined {
    return this.runners.get(id);
  }
}
