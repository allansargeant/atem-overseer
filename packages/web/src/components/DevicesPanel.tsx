import { useEffect, useState } from 'react';
import type { DeviceSnapshot, DiscoveredDevice, ExternalAppInfo } from '../types';

/**
 * Fleet management: managed devices (with per-device info + external-app launch
 * buttons + remove), best-effort mDNS-discovered switchers (with add), and a
 * manual add-by-IP/hostname form. Add/remove persist server-side and the tile
 * grid re-syncs over WebSocket.
 */
export function DevicesPanel({
  devices,
  onClose,
}: {
  devices: DeviceSnapshot[];
  onClose: () => void;
}) {
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [apps, setApps] = useState<ExternalAppInfo[]>([]);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ name: '', address: '' });
  const [busy, setBusy] = useState(false);

  const refreshDiscovery = () =>
    fetch('/api/discovery')
      .then((r) => r.json())
      .then((j) => setDiscovered(j.discovered ?? []))
      .catch(() => undefined);

  useEffect(() => {
    fetch('/api/external-apps')
      .then((r) => r.json())
      .then((j) => setApps(j.apps ?? []))
      .catch(() => undefined);
    refreshDiscovery();
    const t = setInterval(refreshDiscovery, 5000);
    return () => clearInterval(t);
  }, []);

  const add = async (address: string, name?: string) => {
    setBusy(true);
    setStatus('');
    try {
      const r = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'add failed');
      setStatus(`Added ${j.device.name} (${j.device.address})`);
      setForm({ name: '', address: '' });
      refreshDiscovery();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from the dashboard?`)) return;
    await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    setStatus(`Removed ${name}`);
  };

  const launch = async (id: string, appKey: string, label: string) => {
    setStatus(`Launching ${label}…`);
    try {
      const r = await fetch(`/api/devices/${id}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: appKey }),
      });
      const j = await r.json();
      // for apps that only launch (no device targeting), copy the IP so the
      // operator can paste it into the app's connect field
      if (j.ok && !j.autoSelect && j.address) {
        try {
          await navigator.clipboard.writeText(j.address);
        } catch {
          /* clipboard blocked — the message still shows the address */
        }
      }
      setStatus(j.message || (j.ok ? 'launched' : j.error || 'launch failed'));
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Devices</h2>
          <button className="x" onClick={onClose}>
            ×
          </button>
        </header>

        {/* managed */}
        <div className="section">
          <h3>Managed ({devices.length})</h3>
          {devices.length === 0 && <p className="hint">No devices yet — add one below.</p>}
          {devices.map((d) => (
            <div key={d.id} className="dev-row">
              <div className="dev-main">
                <div className="dev-name">
                  <span className={`ws-dot${d.connection === 'connected' ? ' active' : ''}`} />
                  {d.name}
                  <span className="dev-model">{d.model}</span>
                </div>
                <div className="dev-meta">
                  <span><b>IP</b> {d.address}</span>
                  <span><b>Host</b> {d.hostname ?? '—'}</span>
                  <span><b>Record</b> {d.record.filename || '—'}</span>
                  <span><b>Protocol</b> v{d.protocolVersion}</span>
                </div>
                <div className="dev-apps">
                  {apps.map((a) => (
                    <button
                      key={a.key}
                      className="applink"
                      disabled={!a.available}
                      title={
                        a.available
                          ? a.autoSelect
                            ? `Open ${a.label} and connect to this switcher`
                            : `Launch ${a.label} (IP copied to clipboard to paste)`
                          : `${a.label} not available on the server's platform`
                      }
                      onClick={() => launch(d.id, a.key, a.label)}
                    >
                      {a.label}
                      {a.autoSelect ? ' ↳' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <button className="toolbtn danger" onClick={() => remove(d.id, d.name)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* discovered */}
        <div className="section">
          <h3>Discovered on network ({discovered.length})</h3>
          <p className="hint">
            Best-effort mDNS discovery — many ATEMs (especially older models) don't advertise, so add
            them manually below.
          </p>
          {discovered.map((d) => (
            <div key={d.address} className="disc-row">
              <div>
                <div className="dev-name">{d.name}</div>
                <div className="dev-meta">
                  <span><b>IP</b> {d.address}</span>
                  <span><b>Host</b> {d.hostname ?? '—'}</span>
                  <span className="svc">{d.serviceType}</span>
                </div>
              </div>
              <button
                className="toolbtn"
                disabled={d.alreadyManaged || busy}
                onClick={() => add(d.address, d.name)}
              >
                {d.alreadyManaged ? 'Added' : 'Add'}
              </button>
            </div>
          ))}
        </div>

        {/* manual add */}
        <div className="section">
          <h3>Add manually</h3>
          <div className="assign-row">
            <input
              type="text"
              placeholder="IP address or hostname"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              style={{ minWidth: 200 }}
            />
            <input
              type="text"
              placeholder="Name (optional)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <button
              className="toolbtn"
              disabled={busy || !form.address.trim()}
              onClick={() => add(form.address, form.name)}
            >
              Add device
            </button>
          </div>
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
