import {
  RestreamerClient,
  SplitManager,
  createMockTransport,
  type ChannelState,
  type Destination,
} from '@av/restreamer';
import { saveConfig, type OverseerConfig, type RestreamerDestination } from './config.js';

export interface RestreamerStatus {
  enabled: boolean;
  configured: boolean;
  url?: string;
  reachable?: boolean;
  referencePrefix?: string;
}

/**
 * Overseer's glue around the portable @av/restreamer package. Owns the
 * configured instance, maps a device id to its split channel, and persists the
 * per-device egress destinations in the Overseer config. The monitor copy is
 * always pushed back to Overseer's own node-media-server ingest, so the tile
 * preview keeps working exactly as before — Restreamer just sits in front and
 * adds the internet fan-out.
 */
export class RestreamerService {
  private manager?: SplitManager;
  private client?: RestreamerClient;

  constructor(
    private cfg: OverseerConfig,
    private mock: boolean,
  ) {
    const r = cfg.restreamer;
    if (!r?.enabled) return;
    this.client = new RestreamerClient({
      url: r.url,
      username: r.username,
      password: r.password,
      fetch: mock ? createMockTransport() : undefined,
    });
    this.manager = new SplitManager(this.client, {
      referencePrefix: r.referencePrefix || 'atem-overseer',
      ingest: { host: r.rtmpHost, port: r.rtmpPort, app: r.rtmpApp || 'live', token: r.rtmpToken },
    });
  }

  get enabled(): boolean {
    return !!this.manager;
  }

  /** where Restreamer pushes the automatic monitor copy: Overseer's own ingest */
  monitorUrl(deviceId: string): string {
    return `rtmp://${this.cfg.publicHost}:${this.cfg.rtmpPort}/live/${deviceId}`;
  }

  ingestPushUrl(deviceId: string): string | null {
    return this.manager ? this.manager.ingestPushUrl(deviceId) : null;
  }

  private destinations(deviceId: string): Destination[] {
    return (this.cfg.restreamer?.channels?.[deviceId]?.destinations ?? []) as Destination[];
  }

  async status(): Promise<RestreamerStatus> {
    const r = this.cfg.restreamer;
    if (!r?.enabled || !this.client) return { enabled: false, configured: !!r };
    return {
      enabled: true,
      configured: true,
      url: r.url,
      referencePrefix: r.referencePrefix,
      reachable: await this.client.ping().catch(() => false),
    };
  }

  async channel(deviceId: string): Promise<ChannelState | null> {
    if (!this.manager) return null;
    return this.manager.state(deviceId, this.destinations(deviceId), this.monitorUrl(deviceId));
  }

  async provision(deviceId: string): Promise<ChannelState> {
    if (!this.manager) throw new Error('Restreamer is not enabled');
    return this.manager.sync(deviceId, this.monitorUrl(deviceId), this.destinations(deviceId));
  }

  async setDestinations(deviceId: string, destinations: RestreamerDestination[]): Promise<ChannelState | null> {
    if (!this.cfg.restreamer) throw new Error('Restreamer is not enabled');
    this.cfg.restreamer.channels ??= {};
    this.cfg.restreamer.channels[deviceId] = { destinations };
    this.persist();
    // if the channel is already provisioned, push the new output set live
    if (this.manager) {
      const existing = await this.manager.state(deviceId, destinations as Destination[], this.monitorUrl(deviceId));
      if (existing?.provisioned) return this.provision(deviceId);
      return existing;
    }
    return null;
  }

  async teardown(deviceId: string): Promise<void> {
    if (!this.manager) return;
    await this.manager.teardown(deviceId);
  }

  private persist(): void {
    if (this.mock) return;
    try {
      saveConfig(this.cfg);
    } catch (err) {
      console.error('[restreamer] config save failed:', (err as Error).message);
    }
  }

  /** A ready-to-run docker-compose.yml for those who don't have a Restreamer yet. */
  composeYaml(): string {
    const r = this.cfg.restreamer;
    const user = r?.username || 'admin';
    const pass = r?.password || 'change-me';
    return `# Restreamer for Atem Overseer's split pipeline.
# Run:  docker compose up -d   then open http://localhost:8080 (admin login below).
# Point Overseer's config \`restreamer.url\` at http://<this-host>:8080 and set the
# same username/password. ATEMs publish to rtmp://<this-host>:1935/${r?.rtmpApp || 'live'}/<deviceId>.
services:
  restreamer:
    image: datarhei/restreamer:latest
    container_name: restreamer
    restart: unless-stopped
    ports:
      - "8080:8080"   # web UI + Core API
      - "1935:1935"   # RTMP ingest
      - "1936:1936"   # RTMPS
      - "6000:6000/udp" # SRT
    environment:
      - CORE_API_AUTH_USERNAME=${user}
      - CORE_API_AUTH_PASSWORD=${pass}
      - CORE_RTMP_ENABLE=true
    volumes:
      - restreamer-config:/core/config
      - restreamer-data:/core/data
volumes:
  restreamer-config:
  restreamer-data:
`;
  }
}
