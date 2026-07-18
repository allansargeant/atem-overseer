import type { RestreamerClient } from './coreClient.js';
import type {
  ChannelState,
  CoreProcessConfig,
  Destination,
  RtmpIngestConfig,
  SplitSpec,
} from './types.js';

/** Core process ids are lowercase, alnum + `_`/`-`. */
export function processIdFor(referencePrefix: string, channelId: string): string {
  return `${referencePrefix}_${channelId}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function joinRtmp(url: string, streamKey?: string): string {
  if (!streamKey) return url;
  return `${url.replace(/\/+$/, '')}/${streamKey}`;
}

/** The URL the encoder (ATEM) publishes to so the Core picks the stream up. */
export function ingestPushUrl(ingest: RtmpIngestConfig, ingestName: string): string {
  const base = `rtmp://${ingest.host}:${ingest.port}/${ingest.app}/${ingestName}`;
  return ingest.token ? `${base}?token=${encodeURIComponent(ingest.token)}` : base;
}

/**
 * Build the datarhei Core process that fans one RTMP ingest out to a monitor
 * copy (always output[0]) plus every enabled destination — all stream-copied
 * (`-c copy`), so the split is CPU-cheap and lossless. Pure: no I/O, easy to
 * unit-test and to reuse verbatim in another app.
 */
export function buildSplitProcessConfig(spec: SplitSpec): CoreProcessConfig {
  const ingestName = spec.ingestName || spec.channelId;
  const copy = ['-c', 'copy', '-f', 'flv'];

  const output = [
    { id: 'monitor', address: spec.monitorUrl, options: copy },
    ...spec.destinations
      .filter((d) => d.enabled)
      .map((d) => ({
        id: `dest-${d.id}`.replace(/[^a-z0-9_-]+/gi, '-'),
        address: joinRtmp(d.url, d.streamKey),
        options: copy,
      })),
  ];

  return {
    id: processIdFor(spec.referencePrefix, spec.channelId),
    reference: `${spec.referencePrefix}:${spec.channelId}`,
    type: 'ffmpeg',
    autostart: true,
    reconnect: true,
    reconnect_delay_seconds: 5,
    stale_timeout_seconds: 30,
    options: ['-err_detect', 'ignore_err'],
    input: [{ id: 'in', address: `{rtmp,name=${ingestName}}`, options: [] }],
    output,
  };
}

export interface SplitManagerOptions {
  referencePrefix: string;
  ingest: RtmpIngestConfig;
}

/**
 * Stateless orchestrator over a RestreamerClient: create-or-update the split
 * process for a channel, read its state, and tear it down. The host app owns
 * where destinations are stored; it just passes the current set into `sync`.
 */
export class SplitManager {
  constructor(
    private client: RestreamerClient,
    private opts: SplitManagerOptions,
  ) {}

  processId(channelId: string): string {
    return processIdFor(this.opts.referencePrefix, channelId);
  }

  ingestPushUrl(channelId: string, ingestName?: string): string {
    return ingestPushUrl(this.opts.ingest, ingestName || channelId);
  }

  /** Create the process if missing, otherwise replace its config; then ensure
   *  it's running. Returns the resulting channel state. */
  async sync(channelId: string, monitorUrl: string, destinations: Destination[]): Promise<ChannelState> {
    const spec: SplitSpec = {
      referencePrefix: this.opts.referencePrefix,
      channelId,
      monitorUrl,
      destinations,
    };
    const config = buildSplitProcessConfig(spec);
    const existing = await this.client.tryGetProcess(config.id);
    if (existing) {
      await this.client.updateProcess(config.id, config);
      await this.client.command(config.id, 'restart').catch(() => undefined);
    } else {
      await this.client.createProcess(config);
    }
    return (
      (await this.state(channelId, destinations, monitorUrl)) ?? {
        channelId,
        processId: config.id,
        provisioned: true,
        running: true,
        ingestPushUrl: this.ingestPushUrl(channelId),
        monitorUrl,
        destinations,
      }
    );
  }

  async state(channelId: string, destinations: Destination[], monitorUrl: string): Promise<ChannelState | null> {
    const id = this.processId(channelId);
    const proc = await this.client.tryGetProcess(id);
    if (!proc) {
      return {
        channelId,
        processId: id,
        provisioned: false,
        running: false,
        ingestPushUrl: this.ingestPushUrl(channelId),
        monitorUrl,
        destinations,
      };
    }
    const exec = proc.state?.exec;
    return {
      channelId,
      processId: id,
      provisioned: true,
      running: exec === 'running',
      exec,
      lastLog: proc.state?.last_logline,
      ingestPushUrl: this.ingestPushUrl(channelId),
      monitorUrl,
      destinations,
    };
  }

  async teardown(channelId: string): Promise<void> {
    const id = this.processId(channelId);
    const existing = await this.client.tryGetProcess(id);
    if (!existing) return;
    await this.client.command(id, 'stop').catch(() => undefined);
    await this.client.deleteProcess(id);
  }
}
