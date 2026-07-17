import { EventEmitter } from 'node:events';
import type { DeviceConfig } from '../config.js';
import type {
  AudioLevels,
  DeviceSnapshot,
  MediaPool,
  RecordMode,
} from '../types.js';
import type { DeviceRunner, StreamInfo } from './runner.js';

/**
 * A synthetic ATEM. Produces a plausible, continuously-evolving DeviceSnapshot
 * plus animated audio levels so the full dashboard can be exercised without any
 * hardware on the network (`--mock`). It honours the same commands the real
 * device does, so record/stream buttons and ISO toggles visibly respond.
 */
export class MockDevice extends EventEmitter implements DeviceRunner {
  readonly id: string;
  readonly meta: DeviceConfig;
  private seed: number;
  private t = 0;
  private snapTimer?: NodeJS.Timeout;
  private levelTimer?: NodeJS.Timeout;
  private getStream: (id: string) => StreamInfo;

  private snap: DeviceSnapshot;

  constructor(meta: DeviceConfig, index: number, getStream: (id: string) => StreamInfo) {
    super();
    this.id = meta.id;
    this.meta = meta;
    this.seed = index;
    this.getStream = getStream;

    const recording = index === 0;
    const streaming = index === 0;
    this.snap = {
      id: meta.id,
      name: meta.name,
      address: meta.address,
      model: ['ATEM Mini Extreme ISO', 'ATEM Mini Pro ISO', 'ATEM Constellation 4K'][index % 3],
      connection: 'connected',
      record: {
        status: recording ? 'recording' : 'idle',
        mode: index === 0 ? 'iso' : 'pgm',
        duration: recording ? '00:12:41' : null,
        filename: `${meta.name.replace(/\s+/g, '_')}_2026-07-17`,
        timeAvailable: 3600 * 4 + index * 1800,
      },
      stream: {
        status: streaming ? 'streaming' : 'idle',
        duration: streaming ? '00:12:38' : null,
        bitrate: streaming ? 6_000_000 : 0,
        cacheUsed: 0.05,
        serviceName: streaming ? 'Atem Overseer (Local)' : '',
        flvUrl: null,
        live: false,
      },
      disks: [
        {
          diskId: 1,
          volumeName: `SSD-${meta.id.toUpperCase()}-1`,
          timeAvailable: 3600 * 4 + index * 1800,
          status: recording ? 'recording' : 'active',
          isWorkingSet: true,
        },
        {
          diskId: 2,
          volumeName: `SSD-${meta.id.toUpperCase()}-2`,
          timeAvailable: 3600 * 9,
          status: 'active',
          isWorkingSet: false,
        },
      ],
      audio: { leftLevel: -100, rightLevel: -100, leftPeak: -100, rightPeak: -100 },
      monitorMuted: false,
      mediaPlayers: [
        { index: 0, sourceType: 'still', slotIndex: 0, slotName: 'Lower_Third.png' },
        { index: 1, sourceType: 'still', slotIndex: 1, slotName: 'Holding_Slide.png' },
      ],
      lastUpdate: Date.now(),
    };
  }

  async start(): Promise<void> {
    // evolve coarse state ~1 Hz
    this.snapTimer = setInterval(() => this.tick(), 1000);
    // animate audio meters ~25 Hz
    this.levelTimer = setInterval(() => this.emitLevels(), 40);
    this.emitSnapshot();
  }

  async stop(): Promise<void> {
    clearInterval(this.snapTimer);
    clearInterval(this.levelTimer);
  }

  snapshot(): DeviceSnapshot {
    return this.snap;
  }

