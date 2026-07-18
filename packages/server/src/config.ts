import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DeviceConfig {
  id: string;
  name: string;
  address: string;
}

/** Per-platform launch override for an external app. Each value is an argv
 *  array ([command, ...args]) with {ip} {host} {name} placeholders. */
export interface ExternalAppOverride {
  label?: string;
  autoSelect?: boolean;
  darwin?: string[];
  win32?: string[];
  linux?: string[];
}

export interface RestreamerDestination {
  id: string;
  name: string;
  url: string;
  streamKey?: string;
  enabled: boolean;
}

/**
 * Optional Restreamer (datarhei Core) integration. When enabled, ATEMs stream to
 * the Restreamer instead of directly to Overseer; Restreamer fans the feed out to
 * an automatic monitor copy back into Overseer's ingest, plus any egress
 * destinations. See docs/restreamer.md.
 */
export interface RestreamerSettings {
  enabled: boolean;
  /** base URL of the Restreamer / datarhei Core, e.g. http://restreamer.local:8080 */
  url: string;
  username: string;
  password: string;
  /** how the ATEM reaches the Restreamer's RTMP ingest */
  rtmpHost: string;
  rtmpPort: number;
  rtmpApp: string;
  rtmpToken?: string;
  /** namespacing prefix for our processes on a shared Restreamer */
  referencePrefix: string;
  /** per-device egress destinations, keyed by device id */
  channels?: Record<string, { destinations: RestreamerDestination[] }>;
}

export interface OverseerConfig {
  /** ATEM switchers to monitor */
  devices: DeviceConfig[];
  /** host the ATEMs (and browsers) should reach this machine at, for the stream ingest */
  publicHost: string;
  rtmpPort: number;
  mediaHttpPort: number;
  httpPort: number;
  /** optional overrides for the external-app launch buttons, keyed by app id */
  externalApps?: Record<string, ExternalAppOverride>;
  /** optional Restreamer split-pipeline integration */
  restreamer?: RestreamerSettings;
}

const DEFAULTS: OverseerConfig = {
  devices: [],
  publicHost: 'localhost',
  rtmpPort: 1935,
  mediaHttpPort: 8000,
  httpPort: 4700,
};

export function configPath(): string {
  return resolve(process.env.ATEM_OVERSEER_CONFIG || 'atem-overseer.config.json');
}

/**
 * A "mock" fleet used by `--mock` so the dashboard can be exercised end-to-end
 * without any ATEM hardware on the network.
 */
export function mockConfig(): OverseerConfig {
  return {
    ...DEFAULTS,
    devices: [
      { id: 'cam-a', name: 'Main Stage', address: '10.0.0.11' },
      { id: 'cam-b', name: 'Overflow Room', address: '10.0.0.12' },
      { id: 'cam-c', name: 'Foyer / B-Roll', address: '10.0.0.13' },
    ],
    restreamer: {
      enabled: true,
      url: 'http://restreamer.local:8080',
      username: 'admin',
      password: 'demo',
      rtmpHost: 'restreamer.local',
      rtmpPort: 1935,
      rtmpApp: 'live',
      referencePrefix: 'atem-overseer',
      channels: {
        'cam-a': {
          destinations: [
            {
              id: 'yt',
              name: 'YouTube Live',
              url: 'rtmp://a.rtmp.youtube.com/live2',
              streamKey: 'demo-key',
              enabled: true,
            },
          ],
        },
      },
    },
  };
}

/** env overrides let the av-launcher inject host/port without touching the file */
function applyEnv(cfg: OverseerConfig): OverseerConfig {
  const port = process.env.ATEM_OVERSEER_PORT;
  const host = process.env.ATEM_OVERSEER_HOST;
  if (port && Number.isFinite(Number(port))) cfg.httpPort = Number(port);
  if (host) cfg.publicHost = host;
  return cfg;
}

export function loadConfig(): OverseerConfig {
  const path = configPath();
  if (!existsSync(path)) return applyEnv({ ...DEFAULTS });
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return applyEnv({ ...DEFAULTS, ...raw, devices: raw.devices ?? [] });
  } catch (err) {
    console.error(`[config] failed to read ${path}:`, (err as Error).message);
    return applyEnv({ ...DEFAULTS });
  }
}

export function saveConfig(cfg: OverseerConfig): void {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
