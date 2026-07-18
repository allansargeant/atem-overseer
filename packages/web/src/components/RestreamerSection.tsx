import { useEffect, useState } from 'react';
import type { RestreamerChannel, RestreamerDestination, RestreamerStatus } from '../types';

let destSeq = 0;
const newId = () => `d${Date.now().toString(36)}${destSeq++}`;

/**
 * Restreamer split-pipeline controls for one device, shown in the gear panel.
 * When enabled, the ATEM publishes to Restreamer (push URL shown here) which
 * copies the feed back to Overseer for the tile preview and fans it out to the
 * egress destinations managed below.
 */
export function RestreamerSection({ deviceId }: { deviceId: string }) {
  const [status, setStatus] = useState<RestreamerStatus | null>(null);
  const [channel, setChannel] = useState<RestreamerChannel | null>(null);
  const [dests, setDests] = useState<RestreamerDestination[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadChannel = () =>
    fetch(`/api/devices/${deviceId}/restreamer`)
      .then((r) => r.json())
      .then((c: RestreamerChannel) => {
        setChannel(c);
        setDests(c.destinations ?? []);
      })
      .catch(() => undefined);

  useEffect(() => {
    fetch('/api/restreamer')
      .then((r) => r.json())
      .then((s: RestreamerStatus) => {
        setStatus(s);
        if (s.enabled) loadChannel();
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const call = async (label: string, run: () => Promise<Response>) => {
    setBusy(true);
    setMsg(label);
    try {
      const r = await run();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `${label} failed`);
      await loadChannel();
      setMsg('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const provision = () =>
    call('Provisioning…', () => fetch(`/api/devices/${deviceId}/restreamer/provision`, { method: 'POST' }));

  const teardown = () =>
    call('Tearing down…', () => fetch(`/api/devices/${deviceId}/restreamer`, { method: 'DELETE' }));

  const saveDests = () =>
    call('Saving destinations…', () =>
      fetch(`/api/devices/${deviceId}/restreamer/destinations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinations: dests }),
      }),
    );

  const updateDest = (id: string, patch: Partial<RestreamerDestination>) =>
    setDests((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  if (!status) return null;

  if (!status.enabled) {
    return (
      <div className="section">
        <h3>Restreamer</h3>
        <p className="hint">
          Not configured. Add a <code>restreamer</code> block to the Overseer config to stream through
          Restreamer (a split that copies to this preview and fans out to the internet). No instance?
        </p>
        <div className="row-btns">
          <a className="toolbtn" href="/api/restreamer/compose" download>
            ⬇ docker-compose.yml
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h3>Restreamer</h3>
      <div className="assign-row">
        <span className={`ws-dot${status.reachable ? ' active' : ''}`} />
        <span className="hint">
          {status.url} — {status.reachable ? 'reachable' : 'unreachable'}
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        {channel && (
          <span className={`chip ${channel.running ? 'live on' : channel.provisioned ? 'iso' : ''}`}>
            {channel.running ? 'RUNNING' : channel.provisioned ? 'PROVISIONED' : 'NOT PROVISIONED'}
          </span>
        )}
      </div>

      {channel && (
        <p className="hint">
          Point the ATEM stream at:&nbsp;
          <code>{channel.ingestPushUrl}</code>{' '}
          <button
            className="applink"
            onClick={() => navigator.clipboard?.writeText(channel.ingestPushUrl).catch(() => undefined)}
          >
            copy
          </button>
          <br />
          Monitor copy → <code>{channel.monitorUrl}</code>
        </p>
      )}

      <h3 style={{ marginTop: 14 }}>Egress destinations</h3>
      {dests.length === 0 && <p className="hint">No destinations yet.</p>}
      {dests.map((d) => (
        <div key={d.id} className="dest-edit">
          <input
            type="checkbox"
            checked={d.enabled}
            title="enabled"
            onChange={(e) => updateDest(d.id, { enabled: e.target.checked })}
          />
          <input
            type="text"
            placeholder="Name"
            value={d.name}
            style={{ width: 110 }}
            onChange={(e) => updateDest(d.id, { name: e.target.value })}
          />
          <input
            type="text"
            placeholder="rtmp://…/app"
            value={d.url}
            style={{ flex: 1, minWidth: 160 }}
            onChange={(e) => updateDest(d.id, { url: e.target.value })}
          />
          <input
            type="text"
            placeholder="stream key"
            value={d.streamKey ?? ''}
            style={{ width: 120 }}
            onChange={(e) => updateDest(d.id, { streamKey: e.target.value })}
          />
          <button className="applink" onClick={() => setDests((ds) => ds.filter((x) => x.id !== d.id))}>
            ✕
          </button>
        </div>
      ))}

      <div className="row-btns" style={{ marginTop: 8 }}>
        <button
          className="toolbtn"
          onClick={() =>
            setDests((ds) => [...ds, { id: newId(), name: '', url: '', streamKey: '', enabled: true }])
          }
        >
          + Destination
        </button>
        <button className="toolbtn" disabled={busy} onClick={saveDests}>
          Save destinations
        </button>
        <span style={{ flex: 1 }} />
        <button className="toolbtn" disabled={busy} onClick={provision}>
          {channel?.provisioned ? 'Re-sync' : 'Provision'}
        </button>
        {channel?.provisioned && (
          <button className="toolbtn danger" disabled={busy} onClick={teardown}>
            Tear down
          </button>
        )}
      </div>

      {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
