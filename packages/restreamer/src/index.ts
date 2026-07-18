export { RestreamerClient, RestreamerError } from './coreClient.js';
export type { RestreamerClientOptions } from './coreClient.js';
export {
  SplitManager,
  buildSplitProcessConfig,
  processIdFor,
  ingestPushUrl,
} from './splitChannel.js';
export type { SplitManagerOptions } from './splitChannel.js';
export { createMockTransport } from './mockTransport.js';
export type {
  ChannelState,
  CoreProcess,
  CoreProcessConfig,
  CoreProcessIO,
  CoreProcessState,
  Destination,
  FetchLike,
  RtmpIngestConfig,
  SplitSpec,
} from './types.js';