  private tick(): void {
    this.t += 1;
    const s = this.snap;

    if (s.record.status === 'recording') {
      s.record.duration = secondsToTc((this.t + 761) % 86400);
      s.record.timeAvailable = Math.max(0, s.record.timeAvailable - 1);
      const ws = s.disks.find((d) => d.isWorkingSet);
      if (ws) ws.timeAvailable = s.record.timeAvailable;
    }
    if (s.stream.status === 'streaming') {
      s.stream.duration = secondsToTc((this.t + 758) % 86400);
      s.stream.bitrate = Math.round(6_000_000 + Math.sin(this.t / 5) * 800_000);
      s.stream.cacheUsed = Math.max(0, Math.min(1, 0.05 + Math.abs(Math.sin(this.t / 7)) * 0.15));
    }

    const stream = this.getStream(this.id);
    s.stream.flvUrl = stream.flvUrl;
    s.stream.live = stream.live;
    s.lastUpdate = Date.now();
    this.emitSnapshot();
  }

  private emitSnapshot(): void {
    this.emit('snapshot', this.snap);
  }

  private emitLevels(): void {
    if (this.snap.connection !== 'connected') return;
    const base = this.snap.stream.status === 'streaming' || this.snap.record.status === 'recording';
    const phase = this.t + this.seed * 2;
    const env = base ? 1 : 0.25;
    const left = shape(Math.sin(phase * 0.7 + this.seed) * 0.5 + Math.random() * 0.5, env);
    const right = shape(Math.sin(phase * 0.9 + this.seed + 1) * 0.5 + Math.random() * 0.5, env);
    const levels: AudioLevels = {
      leftLevel: left,
      rightLevel: right,
      leftPeak: Math.max(left + 2, -60),
      rightPeak: Math.max(right + 2, -60),
    };
    this.snap.audio = levels;
    this.emit('levels', levels);
  }

  // ---- commands ----
  async setRecording(on: boolean): Promise<void> {
    this.snap.record.status = on ? 'recording' : 'idle';
    this.snap.record.duration = on ? '00:00:00' : null;
    const ws = this.snap.disks.find((d) => d.isWorkingSet);
    if (ws) ws.status = on ? 'recording' : 'active';
    this.emitSnapshot();
  }

  async setStreaming(on: boolean): Promise<void> {
    this.snap.stream.status = on ? 'connecting' : 'idle';
    if (on) setTimeout(() => {
      this.snap.stream.status = 'streaming';
      this.snap.stream.serviceName = 'Atem Overseer (Local)';
      this.emitSnapshot();
    }, 1200);
    else {
      this.snap.stream.bitrate = 0;
      this.snap.stream.duration = null;
    }
    this.emitSnapshot();
  }

  async setRecordMode(mode: RecordMode): Promise<void> {
    this.snap.record.mode = mode;
    this.emitSnapshot();
  }

  async setMonitorMute(muted: boolean): Promise<void> {
    this.snap.monitorMuted = muted;
    this.emitSnapshot();
  }

  async assignMediaPlayer(playerIndex: number, sourceType: 'still' | 'clip', slotIndex: number): Promise<void> {
    const p = this.snap.mediaPlayers.find((m) => m.index === playerIndex);
    if (p) {
      p.sourceType = sourceType;
      p.slotIndex = slotIndex;
      p.slotName = `${sourceType === 'still' ? 'Still' : 'Clip'} ${slotIndex + 1}`;
    }
    this.emitSnapshot();
  }

  async uploadStill(): Promise<void> {
    /* mock: no-op */
  }

  mediaPool(): MediaPool {
    return {
      stills: Array.from({ length: 20 }, (_, i) => ({
        slotIndex: i,
        isUsed: i < 2,
        name: i === 0 ? 'Lower_Third.png' : i === 1 ? 'Holding_Slide.png' : `Still ${i + 1}`,
      })),
      clips: Array.from({ length: 2 }, (_, i) => ({
        slotIndex: i,
        isUsed: false,
        name: `Clip ${i + 1}`,
      })),
    };
  }
}

function secondsToTc(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/** map a -1..1 signal to a dBFS-ish value, clamped to a sensible meter range */
function shape(x: number, env: number): number {
  const amp = Math.min(1, Math.abs(x)) * env;
  const db = 20 * Math.log10(amp + 1e-4);
  return Math.max(-100, Math.min(-1, db));
}
