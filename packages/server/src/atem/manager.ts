import { EventEmitter } from 'node:events';
import { isIP } from 'node:net';
import { saveConfig, type DeviceConfig, type OverseerConfig } from '../config.js';
import type { DeviceSnapshot, LevelPacket } from '../types.js';
import type { DeviceRunner, StreamInfo } from './runner.js';
import { RealDevice } from './realDevice.js';
import { MockDevice } from './mock.js';

export interface ManagerEvents {
  snapshot: (s: DeviceSnapshot) => void;
  levels: (l: LevelPacket[]) => void;
  fleet: (devices: DeviceSnapshot[]) => void;
}

/**
 * Owns every monitored device. Coalesces high-frequency per-device level
 * events into a single batched packet emitted at a fixed rate so the WS layer
 * isn't flooded, re-emits coarse snapshots as they change, and supports adding
 * and removing devices at runtime (persisted to the config file).
 */
export class DeviceManager extends EventEmitter {
  private runners = new Map<string, DeviceRunner>();
  private latestLevels = new Map<string, LevelPacket>();
  private levelPump?: NodeJS.Timeout;
  private getStream: (id: string) => StreamInfo;
  private index = 0;

  constructor(
    private cfg: OverseerConfig,
    private mock: boolean,
    getStream: (id: string) => StreamInfo,
  ) {
    super();
    this.getStream = getStream;
  }

  private createRunner(dc: DeviceConfig, index: number): DeviceRunner {
    const runner: DeviceRunner = this.mock
      ? new MockDevice(dc, index, this.getStream)
      : new RealDevice(dc, this.getStream);
    runner.on('snapshot', (s: DeviceSnapshot) => this.emit('snapshot', s));
    runner.on('levels', (audio) => {
      this.latestLevels.set(dc.id, { id: dc.id, audio });
    });
    runner.on('error', (e) => console.error(`[atem:${dc.id}]`, e));
    return runner;
  }

  async start(): Promise<void> {
    this.cfg.devices.forEach((d) => {
      this.runners.set(d.id, this.createRunner(d, this.index++));
    });

    await Promise.all(
      [...this.runners.values()].map((r) =>
        r.start().catch((e) => console.error(`[atem:${r.id}] start failed:`, e?.message ?? e)),
      ),
    );

    this.levelPump = setInterval(() => {
      if (this.latestLevels.size === 0) return;
      this.emit('levels', [...this.latestLevels.values()]);
    }, 50);
  }

  async stop(): Promise<void> {
    clearInterval(this.levelPump);
    await Promise.all([...this.runners.values()].map((r) => r.stop().catch(() => undefined)));
  }

  // ---- dynamic fleet management ----

  async addDevice(input: { id?: string; name?: string; address: string }): Promise<DeviceConfig> {
    const address = input.address.trim();
    if (!address) throw new Error('address is required');
    if (isIP(address) === 0 && !/^[a-z0-9][a-z0-9.-]*$/i.test(address)) {
      throw new Error('address must be an IP or hostname');
    }
    if ([...this.runners.values()].some((r) => r.meta.address === address)) {
      throw new Error(`${address} is already in the fleet`);
    }
    const id = (input.id?.trim() || slugify(input.name || address)) as string;
    if (this.runners.has(id)) throw new Error(`device id "${id}" already exists`);

    const dc: DeviceConfig = { id, name: input.name?.trim() || address, address };
    const runner = this.createRunner(dc, this.index++);
    this.runners.set(id, runner);
    this.cfg.devices.push(dc);
    this.persist();
    await runner.start().catch((e) => console.error(`[atem:${id}] start failed:`, e?.message ?? e));
    this.emitFleet();
    return dc;
  }

  async removeDevice(id: string): Promise<void> {
    const runner = this.runners.get(id);
    if (!runner) throw new Error(`unknown device: ${id}`);
    await runner.stop().catch(() => undefined);
    this.runners.delete(id);
    this.latestLevels.delete(id);
    this.cfg.devices = this.cfg.devices.filter((d) => d.id !== id);
    this.persist();
    this.emitFleet();
  }

  private persist(): void {
    if (this.mock) return; // don't write a config file full of mock devices
    try {
      saveConfig(this.cfg);
    } catch (err) {
      console.error('[config] save failed:', (err as Error).message);
    }
  }

  private emitFleet(): void {
    this.emit('fleet', this.snapshots());
  }

  snapshots(): DeviceSnapshot[] {
    return [...this.runners.values()].map((r) => r.snapshot());
  }

  get(id: string): DeviceRunner | undefined {
    return this.runners.get(id);
  }

  config(id: string): DeviceConfig | undefined {
    return this.runners.get(id)?.meta;
  }

  managedAddresses(): Set<string> {
    return new Set([...this.runners.values()].map((r) => r.meta.address));
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `atem-${Date.now()}`
  );
}
