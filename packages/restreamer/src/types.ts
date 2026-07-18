// ---- datarhei Core v3 wire types (subset we use) ----

export interface CoreProcessIO {
  id: string;
  address: string;
  options?: string[];
}

export interface CoreProcessConfig {
  id: string;
  reference?: string;
  type?: 'ffmpeg';
  options?: string[];
  autostart?: boolean;
  reconnect?: boolean;
  reconnect_delay_seconds?: number;
  stale_timeout_seconds?: number;
  input: CoreProcessIO[];
  output: CoreProcessIO[];
}

/** Runtime state as reported by GET /api/v3/process/{id} (subset). */
export interface CoreProcessState {
  order?: string; // "start" | "stop"
  exec?: string; // "running" | "finished" | "failed" | "starting" | "finishing"
  progress?: unknown;
  reconnect_seconds?: number;
  last_logline?: string;
}

export interface CoreProcess {
  id: string;
  reference?: string;
  config?: CoreProcessConfig;
  state?: CoreProcessState;
}

/** Minimal fetch surface so the client can run on Node's global fetch, a
 *  polyfill, or an in-memory mock without depending on any of them. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

// ---- split-channel abstraction (framework-agnostic) ----

export interface Destination {
  id: string;
  name: string;
  /** RTMP/SRT base URL, e.g. rtmp://a.rtmp.youtube.com/live2 */
  url: string;
  /** optional stream key appended as a path segment */
  streamKey?: string;
  enabled: boolean;
}

/** How the encoder reaches the built-in RTMP ingest of the Core/Restreamer. */
export interface RtmpIngestConfig {
  /** host/ip the encoder (ATEM) reaches the Restreamer at */
  host: string;
  port: number;
  /** RTMP application/path segment; datarhei's internal server uses "live" */
  app: string;
  /** optional RTMP token required by Restreamer for publishing */
  token?: string;
}

export interface SplitSpec {
  /** namespacing prefix so multiple apps can share one Restreamer without
   *  clobbering each other's processes, e.g. "atem-overseer" or "flock" */
  referencePrefix: string;
  /** logical channel id, typically the device id */
  channelId: string;
  /** internal ingest stream name (defaults to channelId) */
  ingestName?: string;
  /** where the automatic monitor copy is pushed — the host app's own ingest */
  monitorUrl: string;
  destinations: Destination[];
}

export interface ChannelState {
  channelId: string;
  processId: string;
  provisioned: boolean;
  running: boolean;
  /** raw Core exec state, when known */
  exec?: string;
  lastLog?: string;
  /** URL the encoder should publish to */
  ingestPushUrl: string;
  monitorUrl: string;
  destinations: Destination[];
}
