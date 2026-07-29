/**
 * Exercise the crash path end to end.
 *
 * Deliberately outside `src/` so it is not part of the shipped build. Run it
 * and read what it leaves behind:
 *
 *   npm run diag:crash-example --workspace @atem-overseer/server
 */
import { init, log, setConfig } from '../src/diag/index.js';

init({
  app: 'diag-crash-example',
  envPrefix: 'DIAG_EXAMPLE',
  version: '0.0.0',
  defaultLevel: 'debug',
});

setConfig({
  publicHost: '10.0.0.5',
  httpPort: 8080,
  restreamer: {
    url: 'http://restreamer.local:8080',
    username: 'admin',
    // Should appear as <redacted> in the report.
    password: 'should-not-appear',
    rtmpToken: 'also-should-not-appear',
  },
});

log.info({ device: 'atem-1', model: 'Constellation 8K' }, 'device connected');
log.debug({ device: 'atem-1', program: 3, preview: 5 }, 'state changed');
log.warn({ device: 'atem-2', attempt: 3 }, 'reconnecting');

// A plausible fault rather than an artificial one: an async path that rejects
// with nobody awaiting it is the classic way a Node service dies at 2am.
async function pollDevice(id: string): Promise<never> {
  throw new Error(`no route to ${id} (EHOSTUNREACH)`);
}

log.info({ device: 'atem-3' }, 'polling');
void pollDevice('atem-3');
