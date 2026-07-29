import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { DeviceManager } from './atem/manager.js';
import { runCommand } from './commands.js';
import type { ClientMessage, ServerMessage } from './types.js';

/**
 * Fans manager events out to every connected browser and accepts control
 * messages back. Snapshots are per-device; levels are batched. On connect a
 * client gets a full snapshot so it can render immediately.
 *
 * Three manager events map to three different messages, and the distinction
 * matters to a client:
 *   'snapshot' -> {type:'device'}   one device's state changed
 *   'fleet'    -> {type:'snapshot'} a device was added/removed; full re-sync
 *   'levels'   -> {type:'levels'}   batched, and far more frequent
 *
 * Audio levels ride their own channel precisely because they arrive at meter
 * rate. Folding them into the per-device snapshot would flood the socket with
 * full state objects — don't.
 *
 * Acknowledgement is asymmetric and clients depend on it: a FAILED command
 * replies with a toast, to the originating socket only, while a SUCCESSFUL one
 * produces no reply at all. Confirmation comes from the next 'device' message.
 * Malformed JSON is dropped silently.
 *
 * Same no-authentication caveat as the REST API — see api.ts. Anything that can
 * open this socket can start and stop recording on a live switcher.
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
  // full re-sync when a device is added or removed
  manager.on('fleet', (devices) => broadcast({ type: 'snapshot', devices }));

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
