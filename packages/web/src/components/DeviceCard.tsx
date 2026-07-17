import { useState, type MutableRefObject } from 'react';
import type { AudioLevels, ClientMessage, DeviceSnapshot } from '../types';
import { AudioMeter } from './AudioMeter';
import { StreamView } from './StreamView';
import { GearPanel } from './GearPanel';
import { fmtBitrate, fmtRemaining, remainingFrac, remainingLevel } from '../format';

export function DeviceCard({
  device,
  levelsRef,
  send,
}: {
  device: DeviceSnapshot;
  levelsRef: MutableRefObject<Map<string, AudioLevels>>;
  send: (m: ClientMessage) => void;
}) {
  // browser-side monitor mute — defaults to muted so the wall isn't a cacophony
  const [monitorMuted, setMonitorMuted] = useState(true);
  const [gearOpen, setGearOpen] = useState(false);

  const rec = device.record;
  const str = device.stream;
  const offline = device.connection !== 'connected';
  const recording = rec.status === 'recording';

  const ws = device.disks.find((d) => d.isWorkingSet) ?? device.disks[0];
  const remain = ws?.timeAvailable ?? rec.timeAvailable;
  const remLevel = remainingLevel(remain);

  return (
    <div className={`tile${recording ? ' rec' : ''}${offline ? ' offline' : ''}`}>
      {/* ---- multiview video area ---- */}
      <div className="mv">
        <StreamView flvUrl={str.flvUrl} live={str.live} muted={monitorMuted} />

        <div className="mv-top">
          <span className={`rec-dot ${recording ? 'on' : rec.status === 'stopping' ? 'stopping' : ''}`}>
            <span className="led" />
            {recording ? 'REC' : rec.status === 'stopping' ? 'STOP' : 'IDLE'}
          </span>
          <span className="tc">{rec.duration ?? str.duration ?? '--:--:--'}</span>
        </div>

        <div className="mv-audio">
          <AudioMeter id={device.id} levelsRef={levelsRef} />
        </div>

        <div className="mv-label">
          <span className="name">{device.name}</span>
          <span className="model">{device.model}</span>
        </div>

        <button
          className="gear-btn"
          title="Media pool, config & streaming settings"
          onClick={() => setGearOpen(true)}
        >
          ⚙
        </button>
        <button
          className={`mute-btn${monitorMuted ? ' muted' : ''}`}
          title={monitorMuted ? 'Monitor muted — click to listen' : 'Listening — click to mute'}
          onClick={() => setMonitorMuted((m) => !m)}
        >
          {monitorMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* ---- status chips ---- */}
      <div className="chips">
        <span className={`chip rec${recording ? ' on' : ''}`}>{recording ? '● REC' : 'REC'}</span>
        <span className={`chip stream${str.status === 'streaming' ? ' on' : ''}`}>
          {str.status === 'streaming' ? '● LIVE' : str.status === 'connecting' ? 'CONNECTING' : 'STREAM'}
        </span>
        <span className={`chip ${rec.mode}`}>{rec.mode === 'iso' ? 'ISO REC' : 'PGM ONLY'}</span>
        {str.live && <span className="chip live">SIGNAL</span>}
        {offline && <span className="chip">OFFLINE</span>}
      </div>

      {/* ---- telemetry ---- */}
      <div className="status">
        <div className="cell">
          <span className="k">Rec Timecode</span>
          <span className="v big">{rec.duration ?? '00:00:00'}</span>
        </div>
        <div className="cell">
          <span className="k">Stream Bitrate</span>
          <span className="v big">{fmtBitrate(str.bitrate)}</span>
        </div>
      </div>

      {/* ---- drive / time remaining ---- */}
      <div className="drive">
        {(device.disks.length ? device.disks : [null]).map((d, i) =>
          d ? (
            <div key={d.diskId}>
              <div className="row">
                <span className="vol">
                  <span className={`ws-dot${d.status === 'recording' || d.isWorkingSet ? ' active' : ''}`} />
                  {d.volumeName}
                </span>
                <span className={`rem ${remainingLevel(d.timeAvailable)}`}>{fmtRemaining(d.timeAvailable)}</span>
              </div>
              <div className="bar">
                <i
                  className={remainingLevel(d.timeAvailable)}
                  style={{ width: `${remainingFrac(d.timeAvailable) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div key={i} className="row">
              <span className="vol">No media</span>
              <span className="rem">—</span>
            </div>
          ),
        )}
        <div className="row">
          <span className="vol">Est. time remaining</span>
          <span className={`rem ${remLevel}`}>{fmtRemaining(remain)}</span>
        </div>
      </div>

      {/* ---- transport controls ---- */}
      <div className="controls">
        <button
          className={`btn rec${recording ? ' active' : ''}`}
          disabled={offline}
          onClick={() => send({ type: 'record', id: device.id, action: recording ? 'stop' : 'start' })}
        >
          {recording ? '■ Stop Rec' : '● Record'}
        </button>
        <button
          className={`btn stream${str.status === 'streaming' ? ' active' : ''}`}
          disabled={offline}
          onClick={() =>
            send({ type: 'stream', id: device.id, action: str.status === 'idle' ? 'start' : 'stop' })
          }
        >
          {str.status === 'streaming' ? '■ Stop Stream' : '► Stream'}
        </button>
      </div>

      {gearOpen && <GearPanel device={device} send={send} onClose={() => setGearOpen(false)} />}
    </div>
  );
}
