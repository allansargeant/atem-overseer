import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApi } from './api.js';
import { DeviceManager } from './atem/manager.js';
import { MediaServer } from './stream/mediaServer.js';
import { Discovery } from './discovery.js';
import { ExternalApps } from './externalApps.js';
import { loadConfig, mockConfig, type OverseerConfig } from './config.js';

const MOCK = process.argv.includes('--mock');

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(__dirname, '../../web/dist');

async function main(): Promise<void> {
  const fileCfg = loadConfig();
  const cfg: OverseerConfig = MOCK && fileCfg.devices.length === 0 ? mockConfig() : fileCfg;

  const media = new MediaServer(cfg);
  const manager = new DeviceManager(cfg, MOCK, media.streamInfo);
  const discovery = new Discovery(MOCK);
  const externalApps = new ExternalApps(cfg);

  // when a switcher starts/stops publishing to the RTMP ingest, refresh its tile
  media.on('liveChanged', (id: string) => {
    const runner = manager.get(id);
    if (runner) manager.emit('snapshot', runner.snapshot());
  });

  media.start();
  discovery.start();
  await manager.start();

  const app = createApi({ manager, cfg, webDist, discovery, externalApps });
  const server = createServer(app);
  const { attachWebSocket } = await import('./wsBridge.js');
  attachWebSocket(server, manager);

  server.listen(cfg.httpPort, () => {
    const mode = MOCK ? ' [MOCK]' : '';
    console.log(`\n  Atem Overseer${mode}`);
    console.log(`  ├─ dashboard   http://localhost:${cfg.httpPort}`);
    console.log(`  ├─ rtmp ingest rtmp://${cfg.publicHost}:${cfg.rtmpPort}/live/<deviceId>`);
    console.log(`  ├─ http-flv    http://${cfg.publicHost}:${cfg.mediaHttpPort}/live/<deviceId>.flv`);
    console.log(`  └─ devices     ${cfg.devices.map((d) => d.id).join(', ') || '(none configured)'}\n`);
  });

  const shutdown = async () => {
    console.log('\nShutting down…');
    await manager.stop();
    discovery.stop();
    media.stop();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
