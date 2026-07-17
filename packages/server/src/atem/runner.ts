import type { EventEmitter } from 'node:events';
import type { DeviceConfig } from '../config.js';
import type { AudioLevels, DeviceSnapshot, MediaPool, RecordMode } from '../types.js';

export interface StreamInfo {
  flvUrl: string | null;
  live: boolean;
}

export interface StreamingServiceInput {
  serviceName: string;
  url: string;
  key: string;
  bitrates: [number, number];
}

/**
 * Common surface for a monitored switcher, implemented by both the real
 * atem-connection-backed device and the mock. Emits:
 *   'snapshot' -> DeviceSnapshot   (on any coarse state change)
 *   'levels'   -> AudioLevels      (high frequency, program bus meters)
 */
export interface DeviceRunner extends EventEmitter {
  readonly id: string;
  readonly meta: DeviceConfig;

  start(): Promise<void>;
  stop(): Promise<void>;
  snapshot(): DeviceSnapshot;

  setRecording(on: boolean): Promise<void>;
  setStreaming(on: boolean): Promise<void>;
  setRecordMode(mode: RecordMode): Promise<void>;
  setMonitorMute(muted: boolean): Promise<void>;
  assignMediaPlayer(playerIndex: number, sourceType: 'still' | 'clip', slotIndex: number): Promise<void>;
  uploadStill(slotIndex: number, name: string, data: Buffer): Promise<void>;
  setStreamingService?(svc: StreamingServiceInput): Promise<void>;
  mediaPool(): MediaPool;
}

export interface DeviceRunnerEvents {
  snapshot: (s: DeviceSnapshot) => void;
  levels: (l: AudioLevels) => void;
}
