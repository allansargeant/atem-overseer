import { useEffect, useRef, useState } from 'react';
import type { ClientMessage, DeviceSnapshot, MediaPool } from '../types';

/**
 * Advanced, less-frequently-used controls, kept behind the tile's gear icon:
 * ISO/PGM record mode, local streaming service (Streaming.xml), Overseer config
 * save/load, and media-pool upload + media-player assignment.
 */
export function GearPanel({
  device,
  send,
  onClose,
}: {
  device: DeviceSnapshot;
  send: (m: ClientMessage) => void;
  onClose: () => void;
}) {
  const [pool, setPool] = useState<MediaPool | null>(null);
  const [player, setPlayer] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [uploadSlot, setUploadSlot] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/devices/${device.id}/media`)
      .then((r) => r.json())
      .then(setPool)
      .catch(() => setStatus('media pool unavailable'));
  }, [device.id]);

  const assign = async (sourceType: 'still' | 'clip', slotIndex: number) => {
    await fetch(`/api/devices/${device.id}/media/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIndex: player, sourceType, slotIndex }),
    });
    setStatus(`Media Player ${player + 1} ← ${sourceType} slot ${slotIndex + 1}`);
  };

  const applyLocalStream = async () => {
    const r = await fetch(`/api/devices/${device.id}/streaming-service`, { method: 'POST' });
    setStatus(r.ok ? 'Local streaming service applied to switcher' : 'failed to apply');
  };

  // decode image browser-side to RGBA at 1080p, then upload the raw buffer
  const upload = async (file: File) => {
    setStatus('converting image…');
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, 1920, 1080);
    const rgba = ctx.getImageData(0, 0, 1920, 1080).data;
    const form = new FormData();
    form.append('slotIndex', String(uploadSlot));
    form.append('name', file.name.replace(/\.[^.]+$/, '').slice(0, 63));
    form.append('data', new Blob([rgba.buffer]), 'still.rgba');
    setStatus('uploading to media pool…');
    const r = await fetch(`/api/devices/${device.id}/media/still`, { method: 'POST', body: form });
    setStatus(r.ok ? `Uploaded to still slot ${uploadSlot + 1}` : 'upload failed');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{device.name} — Advanced</h2>
          <button className="x" onClick={onClose}>
            ×
          </button>
        </header>

        {/* record mode */}
        <div className="section">
          <h3>Record Mode</h3>
          <div className="row-btns">
            <button
              className={`toolbtn${device.record.mode === 'pgm' ? ' active' : ''}`}
              onClick={() => send({ type: 'recordMode', id: device.id, mode: 'pgm' })}
            >
              PGM only
            </button>
            <button
              className={`toolbtn${device.record.mode === 'iso' ? ' active' : ''}`}
              onClick={() => send({ type: 'recordMode', id: device.id, mode: 'iso' })}
            >
              ISO (all inputs)
            </button>
          </div>
        </div>

        {/* streaming */}
        <div className="section">
          <h3>Streaming</h3>
          <p className="hint">
            Point this switcher at Overseer's local ingest so its output shows in the tile above.
          </p>
          <div className="row-btns">
            <a className="toolbtn" href="/api/streaming.xml" download>
              ⬇ Download Streaming.xml
            </a>
            <button className="toolbtn" onClick={applyLocalStream}>
              Apply local service to switcher
            </button>
          </div>
        </div>

        {/* config */}
        <div className="section">
          <h3>Configuration</h3>
          <div className="row-btns">
            <a className="toolbtn" href="/api/config.xml" download>
              ⬇ Save config XML
            </a>
            <label className="toolbtn" style={{ cursor: 'pointer' }}>
              ⬆ Load config XML
              <input
                type="file"
                accept=".xml"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const xml = await f.text();
                  const r = await fetch('/api/config.xml', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/xml' },
                    body: xml,
                  });
                  const j = await r.json();
                  setStatus(j.note || 'config loaded');
                }}
              />
            </label>
          </div>
        </div>

        {/* media pool */}
        <div className="section">
          <h3>Media Pool & Players</h3>
          <div className="assign-row">
            <span>Assign to</span>
            <select value={player} onChange={(e) => setPlayer(Number(e.target.value))}>
              {[0, 1, 2, 3].map((i) => (
                <option key={i} value={i}>
                  Media Player {i + 1}
                </option>
              ))}
            </select>
            <span className="hint">— then click a still below</span>
          </div>
          <div className="pool">
            {(pool?.stills ?? []).slice(0, 20).map((s) => (
              <div
                key={s.slotIndex}
                className={`slot${s.isUsed ? ' used' : ''}`}
                onClick={() => assign('still', s.slotIndex)}
              >
                <div className="idx">{s.slotIndex + 1}</div>
                <div className="nm">{s.isUsed ? s.name : '—'}</div>
              </div>
            ))}
          </div>

          <div className="assign-row" style={{ marginTop: 12 }}>
            <span>Upload still to slot</span>
            <select value={uploadSlot} onChange={(e) => setUploadSlot(Number(e.target.value))}>
              {Array.from({ length: 20 }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
            <button className="toolbtn" onClick={() => fileRef.current?.click()}>
              Choose image…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </div>
          <p className="hint">Current: {device.mediaPlayers.map((m) => `MP${m.index + 1}=${m.slotName}`).join('  ·  ') || 'none'}</p>
        </div>

        {status && (
          <div className="section" style={{ borderBottom: 'none' }}>
            <span className="hint">{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}
