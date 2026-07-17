import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioLevels, ClientMessage, DeviceSnapshot, ServerMessage } from './types';

export interface Toast {
  level: 'info' | 'error';
  text: string;
  id: number;
}

/**
 * Single WebSocket to the Overseer server. Coarse snapshots drive React state;
 * high-frequency audio levels are written into a ref (no re-render) so the
 * canvas meters can sample them on their own animation frame.
 */
export function useOverseer() {
  const [devices, setDevices] = useState<DeviceSnapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const levelsRef = useRef<Map<string, AudioLevels>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onmessage = (ev) => {
        const msg: ServerMessage = JSON.parse(ev.data);
        switch (msg.type) {
          case 'snapshot':
            setDevices(msg.devices);
            break;
          case 'device':
            setDevices((prev) => {
              const i = prev.findIndex((d) => d.id === msg.device.id);
              if (i === -1) return [...prev, msg.device];
              const next = prev.slice();
              next[i] = msg.device;
              return next;
            });
            break;
          case 'levels':
            for (const l of msg.levels) levelsRef.current.set(l.id, l.audio);
            break;
          case 'toast':
            setToast({ ...msg, id: Date.now() });
            break;
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  return { devices, connected, toast, setToast, levelsRef, send };
}
