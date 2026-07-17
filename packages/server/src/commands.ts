import type { DeviceManager } from './atem/manager.js';
import type { ClientMessage } from './types.js';

/** Apply a control message to the addressed device. Shared by REST and WS. */
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
