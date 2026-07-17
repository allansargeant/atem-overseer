// Mirror of packages/server/src/types.ts — keep in sync.

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';
export type RecordStatus = 'idle' | 'recording' | 'stopping';
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'stopping';
export type RecordMode = 'pgm' | 'iso';

export interface DiskInfo {
  diskId: number;
  volumeName: string;
  timeAvailable: number;
  status: 'idle' | 'unformatted' | 'active' | 'recording' | 'removed';
  isWorkingSet: boolean;
}

export interface AudioLevels {
  leftLevel: number;
  rightLevel: number;
  leftPeak: number;
  rightPeak: number;
}

export interface MediaPlayerAssignment {
  index: number;
  sourceType: 'still' | 'clip';
  slotIndex: number;
  slotName: string;
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
    duration: string | null;
    filename: string;
    timeAvailable: number;
  };
  stream: {
    status: StreamStatus;
    duration: string | null;
    bitrate: number;
    cacheUsed: number;
    serviceName: string;
    flvUrl: string | null;
    live: boolean;
  };
  disks: DiskInfo[];
  audio: AudioLevels;
  monitorMuted: boolean;
  mediaPlayers: MediaPlayerAssignment[];
  lastUpdate: number;
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

export interface LevelPacket {
  id: string;
  audio: AudioLevels;
}

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
