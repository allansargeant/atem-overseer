import { Enums, type AtemState } from 'atem-connection';
import type { Timecode } from 'atem-connection/dist/state/common.js';
import type {
  DeviceSnapshot,
  DiskInfo,
  RecordMode,
  RecordStatus,
  StreamStatus,
  MediaPlayerAssignment,
} from '../types.js';

function fmtTimecode(tc: Timecode | undefined): string | null {
  if (!tc) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(tc.hours)}:${p(tc.minutes)}:${p(tc.seconds)}`;
}

function recordStatus(s: Enums.RecordingStatus | undefined): RecordStatus {
  switch (s) {
    case Enums.RecordingStatus.Recording:
      return 'recording';
    case Enums.RecordingStatus.Stopping:
      return 'stopping';
    default:
      return 'idle';
  }
}

function streamStatus(s: Enums.StreamingStatus | undefined): StreamStatus {
  switch (s) {
    case Enums.StreamingStatus.Streaming:
      return 'streaming';
    case Enums.StreamingStatus.Connecting:
      return 'connecting';
    case Enums.StreamingStatus.Stopping:
      return 'stopping';
    default:
      return 'idle';
  }
}

function diskStatus(s: Enums.RecordingDiskStatus): DiskInfo['status'] {
  switch (s) {
    case Enums.RecordingDiskStatus.Recording:
      return 'recording';
    case Enums.RecordingDiskStatus.Active:
      return 'active';
    case Enums.RecordingDiskStatus.Unformatted:
      return 'unformatted';
    case Enums.RecordingDiskStatus.Removed:
      return 'removed';
    default:
      return 'idle';
  }
}

export interface NormalizeMeta {
  id: string;
  name: string;
  address: string;
  connection: DeviceSnapshot['connection'];
  flvUrl: string | null;
  live: boolean;
}

export function normalize(state: AtemState, meta: NormalizeMeta): DeviceSnapshot {
  const rec = state.recording;
  const str = state.streaming;

  const workingSets = new Set(
    [rec?.properties.workingSet1DiskId, rec?.properties.workingSet2DiskId].filter(
      (v): v is number => typeof v === 'number' && v !== 0,
    ),
  );

  const disks: DiskInfo[] = Object.values(rec?.disks ?? {})
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({
      diskId: d.diskId,
      volumeName: d.volumeName || `Disk ${d.diskId}`,
      timeAvailable: d.recordingTimeAvailable,
      status: diskStatus(d.status),
      isWorkingSet: workingSets.has(d.diskId),
    }));

  const mode: RecordMode = rec?.properties.recordInAllCameras ? 'iso' : 'pgm';

  const mediaPlayers: MediaPlayerAssignment[] = (state.media?.players ?? [])
    .map((p, i): MediaPlayerAssignment | null => {
      if (!p) return null;
      const isStill = p.sourceType === Enums.MediaSourceType.Still;
      const slotIndex = isStill ? p.stillIndex : p.clipIndex;
      const name = isStill
        ? state.media.stillPool?.[slotIndex]?.fileName
        : state.media.clipPool?.[slotIndex]?.name;
      return {
        index: i,
        sourceType: isStill ? 'still' : 'clip',
        slotIndex,
        slotName: name || `${isStill ? 'Still' : 'Clip'} ${slotIndex + 1}`,
      };
    })
    .filter((m): m is MediaPlayerAssignment => m !== null);

  return {
    id: meta.id,
    name: meta.name,
    address: meta.address,
    model: state.info?.productIdentifier || 'ATEM',
    connection: meta.connection,
    record: {
      status: recordStatus(rec?.status?.state),
      mode,
      duration: fmtTimecode(rec?.duration),
      filename: rec?.properties.filename || '',
      timeAvailable: rec?.status?.recordingTimeAvailable ?? 0,
    },
    stream: {
      status: streamStatus(str?.status?.state),
      duration: fmtTimecode(str?.duration),
      bitrate: str?.stats?.encodingBitrate ?? 0,
      cacheUsed: (str?.stats?.cacheUsed ?? 0) / 100,
      serviceName: str?.service?.serviceName || '',
      flvUrl: meta.flvUrl,
      live: meta.live,
    },
    disks,
    audio: { leftLevel: -100, rightLevel: -100, leftPeak: -100, rightPeak: -100 },
    monitorMuted: state.fairlight?.monitor?.inputMasterMuted ?? false,
    mediaPlayers,
    lastUpdate: Date.now(),
  };
}
