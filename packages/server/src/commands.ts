import type { DeviceManager } from './atem/manager.js';
import type { ClientMessage } from './types.js';

/**
 * Apply a control message to the addressed device.
 *
 * Shared by the REST routes (api.ts) and the WebSocket bridge (wsBridge.ts) on
 * purpose: it is the one place a control command is applied, so the two paths
 * cannot behave differently. Add commands here rather than in a route handler.
 *
 * `action` is compared against the literal 'start', so ANYTHING ELSE MEANS
 * STOP — a typo, a missing field, a boolean. There is no validation and no
 * error; callers report success either way. Worth knowing before adding a
 * third verb.
 *
 * These write to real switchers that may be live on air, over an
 * unauthenticated API. An unknown id throws, which api.ts renders as 400 and
 * wsBridge.ts renders as a toast to the originating client only.
 */
export async function runCommand(manager: DeviceManager, msg: ClientMessage): Promise<void> {
  const runner = manager.get(msg.id);
  if (!runner) throw new Error(`unknown device: ${msg.id}`);

  switch (msg.type) {
    case 'record':
      return runner.setRecording(msg.action === 'start');
    case 'stream':
      return runner.setStreaming(msg.action === 'start');
    case 'recordMode':
      return runner.setRecordMode(msg.mode);
    case 'monitorMute':
      return runner.setMonitorMute(msg.muted);
    default:
      throw new Error(`unknown command`);
  }
}
