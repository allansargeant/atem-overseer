/**
 * Shared dashboard model. This is the normalized shape the server pushes to the
 * browser over WebSocket — deliberately decoupled from atem-connection's raw
 * state so the UI never has to know the wire protocol. A copy of these types
 * lives in packages/web/src/types.ts; keep them in sync.
 */

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export type RecordStatus = 'idle' | 'recording' | 'stopping';
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'stopping';
export type RecordMode = 'pgm' | 'iso';

export interface DiskInfo {
  diskId: number;
  volumeName: string;
  /** seconds of recording headroom remaining on this disk */
  timeAvailable: number;
  status: 'idle' | 'unformatted' | 'active' | 'recording' | 'removed';
  isWorkingSet: boolean;
}

export interface AudioLevels {
  /** dBFS, -100 (silence) .. 0 (full scale). left/right program levels */
  leftLevel: number;
  rightLevel: number;
  leftPeak: number;
  rightPeak: number;
}

export interface DeviceSnapshot {
  id: string;
  name: string;
  address: string;
  model: string;
  connection: ConnectionState;

  record: {
    status: RecordStatus;
    mode: RecordMode;
    /** HH:MM:SS.ff style duration string, or null when idle */
    duration: string | null;
    filename: string;
    /** seconds remaining across the active working-set disk */
    timeAvailable: number;
  };

  stream: {
    status: StreamStatus;
    duration: string | null;
    /** bits per second currently encoded */
    bitrate: number;
    /** 0..1 fraction of the stream cache buffer in use (network health) */
    cacheUsed: number;
    serviceName: string;
    /** http-flv URL the browser can play, when a live stream is being ingested */
    flvUrl: string | null;
    live: boolean;
  };

  disks: DiskInfo[];

  audio: AudioLevels;
  /** browser-side monitor mute is client state; this is the ATEM monitor bus mute */
  monitorMuted: boolean;

  mediaPlayers: MediaPlayerAssignment[];

  lastUpdate: number;
}

export interface MediaPlayerAssignment {
  index: number;
  sourceType: 'still' | 'clip';
  slotIndex: number;
  slotName: string;
}

export interface MediaPoolItem {
  slotIndex: number;
  isUsed: boolean;
  name: string;
}

export interface MediaPool {
  stills: MediaPoolItem[];
  clips: MediaPoolItem[];
}

/** Real-time level packet, sent on its own channel far more often than snapshots */
export interface LevelPacket {
  id: string;
  audio: AudioLevels;
}

// ---- WebSocket envelope ----

export type ServerMessage =
  | { type: 'snapshot'; devices: DeviceSnapshot[] }
  | { type: 'device'; device: DeviceSnapshot }
  | { type: 'levels'; levels: LevelPacket[] }
  | { type: 'toast'; level: 'info' | 'error'; text: string };

export type ClientMessage =
  | { type: 'record'; id: string; action: 'start' | 'stop' }
  | { type: 'stream'; id: string; action: 'start' | 'stop' }
  | { type: 'recordMode'; id: string; mode: RecordMode }
  | { type: 'monitorMute'; id: string; muted: boolean };
