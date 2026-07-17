import express, { type Express } from 'express';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DeviceManager } from './atem/manager.js';
import { runCommand } from './commands.js';
import { loadConfig, saveConfig, type OverseerConfig } from './config.js';
import type { Discovery } from './discovery.js';
import type { ExternalApps } from './externalApps.js';
import {
  generateConfigXml,
  generateStreamingXml,
  parseConfigXml,
  streamingServiceFor,
} from './stream/streamingXml.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024 } });

export interface ApiDeps {
  manager: DeviceManager;
  cfg: OverseerConfig;
  webDist: string;
  discovery: Discovery;
  externalApps: ExternalApps;
}

export function createApi({ manager, cfg, webDist, discovery, externalApps }: ApiDeps): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.text({ type: ['application/xml', 'text/xml'], limit: '2mb' }));

  const asyncH =
    (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
    (req: express.Request, res: express.Response) =>
      fn(req, res).catch((err) => res.status(400).json({ error: (err as Error).message }));

  // ---- fleet + snapshots ----
  app.get('/api/config', (_req, res) => {
    res.json({
      devices: cfg.devices,
      publicHost: cfg.publicHost,
      rtmpPort: cfg.rtmpPort,
      mediaHttpPort: cfg.mediaHttpPort,
    });
  });

  app.get('/api/snapshot', (_req, res) => res.json({ devices: manager.snapshots() }));

  // ---- device management ----
  app.get('/api/discovery', (_req, res) => {
    res.json({ discovered: discovery.list(manager.managedAddresses()) });
  });

  app.post(
    '/api/devices',
    asyncH(async (req, res) => {
      const dc = await manager.addDevice({
        id: req.body.id,
        name: req.body.name,
        address: req.body.address,
      });
      res.json({ ok: true, device: dc });
    }),
  );

  app.delete(
    '/api/devices/:id',
    asyncH(async (req, res) => {
      await manager.removeDevice(req.params.id);
      res.json({ ok: true });
    }),
  );

  app.get('/api/external-apps', (_req, res) => res.json({ apps: externalApps.list() }));

  app.post(
    '/api/devices/:id/launch',
    asyncH(async (req, res) => {
      const device = manager.config(req.params.id);
      if (!device) throw new Error('unknown device');
      const result = externalApps.launch(String(req.body.app), device);
      res.status(result.ok ? 200 : 400).json({ ...result, address: device.address });
    }),
  );

  // ---- transport / mode commands (REST twins of the WS commands) ----
  app.post(
    '/api/devices/:id/record',
    asyncH(async (req, res) => {
      await runCommand(manager, { type: 'record', id: req.params.id, action: req.body.action });
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/devices/:id/stream',
    asyncH(async (req, res) => {
      await runCommand(manager, { type: 'stream', id: req.params.id, action: req.body.action });
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/devices/:id/record-mode',
    asyncH(async (req, res) => {
      await runCommand(manager, { type: 'recordMode', id: req.params.id, mode: req.body.mode });
      res.json({ ok: true });
    }),
  );
  app.post(
    '/api/devices/:id/monitor-mute',
    asyncH(async (req, res) => {
      await runCommand(manager, { type: 'monitorMute', id: req.params.id, muted: !!req.body.muted });
      res.json({ ok: true });
    }),
  );

  // ---- streaming config: XML export + one-click apply to a device ----
  app.get('/api/streaming.xml', (_req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="Streaming.xml"');
    res.send(generateStreamingXml(cfg));
  });

  app.post(
    '/api/devices/:id/streaming-service',
    asyncH(async (req, res) => {
      const runner = manager.get(req.params.id);
      if (!runner) throw new Error('unknown device');
      if (!runner.setStreamingService) throw new Error('device does not support remote streaming config');
      await runner.setStreamingService(streamingServiceFor(cfg, req.params.id));
      res.json({ ok: true });
    }),
  );

  // ---- Overseer config XML save / load ----
  app.get('/api/config.xml', (_req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="atem-overseer.xml"');
    res.send(generateConfigXml(cfg));
  });

  app.post(
    '/api/config.xml',
    asyncH(async (req, res) => {
      const xml = typeof req.body === 'string' ? req.body : req.body?.xml;
      if (!xml) throw new Error('expected XML body');
      const parsed = parseConfigXml(xml);
      const merged = { ...loadConfig(), ...parsed } as OverseerConfig;
      saveConfig(merged);
      res.json({ ok: true, devices: parsed.devices?.length ?? 0, note: 'saved; restart to apply device changes' });
    }),
  );

  // ---- media pool (behind the gear) ----
  app.get(
    '/api/devices/:id/media',
    asyncH(async (req, res) => {
      const runner = manager.get(req.params.id);
      if (!runner) throw new Error('unknown device');
      res.json(runner.mediaPool());
    }),
  );

  app.post(
    '/api/devices/:id/media/assign',
    asyncH(async (req, res) => {
      const runner = manager.get(req.params.id);
      if (!runner) throw new Error('unknown device');
      const { playerIndex, sourceType, slotIndex } = req.body;
      await runner.assignMediaPlayer(Number(playerIndex), sourceType, Number(slotIndex));
      res.json({ ok: true });
    }),
  );

  // raw RGBA (converted browser-side to the switcher resolution) -> media pool still
  app.post(
    '/api/devices/:id/media/still',
    upload.single('data'),
    asyncH(async (req, res) => {
      const runner = manager.get(req.params.id);
      if (!runner) throw new Error('unknown device');
      if (!req.file) throw new Error('missing RGBA payload');
      const slotIndex = Number(req.body.slotIndex);
      const name = String(req.body.name || `still-${slotIndex}`);
      await runner.uploadStill(slotIndex, name, req.file.buffer);
      res.json({ ok: true });
    }),
  );

  // ---- static web ----
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res
        .status(200)
        .send('Atem Overseer API is running. Build the web app (npm run build) or use the Vite dev server.'),
    );
  }

  return app;
}
