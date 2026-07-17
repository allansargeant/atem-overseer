import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { DeviceManager } from './atem/manager.js';
import { runCommand } from './commands.js';
import type { ClientMessage, ServerMessage } from './types.js';

/**
 * Fans manager events out to every connected browser and accepts control
 * messages back. Snapshots are per-device; levels are batched. On connect a
 * client gets a full snapshot so it can render immediately.
 */
export function attachWebSocket(server: Server, manager: DeviceManager): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };

  manager.on('snapshot', (device) => broadcast({ type: 'device', device }));
  manager.on('levels', (levels) => broadcast({ type: 'levels', levels }));

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'snapshot', devices: manager.snapshots() } satisfies ServerMessage));

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        await runCommand(manager, msg);
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: 'toast',
            level: 'error',
            text: (err as Error).message,
          } satisfies ServerMessage),
        );
      }
    });
  });
}
