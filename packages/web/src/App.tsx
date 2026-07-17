import { useEffect, useState } from 'react';
import { useOverseer } from './useOverseer';
import { DeviceCard } from './components/DeviceCard';
import { DevicesPanel } from './components/DevicesPanel';

export default function App() {
  const { devices, connected, toast, setToast, levelsRef, send } = useOverseer();
  const [devicesOpen, setDevicesOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  const recording = devices.filter((d) => d.record.status === 'recording').length;
  const streaming = devices.filter((d) => d.stream.status === 'streaming').length;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <h1>Atem Overseer</h1>
          <span className="sub">multi-switcher monitor</span>
        </div>
        <div className="spacer" />
        <span className="fleet-stat">
          <b>{devices.length}</b> devices · <b>{recording}</b> rec · <b>{streaming}</b> live
        </span>
        <button className="toolbtn" onClick={() => setDevicesOpen(true)}>
          Devices
        </button>
        <a className="toolbtn" href="/api/streaming.xml" download>
          Streaming.xml
        </a>
        <a className="toolbtn" href="/api/config.xml" download>
          Save Config
        </a>
        <span className={`conn${connected ? ' ok' : ''}`}>
          <span className="dot" />
          {connected ? 'Connected' : 'Reconnecting'}
        </span>
      </div>

      {devices.length === 0 ? (
        <div className="empty">
          {connected ? 'No ATEM devices configured.' : 'Connecting to Overseer server…'}
        </div>
      ) : (
        <div className="grid">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} levelsRef={levelsRef} send={send} />
          ))}
        </div>
      )}

      {devicesOpen && <DevicesPanel devices={devices} onClose={() => setDevicesOpen(false)} />}

      {toast && <div className={`toast ${toast.level}`}>{toast.text}</div>}
    </>
  );
}
