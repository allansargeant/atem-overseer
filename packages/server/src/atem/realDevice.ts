import { EventEmitter } from 'node:events';
import { reverse as dnsReverse } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Atem, Enums } from 'atem-connection';
import type { SomeAtemAudioLevels } from 'atem-connection/dist/state/levels.js';
import type { DeviceConfig } from '../config.js';
import type { AudioLevels, DeviceSnapshot, MediaPool, RecordMode } from '../types.js';
import { normalize } from './normalize.js';
import type { DeviceRunner, StreamInfo, StreamingServiceInput } from './runner.js';

/**
 * A real Blackmagic ATEM, driven over atem-connection's UDP protocol.
 * Reconnects automatically (the library handles retry). Emits a normalized
 * snapshot on every state change and program-bus levels on every metering tick.
 */
export class RealDevice extends EventEmitter implements DeviceRunner {
  readonly id: string;
  readonly meta: DeviceConfig;
  private atem: Atem;
  private connection: DeviceSnapshot['connection'] = 'connecting';
  private getStream: (id: string) => StreamInfo;
  private hostname: string | null = null;

  constructor(meta: DeviceConfig, getStream: (id: string) => StreamInfo) {
    super();
    this.id = meta.id;
    this.meta = meta;
    this.getStream = getStream;
    // if the configured address is itself a hostname, use it directly
    if (isIP(meta.address) === 0) this.hostname = meta.address;
    this.atem = new Atem();

    this.atem.on('connected', () => {
      this.connection = 'connected';
      // ask the switcher to start streaming Fairlight meter data
      this.atem.startFairlightMixerSendLevels().catch(() => undefined);
      this.pushSnapshot();
    });
    this.atem.on('disconnected', () => {
      this.connection = 'disconnected';
      this.pushSnapshot();
    });
    this.atem.on('stateChanged', () => this.pushSnapshot());
    this.atem.on('levelChanged', (levels: SomeAtemAudioLevels) => this.onLevels(levels));
    this.atem.on('error', (e) => this.emit('error', e));
  }

  async start(): Promise<void> {
    // best-effort reverse DNS so the device panel can show a hostname
    if (!this.hostname && isIP(this.meta.address) !== 0) {
      dnsReverse(this.meta.address)
        .then((names) => {
          if (names[0]) {
            this.hostname = names[0];
            this.pushSnapshot();
          }
        })
        .catch(() => undefined);
    }
    await this.atem.connect(this.meta.address);
  }

  async stop(): Promise<void> {
    await this.atem.disconnect().catch(() => undefined);
  }

  snapshot(): DeviceSnapshot {
    const stream = this.getStream(this.id);
    if (!this.atem.state) {
      return this.placeholder(stream);
    }
    return normalize(this.atem.state, {
      id: this.id,
      name: this.meta.name,
      address: this.meta.address,
      connection: this.connection,
      flvUrl: stream.flvUrl,
      live: stream.live,
      hostname: this.hostname,
    });
  }

  private placeholder(stream: StreamInfo): DeviceSnapshot {
    return {
      id: this.id,
      name: this.meta.name,
      address: this.meta.address,
      model: 'ATEM',
      connection: this.connection,
      record: { status: 'idle', mode: 'pgm', duration: null, filename: '', timeAvailable: 0 },
      stream: {
        status: 'idle',
        duration: null,
        bitrate: 0,
        cacheUsed: 0,
        serviceName: '',
        flvUrl: stream.flvUrl,
        live: stream.live,
      },
      disks: [],
      hostname: this.hostname,
      protocolVersion: '—',
      audio: { leftLevel: -100, rightLevel: -100, leftPeak: -100, rightPeak: -100 },
      monitorMuted: false,
      mediaPlayers: [],
      lastUpdate: Date.now(),
    };
  }

  private pushSnapshot(): void {
    this.emit('snapshot', this.snapshot());
  }

  private onLevels(levels: SomeAtemAudioLevels): void {
    if (levels.type !== 'master') return;
    const l = levels.levels;
    const audio: AudioLevels = {
      leftLevel: l.leftLevel,
      rightLevel: l.rightLevel,
      leftPeak: l.leftPeak,
      rightPeak: l.rightPeak,
    };
    this.emit('levels', audio);
  }

  // ---- commands ----
  async setRecording(on: boolean): Promise<void> {
    await (on ? this.atem.startRecording() : this.atem.stopRecording());
  }

  async setStreaming(on: boolean): Promise<void> {
    await (on ? this.atem.startStreaming() : this.atem.stopStreaming());
  }

  async setRecordMode(mode: RecordMode): Promise<void> {
    await this.atem.setEnableISORecording(mode === 'iso');
  }

  async setMonitorMute(muted: boolean): Promise<void> {
    await this.atem.setFairlightAudioMixerMonitorProps({ inputMasterMuted: muted });
  }

  async assignMediaPlayer(playerIndex: number, sourceType: 'still' | 'clip', slotIndex: number): Promise<void> {
    await this.atem.setMediaPlayerSource(
      sourceType === 'still'
        ? { sourceType: Enums.MediaSourceType.Still, stillIndex: slotIndex }
        : { sourceType: Enums.MediaSourceType.Clip, clipIndex: slotIndex },
      playerIndex,
    );
  }

  async uploadStill(slotIndex: number, name: string, data: Buffer): Promise<void> {
    // `data` is raw RGBA at the switcher resolution (converted browser-side).
    await this.atem.uploadStill(slotIndex, data, name, '');
  }

  async setStreamingService(svc: StreamingServiceInput): Promise<void> {
    await this.atem.setStreamingService({
      serviceName: svc.serviceName,
      url: svc.url,
      key: svc.key,
      bitrates: svc.bitrates,
    });
  }

  mediaPool(): MediaPool {
    const st = this.atem.state;
    const stills = (st?.media.stillPool ?? []).map((f, i) => ({
      slotIndex: i,
      isUsed: !!f?.isUsed,
      name: f?.fileName || `Still ${i + 1}`,
    }));
    const clips = (st?.media.clipPool ?? []).map((c, i) => ({
      slotIndex: i,
      isUsed: !!c?.isUsed,
      name: c?.name || `Clip ${i + 1}`,
    }));
    return { stills, clips };
  }
}
